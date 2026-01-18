"""
Skill Loader - 按标准格式加载和管理 Agent Skills

遵循 Claude/Antigravity Agent Skills 标准:
- Skills 存放在 .agent/skills/ 目录
- 每个 Skill 包含 SKILL.md (YAML frontmatter + Markdown body)
- 可选包含 scripts/, references/, assets/ 子目录
"""

import os
import re
import yaml
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Cache
_skills_cache: Optional[Dict[str, Dict[str, Any]]] = None
_project_context_cache: Optional[Dict[str, Any]] = None


def get_project_root() -> Path:
    """获取项目根目录"""
    # 从当前文件向上查找包含 .agent 目录的路径
    current = Path(__file__).resolve()
    for parent in [current] + list(current.parents):
        if (parent / ".agent").exists():
            return parent
    # 默认回退
    return Path(__file__).resolve().parent.parent.parent


def get_skills_dir() -> Path:
    """获取 Skills 目录路径"""
    return get_project_root() / ".agent" / "skills"


def get_project_context_path() -> Path:
    """获取项目上下文配置路径"""
    return get_project_root() / ".agent" / "project_context.yaml"


def parse_skill_md(content: str) -> Dict[str, Any]:
    """
    解析 SKILL.md 文件
    返回: { 'name': ..., 'description': ..., 'content': ... }
    """
    # 匹配 YAML frontmatter
    frontmatter_pattern = re.compile(r'^---\s*\n(.*?)\n---\s*\n', re.DOTALL)
    match = frontmatter_pattern.match(content)
    
    if match:
        frontmatter_text = match.group(1)
        body = content[match.end():]
        try:
            frontmatter = yaml.safe_load(frontmatter_text)
        except yaml.YAMLError:
            frontmatter = {}
    else:
        frontmatter = {}
        body = content
    
    return {
        'name': frontmatter.get('name', ''),
        'description': frontmatter.get('description', ''),
        'content': body.strip()
    }


def load_skill(skill_name: str, force_reload: bool = False) -> Optional[Dict[str, Any]]:
    """
    加载指定 Skill
    
    返回:
    {
        'name': 'skill-name',
        'description': '...',
        'content': 'Markdown body',
        'references': { 'filename': content, ... },
        'path': Path
    }
    """
    global _skills_cache
    
    if not force_reload and _skills_cache and skill_name in _skills_cache:
        return _skills_cache[skill_name]
    
    skills_dir = get_skills_dir()
    skill_path = skills_dir / skill_name
    skill_md_path = skill_path / "SKILL.md"
    
    if not skill_md_path.exists():
        logger.warning(f"Skill not found: {skill_name}")
        return None
    
    try:
        with open(skill_md_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        skill_data = parse_skill_md(content)
        skill_data['path'] = skill_path
        
        # 加载 references 目录下的 YAML/JSON 文件
        references = {}
        refs_dir = skill_path / "references"
        if refs_dir.exists():
            for ref_file in refs_dir.iterdir():
                if ref_file.suffix in ['.yaml', '.yml', '.json']:
                    try:
                        with open(ref_file, 'r', encoding='utf-8') as f:
                            if ref_file.suffix == '.json':
                                import json
                                references[ref_file.name] = json.load(f)
                            else:
                                references[ref_file.name] = yaml.safe_load(f)
                    except Exception as e:
                        logger.warning(f"Failed to load reference {ref_file}: {e}")
        
        skill_data['references'] = references
        
        # 缓存
        if _skills_cache is None:
            _skills_cache = {}
        _skills_cache[skill_name] = skill_data
        
        return skill_data
        
    except Exception as e:
        logger.error(f"Failed to load skill {skill_name}: {e}")
        return None


def get_all_skills_summary() -> List[Dict[str, str]]:
    """
    获取所有 Skills 的摘要 (name + description)
    用于发现阶段，不加载完整内容
    """
    skills_dir = get_skills_dir()
    summaries = []
    
    if not skills_dir.exists():
        return summaries
    
    for skill_folder in skills_dir.iterdir():
        if skill_folder.is_dir():
            skill_md = skill_folder / "SKILL.md"
            if skill_md.exists():
                try:
                    with open(skill_md, 'r', encoding='utf-8') as f:
                        content = f.read()
                    parsed = parse_skill_md(content)
                    summaries.append({
                        'name': parsed['name'] or skill_folder.name,
                        'description': parsed['description']
                    })
                except Exception as e:
                    logger.warning(f"Failed to parse skill summary for {skill_folder.name}: {e}")
    
    return summaries


def load_project_context(force_reload: bool = False) -> Dict[str, Any]:
    """
    加载项目上下文配置
    """
    global _project_context_cache
    
    if not force_reload and _project_context_cache is not None:
        return _project_context_cache
    
    context_path = get_project_context_path()
    
    if not context_path.exists():
        logger.info("No project_context.yaml found")
        return {}
    
    try:
        with open(context_path, 'r', encoding='utf-8') as f:
            _project_context_cache = yaml.safe_load(f) or {}
            return _project_context_cache
    except Exception as e:
        logger.error(f"Failed to load project context: {e}")
        return {}


def build_agent_context(agent_skills: List[str]) -> str:
    """
    为指定智能体构建完整上下文
    
    Args:
        agent_skills: 该智能体关联的 Skill 名称列表
        
    Returns:
        格式化的上下文字符串，包含项目背景和技能内容
    """
    parts = []
    
    # 1. 项目背景
    project_ctx = load_project_context()
    if project_ctx:
        parts.append("## 项目背景\n")
        
        if 'project' in project_ctx:
            p = project_ctx['project']
            parts.append(f"- 项目: {p.get('name', 'N/A')}")
            parts.append(f"- 盆地: {p.get('basin', 'N/A')}")
            parts.append(f"- 目的层: {p.get('formation', 'N/A')}")
        
        if 'geology' in project_ctx:
            g = project_ctx['geology']
            parts.append(f"\n### 地质特征")
            parts.append(f"- 目标岩性: {g.get('target_lithology', 'N/A')}")
            parts.append(f"- 沉积环境: {g.get('depositional_environment', 'N/A')}")
            parts.append(f"- 预期孔隙度: {g.get('expected_porosity_range', 'N/A')}")
            parts.append(f"- 预期渗透率: {g.get('expected_permeability_range', 'N/A')}")
        
        if 'fluids' in project_ctx:
            f = project_ctx['fluids']
            parts.append(f"\n### 流体信息")
            parts.append(f"- 油品类型: {f.get('oil_type', 'N/A')}")
            parts.append(f"- 地层水电阻率: {f.get('formation_water_resistivity_ohmm', 'N/A')} ohm.m")
        
        if 'interpretation_notes' in project_ctx:
            parts.append(f"\n### 解释注意事项")
            for note in project_ctx['interpretation_notes']:
                parts.append(f"- {note}")
        
        parts.append("")
    
    # 2. 技能内容
    if agent_skills:
        parts.append("## 专业知识参考\n")
        
        for skill_name in agent_skills:
            skill = load_skill(skill_name)
            if skill:
                parts.append(f"### {skill.get('name', skill_name)}")
                parts.append(skill.get('content', ''))
                parts.append("")
    
    return "\n".join(parts)


def reload_all():
    """重新加载所有缓存"""
    global _skills_cache, _project_context_cache
    _skills_cache = None
    _project_context_cache = None
    load_project_context(force_reload=True)
    # Skills 按需加载，这里只清空缓存
