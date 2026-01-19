# Well Agent - 测井解释多智能体系统

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/Electron-28.0-47848F.svg" alt="Electron">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License">
</p>

基于多智能体架构的智能测井解释系统，通过岩性分析、电性分析和仲裁智能体的协同工作，实现油气层自动识别与解释。

## ✨ 特性亮点

- 🤖 **多智能体协同** - LithologyAgent、ElectricalAgent、ArbitratorAgent 三位专家协同推理
- 👆 **交互式深度分析** - Alt+拖拽进行层段选择，Alt+点击进行单点智能检测
- 📊 **专业测井可视化** - ECharts 驱动的交互式多道测井曲线显示
- 🎨 **岩性色标管理** - 自定义颜色映射、预设方案管理、语义化岩性标注
- 🌙 **现代化暗色主题** - Claude Code 风格专业 IDE 界面
- 💾 **会话持久化** - 完整的工作状态保存与恢复
- 🔄 **深度同步** - 多道曲线联动缩放与滚动

## 📸 界面预览

> 暂无截图，后续添加

## 🚀 快速开始

### 环境要求

- **Python** 3.10 或更高版本
- **Node.js** 18.0 或更高版本
- **npm** 9.0 或更高版本

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/YOUR_USERNAME/well_agent.git
cd well_agent
```

#### 2. 安装后端依赖

```bash
# 创建虚拟环境 (推荐)
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 Windows:
.\venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

#### 3. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

#### 4. 配置环境变量

创建 `.env` 文件并配置 API 密钥：

```env
# DeepSeek API Configuration
OPENCODE_API_KEY=your_deepseek_api_key_here
OPENCODE_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat
```

### 运行应用

#### 启动后端服务

```bash
# Windows PowerShell
$env:PYTHONPATH="."
python -m uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

# Linux/Mac
PYTHONPATH=. uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000
```

#### 启动前端开发服务器

```bash
cd frontend
npm run dev
```

访问 http://localhost:5173 查看应用。

## 📁 项目结构

```
well_agent/
├── backend/                    # Python 后端
│   ├── agents/                 # 智能体实现
│   │   ├── base_agent.py       # 基类
│   │   ├── lithology_agent.py  # 岩性分析智能体
│   │   ├── electrical_agent.py # 电性分析智能体
│   │   └── arbitrator_agent.py # 仲裁智能体
│   ├── api/                    # FastAPI 服务
│   │   └── main.py             # API 入口
│   ├── core/                   # 核心模块
│   │   ├── llm_service.py      # LLM 服务封装
│   │   └── workflow.py         # LangGraph 工作流
│   └── data_processing/        # 数据处理
│       ├── las_parser.py       # LAS 文件解析
│       └── quality_control.py  # 数据质控
├── frontend/                   # React + Electron 前端
│   ├── src/
│   │   ├── components/         # React 组件
│   │   │   ├── LogChart.tsx    # 测井图表组件
│   │   │   ├── TrackColumn.tsx # 曲线道组件
│   │   │   └── ...
│   │   ├── styles/             # 样式文件
│   │   └── App.tsx             # 主应用
│   ├── electron/               # Electron 配置
│   └── package.json
├── test_data/                  # 测试数据
├── requirements.txt            # Python 依赖
└── README.md
```

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| UI 组件库 | Ant Design 5 (Dark Mode) |
| 图表库 | ECharts 5 |
| 桌面框架 | Electron 28 |
| 后端框架 | FastAPI |
| AI 编排 | LangGraph |
| LLM 服务 | DeepSeek V3 |

## 📝 使用说明

1. **加载数据** - 点击侧边栏"加载文件"按钮，选择 LAS 格式测井文件
2. **查看曲线** - 在曲线面板中查看测井数据，支持缩放、滚动
3. **岩性配置** - 右键点击岩性道，选择"岩性色标设置"自定义颜色
4. **运行分析** - 按住 `Alt` 键在图表中拖动选择深度，或点击单点，在弹窗中输入问题启动分析
5. **保存会话** - 通过菜单保存当前工作状态

## 🗺️ 路线图

- [x] 核心智能体框架
- [x] 测井曲线可视化
- [x] 岩性色标管理
- [x] 会话保存/加载
- [x] 真实 LLM 工作流集成 (DeepSeek)
- [x] 交互式深度分析 (v1.1.0)
- [ ] 分析报告生成
- [ ] 知识库 (RAG) 集成
- [ ] 多井批量处理优化

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

<p align="center">Made with ❤️ for Geoscience</p>
