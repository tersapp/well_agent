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
        Analyze log data to determine lithology.
        data: Expected to contain 'curves' dictionary with keys like GR, RHOB, NPHI.
        """
        curves = data.get('curves', {})
        
        # Extract mean values for a simplified "point" or "interval" analysis
        # In a real system, we'd handle depth series. Here we take the average of the provided window.
        
        def safe_mean(key):
            vals = [v for v in curves.get(key, []) if v is not None]
            return sum(vals)/len(vals) if vals else None

        gr = safe_mean('GR')
        rhob = safe_mean('RHOB')
        nphi = safe_mean('NPHI')
        
        # Brief data summary for LLM
        data_desc = f"Log Values: GR={gr:.2f} API"
        if rhob: data_desc += f", RHOB={rhob:.2f} g/cc"
        if nphi: data_desc += f", NPHI={nphi:.2f} v/v"
        
        prompt = f"""
        Analyze the following well log interval:
        {data_desc}
        
        Context from discussion: {context if context else "None"}
        
        Task: Identify the lithology.
        Return ONLY a JSON object with keys: lithology, confidence, reasoning.
        """
        
        response_text = self.think(prompt)
        
        try:
            # Clean up potential markdown code blocks
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(clean_text)
            return result
        except json.JSONDecodeError:
            logger.error(f"Failed to decode JSON from LithologyAgent: {response_text}")
            return {
                "lithology": "Unknown",
                "confidence": 0.0,
                "reasoning": "LLM output format error",
                "raw_output": response_text
            }
