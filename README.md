# Well Agent - 测井解释多智能体系统

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.10+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/React-18.2-61DAFB.svg" alt="React">
  <img src="https://img.shields.io/badge/Electron-28.0-47848F.svg" alt="Electron">
  <img src="https://img.shields.io/badge/FastAPI-0.100+-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg" alt="License">
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

<p align="center">
  <img src="prj_show/项目示例.png" alt="Well Agent 界面预览" width="100%">
</p>

## 🆕 新功能开发

### v1.2.0 (开发中)

- 🧠 **Agent Skills 架构** - 可扩展的技能系统，支持岩性分类、流体识别、储层评价等专业技能
- 📈 **交会图分析工具** - 支持多种测井交会图（密度-中子、M-N 图版等）的自动生成与解释
- 🎯 **曲线形态识别** - 基于算法的 GR 曲线形态分析，识别指状、箱形、钟形等特征
- 📊 **分析日志系统** - 完整的 Agent 和 LLM 调用追踪，支持工作流优化

### v1.1.0 (已发布)

- 👆 **交互式深度分析** - Alt+拖拽进行层段选择，Alt+点击进行单点智能检测
- 🎨 **岩性区间色标** - 支持基于值区间的岩性颜色映射，更精确的地层可视化
- 💬 **流式对话** - LLM 响应实时流式输出，提升交互体验

### 规划中

- 📄 **分析报告生成** - 自动生成专业格式的测井解释报告
- 🔍 **知识库 (RAG) 集成** - 接入油田知识库，增强解释准确性
- ⚡ **多井批量处理** - 支持批量加载和分析多口井数据

## 🚀 快速开始

### 环境要求

在开始之前，请确保您的系统已安装以下软件：

| 软件 | 最低版本 | 推荐版本 | 说明 |
|------|----------|----------|------|
| **Python** | 3.10 | 3.11+ | 后端运行环境 |
| **Node.js** | 18.0 | 20 LTS | 前端构建工具 |
| **npm** | 9.0 | 10+ | 包管理器（随 Node.js 安装） |
| **MongoDB** | 6.0 | 7.0+ | 数据库服务 |
| **Git** | 2.30 | 最新版 | 版本控制 |

#### 检查环境版本

```bash
# 检查 Python 版本
python --version    # 应显示 Python 3.10 或更高

# 检查 Node.js 版本
node --version      # 应显示 v18.0.0 或更高

# 检查 npm 版本
npm --version       # 应显示 9.0.0 或更高

# 检查 MongoDB 版本（如已安装）
mongod --version    # 应显示 db version v6.0 或更高
```

---

### 安装步骤

#### 1. 克隆仓库

```bash
git clone https://github.com/tersapp/well_agent.git
cd well_agent
```

#### 2. 安装 MongoDB

MongoDB 是本项目必需的数据库服务，用于存储会话和分析结果。

**Windows:**
1. 下载 [MongoDB Community Server](https://www.mongodb.com/try/download/community)
2. 运行安装程序，选择 "Complete" 安装
3. 勾选 "Install MongoDB as a Service" 以便自动启动
4. 验证安装：`mongod --version`

**macOS (使用 Homebrew):**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux (Ubuntu/Debian):**
```bash
# 导入 MongoDB 公钥
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# 添加仓库
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# 安装
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 3. 安装后端依赖

```bash
# 创建 Python 虚拟环境（强烈推荐）
python -m venv venv

# 激活虚拟环境
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Windows CMD:
.\venv\Scripts\activate.bat
# Linux/macOS:
source venv/bin/activate

# 安装 Python 依赖
pip install -r requirements.txt

# 安装 FastAPI 和 Uvicorn（如未包含在 requirements.txt）
pip install fastapi uvicorn[standard]
```

**主要后端依赖：**
- `fastapi` - 高性能 Web 框架
- `uvicorn` - ASGI 服务器
- `langchain` + `langgraph` - AI 编排框架
- `lasio` - LAS 文件解析
- `motor` - MongoDB 异步驱动
- `pandas` + `numpy` - 数据处理

#### 4. 安装前端依赖

```bash
cd frontend
npm install
cd ..
```

**主要前端依赖：**
- `react` + `react-dom` - UI 框架
- `antd` - Ant Design 组件库
- `echarts` - 测井曲线图表
- `zustand` - 状态管理
- `electron` - 桌面应用框架

#### 5. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
# ====== LLM API 配置 ======
# DeepSeek API（推荐）
OPENCODE_API_KEY=your_deepseek_api_key_here
OPENCODE_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 或使用其他兼容 OpenAI 格式的 API
# OPENCODE_API_KEY=your_api_key
# OPENCODE_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4

# ====== MongoDB 配置 ======
# 默认本地连接，无需修改
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=well_agent

# ====== 可选配置 ======
# 后端服务端口（默认 8000）
# API_PORT=8000
# 前端开发服务器端口（默认 5173）
# FRONTEND_PORT=5173
```

> ⚠️ **重要**: 请将 `your_deepseek_api_key_here` 替换为您的实际 API 密钥。您可以在 [DeepSeek 开放平台](https://platform.deepseek.com/) 获取 API 密钥。

---

### 运行应用

#### 方式一：开发模式（推荐）

需要打开 **两个终端窗口**，分别启动后端和前端服务：

**终端 1 - 启动后端服务：**

```bash
# 确保在项目根目录
cd well_agent

# Windows PowerShell
$env:PYTHONPATH="."
python -m uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000

# Linux/macOS
PYTHONPATH=. uvicorn backend.api.main:app --reload --host 0.0.0.0 --port 8000
```

后端启动成功后，您将看到：
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [xxxxx]
```

**终端 2 - 启动前端服务：**

```bash
cd frontend
npm run dev
```

前端启动成功后，您将看到：
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

#### 方式二：Electron 桌面应用模式

```bash
cd frontend
npm run electron-dev
```

这将同时启动前端开发服务器和 Electron 桌面应用。

---

### 访问应用

| 服务 | 地址 | 说明 |
|------|------|------|
| **Web 前端** | http://localhost:5173 | 在浏览器中访问 |
| **后端 API** | http://localhost:8000 | REST API 服务 |
| **API 文档** | http://localhost:8000/docs | Swagger UI 交互式文档 |
| **ReDoc 文档** | http://localhost:8000/redoc | ReDoc 格式 API 文档 |

---

### 常见问题排查

#### ❌ MongoDB 连接失败

**错误信息：** `ServerSelectionTimeoutError: localhost:27017`

**解决方案：**
1. 确认 MongoDB 服务正在运行：
   ```bash
   # Windows
   net start MongoDB
   
   # Linux
   sudo systemctl status mongod
   ```
2. 检查 `.env` 中的 `MONGODB_URI` 配置

#### ❌ LLM API 调用失败

**错误信息：** `401 Unauthorized` 或 `API key invalid`

**解决方案：**
1. 确认 `.env` 中的 `OPENCODE_API_KEY` 正确
2. 检查 API 密钥是否有效且有余额
3. 确认 `OPENCODE_BASE_URL` 与您的 API 提供商匹配

#### ❌ 前端页面空白

**可能原因：** 后端服务未启动

**解决方案：**
1. 确认后端服务正在运行（端口 8000）
2. 检查浏览器控制台是否有 CORS 错误
3. 刷新页面或清除浏览器缓存

#### ❌ 模块导入错误

**错误信息：** `ModuleNotFoundError: No module named 'xxx'`

**解决方案：**
```bash
# 确保激活了虚拟环境
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate      # Linux/macOS

# 重新安装依赖
pip install -r requirements.txt
```

#### ❌ 端口被占用

**错误信息：** `Address already in use`

**解决方案：**
```bash
# 查找占用端口的进程
# Windows
netstat -ano | findstr :8000

# Linux/macOS
lsof -i :8000

# 终止进程或更换端口
```

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
├── .agent/                     # Agent 配置
│   └── skills/                 # 专业技能定义
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
| 数据存储 | MongoDB |

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
- [x] Agent Skills 架构 (v1.2.0)
- [ ] 分析报告生成
- [ ] 知识库 (RAG) 集成
- [ ] 多井批量处理优化

## 📖 引用

如果您在学术论文或研究项目中使用了本项目，请按以下格式引用：

```bibtex
@software{well_agent,
  title = {Well Agent: 测井解释多智能体系统},
  author = {Well Agent Contributors},
  year = {2025},
  url = {https://github.com/tersapp/well_agent},
  note = {基于多智能体架构的智能测井解释系统}
}

或使用文本格式：

> Well Agent Contributors. (2025). Well Agent: 测井解释多智能体系统 [Computer software]. https://github.com/tersapp/well_agent

## ⚠️ 许可证

**版权所有 © 2025 Well Agent Contributors**

本项目采用 **CC BY-NC 4.0 (署名-非商业性使用 4.0 国际)** 许可证。

### 您可以自由地：

- **共享** — 在任何媒介以任何形式复制、发行本作品
- **演绎** — 修改、转换或以本作品为基础进行创作

### 惟须遵守下列条件：

- **署名** — 您必须给出适当的署名，提供指向本许可证的链接，同时标明是否对原始作品作了修改
- **非商业性使用** — 您不得将本作品用于商业目的

### 🚫 禁止商业使用

本项目 **严禁用于任何商业目的**，包括但不限于：

- 商业软件产品开发
- 付费服务或 SaaS 平台
- 企业内部商业项目
- 任何以盈利为目的的使用

如需商业使用授权，请联系项目维护者。

查看完整许可证：[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

在贡献之前，请注意：
1. 您提交的代码将遵循本项目的许可证条款
2. 请确保您有权贡献所提交的代码

---

<p align="center">Made with ❤️ for Geoscience</p>
