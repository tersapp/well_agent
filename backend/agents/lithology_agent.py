from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)

class LithologyAgent(BaseAgent):
    """
    Agent responsible for identifying lithology (rock type) 
    based on GR, Density, Neutron, and Sonic logs.
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
            4. Provide a confidence score (0.0-1.0) and clear reasoning."""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze log data to determine lithology, utilizing available Skills for precise calculation.
        """
        curves = data.get('curves', {})
        
        # 1. Curve Mapping & Preparation
        from backend.core.curve_mapper import get_curve_mapper
        from backend.skills.registry import get_skill_registry
        
        mapper = get_curve_mapper()
        mapper.reload()
        skill_registry = get_skill_registry()
        
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
        
        # 2. Prepare Data Summary (Progressive Disclosure - Summary Only)
        # Instead of feeding raw data, we feed statistics and range
        depth_values = curves.get(curve_map['DEPTH'], [])
        if depth_values:
            depth_start = min(depth_values)
            depth_end = max(depth_values)
            depth_summary = f"Depth Range: {depth_start:.2f}m - {depth_end:.2f}m"
        else:
            depth_summary = "Depth Range: Unknown"
            
        # Simple stats for context
        stats = []
        for c_type, c_name in curve_map.items():
            if c_name and c_name in curves:
                vals = [v for v in curves[c_name] if v is not None]
                if vals:
                    avg = sum(vals)/len(vals)
                    stats.append(f"{c_type}({c_name}): avg={avg:.2f}")
        
        data_desc = f"{depth_summary}\nAvailable Curves: {stats}"

        # 3. First Pass: Skill Selection / Initial Analysis
        skills = skill_registry.list_skills()
        skills_prompt = json.dumps([{
            "name": s['name'],
            "description": s['description'],
            "parameters": s['parameters']
        } for s in skills], indent=2)

        prompt_stage_1 = f"""
        Analyze the following well log interval:
        {data_desc}
        
        User Context: {context if context else "General analysis"}
        
        Available Skills (Tools):
        {skills_prompt}
        
        Task:
        1. If the user asks a quantitative question requiring data search, USE A TOOL.
        2. If general lithology identification is needed, answer directly.
        3. CRITICAL: If the question asks about properties OUTSIDE your domain (e.g., Fluids, Oil/Water content, Pay Zone, Resistivity), or if you encounter conflicting data that you cannot resolve alone, you MUST ESCALATE.
        
        IMPORTANT: You may think and analyze in any language, but your final 'reasoning' field MUST be in Chinese (中文).
        
        Response Format (JSON only):
        Option A (Call Tool): {{ "action": "tool_use", "tool_name": "...", "parameters": {{ ... }} }}
        Option B (Final Answer): {{ "action": "final_answer", "lithology": "...", "confidence": ..., "reasoning": "中文解释..." }}
        Option C (Escalate): {{ "action": "escalate", "reason": "中文解释为何无法单独回答", "suggested_experts": ["ElectricalAgent", "PhysicalPropAgent"] }}
        """
        
        response_text_1 = self.think(prompt_stage_1)
        
        try:
            decision = self.parse_json_response(response_text_1)
        except ValueError:
            # Fallback if JSON fails
            return {
                "lithology": "Unknown", 
                "confidence": 0.0, 
                "reasoning": f"Format Error in Stage 1: {response_text_1}"
            }
            
        # 4. Execution Stage (if needed)
        action = decision.get("action")
        
        if action == "escalate":
            # Direct return of the escalation signal
            return {
                "lithology": "Escalation Required",
                "confidence": 0.0,
                "reasoning": decision.get("reason", "Escalation requested"),
                "status": "escalate", # Signal for the backend router
                "suggested_experts": decision.get("suggested_experts", [])
            }
            
        elif action == "tool_use":
            tool_name = decision.get("tool_name")
            params = decision.get("parameters", {})
            
            # Execute Python Skill
            try:
                # Inject log_data into params implicitly
                tool_result = skill_registry.execute_skill(tool_name, log_data=data, **params)
                tool_output = json.dumps(tool_result, indent=2)
            except Exception as e:
                tool_output = f"Tool Execution Error: {str(e)}"
                
            # 5. Second Pass: Synthesis
            prompt_stage_2 = f"""
            Context: {context}
            Tool Used: {tool_name}
            Tool Parameters: {params}
            Tool Result: 
            {tool_output}
            
            Based on the precise tool result, answer the user's question.
            IMPORTANT: Your 'reasoning' field MUST be in Chinese (中文).
            Return JSON: {{ "lithology": "...", "confidence": ..., "reasoning": "中文解释..." }}
            """
            
            response_text_2 = self.think(prompt_stage_2)
            try:
                return self.parse_json_response(response_text_2)
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
