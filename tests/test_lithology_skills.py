import sys
import os
import numpy as np

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.skills.lithology.quantitative import calculate_vsh
from backend.skills.lithology.crossplot import analyze_crossplot
from backend.skills.lithology.morphology import identify_curve_shape

def test_quantitative():
    print("\n--- Testing Quantitative Skill ---")
    # Synthetic GR Data: 0 to 100
    # Clean sand=10, Shale=90.
    curves = {"GR": [10, 30, 50, 70, 90]} 
    data = {"curves": curves}
    
    # Test Linear
    res_lin = calculate_vsh(data, method="linear", gr_min=10, gr_max=90)
    print(f"Linear Vsh (Input 50, expected 0.5): {res_lin['average_vsh']:.2f}")
    assert 0.49 < res_lin['average_vsh'] < 0.51
    
    # Test Larionov Tertiary (Should be lower than linear for intermediate values)
    # Vsh = 0.083 * (2^(3.7*0.5) - 1) = 0.083 * (2^1.85 - 1) = 0.083 * (3.6 - 1) = 0.083 * 2.6 = 0.21
    res_lar = calculate_vsh(data, method="larionov_tertiary", gr_min=10, gr_max=90)
    vals = res_lar['p90_vsh'] # Check specific value logic roughly
    print(f"Larionov Tertiary Vsh (Input 50, expected ~0.21): {np.mean(res_lar['average_vsh']):.2f}")
    
def test_crossplot():
    print("\n--- Testing Crossplot Skill ---")
    # 1. Sandstone Point (Fresh Mud): RHOB=2.35, NPHI=0.25 (Gas effect?) 
    # Let's take standard Water Sand phi=20%
    # Matrix=2.65, Fluid=1.0. RHOB = 0.8*2.65 + 0.2*1.0 = 2.12 + 0.2 = 2.32
    # NPHI ~ 0.20 (Sandstone line) -> On Limestone scale ~ 0.20 - 0.04 = 0.16?
    # Let's use standard Limestone Point: RHOB=2.71, NPHI=0.0
    
    data_lime = {
        "curves": {
            "RHOB": [2.71, 2.71],
            "NPHI": [0.0, 0.0],
            "DT": [47.6, 47.6] # 47.6 us/ft = Limestone matrix
        }
    }
    
    # ND Plot
    res_nd = analyze_crossplot(data_lime, type="ND")
    print(f"ND Result (Limestone): {res_nd['interpretation']} (Conf: {res_nd['confidence']})")
    assert "Limestone" in res_nd['interpretation']
    
    # MN Plot (M=0.827, N=0.585 for Lime)
    res_mn = analyze_crossplot(data_lime, type="MN")
    print(f"MN Result (Limestone): {res_mn['interpretation']} (Conf: {res_mn['confidence']})")
    print(f"Values: M={res_mn['avg_M']:.3f}, N={res_mn['avg_N']:.3f}")
    assert "Limestone" in res_mn['interpretation']
    
def test_morphology():
    print("\n--- Testing Morphology Skill ---")
    # Bell Shape (Fining Up): GR low at bottom (high depth), high at top (low depth)
    # Depth: 1000 -> 1010.
    # GR: 90 -> 20. (Decreasing with depth -> Coarsening Up / Funnel?)
    # Wait. 
    # Depth 1000 (Top): GR=90 (Shale)
    # Depth 1010 (Bottom): GR=20 (Sand)
    # Sequence: Sand at bottom, Shale at top. Fining Upwards.
    # GR increases as depth decreases (upwards).
    # Slope (w.r.t increasing depth): GR decreases. Slope < 0.
    
    depths = list(range(1000, 1011))
    # Funnel: Coarsening Up. Shale at bottom (High GR), Sand at top (Low GR).
    # Top 1000: GR 20. Bottom 1010: GR 90.
    # GR increases with depth. Slope > 0.
    
    gr_funnel = np.linspace(20, 90, 11) # 20..90
    data_funnel = {"curves": {"GR": list(gr_funnel), "DEPTH": depths}}
    
    res = identify_curve_shape(data_funnel, curve_name="GR")
    print(f"Morphology (Expected Funnel/Coarsening Up): {res['shape']}")
    assert "Funnel" in res['shape']

if __name__ == "__main__":
    try:
        test_quantitative()
        test_crossplot()
        test_morphology()
        print("\n✅ All Tests Passed!")
    except Exception as e:
        print(f"\n❌ Test Failed: {e}")
        import traceback
        traceback.print_exc()
