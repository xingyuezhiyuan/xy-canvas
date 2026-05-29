# ComfyUI 自定义工作流技术文档

## 1. 功能概述

ComfyUI 自定义工作流功能允许用户在 ComfyUI 设置页面导入工作流 JSON，选择要暴露的节点参数，然后在无限画布中通过自定义 ComfyUI 节点执行该工作流。支持图片输入、参数配置和自动执行。

## 2. 工作流程

### 2.1 ComfyUI 设置页面配置工作流

**文件位置**: `c:\Users\Administrator\Desktop\xymap\static\setting\comfyui-settings.html`

**操作流程**:
1. 用户打开 ComfyUI 设置页面
2. 上传 ComfyUI 工作流 JSON 文件（API 格式）
3. 系统解析工作流图，显示所有节点列表
4. 用户勾选要暴露的节点输入参数
5. 为每个暴露的参数设置：
   - **字段 ID**: 唯一标识符
   - **显示名称**: 用户友好的名称
   - **类型**: text、number、textarea、dropdown、boolean、image
   - **默认值**: 参数默认值
   - **选项**: 下拉选项（仅 dropdown 类型）
6. 点击保存，系统将：
   - 工作流 JSON 保存到 `workflows/custom/工作流名称.json`
   - 配置保存到 `workflows/custom/工作流名称.config.json`

### 2.2 配置数据结构

**工作流 JSON** (`workflows/custom/xxx.json`):
```json
{
  "1": {
    "inputs": { "text": "prompt" },
    "class_type": "CLIPTextEncode"
  },
  "2": {
    "inputs": { "image": "example.png" },
    "class_type": "LoadImage"
  }
}
```

**配置文件** (`workflows/custom/xxx.config.json`):
```json
{
  "title": "我的工作流",
  "fields": [
    {
      "id": "prompt_1",
      "node": "1",
      "input": "text",
      "type": "textarea",
      "display_name": "提示词",
      "default": ""
    },
    {
      "id": "image_1",
      "node": "2",
      "input": "image",
      "type": "image",
      "display_name": "输入图片"
    }
  ]
}
```

## 3. 无限画布实现

### 3.1 前端文件

**主文件**: `c:\Users\Administrator\Desktop\xymap\static\canvas.html`

### 3.2 全局变量

```javascript
// 工作流列表（在 loadConfig 时加载）
let comfyWorkflows = [];

// 工作流详情缓存
let comfyWorkflowCache = {};
```

### 3.3 添加 ComfyUI 节点

```javascript
function addComfyNode(point) {
    const p = point || defaultPoint(160, 0);
    addNode({
        id: uid('comfy'),
        type: 'comfy',
        x: p.x,
        y: p.y,
        w: 420,
        h: 460,
        mode: 'klein',           // 默认模式
        workflowId: '',          // 自定义工作流 ID
        workflowName: '',        // 工作流名称
        workflowParams: {},      // 用户填写的参数
        // ... 其他模式参数
    });
}
```

### 3.4 节点渲染

**函数**: `renderComfyBody(node)`

**模式切换**:
```javascript
const modeTabsHtml = Object.entries(ComfyUIRegistry)
    .map(([key, config]) => 
        `<button data-mode="${key}" class="${mode === key ? 'active' : ''}">${config.label}</button>`
    ).join('') +
    `<button data-mode="custom" class="${mode === 'custom' ? 'active' : ''}">自定义</button>`;
```

**自定义模式 UI**:
```javascript
if (isCustomWorkflow) {
    // 显示工作流选择下拉框
    <select class="workflow-select-input" data-field="workflowId">
        <option value="">选择工作流...</option>
    </select>
    
    // 显示工作流参数容器
    <div class="workflow-params-container"></div>
}
```

### 3.5 工作流列表加载

**函数**: `loadConfig()`

```javascript
async function loadConfig() {
    // ... 其他配置加载
    
    try {
        const wf = await fetch('/api/workflows').then(r => r.json());
        comfyWorkflows = wf.workflows || [];
    } catch(_) {
        comfyWorkflows = [];
    }
}
```

**监听设置页面变更**:
```javascript
const apiChannel = new BroadcastChannel('studio-api');
apiChannel.onmessage = async (e) => {
    if (e.data?.type === 'workflows-changed') {
        await loadConfig();
        if (typeof render === 'function') render();
    }
};
```

### 3.6 工作流选择

**函数**: `renderWorkflowSelect(select, node)`

```javascript
function renderWorkflowSelect(select, node) {
    select.onchange = async e => {
        const workflowName = select.value;
        node.workflowId = workflowName;
        node.workflowName = workflowName;
        node.workflowParams = {};
        
        if (workflowName) {
            // 加载工作流配置
            await ensureComfyWorkflow(workflowName);
            const wfData = comfyWorkflowCache[workflowName];
            if (wfData) {
                const config = wfData.config || { fields: [] };
                config.fields.forEach(f => {
                    if (f.default !== undefined && f.default !== null) {
                        node.workflowParams[f.id] = f.default;
                    }
                });
            }
        }
        
        render();
        scheduleSave();
    };
}
```

**缓存工作流详情**:
```javascript
async function ensureComfyWorkflow(name) {
    if (!name || !comfyWorkflows.some(w => w.name === name)) return null;
    if (comfyWorkflowCache[name]) return comfyWorkflowCache[name];
    
    const res = await fetch(`/api/workflows/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    comfyWorkflowCache[name] = data;
    return data;
}
```

### 3.7 参数控件渲染

**函数**: `renderWorkflowParams(container, node)`

根据 `config.fields` 生成不同类型的输入控件：

```javascript
function renderFieldInput(field, value) {
    const fieldType = field.type || field.control_type || 'text';
    
    if (fieldType === 'textarea') {
        return `<textarea class="workflow-param-input" data-field="${field.id}">${value}</textarea>`;
    } else if (fieldType === 'number') {
        return `<input type="number" class="workflow-param-input" data-field="${field.id}" value="${value}">`;
    } else if (fieldType === 'dropdown') {
        return `<select class="workflow-param-input" data-field="${field.id}">...</select>`;
    } else if (fieldType === 'boolean') {
        return `<input type="checkbox" ...>`;
    } else {
        return `<input type="text" class="workflow-param-input" data-field="${field.id}" value="${value}">`;
    }
}
```

### 3.8 执行自定义工作流

**函数**: `runCustomWorkflow(nodeId)`

**完整流程**:

```javascript
async function runCustomWorkflow(nodeId) {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.running || !node.workflowId) return;
    
    node.running = true;
    render();
    
    try {
        // 1. 加载工作流配置
        await ensureComfyWorkflow(node.workflowId);
        const config = comfyWorkflowCache[node.workflowId]?.config || { fields: [] };
        
        // 2. 获取连接的图片输入
        const sources = orderedSources(node, generatorSources(node));
        const imageInputs = sources.filter(src => src.refs?.length);
        
        // 3. 上传图片并构建参数
        const params = { ...node.workflowParams };
        const imageFields = config.fields.filter(f => f.type === 'image');
        
        for (let i = 0; i < Math.min(imageFields.length, imageInputs.length); i++) {
            const field = imageFields[i];
            const imageInput = imageInputs[i];
            const ref = (imageInput.refs || [])[0];
            
            if (ref && ref.url && field.node && field.input) {
                // 上传图片到 ComfyUI
                const comfyName = await uploadCanvasUrlToComfy(ref.url);
                params[field.id] = comfyName;
            }
        }
        
        // 4. 调用后端 API
        const response = await fetch(`/api/workflows/${encodeURIComponent(node.workflowId)}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: params,
                config: config,
                client_id: CLIENT_ID
            })
        });
        
        const data = await response.json();
        
        // 5. 将结果输出到 Output 节点
        let out = connections.filter(c => c.from === node.id)
            .map(c => nodes.find(n => n.id === c.to))
            .find(n => n?.type === 'output');
        
        if (!out) {
            out = { id: uid('out'), type: 'output', x: node.x + 480, y: node.y, images: [] };
            nodes.push(out);
            connections.push({ id: uid('c'), from: node.id, to: out.id });
        }
        
        if (data.images && data.images.length) {
            window.outputNode.appendImage(out, data.images, null);
        }
        
        node.running = false;
        render();
        scheduleSave();
    } catch (err) {
        node.running = false;
        render();
        alert(`工作流执行失败: ${err.message}`);
    }
}
```

## 4. 后端实现

### 4.1 主文件

**文件位置**: `c:\Users\Administrator\Desktop\xymap\main.py`

### 4.2 Pydantic 模型定义

```python
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
```

### 4.3 API 路由

#### 4.3.1 获取工作流列表

```python
@app.get("/api/workflows")
async def list_workflows():
    if not os.path.isdir(WORKFLOW_DIR):
        return {"workflows": []}
    
    items = []
    for root, dirs, files in os.walk(WORKFLOW_DIR):
        # 允许遍历自定义工作流目录
        if os.path.abspath(root) == os.path.abspath(WORKFLOW_DIR):
            dirs[:] = [d for d in dirs if d in {"custom", "自定义"}]
        
        for fn in sorted(files):
            if not fn.endswith(".json") or fn.endswith(".config.json"):
                continue
            
            rel = os.path.relpath(os.path.join(root, fn), WORKFLOW_DIR).replace("\\", "/")
            
            if is_builtin_workflow(rel):
                continue
            
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
    
    items.sort(key=lambda item: item["title"])
    return {"workflows": items}
```

#### 4.3.2 获取工作流详情

```python
@app.get("/api/workflows/{name:path}")
async def get_workflow(name: str):
    if not WORKFLOW_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="工作流名称不合法")
    
    workflow_path = workflow_path_from_name(name)
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="工作流不存在")
    
    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow = json.load(f)
    
    cfg = {"title": name.replace(".json", ""), "fields": []}
    cfg_path = workflow_config_path(name)
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f) or cfg
        except Exception:
            pass
    
    return {"name": name, "workflow": workflow, "config": cfg, "builtin": is_builtin_workflow(name)}
```

#### 4.3.3 执行工作流

```python
@app.post("/api/workflows/{workflow_name:path}/run")
def run_workflow(workflow_name: str, payload: WorkflowRunRequest):
    """运行工作流（使用 generate 函数）"""
    try:
        # 1. 校验工作流名称
        if not WORKFLOW_NAME_RE.match(workflow_name):
            raise HTTPException(status_code=400, detail="工作流名称不合法")
        
        workflow_path = workflow_path_from_name(workflow_name)
        if not os.path.exists(workflow_path):
            raise HTTPException(status_code=404, detail="工作流不存在")
        
        # 2. 根据 config 的字段把值映射成 params 节点覆盖
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
        
        # 3. 调用 generate 函数执行工作流
        generate_req = GenerateRequest(
            prompt="",
            workflow_json=workflow_name,
            params=params,
            type="workflow",
            client_id=payload.client_id or CLIENT_ID,
        )
        
        result = generate(generate_req)
        
        if result.get("error"):
            raise HTTPException(status_code=500, detail=result["error"])
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"运行工作流失败: {str(e)}")
```

## 5. 图片处理流程

### 5.1 前端上传图片

**函数**: `uploadCanvasUrlToComfy(url)`

```javascript
async function uploadCanvasUrlToComfy(url) {
    const blob = await fetch(url).then(r => {
        if (!r.ok) throw new Error('图片读取失败');
        return r.blob();
    });
    
    const filename = (url || '').split('/').pop()?.split('?')[0] || `canvas_${Date.now()}.png`;
    const form = new FormData();
    form.append('files', blob, filename);
    
    const data = await fetch('/api/upload', {
        method: 'POST',
        body: form
    }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).detail || '图片上传到 ComfyUI 失败');
        return r.json();
    });
    
    return data.files?.[0]?.comfy_name || filename;
}
```

### 5.2 后端图片同步

`generate` 函数会自动检查目标 ComfyUI 实例是否存在所需图片，如果不存在则从其他实例同步。

## 6. 关键代码位置索引

| 功能 | 文件 | 函数/位置 |
|------|------|-----------|
| 工作流列表加载 | `canvas.html` | `loadConfig()` |
| 添加 ComfyUI 节点 | `canvas.html` | `addComfyNode()` |
| 渲染 ComfyUI 节点 | `canvas.html` | `renderComfyBody()` |
| 工作流选择器 | `canvas.html` | `renderWorkflowSelect()` |
| 参数控件渲染 | `canvas.html` | `renderWorkflowParams()` |
| 执行自定义工作流 | `canvas.html` | `runCustomWorkflow()` |
| 上传图片到 ComfyUI | `canvas.html` | `uploadCanvasUrlToComfy()` |
| 工作流列表 API | `main.py` | `list_workflows()` |
| 工作流详情 API | `main.py` | `get_workflow()` |
| 执行工作流 API | `main.py` | `run_workflow()` |
| 模型定义 | `main.py` | `WorkflowRunRequest` 等 |

## 7. 注意事项

1. **重启后端服务**：修改 `main.py` 后必须重启服务才能生效
2. **缓存刷新**：浏览器缓存可能导致旧版本代码运行，需硬刷新（Ctrl+Shift+R）
3. **版本号更新**：每次修改 `canvas.html` 后需更新 `index.html` 中的版本号
4. **工作流配置**：图片字段必须在 ComfyUI 设置页面正确配置 `node` 和 `input`
5. **BroadcastChannel**：设置页面保存工作流后会广播事件，画布页面需监听并刷新

## 8. 调试技巧

1. **查看工作流列表**：
   ```javascript
   console.log(comfyWorkflows);
   ```

2. **查看工作流缓存**：
   ```javascript
   console.log(comfyWorkflowCache);
   ```

3. **检查 API 响应**：
   ```javascript
   fetch('/api/workflows').then(r => r.json()).then(console.log);
   ```

4. **后端日志**：查看控制台输出的 `generate` 函数执行日志
