from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
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
        system_prompt = system_prompt_override or self.role_description
        
        # Construct message history
        # (In a real scenario, we might want to manage token limits here)
        messages = [{"role": "user", "content": prompt}]
        
        logger.info(f"Agent {self.name} is thinking...")
        response = self.llm.chat(messages, system_prompt=system_prompt)
        
        if response['success']:
            return response['content']
        else:
            logger.error(f"Agent {self.name} failed to think: {response.get('error')}")
            return "I encountered an error while processing this request."

    def add_to_memory(self, role: str, content: str):
        """Add a message to the agent's memory."""
        self.memory.append({"role": role, "content": content})

    def get_memory_as_string(self) -> str:
        """Dump memory to a string for context."""
        return "\n".join([f"{m['role']}: {m['content']}" for m in self.memory])
