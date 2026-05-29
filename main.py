import json
import uuid
import base64
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import os
import re
import random
import time
import shutil
import asyncio
import threading
import requests
from typing import List, Dict, Any, Optional
from threading import Lock
from contextlib import asynccontextmanager
import httpx
import websockets as ws_client
from PIL import Image
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Header, Request, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

# --- WebSocket 状态管理器 ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}
        self.connection_clients: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        self.connection_clients[websocket] = client_id or f"anon-{id(websocket)}"
        if client_id:
            self.user_connections[client_id] = websocket
        print(f"WS Connected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
        await self.broadcast_count()

    async def disconnect(self, websocket: WebSocket, client_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        self.connection_clients.pop(websocket, None)
        if client_id and self.user_connections.get(client_id) is websocket:
            del self.user_connections[client_id]
        print(f"WS Disconnected. Total: {len(self.active_connections)}, Online: {self.online_count()}")
        await self.broadcast_count()

    def online_count(self):
        visible_clients = {
            client_id for client_id in self.connection_clients.values()
            if client_id and not str(client_id).startswith("canvas_")
        }
        return len(visible_clients)

    async def broadcast_count(self):
        count = self.online_count()
        data = json.dumps({"type": "stats", "online_count": count})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast error: {e}")
                self.active_connections.remove(connection)

    async def broadcast_new_image(self, image_data: dict):
        data = json.dumps({"type": "new_image", "data": image_data})
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(data)
            except Exception as e:
                print(f"Broadcast image error: {e}")
                self.active_connections.remove(connection)

    async def send_personal_message(self, message: dict, client_id: str):
        ws = self.user_connections.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception as e:
                print(f"Personal message error for {client_id}: {e}")

# --- 应用初始化 ---
manager = ConnectionManager()
GLOBAL_LOOP = None
CANVAS_TASKS: Dict[str, Dict[str, Any]] = {}
CANVAS_TASK_LOCK = Lock()

@asynccontextmanager
async def lifespan(app: FastAPI):
    global GLOBAL_LOOP
    GLOBAL_LOOP = asyncio.get_running_loop()
    print("Application startup complete.")
    yield
    print("Application shutting down.")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# --- 配置区域 ---

CLIENT_ID = str(uuid.uuid4())
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORKFLOW_DIR = os.path.join(BASE_DIR, "workflows")
WORKFLOW_PATH = os.path.join(WORKFLOW_DIR, "Z-Image.json")
STATIC_DIR = os.path.join(BASE_DIR, "static")
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
INPUT_DIR = os.path.join(BASE_DIR, "input")
HISTORY_FILE = os.path.join(BASE_DIR, "history.json")
API_ENV_FILE = os.path.join(BASE_DIR, "API", ".env")
DATA_DIR = os.path.join(BASE_DIR, "data")
CONVERSATION_DIR = os.path.join(DATA_DIR, "conversations")
CANVAS_DIR = os.path.join(DATA_DIR, "canvases")
GLOBAL_CONFIG_FILE = os.path.join(BASE_DIR, "global_config.json")
CANVAS_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

# API 提供商配置文件路径
API_PROVIDERS_FILE = os.path.join(BASE_DIR, "api_providers.json")

def sanitize_folder_name(title, canvas_id):
    """生成安全的文件夹名称"""
    # 替换非法字符
    name = re.sub(r'[\/\:*?"<>|]', '_', title or '未命名')
    # 截断到合理长度
    name = name[:60].strip()
    # 追加画布ID前8位
    suffix = canvas_id[:8]
    return f"{name}_{suffix}" if name else suffix

def get_canvas_output_dir(canvas):
    """获取画布的输出目录路径（含用户隔离）"""
    owner = get_user_dirname(canvas.get("owner")) if canvas.get("owner") else ""
    folder = canvas.get("output_folder", "")
    if owner and folder:
        return os.path.join(OUTPUT_DIR, owner, folder)
    elif folder:
        return os.path.join(OUTPUT_DIR, folder)
    elif owner:
        path = os.path.join(OUTPUT_DIR, owner)
        os.makedirs(path, exist_ok=True)
        return path
    return OUTPUT_DIR

def get_canvas_asset_dir(canvas):
    """获取画布的资产目录路径（含用户隔离）"""
    owner = get_user_dirname(canvas.get("owner")) if canvas.get("owner") else ""
    folder = canvas.get("output_folder", "")
    if owner and folder:
        return os.path.join(INPUT_DIR, owner, folder)
    elif folder:
        return os.path.join(INPUT_DIR, folder)
    elif owner:
        path = os.path.join(INPUT_DIR, owner)
        os.makedirs(path, exist_ok=True)
        return path
    return INPUT_DIR

def build_output_url(canvas, filename, username=None):
    """构建 output 文件的 URL 路径"""
    if canvas:
        owner = get_user_dirname(canvas.get("owner")) if canvas.get("owner") else ""
        folder = canvas.get("output_folder", "")
        if owner and folder:
            return f"/output/{owner}/{folder}/{filename}"
        elif folder:
            return f"/output/{folder}/{filename}"
        elif owner:
            return f"/output/{owner}/{filename}"
        else:
            return f"/output/{filename}"
    elif username:
        user_dirname = get_user_dirname(username)
        return f"/output/{user_dirname}/{filename}"
    else:
        return f"/output/{filename}"

def build_asset_url(canvas, filename):
    """构建 asset 文件的 URL 路径（含用户隔离）"""
    if canvas:
        owner = get_user_dirname(canvas.get("owner")) if canvas.get("owner") else ""
        folder = canvas.get("output_folder", "")
        if owner and folder:
            return f"/assets/{owner}/{folder}/{filename}"
        elif folder:
            return f"/assets/{folder}/{filename}"
        elif owner:
            return f"/assets/{owner}/{filename}"
        else:
            return f"/assets/{filename}"
    return f"/assets/{filename}"

QUEUE = []
QUEUE_LOCK = Lock()
HISTORY_LOCK = Lock()
GLOBAL_CONFIG_LOCK = Lock()
CONVERSATION_LOCK = Lock()
CANVAS_LOCK = Lock()
LOAD_LOCK = Lock()
NEXT_TASK_ID = 1

# --- 账号认证配置 ---
SUPER_ADMIN_USERNAME = "admin"
USERS_FILE = os.path.join(BASE_DIR, "data", "users.json")

def hash_password(password):
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_users(users):
    os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def find_user_by_token(token):
    users = load_users()
    for username, data in users.items():
        if data.get("token") == token:
            return username, data
    return None, None

# --- 用户文件隔离辅助函数 ---

def get_username_by_token(token):
    """根据 token 获取用户名，返回 None 表示未登录"""
    if not token:
        return None
    username, user = find_user_by_token(token)
    return username

def is_admin_by_token(token):
    """根据 token 判断是否为管理员"""
    if not token:
        return False
    _, user = find_user_by_token(token)
    return bool(user and user.get("is_admin", False))

def validate_canvas_owner(canvas, token):
    """校验画布归属：管理员可操作所有画布，普通用户只能操作自己的画布"""
    is_admin = is_admin_by_token(token)
    if is_admin:
        return
    username = get_username_by_token(token)
    if not username or canvas.get("owner") != username:
        raise HTTPException(status_code=403, detail="无权操作此画布")

def get_user_dirname(username):
    """将用户名转换为安全的文件夹名"""
    if not username:
        return None
    return safe_user_id(username, None)

def get_user_output_dir(username):
    """获取用户的 output 子目录，返回 (目录路径, 目录名)"""
    dirname = get_user_dirname(username)
    if not dirname:
        return OUTPUT_DIR, ""
    path = os.path.join(OUTPUT_DIR, dirname)
    os.makedirs(path, exist_ok=True)
    return path, dirname

def get_user_input_dir(username):
    """获取用户的 input 子目录，返回 (目录路径, 目录名)"""
    dirname = get_user_dirname(username)
    if not dirname:
        return INPUT_DIR, ""
    path = os.path.join(INPUT_DIR, dirname)
    os.makedirs(path, exist_ok=True)
    return path, dirname

# --- API 提供商管理辅助函数 ---

def load_api_providers():
    """从文件加载 API 提供商列表"""
    if not os.path.exists(API_PROVIDERS_FILE):
        return []
    try:
        with open(API_PROVIDERS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def save_api_providers(providers):
    """保存 API 提供商列表到文件"""
    try:
        with open(API_PROVIDERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(providers, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Failed to save API providers: {e}")

def provider_key_env(provider_id):
    """生成提供商 API Key 的环境变量名"""
    return f"{provider_id.upper()}_API_KEY"

def normalize_provider(data):
    """规范化提供商数据"""
    return {
        "id": data.get("id", "").strip(),
        "name": data.get("name", "").strip(),
        "base_url": data.get("base_url", "").strip(),
        "protocol": data.get("protocol", "openai"),
        "image_models": data.get("image_models") or [],
        "chat_models": data.get("chat_models") or [],
        "video_models": data.get("video_models") or [],
        "primary": bool(data.get("primary", False)),
        "enabled": bool(data.get("enabled", True)),
    }

def public_provider(provider):
    """返回公开的提供商信息（隐藏 API Key）"""
    return {
        "id": provider["id"],
        "name": provider["name"],
        "base_url": provider["base_url"],
        "protocol": provider["protocol"],
        "image_models": provider["image_models"],
        "chat_models": provider["chat_models"],
        "video_models": provider.get("video_models") or [],
        "primary": provider["primary"],
        "enabled": provider["enabled"],
    }

def get_api_provider(provider_id):
    """根据 ID 获取提供商"""
    providers = load_api_providers()
    for p in providers:
        if p["id"] == provider_id:
            return p
    return None

def get_api_provider_exact(provider_id):
    """精确匹配提供商"""
    provider = get_api_provider(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail=f"API 平台不存在：{provider_id}")
    return provider

def reload_env_globals():
    """重新加载环境变量到全局变量（用于热更新）"""
    global COMFYUI_INSTANCES, COMFYUI_ADDRESS, AI_BASE_URL, AI_API_KEY, MODELSCOPE_API_KEY
    global CHAT_MODEL, IMAGE_MODEL, CHAT_MODELS, IMAGE_MODELS
    
    load_env_file()
    
    COMFYUI_INSTANCES = [s.strip() for s in os.getenv("COMFYUI_INSTANCES", "127.0.0.1:8188").split(",") if s.strip()]
    COMFYUI_ADDRESS = COMFYUI_INSTANCES[0]
    
    AI_BASE_URL = os.getenv("COMFLY_BASE_URL", "https://ukiyoapi.apifox.cn").rstrip("/")
    AI_API_KEY = os.getenv("COMFLY_API_KEY", "")
    MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
    
    CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
    IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-1")
    
    def model_list_reloaded(env_name, primary, defaults):
        configured = os.getenv(env_name, "")
        configured_values = [item.strip() for item in configured.split(",") if item.strip()]
        values = configured_values or [primary, *defaults]
        deduped = []
        for value in values:
            if value and value not in deduped:
                deduped.append(value)
        return deduped
    
    CHAT_MODELS = model_list_reloaded("CHAT_MODELS", CHAT_MODEL, ["gpt-4o-mini", "gemini-3.1-flash-image-preview-2k"])
    IMAGE_MODELS = model_list_reloaded("IMAGE_MODELS", IMAGE_MODEL, ["gpt-image-2-all", "nano-banana"])

def load_env_file():
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

def save_env_file(updates):
    """更新 .env 文件中的指定键值对"""
    if not os.path.exists(API_ENV_FILE):
        return False
    try:
        with open(API_ENV_FILE, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
        
        updated_keys = set()
        new_lines = []
        for line in lines:
            stripped = line.strip()
            if "=" in stripped and not stripped.startswith("#"):
                key = stripped.split("=", 1)[0].strip()
                if key in updates:
                    new_lines.append(f"{key}={updates[key]}\n")
                    updated_keys.add(key)
                    continue
            new_lines.append(line)
        
        for key, value in updates.items():
            if key not in updated_keys:
                new_lines.append(f"{key}={value}\n")
        
        with open(API_ENV_FILE, 'w', encoding='utf-8-sig') as f:
            f.writelines(new_lines)
        return True
    except Exception as e:
        print(f"保存 API/.env 失败: {e}")
        return False

load_env_file()

COMFYUI_INSTANCES = [s.strip() for s in os.getenv("COMFYUI_INSTANCES", "127.0.0.1:8188").split(",") if s.strip()]
COMFYUI_ADDRESS = COMFYUI_INSTANCES[0]

AI_BASE_URL = os.getenv("COMFLY_BASE_URL", "https://ai.comfly.chat").rstrip("/")
AI_API_KEY = os.getenv("COMFLY_API_KEY", "")
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
MODELSCOPE_CHAT_BASE_URL = "https://api-inference.modelscope.cn/v1"
MODELSCOPE_CHAT_MODELS = [m.strip() for m in os.getenv("MODELSCOPE_CHAT_MODELS", "Qwen/Qwen3-235B-A22B,MiniMax/MiniMax-M2.7:MiniMax").split(",") if m.strip()]
CHAT_MODEL = os.getenv("CHAT_MODEL", "gpt-4o-mini")
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "gpt-image-1")
SYSTEM_PROMPT = os.getenv("SYSTEM_PROMPT", "You are a helpful assistant.")
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "30"))
AI_REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "120"))
IMAGE_POLL_INTERVAL = float(os.getenv("IMAGE_POLL_INTERVAL", "2"))

def model_list(env_name, primary, defaults):
    configured = os.getenv(env_name, "")
    configured_values = [item.strip() for item in configured.split(",") if item.strip()]
    values = configured_values or [primary, *defaults]
    deduped = []
    for value in values:
        if value and value not in deduped:
            deduped.append(value)
    return deduped

CHAT_MODELS = model_list("CHAT_MODELS", CHAT_MODEL, ["gpt-4o-mini", "gemini-3.1-flash-image-preview-2k"])
IMAGE_MODELS = model_list("IMAGE_MODELS", IMAGE_MODEL, ["gpt-image-2-all", "nano-banana"])

BACKEND_LOCAL_LOAD = {addr: 0 for addr in COMFYUI_INSTANCES}

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(WORKFLOW_DIR, exist_ok=True)
os.makedirs(CONVERSATION_DIR, exist_ok=True)
os.makedirs(CANVAS_DIR, exist_ok=True)

# Custom static files with no-cache headers for HTML files
from starlette.responses import Response
from starlette.staticfiles import StaticFiles as StarletteStaticFiles
from starlette.datastructures import Headers
import mimetypes

# 确保 .js 文件被正确识别为 application/javascript
mimetypes.add_type('application/javascript', '.js')

class NoCacheStaticFiles(StarletteStaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if hasattr(response, 'headers'):
            # Disable caching for all static files to ensure latest JS/CSS is loaded
            response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
            response.headers['Pragma'] = 'no-cache'
            response.headers['Expires'] = '0'
        return response

app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")

# 自定义 output 静态文件服务，支持子文件夹访问
from starlette.responses import FileResponse as StarletteFileResponse

@app.get("/output/{path:path}")
async def serve_output_file(path: str):
    """提供 output 目录下的文件访问，支持子文件夹"""
    # 安全检查：防止路径遍历攻击
    clean_path = path.replace("\\", "/")
    if ".." in clean_path or clean_path.startswith("/"):
        raise HTTPException(status_code=404, detail="File not found")
    
    full_path = os.path.abspath(os.path.join(OUTPUT_DIR, clean_path))
    output_root = os.path.abspath(OUTPUT_DIR)
    
    # 确保请求的路径在 OUTPUT_DIR 内
    if not full_path.startswith(output_root):
        raise HTTPException(status_code=404, detail="File not found")
    
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # 设置正确的 Content-Type
    ext = os.path.splitext(full_path)[1].lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".txt": "text/plain; charset=utf-8",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".aac": "audio/aac",
        ".m4a": "audio/mp4",
    }.get(ext, "application/octet-stream")
    
    return StarletteFileResponse(
        full_path,
        media_type=media_type,
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    )

@app.get("/assets/{path:path}")
async def serve_asset_file(path: str):
    """提供 input 目录下的文件访问，支持子文件夹"""
    clean_path = path.replace("\\", "/")
    if ".." in clean_path or clean_path.startswith("/"):
        raise HTTPException(status_code=404, detail="File not found")
    
    full_path = os.path.abspath(os.path.join(INPUT_DIR, clean_path))
    input_root = os.path.abspath(INPUT_DIR)
    
    if not full_path.startswith(input_root):
        raise HTTPException(status_code=404, detail="File not found")
    
    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    ext = os.path.splitext(full_path)[1].lower()
    media_type = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".txt": "text/plain",
    }.get(ext, "application/octet-stream")
    
    return StarletteFileResponse(
        full_path,
        media_type=media_type,
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    )

# --- Pydantic 模型 ---

class GenerateRequest(BaseModel):
    prompt: str = ""
    width: int = 1024
    height: int = 1024
    workflow_json: str = ""
    workflow_data: Optional[Dict[str, Any]] = None
    params: Dict[str, Any] = {}
    type: str = "zimage"
    client_id: str = ""
    convert_to_jpg: bool = False
    prompt_id: str = ""
    canvas_id: str = ""  # 新增：画布ID，可选

class WorkflowField(BaseModel):
    id: str = ""
    node: Optional[str] = None
    input: Optional[str] = None
    type: str = "text"
    display_name: str = ""
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    options: List[str] = []

class WorkflowConfig(BaseModel):
    title: str = ""
    fields: List[WorkflowField] = []

class WorkflowRunRequest(BaseModel):
    fields: Dict[str, Any] = {}
    config: WorkflowConfig
    client_id: str = ""

class DeleteHistoryRequest(BaseModel):
    timestamp: float

class TokenRequest(BaseModel):
    token: str

class CloudGenRequest(BaseModel):
    prompt: str
    api_key: str = ""
    resolution: str = "1024*1024"
    type: str = "zimage"
    image_urls: List[str] = []
    client_id: Optional[str] = None

class CloudPollRequest(BaseModel):
    task_id: str
    api_key: str = ""
    client_id: Optional[str] = None

class AIReference(BaseModel):
    url: str = ""
    name: str = ""

class OnlineImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    model: str = ""
    size: str = "1024x1024"
    quality: str = "medium"
    protocol: str = "openai"
    provider_id: str = ""
    reference_images: List[AIReference] = []

class ChatRequest(BaseModel):
    conversation_id: str = ""
    message: str = Field(min_length=1, max_length=20000)
    model: str = ""
    image_model: str = ""
    mode: str = "chat"
    size: str = "1024x1024"
    quality: str = "auto"
    reference_images: List[AIReference] = []
    provider: str = "comfly"
    ms_model: str = ""

class MsGenerateRequest(BaseModel):
    prompt: str
    model: str = "black-forest-labs/FLUX.2-klein-9B"
    image_urls: List[str] = []
    width: int = 0
    height: int = 0
    loras: Optional[Any] = None
    client_id: Optional[str] = None

class CanvasLLMRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    system_prompt: str = "You are a helpful assistant."
    model: str = ""
    messages: List[Dict[str, str]] = []
    provider: str = "comfly"
    ms_model: str = ""

class ConversationCreateRequest(BaseModel):
    title: str = "新对话"

class CanvasCreateRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"

class CanvasSaveRequest(BaseModel):
    title: str = "未命名画布"
    icon: str = "🧩"
    nodes: List[Dict[str, Any]] = []
    connections: List[Dict[str, Any]] = []
    viewport: Dict[str, Any] = {}

class ConfigUpdateRequest(BaseModel):
    comfly_api_key: Optional[str] = None
    modelscope_api_key: Optional[str] = None
    comfly_base_url: Optional[str] = None

class AuthRegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=100)

class AuthLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=100)

class AdminResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1)
    username: str = Field(min_length=1, max_length=40)
    new_password: str = Field(min_length=1, max_length=100)

class AdminDeleteUserRequest(BaseModel):
    token: str = Field(min_length=1)
    username: str = Field(min_length=1, max_length=40)

# --- 负载均衡 ---

def check_images_exist(backend_addr, images):
    if not images: return True
    for img in images:
        try:
            url = f"http://{backend_addr}/view?filename={urllib.parse.quote(img)}&type=input"
            r = requests.get(url, stream=True, timeout=0.5)
            r.close()
            if r.status_code != 200: return False
        except: return False
    return True

def get_best_backend(required_images: List[str] = None):
    best_backend = COMFYUI_INSTANCES[0]
    min_queue_size = float('inf')
    candidates_with_images = []
    candidates_others = []
    backend_stats = {}

    for addr in COMFYUI_INSTANCES:
        try:
            with urllib.request.urlopen(f"http://{addr}/queue", timeout=1) as response:
                data = json.loads(response.read())
                remote_load = len(data.get('queue_running', [])) + len(data.get('queue_pending', []))
                with LOAD_LOCK:
                    local_load = BACKEND_LOCAL_LOAD.get(addr, 0)
                effective_load = max(remote_load, local_load)
                has_images = check_images_exist(addr, required_images)
                backend_stats[addr] = {"load": effective_load, "has_images": has_images}
                if has_images:
                    candidates_with_images.append(addr)
                else:
                    candidates_others.append(addr)
        except Exception as e:
            print(f"Backend {addr} unreachable: {e}")
            continue

    target_candidates = candidates_with_images if candidates_with_images else candidates_others
    if not target_candidates:
        if candidates_others:
            target_candidates = candidates_others
        else:
            return COMFYUI_INSTANCES[0]

    for addr in target_candidates:
        load = backend_stats[addr]["load"]
        if load < min_queue_size:
            min_queue_size = load
            best_backend = addr

    return best_backend

# --- 辅助工具 ---

def download_image(comfy_address, comfy_url_path, prefix="studio_", canvas=None, username=None):
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.png"
    if canvas:
        canvas_output_dir = get_canvas_output_dir(canvas)
    elif username:
        canvas_output_dir, _ = get_user_output_dir(username)
    else:
        canvas_output_dir = OUTPUT_DIR
    os.makedirs(canvas_output_dir, exist_ok=True)
    local_path = os.path.join(canvas_output_dir, filename)
    full_url = f"http://{comfy_address}{comfy_url_path}"
    try:
        with urllib.request.urlopen(full_url) as response, open(local_path, 'wb') as out_file:
            shutil.copyfileobj(response, out_file)
        return build_output_url(canvas, filename, username)
    except Exception as e:
        print(f"下载图片失败: {e}")
        if comfy_url_path.startswith("/view"):
            return comfy_url_path.replace("/view", "/api/view", 1)
        return full_url

def save_to_history(record):
    with HISTORY_LOCK:
        history = []
        if os.path.exists(HISTORY_FILE):
            try:
                with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            except: pass
        if "timestamp" not in record:
            record["timestamp"] = time.time()
        history.insert(0, record)
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history[:5000], f, ensure_ascii=False, indent=4)

def get_comfy_history(comfy_address, prompt_id):
    try:
        with urllib.request.urlopen(f"http://{comfy_address}/history/{prompt_id}") as response:
            return json.loads(response.read())
    except Exception as e:
        return {}

def safe_user_id(user_id, request: Request):
    candidate = (user_id or "").strip()
    if not candidate and request.client:
        candidate = f"ip-{request.client.host}"
    if not candidate:
        candidate = "anonymous"
    candidate = re.sub(r"[^a-zA-Z0-9_.-]", "-", candidate)[:80].strip(".-")
    return candidate or "anonymous"

def user_dir(user_id):
    path = os.path.join(CONVERSATION_DIR, user_id)
    os.makedirs(path, exist_ok=True)
    return path

def conversation_path(user_id, conversation_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", conversation_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的对话 ID")
    return os.path.join(user_dir(user_id), f"{cleaned}.json")

def now_ms():
    return int(time.time() * 1000)

def save_conversation(user_id, conversation):
    with CONVERSATION_LOCK:
        path = conversation_path(user_id, conversation["id"])
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(conversation, f, ensure_ascii=False, indent=2)

def new_conversation(user_id, title="新对话"):
    timestamp = now_ms()
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话")[:80],
        "created_at": timestamp,
        "updated_at": timestamp,
        "messages": [],
    }
    save_conversation(user_id, conversation)
    return conversation

def load_conversation(user_id, conversation_id):
    path = conversation_path(user_id, conversation_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="对话不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def list_conversations(user_id):
    records = []
    for filename in os.listdir(user_dir(user_id)):
        if not filename.endswith(".json"):
            continue
        path = os.path.join(user_dir(user_id), filename)
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        messages = data.get("messages", [])
        last_message = next((m for m in reversed(messages) if m.get("role") != "system"), None)
        records.append({
            "id": data.get("id"),
            "title": data.get("title", "新对话"),
            "created_at": data.get("created_at", 0),
            "updated_at": data.get("updated_at", 0),
            "last_message": (last_message or {}).get("content", ""),
        })
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)

def canvas_path(canvas_id):
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", canvas_id or "")
    if not cleaned:
        raise HTTPException(status_code=400, detail="无效的画布 ID")
    return os.path.join(CANVAS_DIR, f"{cleaned}.json")

def save_canvas(canvas):
    canvas["updated_at"] = now_ms()
    with CANVAS_LOCK:
        with open(canvas_path(canvas["id"]), 'w', encoding='utf-8') as f:
            json.dump(canvas, f, ensure_ascii=False, indent=2)

def new_canvas(title="未命名画布", icon="layers", owner=None):
    timestamp = now_ms()
    canvas_id = uuid.uuid4().hex
    folder_name = sanitize_folder_name(title, canvas_id)
    
    # 创建画布专属输出文件夹（含用户目录嵌套）
    user_dirname = get_user_dirname(owner) if owner else ""
    canvas_dir = os.path.join(OUTPUT_DIR, user_dirname, folder_name) if user_dirname else os.path.join(OUTPUT_DIR, folder_name)
    os.makedirs(canvas_dir, exist_ok=True)
    
    canvas = {
        "id": canvas_id,
        "title": (title or "未命名画布")[:80],
        "icon": (icon or "🧩")[:4],
        "owner": owner,
        "output_folder": folder_name,
        "created_at": timestamp,
        "updated_at": timestamp,
        "nodes": [],
        "connections": [],
        "viewport": {"x": 0, "y": 0, "scale": 1},
    }
    save_canvas(canvas)
    return canvas

def load_canvas(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        canvas = json.load(f)
    if canvas.get("deleted_at"):
        raise HTTPException(status_code=404, detail="画布已在回收站")
    return canvas

def load_canvas_any(canvas_id):
    path = canvas_path(canvas_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="画布不存在")
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def canvas_record(data):
    return {
        "id": data.get("id"),
        "title": data.get("title", "未命名画布"),
        "icon": data.get("icon", "🧩"),
        "created_at": data.get("created_at", 0),
        "updated_at": data.get("updated_at", 0),
        "deleted_at": data.get("deleted_at", 0),
        "node_count": len(data.get("nodes", [])),
    }

def cleanup_expired_canvas_trash():
    cutoff = now_ms() - CANVAS_TRASH_RETENTION_MS
    with CANVAS_LOCK:
        for filename in os.listdir(CANVAS_DIR):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(CANVAS_DIR, filename)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                deleted_at = int(data.get("deleted_at") or 0)
                if deleted_at and deleted_at < cutoff:
                    os.remove(path)
            except Exception:
                continue

def iter_canvas_records(include_deleted=False, owner_filter=None):
    cleanup_expired_canvas_trash()
    records = []
    for filename in os.listdir(CANVAS_DIR):
        if not filename.endswith(".json"):
            continue
        try:
            with open(os.path.join(CANVAS_DIR, filename), 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception:
            continue
        is_deleted = bool(data.get("deleted_at"))
        if include_deleted != is_deleted:
            continue
        if owner_filter is not None and data.get("owner") != owner_filter:
            continue
        records.append(canvas_record(data))
    return records

def list_canvases(owner_filter=None):
    records = iter_canvas_records(include_deleted=False, owner_filter=owner_filter)
    return sorted(records, key=lambda item: item["updated_at"], reverse=True)

def list_deleted_canvases(owner_filter=None):
    records = iter_canvas_records(include_deleted=True, owner_filter=owner_filter)
    return sorted(records, key=lambda item: item["deleted_at"], reverse=True)

def display_title(text):
    title = re.sub(r"\s+", " ", text or "").strip()
    return title[:24] or "新对话"

def resolve_chat_provider(provider: str, model: str, ms_model: str):
    if provider == "modelscope":
        if not MODELSCOPE_API_KEY:
            raise HTTPException(status_code=400, detail="未配置 MODELSCOPE_API_KEY，请在 API/.env 中填写。")
        base = MODELSCOPE_CHAT_BASE_URL
        hdrs = {"Authorization": f"Bearer {MODELSCOPE_API_KEY}", "Content-Type": "application/json"}
        mdl = selected_model(ms_model or model, MODELSCOPE_CHAT_MODELS[0] if MODELSCOPE_CHAT_MODELS else "MiniMax/MiniMax-M2.7")
        return base, hdrs, mdl
    base = AI_BASE_URL + "/v1"
    hdrs = api_headers()
    mdl = selected_model(model, CHAT_MODEL)
    return base, hdrs, mdl

def api_headers(json_body=True):
    if not AI_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 COMFLY_API_KEY，请在 API/.env 中填写。")
    headers = {"Accept": "application/json", "Authorization": f"Bearer {AI_API_KEY}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers

def selected_model(requested, fallback):
    model = (requested or fallback).strip()
    if not model:
        raise HTTPException(status_code=400, detail="模型名称不能为空")
    if len(model) > 120 or not re.fullmatch(r"[a-zA-Z0-9_.:/+-]+", model):
        raise HTTPException(status_code=400, detail=f"模型名称不合法：{model}")
    return model

def text_from_chat_response(data):
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "\n".join(part for part in parts if part)
    return str(content)

def text_delta_from_chat_chunk(data):
    choices = data.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "".join(parts)
    return str(content) if content else ""

def sse_event(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"

def extract_image(data):
    if isinstance(data.get("data"), dict) and isinstance(data["data"].get("data"), dict):
        data = data["data"]["data"]
    
    images = data.get("data") or []
    if not images:
        raise HTTPException(status_code=502, detail="生图接口没有返回图片数据")
    first = images[0]
    if first.get("url"):
        return {"type": "url", "value": first["url"]}
    if first.get("b64_json"):
        return {"type": "b64", "value": first["b64_json"]}
    raise HTTPException(status_code=502, detail="无法识别生图接口返回格式")

def extract_image_from_chat(data):
    """从对话接口响应中提取图像（Gemini 模型）"""
    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="对话接口没有返回图像数据")
    
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    
    if isinstance(content, str):
        if content.startswith("data:image"):
            base64_data = content.split(",", 1)[-1] if "," in content else content
            return {"type": "b64", "value": base64_data}
        if content.startswith("http"):
            return {"type": "url", "value": content}
        m = re.search(r'!\[.*?\]\(data:image/[^;]+;base64,([^)]+)\)', content)
        if m:
            return {"type": "b64", "value": m.group(1)}
    
    parts = message.get("parts") or []
    for part in parts:
        if isinstance(part, dict):
            if part.get("inlineData"):
                return {"type": "b64", "value": part["inlineData"]["data"]}
            if part.get("fileData"):
                return {"type": "url", "value": part["fileData"].get("fileUri", "")}
    
    raise HTTPException(status_code=502, detail="无法从对话响应中提取图像")

def extract_task_id(data):
    if data.get("task_id"):
        return str(data["task_id"])
    if data.get("id") and str(data.get("id", "")).startswith("task"):
        return str(data["id"])
    nested = data.get("data")
    if isinstance(nested, dict):
        return extract_task_id(nested)
    return None

async def wait_for_image_task(client, task_id):
    deadline = time.monotonic() + AI_REQUEST_TIMEOUT
    last_payload = {}
    while time.monotonic() < deadline:
        response = await client.get(f"{AI_BASE_URL}/v1/images/tasks/{task_id}", headers=api_headers())
        response.raise_for_status()
        last_payload = response.json()
        task_data = last_payload.get("data") if isinstance(last_payload.get("data"), dict) else last_payload
        status = str(task_data.get("status", "")).upper()
        if status == "SUCCESS":
            return last_payload
        if status == "FAILURE":
            reason = task_data.get("fail_reason") or last_payload.get("message") or "生图任务失败"
            raise HTTPException(status_code=502, detail=f"生图任务失败：{reason}")
        await asyncio.sleep(IMAGE_POLL_INTERVAL)
    raise HTTPException(status_code=504, detail=f"生图任务超时，task_id={task_id}")

def output_file_from_url(url):
    if not url:
        return None
    
    clean_url = url.split("?")[0]
    
    if clean_url.startswith("/output/"):
        relative_path = clean_url[len("/output/"):]
        path = os.path.abspath(os.path.join(OUTPUT_DIR, relative_path))
        output_root = os.path.abspath(OUTPUT_DIR)
        if os.path.commonpath([output_root, path]) == output_root and os.path.exists(path):
            return path
        return None
    
    if clean_url.startswith("/assets/"):
        relative_path = clean_url[len("/assets/"):]
        path = os.path.abspath(os.path.join(INPUT_DIR, relative_path))
        input_root = os.path.abspath(INPUT_DIR)
        if os.path.commonpath([input_root, path]) == input_root and os.path.exists(path):
            return path
        return None
    
    return None

def content_type_for_path(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in [".jpg", ".jpeg"]:
        return "image/jpeg"
    if ext == ".webp":
        return "image/webp"
    return "image/png"

def convert_output_to_jpg(url, quality=88):
    path = output_file_from_url(url)
    if not path:
        return url
    root, ext = os.path.splitext(path)
    if ext.lower() in [".jpg", ".jpeg"]:
        return url
    jpg_path = f"{root}.jpg"
    try:
        with Image.open(path) as img:
            if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
                bg = Image.new("RGB", img.size, (255, 255, 255))
                bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
                img = bg
            else:
                img = img.convert("RGB")
            img.save(jpg_path, "JPEG", quality=quality, optimize=True)
        return f"/output/{os.path.basename(jpg_path)}"
    except Exception as e:
        print(f"转换 JPG 失败: {e}")
        return url

def reference_to_data_url(ref):
    path = output_file_from_url(ref.get("url", ""))
    if not path:
        return ref.get("url", "")
    with open(path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    return f"data:{content_type_for_path(path)};base64,{encoded}"

async def save_ai_image_to_output(image_data, prefix="online_", canvas=None, username=None):
    if canvas:
        canvas_output_dir = get_canvas_output_dir(canvas)
    elif username:
        canvas_output_dir, _ = get_user_output_dir(username)
    else:
        canvas_output_dir = OUTPUT_DIR
    os.makedirs(canvas_output_dir, exist_ok=True)
    
    filename = f"{prefix}{uuid.uuid4().hex[:10]}.png"
    path = os.path.join(canvas_output_dir, filename)
    if image_data["type"] == "b64":
        with open(path, "wb") as f:
            f.write(base64.b64decode(image_data["value"]))
        return build_output_url(canvas, filename, username)
    value = image_data["value"]
    if value.startswith("/output/"):
        return value
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            response = await client.get(value)
            response.raise_for_status()
            content_type = response.headers.get("Content-Type", "")
            if "jpeg" in content_type or "jpg" in content_type:
                filename = filename[:-4] + ".jpg"
                path = os.path.join(canvas_output_dir, filename)
            elif "webp" in content_type:
                filename = filename[:-4] + ".webp"
                path = os.path.join(canvas_output_dir, filename)
            with open(path, "wb") as f:
                f.write(response.content)
            return build_output_url(canvas, filename, username)
    except Exception as e:
        print(f"保存上游图片失败: {e}")
        return value

async def generate_ai_image(prompt, size, quality, model, reference_images=None, protocol="openai"):
    refs = [ref for ref in (reference_images or []) if ref.get("url")]
    
    quality_map = {
        "auto": "medium",
        "low": "low",
        "medium": "medium",
        "high": "high",
        "standard": "low",
        "hd": "high"
    }
    
    is_gemini_model = protocol == "gemini"
    
    async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
        if is_gemini_model:
            system_prompt = f"Generate an image with the following requirements. Size: {size}, Quality: {quality_map.get(quality, 'medium')}."
            if refs:
                gemini_content = [{"type": "text", "text": prompt}]
                for ref in refs[:4]:
                    data_url = reference_to_data_url(ref)
                    if data_url.startswith("data:"):
                        gemini_content.append({"type": "image_url", "image_url": {"url": data_url}})
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": gemini_content}
                ]
            else:
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
            response = await client.post(
                f"{AI_BASE_URL}/v1/chat/completions",
                headers=api_headers(),
                json={
                    "model": model,
                    "messages": messages,
                },
            )
        elif refs:
            files = []
            opened = []
            try:
                for ref in refs[:4]:
                    path = output_file_from_url(ref.get("url", ""))
                    if not path:
                        continue
                    fh = open(path, "rb")
                    opened.append(fh)
                    files.append(("image", (os.path.basename(path), fh, content_type_for_path(path))))
                data = {
                    "model": model,
                    "prompt": prompt,
                    "size": size,
                    "quality": quality_map.get(quality, "medium"),
                    "output_format": "png",
                    "n": "1"
                }
                response = await client.post(f"{AI_BASE_URL}/v1/images/edits", headers=api_headers(json_body=False), data=data, files=files)
            finally:
                for fh in opened:
                    fh.close()
        else:
            response = await client.post(
                f"{AI_BASE_URL}/v1/images/generations",
                headers=api_headers(),
                json={
                    "model": model,
                    "prompt": prompt,
                    "size": size,
                    "quality": quality_map.get(quality, "medium"),
                    "output_format": "png",
                    "n": 1
                },
            )
        response.raise_for_status()
        try:
            raw = response.json()
        except Exception:
            raise HTTPException(status_code=502, detail=f"API 服务器返回无效响应: {response.text[:200]}")
        
        try:
            if is_gemini_model:
                return extract_image_from_chat(raw), raw
            return extract_image(raw), raw
        except HTTPException:
            task_id = extract_task_id(raw)
            if not task_id:
                raise
        task_result = await wait_for_image_task(client, task_id)
        return extract_image(task_result), task_result

def upstream_message_from_record(item):
    role = item.get("role")
    if role not in {"user", "assistant"} or item.get("type") == "image":
        return None
    refs = item.get("attachments") or []
    if refs and role == "user":
        content = [{"type": "text", "text": item.get("content", "")}]
        for ref in refs[:4]:
            url = reference_to_data_url(ref)
            if url:
                content.append({"type": "image_url", "image_url": {"url": url}})
        return {"role": role, "content": content}
    return {"role": role, "content": item.get("content", "")}

# --- 路由接口 ---

# --- 认证路由 ---

@app.post("/api/auth/register")
async def auth_register(payload: AuthRegisterRequest):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    users = load_users()
    if username in users:
        raise HTTPException(status_code=400, detail="该用户名已存在，请直接登录")
    is_admin = (username == SUPER_ADMIN_USERNAME)
    token = str(uuid.uuid4())
    users[username] = {
        "password": hash_password(payload.password),
        "is_admin": is_admin,
        "token": token,
        "created_at": time.time(),
    }
    save_users(users)
    return {"ok": True, "username": username, "is_admin": is_admin, "token": token}

@app.post("/api/auth/login")
async def auth_login(payload: AuthLoginRequest):
    username = payload.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="用户名不能为空")
    users = load_users()
    user = users.get(username)
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在，请先注册")
    if user["password"] != hash_password(payload.password):
        raise HTTPException(status_code=400, detail="密码错误")
    token = str(uuid.uuid4())
    users[username]["token"] = token
    save_users(users)
    return {"ok": True, "username": username, "is_admin": user["is_admin"], "token": token}

@app.get("/api/auth/me")
async def auth_me(token: str = ""):
    if not token:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    username, user = find_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="令牌无效或已过期")
    return {"ok": True, "username": username, "is_admin": user["is_admin"]}

@app.post("/api/auth/logout")
async def auth_logout(payload: Optional[TokenRequest] = None):
    token = payload.token if payload else ""
    if not token:
        return {"ok": True}
    username, user = find_user_by_token(token)
    if user:
        users = load_users()
        if username in users:
            users[username]["token"] = ""
            save_users(users)
    return {"ok": True}

# ---

@app.get("/api/auth/admin/users")
async def admin_list_users(token: str = ""):
    if not token:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    username, user = find_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="令牌无效")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    users = load_users()
    usernames = sorted(users.keys(), key=lambda x: (x != "admin", x))
    return {"users": [{"username": u, "is_admin": users[u].get("is_admin", False)} for u in usernames]}

@app.post("/api/auth/admin/reset-password")
async def admin_reset_password(payload: AdminResetPasswordRequest):
    if not payload.token:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    username, user = find_user_by_token(payload.token)
    if not user:
        raise HTTPException(status_code=401, detail="令牌无效")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    users = load_users()
    if payload.username not in users:
        raise HTTPException(status_code=404, detail="用户不存在")
    users[payload.username]["password"] = hash_password(payload.new_password)
    save_users(users)
    return {"ok": True}

@app.post("/api/auth/admin/delete-user")
async def admin_delete_user(payload: AdminDeleteUserRequest):
    if not payload.token:
        raise HTTPException(status_code=401, detail="未提供认证令牌")
    username, user = find_user_by_token(payload.token)
    if not user:
        raise HTTPException(status_code=401, detail="令牌无效")
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="仅管理员可操作")
    users = load_users()
    if payload.username not in users:
        raise HTTPException(status_code=404, detail="用户不存在")
    if payload.username == SUPER_ADMIN_USERNAME:
        raise HTTPException(status_code=400, detail="不能删除管理员账号")
    del users[payload.username]
    save_users(users)
    return {"ok": True}

@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/api/view")
def view_image(filename: str, type: str = "input", subfolder: str = ""):
    for addr in COMFYUI_INSTANCES:
        try:
            url = f"http://{addr}/view"
            params = {"filename": filename, "type": type, "subfolder": subfolder}
            r = requests.get(url, params=params, timeout=1)
            if r.status_code == 200:
                return Response(content=r.content, media_type=r.headers.get('Content-Type'))
        except Exception:
            continue
    raise HTTPException(status_code=404, detail="Image not found on any available backend")

@app.get("/api/download-output")
def download_output(url: str, name: str = ""):
    path = output_file_from_url(url)
    if not path:
        raise HTTPException(status_code=404, detail="文件不存在")
    filename = os.path.basename(name) if name else os.path.basename(path)
    return FileResponse(path, media_type=content_type_for_path(path), filename=filename)

@app.post("/api/upload")
async def upload_image(files: List[UploadFile] = File(...)):
    uploaded_files = []
    files_content = []
    for file in files:
        content = await file.read()
        files_content.append((file, content))

    for file, content in files_content:
        success_count = 0
        last_result = None
        for addr in COMFYUI_INSTANCES:
            try:
                files_data = {'image': (file.filename, content, file.content_type)}
                response = requests.post(f"http://{addr}/upload/image", files=files_data, timeout=5)
                if response.status_code == 200:
                    last_result = response.json()
                    success_count += 1
            except Exception as e:
                print(f"Upload error for {addr}: {e}")

        if success_count > 0 and last_result:
            uploaded_files.append({"comfy_name": last_result.get("name", file.filename)})
        else:
            raise HTTPException(status_code=500, detail="Failed to upload to any backend")

    return {"files": uploaded_files}

@app.post("/api/ai/upload")
async def upload_ai_reference(files: List[UploadFile] = File(...), canvas_id: str = Form(None), token: str = Form("")):
    username = get_username_by_token(token)
    canvas = None
    if canvas_id:
        try:
            canvas = load_canvas(canvas_id)
        except:
            pass
    
    if canvas:
        canvas_output_dir = get_canvas_output_dir(canvas)
    elif username:
        canvas_output_dir, _ = get_user_output_dir(username)
    else:
        canvas_output_dir = OUTPUT_DIR
    os.makedirs(canvas_output_dir, exist_ok=True)
    
    uploaded = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        ext = os.path.splitext(file.filename or "")[1].lower()
        if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
            content_type = (file.content_type or "").lower()
            ext = ".jpg" if "jpeg" in content_type else ".webp" if "webp" in content_type else ".png"
        filename = f"ai_ref_{uuid.uuid4().hex[:12]}{ext}"
        path = os.path.join(canvas_output_dir, filename)
        with open(path, "wb") as f:
            f.write(content)
        url_path = build_output_url(canvas, filename, username)
        uploaded.append({"url": url_path, "name": file.filename or filename})
    return {"files": uploaded}

@app.get("/api/config")
async def ai_config():
    preferred_chat_model = next((m for m in CHAT_MODELS if m == "gpt-5.5"), CHAT_MODELS[0] if CHAT_MODELS else CHAT_MODEL)
    return {
        "base_url": AI_BASE_URL,
        "chat_model": preferred_chat_model,
        "image_model": IMAGE_MODEL,
        "chat_models": CHAT_MODELS,
        "image_models": IMAGE_MODELS,
        "has_api_key": bool(AI_API_KEY),
        "ms_chat_models": MODELSCOPE_CHAT_MODELS,
        "has_ms_key": bool(MODELSCOPE_API_KEY),
    }

@app.get("/api/models")
async def ai_models():
    return {"chat_models": CHAT_MODELS, "image_models": IMAGE_MODELS}

# --- ModelScope Token (从 env 读取，不再支持通过 UI 修改) ---

@app.get("/api/config/token")
async def get_global_token():
    # 优先读 env，回退到 global_config.json（兼容旧数据）
    if MODELSCOPE_API_KEY:
        return {"token": MODELSCOPE_API_KEY}
    if os.path.exists(GLOBAL_CONFIG_FILE):
        try:
            with open(GLOBAL_CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                return {"token": config.get("modelscope_token", "")}
        except:
            pass
    return {"token": ""}

@app.post("/api/config/update")
async def update_config(payload: ConfigUpdateRequest):
    """接收前端配置更新，同步到后端内存并写入 .env 文件"""
    global AI_API_KEY, MODELSCOPE_API_KEY, AI_BASE_URL
    
    env_updates = {}
    
    if payload.comfly_api_key:
        AI_API_KEY = payload.comfly_api_key
        env_updates["COMFLY_API_KEY"] = payload.comfly_api_key
    
    if payload.modelscope_api_key:
        MODELSCOPE_API_KEY = payload.modelscope_api_key
        env_updates["MODELSCOPE_API_KEY"] = payload.modelscope_api_key
    
    if payload.comfly_base_url:
        AI_BASE_URL = payload.comfly_base_url.rstrip("/")
        env_updates["COMFLY_BASE_URL"] = payload.comfly_base_url.rstrip("/")
    
    if env_updates:
        save_env_file(env_updates)
        print(f"已更新 .env 配置: {', '.join(env_updates.keys())}")
    
    return {"status": "ok"}

# --- 在线生图 (COMFLY) ---

@app.post("/api/online-image")
async def online_image(payload: OnlineImageRequest, token: str = ""):
    username = get_username_by_token(token)
    model = selected_model(payload.model, IMAGE_MODEL)
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    try:
        image_data, raw = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, refs, payload.protocol)
        local_url = await save_ai_image_to_output(image_data, prefix="online_", username=username)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc

    result = {
        "prompt": payload.prompt,
        "images": [local_url],
        "timestamp": time.time(),
        "type": "online",
        "user": username,
        "model": model,
        "params": {"model": model, "size": payload.size, "quality": payload.quality, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }
    save_to_history(result)
    if GLOBAL_LOOP:
        asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
    return result

async def build_online_image_result(payload: OnlineImageRequest):
    provider_id = payload.provider_id or "comfly"
    provider = get_api_provider(provider_id)
    if provider:
        default_model = (provider.get("image_models") or [IMAGE_MODEL])[0]
        model = selected_model(payload.model, default_model)
    else:
        model = selected_model(payload.model, IMAGE_MODEL)
    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    try:
        image_data, raw = await generate_ai_image(payload.prompt, payload.size, payload.quality, model, refs, payload.protocol)
        local_url = await save_ai_image_to_output(image_data, prefix="online_")
    except httpx.HTTPStatusError as exc:
        text = exc.response.text or ''
        friendly = None
        m = re.search(r"longest edge must be less than or equal to (\d+)", text)
        if m:
            limit = m.group(1)
            friendly = f"该模型不支持当前分辨率：最长边超过 {limit}px。请把图片分辨率调低（例如换到 2K 或更小），或更换支持高分辨率的模型。"
        elif "Invalid size" in text or "invalid_value" in text:
            friendly = f"该模型不支持当前尺寸：{payload.size}。请尝试更换分辨率或模型。"
        elif "rate limit" in text.lower() or "429" in text:
            friendly = "请求过于频繁，已被上游限流，请稍后再试。"
        elif "Unauthorized" in text or "401" in text:
            friendly = "API Key 无效或已过期，请到「API 设置」检查 Key。"
        raise HTTPException(status_code=exc.response.status_code, detail=friendly or text) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        raise HTTPException(status_code=getattr(exc, "status_code", 500), detail=str(detail)) from exc
    return {
        "prompt": payload.prompt,
        "images": [local_url],
        "timestamp": time.time(),
        "type": "online",
        "model": model,
        "params": {"model": model, "size": payload.size, "quality": payload.quality, "reference_images": refs},
        "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
    }

async def run_canvas_image_task(task_id: str, payload: OnlineImageRequest):
    with CANVAS_TASK_LOCK:
        if task_id in CANVAS_TASKS:
            CANVAS_TASKS[task_id]["status"] = "running"
            CANVAS_TASKS[task_id]["updated_at"] = time.time()
    try:
        result = await build_online_image_result(payload)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "succeeded",
                "result": result,
                "error": "",
                "updated_at": time.time(),
            })
    except Exception as exc:
        detail = getattr(exc, "detail", None) or str(exc)
        status_code = getattr(exc, "status_code", 500)
        with CANVAS_TASK_LOCK:
            CANVAS_TASKS[task_id].update({
                "status": "failed",
                "error": str(detail),
                "status_code": status_code,
                "updated_at": time.time(),
            })

@app.post("/api/canvas-image-tasks")
async def create_canvas_image_task(payload: OnlineImageRequest):
    task_id = f"canvas_img_{uuid.uuid4().hex}"
    with CANVAS_TASK_LOCK:
        CANVAS_TASKS[task_id] = {
            "id": task_id,
            "type": "online-image",
            "status": "queued",
            "created_at": time.time(),
            "updated_at": time.time(),
            "result": None,
            "error": "",
        }
    asyncio.create_task(run_canvas_image_task(task_id, payload))
    return {"task_id": task_id, "status": "queued"}

@app.get("/api/canvas-image-tasks/{task_id}")
async def get_canvas_image_task(task_id: str):
    with CANVAS_TASK_LOCK:
        task = dict(CANVAS_TASKS.get(task_id) or {})
    if not task:
        raise HTTPException(status_code=404, detail="画布任务不存在，可能服务已重启或任务已过期")
    return task

# --- Canvas LLM ---

@app.post("/api/canvas-llm")
async def canvas_llm(payload: CanvasLLMRequest):
    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    upstream_messages = [{"role": "system", "content": payload.system_prompt or SYSTEM_PROMPT}]
    for item in payload.messages[-MAX_HISTORY_MESSAGES:]:
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and content:
            upstream_messages.append({"role": role, "content": content})
    upstream_messages.append({"role": "user", "content": payload.message})
    try:
        async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
            response = await client.post(
                f"{chat_base}/chat/completions",
                headers=chat_hdrs,
                json={"model": model, "messages": upstream_messages},
            )
            response.raise_for_status()
            if not response.content:
                raise HTTPException(status_code=502, detail="上游接口返回了空响应")
            raw = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{exc.response.text}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
    text = text_from_chat_response(raw).strip() or "接口返回了空回复。"
    return {"text": text, "model": model, "raw_usage": raw.get("usage") if isinstance(raw, dict) else None}

# --- 对话管理 ---

@app.get("/api/conversations")
async def conversations(request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"user_id": user_id, "conversations": list_conversations(user_id)}

@app.post("/api/conversations")
async def create_conversation(payload: ConversationCreateRequest, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": new_conversation(user_id, payload.title)}

@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    return {"conversation": load_conversation(user_id, conversation_id)}

@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, request: Request, x_user_id: str = Header(default="")):
    user_id = safe_user_id(x_user_id, request)
    path = conversation_path(user_id, conversation_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

# --- 画布管理 ---

@app.get("/api/canvases")
async def canvases(token: str = ""):
    username, user = find_user_by_token(token)
    is_admin = bool(user and user.get("is_admin", False)) if user else False
    if not is_admin and not username:
        return {"canvases": []}
    owner_filter = None if is_admin else username
    return {"canvases": list_canvases(owner_filter=owner_filter)}

@app.get("/api/canvases/trash")
async def trashed_canvases(token: str = ""):
    username, user = find_user_by_token(token)
    is_admin = bool(user and user.get("is_admin", False)) if user else False
    if not is_admin and not username:
        return {"canvases": [], "retention_days": 30}
    owner_filter = None if is_admin else username
    return {"canvases": list_deleted_canvases(owner_filter=owner_filter), "retention_days": 30}

@app.post("/api/canvases")
async def create_canvas(payload: CanvasCreateRequest, token: str = ""):
    username = get_username_by_token(token)
    return {"canvas": new_canvas(payload.title, payload.icon, owner=username)}

@app.get("/api/canvases/{canvas_id}")
async def get_canvas(canvas_id: str, token: str = ""):
    canvas = load_canvas(canvas_id)
    validate_canvas_owner(canvas, token)
    return {"canvas": canvas}

@app.put("/api/canvases/{canvas_id}")
async def update_canvas(canvas_id: str, payload: CanvasSaveRequest, token: str = ""):
    canvas = load_canvas(canvas_id)
    validate_canvas_owner(canvas, token)
    canvas["title"] = (payload.title or canvas.get("title") or "未命名画布")[:80]
    canvas["icon"] = (payload.icon or canvas.get("icon") or "layers")[:32]
    canvas["nodes"] = payload.nodes
    canvas["connections"] = payload.connections
    canvas["viewport"] = payload.viewport
    save_canvas(canvas)
    return {"canvas": canvas}

@app.delete("/api/canvases/{canvas_id}")
async def delete_canvas(canvas_id: str, token: str = ""):
    canvas = load_canvas_any(canvas_id)
    validate_canvas_owner(canvas, token)
    if not canvas.get("deleted_at"):
        canvas["deleted_at"] = now_ms()
        save_canvas(canvas)
    return {"ok": True}

@app.post("/api/canvases/{canvas_id}/restore")
async def restore_canvas(canvas_id: str, token: str = ""):
    canvas = load_canvas_any(canvas_id)
    validate_canvas_owner(canvas, token)
    if canvas.get("deleted_at"):
        canvas.pop("deleted_at", None)
        save_canvas(canvas)
    return {"canvas": canvas}

@app.delete("/api/canvases/{canvas_id}/purge")
async def purge_canvas(canvas_id: str, token: str = ""):
    canvas = load_canvas_any(canvas_id)
    validate_canvas_owner(canvas, token)
    path = canvas_path(canvas_id)
    if os.path.exists(path):
        os.remove(path)
    return {"ok": True}

@app.get("/api/canvases/{canvas_id}/files")
async def list_canvas_files(canvas_id: str):
    canvas = load_canvas(canvas_id)
    canvas_output_dir = get_canvas_output_dir(canvas)
    if not os.path.exists(canvas_output_dir):
        return {"files": []}
    
    files = []
    try:
        for filename in sorted(os.listdir(canvas_output_dir), key=lambda f: os.path.getmtime(os.path.join(canvas_output_dir, f)), reverse=True):
            filepath = os.path.join(canvas_output_dir, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    "name": filename,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "url": f"/output/{canvas['output_folder']}/{filename}"
                })
    except Exception as e:
        print(f"读取画布文件列表失败: {e}")
        return {"files": [], "error": str(e)}
    return {"files": files}

# --- 资产库 API ---

@app.post("/api/canvases/{canvas_id}/asset-folder")
async def create_asset_folder(canvas_id: str):
    """创建或确认画布资产文件夹存在"""
    canvas = load_canvas(canvas_id)
    asset_dir = get_canvas_asset_dir(canvas)
    os.makedirs(asset_dir, exist_ok=True)
    folder_name = canvas.get("output_folder", "")
    owner = get_user_dirname(canvas.get("owner")) if canvas.get("owner") else ""
    path = f"/assets/{owner}/{folder_name}" if owner and folder_name else (f"/assets/{folder_name}" if folder_name else "/assets")
    return {"folder": folder_name, "path": path}

@app.get("/api/canvases/{canvas_id}/assets")
async def list_assets(canvas_id: str):
    """获取画布资产文件列表（含用户级资产，互通在线生图保存的文件）"""
    canvas = load_canvas(canvas_id)
    asset_dir = get_canvas_asset_dir(canvas)
    
    seen = set()
    files = []
    
    def collect_from(dir_path, url_builder):
        if not os.path.exists(dir_path):
            return
        for filename in sorted(os.listdir(dir_path), key=lambda f: os.path.getmtime(os.path.join(dir_path, f)), reverse=True):
            filepath = os.path.join(dir_path, filename)
            if os.path.isfile(filepath) and filename not in seen:
                seen.add(filename)
                stat = os.stat(filepath)
                ext = os.path.splitext(filename)[1].lower()
                files.append({
                    "name": filename,
                    "size": stat.st_size,
                    "modified": stat.st_mtime,
                    "url": url_builder(filename),
                    "type": "image" if ext in [".png", ".jpg", ".jpeg", ".webp", ".gif"] else "video" if ext in [".mp4", ".webm", ".mov", ".avi", ".mkv"] else "audio" if ext in [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"] else "text" if ext == ".txt" else "other"
                })
    
    try:
        # 1. 画布专属资产文件夹
        collect_from(asset_dir, lambda fn: build_asset_url(canvas, fn))
        
        # 2. 用户级资产文件夹（在线生图等保存的资产），使其互通
        owner = canvas.get("owner", "")
        if owner:
            user_dirname = get_user_dirname(owner)
            user_asset_dir = os.path.join(INPUT_DIR, user_dirname)
            collect_from(user_asset_dir, lambda fn: f"/assets/{user_dirname}/{fn}")
        
        # 按修改时间倒序
        files.sort(key=lambda f: f["modified"], reverse=True)
    except Exception as e:
        print(f"读取资产文件列表失败: {e}")
        return {"files": [], "error": str(e)}
    return {"files": files}

@app.post("/api/canvases/{canvas_id}/assets/upload")
async def upload_assets(canvas_id: str, files: List[UploadFile] = File(...)):
    """上传图片到画布资产文件夹"""
    canvas = load_canvas(canvas_id)
    asset_dir = get_canvas_asset_dir(canvas)
    os.makedirs(asset_dir, exist_ok=True)
    
    uploaded = []
    for file in files:
        content = await file.read()
        if not content:
            continue
        ext = os.path.splitext(file.filename or "")[1].lower()
        allowed_exts = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".txt", ".mp4", ".webm", ".mov", ".avi", ".mkv", ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"]
        if ext not in allowed_exts:
            ext = ".bin"
        filename = f"asset_{uuid.uuid4().hex[:12]}{ext}"
        path = os.path.join(asset_dir, filename)
        with open(path, "wb") as f:
            f.write(content)
        url_path = build_asset_url(canvas, filename)
        uploaded.append({"url": url_path, "name": file.filename or filename})
    return {"files": uploaded}

@app.post("/api/canvases/{canvas_id}/assets/copy-from-canvas")
async def copy_asset_from_canvas(canvas_id: str, payload: dict = None):
    """从画布的 Output 节点复制图片到资产文件夹"""
    canvas = load_canvas(canvas_id)
    asset_dir = get_canvas_asset_dir(canvas)
    os.makedirs(asset_dir, exist_ok=True)
    
    urls = (payload or {}).get("urls", [])
    copied = []
    for url in urls:
        if not url or not url.startswith("/output/"):
            continue
        clean_url = url.split("?")[0]
        relative = clean_url[len("/output/"):]
        source_path = os.path.join(OUTPUT_DIR, relative)
        if not os.path.exists(source_path):
            continue
        ext = os.path.splitext(relative)[1].lower() or ".png"
        filename = f"asset_{uuid.uuid4().hex[:12]}{ext}"
        dest_path = os.path.join(asset_dir, filename)
        try:
            import shutil
            shutil.copy2(source_path, dest_path)
            url_path = build_asset_url(canvas, filename)
            copied.append({"url": url_path, "name": filename, "original": url})
        except Exception as e:
            print(f"复制资产失败: {e}")
    return {"files": copied}

@app.post("/api/canvases/{canvas_id}/assets/delete")
async def delete_asset(canvas_id: str, payload: dict = None):
    """删除资产文件夹中的指定文件"""
    canvas = load_canvas(canvas_id)
    asset_dir = get_canvas_asset_dir(canvas)
    filename = (payload or {}).get("filename", "")
    if not filename:
        raise HTTPException(status_code=400, detail="缺少文件名")
    safe_name = os.path.basename(filename.replace("\\", "/"))
    filepath = os.path.join(asset_dir, safe_name)
    if not filepath.startswith(os.path.abspath(asset_dir)):
        raise HTTPException(status_code=400, detail="无效的文件名")
    if os.path.exists(filepath) and os.path.isfile(filepath):
        os.remove(filepath)
        return {"ok": True}
    raise HTTPException(status_code=404, detail="文件不存在")

class UserAssetSaveRequest(BaseModel):
    url: str = ""
    name: str = ""

@app.post("/api/user/assets/save-from-url")
async def save_user_asset_from_url(payload: UserAssetSaveRequest, token: str = "", request: Request = None):
    """保存在线图片到用户级别的资产文件夹 input/{username}/"""
    username = get_username_by_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="请先登录")
    
    asset_dir, dirname = get_user_input_dir(username)
    os.makedirs(asset_dir, exist_ok=True)
    
    download_url = payload.url
    if download_url.startswith("/"):
        base = str(request.base_url).rstrip("/")
        download_url = base + download_url
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(download_url)
            response.raise_for_status()
            content = response.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"下载图片失败: {str(e)}")
    
    ext = ".png"
    content_type = ""
    for key, val in response.headers.items():
        if key.lower() == "content-type":
            content_type = val
            break
    if "jpeg" in content_type or "jpg" in content_type:
        ext = ".jpg"
    elif "webp" in content_type:
        ext = ".webp"
    elif "gif" in content_type:
        ext = ".gif"
    
    filename = f"asset_{uuid.uuid4().hex[:12]}{ext}"
    filepath = os.path.join(asset_dir, filename)
    with open(filepath, "wb") as f:
        f.write(content)
    
    url_path = f"/assets/{dirname}/{filename}"
    return {"url": url_path, "name": payload.name or filename}

@app.get("/api/user/assets")
async def list_user_assets(token: str = ""):
    """列出用户级资产文件夹 input/{username}/ 中的图片文件（包括画布资产子目录中的图片）"""
    username = get_username_by_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="请先登录")
    
    asset_dir, dirname = get_user_input_dir(username)
    if not os.path.exists(asset_dir):
        return {"files": []}
    
    image_exts = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    files = []
    try:
        for filename in sorted(os.listdir(asset_dir), key=lambda f: os.path.getmtime(os.path.join(asset_dir, f)), reverse=True):
            filepath = os.path.join(asset_dir, filename)
            if os.path.isfile(filepath):
                ext = os.path.splitext(filename)[1].lower()
                if ext in image_exts:
                    stat = os.stat(filepath)
                    files.append({
                        "name": filename,
                        "size": stat.st_size,
                        "modified": stat.st_mtime,
                        "url": f"/assets/{dirname}/{filename}",
                        "type": "image"
                    })
        # 同时扫描画布资产子目录 input/{username}/{canvas_folder}/
        for item in sorted(os.listdir(asset_dir), reverse=True):
            subdir = os.path.join(asset_dir, item)
            if not os.path.isdir(subdir):
                continue
            for filename in sorted(os.listdir(subdir), key=lambda f: os.path.getmtime(os.path.join(subdir, f)), reverse=True):
                filepath = os.path.join(subdir, filename)
                if os.path.isfile(filepath):
                    ext = os.path.splitext(filename)[1].lower()
                    if ext in image_exts:
                        stat = os.stat(filepath)
                        files.append({
                            "name": filename,
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "url": f"/assets/{dirname}/{item}/{filename}",
                            "type": "image"
                        })
    except Exception as e:
        print(f"读取用户资产列表失败: {e}")
        return {"files": [], "error": str(e)}
    return {"files": files}

# --- Output 下载 ---

from fastapi.responses import StreamingResponse
import zipfile
import io

class DownloadZipRequest(BaseModel):
    urls: List[str]
    filename: str = "output.zip"

@app.post("/api/download-output-zip")
async def download_output_zip(payload: DownloadZipRequest):
    """下载 Output 节点图片为 ZIP"""
    if not payload.urls:
        raise HTTPException(status_code=400, detail="没有可下载的图片")
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        for i, url in enumerate(payload.urls):
            try:
                # 处理本地路径
                if url.startswith('/assets/') or url.startswith('/output/'):
                    local_path = url.lstrip('/')
                    if os.path.isfile(local_path):
                        zf.write(local_path, f"image_{i+1}_{os.path.basename(local_path)}")
                        continue
                
                # 处理远程 URL
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=10.0)
                    if resp.status_code == 200:
                        ext = url.split('.')[-1].split('?')[0] or 'png'
                        zf.writestr(f"image_{i+1}.{ext}", resp.content)
            except Exception as e:
                print(f"Download failed for {url}: {e}")
                continue
    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={payload.filename}"}
    )

# --- GPT 对话 ---

@app.post("/api/chat")
async def chat(payload: ChatRequest, request: Request, x_user_id: str = Header(default=""), token: str = ""):
    username = get_username_by_token(token)
    user_id = safe_user_id(x_user_id, request)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)

    if payload.mode == "image":
        model = selected_model(payload.image_model or payload.model, IMAGE_MODEL)
        try:
            image_data, raw = await generate_ai_image(payload.message, payload.size, payload.quality, model, refs)
            local_url = await save_ai_image_to_output(image_data, prefix="chat_", username=username)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游生图接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游生图接口失败：{exc}") from exc
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "type": "image",
            "content": payload.message,
            "image_url": local_url,
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
        }
    else:
        chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
        history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
        upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for item in history:
            msg = upstream_message_from_record(item)
            if msg:
                upstream_messages.append(msg)
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                response = await client.post(
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json={"model": model, "messages": upstream_messages},
                )
                response.raise_for_status()
                raw = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=f"上游接口错误：{exc.response.text}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"请求上游接口失败：{exc}") from exc
        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": text_from_chat_response(raw).strip() or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw.get("usage") if isinstance(raw, dict) else None,
        }

    conversation["messages"].append(assistant_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)
    return {"conversation": conversation, "message": assistant_message}

@app.post("/api/chat/stream")
async def chat_stream(payload: ChatRequest, request: Request, x_user_id: str = Header(default="")):
    if payload.mode == "image":
        raise HTTPException(status_code=400, detail="图片模式请使用 /api/chat")

    user_id = safe_user_id(x_user_id, request)
    conversation = (
        load_conversation(user_id, payload.conversation_id)
        if payload.conversation_id
        else new_conversation(user_id, display_title(payload.message))
    )
    if not conversation.get("messages"):
        conversation["title"] = display_title(payload.message)

    refs = [ref.dict() for ref in payload.reference_images if ref.url]
    user_message = {
        "id": uuid.uuid4().hex,
        "role": "user",
        "content": payload.message,
        "created_at": now_ms(),
        "attachments": refs,
        "mode": payload.mode,
    }
    conversation["messages"].append(user_message)
    conversation["updated_at"] = now_ms()
    save_conversation(user_id, conversation)

    chat_base, chat_hdrs, model = resolve_chat_provider(payload.provider, payload.model, payload.ms_model)
    history = conversation["messages"][-MAX_HISTORY_MESSAGES:]
    upstream_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for item in history:
        msg = upstream_message_from_record(item)
        if msg:
            upstream_messages.append(msg)

    async def stream():
        content_parts = []
        raw_usage = None
        yield sse_event({"type": "meta", "conversation": conversation})
        try:
            async with httpx.AsyncClient(timeout=AI_REQUEST_TIMEOUT) as client:
                async with client.stream(
                    "POST",
                    f"{chat_base}/chat/completions",
                    headers=chat_hdrs,
                    json={"model": model, "messages": upstream_messages, "stream": True},
                ) as response:
                    if response.status_code >= 400:
                        detail = await response.aread()
                        yield sse_event({"type": "error", "detail": f"上游接口错误：{detail.decode('utf-8', errors='ignore')}"})
                        return
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data:"):
                            line = line[5:].strip()
                        if line == "[DONE]":
                            break
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if isinstance(chunk, dict) and chunk.get("usage"):
                            raw_usage = chunk.get("usage")
                        delta = text_delta_from_chat_chunk(chunk)
                        if delta:
                            content_parts.append(delta)
                            yield sse_event({"type": "delta", "delta": delta})
        except httpx.HTTPError as exc:
            yield sse_event({"type": "error", "detail": f"请求上游接口失败：{exc}"})
            return

        assistant_message = {
            "id": uuid.uuid4().hex,
            "role": "assistant",
            "content": "".join(content_parts).strip() or "接口返回了空回复。",
            "created_at": now_ms(),
            "model": model,
            "raw_usage": raw_usage,
        }
        conversation["messages"].append(assistant_message)
        conversation["updated_at"] = now_ms()
        save_conversation(user_id, conversation)
        yield sse_event({"type": "done", "conversation": conversation, "message": assistant_message})

    return StreamingResponse(stream(), media_type="text/event-stream")

# --- 历史记录 ---

class SaveHistoryRequest(BaseModel):
    prompt: str = ""
    images: List[str] = []
    text: Optional[str] = None
    text_url: Optional[str] = None
    seed: Optional[int] = None
    prompt_id: Optional[str] = None
    type: str = "zimage"
    params: Optional[Dict[str, Any]] = None
    timestamp: Optional[float] = None

@app.post("/api/history/save")
async def save_history(req: SaveHistoryRequest, token: str = ""):
    username = get_username_by_token(token)
    record = {
        "prompt": req.prompt,
        "images": req.images,
        "type": req.type,
        "timestamp": req.timestamp or time.time(),
        "user": username
    }
    if req.text:
        record["text"] = req.text
    if req.text_url:
        record["text_url"] = req.text_url
    if req.seed is not None:
        record["seed"] = req.seed
    if req.prompt_id:
        record["prompt_id"] = req.prompt_id
    if req.params:
        record["params"] = req.params
    
    # 下载直连模式的 ComfyUI 图片到用户目录
    if username:
        user_dir, user_dirname = get_user_output_dir(username)
        new_images = []
        for img_url in (req.images or []):
            if img_url.startswith("/output/") or img_url.startswith("/assets/"):
                new_images.append(img_url)
            elif img_url.startswith("http://127.0.0.1:8188/view"):
                # 直连模式图片：从 ComfyUI 下载到用户目录
                try:
                    import urllib.request, shutil
                    filename = f"{req.type}_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
                    local_path = os.path.join(user_dir, filename)
                    with urllib.request.urlopen(img_url, timeout=30) as resp, open(local_path, 'wb') as out:
                        shutil.copyfileobj(resp, out)
                    new_images.append(f"/output/{user_dirname}/{filename}")
                except Exception as e:
                    print(f"下载直连图片到用户目录失败: {e}")
                    new_images.append(img_url)
            else:
                new_images.append(img_url)
        record["images"] = new_images
    
    save_to_history(record)
    return {"success": True, "timestamp": record["timestamp"]}

@app.get("/api/history")
async def get_history_api(type: str = None, token: str = ""):
    username = get_username_by_token(token)
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if type:
                    data = [item for item in data if item.get("type", "zimage") == type]
                # 按用户过滤
                if username:
                    data = [item for item in data if item.get("user") == username]
                # Support both image and text outputs: keep records with images OR text
                data = [item for item in data if item.get("images") or item.get("text")]

                def sort_key(item):
                    ts = item.get("timestamp", 0)
                    if isinstance(ts, (int, float)):
                        return float(ts)
                    return 0

                data.sort(key=sort_key, reverse=True)
                return data
        except Exception as e:
            print(f"读取历史文件失败: {e}")
            return []
    return []

@app.get("/api/queue_status")
async def get_queue_status(client_id: str):
    with QUEUE_LOCK:
        total = len(QUEUE)
        positions = [i + 1 for i, t in enumerate(QUEUE) if t["client_id"] == client_id]
        position = positions[0] if positions else 0
    return {"total": total, "position": position}

@app.post("/api/history/delete")
async def delete_history(req: DeleteHistoryRequest, token: str = ""):
    username = get_username_by_token(token)
    is_admin = is_admin_by_token(token)
    if not os.path.exists(HISTORY_FILE):
        return {"success": False, "message": "History file not found"}
    try:
        with HISTORY_LOCK:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
            target_record = None
            new_history = []
            for item in history:
                is_match = False
                item_ts = item.get("timestamp", 0)
                if isinstance(req.timestamp, (int, float)) and isinstance(item_ts, (int, float)):
                    if abs(float(item_ts) - float(req.timestamp)) < 0.001:
                        is_match = True
                elif str(item_ts) == str(req.timestamp):
                    is_match = True
                if is_match:
                    target_record = item
                else:
                    new_history.append(item)
            if target_record:
                # 检查权限：只能删除自己的记录，或管理员可删任意
                if username and not is_admin and target_record.get("user") and target_record.get("user") != username:
                    return {"success": False, "message": "无权删除其他用户的历史记录"}
                with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
                    json.dump(new_history, f, ensure_ascii=False, indent=4)

        if target_record:
            for img_url in target_record.get("images", []):
                if img_url.startswith("/output/"):
                    # 解析URL路径: /output/[folder/]filename
                    parts = img_url.split("/")
                    if len(parts) >= 3:
                        filename = parts[-1]
                        # 检查是否有文件夹层
                        if len(parts) == 4 and parts[2]:  # /output/folder/filename
                            file_path = os.path.join(OUTPUT_DIR, parts[2], filename)
                        else:  # /output/filename
                            file_path = os.path.join(OUTPUT_DIR, filename)
                        if os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                            except Exception as e:
                                print(f"Failed to delete file {file_path}: {e}")
            return {"success": True}
        else:
            return {"success": False, "message": "Record not found"}
    except Exception as e:
        print(f"Delete history error: {e}")
        return {"success": False, "message": str(e)}

# --- ModelScope 角度控制 ---

@app.post("/api/angle/poll_status")
async def poll_angle_cloud(req: CloudPollRequest):
    base_url = 'https://api-inference.modelscope.cn/'
    clean_token = (req.api_key or MODELSCOPE_API_KEY).strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    task_id = req.task_id
    print(f"Resuming polling for Angle Task: {task_id}")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_angle_{int(time.time())}.png"
                                    file_path = os.path.join(OUTPUT_DIR, filename)
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                    local_path = f"/output/{filename}"
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": f"Resumed {task_id}", "images": [local_path], "type": "angle"}
                        save_to_history(record)
                        if req.client_id:
                            await manager.send_personal_message({"type": "cloud_status", "status": "SUCCEED", "task_id": task_id}, req.client_id)
                        return {"url": local_path}

                    elif status == "FAILED":
                        if req.client_id:
                            await manager.send_personal_message({"type": "cloud_status", "status": "FAILED", "task_id": task_id}, req.client_id)
                        raise Exception(f"ModelScope task failed: {data}")

                    if i % 5 == 0 and req.client_id:
                        await manager.send_personal_message({
                            "type": "cloud_status", "status": f"{status} ({i}/300)",
                            "task_id": task_id, "progress": i, "total": 300
                        }, req.client_id)

                except Exception as loop_e:
                    print(f"Angle polling error: {loop_e}")
                    continue

            if req.client_id:
                await manager.send_personal_message({"type": "cloud_status", "status": "TIMEOUT", "task_id": task_id}, req.client_id)
            return {"status": "timeout", "task_id": task_id, "message": "Task still pending"}

    except Exception as e:
        print(f"Angle polling error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/angle/generate")
async def generate_angle_cloud(req: CloudGenRequest, token: str = ""):
    username = get_username_by_token(token)
    base_url = 'https://api-inference.modelscope.cn/'
    clean_token = (req.api_key or MODELSCOPE_API_KEY).strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    payload = {
        "model": "Qwen/Qwen-Image-Edit-2511",
        "prompt": req.prompt.strip(),
        "image_url": req.image_urls
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(f"{base_url}v1/images/generations", headers=headers, json=payload)
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            print(f"Angle Task submitted, ID: {task_id}")

            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_angle_{int(time.time())}.png"
                                    if username:
                                        user_dir, _ = get_user_output_dir(username)
                                        file_path = os.path.join(user_dir, filename)
                                        local_path = build_output_url(None, filename, username)
                                    else:
                                        file_path = os.path.join(OUTPUT_DIR, filename)
                                        local_path = f"/output/{filename}"
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": req.prompt, "images": [local_path], "type": "angle"}
                        save_to_history(record)
                        if req.client_id:
                            await manager.send_personal_message({"type": "cloud_status", "status": "SUCCEED", "task_id": task_id}, req.client_id)
                        if GLOBAL_LOOP:
                            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(record), GLOBAL_LOOP)
                        return {"url": local_path, "task_id": task_id}

                    elif status == "FAILED":
                        if req.client_id:
                            await manager.send_personal_message({"type": "cloud_status", "status": "FAILED", "task_id": task_id}, req.client_id)
                        raise Exception(f"ModelScope task failed: {data}")

                    if i % 5 == 0 and req.client_id:
                        await manager.send_personal_message({
                            "type": "cloud_status", "status": f"{status} ({i}/300)",
                            "task_id": task_id, "progress": i, "total": 300
                        }, req.client_id)

                except Exception as loop_e:
                    print(f"Angle polling error: {loop_e}")
                    continue

            if req.client_id:
                await manager.send_personal_message({"type": "cloud_status", "status": "TIMEOUT", "task_id": task_id}, req.client_id)
            return {"status": "timeout", "task_id": task_id, "message": "Task still pending"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Angle generation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- ModelScope Z-Image 云端生图 ---

@app.post("/generate")
async def generate_cloud(req: CloudGenRequest, token: str = ""):
    username = get_username_by_token(token)
    base_url = 'https://api-inference.modelscope.cn/'
    clean_token = (req.api_key or MODELSCOPE_API_KEY).strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未提供 ModelScope API Key")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "Tongyi-MAI/Z-Image-Turbo",
        "prompt": req.prompt.strip(),
        "size": req.resolution,
        "n": 1
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(
                f"{base_url}v1/images/generations",
                headers={**headers, "X-ModelScope-Async-Mode": "true"},
                json=payload
            )
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            print(f"Z-Image Task submitted, ID: {task_id}")

            for i in range(200):
                await asyncio.sleep(3)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")

                    if i % 5 == 0:
                        print(f"Task {task_id} status check {i}: {status}")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"cloud_{int(time.time())}.png"
                                    if username:
                                        user_dir, _ = get_user_output_dir(username)
                                        file_path = os.path.join(user_dir, filename)
                                        local_path = build_output_url(None, filename, username)
                                    else:
                                        file_path = os.path.join(OUTPUT_DIR, filename)
                                        local_path = f"/output/{filename}"
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                else:
                                    local_path = img_url
                        except Exception as dl_e:
                            print(f"Download error: {dl_e}")
                            local_path = img_url

                        record = {"timestamp": time.time(), "prompt": req.prompt, "images": [local_path], "type": "cloud"}
                        save_to_history(record)
                        try:
                            await manager.broadcast_new_image(record)
                        except Exception:
                            pass
                        return {"url": local_path}

                    elif status == "FAILED":
                        raise Exception(f"ModelScope task failed: {data}")

                except Exception as loop_e:
                    print(f"Polling error (retrying): {loop_e}")
                    continue

            raise Exception("Cloud generation timeout")

    except HTTPException:
        raise
    except Exception as e:
        print(f"Cloud generation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- ModelScope 通用图片生成（支持图生图） ---

@app.post("/api/ms/generate")
async def ms_generate(req: MsGenerateRequest, token: str = ""):
    username = get_username_by_token(token)
    base_url = 'https://api-inference.modelscope.cn/'
    clean_token = MODELSCOPE_API_KEY.strip()
    if not clean_token:
        raise HTTPException(status_code=400, detail="未配置 MODELSCOPE_API_KEY，请在 API/.env 中填写。")

    headers = {
        "Authorization": f"Bearer {clean_token}",
        "Content-Type": "application/json",
        "X-ModelScope-Async-Mode": "true"
    }
    payload = {
        "model": req.model,
        "prompt": req.prompt.strip(),
    }
    if req.width and req.height:
        payload["width"] = req.width
        payload["height"] = req.height
    if req.image_urls:
        payload["image_url"] = req.image_urls
    if req.loras is not None:
        payload["loras"] = req.loras

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            submit_res = await client.post(
                f"{base_url}v1/images/generations",
                headers=headers,
                json=payload
            )
            if submit_res.status_code != 200:
                try:
                    detail = submit_res.json()
                except:
                    detail = submit_res.text
                raise HTTPException(status_code=submit_res.status_code, detail=detail)

            task_id = submit_res.json().get("task_id")
            print(f"MS Generate Task submitted ({req.model}), ID: {task_id}")

            TERMINAL_FAILED_STATUSES = {"FAILED", "FAIL", "ERROR", "CANCELED", "CANCELLED", "TIMEOUT", "REVOKED"}

            for i in range(300):
                await asyncio.sleep(2)
                try:
                    result = await client.get(
                        f"{base_url}v1/tasks/{task_id}",
                        headers={**headers, "X-ModelScope-Task-Type": "image_generation"},
                    )
                    data = result.json()
                    status = data.get("task_status")
                    print(f"MS Task {task_id} poll {i}: status={status}")

                    if status == "SUCCEED":
                        img_url = data["output_images"][0]
                        local_path = ""
                        try:
                            async with httpx.AsyncClient() as dl_client:
                                img_res = await dl_client.get(img_url)
                                if img_res.status_code == 200:
                                    filename = f"ms_{req.model.replace('/', '_').replace(':', '_')}_{int(time.time())}.png"
                                    if username:
                                        user_dir, _ = get_user_output_dir(username)
                                        file_path = os.path.join(user_dir, filename)
                                        local_path = build_output_url(None, filename, username)
                                    else:
                                        file_path = os.path.join(OUTPUT_DIR, filename)
                                        local_path = f"/output/{filename}"
                                    with open(file_path, "wb") as f:
                                        f.write(img_res.content)
                                else:
                                    local_path = img_url
                        except Exception:
                            local_path = img_url

                        record = {
                            "timestamp": time.time(),
                            "prompt": req.prompt,
                            "images": [local_path],
                            "type": "klein",
                            "model": req.model,
                        }
                        save_to_history(record)
                        if GLOBAL_LOOP:
                            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(record), GLOBAL_LOOP)
                        return {"url": local_path, "task_id": task_id}

                    elif status in TERMINAL_FAILED_STATUSES:
                        error_info = data.get("error_info") or data.get("message") or data.get("detail") or str(data)
                        raise HTTPException(status_code=502, detail=f"MS task {status}: {error_info}")

                except HTTPException:
                    raise
                except Exception as loop_e:
                    print(f"MS polling error: {loop_e}")
                    continue

            raise HTTPException(status_code=504, detail="MS 生图超时")

    except HTTPException:
        raise
    except Exception as e:
        print(f"MS generate error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# --- 本地 ComfyUI 生图 ---

@app.post("/api/generate")
def generate(req: GenerateRequest, token: str = ""):
    global NEXT_TASK_ID
    current_task = None
    target_backend = None
    username = get_username_by_token(token)
    
    # 加载画布（如果提供了 canvas_id）
    canvas = None
    if req.canvas_id:
        try:
            canvas = load_canvas(req.canvas_id)
        except:
            pass  # 画布不存在或已删除，降级到原有行为
    
    with QUEUE_LOCK:
        task_id = NEXT_TASK_ID
        NEXT_TASK_ID += 1
        current_task = {"task_id": task_id, "client_id": req.client_id}
        QUEUE.append(current_task)

    try:
        required_images = []
        for node_id, node_inputs in req.params.items():
            if isinstance(node_inputs, dict) and "image" in node_inputs:
                image_name = node_inputs["image"]
                if isinstance(image_name, str) and image_name:
                    required_images.append(image_name)

        target_backend = get_best_backend(required_images)
        with LOAD_LOCK:
            BACKEND_LOCAL_LOAD[target_backend] += 1

        for image_name in required_images:
            need_sync = False
            try:
                check_url = f"http://{target_backend}/view?filename={urllib.parse.quote(image_name)}&type=input"
                resp = requests.get(check_url, stream=True, timeout=0.5)
                resp.close()
                if resp.status_code != 200:
                    need_sync = True
            except:
                need_sync = True

            if need_sync:
                image_content = None
                image_type = "image/png"
                for addr in COMFYUI_INSTANCES:
                    if addr == target_backend: continue
                    try:
                        src_url = f"http://{addr}/view?filename={urllib.parse.quote(image_name)}&type=input"
                        r = requests.get(src_url, timeout=5)
                        if r.status_code == 200:
                            image_content = r.content
                            image_type = r.headers.get("Content-Type", "image/png")
                            break
                    except: continue

                if image_content:
                    try:
                        files = {'image': (image_name, image_content, image_type)}
                        requests.post(f"http://{target_backend}/upload/image", files=files, timeout=10)
                    except Exception as e:
                        print(f"Sync upload failed: {e}")

        if req.workflow_data:
            workflow = req.workflow_data
        elif req.workflow_json:
            workflow_path = os.path.join(WORKFLOW_DIR, req.workflow_json)
            if not os.path.exists(workflow_path) and req.workflow_json == "Z-Image.json":
                workflow_path = WORKFLOW_PATH
            if not os.path.exists(workflow_path):
                raise Exception(f"Workflow file not found: {req.workflow_json}")
            with open(workflow_path, 'r', encoding='utf-8') as f:
                workflow = json.load(f)
        else:
            raise Exception("缺少工作流数据，请提供 workflow_data 或 workflow_json")

        seed = random.randint(1, 10**15)

        if "23" in workflow and req.prompt:
            workflow["23"]["inputs"]["text"] = req.prompt
        if "144" in workflow:
            workflow["144"]["inputs"]["width"] = req.width
            workflow["144"]["inputs"]["height"] = req.height
        if "22" in workflow:
            workflow["22"]["inputs"]["seed"] = seed
        if "158" in workflow:
            workflow["158"]["inputs"]["noise_seed"] = seed
        for node_id in ["146", "181"]:
            if node_id in workflow and "inputs" in workflow[node_id] and "seed" in workflow[node_id]["inputs"]:
                workflow[node_id]["inputs"]["seed"] = seed
        if "184" in workflow and "inputs" in workflow["184"] and "seed" in workflow["184"]["inputs"]:
            workflow["184"]["inputs"]["seed"] = seed
        if "172" in workflow and "inputs" in workflow["172"] and "seed" in workflow["172"]["inputs"]:
            workflow["172"]["inputs"]["seed"] = seed % 4294967295
        if "14" in workflow and "inputs" in workflow["14"] and "seed" in workflow["14"]["inputs"]:
            workflow["14"]["inputs"]["seed"] = seed

        for node_id, node_inputs in req.params.items():
            if node_id in workflow:
                if "inputs" not in workflow[node_id]:
                    workflow[node_id]["inputs"] = {}
                for input_name, value in node_inputs.items():
                    workflow[node_id]["inputs"][input_name] = value

        comfy_client_id = req.client_id or CLIENT_ID
        p = {"prompt": workflow, "client_id": comfy_client_id}
        data = json.dumps(p).encode('utf-8')
        try:
            post_req = urllib.request.Request(f"http://{target_backend}/prompt", data=data)
            prompt_id = json.loads(urllib.request.urlopen(post_req, timeout=10).read())['prompt_id']
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            raise Exception(f"HTTP Error {e.code}: {error_body}")

        history_data = None
        for i in range(300):
            try:
                res = get_comfy_history(target_backend, prompt_id)
                if prompt_id in res:
                    history_data = res[prompt_id]
                    break
            except Exception:
                pass
            time.sleep(1)

        if not history_data:
            raise Exception("ComfyUI 渲染超时")

        local_urls = []
        output_text = ""
        current_timestamp = time.time()
        if 'outputs' in history_data:
            for node_id in history_data['outputs']:
                node_output = history_data['outputs'][node_id]
                
                # Extract image outputs
                # 对于ps.json工作流，只收集节点#2的图像（主图像），跳过节点#5（遮罩）
                if 'images' in node_output:
                    # 如果是ps.json工作流，跳过节点#5的遮罩输出
                    if req.workflow_json == 'ps.json' and node_id == '5':
                        continue
                    
                    for img in node_output['images']:
                        comfy_url_path = f"/view?filename={img['filename']}&subfolder={img['subfolder']}&type={img['type']}"
                        prefix = f"{req.type}_{int(current_timestamp)}_"
                        local_path = download_image(target_backend, comfy_url_path, prefix=prefix, canvas=canvas, username=username)
                        if req.convert_to_jpg:
                            local_path = convert_output_to_jpg(local_path)
                        local_urls.append(local_path)
                
                # Extract text output from ShowText and text-based nodes
                # 只有 promptgen 类型才保存文本输出（图像反推等）
                if not output_text and 'text' in node_output and req.type == 'promptgen':
                    tv = node_output['text']
                    if isinstance(tv, list) and tv:
                        output_text = '\n'.join([str(t) for t in tv])
                    elif isinstance(tv, str) and tv.strip():
                        output_text = tv

        # 只有 promptgen 类型才保存文本文件
        if output_text and req.type == 'promptgen':
            print(f"[TextOutput] Extracted text: {len(output_text)} chars")
            if canvas:
                canvas_output_dir = get_canvas_output_dir(canvas)
            elif username:
                canvas_output_dir, _ = get_user_output_dir(username)
            else:
                canvas_output_dir = OUTPUT_DIR
            os.makedirs(canvas_output_dir, exist_ok=True)
            text_filename = f"{req.type}_{int(current_timestamp)}_{uuid.uuid4().hex[:8]}.txt"
            text_filepath = os.path.join(canvas_output_dir, text_filename)
            try:
                with open(text_filepath, 'w', encoding='utf-8') as f:
                    f.write(output_text)
                text_url = build_output_url(canvas, text_filename, username)
                print(f"[TextOutput] Saved to: {text_filepath}")
            except Exception as e:
                print(f"[TextOutput] Failed to save text file: {e}")
                text_url = ""
        else:
            print(f"[TextOutput] WARNING: No text extracted from ComfyUI history")
            text_url = ""
        
        if not local_urls and not output_text:
            comfy_error = ""
            if isinstance(history_data, dict):
                status_info = history_data.get("status", {})
                if isinstance(status_info, dict):
                    comfy_error = status_info.get("status_str", "") or status_info.get("error", "") or ""
                if not comfy_error:
                    for node_id, node_out in history_data.get("outputs", {}).items():
                        if isinstance(node_out, dict) and "error" in node_out:
                            comfy_error = str(node_out["error"])
                            break
            if comfy_error:
                raise Exception(f"ComfyUI 执行失败: {comfy_error}")
            raise Exception("ComfyUI 未返回图像，请检查工作流配置或确认模型已安装")
        
        result = {
            "prompt": req.prompt if req.prompt else "Detail Enhance",
            "images": local_urls,
            "text": output_text,
            "text_url": text_url,
            "seed": seed,
            "prompt_id": prompt_id,
            "timestamp": current_timestamp,
            "type": req.type,
            "user": username,
            "params": req.params
        }
        save_to_history(result)
        # Broadcast if there are images OR text output
        # 但ps.json和ps_send.json工作流不广播，由前端自行处理
        if GLOBAL_LOOP and (local_urls or output_text) and req.workflow_json not in ('ps.json', 'ps_send.json'):
            asyncio.run_coroutine_threadsafe(manager.broadcast_new_image(result), GLOBAL_LOOP)
        return result

    except Exception as e:
        return {"images": [], "error": str(e)}
    finally:
        if target_backend:
            with LOAD_LOCK:
                if BACKEND_LOCAL_LOAD.get(target_backend, 0) > 0:
                    BACKEND_LOCAL_LOAD[target_backend] -= 1
        if current_task:
            with QUEUE_LOCK:
                if current_task in QUEUE:
                    QUEUE.remove(current_task)

# --- API 设置相关 API ---

class ApiProviderPayload(BaseModel):
    id: str = ""
    name: str = ""
    base_url: str = ""
    protocol: str = "openai"
    api_key: Optional[str] = None
    image_models: List[str] = []
    chat_models: List[str] = []
    video_models: List[str] = []
    primary: bool = False
    enabled: bool = True

class TestConnectionPayload(BaseModel):
    base_url: str = ""
    api_key: str = ""
    provider_id: str = ""

@app.get("/api/providers")
async def api_providers():
    """获取 API 提供商列表"""
    return {"providers": [public_provider(p) for p in load_api_providers()]}

@app.put("/api/providers")
async def save_providers(payload: List[ApiProviderPayload]):
    """保存 API 提供商列表"""
    providers = []
    env_updates = {}
    
    # 收集 primary 标记
    raw_primary_flags = [bool(getattr(item, "primary", False)) for item in payload]
    
    for item in payload:
        provider = normalize_provider(item.dict(exclude={"api_key"}))
        
        # 检查 ID 重复
        if any(existing["id"] == provider["id"] for existing in providers):
            raise HTTPException(status_code=400, detail=f"API 平台 ID 重复：{provider['id']}")
        
        providers.append(provider)
        
        # 收集 API Key
        if item.api_key is not None:
            env_updates[provider_key_env(provider["id"])] = item.api_key.strip()
        
        # 收集其他配置
        if provider["id"] == "comfly":
            env_updates["COMFLY_BASE_URL"] = provider["base_url"]
            env_updates["IMAGE_MODELS"] = ",".join(provider["image_models"])
            env_updates["CHAT_MODELS"] = ",".join(provider["chat_models"])
            env_updates["VIDEO_MODELS"] = ",".join(provider.get("video_models") or [])
        
        if provider["id"] == "modelscope":
            env_updates["MODELSCOPE_CHAT_MODELS"] = ",".join(provider["chat_models"])
    
    if not providers:
        raise HTTPException(status_code=400, detail="至少保留一个 API 平台")
    
    # 强制最多一个 primary（取最后被标记的）
    primary_indices = [i for i, flag in enumerate(raw_primary_flags) if flag]
    if primary_indices:
        winner = primary_indices[-1]
        for i, p in enumerate(providers):
            p["primary"] = (i == winner)
    
    save_api_providers(providers)
    
    if env_updates:
        update_env_values(env_updates)
        reload_env_globals()  # 立即同步环境变量
    
    return {"providers": [public_provider(p) for p in providers]}

@app.post("/api/providers/test-connection")
async def test_provider_connection(payload: TestConnectionPayload):
    """测试请求地址是否可用：调用上游 /v1/models"""
    base_url = (payload.base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    
    if not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail="请求地址必须以 http:// 或 https:// 开头")
    
    api_key = (payload.api_key or "").strip()
    if not api_key and payload.provider_id:
        api_key = os.getenv(provider_key_env(payload.provider_id), "")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写或保存 API Key")
    
    url = f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            })
        
        if resp.status_code >= 400:
            return {"ok": False, "status": resp.status_code, "message": resp.text[:300]}
        
        data = resp.json() if resp.text else {}
        items = (data.get("data") if isinstance(data, dict) else None) or []
        
        # 抽取模型 ID
        ids = []
        for it in items:
            if isinstance(it, str):
                ids.append(it)
            elif isinstance(it, dict):
                mid = it.get("id") or it.get("name") or it.get("model")
                if mid:
                    ids.append(str(mid))
        
        ids = sorted(set(ids))
        
        # 关键字分类
        def classify(mid):
            lc = mid.lower()
            video_keys = ["veo", "sora", "wan2", "wanx", "doubao-seedance", "doubao-1", "kling", "hailuo", "video", "t2v-", "i2v-", "s2v"]
            if any(k in lc for k in video_keys):
                return "video"
            image_keys = ["image", "dalle", "dall-e", "imagen", "flux", "stable", "sdxl", "midjourney", "nano-banana", "ideogram", "fal-ai", "z-image", "qwen-image", "klein"]
            if any(k in lc for k in image_keys):
                return "image"
            return "chat"
        
        grouped = {"image": [], "chat": [], "video": []}
        for mid in ids:
            grouped[classify(mid)].append(mid)
        
        return {
            "ok": True,
            "status": resp.status_code,
            "model_count": len(ids),
            "image_models": grouped["image"],
            "chat_models": grouped["chat"],
            "video_models": grouped["video"],
            "all": ids
        }
    except httpx.HTTPError as e:
        return {"ok": False, "status": 0, "message": str(e)[:300]}

@app.post("/api/providers/probe-async")
async def probe_async_endpoint(payload: TestConnectionPayload):
    """验证异步协议：用假 task_id 请求 GET /v1/tasks/{fake_id}"""
    base_url = (payload.base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    
    api_key = (payload.api_key or "").strip()
    if not api_key and payload.provider_id:
        api_key = os.getenv(provider_key_env(payload.provider_id), "")
    
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写或保存 API Key")
    
    tasks_base = base_url if base_url.endswith("/v1") else f"{base_url}/v1"
    probe_url = f"{tasks_base}/tasks/healthcheck_probe_do_not_submit"
    
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(probe_url, headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            })
        
        try:
            body = resp.json()
        except Exception:
            body = resp.text[:500]
        
        sc = resp.status_code
        err_msg = ""
        if isinstance(body, dict):
            err = body.get("error") or {}
            if isinstance(err, dict):
                err_msg = str(err.get("message") or "").lower()
            else:
                err_msg = str(err).lower()
        
        # 判断结果
        if sc == 400 and "invalid task id" in err_msg:
            return {"ok": True, "status_code": sc, "message": "异步任务端点可用，API Key 已通过认证", "raw": body}
        
        if sc in (401, 403):
            return {"ok": False, "status_code": sc, "message": "API Key 无效或无权限", "raw": body}
        
        if sc == 404:
            return {"ok": False, "status_code": sc, "message": "平台不支持 /v1/tasks/ 端点，可能不是 APIMart 异步协议", "raw": body}
        
        if 400 <= sc < 500:
            return {"ok": None, "status_code": sc, "message": f"端点返回 {sc}，请查看原始响应判断", "raw": body}
        
        if sc < 300:
            return {"ok": True, "status_code": sc, "message": f"端点返回 {sc}（意外成功）", "raw": body}
        
        return {"ok": False, "status_code": sc, "message": f"服务端错误 {sc}", "raw": body}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e)[:300])

async def fetch_models_from_upstream(base_url: str, api_key: str):
    """从 OpenAI 兼容 /v1/models 端点拉取模型"""
    base_url = (base_url or "").strip().rstrip("/")
    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写请求地址")
    
    if not re.match(r"^https?://", base_url):
        raise HTTPException(status_code=400, detail="请求地址必须以 http:// 或 https:// 开头")
    
    api_key = (api_key or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="请先填写或保存 API Key")
    
    url = f"{base_url}/models" if base_url.endswith("/v1") else f"{base_url}/v1/models"
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json"
            })
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=f"上游 /v1/models 失败：{resp.text[:300]}")
            raw = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"请求上游模型列表失败：{e}")
    
    # 兼容多种返回结构
    items = raw.get("data") if isinstance(raw, dict) else None
    if not items and isinstance(raw, dict):
        items = raw.get("models") or raw.get("list") or []
    if not isinstance(items, list):
        items = []
    
    ids = []
    for it in items:
        if isinstance(it, str):
            ids.append(it)
        elif isinstance(it, dict):
            mid = it.get("id") or it.get("name") or it.get("model")
            if mid:
                ids.append(str(mid))
    
    ids = sorted(set(ids))
    
    # 分类规则
    def classify(mid):
        lc = mid.lower()
        video_keys = ["veo", "sora", "wan2", "wanx", "doubao-seedance", "doubao-1", "kling", "hailuo", "video", "t2v-", "i2v-", "s2v"]
        if any(k in lc for k in video_keys):
            return "video"
        image_keys = ["image", "dalle", "dall-e", "imagen", "flux", "stable", "sdxl", "midjourney", "nano-banana", "ideogram", "fal-ai", "z-image", "qwen-image", "klein"]
        if any(k in lc for k in image_keys):
            return "image"
        return "chat"
    
    grouped = {"image": [], "chat": [], "video": []}
    for mid in ids:
        grouped[classify(mid)].append(mid)
    
    return {
        "total": len(ids),
        "image_models": grouped["image"],
        "chat_models": grouped["chat"],
        "video_models": grouped["video"],
        "all": ids
    }

@app.post("/api/providers/fetch-models")
async def fetch_upstream_models_from_payload(payload: TestConnectionPayload):
    """按页面当前表单值拉取模型"""
    api_key = (payload.api_key or "").strip()
    if not api_key and payload.provider_id:
        api_key = os.getenv(provider_key_env(payload.provider_id), "")
    return await fetch_models_from_upstream(payload.base_url, api_key)

@app.get("/api/providers/{provider_id}/fetch-models")
async def fetch_upstream_models(provider_id: str):
    """从已保存的上游接口拉取模型列表"""
    provider = get_api_provider_exact(provider_id)
    api_key = os.getenv(provider_key_env(provider["id"]), "")
    if not api_key:
        raise HTTPException(status_code=400, detail=f"{provider.get('name') or provider_id} 未配置 API Key")
    return await fetch_models_from_upstream(provider.get("base_url") or "", api_key)

# --- ComfyUI 设置相关 API ---

# 工作流名称校验正则
WORKFLOW_NAME_RE = re.compile(r'^[\w\u4e00-\u9fff][\w\u4e00-\u9fff\.\-_\/]*\.json$')

# 内置工作流列表（workflows/ 目录下根级的文件）
BUILTIN_WORKFLOWS = set()
if os.path.exists(WORKFLOW_DIR):
    for fn in os.listdir(WORKFLOW_DIR):
        if fn.endswith('.json') and os.path.isfile(os.path.join(WORKFLOW_DIR, fn)):
            BUILTIN_WORKFLOWS.add(fn)

def update_env_values(updates):
    """更新 .env 文件中的配置值"""
    env_path = os.path.join(os.path.dirname(__file__), "API", ".env")
    try:
        env_lines = []
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                env_lines = f.readlines()
        
        # 更新或添加配置
        for key, value in updates.items():
            found = False
            for i, line in enumerate(env_lines):
                if line.startswith(f"{key}="):
                    env_lines[i] = f"{key}={value}\n"
                    found = True
                    break
            
            if not found:
                env_lines.append(f"{key}={value}\n")
        
        os.makedirs(os.path.dirname(env_path), exist_ok=True)
        with open(env_path, 'w', encoding='utf-8') as f:
            f.writelines(env_lines)
    except Exception as e:
        print(f"Failed to update env file: {e}")
        raise

def workflow_path_from_name(name: str) -> str:
    """根据工作流名称获取文件路径，包含安全校验"""
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法")
    
    # 防止路径遍历攻击
    path = os.path.abspath(os.path.join(WORKFLOW_DIR, *name.split("/")))
    workflow_root = os.path.abspath(WORKFLOW_DIR)
    if os.path.commonpath([workflow_root, path]) != workflow_root:
        raise HTTPException(status_code=400, detail="工作流名称包含非法路径")
    
    return path

def workflow_config_path(name: str) -> str:
    """获取工作流配置文件路径"""
    return workflow_path_from_name(name).replace(".json", ".config.json")

def is_builtin_workflow(name: str) -> bool:
    """判断是否为内置工作流"""
    return "/" not in name and os.path.basename(name) in BUILTIN_WORKFLOWS

class ComfyUIInstancesUpdateRequest(BaseModel):
    instances: List[str] = []

@app.get("/api/comfyui/instances")
async def get_comfyui_instances():
    """获取 ComfyUI 实例列表"""
    return {"instances": COMFYUI_INSTANCES.copy()}

@app.put("/api/comfyui/instances")
async def update_comfyui_instances(req: ComfyUIInstancesUpdateRequest):
    """更新 ComfyUI 实例列表"""
    global COMFYUI_INSTANCES, COMFYUI_ADDRESS, BACKEND_LOCAL_LOAD
    
    # 清洗实例地址
    cleaned = []
    for item in req.instances:
        s = str(item or "").strip()
        if not s:
            continue
        # 去除 http(s):// 前缀
        s = re.sub(r"^https?://", "", s)
        # 去除尾部斜杠
        s = s.rstrip("/")
        # 校验格式：host:port
        if ":" not in s:
            raise HTTPException(status_code=400, detail=f"地址缺少端口号：{item}（应为 host:port，例如 127.0.0.1:8188）")
        host, _, port = s.rpartition(":")
        if not host or not port.isdigit():
            raise HTTPException(status_code=400, detail=f"地址不合法：{item}（应为 host:port，例如 127.0.0.1:8188）")
        # 去重
        if s in cleaned:
            continue
        cleaned.append(s)
    
    if not cleaned:
        raise HTTPException(status_code=400, detail="至少需要一个 ComfyUI 实例地址")
    
    # 保存到 .env 文件
    try:
        update_env_values({"COMFYUI_INSTANCES": ",".join(cleaned)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置文件失败：{e}")
    
    # 更新全局变量
    COMFYUI_INSTANCES = cleaned
    COMFYUI_ADDRESS = cleaned[0]
    new_load = {addr: 0 for addr in cleaned}
    # 保留已有的负载计数
    for addr, n in BACKEND_LOCAL_LOAD.items():
        if addr in new_load:
            new_load[addr] = n
    BACKEND_LOCAL_LOAD = new_load
    
    return {"instances": COMFYUI_INSTANCES.copy()}

# --- ComfyUI 代理端点（供前端在 non-local 模式下使用） ---

@app.get("/api/comfyui/system_stats")
async def proxy_comfyui_system_stats():
    """代理检查 ComfyUI 服务器状态"""
    target = COMFYUI_ADDRESS
    if not target:
        raise HTTPException(status_code=503, detail="未配置 ComfyUI 地址")
    try:
        url = f"http://{target}/system_stats"
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url)
        return Response(content=resp.content, media_type="application/json")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ComfyUI 连接失败: {str(e)}")

@app.post("/api/comfyui/upload/image")
async def proxy_comfyui_upload_image(file: UploadFile = File(...)):
    """代理上传图片到 ComfyUI（兼容前端 apiFetch 模式）"""
    content = await file.read()
    result = None
    for addr in COMFYUI_INSTANCES:
        try:
            files_data = {'image': (file.filename or f"upload_{int(time.time())}.png", content, file.content_type or "image/png")}
            resp = requests.post(f"http://{addr}/upload/image", files=files_data, timeout=10)
            if resp.status_code == 200 and result is None:
                result = resp.json()
        except Exception as e:
            print(f"[ComfyUI Proxy] Upload to {addr} failed: {e}")
    if result:
        return result
    raise HTTPException(status_code=502, detail="所有 ComfyUI 实例上传均失败")

@app.websocket("/api/comfyui/ws")
async def proxy_comfyui_ws(websocket: WebSocket, client_id: str = None):
    """代理 ComfyUI WebSocket，让前端通过后端获取实时进度"""
    await websocket.accept()
    target = COMFYUI_ADDRESS
    if not target:
        await websocket.send_json({"type": "error", "message": "未配置 ComfyUI 地址"})
        await websocket.close()
        return

    cid = client_id or str(uuid.uuid4())
    comfy_ws = None
    try:
        comfy_ws = await ws_client.connect(f"ws://{target}/ws?clientId={cid}")

        async def forward_to_frontend():
            try:
                async for message in comfy_ws:
                    if isinstance(message, str):
                        await websocket.send_text(message)
                    else:
                        await websocket.send_bytes(message)
            except Exception:
                pass

        async def forward_to_comfy():
            try:
                while True:
                    data = await websocket.receive_text()
                    await comfy_ws.send(data)
            except WebSocketDisconnect:
                pass
            except Exception:
                pass

        await asyncio.gather(forward_to_frontend(), forward_to_comfy())
    except Exception as e:
        print(f"[ComfyUI WS Proxy] 连接错误: {e}")
    finally:
        if comfy_ws:
            try:
                await comfy_ws.close()
            except Exception:
                pass

# --- 工作流管理 API ---

@app.get("/api/workflows")
async def list_workflows():
    """获取工作流列表"""
    if not os.path.isdir(WORKFLOW_DIR):
        return {"workflows": []}
    
    items = []
    for root, dirs, files in os.walk(WORKFLOW_DIR):
        # 只遍历特定目录
        if os.path.abspath(root) == os.path.abspath(WORKFLOW_DIR):
            dirs[:] = [d for d in dirs if d in {"custom", "自定义"}]  # 允许遍历自定义工作流目录
        
        for fn in sorted(files):
            if not fn.endswith(".json") or fn.endswith(".config.json"):
                continue
            
            rel = os.path.relpath(os.path.join(root, fn), WORKFLOW_DIR).replace("\\", "/")
            
            # 跳过内置工作流
            if is_builtin_workflow(rel):
                continue
            
            # 读取配置
            cfg = {}
            cfg_path = workflow_config_path(rel)
            if os.path.exists(cfg_path):
                try:
                    with open(cfg_path, "r", encoding="utf-8") as f:
                        cfg = json.load(f) or {}
                except Exception:
                    cfg = {}
            
            items.append({
                "name": rel,
                "title": cfg.get("title") or fn.replace(".json", ""),
                "builtin": False,
                "field_count": len(cfg.get("fields") or [])
            })
    
    # 排序
    items.sort(key=lambda item: item["title"])
    return {"workflows": items}

@app.get("/api/workflows/{name:path}")
async def get_workflow(name: str):
    """获取单个工作流详情"""
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法")
    
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    # 读取工作流
    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
    
    # 读取配置
    cfg = {"title": name.replace(".json", ""), "fields": []}
    cfg_path = workflow_config_path(name)
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f) or cfg
        except Exception:
            pass
    
    return {
        "name": name,
        "workflow": workflow,
        "config": cfg,
        "builtin": is_builtin_workflow(name)
    }

@app.post("/api/workflows")
async def create_workflow(req: Request):
    """创建新工作流"""
    try:
        body = await req.json()
        name = os.path.basename(body.get('name', 'workflow.json').strip())
        workflow_data = body.get('workflow', {})
        
        if not name.endswith('.json'):
            name = name + '.json'
        
        if not WORKFLOW_NAME_RE.match(name):
            raise HTTPException(status_code=400, detail="工作流名称不合法，请使用中文/英文/数字/_-.")
        
        if not isinstance(workflow_data, dict) or not workflow_data:
            raise HTTPException(status_code=400, detail="工作流 JSON 为空")
        
        # 校验是否为有效的 ComfyUI API 格式
        sample = next(iter(workflow_data.values()), None)
        if not isinstance(sample, dict) or "class_type" not in sample:
            raise HTTPException(status_code=400, detail="不是有效的 ComfyUI API 工作流 JSON（需包含 class_type）")
        
        # 保存到自定义工作流目录
        custom_dir = os.path.join(WORKFLOW_DIR, "custom")
        os.makedirs(custom_dir, exist_ok=True)
        stored_name = f"custom/{name}"
        path = workflow_path_from_name(stored_name)
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(workflow_data, f, ensure_ascii=False, indent=2)
        
        return {"name": stored_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建工作流失败: {str(e)}")

@app.put("/api/workflows/{name:path}/config")
async def update_workflow_config(name: str, req: Request):
    """更新工作流配置"""
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法")
    
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    try:
        body = await req.json()
        cfg_path = workflow_config_path(name)
        
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
        
        return {"config": body}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")

@app.delete("/api/workflows/{name:path}")
async def delete_workflow(name: str):
    """删除工作流"""
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法")
    
    # 内置工作流不可删除
    if is_builtin_workflow(name):
        raise HTTPException(status_code=400, detail="内置工作流不可删除")
    
    workflow_path = workflow_path_from_name(name)
    cfg_path = workflow_config_path(name)
    
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    try:
        os.remove(workflow_path)
        if os.path.exists(cfg_path):
            os.remove(cfg_path)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除工作流失败: {str(e)}")

@app.post("/api/workflows/{workflow_name:path}/run")
def run_workflow(workflow_name: str, payload: WorkflowRunRequest):
    """运行工作流（使用 generate 函数）"""
    try:
        # 校验工作流名称
        if not WORKFLOW_NAME_RE.match(workflow_name):
            raise HTTPException(status_code=400, detail="工作流名称不合法")
        
        workflow_path = workflow_path_from_name(workflow_name)
        if not os.path.exists(workflow_path):
            raise HTTPException(status_code=404, detail="工作流不存在")
        
        # 根据 config 的字段把值映射成 params 节点覆盖
        params: Dict[str, Dict[str, Any]] = {}
        for field in payload.config.fields:
            if not field.node or not field.input:
                continue
            if field.id in payload.fields:
                value = payload.fields[field.id]
                # 类型转换
                if field.type in ("number", "slider"):
                    try:
                        value = float(value) if (field.step and field.step < 1) else int(float(value))
                    except Exception:
                        pass
                elif field.type == "boolean":
                    value = bool(value)
                elif field.type == "dropdown":
                    # 下拉值如果看起来是数字，自动转成 int/float
                    if isinstance(value, str):
                        s = value.strip()
                        try:
                            if s and ('.' in s or 'e' in s.lower()):
                                value = float(s)
                            elif s and s.lstrip('-').isdigit():
                                value = int(s)
                        except (ValueError, TypeError):
                            pass
                elif field.type == "image":
                    # 图片字段：值已经是 ComfyUI 图片文件名
                    pass
                params.setdefault(field.node, {})[field.input] = value
        
        # 调用 generate 函数
        generate_req = GenerateRequest(
            prompt="",
            workflow_json=workflow_name,
            params=params,
            type="workflow",
            client_id=payload.client_id or CLIENT_ID,
        )
        
        # 调用同步的 generate 函数
        result = generate(generate_req)
        
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"运行工作流失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    import socket

    # Get local IP for LAN access
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print(f"\n  Local:   http://127.0.0.1:7000")
    print(f"  LAN:     http://{local_ip}:7000\n")

    uvicorn.run(app, host="0.0.0.0", port=7000)
