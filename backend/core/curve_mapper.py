"""
Curve Mapping Service

This module provides intelligent curve name mapping functionality:
1. Dictionary-based matching using curve_mapping.json
2. LLM-based suggestions for unmapped curves
3. User correction persistence
"""

import json
import os
import logging
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# Path to the curve mapping dictionary
MAPPING_FILE_PATH = Path(__file__).parent.parent.parent / "curve_mapping.json"


class CurveMapper:
    """
    Handles curve name mapping between raw LAS curve names and standard types.
    """
    
    def __init__(self, mapping_file: Optional[str] = None):
        self.mapping_file = Path(mapping_file) if mapping_file else MAPPING_FILE_PATH
        self._mapping_data: Optional[Dict] = None
        self._reverse_alias_map: Optional[Dict[str, str]] = None
        self._load_mapping()
    
    def _load_mapping(self) -> None:
        """Load the mapping dictionary from file."""
        try:
            if self.mapping_file.exists():
                with open(self.mapping_file, 'r', encoding='utf-8') as f:
                    self._mapping_data = json.load(f)
                self._build_reverse_alias_map()
                logger.info(f"Loaded curve mapping from {self.mapping_file}")
            else:
                logger.warning(f"Mapping file not found: {self.mapping_file}")
                self._mapping_data = {"version": "1.0", "standard_types": {}, "aliases": {}}
                self._reverse_alias_map = {}
        except Exception as e:
            logger.error(f"Failed to load mapping file: {e}")
            self._mapping_data = {"version": "1.0", "standard_types": {}, "aliases": {}}
            self._reverse_alias_map = {}
    
    def _build_reverse_alias_map(self) -> None:
        """Build a reverse lookup map: alias -> standard_type."""
        self._reverse_alias_map = {}
        aliases = self._mapping_data.get("aliases", {})
        
        for standard_type, alias_list in aliases.items():
            # Map the standard type to itself
            self._reverse_alias_map[standard_type.upper()] = standard_type
            # Map each alias to the standard type
            for alias in alias_list:
                self._reverse_alias_map[alias.upper()] = standard_type
    
    def reload(self) -> None:
        """Reload the mapping from file (useful after external edits)."""
        self._load_mapping()
    
    def get_standard_types(self) -> Dict[str, Dict]:
        """Get all standard curve types with their descriptions."""
        return self._mapping_data.get("standard_types", {})
    
    def map_curves(self, curve_names: List[str], curve_info: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Map a list of raw curve names to standard types.
        
        Args:
            curve_names: List of original curve names from LAS file
            curve_info: Optional dict with curve descriptions/units from LAS
            
        Returns:
            Dict with:
                - matched: {original_name: standard_type}
                - unmatched: [original_name, ...]
                - curve_details: {original_name: {unit, description}} for UI display
        """
        matched = {}
        unmatched = []
        curve_details = {}
        
        for name in curve_names:
            # Skip depth column as it's handled separately
            if name.upper() in ['DEPT', 'DEPTH', 'MD', 'TVD']:
                matched[name] = 'DEPTH'
                continue
            
            # Try to find in reverse alias map (case-insensitive)
            standard_type = self._reverse_alias_map.get(name.upper())
            
            if standard_type:
                matched[name] = standard_type
            else:
                unmatched.append(name)
            
            # Collect curve details for UI
            if curve_info and name in curve_info:
                curve_details[name] = {
                    "unit": curve_info[name].get("unit", ""),
                    "description": curve_info[name].get("description", "")
                }
            else:
                curve_details[name] = {"unit": "", "description": ""}
        
        return {
            "matched": matched,
            "unmatched": unmatched,
            "curve_details": curve_details
        }
    
    def save_user_mapping(self, original_name: str, standard_type: str) -> bool:
        """
        Save a user-confirmed mapping to the dictionary file.
        
        Args:
            original_name: The original curve name to add as an alias
            standard_type: The standard type it maps to
            
        Returns:
            True if saved successfully
        """
        if standard_type == "IGNORE":
            # Don't save IGNORE mappings
            return True
        
        try:
            # Add to aliases if not already present
            aliases = self._mapping_data.get("aliases", {})
            
            if standard_type not in aliases:
                aliases[standard_type] = []
            
            # Check for duplicates (case-insensitive)
            existing = [a.upper() for a in aliases[standard_type]]
            if original_name.upper() not in existing:
                aliases[standard_type].append(original_name)
                self._mapping_data["aliases"] = aliases
                
                # Save to file
                with open(self.mapping_file, 'w', encoding='utf-8') as f:
                    json.dump(self._mapping_data, f, ensure_ascii=False, indent=2)
                
                # Rebuild reverse map
                self._build_reverse_alias_map()
                logger.info(f"Saved mapping: {original_name} -> {standard_type}")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to save mapping: {e}")
            return False
    
    def add_standard_type(self, type_name: str, description: str, unit: str) -> bool:
        """
        Add a new standard type (user-defined).
        
        Args:
            type_name: The new standard type name (uppercase recommended)
            description: Bilingual description
            unit: Unit of measurement
            
        Returns:
            True if added successfully
        """
        try:
            standard_types = self._mapping_data.get("standard_types", {})
            
            if type_name in standard_types:
                logger.warning(f"Standard type already exists: {type_name}")
                return False
            
            standard_types[type_name] = {
                "description": description,
                "unit": unit
            }
            self._mapping_data["standard_types"] = standard_types
            
            # Initialize empty alias list
            aliases = self._mapping_data.get("aliases", {})
            aliases[type_name] = []
            self._mapping_data["aliases"] = aliases
            
            # Save to file
            with open(self.mapping_file, 'w', encoding='utf-8') as f:
                json.dump(self._mapping_data, f, ensure_ascii=False, indent=2)
            
            self._build_reverse_alias_map()
            logger.info(f"Added new standard type: {type_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to add standard type: {e}")
            return False


# LLM-based suggestion function
async def suggest_curve_mapping_with_llm(
    unmapped_curves: List[str],
    curve_details: Dict[str, Dict],
    standard_types: Dict[str, Dict]
) -> Dict[str, Optional[str]]:
    """
    Use LLM to suggest mappings for unmapped curves.
    
    Args:
        unmapped_curves: List of curve names that couldn't be matched
        curve_details: Dict with unit/description for each curve
        standard_types: Available standard types to map to
        
    Returns:
        Dict mapping original_name -> suggested_standard_type (or None if failed)
    """
    from backend.core.llm_service import LLMService
    
    if not unmapped_curves:
        return {}
    
    llm = LLMService()
    suggestions = {}
    
    # Build prompt
    type_list = "\n".join([
        f"- {name}: {info.get('description', '')} (单位: {info.get('unit', '')})"
        for name, info in standard_types.items()
        if name != "IGNORE"
    ])
    
    curve_list = "\n".join([
        f"- {name}: 原始描述={curve_details.get(name, {}).get('description', 'N/A')}, 单位={curve_details.get(name, {}).get('unit', 'N/A')}"
        for name in unmapped_curves
    ])
    
    prompt = f"""你是测井曲线专家。请将以下未识别的曲线名称映射到标准类型。

## 可用的标准类型:
{type_list}

## 需要映射的曲线:
{curve_list}

请为每条曲线返回最可能的标准类型。如果完全无法判断，返回null。
仅返回JSON格式，示例: {{"CURVE_NAME": "STANDARD_TYPE", "ANOTHER": null}}
"""

    try:
        response = llm.chat([{"role": "user", "content": prompt}])
        
        if response.get("success") and response.get("content"):
            content = response["content"]
            # Extract JSON from response
            import re
            json_match = re.search(r'\{[^{}]*\}', content, re.DOTALL)
            if json_match:
                suggestions = json.loads(json_match.group())
                logger.info(f"LLM suggested mappings: {suggestions}")
    except Exception as e:
        logger.error(f"LLM suggestion failed: {e}")
        # Return None for all on failure
        suggestions = {name: None for name in unmapped_curves}
    
    return suggestions


# Global instance for convenience
_mapper_instance: Optional[CurveMapper] = None

def get_curve_mapper() -> CurveMapper:
    """Get or create the global CurveMapper instance."""
    global _mapper_instance
    if _mapper_instance is None:
        _mapper_instance = CurveMapper()
    return _mapper_instance
