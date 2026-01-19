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
    Defines the standard interface and common capabilities including tool usage.
    """
    
    def __init__(self, name: str, role_description: str, skill_packs: List[str] = None):
        """
        Initialize the agent.
        
        Args:
            name: Agent name/identifier
            role_description: System prompt describing the agent's role
            skill_packs: List of skill pack names this agent can use
        """
        self.name = name
        self.role_description = role_description
        self.skill_packs = skill_packs or []
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

    # =========================================================================
    # Tool/Skill Methods
    # =========================================================================
    
    def get_available_tools(self) -> List[Dict[str, Any]]:
        """
        Get all tools available to this agent based on its skill packs.
        
        Returns:
            List of tool metadata dicts
        """
        from backend.skills.registry import get_skill_registry
        registry = get_skill_registry()
        return registry.list_tools_for_agent(self.skill_packs)
    
    def match_tools_for_question(self, question: str) -> List[Dict[str, Any]]:
        """
        Match tools based on trigger keywords in the question.
        
        Args:
            question: User's question or context
            
        Returns:
            List of matched tool metadata dicts
        """
        from backend.skills.registry import get_skill_registry
        registry = get_skill_registry()
        return registry.match_tools_by_keywords(question, self.skill_packs)
    
    def build_tools_prompt(self, question: str = None) -> str:
        """
        Build a prompt section describing available tools.
        Dynamically generated - no hardcoding needed!
        
        Args:
            question: Optional user question to highlight matching tools
            
        Returns:
            Formatted string describing available tools
        """
        tools = self.get_available_tools()
        if not tools:
            return "无可用工具"
        
        # Find matching tools if question provided
        matched_names = set()
        if question:
            matched = self.match_tools_for_question(question)
            matched_names = {t['name'] for t in matched}
        
        lines = []
        for tool in tools:
            highlight = " ⭐推荐" if tool['name'] in matched_names else ""
            lines.append(f"### {tool['name']}{highlight}")
            lines.append(f"- 功能: {tool.get('description', 'N/A')}")
            lines.append(f"- 触发词: {', '.join(tool.get('trigger_keywords', []))}")
            lines.append(f"- 使用场景: {tool.get('use_cases', 'N/A')}")
            
            # Add parameter info
            params = tool.get('parameters', {}).get('properties', {})
            if params:
                param_strs = [f"{k}({v.get('type', 'any')})" for k, v in params.items()]
                lines.append(f"- 参数: {', '.join(param_strs)}")
            lines.append("")
        
        return "\n".join(lines)
    
    def execute_tool(self, tool_name: str, log_data: Dict[str, Any] = None, **kwargs) -> Dict[str, Any]:
        """
        Execute a tool by name.
        
        Args:
            tool_name: Name of the tool to execute
            log_data: Well log data to pass to the tool
            **kwargs: Additional parameters for the tool
            
        Returns:
            Tool execution result
        """
        from backend.skills.registry import get_skill_registry
        registry = get_skill_registry()
        
        # Inject log_data if the tool expects it
        if log_data is not None:
            kwargs['log_data'] = log_data
            
        try:
            result = registry.execute_tool(tool_name, **kwargs)
            logger.info(f"Agent {self.name} executed tool {tool_name}")
            return result
        except Exception as e:
            logger.error(f"Agent {self.name} failed to execute tool {tool_name}: {e}")
            return {"error": str(e)}
    
    def has_tools(self) -> bool:
        """Check if this agent has any tools available."""
        return len(self.get_available_tools()) > 0

    # =========================================================================
    # LLM Interaction Methods
    # =========================================================================

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
        Robustly parse JSON from LLM response.
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

    # =========================================================================
    # Memory Methods
    # =========================================================================

    def add_to_memory(self, role: str, content: str):
        """Add a message to the agent's memory."""
        self.memory.append({"role": role, "content": content})

    def get_memory_as_string(self) -> str:
        """Dump memory to a string for context."""
        return "\n".join([f"{m['role']}: {m['content']}" for m in self.memory])
