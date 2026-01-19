import numpy as np
from typing import Dict, Any, List

def analyze_crossplot(
    log_data: Dict[str, Any],
    type: str = "ND",
    rhob_curve: str = "RHOB",
    nphi_curve: str = "NPHI",
    dt_curve: str = "DT",
    fluid_params: Dict[str, float] = None
) -> Dict[str, Any]:
    """
    Perform lithology identification using Crossplots.
    
    Args:
        type: "ND" (Neutron-Density) or "MN" (M-N Plot)
        rhob_curve: Density curve name
        nphi_curve: Neutron curve name
        dt_curve: Sonic curve name (required for MN plot)
        fluid_params: Dict with 'dt_f', 'rho_f', 'nphi_f'. 
                      Defaults: Fresh Water Mud (DT=189, RHO=1.0, NPHI=1.0)
    """
    curves = log_data.get('curves', {})
    
    # Defaults
    fp = fluid_params or {}
    dt_f = fp.get('dt_f', 189.0)   # us/ft (fresh water)
    rho_f = fp.get('rho_f', 1.0)   # g/cc
    nphi_f = fp.get('nphi_f', 1.0) # v/v (fluid usually reads 1.0 on limestone scale)
    
    plot_type = type.upper()
    if plot_type == "ND" or plot_type == "DENSITY_NEUTRON" or plot_type == "NEUTRON_DENSITY":
        return _analyze_nd(curves, rhob_curve, nphi_curve)
    elif plot_type == "MN":
        return _analyze_mn(curves, rhob_curve, nphi_curve, dt_curve, dt_f, rho_f, nphi_f)
    else:
        return {"error": f"Unknown plot type: {type}"}

def _analyze_nd(curves, rho_name, nphi_name):
    """Neutron-Density Crossover Analysis"""
    if rho_name not in curves or nphi_name not in curves:
        return {"error": f"Missing RHOB ({rho_name}) or NPHI ({nphi_name}) curves for ND plot"}
        
    rhob = np.array([v for v in curves[rho_name] if v is not None])
    nphi = np.array([v for v in curves[nphi_name] if v is not None])
    
    if len(rhob) == 0 or len(nphi) == 0 or len(rhob) != len(nphi):
        return {"error": "Data length mismatch or empty"}

    # Calculate Apparent Porosity from Density (Limestone matrix 2.71)
    phi_d_lime = (2.71 - rhob) / (2.71 - 1.0)
    
    # Separation: Sep = PHID_lime - NPHI_lime
    sep = phi_d_lime - nphi
    
    # Classification Thresholds
    # Sandstone: Positive Separation (> 0.03)
    # Limestone: Zero Separation (+/- 0.03)
    # Dolomite: Negative Separation (< -0.03)
    # Shale: Large Negative Separation (< -0.15) if NPHI is very high
    
    counts = {
        "Sandstone": 0,
        "Limestone": 0,
        "Dolomite": 0,
        "Shale": 0,
        "Undefined": 0
    }
    
    total = len(sep)
    
    for s, n in zip(sep, nphi):
        if n > 0.40: # High neutron usually indicates shale in this context
            counts["Shale"] += 1
        elif s > 0.03:
            counts["Sandstone"] += 1
        elif abs(s) <= 0.03:
            counts["Limestone"] += 1
        elif s < -0.03:
             # Could be Dolo or Shale, check magnitude
             if s < -0.15:
                 counts["Shale"] += 1
             else:
                 counts["Dolomite"] += 1
        else:
            counts["Undefined"] += 1
            
    # Calculate Percentages
    distribution = {k: round(v/total * 100, 1) for k,v in counts.items()}
    
    # Centroid
    avg_rhob = np.mean(rhob)
    avg_nphi = np.mean(nphi)
    avg_sep = np.mean(sep)
    
    # Dominant Lithology
    primary = max(distribution, key=distribution.get)
    confidence = distribution[primary] / 100.0
    
    return {
        "method": "Neutron-Density Scatter Analysis",
        "data_points": total,
        "distribution_percent": distribution,
        "centroid": {
            "avg_rhob": float(avg_rhob),
            "avg_nphi": float(avg_nphi),
            "avg_separation": float(avg_sep)
        },
        "interpretation": f"Dominant: {primary} ({distribution[primary]}%)",
        "confidence": float(confidence),
        "note": "Sand>3pu sep; Lime+/-3pu; Dolo<-3pu; Shale<-15pu or N>40%"
    }

def _analyze_mn(curves, rho_name, nphi_name, dt_name, dt_f, rho_f, nphi_f):
    """M-N Plot Analysis for Triple Combo + Sonic"""
    if any(c not in curves for c in [rho_name, nphi_name, dt_name]):
        return {"error": "Missing curves for MN plot (need RHOB, NPHI, DT)"}
        
    rhob = np.array(curves[rho_name])
    nphi = np.array(curves[nphi_name])
    dt = np.array(curves[dt_name])
    
    # Filter None and ensure lengths match (simple intersection)
    mask = (rhob != None) & (nphi != None) & (dt != None)
    # Convert to float
    # We can't rely on simple list comp if None is present at random spots
    # Assuming the dict arrays are aligned by depth. 
    # Let's iterate index-wise.
    valid_indices = [i for i in range(len(rhob)) 
                     if rhob[i] is not None and nphi[i] is not None and dt[i] is not None]
    
    if not valid_indices:
        return {"error": "No valid depth points with all 3 curves"}
        
    r = np.array([rhob[i] for i in valid_indices], dtype=float)
    n = np.array([nphi[i] for i in valid_indices], dtype=float)
    d = np.array([dt[i] for i in valid_indices], dtype=float)
    
    # M = 0.01 * (DT_f - DT) / (RHOB - RHOB_f)
    # N = (NPHI_f - NPHI) / (RHOB - RHOB_f)
    
    # Avoid div/0
    denom = r - rho_f
    denom[abs(denom)<0.01] = 0.01
    
    M = 0.01 * (dt_f - d) / denom
    N = (nphi_f - n) / denom
    
    avg_M = np.mean(M)
    avg_N = np.mean(N)
    
    # Standard Points (Fresh Mud)
    # Sandstone: M ~ 0.81, N ~ 0.63
    # Limestone: M ~ 0.827, N ~ 0.585
    # Dolomite: M ~ 0.778, N ~ 0.516
    # Shale: M ~ 0.6 (variable), N ~ 0.5-0.6
    # Anhydrite: M ~ 0.7, N ~ 0.5
    
    # Simple Euclidean Distance Classifier
    centroids = {
        "Sandstone": (0.81, 0.63),
        "Limestone": (0.827, 0.585),
        "Dolomite": (0.778, 0.516),
        "Anhydrite": (0.70, 0.50),
        "Shale (Typ)": (0.60, 0.55)
    }
    
    distances = {}
    for lith, (cM, cN) in centroids.items():
        dist = np.sqrt((avg_M - cM)**2 + (avg_N - cN)**2)
        distances[lith] = dist
        
    best_match = min(distances, key=distances.get)
    confidence = max(0, 1.0 - distances[best_match]*5) # Heuristic
    
    return {
        "method": "M-N Plot",
        "avg_M": float(avg_M),
        "avg_N": float(avg_N),
        "interpretation": best_match,
        "confidence": float(confidence),
        "distances": {k: float(v) for k,v in distances.items()}
    }
