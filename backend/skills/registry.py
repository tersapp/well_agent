import importlib
import importlib.util
import json
import yaml
import os
from typing import Dict, Any, List, Optional
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def get_project_root() -> Path:
    """Get project root (same logic as skill_loader)"""
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".agent").exists():
            return parent
    return Path(__file__).resolve().parent.parent.parent


class SkillRegistry:
    """
    Registry for managing skills and tools.
    Supports standard Antigravity skill structure (.agent/skills).
    """
    
    def __init__(self, skills_dir: str = None):
        if skills_dir is None:
            # Default to .agent/skills
            root = get_project_root()
            self.skills_dir = str(root / ".agent" / "skills")
        else:
            self.skills_dir = skills_dir
            
        self.skill_packs: Dict[str, Dict[str, Any]] = {}
        self.tools: Dict[str, Dict[str, Any]] = {}
        self.reload()

    def reload(self):
        """Scans the skills directory and loads all available skills."""
        self.skill_packs = {}
        self.tools = {}
        
        if not os.path.exists(self.skills_dir):
            logger.warning(f"Skills directory not found: {self.skills_dir}")
            return

        # Walk immediate subdirectories
        for skill_name in os.listdir(self.skills_dir):
            skill_path = os.path.join(self.skills_dir, skill_name)
            if os.path.isdir(skill_path):
                try:
                    self._load_skill(skill_path, skill_name)
                except Exception as e:
                    logger.error(f"Failed to load skill from {skill_path}: {e}")

    def _load_skill(self, skill_path: str, skill_dir_name: str):
        """Loads a single skill from its directory."""
        
        # 1. Try tools.yaml (New Standard)
        tools_yaml = os.path.join(skill_path, 'tools.yaml')
        skill_json = os.path.join(skill_path, 'skill.json')
        
        metadata = {}
        is_legacy = False
        
        if os.path.exists(tools_yaml):
            with open(tools_yaml, 'r', encoding='utf-8') as f:
                metadata = yaml.safe_load(f)
        elif os.path.exists(skill_json):
            # Legacy fallback
            is_legacy = True
            with open(skill_json, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
        else:
            # No tool definition found (might be a pure knowledge skill)
            return

        # Register Skill Pack
        # Ideally read name from SKILL.md, but here we use dir name or metadata
        pack_name = metadata.get('skill_pack', metadata.get('name', skill_dir_name))
        
        metadata['directory'] = skill_path
        self.skill_packs[pack_name] = metadata
        
        # Register Tools
        if 'tools' in metadata:
            for tool in metadata['tools']:
                self._register_tool(tool, pack_name, skill_path)
        elif is_legacy and 'entry_point' in metadata:
             # Legacy single-tool skill
             self._register_tool(metadata, pack_name, skill_path)

    def _register_tool(self, tool_def: Dict[str, Any], pack_name: str, skill_path: str):
        tool_name = tool_def.get('name')
        if not tool_name:
            return
            
        tool_def['skill_pack'] = pack_name
        tool_def['directory'] = skill_path
        self.tools[tool_name] = tool_def
        logger.info(f"Loaded tool: {tool_name} (from {pack_name})")

    def list_skills(self) -> List[Dict[str, Any]]:
        """Returns a list of all registered tools (for backward compatibility)."""
        return list(self.tools.values())
    
    def list_skill_packs(self) -> List[Dict[str, Any]]:
        """Returns a list of skill packs."""
        return list(self.skill_packs.values())
    
    def list_tools(self) -> List[Dict[str, Any]]:
        """Returns a list of all registered tools."""
        return list(self.tools.values())

    def list_tools_for_agent(self, agent_skill_packs: List[str]) -> List[Dict[str, Any]]:
        """Returns tools available to an agent."""
        available_tools = []
        for pack_name in agent_skill_packs:
            # Check if we have this pack
            # Handle potential name mismatches (folder name vs pack name) using contains
            # But dict lookup is strict. Agents should use correct pack names.
            
            # 1. Try direct lookup
            if pack_name in self.skill_packs:
                pack = self.skill_packs[pack_name]
                if 'tools' in pack:
                    available_tools.extend(pack['tools'])
                elif 'entry_point' in pack:
                    available_tools.append(pack)
            else:
                # Fallback: maybe the agent refers to 'lithology' but pack is 'lithology-classification'
                pass
                
        return available_tools
    
    def match_tools_by_keywords(self, user_question: str, agent_skill_packs: List[str] = None) -> List[Dict[str, Any]]:
        if agent_skill_packs:
            candidate_tools = self.list_tools_for_agent(agent_skill_packs)
        else:
            candidate_tools = list(self.tools.values())
        
        matched = []
        question_lower = user_question.lower()
        
        for tool in candidate_tools:
            keywords = tool.get('trigger_keywords', [])
            for kw in keywords:
                if kw.lower() in question_lower:
                    matched.append(tool)
                    break 
        return matched

    def execute_tool(self, tool_name: str, **kwargs) -> Any:
        tool_info = self.tools.get(tool_name)
        if not tool_info:
            raise ValueError(f"Tool '{tool_name}' not found.")
            
        entry_point = tool_info.get('entry_point')
        if not entry_point:
            raise ValueError(f"Tool '{tool_name}' has no entry_point.")
            
        # Parse entry point: module:function
        if ':' in entry_point:
            module_name, func_name = entry_point.split(':')
        else:
            module_name = entry_point
            func_name = 'execute'
            
        skill_dir = tool_info['directory']
        
        # 1. Try loading from scripts/ directory (Standard)
        script_path = os.path.join(skill_dir, 'scripts', f"{module_name}.py")
        
        # 2. Key Fallback: content might be in root (Legacy)
        if not os.path.exists(script_path):
            script_path = os.path.join(skill_dir, f"{module_name}.py")
            
        if not os.path.exists(script_path):
             raise ImportError(f"Script not found for tool {tool_name}: {script_path}")
             
        # Dynamic Import
        try:
            spec = importlib.util.spec_from_file_location(module_name, script_path)
            if spec and spec.loader:
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                func = getattr(module, func_name)
                return func(**kwargs)
            else:
                raise ImportError(f"Could not load spec for {script_path}")
        except Exception as e:
            logger.error(f"Error executing tool {tool_name}: {e}")
            raise e


# Global singleton
_registry = None

def get_skill_registry() -> SkillRegistry:
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
    return _registry

def reload_skill_registry() -> SkillRegistry:
    global _registry
    _registry = SkillRegistry()
    return _registry

