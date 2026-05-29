# 后端 API 技术文档

## FastAPI 应用架构

### 概述

后端基于 FastAPI 构建，提供 RESTful API、WebSocket 实时通信、文件处理和外部服务代理功能。

### 代码位置

- **主文件：** [main.py](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/main.py)

### 应用初始化

```python
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 目录结构配置

```python
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKFLOW_DIR = os.path.join(BASE_DIR, "workflows")
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
OUTPUT_INPUT_DIR = os.path.join(ASSETS_DIR, "input")
OUTPUT_OUTPUT_DIR = os.path.join(ASSETS_DIR, "output")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")
API_ENV_FILE = os.path.join(BASE_DIR, "API", ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
CONVERSATION_DIR = os.path.join(DATA_DIR, "conversations")
CANVAS_DIR = os.path.join(DATA_DIR, "canvases")
API_PROVIDERS_FILE = os.path.join(DATA_DIR, "api_providers.json")
```

### 环境变量加载

```python
def load_env_file():
    """加载 API/.env 文件到环境变量"""
    if not os.path.exists(API_ENV_FILE):
        return
    try:
        with open(API_ENV_FILE, 'r', encoding='utf-8-sig') as f:
            for raw_line in f.read().splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                os.environ.setdefault(key, value)
    except Exception as e:
        print(f"加载 API/.env 失败: {e}")

load_env_file()
```

---

## WebSocket 管理

### ConnectionManager 类

#### 功能概述

管理所有 WebSocket 连接，追踪在线人数，支持广播和私信。

#### 数据结构

```python
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []      # 所有连接
        self.user_connections: Dict[str, WebSocket] = {}   # 用户 ID → 连接
        self.connection_clients: Dict[WebSocket, str] = {} # 连接 → 客户端 ID
```

#### 核心方法

##### `connect(websocket, client_id)`

**功能：** 接受并注册 WebSocket 连接

```python
async def connect(self, websocket: WebSocket, client_id: str = None):
    await websocket.accept()
    self.active_connections.append(websocket)
    self.connection_clients[websocket] = client_id or f"anon-{id(websocket)}"
    
    if client_id:
        self.user_connections[client_id] = websocket
    
    print(f"WS Connected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
    await self.broadcast_count()
```

##### `disconnect(websocket, client_id)`

**功能：** 断开并清理连接

```python
async def disconnect(self, websocket: WebSocket, client_id: str = None):
    if websocket in self.active_connections:
        self.active_connections.remove(websocket)
    self.connection_clients.pop(websocket, None)
    
    if client_id and self.user_connections.get(client_id) is websocket:
        del self.user_connections[client_id]
    
    print(f"WS Disconnected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
    await self.broadcast_count()
```

##### `online_count()`

**功能：** 计算在线人数（排除画布连接）

```python
def online_count(self):
    visible_clients = {
        client_id for client_id in self.connection_clients.values()
        if client_id and not str(client_id).startswith("canvas_")
    }
    return len(visible_clients)
```

##### `broadcast_count()`

**功能：** 广播在线人数

```python
async def broadcast_count(self):
    count = self.online_count()
    data = json.dumps({"type": "stats", "online_count": count})
    
    for connection in self.active_connections[:]:
        try:
            await connection.send_text(data)
        except Exception as e:
            print(f"Broadcast error: {e}")
            self.active_connections.remove(connection)
```

##### `broadcast_new_image(image_data)`

**功能：** 广播新生成的图片

```python
async def broadcast_new_image(self, image_data: dict):
    data = json.dumps({"type": "new_image", "data": image_data})
    
    for connection in self.active_connections[:]:
        try:
            await connection.send_text(data)
        except Exception as e:
            print(f"Broadcast image error: {e}")
            self.active_connections.remove(connection)
```

##### `broadcast_canvas_updated(canvas_id, updated_at, client_id)`

**功能：** 广播画布更新

```python
async def broadcast_canvas_updated(self, canvas_id: str, updated_at: int, client_id: str = ""):
    data = json.dumps({
        "type": "canvas_updated",
        "canvas_id": canvas_id,
        "updated_at": updated_at,
        "client_id": client_id or "",
    })
    
    for connection in self.active_connections[:]:
        try:
            await connection.send_text(data)
        except Exception as e:
            print(f"Broadcast canvas error: {e}")
            self.active_connections.remove(connection)
```

##### `send_personal_message(message, client_id)`

**功能：** 发送私信给指定用户

```python
async def send_personal_message(self, message: dict, client_id: str):
    ws = self.user_connections.get(client_id)
    if ws:
        try:
            await ws.send_text(json.dumps(message))
        except Exception as e:
            print(f"Personal message error for {client_id}: {e}")
```

### WebSocket 端点

```python
@app.websocket("/ws/stats")
async def websocket_endpoint(websocket: WebSocket, client_id: str = None):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, client_id)
    except Exception as e:
        print(f"WS Error: {e}")
        await manager.disconnect(websocket, client_id)
```

---

## 核心 API 端点

### 画布 CRUD

#### 获取画布列表

```python
@app.get("/api/canvases")
async def get_canvases():
    """获取所有画布列表"""
    if not os.path.exists(CANVAS_DIR):
        return {"success": True, "canvases": []}
    
    canvases = []
    for filename in os.listdir(CANVAS_DIR):
        if filename.endswith('.json'):
            filepath = os.path.join(CANVAS_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    canvases.append({
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "created_at": data.get("created_at"),
                        "updated_at": data.get("updated_at")
                    })
            except Exception as e:
                print(f"读取画布 {filename} 失败: {e}")
    
    # 按更新时间排序
    canvases.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
    return {"success": True, "canvases": canvases}
```

#### 获取单个画布

```python
@app.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str):
    """获取单个画布完整数据"""
    filepath = os.path.join(CANVAS_DIR, f"{canvas_id}.json")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="画布不存在")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)
```

#### 保存画布

```python
@app.post("/api/canvases/save")
async def save_canvas(request: Request):
    """保存画布数据"""
    data = await request.json()
    
    canvas_id = data.get("id") or str(uuid.uuid4())
    filepath = os.path.join(CANVAS_DIR, f"{canvas_id}.json")
    
    canvas_data = {
        "id": canvas_id,
        "name": data.get("name", "未命名画布"),
        "nodes": data.get("nodes", []),
        "connections": data.get("connections", []),
        "viewport": data.get("viewport", {"pan": {"x": 0, "y": 0}, "zoom": 1}),
        "created_at": data.get("created_at", int(time.time() * 1000)),
        "updated_at": int(time.time() * 1000)
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(canvas_data, f, ensure_ascii=False, indent=2)
    
    # 广播更新
    await manager.broadcast_canvas_updated(
        canvas_id, 
        canvas_data["updated_at"],
        data.get("client_id", "")
    )
    
    return {"success": True, "id": canvas_id}
```

#### 删除画布

```python
@app.post("/api/canvases/delete")
async def delete_canvas(request: Request):
    """删除画布（移入回收站）"""
    data = await request.json()
    canvas_id = data.get("id")
    
    filepath = os.path.join(CANVAS_DIR, f"{canvas_id}.json")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="画布不存在")
    
    # 读取画布数据
    with open(filepath, 'r', encoding='utf-8') as f:
        canvas_data = json.load(f)
    
    # 移入回收站（添加删除时间）
    canvas_data["deleted_at"] = int(time.time() * 1000)
    
    trash_dir = os.path.join(CANVAS_DIR, "trash")
    os.makedirs(trash_dir, exist_ok=True)
    
    trash_path = os.path.join(trash_dir, f"{canvas_id}.json")
    with open(trash_path, 'w', encoding='utf-8') as f:
        json.dump(canvas_data, f, ensure_ascii=False, indent=2)
    
    # 删除原文件
    os.remove(filepath)
    
    return {"success": True}
```

#### 获取回收站

```python
@app.get("/api/canvases/trash")
async def get_trash():
    """获取回收站画布列表"""
    trash_dir = os.path.join(CANVAS_DIR, "trash")
    
    if not os.path.exists(trash_dir):
        return {"success": True, "canvases": []}
    
    canvases = []
    for filename in os.listdir(trash_dir):
        if filename.endswith('.json'):
            filepath = os.path.join(trash_dir, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    canvases.append({
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "deleted_at": data.get("deleted_at")
                    })
            except Exception as e:
                print(f"读取回收站画布 {filename} 失败: {e}")
    
    return {"success": True, "canvases": canvases}
```

#### 恢复画布

```python
@app.post("/api/canvases/restore")
async def restore_canvas(request: Request):
    """从回收站恢复画布"""
    data = await request.json()
    canvas_id = data.get("id")
    
    trash_path = os.path.join(CANVAS_DIR, "trash", f"{canvas_id}.json")
    
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="回收站中不存在该画布")
    
    # 读取画布
    with open(trash_path, 'r', encoding='utf-8') as f:
        canvas_data = json.load(f)
    
    # 移除删除时间
    canvas_data.pop("deleted_at", None)
    
    # 恢复到原目录
    filepath = os.path.join(CANVAS_DIR, f"{canvas_id}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(canvas_data, f, ensure_ascii=False, indent=2)
    
    # 删除回收站文件
    os.remove(trash_path)
    
    return {"success": True}
```

#### 彻底删除

```python
@app.post("/api/canvases/purge")
async def purge_canvas(request: Request):
    """彻底删除画布"""
    data = await request.json()
    canvas_id = data.get("id")
    
    trash_path = os.path.join(CANVAS_DIR, "trash", f"{canvas_id}.json")
    
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="回收站中不存在该画布")
    
    os.remove(trash_path)
    return {"success": True}
```

---

### 历史记录

#### 获取历史

```python
@app.get("/api/history")
async def get_history():
    """获取生成历史记录"""
    if not os.path.exists(HISTORY_FILE):
        return {"success": True, "history": []}
    
    with HISTORY_LOCK:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            history = json.load(f)
    
    # 按时间戳排序
    history.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"success": True, "history": history}
```

#### 删除历史

```python
@app.post("/api/history/delete")
async def delete_history(request: Request):
    """删除单条历史记录"""
    data = await request.json()
    timestamp = data.get("timestamp")
    
    if not timestamp:
        raise HTTPException(status_code=400, detail="缺少 timestamp 参数")
    
    with HISTORY_LOCK:
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
            
            # 过滤掉要删除的记录
            history = [h for h in history if h.get("timestamp") != timestamp]
            
            with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
    
    return {"success": True}
```

---

### API 平台管理

#### 获取 API 平台列表

```python
@app.get("/api/providers")
async def get_providers():
    """获取所有 API 平台配置"""
    if not os.path.exists(API_PROVIDERS_FILE):
        return {"success": True, "providers": []}
    
    with open(API_PROVIDERS_FILE, 'r', encoding='utf-8') as f:
        providers = json.load(f)
    
    # 不返回完整 Key
    for provider in providers:
        if provider.get("key"):
            provider["key"] = provider["key"][:8] + "..."
    
    return {"success": True, "providers": providers}
```

#### 保存 API 平台

```python
@app.post("/api/providers/save")
async def save_providers(request: Request):
    """保存 API 平台配置"""
    data = await request.json()
    providers = data.get("providers", [])
    
    # 验证
    for provider in providers:
        if not provider.get("id"):
            raise HTTPException(status_code=400, detail="平台 ID 不能为空")
        if not PROVIDER_ID_RE.match(provider["id"]):
            raise HTTPException(status_code=400, detail="平台 ID 格式不正确")
    
    with open(API_PROVIDERS_FILE, 'w', encoding='utf-8') as f:
        json.dump(providers, f, ensure_ascii=False, indent=2)
    
    return {"success": True}
```

---

### 图片生成

#### OpenAI 兼容 API 生成

```python
@app.post("/api/generate")
async def generate_image(request: Request):
    """通过 OpenAI 兼容 API 生成图片"""
    data = await request.json()
    
    provider = data.get("provider")
    model = data.get("model")
    prompt = data.get("prompt")
    size = data.get("size", "1024x1024")
    count = data.get("count", 1)
    
    # 获取 API Key
    api_key = get_api_key(provider)
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")
    
    # 构造请求
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    body = {
        "model": model,
        "prompt": prompt,
        "size": size,
        "n": count
    }
    
    # 如果有参考图（图生图）
    if data.get("image"):
        body["image"] = data["image"]
        body["mode"] = "img2img"
        body["strength"] = data.get("strength", 0.75)
    
    # 如果有 LoRA
    if data.get("lora"):
        body["lora"] = data["lora"]
    
    # 调用外部 API
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{get_api_base_url(provider)}/images/generations",
            headers=headers,
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"API 调用失败: {response.text}"
            )
        
        result = response.json()
    
    # 保存图片到本地
    images = []
    for i, img_data in enumerate(result.get("data", [])):
        if img_data.get("url"):
            # 从 URL 下载
            img_response = await httpx.AsyncClient().get(img_data["url"])
            img_bytes = img_response.content
        elif img_data.get("b64_json"):
            # base64 数据
            img_bytes = base64.b64decode(img_data["b64_json"])
        else:
            continue
        
        # 保存到文件
        filename = f"gen_{int(time.time())}_{i}.png"
        filepath = os.path.join(OUTPUT_OUTPUT_DIR, filename)
        os.makedirs(OUTPUT_OUTPUT_DIR, exist_ok=True)
        
        with open(filepath, 'wb') as f:
            f.write(img_bytes)
        
        # 转换为 base64 返回
        img_base64 = base64.b64encode(img_bytes).decode('utf-8')
        images.append({
            "filename": filename,
            "data": f"data:image/png;base64,{img_base64}"
        })
    
    # 记录历史
    record_history({
        "type": "generate",
        "provider": provider,
        "model": model,
        "prompt": prompt,
        "timestamp": int(time.time() * 1000),
        "images": [img["filename"] for img in images]
    })
    
    # 广播新生成的图片
    await manager.broadcast_new_image({
        "images": images,
        "timestamp": int(time.time() * 1000)
    })
    
    return {"success": True, "images": images}
```

#### ModelScope 生成

```python
@app.post("/api/ms/generate")
async def ms_generate(request: Request):
    """ModelScope API 生成"""
    data = await request.json()
    
    model = data.get("model")
    prompt = data.get("prompt")
    token = data.get("token") or MODELSCOPE_API_KEY
    
    if not token:
        raise HTTPException(status_code=400, detail="未配置 ModelScope Token")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    body = {
        "model": model,
        "input": {
            "prompt": prompt
        },
        "parameters": data.get("parameters", {})
    }
    
    # 调用 ModelScope API
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(
            "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis",
            headers=headers,
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"ModelScope 调用失败: {response.text}"
            )
        
        result = response.json()
    
    # 处理返回结果
    images = []
    for img_data in result.get("output", {}).get("results", []):
        if img_data.get("url"):
            images.append({"url": img_data["url"]})
    
    return {"success": True, "images": images}
```

---

### 聊天 API

#### LLM 调用

```python
@app.post("/api/chat")
async def chat(request: Request):
    """调用聊天模型"""
    data = await request.json()
    
    provider = data.get("provider")
    model = data.get("model")
    messages = data.get("messages", [])
    
    # 获取 API Key 和 Base URL
    api_key = get_api_key(provider)
    base_url = get_api_base_url(provider)
    
    if not api_key:
        raise HTTPException(status_code=400, detail="未配置 API Key")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    body = {
        "model": model,
        "messages": messages
    }
    
    # 调用 API
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=body
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"聊天 API 调用失败: {response.text}"
            )
        
        result = response.json()
    
    return result
```

---

### ComfyUI 代理

#### 提交工作流

```python
@app.post("/api/comfy/queue")
async def comfy_queue(request: Request):
    """提交工作流到 ComfyUI"""
    data = await request.json()
    
    workflow = data.get("workflow")
    instance = data.get("instance") or COMFYUI_ADDRESS
    
    # 提交到 ComfyUI 队列
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"http://{instance}/prompt",
            json={"prompt": workflow}
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"ComfyUI 提交失败: {response.text}"
            )
        
        result = response.json()
    
    return {"success": True, "prompt_id": result.get("prompt_id")}
```

#### 获取队列状态

```python
@app.get("/api/comfy/queue/status")
async def comfy_queue_status():
    """获取 ComfyUI 队列状态"""
    instance = request.query_params.get("instance", COMFYUI_ADDRESS)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(f"http://{instance}/queue")
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="获取队列失败")
        
        return response.json()
```

---

### 文件处理

#### 图片上传

```python
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传图片文件"""
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="仅支持图片文件")
    
    # 读取文件
    content = await file.read()
    
    # 生成文件名
    ext = file.filename.split('.')[-1]
    filename = f"upload_{int(time.time())}.{ext}"
    filepath = os.path.join(OUTPUT_INPUT_DIR, filename)
    
    os.makedirs(OUTPUT_INPUT_DIR, exist_ok=True)
    
    # 保存文件
    with open(filepath, 'wb') as f:
        f.write(content)
    
    return {
        "success": True,
        "filename": filename,
        "path": filepath
    }
```

#### 图片下载

```python
@app.get("/api/images/{filename}")
async def get_image(filename: str):
    """获取图片文件"""
    filepath = os.path.join(OUTPUT_OUTPUT_DIR, filename)
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="图片不存在")
    
    return FileResponse(filepath)
```

---

## 数据模型

### Pydantic 模型

```python
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class CanvasData(BaseModel):
    id: str
    name: str
    nodes: List[Dict[str, Any]]
    connections: List[Dict[str, Any]]
    viewport: Dict[str, Any] = {"pan": {"x": 0, "y": 0}, "zoom": 1}

class GenerateRequest(BaseModel):
    provider: str
    model: str
    prompt: str = Field(..., max_length=20000)
    size: str = "1024x1024"
    count: int = Field(1, ge=1, le=10)
    image: Optional[str] = None
    lora: Optional[Dict[str, Any]] = None

class ChatRequest(BaseModel):
    provider: str
    model: str
    messages: List[Dict[str, str]]

class HistoryEntry(BaseModel):
    type: str
    provider: str
    model: str
    prompt: str
    timestamp: int
    images: List[str]
```

### 历史记录存储

```python
# history.json 结构
[
  {
    "type": "generate",
    "provider": "ModelScope",
    "model": "stable-diffusion-xl",
    "prompt": "一个美丽的日落",
    "timestamp": 1234567890,
    "images": ["gen_1234567890_0.png", "gen_1234567890_1.png"]
  }
]
```

### 画布存储结构

```python
# data/canvases/{canvas_id}.json
{
  "id": "uuid",
  "name": "我的画布",
  "nodes": [
    {
      "id": "node-1",
      "type": "image",
      "x": 100,
      "y": 200,
      "data": {...}
    }
  ],
  "connections": [
    {
      "id": "link-1",
      "from": {"nodeId": "node-1", "portId": "out-image"},
      "to": {"nodeId": "node-2", "portId": "in-image"}
    }
  ],
  "viewport": {
    "pan": {"x": 0, "y": 0},
    "zoom": 1
  },
  "created_at": 1234567890,
  "updated_at": 1234567891
}
```

---

## 错误处理

### 请求验证错误

```python
@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    """自定义验证错误处理"""
    errors = exc.errors()
    message = friendly_validation_error(errors)
    
    return JSONResponse(
        status_code=422,
        content={"detail": message}
    )
```

### 友好错误消息

```python
def friendly_validation_error(errors):
    """将验证错误转换为友好的中文消息"""
    parts = []
    for err in errors or []:
        loc = [str(item) for item in err.get("loc", []) if item != "body"]
        field = loc[-1] if loc else ""
        label = FIELD_LABELS.get(field, field or "请求参数")
        ctx = err.get("ctx") or {}
        limit = ctx.get("limit_value") or ctx.get("max_length")
        err_type = str(err.get("type") or "")
        msg = str(err.get("msg") or "")
        
        if "max_length" in err_type or "at most" in msg:
            parts.append(f"{label}过长：当前内容超过后端上限 {limit} 个字符。请拆分为多个提示词节点，或先用 LLM 节点压缩后再生成。")
        elif "min_length" in err_type:
            parts.append(f"{label}不能为空。")
        else:
            parts.append(f"{label}格式不正确：{msg}")
    
    return "\n".join(parts) or "请求参数不正确。"
```

---

## 外部服务集成

### ComfyUI 连接

```python
# 从环境变量读取
COMFYUI_INSTANCES = [s.strip() for s in os.getenv("COMFYUI_INSTANCES", "127.0.0.1:8188").split(",") if s.strip()]
COMFYUI_ADDRESS = COMFYUI_INSTANCES[0]

# 连接测试
async def test_comfyui_connection(address: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"http://{address}/system_stats")
            return response.status_code == 200
    except Exception:
        return False
```

### ModelScope API

```python
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
MODELSCOPE_CHAT_BASE_URL = "https://api-inference.modelscope.cn/v1"

# 默认模型
MODELSCOPE_DEFAULT_IMAGE_MODELS = [
    "Tongyi-MAI/Z-Image-Turbo",
    "Qwen/Qwen-Image-2512",
    "Qwen/Qwen-Image-Edit-2511",
    "black-forest-labs/FLUX.2-klein-9B",
]

# 默认 LoRA
MODELSCOPE_DEFAULT_LORAS = [
    {
        "id": "Daniel8152/film",
        "name": "Z-Image Film",
        "target_model": "Tongyi-MAI/Z-Image-Turbo",
        "strength": 0.8,
        "enabled": True
    }
]
```

### OpenAI 兼容 API

```python
AI_BASE_URL = os.getenv("COMFLY_BASE_URL", "https://ai.comfly.chat").rstrip("/")
AI_API_KEY = os.getenv("COMFLY_API_KEY", "")

def get_api_key(provider: str) -> str:
    """根据提供商获取 API Key"""
    if provider == "ModelScope":
        return MODELSCOPE_API_KEY
    # 从 API_PROVIDERS_FILE 读取自定义配置
    if os.path.exists(API_PROVIDERS_FILE):
        with open(API_PROVIDERS_FILE, 'r') as f:
            providers = json.load(f)
            for p in providers:
                if p.get("id") == provider:
                    return p.get("key", "")
    return ""

def get_api_base_url(provider: str) -> str:
    """根据提供商获取 API Base URL"""
    if provider == "ModelScope":
        return MODELSCOPE_CHAT_BASE_URL
    # 从配置读取
    if os.path.exists(API_PROVIDERS_FILE):
        with open(API_PROVIDERS_FILE, 'r') as f:
            providers = json.load(f)
            for p in providers:
                if p.get("id") == provider:
                    return p.get("base_url", AI_BASE_URL)
    return AI_BASE_URL
```

---

## 日志系统

### 日志过滤

```python
QUIET_ACCESS_PATHS = {
    "/api/queue_status",
    "/api/canvases",
    "/api/canvases/trash",
}

class QuietAccessLogFilter(logging.Filter):
    """过滤频繁的访问日志"""
    def filter(self, record):
        args = record.args if isinstance(record.args, tuple) else ()
        if len(args) >= 3:
            path = str(args[2]).split("?", 1)[0]
            status = int(args[4]) if len(args) >= 5 and str(args[4]).isdigit() else 0
            quiet_dynamic = any(path.startswith(prefix) and path.endswith("/meta") for prefix in QUIET_ACCESS_PREFIXES)
            if (path in QUIET_ACCESS_PATHS or quiet_dynamic) and status < 400:
                return False
        return True

logging.getLogger("uvicorn.access").addFilter(QuietAccessLogFilter())
```

---

## 配置管理

### 环境变量

```python
# 超时配置
AI_REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
IMAGE_POLL_INTERVAL = float(os.getenv("IMAGE_POLL_INTERVAL", "2"))
IMAGE_TASK_TIMEOUT = float(os.getenv("IMAGE_TASK_TIMEOUT", str(AI_REQUEST_TIMEOUT)))
COMFYUI_HISTORY_TIMEOUT = int(float(os.getenv("COMFYUI_HISTORY_TIMEOUT", "1800")))

# 视频配置
VIDEO_POLL_TIMEOUT = float(os.getenv("VIDEO_POLL_TIMEOUT", "1800"))

# 长度限制
ONLINE_IMAGE_PROMPT_MAX_LENGTH = int(os.getenv("ONLINE_IMAGE_PROMPT_MAX_LENGTH", "20000"))
VIDEO_PROMPT_MAX_LENGTH = int(os.getenv("VIDEO_PROMPT_MAX_LENGTH", "4000"))
LLM_MESSAGE_MAX_LENGTH = int(os.getenv("LLM_MESSAGE_MAX_LENGTH", "20000"))
```

### 全局配置

```python
GLOBAL_CONFIG_FILE = os.path.join(BASE_DIR, "global_config.json")
GLOBAL_CONFIG_LOCK = Lock()

def load_global_config():
    """加载全局配置"""
    if not os.path.exists(GLOBAL_CONFIG_FILE):
        return {}
    
    with GLOBAL_CONFIG_LOCK:
        with open(GLOBAL_CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

def save_global_config(config: dict):
    """保存全局配置"""
    with GLOBAL_CONFIG_LOCK:
        with open(GLOBAL_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
```

---

## 性能考虑

### 线程锁

```python
QUEUE_LOCK = Lock()        # 队列操作锁
HISTORY_LOCK = Lock()      # 历史文件锁
GLOBAL_CONFIG_LOCK = Lock() # 全局配置锁
CONVERSATION_LOCK = Lock()  # 对话文件锁
CANVAS_LOCK = Lock()        # 画布文件锁
LOAD_LOCK = Lock()          # 加载锁
```

### 异步处理

```python
# 使用 httpx 异步客户端
async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
    response = await client.post(url, headers=headers, json=body)
```

### 文件缓存

```python
# 缓存常用配置
_provider_cache = {}

def get_provider_config(provider_id: str):
    global _provider_cache
    if provider_id not in _provider_cache:
        # 从文件加载
        _provider_cache[provider_id] = load_provider(provider_id)
    return _provider_cache[provider_id]
```

---

## 已知问题

1. **大文件上传**：未设置上传大小限制
2. **并发锁竞争**：多个锁可能导致性能瓶颈
3. **错误日志**：部分错误未记录详细堆栈
4. **缓存清理**：_provider_cache 无过期机制

## 未来改进建议

1. **添加上传大小限制**：防止超大文件
2. **异步文件 IO**：使用 aiofiles 提升文件操作性能
3. **数据库存储**：替代 JSON 文件存储
4. **缓存机制**：Redis 缓存频繁访问的数据
5. **监控和指标**：添加 Prometheus 指标
6. **API 限流**：防止滥用

---

## 测试检查清单

- [ ] 画布 CRUD 完整测试
- [ ] 历史记录删除测试
- [ ] API 平台配置保存测试
- [ ] 图片生成成功/失败测试
- [ ] 聊天 API 调用测试
- [ ] ComfyUI 连接测试
- [ ] 文件上传下载测试
- [ ] WebSocket 连接和广播测试
- [ ] 并发请求测试
- [ ] 错误处理测试
