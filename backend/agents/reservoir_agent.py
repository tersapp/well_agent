from typing import Dict, Any, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)


class ReservoirPropertyAgent(BaseAgent):
    """
    Agent responsible for QUANTITATIVE evaluation of reservoir properties.
    Calculates porosity, permeability, and classifies reservoir quality.
    """

    def __init__(self):
        super().__init__(
            name="ReservoirPropertyExpert",
            role_description="""You are a senior Reservoir Engineer specializing in petrophysical property evaluation.
            Your job is to QUANTITATIVELY analyze well log data to determine reservoir quality parameters.
            
            Your Scope (QUANTITATIVE analysis only):
            1. Calculate or read POROSITY values (from POR_EFF, POR_TOTAL, or computed from RHOB/NPHI/DT)
            2. Calculate or read PERMEABILITY values (from PERM_ABS or NMR_K)
            3. Classify reservoir quality (Type I/II/III based on porosity-permeability cutoffs)
            4. Identify NET PAY thickness (effective reservoir intervals)
            
            NOT your scope (leave these to other experts):
            - Rock type identification (LithologyExpert handles this qualitatively)
            - Fluid type determination (SaturationExpert handles saturation)
            
            Classification Standards:
            - Type I: Porosity > 15%, Perm > 100 mD (High quality)
            - Type II: Porosity 10-15%, Perm 10-100 mD (Medium quality)
            - Type III: Porosity 5-10%, Perm 1-10 mD (Low quality, tight)
            - Non-reservoir: Porosity < 5% or Perm < 1 mD
            
            Output Format (JSON):
            {
                "result": "Type I/II/III/Non-reservoir",
                "porosity": {
                    "value": 0.15,
                    "method": "from_curve/calculated",
                    "curve_used": "PHIE"
                },
                "permeability": {
                    "value": 50.0,
                    "method": "from_curve/estimated",
                    "curve_used": "PERM_ABS"
                },
                "net_pay": {
                    "thickness_m": 5.5,
                    "intervals": [{"top": 3790.0, "bottom": 3795.5}]
                },
                "confidence": 0.0-1.0,
                "reasoning": "Explanation in Chinese"
            }"""
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze log data to evaluate reservoir properties.
        """
        curves = data.get('curves', {})
        depth = curves.get('DEPTH', [])
        
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
        
        # 2. Identify available property curves
        porosity_curve = get_curve_name('POR_EFF') or get_curve_name('POR_TOTAL')
        perm_curve = get_curve_name('PERM_ABS') or get_curve_name('NMR_K')
        density_curve = get_curve_name('RHOB')
        neutron_curve = get_curve_name('NPHI')
        sonic_curve = get_curve_name('DT')
        
        # Build data summary for LLM
        available_curves = []
        curve_stats = {}
        
        for std_type, curve_name in [
            ('POR_EFF', porosity_curve),
            ('PERM_ABS', perm_curve),
            ('RHOB', density_curve),
            ('NPHI', neutron_curve),
            ('DT', sonic_curve)
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
        
        # 3. Try to use skills for precise calculation
        skill_results = {}
        if porosity_curve:
            try:
                result = skill_registry.execute_skill(
                    "find_extreme_values",
                    {
                        "curve_name": porosity_curve,
                        "extreme_type": "max",
                        "log_data": {"curves": curves, "depth": depth}
                    }
                )
                if result.get("success"):
                    skill_results["max_porosity"] = result
            except Exception as e:
                logger.debug(f"Skill execution failed: {e}")
        
        # 4. Build prompt for LLM
        data_summary = f"""
        Depth Range: {min(depth):.1f} - {max(depth):.1f} m
        
        Available Curves: {', '.join(available_curves) if available_curves else 'Limited data'}
        
        Curve Statistics:
        {json.dumps(curve_stats, indent=2, ensure_ascii=False)}
        
        Skill Results (if any):
        {json.dumps(skill_results, indent=2, ensure_ascii=False)}
        """
        
        user_question = ""
        if context:
            for line in context.split('\n'):
                if 'User Note:' in line:
                    user_question = line.replace('User Note:', '').strip()
                    break
        
        if porosity_curve or perm_curve:
            # Direct property data available
            prompt = f"""
            Analyze the reservoir properties for this well interval.
            
            {data_summary}
            
            User Question: {user_question or "Evaluate reservoir quality"}
            
            Task:
            1. Read the porosity and permeability values from available curves
            2. Classify the reservoir type (I/II/III/Non-reservoir)
            3. Identify any good net pay intervals
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            
            Return ONLY a JSON object with keys: result, porosity, permeability, net_pay, confidence, reasoning.
            """
        else:
            # Need to calculate from raw curves
            prompt = f"""
            Analyze the reservoir properties for this well interval.
            No direct porosity/permeability curves available. You need to estimate from raw logs.
            
            {data_summary}
            
            User Question: {user_question or "Evaluate reservoir quality"}
            
            Task:
            1. Estimate porosity from density-neutron or sonic logs (if available)
            2. Use empirical relations to estimate permeability (e.g., Timur, Coates)
            3. Classify the reservoir type based on your estimates
            4. Be clear about the uncertainty of your estimates
            
            LANGUAGE RULE: You may analyze in any language, but 'reasoning' field MUST be in Chinese.
            
            Return ONLY a JSON object with keys: result, porosity, permeability, net_pay, confidence, reasoning.
            If you cannot calculate, set confidence to 0 and explain why in reasoning.
            """
        
        response_text = self.think(prompt)
        
        try:
            result = self.parse_json_response(response_text)
            return result
        except ValueError:
            return {
                "result": "Unknown",
                "porosity": {"value": None, "method": "failed"},
                "permeability": {"value": None, "method": "failed"},
                "net_pay": {"thickness_m": 0, "intervals": []},
                "confidence": 0.0,
                "reasoning": "LLM输出格式解析失败",
                "raw_output": response_text if 'response_text' in locals() else "No response"
            }
