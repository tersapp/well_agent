from typing import Dict, Any, List, Optional
from backend.agents.base_agent import BaseAgent
import json
import logging

logger = logging.getLogger(__name__)

class ArbitratorAgent(BaseAgent):
    """
    The Chief Petrophysicist (Arbitrator). 
    Synthesizes opinions from Lithology and Electrical experts.
    """
    
    def __init__(self):
        super().__init__(
            name="Arbitrator",
            role_description="""You are the Chief Interpreting Engineer.
            Your goal is to provide a final, conclusion on the well log interval 
            by synthesizing reports from your team (Lithology Expert, Electrical Expert).
            
            Responsibilities:
            1. Integrate Lithology and Fluid conclusions.
            2. Detect inconsistencies (e.g., "Non-reservoir rock but High Oil Saturation").
            3. If consensus is reached and reasonable, output a FINAL DECISION.
            4. If conflict exists, ask a targeted QUESTION to the specific agent to resolve it.
            
            Output Format (JSON):
            {
                "status": "FINAL" or "DISCUSSION",
                "decision": "Oil Layer / Water Layer / Dry Layer / Undecided",
                "confidence": 0.0-1.0,
                "question": "Question text if status is DISCUSSION, else null",
                "reasoning": "Summary of your thought process"
            }
            """
        )

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Arbitrate the discussion.
        data: Expected to contain 'agent_outputs' from previous steps.
        context: The full discussion history.
        """
        # In this design, 'data' passed to Arbitrator mainly contains the synthesis of other agents' outputs
        # or we rely on 'context' which holds the conversation history.
        
        prompt = f"""
        Review the current analysis of the well log interval.
        
        Discussion History:
        {context}
        
        Based on the above, is there a clear and consistent conclusion?
        If yes, make a FINAL decision.
        If no, or if there are contradictions, ask a question to clarify.
        """
        
        response_text = self.think(prompt)
        
        try:
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            result = json.loads(clean_text)
            return result
        except json.JSONDecodeError:
            logger.error(f"Failed to decode JSON from ArbitratorAgent: {response_text}")
            return {
                "status": "ERROR",
                "decision": "Error",
                "confidence": 0.0,
                "question": None,
                "reasoning": "LLM output formatting error"
            }
