import os
import sys
import json
import logging
import asyncio
from typing import Optional, List, Dict
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backend.data_processing.las_parser import LogDataParser
from backend.data_processing.quality_control import DataQualityController
from backend.core.workflow import app as workflow_app
from backend.core.serialize_utils import convert_numpy_types

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Well Agent API",
    description="API for Well Logging Multi-Agent System",
    version="1.1.0"
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalysisRequest(BaseModel):
    start_depth: float
    end_depth: float
    focus_note: Optional[str] = None

class AnalysisResponse(BaseModel):
    status: str
    messages: list
    final_decision: Optional[dict] = None

# Store parsed data in memory (simple approach for demo)
parsed_data_store = {}

@app.get("/")
async def root():
    return {"message": "Well Agent API is running", "version": "1.0.0"}

@app.post("/api/parse-las")
async def parse_las_file(file: UploadFile = File(...)):
    """Parse an uploaded LAS file and return structured data with curve mapping."""
    if not file.filename.lower().endswith('.las'):
        raise HTTPException(status_code=400, detail="File must be a .las file")
    
    try:
        # Save temp file
        temp_path = f"temp_{file.filename}"
        content = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(content)
        
        # Parse
        log_data = LogDataParser.parse_las_file(temp_path)
        
        # QC
        qc = DataQualityController(log_data)
        qc_report = qc.perform_quality_checks()
        
        # Cleanup
        os.remove(temp_path)
        
        # Store for later analysis
        session_id = file.filename
        parsed_data_store[session_id] = log_data
        
        # Curve mapping
        from backend.core.curve_mapper import get_curve_mapper
        mapper = get_curve_mapper()
        curve_names = list(log_data.get('curves', {}).keys())
        curve_info = log_data.get('curve_info', {})
        mapping_result = mapper.map_curves(curve_names, curve_info)
        
        return convert_numpy_types({
            "success": True,
            "session_id": session_id,
            "data": log_data,
            "qc_report": qc_report,
            "curve_mapping": mapping_result
        })
        
    except Exception as e:
        logger.error(f"Failed to parse LAS: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Curve Mapping Endpoints ---

class CurveMappingSaveRequest(BaseModel):
    mappings: Dict[str, str]  # {original_name: standard_type}

@app.post("/api/suggest-curve-mapping")
async def suggest_curve_mapping(session_id: str = Query(default="")):
    """Use LLM to suggest mappings for unmapped curves."""
    try:
        from backend.core.curve_mapper import get_curve_mapper, suggest_curve_mapping_with_llm
        
        log_data = parsed_data_store.get(session_id)
        if not log_data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        mapper = get_curve_mapper()
        curve_names = list(log_data.get('curves', {}).keys())
        curve_info = log_data.get('curve_info', {})
        mapping_result = mapper.map_curves(curve_names, curve_info)
        
        unmapped = mapping_result.get("unmatched", [])
        if not unmapped:
            return {"success": True, "suggestions": {}}
        
        # Get LLM suggestions
        suggestions = await suggest_curve_mapping_with_llm(
            unmapped,
            mapping_result.get("curve_details", {}),
            mapper.get_standard_types()
        )
        
        return {"success": True, "suggestions": suggestions}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get LLM suggestions: {e}")
        return {"success": False, "suggestions": {}, "error": str(e)}


@app.post("/api/save-curve-mapping")
async def save_curve_mapping(request: CurveMappingSaveRequest):
    """Save user-confirmed curve mappings to the dictionary."""
    try:
        from backend.core.curve_mapper import get_curve_mapper
        
        mapper = get_curve_mapper()
        saved = []
        failed = []
        
        for original, standard in request.mappings.items():
            if mapper.save_user_mapping(original, standard):
                saved.append(original)
            else:
                failed.append(original)
        
        return {
            "success": len(failed) == 0,
            "saved": saved,
            "failed": failed
        }
        
    except Exception as e:
        logger.error(f"Failed to save mappings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/curve-standard-types")
async def get_curve_standard_types():
    """Get all available standard curve types."""
    try:
        from backend.core.curve_mapper import get_curve_mapper
        mapper = get_curve_mapper()
        return {
            "success": True,
            "standard_types": mapper.get_standard_types()
        }
    except Exception as e:
        logger.error(f"Failed to get standard types: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def extract_depth_range_data(log_data: dict, start_depth: float, end_depth: float) -> dict:
    """
    Extract a subset of log data for the specified depth range.
    Returns a new log_data dict with only data within [start_depth, end_depth].
    Handles single-point requests by finding nearest point and providing context.
    """
    curves = log_data.get('curves', {})
    
    # Find the depth column (could be 'DEPT', 'DEPTH', or the DataFrame index name)
    depth_key = None
    for key in ['DEPT', 'DEPTH', 'MD', 'TVD']:
        if key in curves:
            depth_key = key
            break
    
    if not depth_key:
        # If no standard depth column, use the first column as depth
        depth_key = list(curves.keys())[0] if curves else None
    
    if not depth_key:
        logger.warning("No depth column found in curves")
        return log_data
    
    depth_values = curves[depth_key]
    
    # strict range check first
    indices = []
    for i, d in enumerate(depth_values):
        if d is not None and start_depth <= d <= end_depth:
            indices.append(i)
    
    # NEW FIX FOR SINGLE POINT OR NEAR-MISSES
    if not indices and depth_values:
        # Find index of the nearest point
        # Filter out Nones first to avoid comparison errors
        valid_points = [(i, d) for i, d in enumerate(depth_values) if d is not None]
        if valid_points:
            nearest_idx, nearest_val = min(valid_points, key=lambda x: abs(x[1] - start_depth))
            
            # If start_depth and end_depth are very close (point selection)
            # OR if we found no points in the strict range
            is_point_selection = abs(end_depth - start_depth) < 0.001
            
            if is_point_selection:
                # For point inspection, provide a small window for context (e.g. ±10 points)
                window_size = 10
                start_i = max(0, nearest_idx - window_size)
                end_i = min(len(depth_values), nearest_idx + window_size + 1)
                indices = list(range(start_i, end_i))
                logger.info(f"Point analysis at {start_depth}m: providing context window of {len(indices)} points (Depth: {depth_values[start_i]:.2f}-{depth_values[end_i-1]:.2f}m).")
            else:
                # For a range that just missed all points (e.g. inside a gap), at least return the nearest one
                # to prevent "No data" errors, though usually ranges should catch something.
                indices = [nearest_idx]
                logger.info(f"Range analysis {start_depth}-{end_depth}m: no exact matches, using nearest point at {nearest_val}m.")
    
    if not indices:
        logger.warning(f"No data found in depth range {start_depth}-{end_depth} and no nearest point found.")
        return {'curves': {}, 'metadata': log_data.get('metadata', {}), 'curve_info': log_data.get('curve_info', {})}
    
    # Slice all curves
    sliced_curves = {}
    for key, values in curves.items():
        sliced_curves[key] = [values[i] for i in indices if i < len(values)]
    
    return {
        'curves': sliced_curves,
        'metadata': log_data.get('metadata', {}),
        'curve_info': log_data.get('curve_info', {})
    }


def format_workflow_result(result: dict) -> dict:
    """
    Convert LangGraph workflow output to frontend-friendly format.
    """
    messages = []
    
    # Parse discussion_history into structured messages
    history = result.get('discussion_history', [])
    for msg in history:
        # Parse agent name and content from the formatted string
        # Expected format: "AgentName: Content (Conf: X.XX). Reason: ..."
        if ':' in msg:
            parts = msg.split(':', 1)
            agent_name = parts[0].strip()
            content = parts[1].strip() if len(parts) > 1 else ""
            
            # Extract confidence if present (handles multiple formats)
            confidence = 0.0
            # Format 1: "Conf=0.75"
            if 'Conf=' in content:
                try:
                    import re
                    match = re.search(r'Conf=(\d+\.?\d*)', content)
                    if match:
                        confidence = float(match.group(1))
                        logger.info(f"DEBUG: Extracted confidence {confidence} from 'Conf=' format in message from {agent_name}")
                except Exception as e:
                    logger.warning(f"DEBUG: Failed to parse Conf= format: {e}")
            # Format 2: "(Conf: 0.75)"
            elif '(Conf:' in content:
                try:
                    conf_start = content.index('(Conf:') + 6
                    conf_end = content.index(')', conf_start)
                    confidence = float(content[conf_start:conf_end].strip())
                    logger.info(f"DEBUG: Extracted confidence {confidence} from '(Conf:' format in message from {agent_name}")
                except Exception as e:
                    logger.warning(f"DEBUG: Failed to parse (Conf: format: {e}")
            
            logger.info(f"DEBUG: Message from {agent_name} final confidence: {confidence}")
            
            messages.append({
                "agent": agent_name,
                "content": content,
                "confidence": confidence,
                "is_final": agent_name == "Arbitrator" and "FINAL" in msg
            })
        else:
            messages.append({
                "agent": "System",
                "content": msg,
                "confidence": 0.0,
                "is_final": False
            })
    
    # Extract final decision
    final_output = result.get('final_output', {})
    final_decision = None
    if final_output:
        final_decision = {
            "status": final_output.get("status", "UNKNOWN"),
            "decision": final_output.get("decision", "N/A"),
            "confidence": 0.0,
            "reasoning": final_output.get("reasoning", "")
        }
        
        # Safely parse confidence
        try:
            final_decision["confidence"] = float(final_output.get("confidence", 0.0))
        except (ValueError, TypeError):
             final_decision["confidence"] = 0.0
    
    return {
        "success": True,
        "messages": messages,
        "final_decision": final_decision
    }


@app.post("/api/analyze")
async def run_analysis(request: AnalysisRequest, session_id: str = Query(default="default")):
    """Run multi-agent analysis on the specified depth range."""
    try:
        # Get stored data
        log_data = parsed_data_store.get(session_id)
        
        if not log_data:
            logger.warning(f"No data found for session '{session_id}', using mock response")
            # Return mock analysis for demo if no real data
            return {
                "success": True,
                "messages": [
                    {
                        "agent": "LithologyExpert",
                        "content": f"针对 {request.start_depth}-{request.end_depth}m 层段分析：GR 均值约 52 API，指示该层段为砂岩储层。",
                        "confidence": 0.85,
                        "is_final": False
                    },
                    {
                        "agent": "ElectricalExpert", 
                        "content": f"电阻率 RT 约 18 Ω·m，结合岩性为砂岩，判断为含油层。",
                        "confidence": 0.78,
                        "is_final": False
                    },
                    {
                        "agent": "Arbitrator",
                        "content": f"综合分析 {request.start_depth}-{request.end_depth}m 层段：判定为油层，置信度 0.82",
                        "confidence": 0.82,
                        "is_final": True
                    }
                ],
                "final_decision": {
                    "decision": "Oil Layer",
                    "confidence": 0.82,
                    "depth_range": f"{request.start_depth}-{request.end_depth}m"
                }
            }
        
        logger.info(f"Running analysis for session '{session_id}', depth range: {request.start_depth}-{request.end_depth}m")
        
        # Extract data for the requested depth range
        sliced_data = extract_depth_range_data(log_data, request.start_depth, request.end_depth)
        
        # Initialize analysis logger for tracking
        from backend.core.analysis_logger import AnalysisLogger, set_current_logger, clear_current_logger
        analysis_logger = AnalysisLogger(depth_range={"start": request.start_depth, "end": request.end_depth})
        set_current_logger(analysis_logger)
        
        try:
            # Prepare initial state for LangGraph (new schema)
            initial_state = {
                "input_data": sliced_data,
                "discussion_history": [],
                "agent_results": {},
                "router_decision": None,
                "arbitrator_output": None,
                "final_output": None,
                "round_count": 0,
                "analysis_log": None
            }
            
            # Add focus note to context if provided
            if request.focus_note:
                initial_state["discussion_history"] = [f"User Note: {request.focus_note}"]
            
            # Run the workflow
            logger.info("Invoking multi-agent workflow...")
            result = workflow_app.invoke(initial_state)
            logger.info("Workflow completed")
            
            # Format result for frontend
            formatted = format_workflow_result(result)
            
            # Add depth range info to final decision
            if formatted.get("final_decision"):
                formatted["final_decision"]["depth_range"] = f"{request.start_depth}-{request.end_depth}m"
            
            # Include analysis log in response
            formatted["analysis_log"] = result.get("analysis_log")
            
        finally:
            # Always clear logger after workflow completes
            clear_current_logger()
        
        # Auto-save conversation to MongoDB (fire-and-forget, don't block response)
        try:
            from backend.db.conversation_service import ConversationService
            from backend.db.mongodb import check_connection
            from datetime import datetime
            import asyncio
            
            # Extract well name from session_id (e.g., "nb31-1-1s_wire.las" -> "NB31-1-1S")
            well_name = session_id.split('.')[0].upper().replace('_WIRE', '').replace('_', '-') if session_id else "Unknown"
            
            conversation_doc = {
                "session_id": session_id,
                "well_name": well_name,
                "timestamp": datetime.utcnow(),
                "depth_range": {
                    "start": request.start_depth,
                    "end": request.end_depth
                },
                "user_question": request.focus_note or "深度段分析",
                "messages": formatted.get("messages", []),
                "final_decision": formatted.get("final_decision"),
                "analysis_log": formatted.get("analysis_log")  # Also save log to MongoDB
            }
            
            # Create background task to save (non-blocking)
            async def save_conversation():
                try:
                    if await check_connection():
                        conv_id = await ConversationService.create(conversation_doc)
                        logger.info(f"Conversation saved with ID: {conv_id}")
                    else:
                        logger.debug("MongoDB not available, skipping conversation save")
                except Exception as e:
                    logger.debug(f"Background save failed: {e}")
            
            asyncio.create_task(save_conversation())
            
        except Exception as save_error:
            logger.debug(f"Failed to setup conversation save: {save_error}")
            # Don't fail the request if save setup fails
        
        return convert_numpy_types(formatted)
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status")
async def get_status():
    """Get API server status."""
    return {
        "status": "running",
        "sessions": list(parsed_data_store.keys())
    }


# --- Conversation History Endpoints ---

@app.get("/api/conversations")
async def list_conversations(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    well_name: Optional[str] = None,
    search: Optional[str] = None
):
    """List conversation history with pagination and filters."""
    try:
        from backend.db.conversation_service import ConversationService
        from backend.db.mongodb import check_connection
        
        # Check if MongoDB is available
        if not await check_connection():
            return {
                "success": True,
                "data": [],
                "total": 0,
                "skip": skip,
                "limit": limit,
                "mongodb_available": False
            }
        
        conversations = await ConversationService.list_conversations(
            skip=skip,
            limit=limit,
            well_name=well_name,
            search_query=search
        )
        
        total = await ConversationService.count_conversations(
            well_name=well_name,
            search_query=search
        )
        
        return {
            "success": True,
            "data": conversations,
            "total": total,
            "skip": skip,
            "limit": limit,
            "mongodb_available": True
        }
    except Exception as e:
        logger.error(f"Failed to list conversations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Get a single conversation by ID."""
    try:
        from backend.db.conversation_service import ConversationService
        
        conversation = await ConversationService.get_by_id(conversation_id)
        
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return {
            "success": True,
            "data": conversation
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation by ID."""
    try:
        from backend.db.conversation_service import ConversationService
        
        deleted = await ConversationService.delete(conversation_id)
        
        if not deleted:
            raise HTTPException(status_code=404, detail="Conversation not found")
        
        return {
            "success": True,
            "message": "Conversation deleted"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete conversation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents")
async def get_agents():
    """Get list of all registered agents for frontend display."""
    try:
        from backend.agents.agent_loader import get_frontend_agent_list
        agents = get_frontend_agent_list()
        return {
            "success": True,
            "agents": agents
        }
    except Exception as e:
        logger.error(f"Failed to get agents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analyze/stream")
async def analyze_stream(request: AnalysisRequest, session_id: str = Query(...)):
    """
    SSE endpoint for streaming analysis results.
    Each agent's output is pushed as an event as soon as it completes.
    """
    # Validate session
    if session_id not in parsed_data_store:
        raise HTTPException(status_code=400, detail="Session not found. Please upload a LAS file first.")
    
    log_data = parsed_data_store[session_id]
    sliced_data = extract_depth_range_data(log_data, request.start_depth, request.end_depth)
    
    # Initial state for workflow
    initial_state = {
        "input_data": sliced_data,
        "discussion_history": [f"User Note: {request.focus_note}"] if request.focus_note else [],
        "agent_results": {},
        "router_decision": None,
        "arbitrator_output": None,
        "final_output": None,
        "round_count": 0
    }
    
    async def event_generator():
        """Generator that yields SSE events as workflow progresses."""
        try:
            # Use astream to get intermediate steps
            async for event in workflow_app.astream(initial_state):
                # event is a dict with node_name: node_output
                for node_name, node_output in event.items():
                    # Skip internal nodes
                    if node_name.startswith("__"):
                        continue
                    
                    # Extract agent info from discussion_history if available
                    history = node_output.get("discussion_history", [])
                    
                    for msg in history:
                        # Parse the message to extract agent and content
                        if ":" in msg:
                            parts = msg.split(":", 1)
                            agent_key = parts[0].strip()
                            content = parts[1].strip() if len(parts) > 1 else ""
                            
                            # Extract confidence
                            confidence = 0.0
                            # Extract confidence (Robust version)
                            confidence = 0.0
                            if "Conf=" in content:
                                try:
                                    import re
                                    match = re.search(r'Conf=(\d+\.?\d*)', content)
                                    if match:
                                        confidence = float(match.group(1))
                                except:
                                    pass
                            elif "(Conf:" in content:
                                try:
                                    conf_start = content.index("(Conf:") + 6
                                    conf_end = content.index(")", conf_start)
                                    confidence = float(content[conf_start:conf_end].strip())
                                except:
                                    pass
                            
                            event_data = {
                                "type": "agent_message",
                                "agent": agent_key,
                                "content": content,
                                "confidence": confidence,
                                "is_final": agent_key == "Arbitrator" and "FINAL" in msg
                            }
                            
                            yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                            await asyncio.sleep(0.1)  # Small delay for frontend rendering
                    
                    # Check for final output
                    final = node_output.get("final_output")
                    if final and final.get("status") == "FINAL":
                        event_data = {
                            "type": "final_decision",
                            "decision": final.get("decision", ""),
                            "confidence": final.get("confidence", 0.0),
                            "reasoning": final.get("reasoning", "")
                        }
                        yield f"data: {json.dumps(event_data, ensure_ascii=False)}\n\n"
            
            # Send done event
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
