import numpy as np
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class DataQualityController:
    """
    Performs quality control checks on well log data.
    """
    
    def __init__(self, log_data: Dict[str, Any]):
        self.log_data = log_data
        self.curves = log_data.get('curves', {})
        self.metadata = log_data.get('metadata', {})
        
        # Standard physical ranges for common curves
        self.ranges = {
            'GR': (0, 300),      # Gamma Ray (API)
            'DT': (40, 200),     # Sonic (us/ft) or (us/m) - check unit!
            'RHOB': (1.5, 3.0),  # Density (g/cm3)
            'NPHI': (-0.05, 0.6),# Neutron Porosity (v/v)
            'RT': (0.1, 10000),  # Resistivity (ohm.m) - usually log scale
        }

    def perform_quality_checks(self) -> Dict[str, Any]:
        """
        Run a series of QC checks.
        
        Returns:
            Dict containing pass/fail status and list of issues.
        """
        issues = []
        warnings = []
        
        # 1. Check for missing crucial curves
        crucial_curves = ['GR', 'RT'] # Minimal set for basic interpretation
        for curve in crucial_curves:
            # Flexible matching for curve names (e.g., RT could be RDEP, RLLD)
            found = False
            for existing_curve in self.curves.keys():
                if curve in existing_curve:  # Simple substring match for now
                    found = True
                    break
            if not found:
                warnings.append(f"Crucial curve '{curve}' might be missing.")

        # 2. Check value ranges and nulls
        for curve_name, values in self.curves.items():
            # values is a list (from pandas to_dict('list')), might have None
            # Convert to numpy array, treating None as NaN
            arr = np.array(values, dtype=float) 
            
            # Null check
            nan_count = np.isnan(arr).sum()
            total_count = len(arr)
            if total_count > 0:
                null_ratio = nan_count / total_count
                if null_ratio > 0.5:
                    issues.append(f"Curve '{curve_name}' has {null_ratio:.1%} missing values.")
            
            # Range check (if strict range is known)
            norm_name = self._normalize_name(curve_name)
            if norm_name in self.ranges:
                min_valid, max_valid = self.ranges[norm_name]
                # Filter non-NaN values
                valid_data = arr[~np.isnan(arr)]
                if len(valid_data) > 0:
                    data_min = np.min(valid_data)
                    data_max = np.max(valid_data)
                    
                    if data_min < min_valid or data_max > max_valid:
                        warnings.append(
                            f"Curve '{curve_name}' data range [{data_min:.2f}, {data_max:.2f}] "
                            f"is outside standard bounds [{min_valid}, {max_valid}]."
                        )

        report = {
            "pass": len(issues) == 0,
            "issues": issues,
            "warnings": warnings
        }
        
        logger.info(f"QC completed. Pass: {report['pass']}, Issues: {len(issues)}, Warnings: {len(warnings)}")
        return report

    def _normalize_name(self, name: str) -> str:
        """Helper to map specific curve names to standard mnemonics."""
        name = name.upper()
        if name.startswith('GR'): return 'GR'
        if name.startswith('DT') or name.startswith('AC'): return 'DT'
        if name.startswith('RHOB') or name.startswith('DEN'): return 'RHOB'
        if name.startswith('NPHI') or name.startswith('CNL'): return 'NPHI'
        if name.startswith('RT') or name.startswith('RD') or name.startswith('RLL'): return 'RT'
        return name
