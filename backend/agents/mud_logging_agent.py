from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class MudLoggingAgent(BaseAgent):
    """
    Agent responsible for analyzing Mud Logging data (Gas & Drilling parameters).
    Identifies hydrocarbon shows and drilling breaks.
    """

    def __init__(self):
        super().__init__(
            name="MudLoggingExpert",
            role_description="""You are a senior Mud Logging Geologist.
            Your job is to analyze gas chromatography data and drilling parameters to identify potential hydrocarbon zones.
            
            Your Scope:
            1. Analyze Total Gas (GAS_TOTAL/TG) peaks relative to background.
            2. Analyze Gas Components (C1, C2, C3...) to determine fluid type (Gas/Oil).
            3. Calculate ratios (e.g., C1/C2, Pixler plots) if components available.
            4. Identifying "Fast Drilling Breaks" using ROP (Rate of Penetration) which may indicate porous formations.
            
            Interpretation Rules:
            - High Total Gas + High ROP often indicates porous, hydrocarbon-bearing intervals.
            - High C1 (Methane) indicates Gas.
            - Presence of C3+ (Propane plus) indicates Oil potential.
            - Wetness Ratio (Wh) = (C2+C3+...)/TotalGas * 100. Wh < 0.5 (Very Dry Gas), 0.5-17.5 (Gas/Condensate), > 17.5 (Oil).
            
            Output Format (JSON):
            {
                "gas_show": "None/Trace/Fair/Good/Excellent",
                "fluid_interpretation": "Dry/Gas/Condensate/Oil/Unknown",
                "rop_break": true/false, // Is there a significant increase in drilling speed?
                "gas_ratios": {
                    "wh_ratio": 12.5,
                    "interpretation": "Gas Condensate"
                },
                "confidence": 0.0-1.0,
                "reasoning": "Explanation in Chinese"
            }"""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze mud logging curves.
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
                # Supports multiple gas components
                if std == standard_type:
                    return orig
            return None
        
        # 2. Identify keys
        tg_curve = get_curve_name('GAS_TOTAL')
        c1_curve = get_curve_name('GAS_C1')
        c2_curve = get_curve_name('GAS_C2')
        c3_curve = get_curve_name('GAS_C3')
        rop_curve = get_curve_name('ROP')
        
        # 3. Data Summary
        available_curves = []
        curve_stats = {}
        
        for std_type, curve_name in [
            ('GAS_TOTAL', tg_curve),
            ('GAS_C1', c1_curve),
            ('GAS_C2', c2_curve),
            ('GAS_C3', c3_curve),
            ('ROP', rop_curve)
        ]:
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

        # 4. Context for LLM
        data_summary = f"""
        Depth Range: {min(depth):.1f} - {max(depth):.1f} m
        
        Available Mud Log Curves: {', '.join(available_curves) if available_curves else 'None'}
        
        Curve Statistics:
        {json.dumps(curve_stats, indent=2, ensure_ascii=False)}
        """
        
        user_question = ""
        if context:
            for line in context.split('\n'):
                if 'User Note:' in line:
                    user_question = line.replace('User Note:', '').strip()
                    break

        # 5. Prompt
        if not available_curves:
            prompt = f"""
            Analyze mud logging data.
            NO mud logging curves (Total Gas, Chromatography, ROP) are available for this interval.
            
            State that no data is available.
            
            Return ONLY a JSON object with keys: gas_show, fluid_interpretation, rop_break, gas_ratios, confidence, reasoning.
            """
        else:
            prompt = f"""
            Analyze the Mud Logging data for this well interval.
            
            {data_summary}
            
            User Question: {user_question}
            
            Tasks:
            1. Evaluate Total Gas levels (Is it effectively zero, background, or a show?)
            2. If Components (C1, C2, C3) exists, calculate wetness or ratios to guess fluid type.
            3. Check ROP. If ROP is significantly higher (lower value if unit is h/m, higher if m/h - CHECK UNIT) than typical, it might be a drilling break.
               * Note on ROP units: Usually m/h (higher is faster) or min/m (lower is faster). Look at the magnitude.
               * Assume m/h here unless specified otherwise.
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            Return ONLY a JSON object with keys: gas_show, fluid_interpretation, rop_break, gas_ratios, confidence, reasoning.
            """

        response_text = self.think(prompt)
        
        try:
            result = self.parse_json_response(response_text)
            return result
        except ValueError:
            return {
                "gas_show": "Unknown",
                "fluid_interpretation": "Unknown",
                "rop_break": False,
                "gas_ratios": {},
                "confidence": 0.0,
                "reasoning": "LLM输出格式解析失败",
                "raw_output": response_text
            }
