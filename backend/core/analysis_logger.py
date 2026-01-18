"""
Analysis Logger - 分析流程日志收集器

记录多智能体分析过程中的:
- 节点执行 (router, specialist, arbitrator)
- 技能加载
- LLM 调用详情
"""

import uuid
import time
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

# Thread-local storage for current analysis logger
_current_logger = threading.local()


@dataclass
class LLMCallLog:
    """LLM 调用记录"""
    agent_name: str
    model: str = "glm-4"
    prompt_tokens: int = 0
    completion_tokens: int = 0
    duration_ms: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class NodeLog:
    """节点执行记录"""
    step: int
    node: str
    agent_key: Optional[str] = None
    agent_name: Optional[str] = None
    decision: Optional[str] = None
    skills_loaded: List[str] = field(default_factory=list)
    llm_call: Optional[Dict[str, Any]] = None
    confidence: Optional[float] = None
    duration_ms: int = 0
    start_time: float = field(default_factory=time.time)
    
    def finalize(self):
        """完成节点记录，计算耗时"""
        self.duration_ms = int((time.time() - self.start_time) * 1000)


class AnalysisLogger:
    """分析日志收集器"""
    
    def __init__(self, depth_range: Optional[Dict[str, float]] = None):
        self.analysis_id = str(uuid.uuid4())[:8]
        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.depth_range = depth_range or {}
        self.start_time = time.time()
        
        self.workflow_trace: List[NodeLog] = []
        self.current_node: Optional[NodeLog] = None
        self._step_counter = 0
        
        # Aggregates
        self.total_llm_calls = 0
        self.total_prompt_tokens = 0
        self.total_completion_tokens = 0
        
        logger.info(f"[AnalysisLog:{self.analysis_id}] Started")
    
    def start_node(self, node_name: str, agent_key: str = None, agent_name: str = None) -> NodeLog:
        """开始记录一个节点"""
        # Finalize previous node if exists
        if self.current_node:
            self.current_node.finalize()
            self.workflow_trace.append(self.current_node)
        
        self._step_counter += 1
        self.current_node = NodeLog(
            step=self._step_counter,
            node=node_name,
            agent_key=agent_key,
            agent_name=agent_name
        )
        
        logger.info(f"[AnalysisLog:{self.analysis_id}] Node started: {node_name}" + 
                   (f" ({agent_key})" if agent_key else ""))
        return self.current_node
    
    def log_router_decision(self, target_agent: str):
        """记录路由决策"""
        if self.current_node:
            self.current_node.decision = target_agent
            logger.info(f"[AnalysisLog:{self.analysis_id}] Router -> {target_agent}")
    
    def log_skill_loaded(self, skill_name: str):
        """记录技能加载"""
        if self.current_node:
            if skill_name not in self.current_node.skills_loaded:
                self.current_node.skills_loaded.append(skill_name)
                logger.info(f"[AnalysisLog:{self.analysis_id}] Skill loaded: {skill_name}")
    
    def log_llm_call(self, agent_name: str, prompt_tokens: int = 0, 
                     completion_tokens: int = 0, duration_ms: int = 0, model: str = "glm-4"):
        """记录 LLM 调用"""
        llm_log = LLMCallLog(
            agent_name=agent_name,
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=duration_ms
        )
        
        if self.current_node:
            self.current_node.llm_call = asdict(llm_log)
        
        self.total_llm_calls += 1
        self.total_prompt_tokens += prompt_tokens
        self.total_completion_tokens += completion_tokens
        
        logger.info(f"[AnalysisLog:{self.analysis_id}] LLM call by {agent_name}: "
                   f"{prompt_tokens}+{completion_tokens} tokens, {duration_ms}ms")
    
    def log_confidence(self, confidence: float):
        """记录置信度"""
        if self.current_node:
            self.current_node.confidence = confidence
    
    def finalize(self) -> Dict[str, Any]:
        """完成日志收集，返回完整日志并保存到文件"""
        import json
        from pathlib import Path
        
        # Finalize current node
        if self.current_node:
            self.current_node.finalize()
            self.workflow_trace.append(self.current_node)
            self.current_node = None
        
        duration_ms = int((time.time() - self.start_time) * 1000)
        
        result = {
            "analysis_id": self.analysis_id,
            "timestamp": self.timestamp,
            "depth_range": self.depth_range,
            "duration_ms": duration_ms,
            "workflow_trace": [asdict(n) for n in self.workflow_trace],
            "summary": {
                "total_steps": len(self.workflow_trace),
                "total_llm_calls": self.total_llm_calls,
                "total_tokens": self.total_prompt_tokens + self.total_completion_tokens,
                "prompt_tokens": self.total_prompt_tokens,
                "completion_tokens": self.total_completion_tokens
            }
        }
        
        # Save to file
        try:
            # Get project root and create logs directory
            project_root = Path(__file__).resolve().parent.parent.parent
            logs_dir = project_root / "logs" / "analysis"
            logs_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename with timestamp
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_filename = f"analysis_{timestamp_str}_{self.analysis_id}.json"
            log_path = logs_dir / log_filename
            
            # Write JSON file
            with open(log_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            logger.info(f"[AnalysisLog:{self.analysis_id}] Saved to {log_path}")
            result["log_file"] = str(log_path)
            
        except Exception as e:
            logger.warning(f"[AnalysisLog:{self.analysis_id}] Failed to save log file: {e}")
        
        logger.info(f"[AnalysisLog:{self.analysis_id}] Completed in {duration_ms}ms, "
                   f"{self.total_llm_calls} LLM calls, "
                   f"{result['summary']['total_tokens']} tokens")
        
        return result


def set_current_logger(log: Optional[AnalysisLogger]):
    """设置当前线程的分析日志器"""
    _current_logger.instance = log


def get_current_logger() -> Optional[AnalysisLogger]:
    """获取当前线程的分析日志器"""
    return getattr(_current_logger, 'instance', None)


def clear_current_logger():
    """清除当前线程的分析日志器"""
    if hasattr(_current_logger, 'instance'):
        delattr(_current_logger, 'instance')
