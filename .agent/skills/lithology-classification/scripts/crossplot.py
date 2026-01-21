import numpy as np
import pandas as pd
import re
from typing import Dict, Any, List, Optional
from backend.core.curve_mapper import get_curve_mapper

def analyze_crossplot(
    log_data: Dict[str, Any],
    x_expression: str = None,
    y_expression: str = None,
    color_expression: str = "GR",
    filter_query: str = None,
    depth_start: float = None,
    depth_end: float = None,
    presets: str = None,
    # Legacy arguments for backward compatibility
    type: str = None,
    rhob_curve: str = "RHOB",
    nphi_curve: str = "NPHI",
    dt_curve: str = "DT",
    # New sizing/scale arguments
    x_min: float = None, 
    x_max: float = None,
    y_min: float = None,
    y_max: float = None,
    c_min: float = None,
    c_max: float = None,
    x_inverse: bool = False,
    y_inverse: bool = False,
    **kwargs
) -> Dict[str, Any]:
    """
    Advanced Crossplot Analysis with Semantic Resolution and Rock Physics Derivations.
    """
    
    # --- 1. Standardization Phase (Curve Aliasing) ---
    curves = log_data.get('curves', {})
    if not curves:
        return {"error": "No curve data provided"}
        
    mapper = get_curve_mapper()
    # We map the keys to find matches, then rename the input dict/lines
    # Ideally we'd get a full mapping df, but for now let's map keys to Standard Names
    # e.g. "AC" -> "DT", "DEN" -> "RHOB"
    mapped_result = mapper.map_curves(list(curves.keys()))
    matched_map = mapped_result['matched'] # { 'AC': 'DT', 'DEN': 'RHOB' ... }
    
    # Build a standardized dictionary: { 'DT': [values], 'RHOB': [values] ... }
    # Priority: if multiple input curves map to same standard, take the first one found (arbitrary but stable)
    std_data = {}
    
    # First pass: Copy unmapped curves as is (to preserve original names if needed)
    for k, v in curves.items():
        std_data[k] = v
        
    # Second pass: Apply standard aliases (overwrite or add)
    for orig_name, std_name in matched_map.items():
        if std_name and std_name not in std_data:
             std_data[std_name] = curves[orig_name]

    # Create DataFrame
    df = pd.DataFrame(dict([ (k,pd.Series(v)) for k,v in std_data.items() ]))
    
    # --- 2. Data Filtering ---
    # Convert 'DEPTH' column if it exists (CurveMapper creates 'DEPTH' alias usually)
    if 'DEPTH' in df.columns:
        if depth_start is not None:
            df = df[df['DEPTH'] >= depth_start]
        if depth_end is not None:
            df = df[df['DEPTH'] <= depth_end]
    
    # Semantic Resolution Helper
    def resolve_concept(concept: str, context_df: pd.DataFrame) -> str:
        """
        Resolves a high-level concept (e.g. 'Velocity') to a valid Pandas expression 
        based on available columns.
        """
        c = concept.strip().upper()
        cols = context_df.columns
        
        # --- A. Velocity (P/S) ---
        if c in ["VELOCITY", "VP", "P_VEL", "速度", "纵波速度", "纵波"]:
            # 1. Direct Curve
            for cand in ["VP", "VEL", "P_VEL"]:
                if cand in cols: return cand
            # 2. Derive from Sonic (DT)
            if "DT" in cols:
                # Check unit heuristic: DT usually 40-150. 
                # If us/ft -> m/s: 304800/DT. If us/m -> m/s: 1000000/DT
                # Robust default for Oil & Gas is us/ft.
                return "304800 / DT" 
            return None # Fail
            
        if c in ["VS", "S_VEL", "横波速度", "横波"]:
            for cand in ["VS", "S_VEL"]:
                if cand in cols: return cand
            if "DTS" in cols:
                return "304800 / DTS"
            return None

        # --- B. Impedance (P/S) ---
        if c in ["IMPEDANCE", "AI", "IP", "Z_P", "阻抗", "纵波阻抗", "波阻抗"]:
            if "AI" in cols: return "AI"
            if "IP" in cols: return "IP"
            # Derive: Vp * RHOB
            vp_expr = resolve_concept("VP", context_df)
            if vp_expr and "RHOB" in cols:
                return f"({vp_expr}) * RHOB"
            return None
            
        if c in ["SI", "IS", "Z_S", "横波阻抗"]:
            if "SI" in cols: return "SI"
            vs_expr = resolve_concept("VS", context_df)
            if vs_expr and "RHOB" in cols:
                return f"({vs_expr}) * RHOB"
            return None
            
        # --- Density ---
        if c in ["DENSITY", "DEN", "RHOB", "密度"]:
            if "RHOB" in cols: return "RHOB"
            # Fallback: maybe just return 'RHOB' anyway if we assume standard mapping happened?
            # But safer to check col existence to avoid eval error later.
            if "DEN" in cols: return "DEN"
            return None

        # --- C. Porosity ---
        if c in ["POROSITY", "POR", "PHI", "孔隙度", "总孔隙度"]:
            # Priority: Effective -> Total -> Neutron
            for cand in ["PHIE", "POR_EFF", "PHIT", "POR", "NPHI"]:
                if cand in cols: return cand
            return None
            
        if c in ["DPHI", "DENSITY_POROSITY", "密度孔隙度"]:
            if "DPHI" in cols: return "DPHI"
            if "RHOB" in cols:
                # Default Sandstone matrix (2.65), Fluid (1.0)
                return "(2.65 - RHOB) / (2.65 - 1.0)"
            return None
            
        # --- D. Elastic Moduli (Expansion) ---
        if c in ["POISSON", "PR", "NU", "泊松比"]:
            # nu = 0.5 * (Vp/Vs^2 - 2) / (Vp/Vs^2 - 1) ... simplified:
            # PR = (0.5 * (DTs/DT)^2 - 1) / ((DTs/DT)^2 - 1)
            if "DTS" in cols and "DT" in cols:
                return "(0.5 * (DTS/DT)**2 - 1) / ((DTS/DT)**2 - 1)"
            return None
            
        if c in ["VPVS", "VP/VS", "RATIO", "波速比"]:
             if "DTS" in cols and "DT" in cols:
                 return "DTS / DT" # Slowness ratio is equivalent/inverse depending on def, but Vp/Vs = Dts/Dt
             return None

        # --- E. Fallback: Return original if not a concept ---
        return concept

    # --- 3. Parse Expressions ---
    # First, handle presets
    if presets:
        p = presets.upper()
        if p == "ND": # Neutron-Density
            x_expression = "NPHI" 
            y_expression = "RHOB"
        elif p in ["PICKETT", "皮克特"]: # Rt vs Porosity (Log-Log)
            x_expression = resolve_concept("POROSITY", df) or "NPHI"
            y_expression = "RES_DEEP" # Need standard alias mapping for RT
            # Pickett usually requires Log scales, handled in frontend config
        elif p == "BUCKLES": # Sw vs Porosity
            x_expression = resolve_concept("POROSITY", df) or "PHIE"
            y_expression = "SAT_WATER"
    
    # Resolve semantic terms in expressions
    # This assumes the expression IS the concept (e.g. x="Velocity"). 
    # For complex math like "Velocity * 2", a simple replace might be risky but we'll try basic substitution?
    # For now, let's assume the user input is predominantly a single concept OR a raw formulas.
    # We will try to resolve the WHOLE string first.
    
    final_x = resolve_concept(x_expression, df) or x_expression
    final_y = resolve_concept(y_expression, df) or y_expression
    final_c = resolve_concept(color_expression, df) or color_expression or "GR"
    
    if not final_x or not final_y:
        return {"error": f"Could not resolve axes. Input: X='{x_expression}', Y='{y_expression}'"}

    # --- 4. Calculation ---
    try:
        if filter_query:
            df = df.query(filter_query, local_dict={})
            
        df['__X'] = df.eval(final_x, engine='python')
        df['__Y'] = df.eval(final_y, engine='python')
        # Handle color expression failure gracefully
        try:
            df['__C'] = df.eval(final_c, engine='python')
        except:
            df['__C'] = 0

    except Exception as e:
         return {"error": f"Calculation error: {str(e)}", "details": f"X: {final_x}, Y: {final_y}"}
         
    # Clean and Limit
    plot_cols = ['__X', '__Y', '__C']
    df_clean = df.dropna(subset=plot_cols)
    if df_clean.empty:
        return {"error": "No valid data points available for plotting"}
        
    if len(df_clean) > 5000:
        df_clean = df_clean.sample(5000)

    # --- 5. ECharts Config Output ---
    # --- 5. ECharts Config Output ---
    output_data = []
    x_vals = df_clean['__X'].values
    y_vals = df_clean['__Y'].values
    c_vals = df_clean['__C'].values
    d_vals = df_clean['DEPTH'].values if 'DEPTH' in df_clean.columns else np.zeros(len(df_clean))
    
    for x,y,c,d in zip(x_vals, y_vals, c_vals, d_vals):
        output_data.append([
            round(float(x), 4), 
            round(float(y), 4), 
            round(float(c), 4), 
            round(float(d), 2)
        ])
        
    # Determine Axis Types (Log scale for Resistivity?)
    x_type = "value"
    y_type = "value"
    if "RES" in str(final_x).upper() or "RT" in str(final_x).upper(): x_type = "log"
    if "RES" in str(final_y).upper() or "RT" in str(final_y).upper(): y_type = "log"

    # Axis Configs
    xAxis = { "name": x_expression if x_expression != final_x else x_expression, "type": x_type, "scale": True }
    yAxis = { "name": y_expression if y_expression != final_y else y_expression, "type": y_type, "scale": True }

    # Apply manual limits/inversion
    if x_min is not None: xAxis["min"] = x_min
    if x_max is not None: xAxis["max"] = x_max
    if x_inverse: xAxis["inverse"] = True
    
    if y_min is not None: yAxis["min"] = y_min
    if y_max is not None: yAxis["max"] = y_max
    if y_inverse: yAxis["inverse"] = True

    # Visual Map Config
    vMap_min = c_min if c_min is not None else float(np.min(c_vals))
    vMap_max = c_max if c_max is not None else float(np.max(c_vals))

    echarts_option = {
        "xAxis": xAxis,
        "yAxis": yAxis,
        "visualMap": {
            "min": vMap_min,
            "max": vMap_max,
            "dimension": 2,
            "calculable": True,
            "inRange": { "color": ["#313695", "#4575b4", "#74add1", "#abd9e9", "#e0f3f8", "#ffffbf", "#fee090", "#fdae61", "#f46d43", "#d73027", "#a50026"] }, 
            "orient": "vertical",
            "right": 10,
            "top": "center"
        },
        "tooltip": {
            "trigger": "item",
            "formatter": "D: {c}[3]m <br/>X: {c}[0]<br/>Y: {c}[1]<br/>C: {c}[2]"
        },
        "series": [{
            "type": "scatter",
            "symbolSize": 5,
            "large": True,
            "encode": { "x": "x", "y": "y", "tooltip": [0, 1, 2, 3] }
        }],
        "toolbox": {
            "feature": { "dataZoom": {}, "brush": {}, "saveAsImage": {} }
        }
    }

    # --- 6. Overlay Injection (New Feature) ---
    overlay_type = kwargs.get('overlay_type', None)
    if overlay_type == 'ND' or presets == 'ND':
        # Standard Neutron-Density Lithology Lines (CP-1 approx)
        # Assumes X=NPHI (v/v), Y=RHOB (g/cc)
        # Lines connect Matrix Point -> Fluid Point (approx for simple visualization)
        
        # Points: [NPHI, RHOB]
        fluid_point = [1.0, 1.0] # Water
        
        # Matrix Points (approximate constants for Limestone Units)
        # Sandstone: Rho=2.65, Nphi ~ -0.035 (approx shift from LS)
        sand_matrix = [-0.035, 2.65] 
        # Limestone: Rho=2.71, Nphi = 0.0
        lime_matrix = [0.0, 2.71]
        # Dolomite: Rho=2.87, Nphi ~ 0.02
        dolo_matrix = [0.02, 2.87]
        
        # Anhydrite Point (optional): Rho=2.98, Nphi=-0.02
        any_point = [-0.02, 2.98]
        
        overlays = [
            {
                "name": "Sandstone Line",
                "type": "line",
                "symbol": "none",
                "data": [sand_matrix, fluid_point],
                "lineStyle": { "type": "dashed", "color": "#f39c12", "width": 2 },
                "itemStyle": { "color": "#f39c12" }, 
                "label": { "show": True, "formatter": "Sandstone", "position": "end" }
            },
            {
                "name": "Limestone Line",
                "type": "line",
                "symbol": "none",
                "data": [lime_matrix, fluid_point],
                "lineStyle": { "type": "solid", "color": "#2ecc71", "width": 2 },
                "itemStyle": { "color": "#2ecc71" },
                "label": { "show": True, "formatter": "Limestone", "position": "end" }
            },
            {
                "name": "Dolomite Line",
                "type": "line",
                "symbol": "none",
                "data": [dolo_matrix, fluid_point],
                "lineStyle": { "type": "dashed", "color": "#9b59b6", "width": 2 },
                "itemStyle": { "color": "#9b59b6" },
                "label": { "show": True, "formatter": "Dolomite", "position": "end" }
            }
        ]
        
        # Append lines to series
        echarts_option["series"].extend(overlays)

    # --- 7. Save Data to Static File (Phase 4 Optimization) ---
    import uuid
    import json
    import os
    
    chart_id = str(uuid.uuid4())
    filename = f"{chart_id}.json"
    static_dir = os.path.join("backend", "static", "charts")
    filepath = os.path.join(static_dir, filename)
    
    # Ensure dir exists (redundant safety)
    os.makedirs(static_dir, exist_ok=True)
    
    data_payload = {
        "source": output_data,
        "dimensions": ["x", "y", "color", "depth"]
    }
    
    with open(filepath, 'w') as f:
        json.dump(data_payload, f)
        
    data_url = f"/static/charts/{filename}"

    echarts_config = {
        "type": "echarts",
        "title": f"{y_expression} vs {x_expression}",
        "dataUrl": data_url, # Frontend will fetch this
        "option": echarts_option
    }
    
    # Return concise summary + full config (Shell)
    return {
        "status": "success",
        "data_points": len(df_clean),
        "axis_formulas": {
            "x": final_x,
            "y": final_y,
            "color": final_c
        },
        "visualization": echarts_config
    }
