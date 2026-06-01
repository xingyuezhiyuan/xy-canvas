# 项目代码改编自：
# https://github.com/hero8152/Infinite-Canvas/tree/main
# 原作者：hero8152

# xymap AI

xymap AI 是一个面向 AI 图像生成、图像编辑、智能对话和无限画布创作的本地 Web 平台。项目采用 **FastAPI 后端 + 静态 HTML/JavaScript 前端** 架构，集成本地 ComfyUI 工作流、COMFLY 在线生图、ModelScope 云端模型、多提供商 API 管理、账号系统、资产库和画布节点编辑能力。

平台主入口为 [static/index.html](static/index.html)，后端主入口为 [main.py](main.py)，默认访问地址为：

```text
http://localhost:7000
```

## 核心能力

- **账号系统**：支持注册、登录、Token 校验、管理员用户管理，用户数据保存在 [data/users.json](data/users.json)。
- **主控制台**：侧边栏 + iframe 多页面工作台，支持主题切换、在线状态、队列状态和应用切换。
- **ComfyUI 图像应用**：集成图片编辑、3D 视角变换、CG 细化、2D 风格细化、抠图、扩图、高清修复、图像反推、文字抠图、万物移除等应用。
- **无限画布**：支持节点编辑、图像节点、输出节点、LLM 节点、生成器节点、音频/视频节点、PS 节点、日志面板、小导航栏和资产库。
- **在线生图**：通过 COMFLY / OpenAI 兼容协议调用在线图像模型，支持参考图、提示词预设和历史记录。
- **智能对话**：支持多轮对话、SSE 流式响应、会话保存、文本对话与图片生成模式。
- **API 多提供商管理**：支持 OpenAI 兼容协议、APIMart 异步协议、模型同步、连接测试和 API Key 管理。
- **本地资产与历史**：生成图片、画布资产、对话、历史记录均以本地文件方式保存，方便迁移和备份。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | FastAPI、Uvicorn、Pydantic、httpx、requests、Pillow、WebSocket |
| 前端 | HTML、原生 JavaScript、Tailwind CSS、本地主题系统、Lucide Icons、Three.js |
| AI 引擎 | 本地 ComfyUI、COMFLY、ModelScope、自定义 OpenAI 兼容提供商 |
| 数据存储 | JSON 文件、input/output 本地文件目录 |
| 运行环境 | Windows 优先，Python 3.12 便携环境/虚拟环境均可 |

## 快速开始

### 1. 安装依赖

如果是首次运行，可按项目脚本创建环境：

```bash
setup.bat
```

也可以直接安装 Python 依赖：

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

编辑 `API/.env`，根据需要填写：

```env
COMFLY_API_KEY=sk-你的COMFLY_KEY
MODELSCOPE_API_KEY=ms-你的MODELSCOPE_KEY
COMFYUI_INSTANCES=127.0.0.1:8188
```

如果有多个 ComfyUI 实例，可用逗号分隔：

```env
COMFYUI_INSTANCES=127.0.0.1:8188,127.0.0.1:4090
```

### 3. 启动后端

```bash
python main.py
```

或在 Windows 下双击启动脚本：

```text
启动.bat
```

启动后访问：

```text
http://localhost:7000
```

首次访问会进入登录页，可先注册账号再进入主控制台。用户名为 `admin` 时会自动识别为管理员账号。

### 4. 启动 ComfyUI

本地 ComfyUI 默认需要运行在：

```text
http://127.0.0.1:8188
ws://127.0.0.1:8188/ws
```

如果只使用在线生图或智能对话，可以不启动 ComfyUI；如果使用本地工作流、无限画布 ComfyUI 节点或独立 ComfyUI 应用，则需要保证对应工作流在 ComfyUI 中可正常运行。

## 运行模式

### 直连模式

部分前端应用会直接访问本地 ComfyUI：

```text
浏览器 → ComfyUI HTTP API / WebSocket → ComfyUI 服务
```

特点：

- 实时 WebSocket 进度反馈；
- 延迟低；
- 适合本机开发与单机使用；
- 依赖浏览器能访问 `127.0.0.1:8188`。

### 后端代理模式

部分画布节点和功能通过后端统一调用 ComfyUI：

```text
浏览器 → FastAPI 后端 → ComfyUI 实例 → output/ 本地结果
```

特点：

- 支持多 ComfyUI 实例；
- 可做队列和负载均衡；
- 可保存统一历史记录；
- 更适合局域网访问和多用户场景。

## 项目结构

```text
xymap/
├── main.py                         # FastAPI 后端主入口，包含认证、生成、对话、画布、资产、工作流等 API
├── requirements.txt                # Python 依赖
├── API/.env                        # API Key、模型和 ComfyUI 实例配置
├── api_providers.json              # API 提供商配置
├── global_config.json              # 全局配置缓存
├── history.json                    # 图像生成历史记录
├── data/
│   ├── users.json                  # 用户账号、密码哈希、Token 数据
│   ├── canvases/                   # 无限画布 JSON 数据
│   └── conversations/              # 对话数据
├── input/                          # ComfyUI 输入文件和用户/画布资产
├── output/                         # 生成结果输出目录
├── workflows/                      # ComfyUI 工作流 JSON
│   ├── custom/                     # 自定义工作流
│   ├── Z-Image.json
│   ├── Z-Image-Enhance.json
│   ├── 2511.json
│   ├── qwen-edit2511.json
│   ├── klein.json
│   ├── CGstyle-2.json
│   ├── F2K-gaoqingxiufu.json
│   ├── yichuwuti.json
│   ├── jiandanqubeijing.json
│   └── ...
├── static/                         # 前端静态资源
│   ├── index.html                  # 主控制台
│   ├── login.html                  # 登录/注册页
│   ├── online.html                 # 在线生图页面
│   ├── gpt-chat.html               # 智能对话页面
│   ├── canvas.html                 # 无限画布入口
│   ├── app/                        # 独立 ComfyUI 应用页面
│   ├── modules/                    # 无限画布和 ComfyUI 功能模块
│   ├── setting/                    # API、ComfyUI 等设置页面
│   ├── styles/canvas.css           # 画布样式
│   ├── theme.css                   # 全局主题样式
│   └── theme.js                    # 主题同步逻辑
├── docs/                           # 技术文档
│   ├── README.md                   # 文档索引
│   ├── architecture.md             # 架构说明
│   ├── api-reference.md            # API 参考
│   ├── frontend-architecture.md    # 前端架构
│   ├── deployment-guide.md         # 部署指南
│   ├── kaifa.md                    # 开发更新日志
│   └── modules/                    # 模块文档
├── setup.bat                       # 环境初始化脚本
├── 启动.bat                        # Windows 启动脚本
├── 运行说明.txt                    # 简要运行说明
└── CLAUDE.md                       # AI 助手协作规则
```

## 前端页面概览

### 主入口与通用页面

| 页面 | 说明 |
|------|------|
| [static/index.html](static/index.html) | 主控制台，负责导航、iframe 容器、主题同步、登录校验和状态监视 |
| [static/login.html](static/login.html) | 注册/登录页 |
| [static/online.html](static/online.html) | 在线生图、参考图、提示词预设、历史卡片、去除背景等功能 |
| [static/gpt-chat.html](static/gpt-chat.html) | 智能对话页面 |
| [static/canvas.html](static/canvas.html) | 无限画布入口 |

### 独立 ComfyUI 应用

| 应用 | 页面 | 说明 |
|------|------|------|
| 图片编辑 | [static/app/klein.html](static/app/klein.html) | FLUX Klein / ModelScope 图像编辑 |
| 3D 视角变换 | [static/app/angle.html](static/app/angle.html) | Three.js 预览 + 视角控制生成 |
| CG 一键细化 | [static/app/cgstyle.html](static/app/cgstyle.html) | CG 风格增强 |
| 2D 风格细化 | [static/app/2dstyle.html](static/app/2dstyle.html) | 二次元/2D 风格增强 |
| 一键抠图 | [static/app/rmbg.html](static/app/rmbg.html) | 背景分离 |
| 万物移除 | [static/app/yichuwuti.html](static/app/yichuwuti.html) | 遮罩涂抹后移除物体 |
| 高清修复 | [static/app/gaoqingxiufu.html](static/app/gaoqingxiufu.html) | 图像修复与增强 |
| 扩图 | [static/app/kuotu.html](static/app/kuotu.html) | 四方向画布扩展 |
| 图像反推 | [static/app/promptgen.html](static/app/promptgen.html) | 图片反推提示词 |
| 文字抠图 | [static/app/textmatting.html](static/app/textmatting.html) | 文字/语义抠图 |

## 无限画布模块

无限画布由 [static/canvas.html](static/canvas.html) 加载，核心逻辑拆分在 [static/modules/](static/modules/) 中。

常见模块：

| 模块 | 说明 |
|------|------|
| [static/modules/canvas-all.js](static/modules/canvas-all.js) | 画布核心逻辑 |
| [static/modules/comfyui-registry.js](static/modules/comfyui-registry.js) | ComfyUI 模式注册表 |
| [static/modules/comfyui-utils.js](static/modules/comfyui-utils.js) | ComfyUI 通用工具 |
| [static/modules/image-node.js](static/modules/image-node.js) | 图片节点和遮罩编辑 |
| [static/modules/output-node.js](static/modules/output-node.js) | 输出节点、图片预览和对比 |
| [static/modules/generator-node.js](static/modules/generator-node.js) | API 生图节点 |
| [static/modules/llm-node.js](static/modules/llm-node.js) | LLM 辅助节点 |
| [static/modules/asset-library.js](static/modules/asset-library.js) | 资产库 |
| [static/modules/image-editor.js](static/modules/image-editor.js) | 裁剪、画笔、扩图等图片编辑器 |
| [static/modules/minimap-nav.js](static/modules/minimap-nav.js) | 小导航栏 |
| [static/modules/logs-panel.js](static/modules/logs-panel.js) | 生成日志面板 |
| [static/modules/settings.js](static/modules/settings.js) | 设置和 AuthManager |

当前画布支持的 ComfyUI 模式包括：Klein 图像编辑、CG 细化、2D 风格细化、风格迁移、高清修复、扩图、一键抠图、抠半透明、图标细化、Qwen 图像编辑、图像反推、移除物体、简单背景等。

## 后端 API 概览

后端接口集中在 [main.py](main.py)，详细说明见 [docs/api-reference.md](docs/api-reference.md)。常用接口如下：

| 分类 | 接口 |
|------|------|
| 认证 | `/api/auth/register`、`/api/auth/login`、`/api/auth/me`、`/api/auth/logout`、`/api/auth/admin/*` |
| 配置 | `/api/config`、`/api/config/update`、`/api/models`、`/api/config/token` |
| 图像生成 | `/api/generate`、`/api/online-image`、`/api/ms/generate`、`/generate` |
| 画布任务 | `/api/canvas-image-tasks`、`/api/canvas-image-tasks/{task_id}` |
| 对话 | `/api/chat`、`/api/chat/stream`、`/api/canvas-llm`、`/api/conversations/*` |
| 画布 | `/api/canvases`、`/api/canvases/{id}`、`/api/canvases/trash`、`/api/canvases/{id}/restore`、`/api/canvases/{id}/purge` |
| 资产 | `/api/user/assets`、`/api/user/assets/save-from-url`、`/api/canvases/{id}/assets/*` |
| 上传下载 | `/api/upload`、`/api/ai/upload`、`/api/view`、`/output/{path}`、`/assets/{path}`、`/api/download-output`、`/api/download-output-zip` |
| 历史与队列 | `/api/history`、`/api/history/save`、`/api/history/delete`、`/api/queue_status` |
| ComfyUI 设置 | `/api/comfyui/instances`、`/api/comfyui/system_stats`、`/api/comfyui/upload/image` |
| 工作流 | `/api/workflows`、`/api/workflows/{name}`、`/api/workflows/{name}/config`、`/api/workflows/{name}/run` |
| 提供商 | `/api/providers`、`/api/providers/test-connection`、`/api/providers/probe-async`、`/api/providers/fetch-models` |
| WebSocket | `/ws/stats` |

## 数据与文件说明

| 路径 | 说明 |
|------|------|
| `API/.env` | API Key、默认模型、ComfyUI 实例等环境变量 |
| `api_providers.json` | 可视化 API 提供商配置 |
| `global_config.json` | 全局配置缓存 |
| `history.json` | 生成历史记录 |
| `data/users.json` | 用户账号数据，包含密码哈希和 Token |
| `data/canvases/` | 无限画布数据 |
| `data/conversations/` | 对话数据 |
| `input/` | 用户资产和传给 ComfyUI 的输入文件 |
| `output/` | AI 生成结果、参考图上传结果和画布输出 |
| `workflows/` | ComfyUI 工作流文件 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `COMFYUI_INSTANCES` | ComfyUI 实例列表，逗号分隔，默认可设为 `127.0.0.1:8188` |
| `COMFLY_API_KEY` | COMFLY 平台 API Key |
| `COMFLY_BASE_URL` | COMFLY / OpenAI 兼容接口地址 |
| `MODELSCOPE_API_KEY` | ModelScope API Key |
| `MODELSCOPE_CHAT_MODELS` | ModelScope 聊天模型列表 |
| `CHAT_MODEL` | 默认聊天模型 |
| `IMAGE_MODEL` | 默认图像模型 |
| `CHAT_MODELS` | 可选聊天模型列表 |
| `IMAGE_MODELS` | 可选图像模型列表 |
| `SYSTEM_PROMPT` | 默认系统提示词 |
| `REQUEST_TIMEOUT` | 请求超时时间 |
| `IMAGE_POLL_INTERVAL` | 图像任务轮询间隔 |
| `MAX_HISTORY_MESSAGES` | 对话上下文最大历史消息数 |

## 开发注意事项

1. **修改后端需要重启服务**  
   修改 [main.py](main.py) 后，需要重启 `python main.py` 或重新运行启动脚本。

2. **前端缓存版本号**  
   修改功能相关前端文件时，需要同步检查 [static/index.html](static/index.html) 中引用资源的版本号。版本号格式为 `日期+序号`，例如 `20260529001`。

3. **保持离线可用**  
   项目大量静态资源已本地化，开发时优先使用本地资源，避免新增外部 CDN 依赖。

4. **工作流文件要与 ComfyUI 环境匹配**  
   使用本地 ComfyUI 功能前，应确认 [workflows/](workflows/) 中对应工作流在当前 ComfyUI 环境中可正常执行，且节点、模型、LoRA、插件齐全。

5. **数据文件谨慎处理**  
   [data/users.json](data/users.json)、[history.json](history.json)、[data/canvases/](data/canvases/) 和 [output/](output/) 可能包含本地用户数据和生成结果，提交或打包前应确认是否需要排除。

## 文档导航

| 文档 | 说明 |
|------|------|
| [docs/README.md](docs/README.md) | 技术文档索引 |
| [docs/architecture.md](docs/architecture.md) | 系统架构概览 |
| [docs/api-reference.md](docs/api-reference.md) | API 接口参考 |
| [docs/frontend-architecture.md](docs/frontend-architecture.md) | 前端架构说明 |
| [docs/deployment-guide.md](docs/deployment-guide.md) | 部署与运维指南 |
| [docs/kaifa.md](docs/kaifa.md) | 开发更新日志 |
| [docs/modules/account-system.md](docs/modules/account-system.md) | 账号系统 |
| [docs/modules/app.md](docs/modules/app.md) | ComfyUI 应用详解 |
| [docs/modules/canvas-system.md](docs/modules/canvas-system.md) | 无限画布系统 |
| [docs/modules/chat-system.md](docs/modules/chat-system.md) | 对话系统 |
| [docs/modules/image-generation.md](docs/modules/image-generation.md) | 图像生成模块 |
| [docs/modules/asset-library.md](docs/modules/asset-library.md) | 资产库系统 |
| [docs/modules/comfyui-workflow-guide.md](docs/modules/comfyui-workflow-guide.md) | ComfyUI 工作流开发指南 |
| [docs/modules/progress-bar-integration.md](docs/modules/progress-bar-integration.md) | 进度条集成指南 |
| [docs/modules/html-app-migration.md](docs/modules/html-app-migration.md) | HTML 应用迁移指南 |

## 相关链接

- COMFLY 注册：https://api.ukiyostudio.co/register?aff=pKk8
- COMFLY Token：https://api.ukiyostudio.co/token
- ModelScope Token：https://www.modelscope.cn/my/access/token
- ComfyUI 文档：https://docs.comfy.org/
