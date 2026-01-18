from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import json
import re
import logging
from backend.core.llm_service import llm_service

logger = logging.getLogger(__name__)

class BaseAgent(ABC):
    """
    Abstract Base Class for all Well Logging Agents.
    Defines the standard interface and common capabilities.
    """
    
    def __init__(self, name: str, role_description: str):
        self.name = name
        self.role_description = role_description
        self.llm = llm_service
        self.memory: List[Dict[str, str]] = []

    @abstractmethod
    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Main analysis method that must be implemented by subclasses.
        
        Args:
            data: The well log data or specific parameters to analyze.
            context: Optional context string (e.g., questions from the arbitrator).
            
        Returns:
            Dict containing the decision, confidence, and reasoning.
        """
        pass

    def think(self, prompt: str, system_prompt_override: Optional[str] = None) -> str:
        """
        Use the LLM to process a prompt.
        
        Args:
            prompt: The user query or data description.
            system_prompt_override: Optional override for the agent's persona.
            
        Returns:
            The raw text response from the LLM.
        """
        import time
        from backend.core.analysis_logger import get_current_logger
        
        system_prompt = system_prompt_override or self.role_description
        
        # Construct message history
        # (In a real scenario, we might want to manage token limits here)
        messages = [{"role": "user", "content": prompt}]
        
        logger.info(f"Agent {self.name} is thinking...")
        
        # Time the LLM call
        start_time = time.time()
        response = self.llm.chat(messages, system_prompt=system_prompt)
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Log LLM call to analysis logger
        analysis_log = get_current_logger()
        if analysis_log and response['success']:
            usage = response.get('usage', {})
            analysis_log.log_llm_call(
                agent_name=self.name,
                prompt_tokens=usage.get('prompt_tokens', 0),
                completion_tokens=usage.get('completion_tokens', 0),
                duration_ms=duration_ms,
                model=self.llm.model if hasattr(self.llm, 'model') else 'unknown'
            )
        
        if response['success']:
            return response['content']
        else:
            logger.error(f"Agent {self.name} failed to think: {response.get('error')}")
            return "I encountered an error while processing this request."

    def parse_json_response(self, response_text: str) -> Dict[str, Any]:
        """
         robustly parse JSON from LLM response.
        """
        try:
            # First, try to clean code blocks
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_text)
        except json.JSONDecodeError:
            # If that fails, try to find the first '{' and last '}'
            try:
                match = re.search(r'(\{.*\})', response_text, re.DOTALL)
                if match:
                    json_str = match.group(1)
                    return json.loads(json_str)
            except json.JSONDecodeError:
                pass
            
            # If all else fails
            logger.error(f"Failed to decode JSON from {self.name}: {response_text}")
            raise ValueError("LLM output format error")

    def add_to_memory(self, role: str, content: str):
        """Add a message to the agent's memory."""
        self.memory.append({"role": role, "content": content})

    def get_memory_as_string(self) -> str:
        """Dump memory to a string for context."""
        return "\n".join([f"{m['role']}: {m['content']}" for m in self.memory])
