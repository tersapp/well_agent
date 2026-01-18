from typing import Dict, Any, List, Optional
from backend.agents.base_agent import BaseAgent
from backend.agents.agent_loader import build_team_description, get_specialist_agents
import json
import logging

logger = logging.getLogger(__name__)

class ArbitratorAgent(BaseAgent):
    """
    The Chief Petrophysicist (Arbitrator). 
    Dynamically aware of all team members via agent_loader.
    Can dispatch to any specialist agent by outputting next_agent.
    """
    
    def __init__(self):
        super().__init__(
            name="Arbitrator",
            role_description="""You are the Chief Interpreting Engineer (首席解释工程师).
            You coordinate a team of specialist experts to analyze well log data.
            Your team roster is dynamically provided in each analysis request.
            """
        )
    
    def _build_prompt(self, context: str) -> str:
        """Build the arbitrator prompt with dynamic team description."""
        team_desc = build_team_description()
        specialist_keys = list(get_specialist_agents().keys())
        
        return f"""
你是首席解释工程师 (Arbitrator)，负责协调团队完成测井解释任务。

## 你的团队成员:
{team_desc}

## 当前讨论记录:
{context}

## 你的任务:
1. **综合分析**: 审阅所有已参与专家的分析结果
2. **信息评估**: 判断是否还缺少关键信息来回答用户问题
3. **智能调度**: 如果需要更多信息，指定下一个专家来分析
4. **最终决策**: 如果信息充分，给出最终结论

## 输出规则:
- 如果信息**不充分**，设置 `status: "NEED_MORE_INFO"` 并指定 `next_agent`
- 如果信息**充分**，设置 `status: "FINAL"` 并给出 `decision`
- `next_agent` 必须是以下之一: {specialist_keys}
- 所有文本字段必须使用 **中文**

## 输出格式 (严格JSON):
{{
    "status": "FINAL" | "NEED_MORE_INFO",
    "next_agent": "AgentKey 或 null",
    "question_for_agent": "向该专家提出的具体问题 或 null",
    "decision": "最终结论 (仅当 status=FINAL 时)",
    "confidence": 0.0-1.0,
    "reasoning": "你的思考过程 (中文)"
}}

请仅返回JSON，不要包含其他文字。
"""

    def analyze(self, data: Dict[str, Any], context: Optional[str] = None) -> Dict[str, Any]:
        """
        Arbitrate the discussion with dynamic team awareness.
        """
        prompt = self._build_prompt(context or "")
        
        response_text = self.think(prompt)
        
        try:
            result = self.parse_json_response(response_text)
            
            # Normalize status for backward compatibility
            status = result.get('status', 'FINAL')
            if status == 'NEED_MORE_INFO':
                result['status'] = 'DISCUSSION'  # Keep compatibility with workflow
            
            # Ensure next_agent is valid
            next_agent = result.get('next_agent')
            if next_agent:
                valid_agents = get_specialist_agents()
                if next_agent not in valid_agents:
                    logger.warning(f"Invalid next_agent: {next_agent}, clearing")
                    result['next_agent'] = None
            
            return result
            
        except ValueError:
            return {
                "status": "ERROR",
                "decision": "解析错误",
                "confidence": 0.0,
                "next_agent": None,
                "question_for_agent": None,
                "reasoning": "LLM输出格式解析失败",
                "raw_output": response_text if 'response_text' in locals() else "No response"
            }

