import numpy as np
from typing import Any

def convert_numpy_types(obj: Any) -> Any:
    """
    Recursively convert NumPy types (scalars, arrays) to standard Python types
    to ensure JSON serializability for FastAPI responses.
    """
    if isinstance(obj, dict):
        return {k: convert_numpy_types(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [convert_numpy_types(i) for i in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return convert_numpy_types(obj.tolist())
    elif isinstance(obj, (np.datetime64, np.timedelta64)):
        return str(obj)
    # Check for NaN/Inf (NumPy types)
    elif isinstance(obj, float) and (np.isnan(obj) or np.isinf(obj)):
        return None
    else:
        return obj
