"""
Dynamic Multi-Agent Workflow

This module implements a flexible workflow where:
1. Router dispatches to the first specialist based on query keywords
2. Each specialist goes to Arbitrator
3. Arbitrator can dispatch to ANY specialist via next_agent
4. When Arbitrator outputs FINAL, workflow ends

Graph Topology:
    [Router] --> [Dynamic Specialist] --> [Arbitrator] 
                        ^                      |
                        |                      v
                        +--- [Dispatcher] <----+
                                               |
                                               v
                                             [END]
"""

from typing import TypedDict, Annotated, List, Dict, Any, Optional
import operator
import logging
import re
from langgraph.graph import StateGraph, END

from backend.agents.agent_loader import (
    load_agents, 
    get_agent_instance, 
    get_router_keywords,
    get_specialist_agents
)
from backend.db.checkpointer import MongoDBSaver

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """State shared across all nodes in the workflow."""
    # Input data for analysis
    input_data: Dict[str, Any]
    
    # Conversation history (accumulates via operator.add)
    discussion_history: Annotated[List[str], operator.add]
    
    # Results from each specialist (keyed by agent key)
    agent_results: Dict[str, Dict[str, Any]]
    
    # Router's initial decision
    router_decision: Optional[str]
    
    # Arbitrator's output (including next_agent)
    arbitrator_output: Optional[Dict[str, Any]]
    
    # Final decision
    final_output: Optional[Dict[str, Any]]
    
    # Loop counter
    round_count: int
    
    # Analysis log for tracking agent/skill invocations
    analysis_log: Optional[Dict[str, Any]]


# --- Node Functions ---

def sanitize_history_text(history: List[str]) -> str:
    """
    Joins history and removes heavy data blocks (like ECharts JSON) to save tokens.
    """
    full_text = "\n".join(history)
    # Regex to find ```echarts ... ``` blocks and replace content
    # Use re.DOTALL to match newlines
    sanitized = re.sub(
        r'```echarts\n.*?\n```', 
        '[Chart Data Generated - Details Omitted for Token Optimization]', 
        full_text, 
        flags=re.DOTALL
    )
    return sanitized


def router_node(state: AgentState) -> Dict[str, Any]:
    """
    Decides which specialist should be the 'First Responder' based on query keywords.
    Uses dynamic keyword mappings from agent registry.
    """
    from backend.core.analysis_logger import get_current_logger
    
    logger.info("--- Router Node ---")
    
    # Log node start
    analysis_log = get_current_logger()
    if analysis_log:
        analysis_log.start_node("router")
    
    # Find the latest user message for routing
    query = ""
    if state["discussion_history"]:
        # Search backwards for the most recent user input
        for msg in reversed(state["discussion_history"]):
            if msg.startswith("User Note:") or msg.startswith("User Follow-up:"):
                # Remove prefix for keyword matching
                query = msg.split(":", 1)[1].strip()
                break
        
        # Fallback to first message if no explicit user tag found (shouldn't happen)
        if not query:
            query = state["discussion_history"][0]
    query_lower = query.lower()
    
    # Get keyword mappings from registry
    keyword_map = get_router_keywords()
    
    target = "LithologyExpert"  # Default
    
    # Check keywords in priority order (more specific first)
    # Priority: Reservoir > MudLogging > Mineralogy > Saturation > Electrical > Lithology
    priority_order = [
        "ReservoirPropertyExpert",
        "MudLoggingExpert", 
        "MineralogyExpert",
        "SaturationExpert",
        "ElectricalExpert",
        "LithologyExpert"
    ]
    
    for agent_key in priority_order:
        keywords = keyword_map.get(agent_key, [])
        if any(k.lower() in query_lower for k in keywords):
            target = agent_key
            break
    
    # Log router decision
    if analysis_log:
        analysis_log.log_router_decision(target)
    
    logger.info(f"Router Decision: {target}")
    return {"router_decision": target}


def specialist_node(state: AgentState) -> Dict[str, Any]:
    # ... (imports unchanged)
    from backend.agents.skill_loader import build_agent_context
    from backend.agents.agent_loader import get_agent_skills
    from backend.core.analysis_logger import get_current_logger
    
    # ... (determine agent unchanged)
    arb_output = state.get("arbitrator_output")
    
    if arb_output and arb_output.get("next_agent"):
        agent_key = arb_output["next_agent"]
        question = arb_output.get("question_for_agent", "")
        logger.info(f"--- Specialist Node (Dispatched: {agent_key}) ---")
    else:
        agent_key = state.get("router_decision", "LithologyExpert")
        question = ""
        logger.info(f"--- Specialist Node (Routed: {agent_key}) ---")
    
    # Get agent instance (unchanged)
    agent = get_agent_instance(agent_key)
    if not agent:
        logger.error(f"Agent not found: {agent_key}")
        return {
            "discussion_history": [f"Error: Agent {agent_key} not found"],
            "agent_results": state.get("agent_results", {})
        }
    
    # Get agent display name (unchanged)
    agent_name = get_specialist_agents().get(agent_key, {}).get('name', agent_key)
    
    # Log node start (unchanged)
    analysis_log = get_current_logger()
    if analysis_log:
        analysis_log.start_node("specialist", agent_key=agent_key, agent_name=agent_name)
    
    # Build context (unchanged)
    agent_skills = get_agent_skills(agent_key)
    
    # Log skills (unchanged)
    if analysis_log:
        for skill in agent_skills:
            analysis_log.log_skill_loaded(skill)
    
    skills_context = build_agent_context(agent_skills)
    
    # Combine: skills context + SANITIZED discussion history + question
    discussion_sanitized = sanitize_history_text(state.get("discussion_history", []))
    
    full_context = f"{skills_context}\n\n## 分析讨论\n{discussion_sanitized}"
    if question:
        full_context += f"\n\nArbitrator Question: {question}"
    
    # Run analysis
    result = agent.analyze(state["input_data"], full_context)
    
    # ... (rest of function unchanged)
    confidence = result.get('confidence', 0.0)
    if analysis_log:
        analysis_log.log_confidence(confidence)
    
    # Format message
    reasoning = result.get('reasoning', str(result))
    msg = f"{agent_key}: Conf={confidence}. {reasoning}"
    
    # Update agent_results
    agent_results = state.get("agent_results", {}).copy()
    agent_results[agent_key] = result
    
    return {
        "discussion_history": [msg],
        "agent_results": agent_results,
        "arbitrator_output": None  # Clear for next round
    }


def arbitrator_node(state: AgentState) -> Dict[str, Any]:
    """
    Orchestrates the discussion and decides next steps or final conclusion.
    """
    from backend.core.analysis_logger import get_current_logger
    
    logger.info("--- Arbitrator Node ---")
    
    # Log node start
    analysis_log = get_current_logger()
    if analysis_log:
        analysis_log.start_node("arbitrator", agent_key="Arbitrator", agent_name="仲裁者")
    
    arb = get_agent_instance("Arbitrator")
    if not arb:
        logger.error("Arbitrator not found!")
        return {"final_output": {"status": "ERROR", "decision": "Arbitrator not found"}}
    
    # Use SANITIZED history
    context = sanitize_history_text(state["discussion_history"])
    result = arb.analyze(state["input_data"], context)
    
    # ... (rest unchanged)
    
    # Format message
    confidence = result.get('confidence', 0.0)
    status = result.get('status', 'UNKNOWN')
    decision = result.get('decision', '')
    reasoning = result.get('reasoning', '')
    next_agent = result.get('next_agent')
    question = result.get('question_for_agent', '')
    
    # Log confidence
    if analysis_log:
        analysis_log.log_confidence(confidence)
    
    msg = f"Arbitrator: Status={status}. Decision={decision} (Conf: {confidence}). {reasoning}"
    if next_agent:
        msg += f"\n-> Dispatching to: {next_agent}"
        if question:
            msg += f" with question: {question}"
    
    # Finalize log if this is the final decision
    finalized_log = None
    if status == "FINAL" and analysis_log:
        finalized_log = analysis_log.finalize()
    
    return_dict = {
        "arbitrator_output": result,
        "final_output": result if status == "FINAL" else None,
        "discussion_history": [msg],
        "round_count": state["round_count"] + 1
    }
    
    # Include finalized log in state if available
    if finalized_log:
        return_dict["analysis_log"] = finalized_log
    
    return return_dict


# --- Conditional Logic ---

def should_continue(state: AgentState) -> str:
    """Decide whether to continue or end the workflow."""
    arb_output = state.get("arbitrator_output", {})
    round_count = state.get("round_count", 0)
    
    # End if FINAL status
    if arb_output and arb_output.get("status") == "FINAL":
        return "end"
    
    # End if max rounds reached
    if round_count >= 5:
        logger.warning("Max rounds reached, forcing end.")
        return "end"
    
    # Continue if there's a next_agent dispatch
    if arb_output and arb_output.get("next_agent"):
        return "dispatch"
    
    # Default: end
    return "end"


def router_edge(state: AgentState) -> str:
    """Edge function after router - always go to specialist."""
    return "specialist"


# --- Graph Construction ---

def build_workflow(checkpointer=None):
    """Build and compile the workflow graph."""
    
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("router", router_node)
    workflow.add_node("specialist", specialist_node)
    workflow.add_node("arbitrator", arbitrator_node)
    
    # Set entry point
    workflow.set_entry_point("router")
    
    # Router -> Specialist
    workflow.add_edge("router", "specialist")
    
    # Specialist -> Arbitrator
    workflow.add_edge("specialist", "arbitrator")
    
    # Arbitrator -> Conditional (dispatch or end)
    workflow.add_conditional_edges(
        "arbitrator",
        should_continue,
        {
            "dispatch": "specialist",  # Loop back to specialist
            "end": END
        }
    )
    
    return workflow.compile(checkpointer=checkpointer)


# Compile the workflow with MongoDB checkpointer
checkpointer = MongoDBSaver()
app = build_workflow(checkpointer=checkpointer)


def create_initial_state(input_data: Dict[str, Any], user_question: str = "") -> AgentState:
    """Helper to create initial state for workflow execution."""
    discussion_history = []
    if user_question:
        discussion_history.append(f"User Note: {user_question}")
    
    return {
        "input_data": input_data,
        "discussion_history": discussion_history,
        "agent_results": {},
        "router_decision": None,
        "arbitrator_output": None,
        "final_output": None,
        "round_count": 0,
        "analysis_log": None
    }
