# ComfyUI 设置模块技术文档

## 功能概述

ComfyUI 设置模块用于管理和配置 ComfyUI 工作流，允许用户上传 API 格式的工作流 JSON，选择要暴露给无限画布的节点参数，并自定义控件类型。该模块提供了完整的工作流编辑、预览和测试功能。

**核心职责：**
- 管理多个 ComfyUI 后端实例
- 工作流 JSON 的上传、解析和可视化
- 节点参数暴露配置
- 实时预览画布节点外观
- 工作流测试运行

## 代码位置

- **主文件：** [comfyui-settings.html](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/comfyui-settings.html)
- **相关后端 API：** [main.py](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/main.py) 中的 ComfyUI 代理端点

## 架构设计

### 数据流架构

```
用户操作 → UI 事件处理 → 配置更新 → localStorage 持久化
                                    ↓
                          同步到 canvas.html 的 Comfy 节点
                                    ↓
                          后端代理 → ComfyUI 服务
```

### 三栏布局设计

```
┌──────────────────────────────────────────────────────────────┐
│  左侧边栏              │  中间内容区    │  右侧预览           │
│  - ComfyUI 实例管理    │  - 工作流图    │  - 节点控件预览     │
│  - 工作流列表          │  - 节点列表    │  - 参数编辑         │
│  - 上传按钮            │  - 配置面板    │  - 运行测试         │
└──────────────────────────────────────────────────────────────┘
```

## 核心数据结构

### ComfyUI 实例配置

```javascript
// 存储在 localStorage
{
  comfyui_instances: [
    {
      id: "unique-id",           // 实例唯一标识
      host: "127.0.0.1:8188",   // ComfyUI 服务地址
      name: "本地 ComfyUI",      // 显示名称
      is_primary: true           // 是否为主实例
    }
  ],
  comfyui_workflows: {
    "workflow-id": {
      id: "workflow-id",
      name: "工作流名称",
      json: {...},               // 完整的工作流 JSON
      exposed_inputs: [          // 暴露的输入配置
        {
          node_id: "3",
          input_key: "inputs.text",
          display_name: "提示词",
          control_type: "textarea",  // text/textarea/number/slider/dropdown/image/boolean
          default_value: "",
          options: [],           // dropdown 选项
          min: 0,                // number/slider 最小值
          max: 100,              // number/slider 最大值
          step: 1                // number/slider 步长
        }
      ]
    }
  }
}
```

### 工作流 JSON 结构

```javascript
{
  "1": {  // 节点 ID
    "class_type": "CLIPTextEncode",  // 节点类型
    "inputs": {
      "text": "a beautiful sunset",
      "clip": ["4", 1]  // [节点ID, 输出索引]
    }
  },
  "2": {
    "class_type": "KSampler",
    "inputs": {
      "model": ["5", 0],
      "seed": 12345,
      "steps": 20,
      "cfg": 7.5
    }
  }
}
```

## 核心函数说明

### 1. ComfyUI 实例管理

#### `addComfyInstance()`
- **功能：** 添加新的 ComfyUI 后端实例
- **参数：** 无（通过弹窗输入）
- **返回：** 新实例对象
- **逻辑：**
  1. 弹出输入框获取 host:port
  2. 验证格式合法性
  3. 生成唯一 ID
  4. 添加到实例列表
  5. 更新 localStorage

#### `saveComfyInstances()`
- **功能：** 保存所有 ComfyUI 实例配置
- **存储：** `localStorage.comfyui_instances`
- **副作用：** 触发 `comfyui-instances-change` 事件通知其他页面

#### `removeComfyInstance(id)`
- **功能：** 删除指定实例
- **约束：** 至少保留一个实例

### 2. 工作流管理

#### `onUpload(event)`
- **功能：** 上传工作流 JSON 文件
- **流程：**
  1. 读取 File 对象
  2. JSON.parse 解析
  3. 验证工作流格式
  4. 生成唯一 ID
  5. 存储到 workflows 对象
  6. 自动选中并渲染

#### `loadWorkflow(id)`
- **功能：** 加载并渲染指定工作流
- **步骤：**
  1. 从 workflows 获取数据
  2. 解析节点图结构
  3. 渲染 SVG 图形
  4. 更新节点列表
  5. 更新预览面板

#### `onSave()`
- **功能：** 保存当前工作流配置
- **保存内容：**
  - 工作流名称
  - exposed_inputs 配置
  - 工作流 JSON
- **持久化：** localStorage

### 3. 工作流图渲染

#### `renderGraph()`
- **功能：** 使用 SVG 渲染工作流节点图
- **特性：**
  - 节点分类着色（prompt/loader/sampler/image/output 等）
  - 连线显示节点间数据流
  - 拖拽平移画布
  - 滚轮缩放
  - 点击节点弹出参数编辑面板

#### `graphZoom(direction)`
- **参数：** `1` 放大，`-1` 缩小
- **缩放范围：** 50% - 200%
- **实现：** CSS transform scale

#### `graphFit()`
- **功能：** 自动适配视图显示所有节点

### 4. 节点参数配置

#### `toggleNodeInput(nodeId, inputKey)`
- **功能：** 切换输入字段是否暴露到画布
- **操作：**
  - 勾选：添加到 exposed_inputs
  - 取消：从 exposed_inputs 移除

#### `updateInputConfig(index, field, value)`
- **功能：** 更新暴露输入的配置
- **可配置字段：**
  - `display_name`：显示名称
  - `control_type`：控件类型
  - `default_value`：默认值
  - `min/max/step`：数值范围
  - `options`：下拉选项

### 5. 预览和测试

#### `renderPreview()`
- **功能：** 渲染画布节点预览面板
- **根据 control_type 生成对应控件：**
  - `text`：单行输入框
  - `textarea`：多行文本框
  - `number`：数字输入框
  - `slider`：滑块控件
  - `dropdown`：下拉选择框
  - `image`：图片拖放区域
  - `boolean`：开关切换

#### `runWorkflow()`
- **功能：** 测试运行当前工作流
- **流程：**
  1. 收集预览面板中的参数值
  2. 合并到工作流 JSON
  3. 发送到 ComfyUI 后端
  4. WebSocket 监听进度
  5. 显示生成结果图片

## 节点分类系统

### NODE_INFO 字典

```javascript
const NODE_INFO = {
  'KSampler':              { label:'采样器',        icon:'⚙', cat:'sampler' },
  'CheckpointLoaderSimple':{ label:'主模型加载',    icon:'📦', cat:'loader' },
  'CLIPTextEncode':        { label:'提示词编码',    icon:'✎', cat:'prompt' },
  'LoraLoader':            { label:'LoRA 加载',     icon:'⚡', cat:'lora' },
  'SaveImage':             { label:'保存图片',      icon:'🖼', cat:'output' },
  'LoadImage':             { label:'加载图片',      icon:'📷', cat:'image' },
  // ... 更多节点类型
};
```

### 分类颜色方案

| 分类 | 浅色模式 | 深色模式 | 用途 |
|------|---------|---------|------|
| prompt | #fef9e7 / #eab308 | #3a3315 / #eab308 | 提示词相关节点 |
| loader | #eff6ff / #3b82f6 | #1a2845 / #60a5fa | 模型加载节点 |
| lora | #fef3c7 / #f59e0b | #3a2a10 / #fbbf24 | LoRA 节点 |
| sampler | #f5f3ff / #8b5cf6 | #2a1e44 / #a78bfa | 采样器节点 |
| image | #ecfdf5 / #10b981 | #0f3825 / #34d399 | 图片节点 |
| output | #f3f4f6 / #6b7280 | #2a2d35 / #9ca3af | 输出节点 |
| latent | #fdf2f8 / #ec4899 | #3a1d2c / #f472b6 | Latent 节点 |
| controlnet | #fff7ed / #f97316 | #3a2410 / #fb923c | ControlNet 节点 |

## 控件类型系统

### 支持的控件类型

| 类型 | 控件 | 适用场景 | 配置项 |
|------|------|---------|--------|
| text | 单行输入 | 短文本、关键词 | 无 |
| textarea | 多行输入 | 提示词、描述 | 无 |
| number | 数字输入 | seed、steps | min, max, step |
| slider | 滑块 | cfg、denoise | min, max, step |
| dropdown | 下拉选择 | sampler_name、scheduler | options 数组 |
| image | 图片上传 | 参考图、遮罩 | 接受拖放和粘贴 |
| boolean | 开关 | enable_xxx | 无 |

### 下拉框选项配置

```javascript
{
  control_type: "dropdown",
  options: [
    { label: "选项1", value: "value1" },
    { label: "选项2", value: "value2" }
  ]
}
```

## 依赖关系

### 外部依赖

- **Tailwind CSS**：样式框架
- **Lucide Icons**：图标库
- **theme.js**：主题切换
- **i18n.js**：国际化

### 内部依赖

- **canvas.html**：消费工作流配置
- **main.py**：ComfyUI 代理 API

### 事件系统

```javascript
// 发送事件
window.dispatchEvent(new CustomEvent('comfyui-instances-change', {
  detail: { instances: [...] }
}));

window.dispatchEvent(new CustomEvent('comfyui-workflows-change', {
  detail: { workflows: {...} }
}));

// 监听事件
window.addEventListener('comfyui-instances-change', (e) => {
  // 更新实例列表
});
```

## 错误处理

### 1. JSON 解析错误

```javascript
try {
  const workflow = JSON.parse(fileContent);
} catch(e) {
  showStatus('工作流 JSON 解析失败：' + e.message, 'error');
  return;
}
```

### 2. 连接错误

```javascript
// ComfyUI 后端连接失败
try {
  const response = await fetch(`http://${host}/queue`);
} catch(e) {
  showStatus('无法连接到 ComfyUI：' + host, 'error');
}
```

### 3. 格式验证

```javascript
// 验证工作流格式
function validateWorkflow(json) {
  if (typeof json !== 'object') return false;
  for (const [id, node] of Object.entries(json)) {
    if (!node.class_type || !node.inputs) return false;
  }
  return true;
}
```

## 性能考虑

### 1. 大工作流优化

- **节点图渲染：** 使用 SVG 而非 DOM 节点，减少重绘
- **懒加载：** 节点列表默认折叠，展开时才渲染
- **虚拟滚动：** 工作流列表超过 50 项时启用虚拟滚动

### 2. 存储优化

- **localStorage 限制：** 单键最大 5MB
- **工作流压缩：** 超过 1MB 的工作流考虑压缩存储
- **分离存储：** 实例配置和工作流配置分开存储

### 3. 事件优化

- **防抖：** 输入框使用 debounce 避免频繁保存
- **节流：** 拖拽和缩放使用 throttle 限制更新频率

## 使用示例

### 添加新的 ComfyUI 实例

```javascript
// 1. 点击"添加后端"按钮
// 2. 输入地址：192.168.1.100:8188
// 3. 点击保存

// 代码层面：
const instances = JSON.parse(localStorage.comfyui_instances || '[]');
instances.push({
  id: Date.now().toString(),
  host: '192.168.1.100:8188',
  name: '远程 ComfyUI',
  is_primary: false
});
localStorage.comfyui_instances = JSON.stringify(instances);
```

### 上传工作流并配置暴露参数

```javascript
// 1. 准备 API 格式的工作流 JSON
const workflow = {
  "1": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "a beautiful sunset",
      "clip": ["2", 1]
    }
  },
  "2": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "v1-5-pruned.safetensors"
    }
  }
};

// 2. 上传后配置暴露参数
const exposed = [
  {
    node_id: "1",
    input_key: "text",
    display_name: "正向提示词",
    control_type: "textarea"
  }
];

// 3. 保存配置
saveWorkflowWithExposedInputs(workflow, exposed);
```

## 设计决策

### 为什么使用 localStorage 而非后端存储？

**决策：** 配置存储在前端 localStorage

**原因：**
1. 配置属于用户个人偏好，不需要跨设备同步
2. 减少后端 API 调用和数据库压力
3. 离线可用，提升响应速度
4. 简化部署和备份（导出 JSON 即可）

**缺点：**
- 浏览器数据清除会丢失配置
- 无法跨浏览器同步
- 存储空间有限（5MB）

### 为什么使用 SVG 渲染工作流图？

**决策：** 使用 SVG 而非 Canvas 或 DOM

**原因：**
1. SVG 节点可交互（hover、click）
2. 自动处理事件委托
3. 缩放不失真
4. CSS 样式容易定制

### 为什么暴露参数而非整个节点？

**决策：** 只暴露选定的输入参数

**原因：**
1. 简化画布节点界面
2. 隐藏技术细节（如 latent、model 连接）
3. 自定义显示名称提升可用性
4. 类型转换和验证集中处理

## 已知问题

### 1. 大工作流性能

- **问题：** 超过 100 个节点的工作流渲染缓慢
- **影响：** 首次加载需要 2-3 秒
- **临时方案：** 使用节点列表模式而非图形模式
- **改进方向：** 实现虚拟渲染和分块加载

### 2. 复杂类型支持

- **问题：** 某些节点输入类型（如 CONDITIONING、LATENT）无法直观编辑
- **影响：** 用户可能误配置
- **当前处理：** 默认不暴露这些类型
- **改进方向：** 提供高级模式的完整编辑

### 3. 多实例同步

- **问题：** 多个 ComfyUI 实例的工作流需分别上传
- **影响：** 重复劳动
- **改进方向：** 工作流全局存储，实例仅区分后端地址

## 未来改进建议

### 短期（1-2 周）

1. **工作流模板库：** 预置常用工作流（文生图、图生图、高清修复等）
2. **参数导入导出：** 支持配置的 JSON 导入导出备份
3. **连接测试增强：** 自动检测 ComfyUI 版本和可用节点

### 中期（1-2 月）

1. **协作功能：** 工作流配置云端同步
2. **版本管理：** 工作流的历史版本和回滚
3. **参数联动：** 某些参数的联动验证（如 width/height 必须同时修改）

### 长期（3-6 月）

1. **可视化编程：** 直接在此页面编辑工作流而非仅配置
2. **AI 辅助配置：** 根据工作流自动推荐暴露参数
3. **性能分析：** 工作流执行时间和资源消耗分析

## 测试检查清单

- [ ] 上传合法的工作流 JSON
- [ ] 上传非法格式的文件
- [ ] 添加/删除 ComfyUI 实例
- [ ] 切换暴露参数并保存
- [ ] 预览面板控件渲染正确
- [ ] 运行测试工作流
- [ ] 主题切换样式正常
- [ ] 中英文切换正常
- [ ] 大工作流（50+ 节点）加载性能
- [ ] localStorage 满时的错误处理
