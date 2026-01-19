from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class LithologyAgent(BaseAgent):
    """
    Agent responsible for identifying lithology (rock type) 
    based on GR, Density, Neutron, and Sonic logs.
    
    Uses tools from lithology_tools skill pack for precise analysis.
    """
    
    def __init__(self):
        super().__init__(
            name="LithologyExpert",
            role_description="""You are a senior Petrophysicist specializing in lithology identification.
            Your job is to analyze well log data (Gamma Ray, Density, Neutron Porosity, Sonic) 
            and determine the rock type (e.g., Sandstone, Limestone, Shale, Dolomite).
            
            Rules:
            1. Low GR (< 60 API) indicates clean reservoir rocks (Sandstone, Carbonates).
            2. High GR (> 60 API) indicates Shale or radioactive sands.
            3. Use Density-Neutron crossover to distinguish Sandstone (crossover) from Limestone/Dolomite.
            4. Provide a confidence score (0.0-1.0) and clear reasoning.""",
            skill_packs=["lithology-classification"]  # Assigned skill pack
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze log data to determine lithology, utilizing available tools dynamically.
        """
        curves = data.get('curves', {})
        
        # 1. Curve Mapping & Preparation
        from backend.core.curve_mapper import get_curve_mapper
        
        mapper = get_curve_mapper()
        mapper.reload()
        
        mapping = mapper.map_curves(list(curves.keys()))
        matched = mapping['matched']
        
        def get_curve_name(standard_type):
            for orig, std in matched.items():
                if std == standard_type:
                    return orig
            return None
            
        # Identify key curves
        curve_map = {
            'DEPTH': get_curve_name('DEPTH'),
            'GR': get_curve_name('GR'),
            'RHOB': get_curve_name('RHOB'),
            'NPHI': get_curve_name('NPHI'),
            'DT': get_curve_name('DT')
        }
        
        # 2. Prepare Data Summary
        depth_values = curves.get(curve_map['DEPTH'], [])
        if depth_values:
            depth_start = min(depth_values)
            depth_end = max(depth_values)
            depth_summary = f"Depth Range: {depth_start:.2f}m - {depth_end:.2f}m"
        else:
            depth_summary = "Depth Range: Unknown"
            
        # Curve statistics
        stats = []
        for c_type, c_name in curve_map.items():
            if c_name and c_name in curves:
                vals = [v for v in curves[c_name] if v is not None]
                if vals:
                    avg = sum(vals)/len(vals)
                    stats.append(f"{c_type}({c_name}): avg={avg:.2f}")
        
        data_desc = f"{depth_summary}\nAvailable Curves: {stats}"

        # 3. Build Tools Prompt Dynamically (NO HARDCODING!)
        user_question = context or "General lithology analysis"
        tools_prompt = self.build_tools_prompt(question=user_question)
        
        # Check for matching tools
        matched_tools = self.match_tools_for_question(user_question)
        matched_tool_names = [t['name'] for t in matched_tools]

        prompt_stage_1 = f"""
        分析以下测井数据层段:
        {data_desc}
        
        用户问题: {user_question}
        
        ## 可用工具
        {tools_prompt}
        
        ## 分析规则
        1. 如果工具被标记为 ⭐推荐，**必须优先使用**该工具
        2. 如果用户问到"交会"、"Vsh"、"曲线形态"等关键词，使用对应工具
        3. 如果不确定岩性，使用 analyze_crossplot 工具
        4. 如果问题超出岩性分析范围（如流体、饱和度），ESCALATE
        
        ## 推荐工具检测结果
        {"**检测到推荐工具**: " + str(matched_tool_names) + " - 请使用这些工具!" if matched_tool_names else "未检测到特定工具匹配，根据问题自行判断"}
        
        IMPORTANT: 你可以用任何语言思考，但'reasoning'字段必须用中文。
        
        ## 输出格式 (严格JSON)
        方案A (调用工具): {{ "action": "tool_use", "tool_name": "...", "parameters": {{ ... }} }}
        方案B (直接回答): {{ "action": "final_answer", "lithology": "...", "confidence": ..., "reasoning": "中文解释..." }}
        方案C (升级问题): {{ "action": "escalate", "reason": "中文解释为何无法单独回答", "suggested_experts": ["ExpertKey"] }}
        """
        
        response_text_1 = self.think(prompt_stage_1)
        
        try:
            decision = self.parse_json_response(response_text_1)
        except ValueError:
            return {
                "lithology": "Unknown", 
                "confidence": 0.0, 
                "reasoning": f"Format Error in Stage 1: {response_text_1}"
            }
            
        # 4. Execution Stage
        action = decision.get("action")
        
        if action == "escalate":
            return {
                "lithology": "Escalation Required",
                "confidence": 0.0,
                "reasoning": decision.get("reason", "Escalation requested"),
                "status": "escalate",
                "suggested_experts": decision.get("suggested_experts", [])
            }
            
        elif action == "tool_use":
            tool_name = decision.get("tool_name")
            params = decision.get("parameters", {})
            
            # DEBUG LOGGING (Temporary)
            print(f"DEBUG: LithologyAgent calling {tool_name}")
            print(f"DEBUG: Params before patch: {params}")
            print(f"DEBUG: Curve Map: {curve_map}")
            
            # --- PATCH: Auto-inject mapped curve aliases ---
            # LLM might use standard names "RHOB", "GR" etc.
            # We need to map them to actual aliases like "ZDEN..."
            
            # 1. Map for analyze_crossplot
            if tool_name == "analyze_crossplot":
                # Forcibly overwrite with mapped names if available
                # This handles cases where LLM sends "RHOB(Alias)" string instead of just "RHOB"
                if curve_map.get('RHOB'):
                    params['rhob_curve'] = curve_map['RHOB']
                if curve_map.get('NPHI'):
                    params['nphi_curve'] = curve_map['NPHI']
                if curve_map.get('DT'):
                    params['dt_curve'] = curve_map['DT']
            
            # 2. Map for calculate_vsh
            elif tool_name == "calculate_vsh":
                if curve_map.get('GR'):
                    params['gr_curve'] = curve_map['GR']
            
            # 3. Map for identify_curve_shape
            elif tool_name == "identify_curve_shape":
                # If LLM passed a standard type key that exists in map, use the map
                # Otherwise keep what LLM sent (it might be a specific curve name)
                c_cname = params.get('curve_name', 'GR')
                if c_cname in curve_map and curve_map[c_cname]:
                    params['curve_name'] = curve_map[c_cname]
                elif curve_map.get('GR') and (c_cname == 'GR' or 'GR(' in c_cname):
                     params['curve_name'] = curve_map['GR']
            # -----------------------------------------------
            
            print(f"DEBUG: Params after patch: {params}")
            
            # Execute tool using BaseAgent method
            tool_result = self.execute_tool(tool_name, log_data=data, **params)
            tool_output = json.dumps(tool_result, indent=2, ensure_ascii=False)
                
            # 5. Second Pass: Synthesis
            prompt_stage_2 = f"""
            用户问题: {user_question}
            使用的工具: {tool_name}
            工具参数: {params}
            工具结果: 
            {tool_output}
            
            基于工具的精确结果，回答用户问题。
            IMPORTANT: 'reasoning'字段必须用中文。
            返回JSON: {{ "lithology": "...", "confidence": ..., "reasoning": "中文解释..." }}
            """
            
            response_text_2 = self.think(prompt_stage_2)
            try:
                result = self.parse_json_response(response_text_2)
                result['tool_used'] = tool_name
                result['tool_result'] = tool_result
                return result
            except ValueError:
                return {
                    "lithology": "Unknown", 
                    "confidence": 0.0, 
                    "reasoning": f"Format Error in Stage 2: {response_text_2}"
                }
        
        else:
            # Direct answer from Stage 1
            return {
                "lithology": decision.get("lithology", "Unknown"),
                "confidence": decision.get("confidence", 0.5),
                "reasoning": decision.get("reasoning", "No reasoning provided.")
            }
