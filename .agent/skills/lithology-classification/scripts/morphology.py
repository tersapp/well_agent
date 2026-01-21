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
    Identify the morphological shape of a log curve using quantitative petrophysical parameters.
    
    Algorithms:
    1. Serration Index (SI): Ratio of actual curve length to chord length. Quantifies roughness.
       - SI > 1.4 -> Serrated / Finger-like (High frequency fluctuations)
    2. Relative Center of Gravity (RCG): Gravitational center of the curve area.
       - RCG > 0.5 -> Top-heavy (Fining Up / Bell trend if GR increases up) -> Wait, GR low is sand.
         - Case Sand: Low GR. Case Shale: High GR.
         - Bell (Fining Up): Sand at bottom (Low GR) -> Shale at top (High GR). GR Increases Upwards.
           Shape looks like a Bell? NO. Bell shape usually means Base is Sharp, Top is Gradational.
           Actually 'Bell' in log shape usually refers to the SP/GR visual appearance.
           Fining Up: GR increases upward.
           Coarsening Up: GR decreases upward (Funnel).
    3. Linear Trend (Slope): Global trend direction.
    
    Args:
        log_data: Dictionary containing 'curves' with numpy arrays.
        curve_name: Name of the curve to analyze (usually GR).
    """
    curves = log_data.get('curves', {})
    depth_curve = curves.get('DEPTH') or curves.get('Depth') or curves.get('DEPT')
    
    # 1. Retrieve and Validate Data
    if curve_name not in curves:
        return {"error": f"Curve {curve_name} not found"}
    if depth_curve is None:
        return {"error": "Depth curve not found"}
        
    raw_vals = np.array(curves[curve_name])
    depth_vals = np.array(depth_curve)
    
    # 2. Slice Data (Handle NaNs)
    mask = ~np.isnan(raw_vals) & ~np.isnan(depth_vals)
    if depth_start is not None:
        mask &= (depth_vals >= depth_start)
    if depth_end is not None:
        mask &= (depth_vals <= depth_end)
        
    y = raw_vals[mask]
    x = depth_vals[mask] # Depth increases downwards
    
    if len(y) < 10:
        return {"shape": "Undefined (Insufficient Data)", "trend": 0}

    # 3. Normalization (Min-Max to 0-1) for Geometric Calculations
    # Essential for Serration Index to be unit-independent
    y_min, y_max = np.min(y), np.max(y)
    x_min, x_max = np.min(x), np.max(x)
    
    if y_max - y_min == 0 or x_max - x_min == 0:
        return {"shape": "Box (Linear)", "description": "Constant value"}

    y_norm = (y - y_min) / (y_max - y_min)
    x_norm = (x - x_min) / (x_max - x_min)

    # 4. Calculate Parameters
    
    # A. Serration Index (SI)
    # Arc Length (sum of segments)
    dy = np.diff(y_norm)
    dx = np.diff(x_norm)
    arc_length = np.sum(np.sqrt(dy**2 + dx**2))
    # Chord Length (Euclidean distance start to end)
    chord_length = np.sqrt((y_norm[-1] - y_norm[0])**2 + (x_norm[-1] - x_norm[0])**2)
    
    # Avoid div by zero (though handled by flat check above)
    serration_index = arc_length / chord_length if chord_length > 0 else 1.0
    
    # B. Linear Slope (of smoothed data to avoid noise affecting trend)
    # Smoothing window
    w = min(window_size, len(y)//2)
    if w > 1:
        kernel = np.ones(w) / w
        y_smooth = np.convolve(y, kernel, mode='valid')
        x_smooth = x[w-1:]
        # Recalculate norms for slope? No, use raw slope or normalized slope.
        # Normalized slope is better for generalized thresholds.
        # Let's use normalized coordinates for slope to match limits.
        y_s_norm = (y_smooth - y_min) / (y_max - y_min)
        x_s_norm = (x_smooth - x_min) / (x_max - x_min)
        slope_norm, _ = np.polyfit(x_s_norm, y_s_norm, 1)
    else:
        slope_norm, _ = np.polyfit(x_norm, y_norm, 1)
        
    # C. Relative Center of Gravity (RCG)
    # RCG = Sum(Depth_i * GR_i) / Sum(GR_i)  (Using normalized Depth 0-1)
    # Measures where the "mass" (high GR) is concentrated.
    # High GR (Shale) at Top (Low Depth value? No, x_norm increases with Depth).
    # x_norm: 0 (Top) -> 1 (Bottom).
    # If Fining Up (Bell): Sand (Low GR) at Bottom (1), Shale (High GR) at Top (0).
    # -> High GR values are at small x_norm. -> Low RCG.
    # If Coarsening Up (Funnel): Shale (High GR) at Bottom (1), Sand (Low GR) at Top (0).
    # -> High GR values are at large x_norm. -> High RCG.
    # Wait, simple Sum(x*GR)/Sum(GR) is the weighted average DEPTH of the GR "mass".
    
    rcg = np.sum(x_norm * y_norm) / np.sum(y_norm) if np.sum(y_norm) > 0 else 0.5
    
    # 5. Classification Logic
    # Thresholds are empirical
    SI_THRESHOLD = 1.4      # Above this is "Serrated"
    SLOPE_THRESHOLD = 0.15  # |Slope| < 0.15 is "Box"
    
    shape = "Unknown"
    desc = ""
    
    # Step 1: Check Serration
    is_serrated = serration_index > SI_THRESHOLD
    prefix = "Serrated " if is_serrated else ""
    
    # Step 2: Check Trend
    if abs(slope_norm) < SLOPE_THRESHOLD:
        # Box / Aggrading
        # If serrated, it's "Finger" or "Serrated Box"
        base_shape = "Finger (指状)" if is_serrated else "Box (箱型)"
        desc = "Stable aggradation" + (", with high frequency fluctuations" if is_serrated else ".")
    else:
        # Significant Trend
        if slope_norm < 0:
            # Slope < 0: As Depth increases (x goes 0->1), GR decreases (y goes high->low).
            # Top (0): High GR. Bottom (1): Low GR.
            # This is Fining Up (Sand at bottom, Shale at top). -> Bell Shape.
            base_shape = "Bell (钟型)" # Fining Up
            desc = "Fining up sequence (Retrogradation/Channel Fill)."
        else:
            # Slope > 0: As Depth increases, GR increases.
            # Top: Low GR. Bottom: High GR.
            # This is Coarsening Up (Shale at bottom, Sand at top). -> Funnel Shape.
            base_shape = "Funnel (漏斗型)" # Coarsening Up
            desc = "Coarsening up sequence (Progradation/Delta Front)."
            
    final_shape = f"{prefix}{base_shape}".strip()
    # Correct specific naming for purely serrated box -> Finger
    if base_shape.startswith("Finger"): final_shape = base_shape
    
    return {
        "shape": final_shape,
        "description": desc,
        "stats": {
            "serration_index": round(float(serration_index), 2),
            "slope_norm": round(float(slope_norm), 2),
            "rcg": round(float(rcg), 2),
            "avg_value": float(np.mean(y)),
            "total_change": float(y[-1] - y[0])
        }
    }
