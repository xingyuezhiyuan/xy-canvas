# ComfyUI云端应用开发指南

本文档整理了基于Flask后端代理的ComfyUI云端应用开发流程和代码规范，供其他应用参考和修改。

---

## 📋 目录

1. [架构概述](#架构概述)
2. [双模式架构（本地直连/云端代理）](#双模式架构)
3. [配置管理](#配置管理)
4. [核心功能实现](#核心功能实现)
5. [工作流封装](#工作流封装)
6. [图片获取与显示](#图片获取与显示)
7. [模型选择功能](#模型选择功能)
8. [缩放长度滑块控件](#缩放长度滑块控件)
9. [完整代码模板](#完整代码模板)
10. [常见问题](#常见问题)

---

## 架构概述

### 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                            │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  ComfyUI应用 │  │ ComfyUI应用 │  │ ComfyUI应用 │    │
│  │  (CG草图等)  │  │ (万能渲染)  │  │ (其他应用)  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │            │
│         └────────────────┼────────────────┘            │
│                          │                             │
│              ┌───────────▼───────────┐                │
│              │   localStorage        │ ← 用户配置      │
│              │   comfyui_config      │                │
│              └───────────────────────┘                │
└──────────────────────────┬────────────────────────────┘
                           │ apiFetch() + X-ComfyUI-Server-Url头
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Flask服务器 (代理层)                        │
│                                                         │
│  /api/comfyui/system_stats     - 检查连接               │
│  /api/comfyui/object_info      - 获取节点信息           │
│  /api/comfyui/prompt           - 提交工作流             │
│  /api/comfyui/history/<id>     - 获取执行历史           │
│  /api/comfyui/view             - 获取图片               │
│  /api/comfyui/upload/image     - 上传图片               │
│                                                         │
│  从请求头读取 X-ComfyUI-Server-Url                      │
│  代理请求到用户配置的ComfyUI服务器                       │
└──────────────────────────┬────────────────────────────┘
                           │ 代理请求
                           ▼
┌─────────────────────────────────────────────────────────┐
│              云端ComfyUI服务器                           │
│  https://xxx-8188.container.x-gpu.com/                  │
│                                                         │
│  实际执行工作流的地方                                     │
└─────────────────────────────────────────────────────────┘
```

### 核心原则

1. **Flask服务器不存储用户配置** - 只提供默认配置
2. **用户配置存储在浏览器localStorage** - 唯一持久化位置
3. **所有ComfyUI请求通过Flask代理** - 避免CORS跨域问题
4. **Flask服务器不运行ComfyUI** - 只是代理和管理界面

---

## 双模式架构（本地直连/云端代理）<a name="双模式架构"></a>

### 架构背景

当Flask服务器部署到公网后，用户可能有两种使用场景：

1. **本地ComfyUI**：用户电脑上运行ComfyUI（127.0.0.1:8188）
2. **云端ComfyUI**：使用云端ComfyUI服务器（如仙宫云）

为了支持这两种场景，我们设计了**双模式架构**，根据用户配置自动切换调用逻辑。

### 两种模式对比

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         公网部署后的两种模式                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  【本地服务器模式】                    【云端服务器模式】                  │
│                                                                         │
│   用户浏览器                            用户浏览器                        │
│       │                                    │                            │
│       │ 直连                               │ 代理请求                    │
│       ▼                                    ▼                            │
│   本地ComfyUI                         公网Flask服务器                    │
│   127.0.0.1:8188                          │                            │
│       │                                    │ 代理转发                   │
│       │                                    ▼                            │
│   ✅ 执行工作流                        云端ComfyUI                       │
│       │                                https://xxx...                   │
│       │                                    │                            │
│       ▼                                    ▼                            │
│   结果返回浏览器                        ✅ 执行工作流                    │
│                                            │                            │
│                                            ▼                            │
│                                        结果返回Flask → 返回浏览器        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 模式选择逻辑

| 配置选择 | `IS_LOCAL_SERVER` | API调用方式 | URL路径 |
|---------|------------------|------------|--------|
| 本地服务器 | `true` | 浏览器直连 ComfyUI | `/system_stats`, `/prompt`, `/upload/image` 等 |
| 云端服务器 | `false` | Flask代理转发 | `/api/comfyui/system_stats`, `/api/comfyui/prompt` 等 |

### 核心代码实现

#### 1. 全局变量定义

```javascript
let COMFYUI_SERVER = 'http://127.0.0.1:8188';
let IS_LOCAL_SERVER = true;  // 关键：标识当前模式
let clientId = generateUUID();
let uploadedImageName = null;
let currentPromptId = null;
let generatedImageUrl = null;
let generatedImageBlobUrl = null;
let unetModels = [];
let loraModels = [];
```

#### 2. apiFetch函数（智能切换）

这是整个双模式架构的核心函数，根据 `IS_LOCAL_SERVER` 自动选择直连或代理：

```javascript
async function apiFetch(url, options = {}) {
    // 本地模式：浏览器直接请求用户电脑上的 ComfyUI
    if (IS_LOCAL_SERVER) {
        const directUrl = COMFYUI_SERVER + url;  // http://127.0.0.1:8188/prompt
        const response = await fetch(directUrl, options);
        return response;
    }
    
    // 云端模式：请求 Flask 代理，Flask 再转发到云端 ComfyUI
    const headers = {
        'X-ComfyUI-Server-Url': COMFYUI_SERVER,  // 告诉 Flask 转发到哪个云端
        ...(options.headers || {})
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    return response;
}
```

**关键点**：
- 本地模式：URL拼接为 `COMFYUI_SERVER + url`，如 `http://127.0.0.1:8188/prompt`
- 云端模式：URL保持原样，如 `/api/comfyui/prompt`，由Flask代理转发

#### 3. 配置加载函数

```javascript
async function loadConfig() {
    const localConfig = localStorage.getItem('comfyui_config');
    if (localConfig) {
        try {
            const config = JSON.parse(localConfig);
            const activeServer = config.active_server || '本地服务器';
            IS_LOCAL_SERVER = (activeServer === '本地服务器');  // 设置模式标识
            
            if (activeServer === '云端服务器' && config.cloud_address) {
                COMFYUI_SERVER = (config.cloud_address.startsWith('http') 
                    ? config.cloud_address 
                    : `https://${config.cloud_address}`).replace(/\/+$/, '');
            } else if (config.local_address) {
                COMFYUI_SERVER = (config.local_address.startsWith('http') 
                    ? config.local_address 
                    : `http://${config.local_address}`).replace(/\/+$/, '');
            }
            console.log('已从浏览器本地存储加载 ComfyUI 配置:', COMFYUI_SERVER, '本地模式:', IS_LOCAL_SERVER);
            return;
        } catch (e) {
            console.error('解析本地配置失败:', e);
        }
    }

    // 回退到后端默认配置
    try {
        const response = await fetch('/config');
        if (response.ok) {
            const config = await response.json();
            const activeServer = config.active_server || '本地服务器';
            IS_LOCAL_SERVER = (activeServer === '本地服务器');  // 设置模式标识
            
            if (activeServer === '云端服务器' && config.cloud_address) {
                COMFYUI_SERVER = (config.cloud_address.startsWith('http') 
                    ? config.cloud_address 
                    : `https://${config.cloud_address}`).replace(/\/+$/, '');
            } else if (config.local_address) {
                COMFYUI_SERVER = (config.local_address.startsWith('http') 
                    ? config.local_address 
                    : `http://${config.local_address}`).replace(/\/+$/, '');
            }
            console.log('ComfyUI 配置已从服务器加载默认值:', COMFYUI_SERVER, '本地模式:', IS_LOCAL_SERVER);
        }
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}
```

#### 4. 各API的URL适配

所有ComfyUI API调用都需要根据模式选择正确的URL路径：

```javascript
// 服务器状态检查
async function checkServerConnection() {
    try {
        const statsUrl = IS_LOCAL_SERVER ? '/system_stats' : '/api/comfyui/system_stats';
        const response = await apiFetch(statsUrl);
        if (response.ok) {
            statusLight.className = 'status-light connected';
            serverStatusText.textContent = 'ComfyUI 服务器已连接';
            return true;
        } else {
            throw new Error('服务器响应异常');
        }
    } catch (error) {
        statusLight.className = 'status-light disconnected';
        serverStatusText.textContent = '无法连接到 ComfyUI 服务器';
        generateBtn.disabled = true;
        return false;
    }
}

// 获取模型列表
async function loadUNETModels() {
    try {
        const objectInfoUrl = IS_LOCAL_SERVER ? '/object_info' : '/api/comfyui/object_info';
        const response = await apiFetch(objectInfoUrl);
        // ... 处理响应
    } catch (e) {
        console.error('加载模型列表失败:', e);
    }
}

// 上传图片
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file, cleanFilename);
    
    const uploadUrl = IS_LOCAL_SERVER ? '/upload/image' : '/api/comfyui/upload/image';
    const response = await apiFetch(uploadUrl, {
        method: 'POST',
        body: formData
    });
    // ... 处理响应
}

// 提交工作流
async function submitWorkflow(workflow) {
    const promptUrl = IS_LOCAL_SERVER ? '/prompt' : '/api/comfyui/prompt';
    const response = await apiFetch(promptUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: workflow,
            client_id: clientId,
            prompt_id: currentPromptId
        })
    });
    // ... 处理响应
}

// 获取执行历史
async function getResult(promptId) {
    const historyUrl = IS_LOCAL_SERVER ? '/history/' + promptId : '/api/comfyui/history/' + promptId;
    const response = await apiFetch(historyUrl);
    // ... 处理响应
    
    // 获取图片
    if (image) {
        const viewUrlBase = IS_LOCAL_SERVER ? '/view' : '/api/comfyui/view';
        const imageUrl = `${viewUrlBase}?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${encodeURIComponent(image.type || 'output')}`;
        const imgResponse = await apiFetch(imageUrl);
        // ... 处理图片
    }
}
```

#### 5. WebSocket连接

WebSocket始终直连ComfyUI服务器（无法通过Flask代理）：

```javascript
function connectWebSocket() {
    let baseUrl = COMFYUI_SERVER.replace(/\/+$/, '');
    let wsUrl;
    
    if (baseUrl.startsWith('https://')) {
        wsUrl = `wss://${baseUrl.replace('https://', '')}/ws?clientId=${clientId}`;
    } else {
        wsUrl = `ws://${baseUrl.replace('http://', '')}/ws?clientId=${clientId}`;
    }
    
    console.log('WebSocket连接:', wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket连接成功');
    };
    
    ws.onmessage = (event) => {
        // 处理进度消息...
    };
    
    return ws;
}
```

### URL路径对照表

| 功能 | 本地模式URL | 云端模式URL |
|------|------------|------------|
| 服务器状态检查 | `/system_stats` | `/api/comfyui/system_stats` |
| 获取节点信息 | `/object_info` | `/api/comfyui/object_info` |
| 上传图片 | `/upload/image` | `/api/comfyui/upload/image` |
| 提交工作流 | `/prompt` | `/api/comfyui/prompt` |
| 获取执行历史 | `/history/{id}` | `/api/comfyui/history/{id}` |
| 获取图片 | `/view?...` | `/api/comfyui/view?...` |
| WebSocket | `ws://127.0.0.1:8188/ws` | `wss://云端地址/ws` |

### 使用场景总结

| 场景 | 推荐配置 | 说明 |
|------|---------|------|
| 用户有本地ComfyUI | 本地服务器 | 浏览器直连，速度最快，无需经过公网 |
| 用户无本地ComfyUI | 云端服务器 | 通过Flask代理访问云端ComfyUI |
| Flask本地运行 | 两者皆可 | 本地模式直连，云端模式也走本地Flask代理 |

### 双模式架构的优势

1. **灵活性**：用户可以根据自己的环境自由切换
2. **性能**：本地模式直连，无网络延迟
3. **兼容性**：云端模式解决CORS跨域问题
4. **统一体验**：无论哪种模式，应用功能完全一致
5. **公网部署友好**：部署到公网后，本地用户仍可直连自己的ComfyUI

---

## 配置管理

### 1. 配置加载流程

```javascript
async function loadConfig() {
    // 优先从浏览器本地存储加载配置
    const localConfig = localStorage.getItem('comfyui_config');
    if (localConfig) {
        try {
            const config = JSON.parse(localConfig);
            const activeServer = config.active_server || '本地服务器';
            if (activeServer === '云端服务器' && config.cloud_address) {
                COMFYUI_SERVER = (config.cloud_address.startsWith('http') 
                    ? config.cloud_address 
                    : `https://${config.cloud_address}`).replace(/\/+$/, '');
            } else if (config.local_address) {
                COMFYUI_SERVER = (config.local_address.startsWith('http') 
                    ? config.local_address 
                    : `http://${config.local_address}`).replace(/\/+$/, '');
            }
            console.log('已从浏览器本地存储加载 ComfyUI 配置:', COMFYUI_SERVER);
            return;
        } catch (e) {
            console.error('解析本地配置失败:', e);
        }
    }

    // 回退到后端默认配置
    try {
        const response = await fetch('/config');
        if (response.ok) {
            const config = await response.json();
            const activeServer = config.active_server || '本地服务器';
            if (activeServer === '云端服务器' && config.cloud_address) {
                COMFYUI_SERVER = (config.cloud_address.startsWith('http') 
                    ? config.cloud_address 
                    : `https://${config.cloud_address}`).replace(/\/+$/, '');
            } else if (config.local_address) {
                COMFYUI_SERVER = (config.local_address.startsWith('http') 
                    ? config.local_address 
                    : `http://${config.local_address}`).replace(/\/+$/, '');
            }
            console.log('ComfyUI 配置已从服务器加载默认值:', COMFYUI_SERVER);
        }
    } catch (e) {
        console.error('加载配置失败:', e);
    }
}
```

### 2. 配置数据结构

```javascript
// localStorage['comfyui_config'] 的结构
{
    "active_server": "云端服务器",  // 或 "本地服务器"
    "local_address": "127.0.0.1:8188",
    "cloud_address": "https://xxx-8188.container.x-gpu.com/"
}
```

---

## 核心功能实现

### 1. apiFetch函数（核心）

所有ComfyUI API请求都必须使用此函数，它会自动传递服务器配置：

```javascript
// 封装带请求头的 fetch 函数，自动传递服务器配置
async function apiFetch(url, options = {}) {
    const headers = {
        'X-ComfyUI-Server-Url': COMFYUI_SERVER,  // 关键：传递ComfyUI服务器地址
        ...(options.headers || {})
    };
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    return response;
}
```

**重要**：
- ✅ 所有 `/api/comfyui/*` 请求都必须使用 `apiFetch`
- ❌ 不要直接使用 `fetch` 请求ComfyUI API
- ❌ 不要直接请求云端ComfyUI地址（会有CORS问题）

**必须使用 apiFetch 的场景**：
1. 获取模型列表：`apiFetch('/api/comfyui/object_info/UNETLoader')`
2. 上传图片：`apiFetch('/api/comfyui/upload/image', { method: 'POST', body: formData })`
3. 提交工作流：`apiFetch('/api/comfyui/prompt', { method: 'POST', body: JSON.stringify(...) })`
4. 获取历史记录：`apiFetch('/api/comfyui/history/' + promptId)`
5. 获取图片：`apiFetch('/api/comfyui/view?filename=...')`

**可以直接使用 fetch 的场景**：
1. WebSocket连接（需要直接连接ComfyUI服务器）
2. 请求Flask本地接口（如 `/config`）

### 2. 服务器连接检查

```javascript
async function checkServerConnection() {
    try {
        const response = await apiFetch('/api/comfyui/system_stats');
        if (response.ok) {
            statusLight.className = 'status-light connected';
            serverStatusText.textContent = 'ComfyUI 服务器已连接';
            return true;
        } else {
            throw new Error('服务器响应异常');
        }
    } catch (error) {
        statusLight.className = 'status-light disconnected';
        serverStatusText.textContent = '无法连接到 ComfyUI 服务器';
        generateBtn.disabled = true;
        return false;
    }
}
```

### 3. WebSocket连接

用于实时接收工作流执行进度：

```javascript
function connectWebSocket() {
    let baseUrl = COMFYUI_SERVER.replace(/\/+$/, '');
    let wsUrl;
    
    if (baseUrl.startsWith('https://')) {
        wsUrl = `wss://${baseUrl.replace('https://', '')}/ws?clientId=${clientId}`;
    } else {
        wsUrl = `ws://${baseUrl.replace('http://', '')}/ws?clientId=${clientId}`;
    }
    
    console.log('WebSocket连接:', wsUrl);
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket连接成功');
    };
    
    ws.onmessage = (event) => {
        try {
            if (typeof event.data !== 'string') return;
            
            const message = JSON.parse(event.data);
            console.log('WebSocket消息:', message);
            
            if (message.type === 'execution_start') {
                console.log('工作流开始执行');
                updateStatus('工作流开始执行...', 'processing');
            }
            
            else if (message.type === 'executing') {
                const data = message.data;
                if (data.prompt_id === currentPromptId) {
                    if (data.node === null) {
                        // 执行完成
                        console.log('执行完成，获取结果...');
                        updateStatus('生成完成，获取结果...', 'processing');
                        progressBar.style.width = '100%';
                        progressText.textContent = '100%';
                        ws.close();
                        setTimeout(() => getResult(currentPromptId), 500);
                    } else {
                        const nodeTitle = WORKFLOW_TEMPLATE[data.node]?._meta?.title || `节点 ${data.node}`;
                        console.log('正在执行:', nodeTitle);
                        updateStatus(`正在执行：${nodeTitle}`, 'processing');
                    }
                }
            }
            
            else if (message.type === 'progress') {
                const data = message.data;
                const progress = Math.round((data.value / data.max) * 100);
                progressBar.style.width = `${progress}%`;
                progressText.textContent = `${progress}%`;
            }
            
            else if (message.type === 'execution_error') {
                const data = message.data;
                console.error('执行错误:', data);
                ws.close();
                generateBtn.disabled = false;
                progressContainer.classList.remove('active');
                
                let errorMsg = `执行错误：${data.exception_message}`;
                if (data.node) {
                    const nodeTitle = WORKFLOW_TEMPLATE[data.node]?._meta?.title || `节点 ${data.node}`;
                    errorMsg = `<strong>节点 "${nodeTitle}" 执行失败</strong><br>` +
                              `错误类型：${data.exception_type}<br>` +
                              `错误信息：${data.exception_message}`;
                }
                
                updateStatus(errorMsg, 'error');
            }
            
        } catch (e) {
            console.error('消息处理错误:', e);
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket错误:', error);
    };
    
    return ws;
}
```

---

## 工作流封装

### 1. 工作流JSON模板

```javascript
const WORKFLOW_TEMPLATE = {
  "76": {
    "inputs": {
      "image": "默认图片.png"
    },
    "class_type": "LoadImage",
    "_meta": {
      "title": "加载图像"
    }
  },
  "185": {
    "inputs": {
      "custom_path": "",
      "filename_prefix": "CGStyle",
      "timestamp": "None",
      "format": "png",
      "quality": 80,
      "meta_data": false,
      "blind_watermark": "",
      "save_workflow_as_json": false,
      "preview": true,
      "images": [
        "174",
        0
      ]
    },
    "class_type": "LayerUtility: SaveImagePlus",
    "_meta": {
      "title": "图层工具：保存图像增强版(高级)"
    }
  }
  // ... 其他节点
};
```

**重要**：
- ✅ 使用 `LayerUtility: SaveImagePlus` 而不是 `SaveImage`
- ✅ `SaveImage` 不会在history API的outputs中返回图片信息
- ✅ `LayerUtility: SaveImagePlus` 会返回images数组，前端可以获取

### 2. 动态构建工作流

```javascript
async function buildWorkflow(imageName, unetName, loraName, targetSize, seed) {
    const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATE));

    // 替换动态参数
    workflow["76"]["inputs"]["image"] = imageName;           // 上传的图片
    workflow["126"]["inputs"]["unet_name"] = unetName;       // UNET模型
    workflow["177"]["inputs"]["lora_name"] = loraName;       // LoRA模型
    workflow["183"]["inputs"]["value"] = targetSize;         // 目标尺寸
    workflow["125"]["inputs"]["noise_seed"] = seed;          // 随机种子

    return workflow;
}
```

### 3. 提交工作流

```javascript
generateBtn.addEventListener('click', async () => {
    if (!uploadedImageName) {
        alert('请先上传图像');
        return;
    }

    try {
        generateBtn.disabled = true;
        statusBar.classList.add('active');
        progressContainer.classList.add('active');
        progressBar.style.width = '0%';
        progressText.textContent = '';
        updateStatus('正在提交任务...', 'processing');

        // 构建工作流
        const workflow = await buildWorkflow(
            uploadedImageName,
            modelSelect.value,
            loraSelect.value,
            parseInt(sizeInput.value),
            parseInt(seedInput.value)
        );
        
        currentPromptId = generateUUID();
        
        // 提交到ComfyUI
        let baseUrl = COMFYUI_SERVER.replace(/\/+$/, '');
        let wsUrl;
        
        if (baseUrl.startsWith('https://')) {
            wsUrl = `wss://${baseUrl.replace('https://', '')}/ws?clientId=${clientId}`;
        } else {
            wsUrl = `ws://${baseUrl.replace('http://', '')}/ws?clientId=${clientId}`;
        }
        
        const ws = new WebSocket(wsUrl);
        
        const response = await fetch(`${baseUrl}/prompt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: workflow,
                client_id: clientId,
                prompt_id: currentPromptId
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        console.log('工作流提交成功，等待执行完成...');
        updateStatus('任务已提交，等待执行...', 'processing');
        
        // 处理WebSocket消息...
        
    } catch (e) {
        console.error('Generate error:', e);
        updateStatus(`生成失败：${e.message}`, 'error');
        progressContainer.classList.remove('active');
        generateBtn.disabled = false;
    }
});
```

---

## 图片获取与显示

### 1. 获取执行结果

```javascript
async function getResult(promptId) {
    try {
        console.log('正在获取结果，promptId:', promptId);
        
        // 通过Flask后端代理获取历史记录（避免CORS问题）
        const response = await apiFetch('/api/comfyui/history/' + promptId);
        
        if (!response.ok) {
            throw new Error('获取结果失败，HTTP ' + response.status);
        }

        const history = await response.json();
        console.log('=== 历史记录响应 ===');
        console.log('所有 promptId:', Object.keys(history));
        
        if (!history[promptId]) {
            throw new Error('历史记录中未找到该任务 (promptId: ' + promptId + ')');
        }
        
        const promptData = history[promptId];
        console.log('任务状态:', promptData.status);
        
        // 检查是否有错误
        if (promptData.status && promptData.status.status_str === 'error') {
            console.error('任务执行错误:', promptData.status.messages);
            throw new Error('任务执行错误: ' + JSON.stringify(promptData.status.messages));
        }
        
        const outputs = promptData.outputs || {};
        
        console.log('=== 输出节点检查 ===');
        console.log('所有输出节点:', Object.keys(outputs));
        console.log('完整outputs内容:', JSON.stringify(outputs, null, 2));
        
        // 遍历所有输出节点查找图片
        let image = null;
        let foundNodeId = '';
        
        for (const nodeId in outputs) {
            const nodeOutput = outputs[nodeId];
            console.log(`节点 ${nodeId}:`, JSON.stringify(nodeOutput));
            
            if (nodeOutput.images && nodeOutput.images.length > 0) {
                image = nodeOutput.images[0];
                foundNodeId = nodeId;
                console.log(`从节点 ${nodeId} 找到图片:`, image);
                break;
            }
        }
        
        if (image) {
            // 通过Flask后端代理获取图片（避免CORS问题）
            const imageUrl = `/api/comfyui/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${encodeURIComponent(image.type || 'output')}`;
            
            console.log('图片 URL:', imageUrl);
            generatedImageUrl = imageUrl;
            
            // 使用apiFetch加载图片，确保传递服务器配置
            const imgResponse = await apiFetch(imageUrl);
            if (!imgResponse.ok) {
                throw new Error('图片加载失败，HTTP ' + imgResponse.status);
            }
            
            const blob = await imgResponse.blob();
            const blobUrl = URL.createObjectURL(blob);
            
            generatedImageBlobUrl = blobUrl;
            outputImage.src = blobUrl;
            outputImage.classList.add('active');
            downloadBtn.style.display = 'block';
            outputPlaceholder.style.display = 'none';
            
            updateStatus('生成完成！', 'success');
            progressContainer.classList.remove('active');
            generateBtn.disabled = false;
        } else {
            console.error('所有输出节点均未找到图片');
            console.error('outputs 内容:', JSON.stringify(outputs, null, 2));
            throw new Error('未找到生成结果，请检查工作流输出节点配置');
        }

    } catch (e) {
        console.error('Get result error:', e);
        updateStatus('获取结果失败：' + e.message, 'error');
        progressContainer.classList.remove('active');
        generateBtn.disabled = false;
    }
}
```

**关键点**：
1. ✅ 使用 `apiFetch('/api/comfyui/history/' + promptId)` 获取历史记录
2. ✅ 使用 `apiFetch('/api/comfyui/view?...')` 获取图片
3. ✅ 将图片转换为blob URL再显示（避免请求头丢失）
4. ❌ 不要直接设置 `<img src="/api/comfyui/view?...">`

### 2. 图片下载

```javascript
downloadBtn.addEventListener('click', async () => {
    if (!generatedImageUrl) return;
    
    try {
        // 使用apiFetch重新获取图片，确保传递服务器配置
        const response = await apiFetch(generatedImageUrl);
        const blob = await response.blob();
        
        const reader = new FileReader();
        reader.onload = function() {
            const a = document.createElement('a');
            a.href = reader.result;
            a.download = `cgstyle_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showNotification('图片已下载！', 'success');
        };
        reader.onerror = function() {
            showNotification('下载失败', 'error');
        };
        reader.readAsDataURL(blob);
    } catch (e) {
        console.error('下载失败:', e);
        showNotification('下载失败：' + e.message, 'error');
    }
});
```

### 3. 图片预览

```javascript
outputImage.addEventListener('click', () => {
    if (generatedImageBlobUrl) {
        imagePreviewModalImg.src = generatedImageBlobUrl;
        imagePreviewModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
});
```

---

## 模型选择功能

### 1. 加载UNET模型列表

```javascript
async function loadUNETModels() {
    try {
        const response = await apiFetch('/api/comfyui/object_info');
        if (!response.ok) {
            throw new Error('获取模型列表失败');
        }
        
        const data = await response.json();
        if (data.UNETLoader && data.UNETLoader.input && data.UNETLoader.input.required) {
            unetModels = data.UNETLoader.input.required.unet_name[0];
            
            modelSelect.innerHTML = '';
            
            const defaultModel = 'Flux2-Klein-9B-True-v2-fp8mixed.safetensors';
            let hasDefaultModel = false;
            
            unetModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                modelSelect.appendChild(option);
                
                if (model === defaultModel) {
                    hasDefaultModel = true;
                }
            });
            
            if (hasDefaultModel) {
                modelSelect.value = defaultModel;
            } else if (unetModels.length > 0) {
                modelSelect.value = unetModels[0];
            }
            
            updateGenerateButtonState();
            console.log('已加载UNET模型列表:', unetModels);
        }
    } catch (e) {
        console.error('加载模型列表失败:', e);
        modelSelect.innerHTML = '<option value="">加载失败，请检查服务器连接</option>';
    }
}
```

### 2. 加载LoRA模型列表

```javascript
async function loadLoraModels() {
    try {
        const response = await apiFetch('/api/comfyui/object_info');
        if (!response.ok) {
            throw new Error('获取LoRA模型列表失败');
        }
        
        const data = await response.json();
        
        // 尝试从 LmcqRuntimeLoraDecryption 节点获取LoRA列表
        if (data["LmcqRuntimeLoraDecryption"] && 
            data["LmcqRuntimeLoraDecryption"].input && 
            data["LmcqRuntimeLoraDecryption"].input.required) {
            
            loraModels = data["LmcqRuntimeLoraDecryption"].input.required.lora_name[0];
            
            loraSelect.innerHTML = '';
            
            const defaultLora = 'loraxx-v1\\loraxx-v1.safetensors';
            let hasDefaultLora = false;
            
            loraModels.forEach(lora => {
                const option = document.createElement('option');
                option.value = lora;
                option.textContent = lora;
                loraSelect.appendChild(option);
                
                if (lora === defaultLora) {
                    hasDefaultLora = true;
                }
            });
            
            if (hasDefaultLora) {
                loraSelect.value = defaultLora;
            } else if (loraModels.length > 0) {
                loraSelect.value = loraModels[0];
            }
            
            console.log('已加载LoRA模型列表:', loraModels);
        } else {
            console.warn('未找到 LmcqRuntimeLoraDecryption 节点，尝试从其他节点获取LoRA列表');
            loadLoraFromOtherNodes(data);
        }
    } catch (e) {
        console.error('加载LoRA模型列表失败:', e);
        loraSelect.innerHTML = '<option value="">加载失败，请检查服务器连接</option>';
    }
}

function loadLoraFromOtherNodes(data) {
    // 尝试从其他可能的节点获取LoRA列表
    const possibleNodes = [
        "LoraLoader",
        "LoraLoaderModelOnly",
        "ImpactLoraLoader",
        "Easy_LoraLoader"
    ];
    
    for (const nodeName of possibleNodes) {
        if (data[nodeName] && data[nodeName].input && data[nodeName].input.required) {
            const loraField = data[nodeName].input.required.lora_name || 
                             data[nodeName].input.required.lora;
            if (loraField && loraField[0]) {
                loraModels = loraField[0];
                populateLoraSelect();
                return;
            }
        }
    }
    
    console.warn('未找到任何LoRA加载节点');
    loraSelect.innerHTML = '<option value="">未找到LoRA模型</option>';
}

function populateLoraSelect() {
    loraSelect.innerHTML = '';
    
    const defaultLora = 'loraxx-v1\\loraxx-v1.safetensors';
    let hasDefaultLora = false;
    
    loraModels.forEach(lora => {
        const option = document.createElement('option');
        option.value = lora;
        option.textContent = lora;
        loraSelect.appendChild(option);
        
        if (lora === defaultLora) {
            hasDefaultLora = true;
        }
    });
    
    if (hasDefaultLora) {
        loraSelect.value = defaultLora;
    } else if (loraModels.length > 0) {
        loraSelect.value = loraModels[0];
    }
    
    console.log('已加载LoRA模型列表:', loraModels);
}
```

---

## 缩放长度滑块控件<a name="缩放长度滑块控件"></a>

### 使用场景

当工作流中使用了图像缩放节点（如 `LayerUtility: ImageScaleByAspectRatio V2`）时，需要提供用户可调节的输出尺寸控制。

### 1. HTML滑块控件

```html
<div class="form-group">
    <label>📐 缩放至长度</label>
    <input type="range" id="scaleSlider" min="512" max="4096" step="64" value="1536" style="width: 100%; margin: 8px 0;">
    <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.85rem; color: var(--text2);">512</span>
        <span id="scaleValue" style="font-size: 1.1rem; font-weight: 700; color: var(--blue);">1536</span>
        <span style="font-size: 0.85rem; color: var(--text2);">4096</span>
    </div>
    <div style="font-size: 0.85rem; color: var(--text2); margin-top: 0.5rem;">控制输出图像的长边尺寸（像素），默认1536</div>
</div>
```

### 2. JavaScript元素引用和事件监听

```javascript
const scaleSlider = document.getElementById('scaleSlider');
const scaleValue = document.getElementById('scaleValue');

scaleSlider.addEventListener('input', () => {
    scaleValue.textContent = scaleSlider.value;
});
```

### 3. 在工作流中使用

在 `buildWorkflow` 函数中将滑块值传递到对应的缩放节点：

```javascript
function buildWorkflow(imageName, seed, userPrompt, scaleLength, unetName, loraName) {
    const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATE));

    workflow["76"]["inputs"]["image"] = imageName;
    workflow["125"]["inputs"]["noise_seed"] = seed;
    workflow["197"]["inputs"]["text"] = userPrompt || "";
    workflow["164"]["inputs"]["scale_to_length"] = scaleLength;  // 缩放长度
    workflow["126"]["inputs"]["unet_name"] = unetName;
    workflow["186"]["inputs"]["lora_name"] = loraName;

    return workflow;
}
```

### 4. 调用示例

```javascript
generateBtn.addEventListener('click', async () => {
    const workflow = buildWorkflow(
        uploadedImageName,
        parseInt(seedInput.value) || 137682158257,
        promptInput.value.trim(),
        parseInt(scaleSlider.value),      // 缩放长度
        modelSelect.value,                 // UNET模型
        loraSelect.value                   // LoRA模型
    );
    // ... 提交工作流
});
```

### 关键要点

| 要点 | 说明 |
|------|------|
| **节点映射** | 确认工作流中缩放节点的ID（如#164）和参数名（如 `scale_to_length`） |
| **步进值** | `step="64"` 确保尺寸为64的倍数，符合常见AI模型要求 |
| **范围设置** | 根据实际需求调整 `min` 和 `max` 值 |
| **实时显示** | 通过 `input` 事件监听器实时更新显示数值 |

---

## 完整代码模板

### HTML结构模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>应用名称</title>
    <link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
    <link rel="stylesheet" href="/static/css/cyberpunk-style.css">
    <style>
        /* 服务器状态指示器 */
        .server-status {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(10, 10, 15, 0.88);
            backdrop-filter: blur(20px);
            padding: 12px 20px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            gap: 10px;
            border: 1px solid rgba(180, 74, 255, 0.15);
            z-index: 1000;
        }

        .status-light {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #ff4444;
            box-shadow: 0 0 10px #ff4444;
            transition: all 0.3s ease;
        }

        .status-light.connected {
            background: #00ff88;
            box-shadow: 0 0 15px #00ff88;
            animation: pulse 2s infinite;
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }

        /* 其他样式... */
    </style>
</head>
<body>
    <div class="app-container">
        <!-- 服务器状态 -->
        <div class="server-status">
            <div class="status-light" id="statusLight"></div>
            <span class="status-text" id="serverStatusText">未连接到服务器</span>
        </div>

        <!-- 头部 -->
        <header class="app-header">
            <div>
                <h1>🎨 应用名称</h1>
                <p class="subtitle">应用描述</p>
            </div>
        </header>

        <!-- 主内容区 -->
        <div class="main-content">
            <div class="panel input-panel">
                <h2 class="panel-title">输入设置</h2>
                
                <!-- 上传区域 -->
                <div class="form-group">
                    <label>🖼️ 上传图像</label>
                    <div class="upload-zone" id="uploadZone">
                        <div class="upload-icon">📷</div>
                        <div class="upload-text">点击或拖拽上传图像</div>
                        <div class="upload-hint">支持 PNG, JPG, WEBP 格式</div>
                        <input type="file" id="fileInput" accept="image/*" style="display: none;">
                        <img class="preview-image" id="preview" alt="图像预览">
                    </div>
                </div>

                <!-- 模型选择 -->
                <div class="form-group">
                    <label>🤖 选择大模型</label>
                    <select class="form-select" id="modelSelect">
                        <option value="">加载中...</option>
                    </select>
                </div>

                <!-- LoRA选择 -->
                <div class="form-group">
                    <label>🎨 选择LoRA模型</label>
                    <select class="form-select" id="loraSelect">
                        <option value="">加载中...</option>
                    </select>
                </div>

                <!-- 参数设置 -->
                <div class="form-group">
                    <label>📐 目标尺寸</label>
                    <input type="number" id="sizeInput" value="1536" min="512" max="4096" step="64">
                </div>

                <div class="form-group">
                    <label>🎲 随机种子</label>
                    <input type="number" id="seedInput" value="941596941752546" min="0" max="999999999999999">
                </div>

                <!-- 生成按钮 -->
                <button class="btn btn-primary" id="generateBtn" disabled style="width: 100%; margin-top: 1rem;">
                    🚀 开始生成
                </button>

                <!-- 状态栏 -->
                <div class="status-bar" id="statusBar">
                    <div class="status-message">
                        <span class="status-indicator" id="statusIndicator"></span>
                        <span id="statusMsg">准备就绪</span>
                    </div>
                    <div class="progress-container" id="progressContainer">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <div class="progress-text" id="progressText"></div>
                </div>
            </div>

            <!-- 输出区域 -->
            <div class="panel output-panel">
                <h2 class="panel-title">输出结果</h2>
                
                <div class="output-container">
                    <div id="outputPlaceholder">
                        <div style="font-size: 4rem; margin-bottom: 20px;">🖼️</div>
                        <div style="font-size: 1.2rem;">生成的图像将显示在这里</div>
                    </div>
                    <img class="output-image" id="outputImage" alt="生成结果" style="display: none;">
                    <button class="btn btn-accent" id="downloadBtn" style="display: none; width: 100%;">
                        💾 下载图片
                    </button>
                </div>
            </div>
        </div>

        <!-- 图片预览模态框 -->
        <div class="image-preview-modal" id="imagePreviewModal">
            <span class="image-preview-close" id="imagePreviewClose">&times;</span>
            <img id="imagePreviewModalImg" src="" alt="预览大图">
        </div>
    </div>

    <script>
        // JavaScript代码...
    </script>
</body>
</html>
```

---

## 常见问题

### 1. CORS跨域错误

**错误信息**：
```
Access to fetch at 'https://xxx-8188.container.x-gpu.com/history/...' 
from origin 'http://127.0.0.1:5000' has been blocked by CORS policy
```

**解决方案**：
- ✅ 使用 `apiFetch('/api/comfyui/history/...')` 而不是直接请求云端
- ✅ 所有ComfyUI API请求都通过Flask后端代理

### 2. 图片显示裂开

**原因**：
- 直接设置 `<img src="/api/comfyui/view?...">` 不会携带 `X-ComfyUI-Server-Url` 请求头

**解决方案**：
```javascript
// 错误方式
outputImage.src = '/api/comfyui/view?filename=...';

// 正确方式
const imgResponse = await apiFetch('/api/comfyui/view?filename=...');
const blob = await imgResponse.blob();
const blobUrl = URL.createObjectURL(blob);
outputImage.src = blobUrl;
```

### 3. 工作流执行成功但没有图片输出

**原因**：
- 使用了标准的 `SaveImage` 节点，它不会在history API的outputs中返回图片信息

**解决方案**：
- ✅ 使用 `LayerUtility: SaveImagePlus` 节点
- ✅ 该节点会在outputs中返回images数组

### 4. 云端服务器上传图片 HTTP 413 错误

**错误信息**：
```
HTTP 413: <html>
<head><title>413 Request Entity Too Large</title></head>
<body>
<center><h1>413 Request Entity Too Large</h1></center>
<hr><center>nginx/1.18.0 (Ubuntu)</center>
</body>
</html>
```

**原因**：
- 云端服务器（如仙宫云）的 nginx 有请求体大小限制（通常 1MB 或更小）
- 用户上传的原图可能超过此限制
- 图片通过 Flask 后端代理上传到云端 ComfyUI，nginx 拦截了大请求

**解决方案**：
- ✅ 在前端压缩图片后再上传
- ✅ 仅在云端模式下压缩，本地模式直接上传原图
- ✅ 使用 Canvas API 进行智能压缩

#### 图片压缩函数实现

```javascript
function compressImage(file, maxSizeKB = 2048, maxDimension = 3072) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            // 如果图片尺寸过大，先缩放
            if (width > maxDimension || height > maxDimension) {
                const ratio = Math.min(maxDimension / width, maxDimension / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            
            // 创建 Canvas 进行压缩
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            let quality = 0.9;
            let mimeType = 'image/jpeg';
            
            // 递归压缩直到满足大小要求
            const tryCompress = () => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('图片压缩失败'));
                        return;
                    }
                    
                    const sizeKB = blob.size / 1024;
                    
                    // 满足大小要求或质量已降到最低
                    if (sizeKB <= maxSizeKB || quality <= 0.1) {
                        const extension = blob.type === 'image/png' ? 'png' : 'jpg';
                        const timestamp = Date.now();
                        const filename = `compressed_${timestamp}.${extension}`;
                        const compressedFile = new File([blob], filename, { type: blob.type });
                        resolve({ 
                            file: compressedFile, 
                            originalSize: file.size, 
                            compressedSize: blob.size 
                        });
                    } else {
                        // 降低质量继续压缩
                        quality -= 0.1;
                        canvas.toBlob(tryCompress, mimeType, quality);
                    }
                }, mimeType, quality);
            };
            
            // PNG 文件不太大时保持 PNG 格式
            if (file.type === 'image/png' && file.size / 1024 <= maxSizeKB * 1.5) {
                mimeType = 'image/png';
                quality = 1.0;
            }
            
            tryCompress();
        };
        
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = URL.createObjectURL(file);
    });
}
```

#### 上传函数集成压缩逻辑

```javascript
async function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('请上传图片文件');
        return;
    }

    try {
        // 显示预览
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.classList.add('active');
        };
        reader.readAsDataURL(file);

        updateStatus('正在处理图像...', 'processing');
        statusBar.classList.add('active');
        
        let fileToUpload = file;
        const timestamp = Date.now();
        
        // 仅在云端模式下且图片大于4MB时压缩
        const maxSizeNoCompress = 4 * 1024 * 1024; // 4MB
        
        if (!IS_LOCAL_SERVER && file.size > maxSizeNoCompress) {
            const originalSizeKB = (file.size / 1024).toFixed(1);
            updateStatus(`云端模式：图像较大 (${originalSizeKB}KB)，正在压缩...`, 'processing');
            
            try {
                const compressResult = await compressImage(file, 2048, 3072);
                fileToUpload = compressResult.file;
                const compressedSizeKB = (compressResult.compressedSize / 1024).toFixed(1);
                console.log(`图片压缩: ${originalSizeKB}KB -> ${compressedSizeKB}KB`);
                updateStatus(`图像已压缩 (${originalSizeKB}KB -> ${compressedSizeKB}KB)，正在上传...`, 'processing');
            } catch (compressError) {
                console.warn('图片压缩失败，尝试直接上传:', compressError);
                updateStatus('压缩失败，尝试直接上传...', 'processing');
            }
        } else {
            updateStatus('正在上传图像...', 'processing');
        }
        
        // 上传图片
        const formData = new FormData();
        const extension = fileToUpload.name.split('.').pop();
        const cleanFilename = `upload_${timestamp}.${extension}`;
        formData.append('image', fileToUpload, cleanFilename);
        
        const uploadUrl = IS_LOCAL_SERVER ? '/upload/image' : '/api/comfyui/upload/image';
        const response = await apiFetch(uploadUrl, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        uploadedImageName = result.name || result.filename;
        updateStatus('图像上传成功', 'success');
        updateGenerateButtonState();
        
    } catch (e) {
        console.error('Upload error:', e);
        updateStatus(`上传失败：${e.message}`, 'error');
    }
}
```

#### 压缩参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `maxSizeNoCompress` | 4MB | 小于此值不压缩，直接上传 |
| `maxSizeKB` | 2048 | 目标文件大小上限（KB），压缩后最大2MB |
| `maxDimension` | 3072 | 图片最大尺寸（像素），超过会缩放 |
| `quality` | 0.9 → 0.1 | JPEG 质量，逐步降低直到满足大小要求 |

#### 工作流程图

```
用户上传图片
    ↓
判断服务器模式
    ↓
┌─────────────────────────────────────┐
│  IS_LOCAL_SERVER == true            │
│  → 直接上传原图                      │
│  → 无压缩，保持原始质量              │
└─────────────────────────────────────┘
    ↓ (false)
┌─────────────────────────────────────┐
│  IS_LOCAL_SERVER == false           │
│  → 检查图片大小                      │
│    • ≤ 4MB：直接上传，不压缩         │
│    • > 4MB：执行压缩                 │
│  → 压缩时：                          │
│    • 检查尺寸，超过3072px则缩放      │
│    • 递归压缩直到 < 2MB              │
│    • PNG文件较小时保持PNG格式        │
│  → 上传处理后的图片                  │
└─────────────────────────────────────┘
    ↓
上传到 ComfyUI 服务器
```

#### 注意事项

- 压缩仅影响上传过程，不影响最终生成质量（ComfyUI 会根据工作流重新处理）
- 小于4MB的图片不压缩，保持原始质量直接上传
- 如果压缩后仍报 413 错误，可调小 `maxSizeKB` 参数（如 1024）
- 压缩失败时会尝试直接上传原图，可能仍会失败

```javascript
// 错误
"185": {
    "class_type": "SaveImage",
    ...
}

// 正确
"185": {
    "class_type": "LayerUtility: SaveImagePlus",
    ...
}
```

### 5. 模型列表加载失败

**原因**：
- ❌ 直接使用 `fetch` 请求云端ComfyUI服务器，导致CORS跨域问题
- ✅ 应该使用 `apiFetch` 通过Flask代理请求
- 后端 `/api/comfyui/object_info` 端点需要支持获取特定节点信息

**解决方案**：

#### 前端代码（正确方式）

```javascript
// ✅ 正确：使用apiFetch通过Flask代理
async function fetchModels(nodeType) {
    const loaderInfo = MODEL_LOADER_TYPES[nodeType];
    if (!loaderInfo) return [];
    try {
        // 使用apiFetch通过Flask代理请求，避免CORS跨域问题
        const response = await apiFetch(`/api/comfyui/object_info/${nodeType}`);
        if (!response.ok) return [];
        const data = await response.json();
        const nodeInfo = data[nodeType];
        if (nodeInfo && nodeInfo.input && nodeInfo.input.required) {
            const options = nodeInfo.input.required[loaderInfo.param];
            if (Array.isArray(options[0])) return options[0];
        }
        return [];
    } catch (err) {
        console.warn('获取模型列表失败:', err);
        return [];
    }
}

// ❌ 错误：直接请求云端服务器（会有CORS问题）
const response = await fetch(`${COMFYUI_SERVER}/object_info/UNETLoader`);
```

#### 后端代码（Flask代理）

```python
# app.py - 支持获取特定节点信息
@app.route('/api/comfyui/object_info', methods=['GET'])
@app.route('/api/comfyui/object_info/<node_type>', methods=['GET'])
@require_active_server
def get_object_info(node_type=None):
    """获取 ComfyUI 节点信息"""
    try:
        base_url = get_server_url_from_request()
        if node_type:
            # 获取特定节点的信息
            response = requests.get(f"{base_url}/object_info/{node_type}", timeout=10)
        else:
            # 获取所有节点信息
            response = requests.get(f"{base_url}/object_info", timeout=10)
        return jsonify(response.json())
    except Exception as e:
        logger.error(f"获取节点信息失败：{e}")
        return jsonify({'error': str(e)}), 500
```

**关键点**：
- ✅ 所有模型列表请求都必须通过 `apiFetch` 使用Flask代理
- ✅ 后端需要支持 `/api/comfyui/object_info/<node_type>` 路径参数
- ❌ 不要直接使用 `fetch` 请求云端ComfyUI地址

### 6. WebSocket连接失败

**原因**：
- WebSocket URL格式错误
- 云端ComfyUI不支持WebSocket

**解决方案**：
```javascript
// 正确构建WebSocket URL
let baseUrl = COMFYUI_SERVER.replace(/\/+$/, '');
let wsUrl;

if (baseUrl.startsWith('https://')) {
    wsUrl = `wss://${baseUrl.replace('https://', '')}/ws?clientId=${clientId}`;
} else {
    wsUrl = `ws://${baseUrl.replace('http://', '')}/ws?clientId=${clientId}`;
}
```

### 7. 跨平台路径分隔符问题（Windows/Linux）

**问题描述**：
当应用在Windows本地服务器和Linux云端服务器之间切换时，出现模型验证失败错误：

```
LoraLoaderModelOnly 29: 
   - Value not in list: lora_name: 'SDXL\XX.safetensors' not in ['PixarXL.safetensors', ...]
```

**根本原因**：
1. **路径分隔符差异**：Windows使用反斜杠 `\`，Linux使用正斜杠 `/`
2. **ComfyUI验证机制**：即使节点通过条件判断不会执行（如 `easy ifElse` 跳过），ComfyUI仍然会**验证所有节点的参数**
3. **硬编码默认值无效**：工作流模板中的默认模型名称在目标服务器上不存在

**解决方案**：

#### 方案一：动态获取服务器模型列表（推荐）

```javascript
// 1. 声明全局变量存储可用模型
let availableLoras = [];

// 2. 加载模型时更新工作流模板默认值
async function loadModels() {
    try {
        const response = await apiFetch('/api/comfyui/object_info');
        const objectInfo = await response.json();
        
        // 获取Checkpoint列表
        if (objectInfo.CheckpointLoaderSimple) {
            const checkpoints = objectInfo.CheckpointLoaderSimple.input.required.ckpt_name[0];
            const select = document.getElementById('checkpointSelect');
            select.innerHTML = checkpoints.map(name => `<option value="${name}">${name}</option>`).join('');
            
            // 更新工作流Checkpoint默认值
            if (checkpoints.length > 0) {
                updateWorkflowCheckpointDefault(checkpoints[0]);
            }
        }
        
        // 获取LoRA列表
        if (objectInfo.LoraLoaderModelOnly) {
            availableLoras = objectInfo.LoraLoaderModelOnly.input.required.lora_name[0];
            const lora1Select = document.getElementById('lora1Name');
            const lora2Select = document.getElementById('lora2Name');
            lora1Select.innerHTML = availableLoras.map(name => `<option value="${name}">${name}</option>`).join('');
            lora2Select.innerHTML = availableLoras.map(name => `<option value="${name}">${name}</option>`).join('');
            
            // 更新工作流LoRA默认值
            if (availableLoras.length > 0) {
                updateWorkflowLoraDefaults(availableLoras[0]);
            }
        }
    } catch (error) {
        console.error('加载模型列表失败:', error);
    }
}

// 3. 更新工作流LoRA默认值
function updateWorkflowLoraDefaults(defaultLora) {
    if (WORKFLOW_TEMPLATE["27"]) {
        WORKFLOW_TEMPLATE["27"]["inputs"]["lora_name"] = defaultLora;
    }
    if (WORKFLOW_TEMPLATE["29"]) {
        WORKFLOW_TEMPLATE["29"]["inputs"]["lora_name"] = defaultLora;
    }
    console.log('已更新工作流LoRA默认值:', defaultLora);
}

// 4. 更新工作流Checkpoint默认值
function updateWorkflowCheckpointDefault(defaultCkpt) {
    if (WORKFLOW_TEMPLATE["36"]) {
        WORKFLOW_TEMPLATE["36"]["inputs"]["ckpt_name"] = defaultCkpt;
    }
    console.log('已更新工作流Checkpoint默认值:', defaultCkpt);
}

// 5. 构建工作流时确保使用有效值
function buildWorkflow(imageName, checkpoint, lora1, lora1Enabled, lora2, lora2Enabled, denoise, prompt) {
    const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATE));
    
    workflow["17"]["inputs"]["image"] = imageName;
    workflow["36"]["inputs"]["ckpt_name"] = checkpoint;
    workflow["5"]["inputs"]["denoise"] = denoise;
    workflow["5"]["inputs"]["seed"] = Math.floor(Math.random() * 1000000000000000);
    workflow["32"]["inputs"]["text"] = prompt;
    
    // 获取当前服务器第一个可用的LoRA
    const defaultLora = availableLoras.length > 0 ? availableLoras[0] : (lora1 || '');
    
    // 始终设置有效的LoRA名称（即使开关关闭）
    workflow["40"]["inputs"]["boolean"] = lora1Enabled;
    workflow["27"]["inputs"]["lora_name"] = (lora1Enabled && lora1) ? lora1 : defaultLora;
    
    workflow["41"]["inputs"]["boolean"] = lora2Enabled;
    workflow["29"]["inputs"]["lora_name"] = (lora2Enabled && lora2) ? lora2 : defaultLora;
    
    return workflow;
}
```

#### 工作流程

```
页面加载
  ↓
loadModels() 调用 /api/comfyui/object_info
  ↓
获取当前服务器的模型列表
  ├─ Windows本地服务器: ['SDXL\PixarXL.safetensors', 'SDXL\XX.safetensors', ...]
  └─ Linux云端服务器: ['PixarXL.safetensors', '2.5D手绘.safetensors', ...]
  ↓
更新 WORKFLOW_TEMPLATE 默认值
  ├─ WORKFLOW_TEMPLATE["27"]["inputs"]["lora_name"] = 第一个可用LoRA
  ├─ WORKFLOW_TEMPLATE["29"]["inputs"]["lora_name"] = 第一个可用LoRA
  └─ WORKFLOW_TEMPLATE["36"]["inputs"]["ckpt_name"] = 第一个可用Checkpoint
  ↓
用户点击生成
  ↓
buildWorkflow() 使用当前服务器的有效模型名称
  ↓
提交工作流 → ✅ 验证通过 → 执行成功
```

#### 关键要点

| 要点 | 说明 |
|------|------|
| **自动适配** | 切换服务器时自动获取新服务器的模型列表 |
| **零硬编码** | 不依赖任何固定的模型路径 |
| **跨平台兼容** | Windows `\` 和 Linux `/` 路径都能正确处理 |
| **容错处理** | 即使LoRA开关关闭，也使用有效的默认值 |
| **验证机制** | ComfyUI会验证所有节点，包括不会执行的节点 |

#### 错误示例

```javascript
// ❌ 错误：硬编码Windows路径
const WORKFLOW_TEMPLATE = {
    "27": { 
        "inputs": { 
            "lora_name": "SDXL\\PixarXL.safetensors",  // Linux服务器不存在
            ...
        }
    },
    "29": { 
        "inputs": { 
            "lora_name": "SDXL\\XX.safetensors",  // Linux服务器不存在
            ...
        }
    }
};

// ❌ 错误：开关关闭时不设置LoRA名称
function buildWorkflow(...) {
    workflow["40"]["inputs"]["boolean"] = lora1Enabled;
    if (lora1Enabled && lora1) {
        workflow["27"]["inputs"]["lora_name"] = lora1;
    }
    // 如果 lora1Enabled = false，节点27仍然使用无效的默认值
    // ComfyUI验证会失败！
}
```

#### 正确示例

```javascript
// ✅ 正确：使用动态获取的模型列表
let availableLoras = [];

async function loadModels() {
    const response = await apiFetch('/api/comfyui/object_info');
    const objectInfo = await response.json();
    availableLoras = objectInfo.LoraLoaderModelOnly.input.required.lora_name[0];
    
    // 更新工作流默认值
    updateWorkflowLoraDefaults(availableLoras[0]);
}

// ✅ 正确：始终设置有效的LoRA名称
function buildWorkflow(...) {
    const defaultLora = availableLoras.length > 0 ? availableLoras[0] : '';
    
    // 即使开关关闭，也使用有效的默认值
    workflow["27"]["inputs"]["lora_name"] = (lora1Enabled && lora1) ? lora1 : defaultLora;
    workflow["29"]["inputs"]["lora_name"] = (lora2Enabled && lora2) ? lora2 : defaultLora;
}
```

#### 案例：手部修复应用的LoRA路径问题

**应用场景**：flux_fill_hand_app.html 修复手部/脚部

**问题特点**：
- 应用有两个固定的LoRA：`Hand v2.safetensors` 和 `Foot v2.safetensors`
- 用户不能手动选择LoRA，由修复类型自动决定
- Windows路径：`flux\\Hand v2.safetensors`
- Linux路径：`flux/Hand v2.safetensors`

**解决方案**：

```javascript
// 1. 加载时获取服务器LoRA列表
let availableLoras = [];

async function loadModels() {
    const response = await apiFetch('/api/comfyui/object_info/LoraLoaderModelOnly');
    const objectInfo = await response.json();
    availableLoras = objectInfo.LoraLoaderModelOnly.input.required.lora_name[0];
    
    // 更新工作流默认值
    if (availableLoras.length > 0) {
        updateWorkflowLoraDefaults(availableLoras[0]);
    }
}

// 2. 构建工作流时智能匹配LoRA
function buildWorkflow(repairType) {
    const workflow = JSON.parse(JSON.stringify(WORKFLOW_TEMPLATE));
    
    const defaultLora = availableLoras.length > 0 ? availableLoras[0] : '';
    
    if (repairType === 'hand' && availableLoras.length > 0) {
        // 查找包含"Hand"的LoRA
        const handLora = availableLoras.find(lora => lora.toLowerCase().includes('hand'));
        workflow["58"]["inputs"]["lora_name"] = handLora || defaultLora;
    } else if (repairType === 'foot' && availableLoras.length > 0) {
        // 查找包含"Foot"的LoRA
        const footLora = availableLoras.find(lora => lora.toLowerCase().includes('foot'));
        workflow["96"]["inputs"]["lora_name"] = footLora || defaultLora;
    }
    
    return workflow;
}
```

**关键点**：
- ✅ 使用 `find()` 方法智能匹配LoRA名称
- ✅ 如果找不到匹配的LoRA，使用第一个可用的作为备选
- ✅ 始终确保工作流中的LoRA名称在当前服务器上存在

---

## 快速检查清单

开发新应用时，请确保：

- [ ] 使用 `apiFetch` 而不是 `fetch` 请求ComfyUI API
- [ ] 配置加载优先从 `localStorage` 读取
- [ ] 工作流使用 `LayerUtility: SaveImagePlus` 保存图像
- [ ] 图片显示使用 blob URL 而不是直接设置API URL
- [ ] 图片下载和预览使用 `apiFetch` 重新获取
- [ ] WebSocket URL 正确构建（wss:// 或 ws://）
- [ ] 所有动态参数在工作流中正确替换
- [ ] 错误处理完善（try-catch）
- [ ] 控制台日志清晰（便于调试）
- [ ] **模型路径使用动态获取，不硬编码**
- [ ] **工作流所有节点参数使用服务器实际存在的值**
- [ ] **跨平台兼容：Windows和Linux路径分隔符差异**

---

## 参考文件

- [CGstyle-jiami.html](file:///c:/Users/xingyue/Desktop/flask_app0416/templates/apps/CGstyle-jiami.html) - 完整实现示例
- [wannengxuanran_app.html](file:///c:/Users/xingyue/Desktop/flask_app0416/templates/apps/wannengxuanran_app.html) - 参考实现
- [app.py](file:///c:/Users/xingyue/Desktop/flask_app0416/app.py) - Flask后端代理实现
- [CLAUDE.md](file:///c:/Users/xingyue/Desktop/flask_app0416/CLAUDE.md) - 项目架构文档

---

**文档版本**: v1.1  
**最后更新**: 2026-04-19  
**维护者**: Xingyue AI Team  
**更新内容**: 新增双模式架构（本地直连/云端代理）章节
