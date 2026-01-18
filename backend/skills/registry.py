import importlib
import json
import os
from typing import Dict, Any, List, Optional
import logging
import pandas as pd

logger = logging.getLogger(__name__)

class SkillRegistry:
    def __init__(self, skills_dir: str = None):
        if skills_dir is None:
            # Default to current directory
            skills_dir = os.path.dirname(os.path.abspath(__file__))
        self.skills_dir = skills_dir
        self.skills: Dict[str, Dict[str, Any]] = {}
        self.reload()

    def reload(self):
        """Scans the skills directory and loads all available skills."""
        self.skills = {}
        # Walk through subdirectories
        for root, dirs, files in os.walk(self.skills_dir):
            if 'skill.json' in files:
                try:
                    self._load_skill(root)
                except Exception as e:
                    logger.error(f"Failed to load skill from {root}: {e}")

    def _load_skill(self, skill_path: str):
        """Loads a single skill from its directory."""
        meta_file = os.path.join(skill_path, 'skill.json')
        with open(meta_file, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        # Validation
        if 'name' not in metadata or 'entry_point' not in metadata:
            logger.warning(f"Invalid skill metadata in {skill_path}: missing name or entry_point")
            return

        skill_name = metadata['name']
        
        # Resolve python module
        # skill_path is absolute, calculate relative path for import
        rel_path = os.path.relpath(skill_path, os.path.dirname(os.path.dirname(self.skills_dir)))
        # e.g., backend/skills/statistics
        
        module_name =  rel_path.replace(os.path.sep, '.')
        # e.g. backend.skills.statistics
        
        metadata['module_path'] = module_name
        metadata['directory'] = skill_path
        
        self.skills[skill_name] = metadata
        logger.info(f"Loaded skill: {skill_name}")

    def list_skills(self) -> List[Dict[str, Any]]:
        """Returns a list of available skills (metadata only)."""
        return list(self.skills.values())

    def get_skill(self, skill_name: str) -> Optional[Dict[str, Any]]:
        return self.skills.get(skill_name)

    def execute_skill(self, skill_name: str, **kwargs) -> Any:
        """
        Executes a skill by name.
        
        Args:
            skill_name: Name of the skill to execute.
            **kwargs: Arguments to pass to the skill function.
        """
        skill_info = self.skills.get(skill_name)
        if not skill_info:
            raise ValueError(f"Skill '{skill_name}' not found.")
            
        entry_point = skill_info.get('entry_point') # e.g., "find_extremes.execute"
        module_file = entry_point.split(':')[0] # e.g., "find_extremes"
        func_name = entry_point.split(':')[1] if ':' in entry_point else 'execute'
        
        # Import module
        module_path = f"{skill_info['module_path']}.{module_file}"
        try:
            module = importlib.import_module(module_path)
        except ImportError as e:
            # Try reloading if it was added dynamically
            importlib.invalidate_caches()
            module = importlib.import_module(module_path)

        func = getattr(module, func_name)
        return func(**kwargs)

# Global singleton
_registry = None

def get_skill_registry() -> SkillRegistry:
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry
