from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

def execute(
    log_data: Dict[str, Any], 
    curve_name: str, 
    mode: str = 'min', 
    start_depth: Optional[float] = None, 
    end_depth: Optional[float] = None
) -> Dict[str, Any]:
    """
    Finds the extreme value (min or max) of a curve within a specific depth range.
    
    Args:
        log_data: Standard log data dictionary containing 'curves' (dict of arrays).
        curve_name: Name of the curve to analyze (e.g., 'GR', 'RHOB').
        mode: 'min' or 'max'.
        start_depth: Start depth to filter (inclusive).
        end_depth: End depth to filter (inclusive).
        
    Returns:
        JSON compatible dict with value, depth, and metadata.
    """
    curves = log_data.get('curves', {})
    
    # Resolve curve name using CurveMapper
    # This allows using standard types like 'GR' even if the actual curve is 'GR_MERGE'
    actual_curve_name = None
    
    # First, check if it's a direct match
    if curve_name in curves:
        actual_curve_name = curve_name
    else:
        # Try CurveMapper to resolve standard type to actual curve name
        try:
            from backend.core.curve_mapper import get_curve_mapper
            mapper = get_curve_mapper()
            mapping = mapper.map_curves(list(curves.keys()))
            matched = mapping.get('matched', {})
            
            # Find which actual curve name maps to the requested standard type
            for orig_name, std_type in matched.items():
                if std_type.upper() == curve_name.upper():
                    actual_curve_name = orig_name
                    break
        except Exception:
            pass  # Fall through to case-insensitive check
        
        # Fallback: case-insensitive match
        if not actual_curve_name:
            match = next((k for k in curves.keys() if k.upper() == curve_name.upper()), None)
            if match:
                actual_curve_name = match
    
    if not actual_curve_name:
        return {"error": f"Curve '{curve_name}' not found. Available curves: {list(curves.keys())}"}

    # Prepare DataFrame
    # We need DEPTH and the Target Curve
    depth_curve = next((k for k in curves.keys() if k.upper() in ['DEPTH', 'DEPT']), None)
    if not depth_curve:
        return {"error": "Depth curve not found in data."}
        
    df = pd.DataFrame({
        'DEPTH': curves[depth_curve],
        'VALUE': curves[actual_curve_name]
    })
    
    # Drop N/A
    df = df.dropna()
    
    # Filter by depth range
    if start_depth is not None:
        df = df[df['DEPTH'] >= start_depth]
    if end_depth is not None:
        df = df[df['DEPTH'] <= end_depth]
        
    if df.empty:
        return {"error": "No valid data found in the specified range."}
        
    # Find Extreme
    if mode.lower() == 'max':
        target_idx = df['VALUE'].idxmax()
    else:
        target_idx = df['VALUE'].idxmin()
        
    result_row = df.loc[target_idx]
    
    return {
        "curve": actual_curve_name,
        "mode": mode,
        "value": float(result_row['VALUE']),
        "depth": float(result_row['DEPTH']),
        "depth_range_analyzed": {
            "start": float(df['DEPTH'].min()),
            "end": float(df['DEPTH'].max())
        }
    }
