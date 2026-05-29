# 无限画布 AI 创作平台 - 技术文档

## 项目简介

无限画布 AI 创作平台是一个基于 FastAPI 和原生 JavaScript 构建的全栈 AI 图像/视频生成系统。项目提供可视化的节点编辑界面，支持多种 AI 生成引擎（ComfyUI、ModelScope、OpenAI 兼容 API），实现了从提示词输入到图像/视频输出的完整工作流。

### 核心功能

- **无限画布系统**：基于节点的工作流编辑器，支持拖拽、缩放、多选操作
- **多引擎集成**：ComfyUI、ModelScope API、OpenAI 兼容 API、视频生成
- **节点工作流**：图片、提示词、循环节点、LLM 节点、输出节点等
- **API 管理**：多平台 API 配置、模型管理、LoRA 管理
- **国际化支持**：中英文双语切换
- **主题系统**：明暗主题切换
- **历史管理**：生成历史记录、批量管理

## 技术栈

### 后端
- **FastAPI**：Python Web 框架
- **WebSocket**：实时通信和在线人数追踪
- **PIL (Pillow)**：图像处理
- **httpx/requests**：HTTP 客户端
- **Pydantic**：数据验证和模型定义

### 前端
- **原生 JavaScript**：无框架依赖，IIFE 模块化
- **Tailwind CSS**：原子化 CSS 框架（CDN）
- **Lucide Icons**：图标库
- **CSS Variables**：主题系统

## 项目架构

```
┌─────────────────────────────────────────────────────────────┐
│                         前端层                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ index    │ │ canvas   │ │ online   │ │ api-settings │   │
│  │ 首页     │ │ 画布     │ │ 在线生图 │ │ API 设置     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ gpt-chat │ │ enhance  │ │ angle    │ │ comfyui-set  │   │
│  │ GPT 对话 │ │ 细节增强 │ │ 角度控制 │ │ ComfyUI 设置 │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              静态工具模块 (static/)                    │  │
│  │  theme.js │ i18n.js │ image-preview.js │ history-   │  │
│  │                              bulk-manager.js         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       后端层 (main.py)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│  │ REST API     │ │ WebSocket    │ │ 文件处理           │   │
│  │ 画布/历史/API │ │ 实时通信     │ │ 图片上传/下载     │   │
│  └──────────────┘ └──────────────┘ └───────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              外部服务代理                              │  │
│  │  ComfyUI │ ModelScope │ OpenAI API │ 视频生成 API   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 项目结构

```
26-5-17-无限画布/
├── main.py                          # FastAPI 后端主入口
├── static/                          # 前端静态资源
│   ├── index.html                   # 首页
│   ├── canvas.html                  # 无限画布页面
│   ├── online.html                  # 在线生图页面
│   ├── gpt-chat.html                # GPT 对话页面
│   ├── enhance.html                 # 细节增强页面
│   ├── angle.html                   # 角度控制页面
│   ├── api-settings.html            # API 设置页面
│   ├── comfyui-settings.html        # ComfyUI 设置页面
│   ├── theme.js                     # 主题管理模块
│   ├── i18n.js                      # 国际化模块
│   ├── image-preview.js             # 图片预览模块
│   └── history-bulk-manager.js      # 历史批量管理模块
├── data/                            # 数据存储
│   └── canvases/                    # 画布 JSON 文件
├── python/                          # Python 运行时环境
├── docs/                            # 技术文档（本目录）
│   ├── README.md                    # 项目总览（本文档）
│   ├── 01-comfyui-settings.md       # ComfyUI 设置文档
│   ├── 02-canvas-nodes.md           # 无限画布节点文档
│   ├── 03-static-modules.md         # 前端静态模块文档
│   └── 04-backend-api.md            # 后端 API 文档
├── mac-启动服务.sh                  # Mac 启动脚本
└── mac-安装依赖.sh                  # Mac 依赖安装脚本
```

## 文档导航

| 文档 | 说明 | 路径 |
|------|------|------|
| ComfyUI 设置 | ComfyUI 连接配置、工作流管理 | [01-comfyui-settings.md](01-comfyui-settings.md) |
| 无限画布节点 | 画布系统架构、所有节点功能详解 | [02-canvas-nodes.md](02-canvas-nodes.md) |
| 前端静态模块 | 主题、国际化、图片预览、批量管理 | [03-static-modules.md](03-static-modules.md) |
| 后端 API | FastAPI 接口、WebSocket、数据模型 | [04-backend-api.md](04-backend-api.md) |

## 快速开始

### 环境要求

- Python 3.8+
- Windows 或 macOS

### 安装依赖

```bash
# Windows（使用内置 Python 环境）
# 无需额外安装

# macOS
./mac-安装依赖.sh
```

### 启动服务

```bash
# Windows
python main.py

# macOS
./mac-启动服务.sh
```

服务启动后访问：`http://localhost:8000`

## 部署说明

### 开发环境

服务默认运行在 `http://localhost:8000`，支持热重载。

### 生产环境

建议使用以下配置：

1. 使用 `uvicorn` 多 worker 模式：
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
   ```

2. 配置反向代理（Nginx）：
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

3. 配置环境变量：
   - API Keys
   - ComfyUI 地址
   - ModelScope Token

## 核心概念

### 画布系统

画布是用户创作的基本单位，包含节点、连接和生成的完整工作流。每个画布独立保存，支持：

- 新建、重命名、删除
- 回收站机制（30 天自动清理）
- JSON 格式存储

### 节点系统

节点是工作流的基本单元，包含：

- **输入节点**：图片、提示词
- **处理节点**：LLM、API 生成、ComfyUI 生成
- **控制节点**：循环、分组
- **输出节点**：结果展示、下载

### API 平台

支持多 API 平台配置：

- **ModelScope**：默认平台，不可删除
- **自定义平台**：OpenAI 兼容协议
- **模型分类**：image、chat、video

### LoRA 管理

为 ModelScope 模型绑定 LoRA：

- 按模型自动筛选可用 LoRA
- 支持强度配置
- 生成时自动应用

## 开发指南

### 添加新页面

1. 在 `static/` 目录创建 HTML 文件
2. 引入公共脚本：
   ```html
   <script src="/static/theme.js"></script>
   <script src="/static/i18n.js"></script>
   ```
3. 在 `main.py` 中添加路由

### 添加新 API 端点

1. 定义 Pydantic 模型（请求/响应）
2. 在 `main.py` 添加路由装饰器
3. 实现业务逻辑
4. 添加错误处理

### 添加新节点类型

1. 在 `canvas.html` 中定义节点模板
2. 实现节点的端口定义
3. 添加节点渲染逻辑
4. 实现连接和数据传递

## 已知问题

- Windows 启动脚本待完善
- 部分翻译键未覆盖
- 大量图片时的性能优化

## 后续改进方向

- [ ] 节点撤销/重做功能
- [ ] 画布模板系统
- [ ] 更多 AI 模型支持
- [ ] 协作编辑功能
- [ ] 性能优化和缓存机制

## 许可证

本项目仅供学习和研究使用。
