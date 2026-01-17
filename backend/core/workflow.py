from typing import TypedDict, Annotated, List, Dict, Any, Optional
import operator
import logging
from langgraph.graph import StateGraph, END
from backend.agents.lithology_agent import LithologyAgent
from backend.agents.electrical_agent import ElectricalAgent
from backend.agents.arbitrator_agent import ArbitratorAgent

logger = logging.getLogger(__name__)

# Define the state of our multi-agent graph
class AgentState(TypedDict):
    # The raw log data for the current depth point/interval
    input_data: Dict[str, Any]
    
    # Conversation history (could be used for context)
    discussion_history: Annotated[List[str], operator.add]
    
    # Structured outputs from agents
    lithology_result: Optional[Dict[str, Any]]
    electrical_result: Optional[Dict[str, Any]]
    
    # Final decision from arbitrator
    final_output: Optional[Dict[str, Any]]
    
    # Loop counter
    round_count: int

# Initialize Agents
litho_agent = LithologyAgent()
elec_agent = ElectricalAgent()
arb_agent = ArbitratorAgent()

# --- Node Functions ---

def lithology_node(state: AgentState):
    logger.info("--- Lithology Node ---")
    data = state["input_data"]
    # Pass discussion history as context
    context = "\n".join(state["discussion_history"])
    
    result = litho_agent.analyze(data, context)
    
    # Log the result to history
    msg = f"LithologyExpert: {result.get('lithology')} (Conf: {result.get('confidence')}). Reason: {result.get('reasoning')}"
    
    return {
        "lithology_result": result,
        "discussion_history": [msg]
    }

def electrical_node(state: AgentState):
    logger.info("--- Electrical Node ---")
    data = state["input_data"]
    # Electrical often needs lithology context
    context = "\n".join(state.get("discussion_history", []))
    
    result = elec_agent.analyze(data, context)
    
    msg = f"ElectricalExpert: {result.get('fluid_type')} (Conf: {result.get('confidence')}). Reason: {result.get('reasoning')}"
    
    return {
        "electrical_result": result,
        "discussion_history": [msg]
    }

def arbitrator_node(state: AgentState):
    logger.info("--- Arbitrator Node ---")
    context = "\n".join(state["discussion_history"])
    
    # Arbitrator doesn't look at raw data directly in this simplified flow, 
    # but relies on the experts' analysis + context.
    # In a real system, it might verify raw data too.
    result = arb_agent.analyze(state["input_data"], context)
    
    msg = f"Arbitrator: Status={result.get('status')}. Decision={result.get('decision')}. reasoning={result.get('reasoning')}"
    if result.get('question'):
        msg += f"\nArbitrator Question: {result.get('question')}"
        
    return {
        "final_output": result,
        "discussion_history": [msg],
        "round_count": state["round_count"] + 1
    }

# --- Conditional Logic ---

def should_continue(state: AgentState):
    result = state["final_output"]
    round_count = state["round_count"]
    
    if result and result.get("status") == "FINAL":
        return "end"
    
    if round_count >= 3: # Max 3 rounds
        logger.warning("Max rounds reached, forcing end.")
        return "end"
        
    return "continue"

# --- Graph Construction ---

workflow = StateGraph(AgentState)

workflow.add_node("lithology", lithology_node)
workflow.add_node("electrical", electrical_node)
workflow.add_node("arbitrator", arbitrator_node)

# Flow: Lithology -> Electrical -> Arbitrator
# In a more complex setup, Lithology and Electrical could run in parallel.
# LangGraph allows parallel execution if nodes don't depend on each other's output in the same step.
# Here, Electrical might benefit from knowing Lithology, so we keep it sequential for now.

workflow.set_entry_point("lithology")
workflow.add_edge("lithology", "electrical")
workflow.add_edge("electrical", "arbitrator")

workflow.add_conditional_edges(
    "arbitrator",
    should_continue,
    {
        "continue": "lithology",
        "end": END
    }
)

# Compile
app = workflow.compile()
