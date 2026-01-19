import numpy as np
from typing import Dict, Any, List

def identify_curve_shape(
    log_data: Dict[str, Any],
    curve_name: str = "GR",
    depth_start: float = None,
    depth_end: float = None,
    window_size: int = 5
) -> Dict[str, Any]:
    """
    Identify the morphological shape of a log curve (Bell, Funnel, Box).
    Useful for sedimentary facies analysis.
    
    Args:
        curve_name: Usually GR or SP.
        window_size: Smoothing window size (number of samples) to remove noise.
    """
    curves = log_data.get('curves', {})
    depth_curve = log_data.get('curves', {}).get('DEPTH') # Default alias check needed in agent
    
    # 1. Retrieve Data
    # In a real agent, we might need to handle curve aliasing before calling this, 
    # or pass both standard and alias map. For now assume agent resolved 'GR'.
    
    if curve_name not in curves:
         return {"error": f"Curve {curve_name} not found"}
         
    raw_vals = curves[curve_name]
    
    # 2. Slice by Depth
    if depth_curve and (depth_start is not None or depth_end is not None):
        # ... Slicing logic ...
        # Simplified: assume input log_data is already sliced or we process whole.
        # Let's assume we process whole for now to save complexity, 
        # Agent should slice data before passing if needed, or we filter indices here.
        vals = []
        depths = []
        for d, v in zip(depth_curve, raw_vals):
            if d is None or v is None: continue
            if depth_start and d < depth_start: continue
            if depth_end and d > depth_end: continue
            vals.append(v)
            depths.append(d)
    else:
        # Just filter Nones
        vals = [v for v in raw_vals if v is not None]
        depths = list(range(len(vals))) # Dummy depth
        
    if len(vals) < window_size * 2:
        return {"shape": "Undefined (Insufficient Data)", "trend": 0}
        
    y = np.array(vals)
    x = np.array(depths) # Depth increases downwards
    
    # 3. Smoothing (OFFSHORE/REAL DATA BEST PRACTICE)
    # Moving average
    window = np.ones(window_size) / window_size
    y_smooth = np.convolve(y, window, mode='valid')
    # Reject edge effects from depth
    x_valid = x[window_size-1:]
    
    # 4. Stat Analysis: Linear Regression on Smoothed Data
    # Slope of GR w.r.t Depth
    slope, intercept = np.polyfit(x_valid, y_smooth, 1)
    
    # Normalize slope? 
    # Absolute change over interval length
    total_depth_span = x_valid[-1] - x_valid[0]
    total_val_change = slope * total_depth_span
    
    # Variance/Rugosity check
    # Box shape has low overall slope but maybe high variance or just flat.
    
    classification = "Unknown"
    
    # Thresholds need tuning.
    # Significant change: > 10 API over the interval?
    
    change_magnitude = abs(total_val_change)
    
    if change_magnitude < 15: # API units (assuming GR)
        classification = "Box / Aggrading (箱型)"
        desc = "Relatively constant values, indicating stable deposition (Aggradation)."
    else:
        if slope < 0:
            # Depth increases, GR Decreases.
            # Bottom (High Depth) has Lower GR. Top (Low Depth) has Higher GR.
            # GR Increases Upwards -> Fining Upwards (for sand)
            classification = "Bell / Fining Up (钟型)"
            desc = "Values increase upwards (assuming GR reflects shale content). Retrogradation / Channel Fill."
        else:
            # Depth increases, GR Increases.
            # Bottom has Higher GR. Top has Lower GR.
            # GR Decreases Upwards -> Coarsening Upwards (for sand)
            classification = "Funnel / Coarsening Up (漏斗型)"
            desc = "Values decrease upwards. Progradation / Delta Front."
            
    return {
        "shape": classification,
        "description": desc,
        "stats": {
            "slope": float(slope),
            "total_change": float(total_val_change),
            "avg_value": float(np.mean(y_smooth))
        }
    }
