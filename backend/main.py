import os
import sys
import logging
from backend.data_processing.las_parser import LogDataParser
from backend.core.workflow import app
from backend.core.llm_service import llm_service

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("WellAgentSystem")

def main():
    logger.info("Initializing Well Logging Multi-Agent System (Phase 2)...")
    
    # 1. Load Data
    file_path = "test_data/sample.las"
    if not os.path.exists(file_path):
        logger.error(f"Test file not found: {file_path}")
        return

    try:
        log_data = LogDataParser.parse_las_file(file_path)
        logger.info("LAS file parsed successfully.")
    except Exception as e:
        logger.error(f"Failed to parse LAS: {e}")
        return

    # 2. Check LLM Status
    if not llm_service.client:
        logger.warning("ZHIPU_API_KEY not set. Workflow will run but agents will return error/mock messages.")

    # 3. Initialize State
    initial_state = {
        "input_data": log_data,
        "discussion_history": [],
        "lithology_result": None,
        "electrical_result": None,
        "final_output": None,
        "round_count": 0
    }
    
    logger.info("Starting Multi-Agent Workflow...")
    
    try:
        # Run the LangGraph application
        final_state = app.invoke(initial_state)
        
        print("\n=== Workflow Execution Finished ===")
        print("Discussion History:")
        for msg in final_state["discussion_history"]:
            print(f"- {msg}")
            
        print("\nFinal Decision:")
        print(final_state["final_output"])
        
    except Exception as e:
        logger.error(f"Workflow execution failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
