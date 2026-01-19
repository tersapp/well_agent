from typing import Dict, Any, List, Optional
from backend.agents.base_agent import BaseAgent
from backend.agents.agent_loader import (
    build_team_description, 
    build_team_description_with_tools,
    get_specialist_agents
)
import json
import logging

logger = logging.getLogger(__name__)


class ArbitratorAgent(BaseAgent):
    """
    The Chief Petrophysicist (Arbitrator). 
    Dynamically aware of all team members and their tools via agent_loader.
    Can dispatch to any specialist agent with tool-aware routing.
    """
    
    def __init__(self):
        super().__init__(
            name="Arbitrator",
            role_description="""You are the Chief Interpreting Engineer (首席解释工程师).
            You coordinate a team of specialist experts to analyze well log data.
            Your team roster is dynamically provided in each analysis request.
            """
        )
    
    def _match_tools_to_question(self, user_question: str) -> Dict[str, List[str]]:
        """
        Find which agents have tools that match the user's question.
        
        Returns:
            Dict mapping agent_key to list of matched tool names
        """
        from backend.skills.registry import get_skill_registry
        registry = get_skill_registry()
        
        specialists = get_specialist_agents()
        matches = {}
        
        for key, info in specialists.items():
            skill_packs = info.get('skill_packs', [])
            matched_tools = registry.match_tools_by_keywords(user_question, skill_packs)
            if matched_tools:
                matches[key] = [t['name'] for t in matched_tools]
        
        return matches
    
    def _build_prompt(self, context: str, user_question: str = None) -> str:
        """Build the arbitrator prompt with dynamic team and tool description."""
        team_desc = build_team_description_with_tools()
        specialist_keys = list(get_specialist_agents().keys())
        
        # Tool-based routing recommendation
        tool_recommendation = ""
        if user_question:
            matches = self._match_tools_to_question(user_question)
            if matches:
                tool_recommendation = "## ⭐ 工具匹配建议 (基于用户问题关键词)\n"
                for agent_key, tool_names in matches.items():
                    tool_recommendation += f"- **{agent_key}** 有工具 `{', '.join(tool_names)}` 可回答此问题\n"
                tool_recommendation += "\n> 请**优先调度**拥有匹配工具的专家！\n"
        
        return f"""
你是首席解释工程师 (Arbitrator)，负责协调团队完成测井解释任务。

## 你的团队成员 (含工具信息):
{team_desc}

{tool_recommendation}

## 当前讨论记录:
{context}

## 你的任务:
1. **综合分析**: 审阅所有已参与专家的分析结果
2. **信息评估**: 判断是否还缺少关键信息来回答用户问题
3. **智能调度**: 
   - 如果检测到匹配的工具，**优先调度**拥有该工具的专家
   - 如果专家声称"缺乏数据"但其拥有相关工具，要求其使用工具
4. **最终决策**: 如果信息充分，给出最终结论

## 调度规则 (重要!):
1. 如果上方有"⭐工具匹配建议"，**必须优先**调度推荐的专家
2. 如果专家说"超出专业范围"或"缺乏数据"，但其拥有相关工具，**要求其再次分析并使用工具**
3. 避免重复调度同一专家超过2次

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
        Arbitrate the discussion with dynamic team and tool awareness.
        """
        # Extract user question from context if available
        user_question = None
        if context:
            # Try to find user question in context
            for line in context.split('\n'):
                if 'User Note:' in line or '重点:' in line or '用户问题:' in line:
                    user_question = line
                    break
            # Also check for specific keywords
            if not user_question:
                user_question = context  # Use full context as fallback
        
        prompt = self._build_prompt(context or "", user_question)
        
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
                    
            # Enforce confidence is float
            try:
                result['confidence'] = float(result.get('confidence', 0.0))
            except (ValueError, TypeError):
                logger.warning(f"Failed to parse confidence: {result.get('confidence')}")
                result['confidence'] = 0.0
            
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
