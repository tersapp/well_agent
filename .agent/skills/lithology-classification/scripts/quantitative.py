import numpy as np
from typing import Dict, Any, Union, Optional

def calculate_vsh(
    log_data: Dict[str, Any],
    gr_curve: str = "GR",
    method: str = "larionov_tertiary",
    gr_min: Optional[float] = None,
    gr_max: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calculate Shale Volume (Vsh) from Gamma Ray.
    
    Args:
        log_data: Dictionary containing 'curves' -> {curve_name: [values]}
        gr_curve: Name of the GR curve (default "GR")
        method: Calculation method:
               - "linear": Basic linear index
               - "larionov_old": For older rocks (Paleozoic/Mesozoic)
               - "larionov_tertiary": For younger/unconsolidated rocks (Tertiary/Cenozoic) - STANDARD for OFFSHORE
               - "steiber": For soft formations (Gulf Coast type)
               - "clavier": Another option for unconsolidated formations
        gr_min: Clean sand baseline. If None, calculated from p5 (5th percentile).
        gr_max: Shale baseline. If None, calculated from p95.
        
    Returns:
        Dict containing average Vsh, Vsh curve values, and parameters used.
    """
    curves = log_data.get('curves', {})
    
    # Locate GR curve
    # Support aliasing if "GR" not found directly but passed in log_data under matched name
    if gr_curve not in curves:
        # Fallback logic could go here, for now assume agent passes correct name
        return {"error": f"Curve '{gr_curve}' not found in data"}
        
    gr_values = np.array([v for v in curves[gr_curve] if v is not None])
    
    if len(gr_values) == 0:
        return {"error": "Empty GR curve"}

    # Determine Baselines
    # Robust statistics: use percentiles to avoid outliers affecting min/max
    _min = float(np.percentile(gr_values, 5)) if gr_min is None else gr_min
    _max = float(np.percentile(gr_values, 95)) if gr_max is None else gr_max
    
    # Avoid localized division by zero
    denom = _max - _min
    if denom == 0:
        denom = 0.001
        
    # 1. Linear Index (IGR)
    # Clip values to 0-1 range
    # Ensure compatible shapes by using compatible types
    # Handle scalar broadcast
    igr = (gr_values - _min) / denom
    igr = np.clip(igr, 0, 1)
    
    # 2. Apply Corrections
    if method == "linear":
        vsh = igr
    elif method == "larionov_tertiary":
        # Formula: 0.083 * (2^(3.7 * IGR) - 1)
        vsh = 0.083 * (2**(3.7 * igr) - 1)
    elif method == "larionov_old":
        # Formula: 0.33 * (2^(2 * IGR) - 1)
        vsh = 0.33 * (2**(2 * igr) - 1)
    elif method == "steiber":
        # Formula: IGR / (3 - 2 * IGR)
        # Avoid div by zero if IGR > 1.5 (unlikely due to clip)
        vsh = igr / (3 - 2 * igr)
    elif method == "clavier":
        # Formula: 1.7 - sqrt(3.38 - (IGR + 0.7)^2)
        # Simplified approximate for Tertiary often used
        vsh = 1.7 - np.sqrt(3.38 - (igr + 0.7)**2)
    else:
        # Default to larionov_tertiary for safety if unknown
        vsh = 0.083 * (2**(3.7 * igr) - 1)
        method = f"{method} (unknown, used larionov_tertiary)"
        
    # Clip final result
    vsh = np.clip(vsh, 0, 1)
    
    return {
        "method": method,
        "average_vsh": float(np.mean(vsh)),
        "p10_vsh": float(np.percentile(vsh, 10)),
        "p90_vsh": float(np.percentile(vsh, 90)),
        "parameters": {
            "gr_min": _min,
            "gr_max": _max,
            "formula": method
        },
        # return sample values for plotting/checking (limit to 10 for prompt economy?)
        # Agent usually needs aggregate, but maybe let's return stats only to save token space
        # Or return a simplified "classification" string
        "interpretation": _interpret_vsh(np.mean(vsh))
    }

def _interpret_vsh(avg_vsh: float) -> str:
    if avg_vsh < 0.15:
        return "Clean Sand (纯砂岩)"
    elif avg_vsh < 0.35:
        return "Shaly Sand (泥质砂岩)"
    elif avg_vsh < 0.65:
        return "Sandy Shale (砂质泥岩)"
    else:
        return "Shale (泥岩/页岩)"
