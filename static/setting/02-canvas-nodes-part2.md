# 无限画布节点系统技术文档（续）

## 6. MS 生成节点 (ModelScope)

### 功能概述

MS 生成节点通过 ModelScope API 生成图片，支持国内/国外端点自动切换、Token 管理和 LoRA 自动绑定。

### 节点定义

```javascript
{
  type: "generator",
  subtype: "ms",
  width: 380,
  className: "msgen-node",
  ports: {
    inputs: [
      { id: "in-prompt", type: "text", label: "提示词" },
      { id: "in-image", type: "image", label: "参考图" }
    ],
    outputs: [
      { id: "out-image", type: "image", label: "生成图片" }
    ]
  }
}
```

### 核心功能

#### 模型切换

```javascript
// MS 模型标签页
<div class="ms-model-tabs">
  <button class="active" data-model="model-1">模型 1</button>
  <button data-model="model-2">模型 2</button>
  ...
</div>
```

#### Token 管理

```javascript
// 从 API 设置中获取 ModelScope Token
function getMSToken() {
  return apiConfig.providers.find(p => p.id === 'ModelScope')?.key || '';
}

// Token 未设置时提示
if (!getMSToken()) {
  showError('需要 ModelScope Token，请在侧边栏 API Token 中设置');
  return;
}
```

#### 国内/国外端点

```javascript
const endpoints = {
  cn: 'https://dashscope.aliyuncs.com/api/v1',
  global: 'https://dashscope-intl.aliyuncs.com/api/v1'
};

function getMSEndpoint() {
  // 根据网络环境或用户设置选择端点
  return isChinaNetwork() ? endpoints.cn : endpoints.global;
}
```

#### API 调用

```javascript
async function generateMS(node) {
  const prompt = getInputText(node, 'in-prompt');
  const model = node.data.msModel;
  const token = getMSToken();
  
  // 获取 LoRA 配置
  const lora = getLoraForModel(model);
  
  const body = {
    model,
    input: {
      prompt,
      ...(lora && { lora: lora.id })
    },
    parameters: {
      size: node.data.size,
      ...(lora && { lora_strength: node.data.loraStrength })
    }
  };
  
  const response = await fetch('/api/ms/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  
  const data = await response.json();
  return data.output.images;
}
```

### 数据结构

```javascript
{
  type: "generator",
  subtype: "ms",
  x: 900,
  y: 400,
  data: {
    msModel: "stable-diffusion-xl",
    size: "1024x1024",
    loraEnabled: true,
    loraStrength: 1.0
  },
  ports: {
    inputs: [
      { id: "in-prompt", type: "text" },
      { id: "in-image", type: "image" }
    ],
    outputs: [
      { id: "out-image", type: "image" }
    ]
  }
}
```

---

## 7. 视频生成节点

### 功能概述

视频生成节点用于 AI 视频生成，支持视频专用模型和时长、分辨率等参数配置。

### 节点定义

```javascript
{
  type: "video",
  width: 380,
  className: "video-node",
  ports: {
    inputs: [
      { id: "in-prompt", type: "text", label: "提示词" },
      { id: "in-image", type: "image", label: "首帧图片" }
    ],
    outputs: [
      { id: "out-video", type: "video", label: "生成视频" }
    ]
  }
}
```

### 核心功能

#### 视频模型选择

```javascript
// 从 API 设置中获取视频模型列表
const videoModels = apiConfig.videoModels || [];

const modelSelect = document.createElement('select');
videoModels.forEach(model => {
  const opt = document.createElement('option');
  opt.value = model;
  opt.textContent = model;
  modelSelect.appendChild(opt);
});
```

#### 时长和分辨率

```javascript
<div class="gen-settings-row">
  <span class="setting-title">时长</span>
  <select class="setting-input">
    <option value="5">5 秒</option>
    <option value="10">10 秒</option>
    <option value="15">15 秒</option>
  </select>
</div>

<div class="gen-settings-row">
  <span class="setting-title">分辨率</span>
  <select class="setting-input">
    <option value="720p">720p</option>
    <option value="1080p">1080p</option>
  </select>
</div>
```

#### 视频生成

```javascript
async function generateVideo(node) {
  const prompt = getInputText(node, 'in-prompt');
  const image = getInputImage(node, 'in-image');
  const model = node.data.videoModel;
  const duration = node.data.duration;
  const resolution = node.data.resolution;
  
  const response = await fetch('/api/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      image: image?.dataset?.imageData,
      duration,
      resolution
    })
  });
  
  const data = await response.json();
  return data.videoUrl;
}
```

### 数据结构

```javascript
{
  type: "video",
  x: 1100,
  y: 300,
  data: {
    videoModel: "seedance",
    duration: 5,
    resolution: "720p",
    prompt: "一个美丽的日落场景"
  },
  ports: {
    inputs: [
      { id: "in-prompt", type: "text" },
      { id: "in-image", type: "image" }
    ],
    outputs: [
      { id: "out-video", type: "video" }
    ]
  }
}
```

---

## 8. ComfyUI 生成节点

### 功能概述

ComfyUI 生成节点用于连接本地或远程 ComfyUI 服务执行工作流，支持参数注入和 WebSocket 进度追踪。

### 节点定义

```javascript
{
  type: "comfy",
  width: 420,
  height: 460,
  className: "comfy-node",
  ports: {
    inputs: [
      { id: "in-prompt", type: "text", label: "提示词" },
      { id: "in-image", type: "image", label: "参考图" }
    ],
    outputs: [
      { id: "out-image", type: "image", label: "生成图片" }
    ]
  }
}
```

### 核心功能

#### 工作流选择

```javascript
// 从 ComfyUI 设置中获取工作流列表
const workflows = comfyConfig.workflows || [];

const workflowSelect = document.createElement('select');
workflows.forEach(wf => {
  const opt = document.createElement('option');
  opt.value = wf.id;
  opt.textContent = wf.name;
  workflowSelect.appendChild(opt);
});
```

#### 参数注入

```javascript
// 根据工作流的 exposed_inputs 配置生成控件
function renderComfyControls(workflow) {
  const container = document.createElement('div');
  container.className = 'comfy-controls';
  
  workflow.exposed_inputs.forEach(input => {
    const row = document.createElement('div');
    row.className = 'gen-settings-row';
    
    const label = document.createElement('span');
    label.className = 'setting-title';
    label.textContent = input.display_name;
    
    let control;
    switch (input.control_type) {
      case 'text':
        control = createTextInput(input);
        break;
      case 'textarea':
        control = createTextareaInput(input);
        break;
      case 'number':
        control = createNumberInput(input);
        break;
      case 'slider':
        control = createSliderInput(input);
        break;
      case 'dropdown':
        control = createDropdownInput(input);
        break;
      case 'image':
        control = createImageInput(input);
        break;
      case 'boolean':
        control = createBooleanInput(input);
        break;
    }
    
    row.appendChild(label);
    row.appendChild(control);
    container.appendChild(row);
  });
  
  return container;
}
```

#### 工作流执行

```javascript
async function runComfyWorkflow(node) {
  const workflowId = node.data.workflowId;
  const workflow = comfyConfig.workflows.find(w => w.id === workflowId);
  
  // 收集控件值
  const params = collectComfyParams(node);
  
  // 合并参数到工作流
  const workflowJson = mergeWorkflowParams(workflow.json, params);
  
  // 发送到 ComfyUI
  const response = await fetch('/api/comfy/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflow: workflowJson,
      instance: comfyConfig.primaryInstance
    })
  });
  
  const data = await response.json();
  const promptId = data.prompt_id;
  
  // WebSocket 监听进度
  return await waitForCompletion(promptId);
}
```

#### WebSocket 进度追踪

```javascript
function waitForCompletion(promptId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8188/ws');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        updateProgress(node, data.data.value, data.data.max);
      }
      
      if (data.type === 'executed' && data.data.prompt_id === promptId) {
        ws.close();
        resolve(data.data.output);
      }
      
      if (data.type === 'execution_error') {
        ws.close();
        reject(new Error('ComfyUI 执行失败'));
      }
    };
  });
}
```

### 数据结构

```javascript
{
  type: "comfy",
  x: 1000,
  y: 500,
  data: {
    workflowId: "workflow-123",
    params: {
      "3.text": "a beautiful sunset",
      "5.seed": 12345
    }
  },
  ports: {
    inputs: [
      { id: "in-prompt", type: "text" },
      { id: "in-image", type: "image" }
    ],
    outputs: [
      { id: "out-image", type: "image" }
    ]
  }
}
```

---

## 9. Output 节点

### 功能概述

Output 节点用于展示生成结果图片，支持批量下载、分组操作和历史记录关联。

### 节点定义

```javascript
{
  type: "output",
  width: 460,
  className: "output-node",
  cssVars: {
    '--output-thumb-max': '180px',
    '--output-thumb-min': '150px'
  },
  ports: {
    inputs: [
      { id: "in-image", type: "image", label: "输入图片" }
    ],
    outputs: []
  }
}
```

### 核心功能

#### 图片展示

```javascript
// 网格布局展示多张图片
<div class="output-grid">
  <div class="output-img-wrap" onclick="openLightbox(image)">
    <img src="data:image/png;base64,..." alt="生成结果">
  </div>
  ...
</div>
```

#### 图片灯箱

```javascript
function openLightbox(imageElement) {
  const lightbox = document.getElementById('image-lightbox');
  const img = document.getElementById('image-lightbox-img');
  
  img.src = imageElement.src;
  lightbox.classList.add('open');
  
  lightbox.onclick = () => lightbox.classList.remove('open');
}
```

#### 批量下载

```javascript
async function downloadAllImages(outputNode) {
  const images = outputNode.querySelectorAll('.output-img-wrap img');
  
  if (images.length === 0) {
    alert('没有可下载的本地图片');
    return;
  }
  
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const link = document.createElement('a');
    link.download = `output_${i + 1}.png`;
    link.href = img.src;
    link.click();
    
    // 延迟避免浏览器阻止多次下载
    await sleep(500);
  }
}
```

#### 转为输入组

```javascript
function convertToInputGroup(outputNode) {
  // 获取所有输出图片
  const images = getOutputImages(outputNode);
  
  // 创建新的输入组
  const groupNode = createGroupNode({
    type: 'input-group',
    images
  });
  
  // 添加到画布
  addNodeToCanvas(groupNode);
}
```

### 数据结构

```javascript
{
  type: "output",
  x: 1300,
  y: 350,
  data: {
    images: [
      { id: "img-1", src: "data:image/png;base64,...", timestamp: 1234567890 },
      { id: "img-2", src: "data:image/png;base64,...", timestamp: 1234567891 }
    ],
    historyTimestamp: 1234567890
  },
  ports: {
    inputs: [
      { id: "in-image", type: "image" }
    ]
  }
}
```

---

## 10. 分组功能 (Group)

### 功能概述

分组功能允许用户将多个节点（图片、提示词）组合成一个逻辑单元，便于统一管理和连接。

### 核心功能

#### 创建分组

```javascript
function createGroupNode(options = {}) {
  return {
    type: "group",
    x: options.x || 500,
    y: options.y || 300,
    width: 500,
    height: 400,
    data: {
      title: options.title || '分组',
      nodes: options.nodes || [],  // 组内节点 ID 列表
      collapsed: false             // 是否折叠
    },
    ports: {
      inputs: [
        { id: "in-images", type: "image", label: "图片" },
        { id: "in-prompts", type: "text", label: "提示词" }
      ],
      outputs: [
        { id: "out-images", type: "image", label: "输出图片" },
        { id: "out-prompts", type: "text", label: "输出提示词" }
      ]
    }
  };
}
```

#### 拖放成组

```javascript
// 拖放图片到分组区域
groupNode.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer.files;
  
  for (let file of files) {
    if (file.type.startsWith('image/')) {
      const imageNode = createImageNode(file);
      addNodeToGroup(groupNode, imageNode);
    }
  }
});
```

#### 连接传递

```javascript
// 分组输入连接
function onGroupInputConnect(groupNode, sourceNode) {
  if (sourceNode.type === 'image') {
    groupNode.data.nodes.push(sourceNode.id);
    updateGroupPorts(groupNode);
  }
}

// 分组输出连接
function onGroupOutputConnect(groupNode, targetNode) {
  // 将组内所有节点连接到目标
  groupNode.data.nodes.forEach(nodeId => {
    const node = getNodeById(nodeId);
    createConnection(node.outputs[0], targetNode.inputs[0]);
  });
}
```

#### 视觉表现

```css
.group-node {
  position: absolute;
  border: 2px dashed var(--line);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.5);
}

.group-node.collapsed .group-body {
  display: none;
}

.group-header {
  padding: 12px;
  cursor: move;
}

.group-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
}
```

### 数据结构

```javascript
{
  type: "group",
  x: 600,
  y: 400,
  width: 500,
  height: 400,
  data: {
    title: "输入图片组",
    nodes: ["node-1", "node-2", "node-3"],
    collapsed: false
  },
  ports: {
    inputs: [
      { id: "in-images", type: "image" }
    ],
    outputs: [
      { id: "out-images", type: "image" }
    ]
  }
}
```

---

## 11. 日志系统 (Logs)

### 功能概述

日志系统记录画布上所有生成操作的日志，包括成功、失败和进度信息，支持时间戳追踪和日志过滤。

### 核心功能

#### 日志面板

```javascript
// 日志面板 HTML 结构
<div class="logs-panel">
  <div class="logs-header">
    <h3>生成日志</h3>
    <div class="logs-filters">
      <button class="filter-btn active" data-type="all">全部</button>
      <button class="filter-btn" data-type="success">成功</button>
      <button class="filter-btn" data-type="error">失败</button>
    </div>
  </div>
  <div class="logs-list">
    <!-- 日志条目 -->
  </div>
</div>
```

#### 日志记录

```javascript
const logs = [];

function addLog(entry) {
  const log = {
    id: generateUUID(),
    timestamp: Date.now(),
    type: entry.type,  // 'success' | 'error' | 'progress'
    nodeId: entry.nodeId,
    nodeType: entry.nodeType,
    message: entry.message,
    data: entry.data
  };
  
  logs.unshift(log); // 最新日志在前
  renderLogs();
}
```

#### 日志渲染

```javascript
function renderLogs(filter = 'all') {
  const logsList = document.querySelector('.logs-list');
  logsList.innerHTML = '';
  
  const filteredLogs = filter === 'all' 
    ? logs 
    : logs.filter(log => log.type === filter);
  
  filteredLogs.forEach(log => {
    const item = document.createElement('div');
    item.className = `log-item log-${log.type}`;
    
    item.innerHTML = `
      <div class="log-time">${formatTime(log.timestamp)}</div>
      <div class="log-node-type">${log.nodeType}</div>
      <div class="log-message">${log.message}</div>
      ${log.data?.error ? `<div class="log-error">${log.data.error}</div>` : ''}
    `;
    
    logsList.appendChild(item);
  });
}
```

#### 日志过滤

```javascript
// 过滤按钮点击
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderLogs(btn.dataset.type);
  });
});
```

#### 日志类型

```javascript
// 成功日志
addLog({
  type: 'success',
  nodeId: 'node-123',
  nodeType: 'API 生成',
  message: '生成成功，输出 4 张图片',
  data: { imageCount: 4 }
});

// 失败日志
addLog({
  type: 'error',
  nodeId: 'node-456',
  nodeType: 'ComfyUI 生成',
  message: '生成失败',
  data: { error: 'Connection refused' }
});

// 进度日志
addLog({
  type: 'progress',
  nodeId: 'node-789',
  nodeType: '循环',
  message: '第 2/4 轮',
  data: { current: 2, total: 4 }
});
```

### 数据结构

```javascript
{
  id: "log-uuid",
  timestamp: 1234567890,
  type: "success",  // success | error | progress
  nodeId: "node-123",
  nodeType: "API 生成",
  message: "生成成功，输出 4 张图片",
  data: {
    imageCount: 4,
    duration: 3500,
    model: "stable-diffusion-xl"
  }
}
```

### 错误处理

```javascript
// 日志记录失败（不影响主流程）
try {
  addLog(entry);
} catch (e) {
  console.error('日志记录失败:', e);
}

// 日志数量过多时清理
if (logs.length > 1000) {
  logs.splice(1000);
}
```

---

## 画布交互系统

### 节点拖拽

```javascript
// 节点拖拽逻辑
let draggingNode = null;
let dragOffset = { x: 0, y: 0 };

node.addEventListener('mousedown', (e) => {
  if (e.target.closest('.resize-handle')) return;
  if (e.target.closest('.port')) return;
  
  draggingNode = node;
  dragOffset = {
    x: e.clientX - node.offsetLeft,
    y: e.clientY - node.offsetTop
  };
  
  document.body.classList.add('canvas-node-drag');
  e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
  if (!draggingNode) return;
  
  const worldPos = screenToWorld(e.clientX, e.clientY);
  draggingNode.x = worldPos.x - dragOffset.x;
  draggingNode.y = worldPos.y - dragOffset.y;
  
  updateNodePosition(draggingNode);
  updateConnections();
});

window.addEventListener('mouseup', () => {
  if (draggingNode) {
    draggingNode = null;
    document.body.classList.remove('canvas-node-drag');
    markDirty();
  }
});
```

### 多选框选

```javascript
// 框选逻辑
let selecting = false;
let selectRect = null;
let selectedNodes = new Set();

board.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('.node')) return;
  
  selecting = true;
  selectRect = createSelectRect(e.clientX, e.clientY);
  document.body.classList.add('canvas-selecting');
});

window.addEventListener('mousemove', (e) => {
  if (!selecting) return;
  
  updateSelectRect(e.clientX, e.clientY);
  
  // 检测相交节点
  const rect = getSelectRectBounds();
  document.querySelectorAll('.node').forEach(node => {
    const nodeRect = getNodeBounds(node);
    if (intersects(rect, nodeRect)) {
      selectedNodes.add(node.id);
      node.classList.add('selected');
    }
  });
});

window.addEventListener('mouseup', () => {
  if (selecting) {
    selecting = false;
    removeSelectRect();
    document.body.classList.remove('canvas-selecting');
  }
});
```

### 连接线渲染

```javascript
// SVG 贝塞尔曲线绘制
function renderConnection(from, to) {
  const fromPos = getPortPosition(from);
  const toPos = getPortPosition(to);
  
  const dx = Math.abs(toPos.x - fromPos.x);
  const cp1x = fromPos.x + dx * 0.4;
  const cp2x = toPos.x - dx * 0.4;
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `
    M ${fromPos.x} ${fromPos.y}
    C ${cp1x} ${fromPos.y}, ${cp2x} ${toPos.y}, ${toPos.x} ${toPos.y}
  `);
  path.setAttribute('class', 'link');
  
  return path;
}
```

### 一键运行级联

```javascript
// 级联执行
async function cascadeRun(startNode) {
  // 找到所有链尾节点（没有输出连接的节点）
  const endNodes = findEndNodes(startNode);
  
  for (const node of endNodes) {
    await runNode(node);
    updateNodeStatus(node, 'done');
  }
}

// 节点状态徽章
function updateNodeStatus(node, status) {
  const badge = node.querySelector('.node-run-status');
  badge.className = `node-run-status ${status}`;
  
  if (status === 'running') {
    badge.innerHTML = '<span class="dot"></span>运行中';
  } else if (status === 'done') {
    badge.textContent = '完成';
  } else if (status === 'failed') {
    badge.textContent = '失败';
  }
}
```

## 数据持久化

### 画布保存

```javascript
async function saveCanvas() {
  const canvasData = {
    id: canvasId,
    name: canvasName,
    nodes: getAllNodes(),
    connections: getAllConnections(),
    viewport: {
      pan: state.pan,
      zoom: state.zoom
    },
    updatedAt: Date.now()
  };
  
  await fetch('/api/canvases/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(canvasData)
  });
}
```

### 画布加载

```javascript
async function loadCanvas(canvasId) {
  const response = await fetch(`/api/canvases/${canvasId}`);
  const data = await response.json();
  
  // 恢复节点
  data.nodes.forEach(node => addNodeToCanvas(node));
  
  // 恢复连接
  data.connections.forEach(conn => createConnection(conn.from, conn.to));
  
  // 恢复视口
  state.pan = data.viewport.pan;
  state.zoom = data.viewport.zoom;
  updateViewport();
}
```

## 性能优化

### 虚拟渲染

```javascript
// 仅渲染视口内的节点
function renderVisibleNodes() {
  const viewport = getViewportBounds();
  
  document.querySelectorAll('.node').forEach(node => {
    if (isInViewport(node, viewport)) {
      node.style.display = '';
    } else {
      node.style.display = 'none';
    }
  });
}
```

### 连接延迟更新

```javascript
// 拖拽过程中使用 requestAnimationFrame
let rafId = null;

function scheduleUpdateConnections() {
  if (rafId) return;
  
  rafId = requestAnimationFrame(() => {
    updateConnections();
    rafId = null;
  });
}
```

## 已知问题

1. **大量节点性能**：超过 100 个节点时拖拽和缩放会卡顿
2. **连接交叉**：复杂工作流中连接线容易交叉混乱
3. **撤销/重做**：尚未实现完整的撤销/重做功能
4. **移动端适配**：触控操作支持不完善

## 未来改进建议

1. **节点搜索**：快速搜索和定位节点
2. **模板系统**：预置常用工作流模板
3. **协作编辑**：多人实时协作
4. **版本管理**：画布历史版本和回滚
5. **性能优化**：虚拟渲染、WebWorker 计算
