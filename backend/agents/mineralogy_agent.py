from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class MineralogyAgent(BaseAgent):
    """
    Agent responsible for DETAILED Mineralogy and Matrix analysis.
    Uses Spectral Gamma Ray (U, K, Th) and Lithology Volumes (Vsh, Vcal, Vdol, Vsand).
    """

    def __init__(self):
        super().__init__(
            name="MineralogyExpert",
            role_description="""You are a specialized Mineralogist and Geochemist.
            Your job is to perform detailed analysis of the rock matrix composition.
            
            Your Scope:
            1. Analyze Spectral Gamma Ray (K, U, Th) to identify clay types (Illite vs Smectite vs Kaolinite) or organic matter (Uranium).
            2. Analyze volumetric curves (Vol_Calc, Vol_Dol, Vol_Sand, Vol_Clay) to determine precise lithology mix.
            3. Identify complex lithologies: e.g., Shaly Sand, Sandy Lime, Dolomitic Limestone.
            4. Identify special minerals if data suggests (e.g., Pyrite, Anhydrite, Coal).
            
            Rules:
            - High Uranium (U) often indicates Organic Rich Shales (Source Rock) or fractures.
            - Potassium (K) helps distinguish Feldspars (in Arkosic sands) or Micas.
            - Th/K ratio is a classic clay typing indicator.
            
            Output Format (JSON):
            {
                "primary_lithology": "Sandstone/Limestone/...", 
                "secondary_lithology": "Dolomitic/Shaly/...",
                "clay_type": "Illite/Kaolinite/Mixed/Unknown",
                "organic_content": "High/Low/None",
                "mineral_composition": {
                    "Quartz": "Dominant",
                    "Calcite": "Trace",
                    "Clay": "Minor"
                },
                "confidence": 0.0-1.0,
                "reasoning": "Explanation in Chinese"
            }"""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze mineralogy curves.
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
        
        # 2. Identify keys
        # Spectral GR
        u_curve = get_curve_name('SGR_U')
        k_curve = get_curve_name('SGR_K')
        th_curve = get_curve_name('SGR_TH')
        
        # Volumes
        vsh_curve = get_curve_name('VOL_SHALE') or get_curve_name('VOL_CLAY')
        vcalc_curve = get_curve_name('VOL_CALC')
        vdol_curve = get_curve_name('VOL_DOL')
        vsand_curve = get_curve_name('VOL_SAND')
        
        # PE is also useful for mineralogy
        pe_curve = get_curve_name('PE')
        
        # 3. Data Summary
        available_curves = []
        curve_stats = {}
        
        for std_type, curve_name in [
            ('SGR_U', u_curve), ('SGR_K', k_curve), ('SGR_TH', th_curve),
            ('VOL_SHALE', vsh_curve), ('VOL_CALC', vcalc_curve),
            ('VOL_DOL', vdol_curve), ('VOL_SAND', vsand_curve),
            ('PE', pe_curve)
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

        # 4. Context & Prompt
        data_summary = f"""
        Depth Range: {min(depth):.1f} - {max(depth):.1f} m
        
        Available Mineralogy Curves: {', '.join(available_curves) if available_curves else 'None'}
        
        Curve Statistics:
        {json.dumps(curve_stats, indent=2, ensure_ascii=False)}
        """
        
        prompt = f"""
        Analyze the detailed Mineralogy for this well interval.
        
        {data_summary}
        
        Tasks:
        1. Determine the main matrix composition (Sand vs Lime vs Dol vs Shale).
        2. If Spectral Gamma (U, K, Th) is available, interpret the clay type or source rock potential.
           - High U (> 5ppm) often indicates organic matter.
        3. If PE is available: Sand(1.8), Shale(2-4), Lime(5.1), Dol(3.1), Anhydrite(5.0).
        
        LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
        Return ONLY a JSON object with keys: primary_lithology, secondary_lithology, clay_type, organic_content, mineral_composition, confidence, reasoning.
        """

        response_text = self.think(prompt)
        
        try:
            result = self.parse_json_response(response_text)
            return result
        except ValueError:
            return {
                "primary_lithology": "Unknown",
                "secondary_lithology": "Unknown",
                "clay_type": "Unknown",
                "organic_content": "Unknown",
                "mineral_composition": {},
                "confidence": 0.0,
                "reasoning": "LLM输出格式解析失败",
                "raw_output": response_text
            }
