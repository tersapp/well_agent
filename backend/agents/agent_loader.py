"""
Agent Registry - Dynamic Agent Discovery and Loading

This module provides functions to load agent configurations from registry.yaml
and dynamically instantiate agent classes without hardcoding imports.
"""

import yaml
import importlib
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Cache for loaded registry
_registry_cache: Optional[Dict[str, Any]] = None
_agents_cache: Optional[Dict[str, Any]] = None


def get_registry_path() -> Path:
    """Get the path to registry.yaml"""
    return Path(__file__).parent / "registry.yaml"


def load_registry(force_reload: bool = False) -> Dict[str, Any]:
    """
    Load agent registry from YAML file.
    
    Args:
        force_reload: If True, bypass cache and reload from file
        
    Returns:
        Dictionary containing the full registry configuration
    """
    global _registry_cache
    
    if _registry_cache is not None and not force_reload:
        return _registry_cache
    
    registry_path = get_registry_path()
    
    if not registry_path.exists():
        logger.error(f"Registry file not found: {registry_path}")
        return {"agents": []}
    
    try:
        with open(registry_path, 'r', encoding='utf-8') as f:
            _registry_cache = yaml.safe_load(f)
            logger.info(f"Loaded {len(_registry_cache.get('agents', []))} agents from registry")
            return _registry_cache
    except Exception as e:
        logger.error(f"Failed to load registry: {e}")
        return {"agents": []}


def load_agents(force_reload: bool = False) -> Dict[str, Dict[str, Any]]:
    """
    Load and instantiate all agents from the registry.
    
    Returns:
        Dictionary mapping agent keys to their info:
        {
            'AgentKey': {
                'instance': <AgentInstance>,
                'name': '中文名',
                'abbr': 'X',
                'color': '#hex',
                'capabilities': [...],
                'keywords': [...],
                'skills': [...],
                'is_arbitrator': bool
            }
        }
    """
    global _agents_cache
    
    if _agents_cache is not None and not force_reload:
        return _agents_cache
    
    registry = load_registry(force_reload)
    agents = {}
    
    for agent_def in registry.get('agents', []):
        key = agent_def.get('key')
        if not key:
            logger.warning("Agent definition missing 'key', skipping")
            continue
        
        try:
            # Dynamic import
            module_path = agent_def.get('module')
            class_name = agent_def.get('class')
            
            if not module_path or not class_name:
                logger.warning(f"Agent {key} missing module/class, skipping")
                continue
            
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            instance = cls()
            
            agents[key] = {
                'instance': instance,
                'name': agent_def.get('name', key),
                'abbr': agent_def.get('abbr', key[0]),
                'color': agent_def.get('color', '#888888'),
                'capabilities': agent_def.get('capabilities', []),
                'keywords': agent_def.get('keywords', []),
                'skill_packs': agent_def.get('skill_packs', agent_def.get('skills', [])),
                'is_arbitrator': agent_def.get('is_arbitrator', False)
            }
            
            logger.debug(f"Loaded agent: {key}")
            
        except Exception as e:
            logger.error(f"Failed to load agent {key}: {e}")
            continue
    
    _agents_cache = agents
    logger.info(f"Successfully loaded {len(agents)} agents")
    return agents


def get_agent_skill_packs(agent_key: str) -> List[str]:
    """Get the list of skill pack names for a specific agent"""
    agent = get_agent(agent_key)
    if agent:
        return agent.get('skill_packs', [])
    return []


def get_agent_skills(agent_key: str) -> List[str]:
    """Alias for get_agent_skill_packs for backward compatibility"""
    return get_agent_skill_packs(agent_key)


def get_agent(key: str) -> Optional[Dict[str, Any]]:
    """Get a specific agent by key"""
    agents = load_agents()
    return agents.get(key)


def get_agent_instance(key: str):
    """Get just the agent instance by key"""
    agent = get_agent(key)
    return agent['instance'] if agent else None


def get_specialist_agents() -> Dict[str, Dict[str, Any]]:
    """Get all non-arbitrator agents"""
    agents = load_agents()
    return {k: v for k, v in agents.items() if not v.get('is_arbitrator', False)}


def get_arbitrator() -> Optional[Dict[str, Any]]:
    """Get the arbitrator agent"""
    agents = load_agents()
    for key, agent in agents.items():
        if agent.get('is_arbitrator', False):
            return agent
    return None


def build_team_description() -> str:
    """
    Build a human-readable description of all specialist agents
    for use in Arbitrator's prompt.
    """
    specialists = get_specialist_agents()
    lines = []
    
    for key, info in specialists.items():
        capabilities = ', '.join(info.get('capabilities', []))
        lines.append(f"- **{info['name']}** ({key}): {capabilities}")
    
    return "\n".join(lines)


def build_team_description_with_tools() -> str:
    """
    Build a description of all specialist agents INCLUDING their available tools.
    Used by Arbitrator for intelligent routing based on tool availability.
    """
    from backend.skills.registry import get_skill_registry
    registry = get_skill_registry()
    
    specialists = get_specialist_agents()
    lines = []
    
    for key, info in specialists.items():
        capabilities = ', '.join(info.get('capabilities', []))
        skill_packs = info.get('skill_packs', [])
        
        # Get tools for this agent
        tools = registry.list_tools_for_agent(skill_packs)
        tool_names = [t['name'] for t in tools]
        
        # Build tool keyword summary
        all_keywords = []
        for t in tools:
            all_keywords.extend(t.get('trigger_keywords', []))
        
        lines.append(f"### {info['name']} ({key})")
        lines.append(f"- 职责: {capabilities}")
        if tool_names:
            lines.append(f"- 可用工具: {', '.join(tool_names)}")
            lines.append(f"- 工具触发词: {', '.join(all_keywords[:10])}...")  # Limit keywords
        else:
            lines.append(f"- 可用工具: 无专用工具")
        lines.append("")
    
    return "\n".join(lines)


def get_router_keywords() -> Dict[str, List[str]]:
    """
    Get keyword mappings for router.
    
    Returns:
        {'agent_key': ['keyword1', 'keyword2', ...]}
    """
    specialists = get_specialist_agents()
    return {key: info.get('keywords', []) for key, info in specialists.items()}


def get_frontend_agent_list() -> List[Dict[str, str]]:
    """
    Get agent list formatted for frontend display.
    
    Returns:
        [{'key': 'AgentKey', 'name': '中文名', 'abbr': 'X', 'color': '#hex'}, ...]
    """
    agents = load_agents()
    return [
        {
            'key': key,
            'name': info['name'],
            'abbr': info['abbr'],
            'color': info['color']
        }
        for key, info in agents.items()
    ]


def reload_registry():
    """Force reload the registry (useful after config changes)"""
    global _registry_cache, _agents_cache
    _registry_cache = None
    _agents_cache = None
    return load_agents(force_reload=True)
