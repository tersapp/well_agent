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
        Analyze log data to determine fluid content.
        """
        curves = data.get('curves', {})
        
        def safe_mean(key):
            vals = [v for v in curves.get(key, []) if v is not None]
            return sum(vals)/len(vals) if vals else None

        rt = safe_mean('RT')
        
        data_desc = f"Log Values: RT={rt:.2f} ohm.m" if rt else "Log Values: RT=Missing"
        
        prompt = f"""
        Analyze the following well log interval:
        {data_desc}
        
        Context from discussion (Lithology info is crucial): {context if context else "None"}
        
        Task: Identify the fluid content (e.g., Oil, Water, Gas, Dry/Tight).
        Return ONLY a JSON object with keys: fluid_type, confidence, reasoning.
        """
        
        response_text = self.think(prompt)
        
        try:
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(clean_text)
            return result
        except json.JSONDecodeError:
            logger.error(f"Failed to decode JSON from ElectricalAgent: {response_text}")
            return {
                "fluid_type": "Unknown",
                "confidence": 0.0,
                "reasoning": "LLM output format error",
                "raw_output": response_text
            }
