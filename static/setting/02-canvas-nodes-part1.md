# 无限画布节点系统技术文档

## 画布架构概述

无限画布是一个基于节点的可视化工作流编辑器，用户通过拖拽节点、连接端口来构建 AI 图像/视频生成的完整流程。画布支持无限平移、缩放，以及多选、复制、粘贴等操作。

### 核心职责

- 节点的创建、渲染、交互
- 节点间的数据连接和传递
- 工作流的执行和结果展示
- 画布状态的保存和恢复

### 代码位置

- **主文件：** [canvas.html](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html)
- **相关模块：**
  - [theme.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/theme.js) - 主题切换
  - [i18n.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/i18n.js) - 国际化
  - [image-preview.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/image-preview.js) - 图片预览
  - [history-bulk-manager.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/history-bulk-manager.js) - 历史管理

## 架构设计

### 画布渲染架构

```
┌─────────────────────────────────────────────────────┐
│  .shell (视口容器)                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  .topbar (顶部工具栏)                          │    │
│  │  - 画布名称/图标                               │    │
│  │  - 工具按钮 (循环/分组/日志)                    │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │  .board (画布面板 - 可平移缩放)                │    │
│  │  ┌─────────────────────────────────────┐     │    │
│  │  │  .world (世界坐标系 6000x4000)       │     │    │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐           │     │    │
│  │  │  │Node │ │Node │ │Node │ ...       │     │    │
│  │  │  └─────┘ └─────┘ └─────┘           │     │    │
│  │  │                                     │     │    │
│  │  │  SVG Links (连接线)                  │     │    │
│  │  └─────────────────────────────────────┘     │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 坐标系系统

```javascript
// 画布平移缩放状态
const state = {
  pan: { x: 0, y: 0 },      // 平移偏移
  zoom: 1,                   // 缩放比例
  world: {                   // 世界范围
    width: 6000,
    height: 4000
  }
};

// 视口坐标 → 世界坐标转换
function screenToWorld(sx, sy) {
  return {
    x: (sx - state.pan.x) / state.zoom,
    y: (sy - state.pan.y) / state.zoom
  };
}

// 世界坐标 → 视口坐标转换
function worldToScreen(wx, wy) {
  return {
    x: wx * state.zoom + state.pan.x,
    y: wy * state.zoom + state.pan.y
  };
}
```

### 节点数据结构

```javascript
{
  id: "node-uuid",              // 节点唯一标识
  type: "image|prompt|loop|...", // 节点类型
  x: 100,                       // 世界坐标 X
  y: 200,                       // 世界坐标 Y
  width: 260,                   // 节点宽度
  height: 300,                  // 节点高度
  data: {...},                  // 节点特有数据
  ports: {                      // 端口定义
    inputs: [                   // 输入端口
      { id: "in-1", type: "image", label: "图片" }
    ],
    outputs: [                  // 输出端口
      { id: "out-1", type: "image", label: "输出" }
    ]
  }
}
```

### 连接数据结构

```javascript
{
  id: "link-uuid",              // 连接唯一标识
  from: {                       // 源端口
    nodeId: "node-1",
    portId: "out-1"
  },
  to: {                         // 目标端口
    nodeId: "node-2",
    portId: "in-1"
  }
}
```

## 节点类型详解

### 1. 图片节点 (Image Node)

#### 功能概述

图片节点用于导入和管理参考图片，支持拖放、粘贴、裁剪、遮罩和画笔编辑。图片可以作为图生图、局部重绘等功能的输入源。

#### 代码位置

[canvas.html - Image Node 样式定义](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html#L173-L195)

#### 节点定义

```javascript
{
  type: "image",
  width: 260,
  minWidth: 220,
  minHeight: 96,
  ports: {
    inputs: [],                 // 无输入端口
    outputs: [
      { id: "out-image", type: "image", label: "" }
    ]
  }
}
```

#### 核心功能

##### 图片导入

**拖放导入：**
```javascript
// 拖放区域监听
node.addEventListener('dragover', (e) => {
  e.preventDefault();
  node.querySelector('.blank-image').classList.add('drag-over');
});

node.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type.startsWith('image/')) {
    loadImageFile(files[0]);
  }
});
```

**粘贴导入：**
```javascript
document.addEventListener('paste', (e) => {
  const items = e.clipboardData.items;
  for (let item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      loadImageFile(blob);
      break;
    }
  }
});
```

**点击上传：**
```javascript
function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    node.dataset.imageData = e.target.result; // base64
    renderImagePreview();
  };
  reader.readAsDataURL(file);
}
```

##### 图片预览和缩放

使用 [image-preview.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/image-preview.js) 模块：

```javascript
// 绑定图片预览
const preview = StudioImagePreview.attach(container, {
  img: imageElement,
  minZoom: 1,
  maxZoom: 6
});

// 功能：
// - 鼠标滚轮缩放（以鼠标位置为中心）
// - 拖拽平移（缩放后）
// - 双击复位
```

##### 图片编辑模式

**裁剪模式：**
```javascript
function enterCropMode(imageNode) {
  // 显示裁剪框
  const cropOverlay = createCropOverlay();
  imageNode.appendChild(cropOverlay);
  
  // 拖拽裁剪框
  // 拖拽右下角调整大小
  // 应用裁剪 → 生成新图片节点
}
```

**遮罩模式：**
```javascript
function enterMaskMode(imageNode) {
  // 创建遮罩画布
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = image.naturalWidth;
  maskCanvas.height = image.naturalHeight;
  
  // 白色画笔绘制遮罩区域
  // 保存为 base64 遮罩图片
  // 生成新的遮罩图片节点
}
```

**画笔模式：**
```javascript
function enterBrushMode(imageNode) {
  // 创建绘图图层
  // 直接在图片上绘制
  // 应用后生成新图片节点
}
```

**宫格切分模式：**
```javascript
function enterGridMode(imageNode) {
  // 横向/竖向切分线
  // 点击图片放置切分线
  // 按切分线分割图片（扣除间隔）
  // 生成多个 Output 节点
}
```

#### 数据结构

```javascript
{
  type: "image",
  x: 100,
  y: 200,
  data: {
    imageData: "data:image/png;base64,...",  // base64 图片数据
    caption: "参考图 1",                      // 图片标题
    originalWidth: 1024,                     // 原始宽度
    originalHeight: 768,                     // 原始高度
    editMode: null                           // crop/mask/brush/grid
  },
  ports: {
    outputs: [
      { id: "out-image", type: "image" }
    ]
  }
}
```

#### 错误处理

```javascript
// 图片加载失败
img.onerror = () => {
  node.querySelector('.image-caption').textContent = '图片加载失败';
  node.classList.add('error');
};

// 文件过大
if (file.size > 10 * 1024 * 1024) {
  alert('图片文件过大，请选择小于 10MB 的图片');
  return;
}

// 格式不支持
if (!file.type.startsWith('image/')) {
  alert('请选择图片文件');
  return;
}
```

---

### 2. 提示词节点 (Prompt Node)

#### 功能概述

提示词节点用于输入和管理 AI 生成的文本提示词，支持可变提示词和固定提示词，可在循环节点中动态插入计数、总数和进度标记。

#### 代码位置

[canvas.html - Prompt Node 样式定义](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html#L196-L210)

#### 节点定义

```javascript
{
  type: "prompt",
  width: 310,
  ports: {
    inputs: [],
    outputs: [
      { id: "out-text", type: "text", label: "" }
    ]
  }
}
```

#### 核心功能

##### 提示词输入

```javascript
const textarea = document.createElement('textarea');
textarea.placeholder = '输入提示词...';
textarea.value = node.data.text || '';

textarea.addEventListener('input', (e) => {
  node.data.text = e.target.value;
  updateCharCount();
  markDirty(); // 标记需要保存
});
```

##### 字符计数

```javascript
function updateCharCount() {
  const len = textarea.value.length;
  const maxLen = 4000; // OpenAI 限制
  counter.textContent = `${len}/${maxLen}`;
  
  if (len > maxLen) {
    counter.classList.add('over');
  } else {
    counter.classList.remove('over');
  }
}
```

##### 标记插入

```javascript
// 循环节点中的标记按钮
const tokens = [
  { label: '[计数]', value: '[计数]' },    // 当前轮次
  { label: '[总数]', value: '[总数]' },    // 总轮次
  { label: '[进度]', value: '[进度]' }     // 进度百分比
];

function insertToken(token) {
  const pos = textarea.selectionStart;
  const text = textarea.value;
  textarea.value = text.slice(0, pos) + token + text.slice(pos);
  textarea.focus();
}
```

##### 提示词变量替换

```javascript
function resolvePrompt(prompt, loopState) {
  return prompt
    .replace(/\[计数\]/g, loopState.current)
    .replace(/\[总数\]/g, loopState.total)
    .replace(/\[进度\]/g, `${Math.round(loopState.current / loopState.total * 100)}%`);
}
```

#### 数据结构

```javascript
{
  type: "prompt",
  x: 400,
  y: 150,
  data: {
    text: "一个美丽的日落，金色阳光洒在海面上",
    isVariable: true  // 是否可变提示词
  },
  ports: {
    outputs: [
      { id: "out-text", type: "text" }
    ]
  }
}
```

---

### 3. 循环节点 (Loop Node)

#### 功能概述

循环节点用于批量执行工作流，控制图片和提示词的循环输出。支持串行和并发两种模式，可配置循环次数和批次大小。

#### 代码位置

[canvas.html - Loop Node 样式定义](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html#L211-L270)

#### 节点定义

```javascript
{
  type: "loop",
  width: 336,
  ports: {
    inputs: [
      { id: "in-image", type: "image", label: "图片输入" },
      { id: "in-prompt", type: "text", label: "提示词输入" }
    ],
    outputs: [
      { id: "out-image", type: "image", label: "循环图片" },
      { id: "out-prompt", type: "text", label: "循环提示词" }
    ]
  }
}
```

#### 核心功能

##### 循环次数配置

```javascript
<div class="loop-count-row">
  <div class="loop-count-group">
    <span class="loop-count-label">循环次数</span>
    <input type="number" class="loop-count-input" 
           value="4" min="1" max="100">
  </div>
</div>
```

##### 循环模式

```javascript
// 串行模式：逐个执行
// 并发模式：批量执行

<div class="loop-mode">
  <button class="active" data-mode="serial">串行</button>
  <button data-mode="parallel">并发</button>
</div>
```

##### 图片和提示词切换

```javascript
<div class="loop-toggle-row">
  <button class="loop-toggle active" data-type="prompt">提示词</button>
  <button class="loop-toggle" data-type="image">图片</button>
</div>
```

##### 起始计数

```javascript
<div class="loop-start-row">
  <span class="loop-count-label">起始计数</span>
  <input type="number" value="1" min="1">
</div>
```

##### 批次大小（并发模式）

```javascript
<div class="loop-batch-row">
  <span class="loop-count-label">批次大小</span>
  <input type="number" value="4" min="1" max="10">
</div>
```

##### 循环执行逻辑

```javascript
async function executeLoop(loopNode) {
  const config = {
    count: parseInt(loopNode.querySelector('.loop-count-input').value),
    mode: loopNode.querySelector('.loop-toggle.active').dataset.type,
    startFrom: parseInt(loopNode.querySelector('.loop-start-row input').value),
    batchSize: parseInt(loopNode.querySelector('.loop-batch-row input').value) || 4
  };
  
  const inputs = getConnectedInputs(loopNode);
  
  for (let i = config.startFrom; i < config.count; i++) {
    // 更新标记
    const loopState = {
      current: i + 1,
      total: config.count
    };
    
    // 替换提示词中的标记
    if (config.mode === 'prompt') {
      const resolvedPrompt = resolvePrompt(inputs.prompt, loopState);
      yield { type: 'prompt', value: resolvedPrompt };
    }
    
    // 输出图片（并发模式需要分批）
    if (config.mode === 'image') {
      const images = inputs.images || [];
      if (images.length > 0) {
        const imageIndex = (i - config.startFrom) % images.length;
        yield { type: 'image', value: images[imageIndex] };
      }
    }
    
    // 更新进度
    updateProgress(loopNode, i + 1, config.count);
  }
}
```

##### 输出计算

```javascript
function calculateOutputCount(loopNode) {
  const count = parseInt(loopNode.querySelector('.loop-count-input').value);
  const images = getConnectedImages(loopNode);
  
  if (images.length === 0) {
    return count; // 仅提示词循环
  }
  
  return count * images.length; // 图片 x 提示词组合
}
```

#### 数据结构

```javascript
{
  type: "loop",
  x: 500,
  y: 300,
  data: {
    loopCount: 4,
    mode: "serial",        // serial | parallel
    inputType: "prompt",   // prompt | image
    startFrom: 1,
    batchSize: 4,
    variablePrompt: "现在生成第[计数]个卖点",
    fixedPrompt: "每一轮都附加的文本"
  },
  ports: {
    inputs: [
      { id: "in-image", type: "image" },
      { id: "in-prompt", type: "text" }
    ],
    outputs: [
      { id: "out-image", type: "image" },
      { id: "out-prompt", type: "text" }
    ]
  }
}
```

#### 错误处理

```javascript
// 循环次数无效
if (config.count < 1) {
  showError('循环次数必须大于 0');
  return;
}

// 没有连接输入
if (!inputs.prompt && !inputs.images) {
  showError('请连接图片或提示词到循环节点');
  return;
}

// 并发模式批次过大
if (config.mode === 'parallel' && config.batchSize > 10) {
  showError('并发批次不能超过 10');
  return;
}
```

---

### 4. LLM 节点

#### 功能概述

LLM 节点用于调用聊天模型处理提示词，支持自定义系统提示词和聊天交互，可连接到生成节点作为输入。

#### 代码位置

[canvas.html - LLM Node 相关样式](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html#L300-L400)

#### 节点定义

```javascript
{
  type: "llm",
  width: 380,
  height: 420,
  ports: {
    inputs: [
      { id: "in-text", type: "text", label: "输入文本" }
    ],
    outputs: [
      { id: "out-text", type: "text", label: "输出文本" }
    ]
  }
}
```

#### 核心功能

##### 提供商选择

```javascript
<div class="llm-provider">
  <button class="active" data-provider="api">API</button>
  <button data-provider="ms">ModelScope</button>
</div>
```

##### 系统提示词

```javascript
const systemPrompt = document.createElement('textarea');
systemPrompt.placeholder = '系统提示词...';
systemPrompt.value = node.data.systemPrompt || '你是一个有用的助手';
```

##### 聊天模式

```javascript
// 聊天日志区域
const chatLog = document.createElement('div');
chatLog.className = 'llm-chat-log';

// 输入框
const input = document.createElement('input');
input.placeholder = '输入消息...';

// 发送按钮
const sendBtn = document.createElement('button');
sendBtn.textContent = '发送';
```

##### API 调用

```javascript
async function callLLM(node, message) {
  const provider = node.data.provider; // 'api' | 'ms'
  const model = node.data.model;
  const systemPrompt = node.data.systemPrompt;
  
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ]
    })
  });
  
  const data = await response.json();
  return data.choices[0].message.content;
}
```

##### 连接到生成节点

```javascript
// LLM 输出连接到 API/MS 生成节点
// 生成节点使用 LLM 的输出作为提示词

function onLLROutputConnect(llmNode, genNode) {
  // 当 LLM 生成文本时，自动传递给连接的生成节点
  genNode.setInput('prompt', llmNode.data.output);
}
```

#### 数据结构

```javascript
{
  type: "llm",
  x: 700,
  y: 200,
  data: {
    provider: "api",
    model: "gpt-4",
    systemPrompt: "你是一个创意写作助手",
    chatHistory: [
      { role: "user", content: "帮我写一个提示词" },
      { role: "assistant", content: "一个美丽的日落..." }
    ],
    output: "一个美丽的日落，金色阳光..."
  },
  ports: {
    inputs: [
      { id: "in-text", type: "text" }
    ],
    outputs: [
      { id: "out-text", type: "text" }
    ]
  }
}
```

#### 错误处理

```javascript
// API 调用失败
try {
  const result = await callLLM(node, message);
} catch (e) {
  showError('LLM 调用失败：' + e.message);
  node.classList.add('error');
}

// 没有配置模型
if (!node.data.model) {
  showError('请在 API 设置中选择聊天模型');
  return;
}
```

---

### 5. API 生成节点

#### 功能概述

API 生成节点通过 OpenAI 兼容 API 生成图片，支持多种模型、尺寸比例和 LoRA 绑定。

#### 代码位置

[canvas.html - Generator Node 样式](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/canvas.html#L271-L350)

#### 节点定义

```javascript
{
  type: "generator",
  subtype: "api",  // api | ms | comfy | video
  width: 380,
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

#### 核心功能

##### 模型选择

```javascript
// 从 API 设置中拉取图像模型列表
const modelSelect = document.createElement('select');
modelSelect.className = 'setting-input';
apiConfig.imageModels.forEach(model => {
  const opt = document.createElement('option');
  opt.value = model;
  opt.textContent = model;
  modelSelect.appendChild(opt);
});
```

##### 尺寸比例

```javascript
const ratios = [
  { label: '1:1', value: '1024x1024' },
  { label: '2:3', value: '768x1152' },
  { label: '3:2', value: '1152x768' },
  { label: '9:16', value: '720x1280' },
  { label: '16:9', value: '1280x720' },
  { label: '自定义', value: 'custom' }
];

const ratioSelect = document.createElement('select');
ratios.forEach(r => {
  const opt = document.createElement('option');
  opt.value = r.value;
  opt.textContent = r.label;
  ratioSelect.appendChild(opt);
});
```

##### LoRA 配置

```javascript
// LoRA 开关和强度
<div class="gen-settings-row">
  <label class="setting-check">
    <input type="checkbox" id="lora-toggle">
    <span>启用 LoRA</span>
  </label>
  <input type="range" class="canvas-range" id="lora-strength" 
         min="0" max="2" step="0.1" value="1">
  <span id="lora-strength-label">1.0</span>
</div>

// 从 API 设置中获取当前模型的 LoRA
function getLoraForModel(modelName) {
  const loraConfig = apiConfig.loras[modelName];
  if (!loraConfig) return null;
  
  return {
    id: loraConfig.id,
    strength: loraConfig.defaultStrength
  };
}
```

##### 生成数量

```javascript
<div class="gen-count-row">
  <span class="gen-count-label">数量</span>
  <div class="gen-stepper">
    <button class="gen-step-btn" onclick="decreaseCount()">-</button>
    <input type="number" class="gen-count-input" value="1" min="1" max="10">
    <button class="gen-step-btn" onclick="increaseCount()">+</button>
  </div>
</div>
```

##### API 调用

```javascript
async function generateImage(node) {
  const prompt = getInputText(node, 'in-prompt');
  const model = node.data.model;
  const size = node.data.size;
  const lora = node.data.loraEnabled ? {
    id: getLoraForModel(model).id,
    strength: node.data.loraStrength
  } : null;
  
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: node.data.provider,
      model,
      prompt,
      size,
      lora,
      count: node.data.count
    })
  });
  
  const data = await response.json();
  return data.images; // base64 数组
}
```

##### 参考图处理

```javascript
// 图生图模式
if (inputImage) {
  body.image = inputImage.dataset.imageData;
  body.mode = 'img2img';
  body.strength = node.data.img2imgStrength || 0.75;
}
```

#### 数据结构

```javascript
{
  type: "generator",
  subtype: "api",
  x: 900,
  y: 250,
  data: {
    provider: "ModelScope",
    model: "stable-diffusion-xl",
    size: "1024x1024",
    count: 1,
    loraEnabled: true,
    loraStrength: 1.0,
    img2imgStrength: 0.75
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

#### 错误处理

```javascript
// API 调用失败
if (!response.ok) {
  const error = await response.json();
  showError('API 生成失败：' + error.message);
  
  // 显示重试栏
  showRetryBar(node, error.message);
}

// 没有可用模型
if (apiConfig.imageModels.length === 0) {
  showError('暂无可用模型，请在 API 设置中添加');
  return;
}

// LoRA 未绑定
if (node.data.loraEnabled && !getLoraForModel(node.data.model)) {
  showError('当前模型没有可用 LoRA');
  return;
}
```

---

由于文档内容非常多，我将分成多个文件继续编写。让我先完成这个文件的第一部分，然后继续补充其他节点类型。
