import lasio
import pandas as pd
import numpy as np
import logging
import json
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class LogDataParser:
    """
    Parser for LAS (Log ASCII Standard) files.
    """

    @staticmethod
    def parse_las_file(file_path: str) -> Dict[str, Any]:
        """
        Parse a LAS file and return a structured dictionary.
        
        Args:
            file_path: Path to the .las file.
            
        Returns:
            Dictionary containing well metadata and curve data.
        """
        try:
            logger.info(f"Parsing LAS file: {file_path}")
            las = lasio.read(file_path)
            
            # Extract metadata
            metadata = {
                "well": {
                    "name": las.well.WELL.value if 'WELL' in las.well else "Unknown",
                    "uwi": las.well.UWI.value if 'UWI' in las.well else None,
                    "api": las.well.API.value if 'API' in las.well else None,
                    "strt": las.well.STRT.value if 'STRT' in las.well else None,
                    "stop": las.well.STOP.value if 'STOP' in las.well else None,
                    "step": las.well.STEP.value if 'STEP' in las.well else None,
                    "null_value": las.well.NULL.value if 'NULL' in las.well else -999.25,
                },
                "params": {}
            }
            
            # Extract parameters if available
            for param in las.params:
                metadata["params"][param.mnemonic] = param.value

            # Convert curves to DataFrame then dict
            df = las.df()
            
            # Handle index (Depth)
            # lasio sets depth as index. We want it as a column for easier JSON serialization
            df = df.reset_index()
            
            # Replace NaN with None (JSON null) or keep as NaN (which might break some JSON parsers)
            # Standard practice: Replace NaN with None
            df_dict = df.replace({np.nan: None}).to_dict(orient='list')
            
            # Construct final data structure
            log_data = {
                "metadata": metadata,
                "curves": df_dict,
                "curve_info": {}
            }
            
            # Add curve descriptions
            for curve in las.curves:
                log_data["curve_info"][curve.mnemonic] = {
                    "unit": curve.unit,
                    "description": curve.descr
                }
                
            logger.info(f"Successfully parsed {file_path}. Found {len(df_dict.keys())} curves.")
            return log_data

        except Exception as e:
            logger.error(f"Failed to parse LAS file {file_path}: {str(e)}")
            raise e

    @staticmethod
    def save_to_json(log_data: Dict[str, Any], output_path: str):
        """Save parsed log data to a JSON file."""
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(log_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Saved log data to {output_path}")
        except Exception as e:
            logger.error(f"Failed to save JSON: {str(e)}")
            raise e
