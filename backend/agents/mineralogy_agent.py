from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class MineralogyAgent(BaseAgent):
    """
    Agent responsible for DETAILED Mineralogy and Matrix analysis.
    Uses Spectral Gamma Ray (U, K, Th) and Lithology Volumes (Vsh, Vcal, Vdol, Vsand).
    Now empowered with Lithology Tools for crossplot analysis.
    """

    def __init__(self):
        super().__init__(
            name="MineralogyExpert",
            role_description="""You are a specialized Mineralogist and Geochemist.
            Your job is to perform detailed analysis of the rock matrix composition.
            
            Your Scope:
            1. Analyze Spectral Gamma Ray (K, U, Th) to identify clay types or organic matter.
            2. Analyze volumetric curves (Vol_Calc, Vol_Dol, Vol_Sand, Vol_Clay) for lithology mix.
            3. Use Crossplots (M-N, Density-Neutron) to identify mineral points (Quartz, Calcite, Dolomite).
            4. Identify complex lithologies and special minerals (Pyrite, Coal, etc).
            
            Rules:
            - High Uranium (U) often indicates Organic Rich Shales.
            - Potassium (K) helps distinguish Feldspars.
            - Use analyze_crossplot to confirm matrix density and minerology.
            
            Output Format (Strict JSON):
            {
                "primary_lithology": "...", 
                "secondary_lithology": "...",
                "clay_type": "...",
                "organic_content": "...",
                "mineral_composition": {...},
                "confidence": 0.0-1.0,
                "reasoning": "Explanation in Chinese"
            }""",
            skill_packs=["lithology-classification"]  # Added skill pack
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze mineralogy curves, utilizing available tools dynamically.
        """
        curves = data.get('curves', {})
        depth = curves.get('DEPTH', [])
        
        # 1. Curve Mapping
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
        
        # Identify key curves & Map for later tool injection
        curve_map = {
            'DEPTH': get_curve_name('DEPTH'),
            'RHOB': get_curve_name('RHOB'),
            'NPHI': get_curve_name('NPHI'),
            'DT': get_curve_name('DT'),
            'GR': get_curve_name('GR'),
            'PE': get_curve_name('PE'),
            'SGR_U': get_curve_name('SGR_U'),
            'SGR_K': get_curve_name('SGR_K'),
            'SGR_TH': get_curve_name('SGR_TH'),
            'VOL_SHALE': get_curve_name('VOL_SHALE') or get_curve_name('VOL_CLAY')
        }
        
        # 2. Data Summary
        available_curves = []
        curve_stats = {}
        
        for std_type, curve_name in curve_map.items():
            if curve_name and curve_name in curves:
                vals = [v for v in curves[curve_name] if v is not None]
                if vals:
                    available_curves.append(f"{std_type} ({curve_name})")
                    curve_stats[std_type] = {
                        'curve': curve_name,
                        'min': round(min(vals), 4),
                        'max': round(max(vals), 4),
                        'avg': round(sum(vals) / len(vals), 4)
                    }

        data_summary = f"""
        Depth Range: {min(depth):.1f} - {max(depth):.1f} m
        Available Curves: {', '.join(available_curves) if available_curves else 'None'}
        Curve Statistics:
        {json.dumps(curve_stats, indent=2, ensure_ascii=False)}
        """
        
        user_question = context or "Mineralogy analysis"
        
        # 3. Build Tools Prompt (Stage 1)
        tools_prompt = self.build_tools_prompt(question=user_question)
        
        matched_tools = self.match_tools_for_question(user_question)
        matched_tool_names = [t['name'] for t in matched_tools]

        prompt_stage_1 = f"""
        Analyze the detailed Mineralogy for this well interval.
        
        {data_summary}
        
        User Question: {user_question}
        
        ## Available Tools
        {tools_prompt}
        
        ## Tasks
        1. Determine matrix composition (Sand/Lime/Dol/Shale).
        2. Identify clay types or organic matter (if SGR available).
        3. Use tools (e.g. analyze_crossplot) if needed for matrix identification.
        
        ## Recommended Tools Detection
        {"**Detected Recommendations**: " + str(matched_tool_names) if matched_tool_names else "No specific tool recommended."}
        
        IMPORTANT: 'reasoning' field MUST be in Chinese.
        
        ## Output Format (Strict JSON)
        Option A (Use Tool): {{ "action": "tool_use", "tool_name": "...", "parameters": {{ ... }} }}
        Option B (Direct Answer): {{ "action": "final_answer", "primary_lithology": "...", "secondary_lithology": "...", "clay_type": "...", "organic_content": "...", "mineral_composition": {{...}}, "confidence": ..., "reasoning": "中文解释..." }}
        """

        response_text = self.think(prompt_stage_1)
        
        try:
            decision = self.parse_json_response(response_text)
        except ValueError:
            return {
                "primary_lithology": "Unknown",
                "confidence": 0.0,
                "reasoning": f"Format Error in Stage 1: {response_text}"
            }
            
        # 4. Execution Logic
        action = decision.get("action")
        
        if action == "tool_use":
            tool_name = decision.get("tool_name")
            params = decision.get("parameters", {})
            
            # --- PATCH: Auto-inject mapped curve aliases ---
            # 1. Map for analyze_crossplot
            if tool_name == "analyze_crossplot":
                # Forcibly overwrite with mapped names if available
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
            # -----------------------------------------------

            # Execute Tool
            tool_result = self.execute_tool(tool_name, log_data=data, **params)
            tool_output = json.dumps(tool_result, indent=2, ensure_ascii=False)
            
            # 5. Synthesis (Stage 2)
            prompt_stage_2 = f"""
            User Question: {user_question}
            Tool Used: {tool_name}
            Tool Result: {tool_output}
            
            Synthesize the mineralogy analysis.
            IMPORTANT: 'reasoning' must be in Chinese.
            Return JSON: {{ "primary_lithology": "...", "secondary_lithology": "...", "clay_type": "...", "organic_content": "...", "mineral_composition": {{...}}, "confidence": ..., "reasoning": "中文解释..." }}
            """
            
            response_text_2 = self.think(prompt_stage_2)
            try:
                result = self.parse_json_response(response_text_2)
                result['tool_used'] = tool_name
                return result
            except ValueError:
                return {
                    "primary_lithology": "Unknown",
                    "confidence": 0.0,
                    "reasoning": f"Format Error in Stage 2: {response_text_2}"
                }
        
        else:
            # Direct Answer
            return {
                "primary_lithology": decision.get("primary_lithology", "Unknown"),
                "secondary_lithology": decision.get("secondary_lithology", "None"),
                "clay_type": decision.get("clay_type", "Unknown"),
                "organic_content": decision.get("organic_content", "Unknown"),
                "mineral_composition": decision.get("mineral_composition", {}),
                "confidence": decision.get("confidence", 0.5),
                "reasoning": decision.get("reasoning", "No reasoning provided.")
            }
