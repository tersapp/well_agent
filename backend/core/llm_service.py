import os
import time
import logging
from typing import List, Dict, Optional, Any, Callable, Union
from functools import wraps
from zhipuai import ZhipuAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def retry_on_failure(max_retries=3, delay=1, backoff=2):
    """Wrapper for retrying function calls on failure."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            current_delay = delay
            
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    retries += 1
                    if retries >= max_retries:
                        logger.error(f"Function {func.__name__} failed after {max_retries} retries: {str(e)}")
                        raise e
                    
                    logger.warning(f"Function {func.__name__} failed ({retries}/{max_retries}), retrying in {current_delay}s... Error: {str(e)}")
                    time.sleep(current_delay)
                    current_delay *= backoff
            
            return None
        return wrapper
    return decorator

class LLMService:
    """
    Wrapper for Zhipu AI GLM-4.7 (glm-4-plus) service.
    Provides methods for chat completion and streaming.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ZHIPU_API_KEY")
        if not self.api_key:
            logger.warning("ZHIPU_API_KEY not found in environment variables. LLM calls will fail.")
            self.client = None
        else:
            try:
                self.client = ZhipuAI(api_key=self.api_key)
            except Exception as e:
                logger.error(f"Failed to initialize ZhipuAI client: {e}")
                self.client = None
                
        self.model = "glm-4-plus"
        self.max_tokens = 4096
        self.temperature = 0.7
        self.top_p = 0.9

    @retry_on_failure(max_retries=3, delay=1, backoff=2)
    def chat(self, 
             messages: List[Dict[str, str]], 
             system_prompt: Optional[str] = None, 
             temperature: Optional[float] = None) -> Dict[str, Any]:
        """
        Send a chat request to the LLM.
        """
        if not self.client:
            return {
                "content": "[MOCK RESPONSE] LLMService not initialized with API Key.",
                "usage": {"total_tokens": 0},
                "success": False,
                "error": "API Key missing"
            }

        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                max_tokens=self.max_tokens,
                temperature=temperature or self.temperature,
                top_p=self.top_p,
                stream=False
            )
            
            return {
                "content": response.choices[0].message.content,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens
                },
                "success": True
            }
        except Exception as e:
            logger.error(f"LLM chat request failed: {str(e)}")
            return {
                "content": None,
                "error": str(e),
                "success": False
            }

    def stream_chat(self, 
                   messages: List[Dict[str, str]], 
                   system_prompt: Optional[str] = None, 
                   callback: Optional[Callable[[str], None]] = None) -> str:
        """
        Stream chat response from the LLM.
        
        Args:
            messages: List of message dicts.
            system_prompt: Optional system instruction.
            callback: Function to call with each new token chunk.
            
        Returns:
            The complete accumulated response string.
        """
        full_messages = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)
        
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stream=True
            )
            
            full_content = ""
            for chunk in response:
                if chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    full_content += token
                    if callback:
                        callback(token)
            
            return full_content
        except Exception as e:
            logger.error(f"LLM streaming request failed: {str(e)}")
            raise e

# Singleton instance for easy import
llm_service = LLMService()
