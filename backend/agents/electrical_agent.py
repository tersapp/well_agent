from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)

class ElectricalAgent(BaseAgent):
    """
    Agent responsible for identifying fluid content (Oil/Water) 
    based on Resistivity logs.
    """
    
    def __init__(self):
        super().__init__(
            name="ElectricalExpert",
            role_description="""You are a senior Petrophysicist specializing in fluid identification.
            Your job is to analyze Resistivity logs (RT) in context of the lithology 
            to distinguish between Hydrocarbons (Oil/Gas) and Water.
            
            Rules:
            1. High Resistivity usually indicates Hydrocarbons or tight rocks (low porosity).
            2. Low Resistivity usually indicates Water or conductive minerals (Shoulder bed effect).
            3. Archie's Equation principles apply: High Porosity + High Resistivity = Good Pay Zone.
            4. Provide a confidence score (0.0-1.0) and clear reasoning."""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze log data to determine fluid content, utilizing Skills for precise calculation.
        """
        curves = data.get('curves', {})
        
        # 1. Curve Mapping & Tools
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
        
        # Map critical curves for fluid analysis
        # Note: We need Deep vs Shallow separation to see invasion profiles
        curve_map = {
            'RT': get_curve_name('RES_DEEP') or get_curve_name('RT'), # True Formation Resistivity
            'RXO': get_curve_name('RES_SHALLOW') or get_curve_name('RXO'), # Flushed Zone
            'RMIC': get_curve_name('RES_MICRO') or get_curve_name('RMIC'), # Micro
        }
        
        # 2. Data Summary (Progressive Disclosure)
        stats = []
        for c_type, c_name in curve_map.items():
            if c_name and c_name in curves:
                vals = [v for v in curves[c_name] if v is not None]
                if vals:
                    avg = sum(vals)/len(vals)
                    max_val = max(vals)
                    stats.append(f"{c_type}({c_name}): avg={avg:.2f}, max={max_val:.2f}")
        
        data_desc = f"Available Resistivity Curves: {stats}" if stats else "No Resistivity Curves Found."

        # 3. Skill Selection Stage
        skills = skill_registry.list_skills()
        skills_prompt = json.dumps([{
            "name": s['name'],
            "description": s['description'],
            "parameters": s['parameters']
        } for s in skills], indent=2)
        
        prompt_stage_1 = f"""
        Analyze the following electrical log summary:
        {data_desc}
        
        User Context: {context if context else "General fluid analysis"}
        
        Available Skills:
        {skills_prompt}
        
        Task:
        1. Identify the fluid content (Oil, Water, Gas, Tight).
        2. Use tools to find specific high/low resistivity zones if asked.
        3. If you lack critical lithology info (Porosity, Permeability) to make a definitive judgment, state that in your reasoning, BUT still provide your best electrical interpretation (e.g., "High Resistivity suggests potential hydrocarbon, pending porosity confirmation").
        
        IMPORTANT: You may think and analyze in any language, but your final 'reasoning' field MUST be in Chinese (中文).
        
        Response Format (JSON):
        Option A: {{ "action": "tool_use", "tool_name": "...", "parameters": {{ ... }} }}
        Option B: {{ "action": "final_answer", "fluid_type": "...", "confidence": ..., "reasoning": "中文解释..." }}
        """
        
        response_text_1 = self.think(prompt_stage_1)
        
        try:
            decision = self.parse_json_response(response_text_1)
        except ValueError:
            return {
                "fluid_type": "Unknown",
                "confidence": 0.0,
                "reasoning": f"Format Error: {response_text_1}"
            }

        # 4. Execution Stage
        if decision.get("action") == "tool_use":
            tool_name = decision.get("tool_name")
            params = decision.get("parameters", {})
            try:
                tool_result = skill_registry.execute_skill(tool_name, log_data=data, **params)
                tool_output = json.dumps(tool_result, indent=2)
            except Exception as e:
                tool_output = f"Error: {str(e)}"
                
            prompt_stage_2 = f"""
            Tool Result: {tool_output}
            Based on this, answer the user's fluid question.
            IMPORTANT: Your 'reasoning' field MUST be in Chinese (中文).
            JSON: {{ "fluid_type": "...", "confidence": ..., "reasoning": "中文解释..." }}
            """
            
            response_text_2 = self.think(prompt_stage_2)
            try:
                return self.parse_json_response(response_text_2)
            except ValueError:
                 return {"fluid_type": "Unknown", "confidence": 0.0, "reasoning": "Synthesis Error"}
        
        else:
            return {
                "fluid_type": decision.get("fluid_type", "Unknown"),
                "confidence": decision.get("confidence", 0.5),
                "reasoning": decision.get("reasoning", "No reasoning provided.")
            }
