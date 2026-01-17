import os
import sys
import json
import logging
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from backend.data_processing.las_parser import LogDataParser
from backend.data_processing.quality_control import DataQualityController

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Well Agent API",
    description="API for Well Logging Multi-Agent System",
    version="1.0.0"
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
    """Parse an uploaded LAS file and return structured data."""
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
        
        return {
            "success": True,
            "session_id": session_id,
            "data": log_data,
            "qc_report": qc_report
        }
        
    except Exception as e:
        logger.error(f"Failed to parse LAS: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def run_analysis(request: AnalysisRequest, session_id: str = "default"):
    """Run multi-agent analysis on the specified depth range."""
    try:
        # Get stored data or use mock
        log_data = parsed_data_store.get(session_id)
        
        if not log_data:
            # Return mock analysis for demo
            return {
                "success": True,
                "messages": [
                    {
                        "agent": "LithologyExpert",
                        "content": f"针对 {request.start_depth}-{request.end_depth}m 层段分析：GR 均值约 52 API，指示该层段为砂岩储层。",
                        "confidence": 0.85
                    },
                    {
                        "agent": "ElectricalExpert", 
                        "content": f"电阻率 RT 约 18 Ω·m，结合岩性为砂岩，判断为含油层。",
                        "confidence": 0.78
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
        
        # TODO: In production, call actual workflow
        # from backend.core.workflow import app as workflow_app
        # result = workflow_app.invoke(...)
        
        return {
            "success": True,
            "messages": [],
            "final_decision": None
        }
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/status")
async def get_status():
    """Get API server status."""
    return {
        "status": "running",
        "sessions": list(parsed_data_store.keys())
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
