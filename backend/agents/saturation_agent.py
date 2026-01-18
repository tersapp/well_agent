from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class SaturationAgent(BaseAgent):
    """
    Agent responsible for QUANTITATIVE evaluation of fluid saturation.
    Calculates Water Saturation (Sw) and Oil Saturation (So).
    """

    def __init__(self):
        super().__init__(
            name="SaturationExpert",
            role_description="""You are a senior Petrophysicist specializing in Fluid Saturation Analysis.
            Your job is to QUANTITATIVELY determine the water and hydrocarbon saturation in the reservoir.
            
            Your Scope (QUANTITATIVE calculation):
            1. Calculate Water Saturation (Sw) using Archie's equation or similar models (Sw = sqrt(a*Rw / (phi^m * Rt)))
            2. Calculate Oil/Gas Saturation (So = 1 - Sw)
            3. Evaluate Movable Oil Saturation (if Rxo available)
            4. Identify Oil-Water Contact (OWC) or Gas-Oil Contact (GOC) if present in the specific interval
            
            Input Data Usage:
            - Resistivity (Rt): RES_DEEP (Crucial)
            - Porosity (Phi): POR_EFF (Primary) or POR_TOTAL
            - Constants (Archie parameters): Assume a=1, m=2, n=2 if not specified, Rw=0.05 (salty) or estimated from clean water sand
            
            Interpretation Rules:
            - Sw < 50%: Likely Hydrocarbon bearing
            - Sw > 50%: Likely Water bearing (or high irreducible water)
            - Separation between Rxo and Rt indicates permeability and invasion (movable fluids)
            
            Output Format (JSON):
            {
                "fluid_type": "Oil / Gas / Water / Dry",
                "saturation": {
                    "Sw": 0.35,  // Water Saturation (0.0-1.0)
                    "So": 0.65,  // Oil Saturation
                    "method": "Archie/Simandoux/Direct Reading"
                },
                "movable_hydrocarbon": "High/Medium/Low/None",
                "pay_flag": true/false, // Is this commercial pay?
                "confidence": 0.0-1.0,
                "reasoning": "Explanation in Chinese"
            }"""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze log data to calculate fluid saturation.
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
        
        # 2. Identify keys for saturation calculation
        # Resistivity
        rt_curve = get_curve_name('RES_DEEP')
        rxo_curve = get_curve_name('RXO') or get_curve_name('RES_SHALLOW')
        
        # Porosity
        phi_curve = get_curve_name('POR_EFF') or get_curve_name('POR_TOTAL')
        
        # Direct Saturation curves (if available)
        sw_curve = get_curve_name('SAT_WATER')
        so_curve = get_curve_name('SAT_OIL')
        
        # 3. Data Summary
        available_curves = []
        curve_stats = {}
        
        for std_type, curve_name in [
            ('RES_DEEP', rt_curve),
            ('POR_EFF', phi_curve),
            ('SAT_WATER', sw_curve),
            ('SAT_OIL', so_curve)
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
        # Check if Porosity Expert has already run (it might be in context)
        # But for now, we assume we might need to estimate Phi if not provided directly
        
        data_summary = f"""
        Depth Range: {min(depth):.1f} - {max(depth):.1f} m
        
        Available Curves: {', '.join(available_curves) if available_curves else 'Limited data'}
        
        Curve Statistics:
        {json.dumps(curve_stats, indent=2, ensure_ascii=False)}
        """
        
        user_question = ""
        if context:
            for line in context.split('\n'):
                if 'User Note:' in line:
                    user_question = line.replace('User Note:', '').strip()
                    break

        # 5. Prompt Construction
        if sw_curve:
            # Direct Sw curve available
            prompt = f"""
            Analyze the fluid saturation for this well interval.
            Direct Water Saturation curve ({sw_curve}) is available.
            
            {data_summary}
            
            User Question: {user_question}
            
            Task:
            1. Read the Sw values directly.
            2. Determine the fluid type and pay potential.
            3. Calculate So = 1 - Sw.
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            Return ONLY a JSON object with keys: fluid_type, saturation, movable_hydrocarbon, pay_flag, confidence, reasoning.
            """
        elif rt_curve and (phi_curve or 'POR_EFF' in str(context)): # Check context for porosity logic later if needed
            # Need to calculate Archie
            prompt = f"""
            Analyze the fluid saturation for this well interval.
            You need to calculate Water Saturation (Sw) using Archie's Law or similar.
            
            Data:
            - Rt (Resistivity): {rt_curve}
            - Porosity: {phi_curve} (or estimate from logs if missing)
            
            {data_summary}
            
            Parameters (unless evident from data):
            - a=1, m=2, n=2
            - Rw = 0.05 ohm.m (saline water)
            
            Task:
            1. Calculate Sw using Archie: Sw = ( (a * Rw) / (Phi^m * Rt) ) ^ (1/n)
            2. If Porosity is missing, assume average 15% (0.15) for calculation but flag low confidence.
            3. Determine fluid type (Oil/Gas/Water).
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            Return ONLY a JSON object with keys: fluid_type, saturation, movable_hydrocarbon, pay_flag, confidence, reasoning.
            """
        else:
            # Fallback - Qualitative
            prompt = f"""
            Analyze the fluid saturation for this well interval.
            Critical curves (Rt or Phi) are missing. Make a qualitative assessment if possible.
            
            {data_summary}
            
            Task:
            1. If Rt is available but Phi is missing, try to infer based on high/low resistivity.
            2. If completely insufficient, state "Unknown" and explain missing data.
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            Return ONLY a JSON object with keys: fluid_type, saturation, movable_hydrocarbon, pay_flag, confidence, reasoning.
            """

        response_text = self.think(prompt)
        
        try:
            result = self.parse_json_response(response_text)
            return result
        except ValueError:
            return {
                "fluid_type": "Unknown",
                "saturation": {"Sw": None, "So": None, "method": "failed"},
                "movable_hydrocarbon": "Unknown",
                "pay_flag": False,
                "confidence": 0.0,
                "reasoning": "LLM输出格式解析失败",
                "raw_output": response_text
            }
