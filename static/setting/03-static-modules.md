# 前端静态模块技术文档

## 概述

前端静态模块是无限画布项目的基础设施工具，提供主题管理、国际化、图片预览和历史批量管理功能。这些模块采用 IIFE（立即执行函数表达式）封装，避免全局污染，通过有限的 API 暴露给其他模块使用。

### 模块列表

| 模块 | 文件 | 功能 |
|------|------|------|
| 主题管理 | [theme.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/theme.js) | 明暗主题切换和同步 |
| 国际化 | [i18n.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/i18n.js) | 中英文双语支持 |
| 图片预览 | [image-preview.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/image-preview.js) | 图片滚轮缩放和拖拽 |
| 历史批量管理 | [history-bulk-manager.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/history-bulk-manager.js) | 历史记录框选删除 |

---

## 1. theme.js - 主题管理模块

### 功能概述

theme.js 提供全局主题管理功能，支持明暗主题切换，并通过 localStorage 持久化和事件机制实现跨页面同步。

### 代码位置

- **文件：** [theme.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/theme.js)

### 架构设计

```
┌──────────────────────────────────────┐
│         localStorage                 │
│  studio_theme: 'light' | 'dark'      │
└──────────────────────────────────────┘
         ↕ 读写
┌──────────────────────────────────────┐
│      StudioTheme API                 │
│  - get()                             │
│  - set(theme)                        │
│  - apply(theme)                      │
└──────────────────────────────────────┘
         ↕ 事件
┌──────────────────────────────────────┐
│      事件监听                         │
│  - studio-theme-change               │
│  - message (跨窗口)                   │
│  - storage (同域其他窗口)             │
└──────────────────────────────────────┘
```

### 核心函数

#### `currentTheme()`

**功能：** 获取当前主题

**逻辑：**
```javascript
function currentTheme() {
  return localStorage.getItem(KEY) || 
         localStorage.getItem(LEGACY_KEY) || 
         'light';
}
```

**说明：**
- 优先读取 `studio_theme`
- 兼容旧版 `canvas_theme`
- 默认返回 `'light'`

#### `applyTheme(theme)`

**功能：** 应用主题到 DOM

**逻辑：**
```javascript
function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  const dark = next === 'dark';
  
  // 设置 CSS 类
  document.documentElement.classList.toggle('studio-theme-dark', dark);
  document.documentElement.classList.toggle('theme-dark', dark);
  
  if (document.body) {
    document.body.classList.toggle('studio-theme-dark', dark);
    document.body.classList.toggle('theme-dark', dark);
  }
  
  // 触发事件通知其他模块
  window.dispatchEvent(new CustomEvent('studio-theme-change', { 
    detail: { theme: next } 
  }));
}
```

**CSS 类说明：**
- `studio-theme-dark`：新标准类名
- `theme-dark`：兼容旧版类名

#### `StudioTheme.set(theme)`

**功能：** 设置并持久化主题

**逻辑：**
```javascript
set(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  localStorage.setItem(KEY, next);
  localStorage.setItem(LEGACY_KEY, next);  // 兼容旧版
  applyTheme(next);
}
```

### 事件同步机制

#### 跨窗口同步（message 事件）

```javascript
window.addEventListener('message', event => {
  if (event.data?.type === 'studio-theme') {
    applyTheme(event.data.theme);
  }
});
```

**触发方式：**
```javascript
// 其他窗口发送
window.postMessage({ type: 'studio-theme', theme: 'dark' }, '*');
```

#### 同域同步（storage 事件）

```javascript
window.addEventListener('storage', event => {
  if (event.key === KEY || event.key === LEGACY_KEY) {
    applyTheme(currentTheme());
  }
});
```

**说明：** 当同域其他窗口修改 localStorage 时触发

### 使用示例

```javascript
// 获取当前主题
const theme = StudioTheme.get();  // 'light' 或 'dark'

// 切换主题
Studio Theme.set('dark');

// 监听主题变化
window.addEventListener('studio-theme-change', (e) => {
  console.log('主题切换为:', e.detail.theme);
});

// 手动应用主题
StudioTheme.apply('dark');
```

### 数据结构

```javascript
// localStorage 存储格式
{
  studio_theme: 'dark',  // 当前主题
  canvas_theme: 'dark'   // 旧版兼容
}
```

### CSS 变量集成

主题通过 CSS 变量实现：

```css
:root {
  --page: #f8fafc;
  --text: #111827;
  --muted: #64748b;
  /* ... 更多变量 */
}

.theme-dark {
  --page: #0b1020;
  --text: #f8fafc;
  --muted: #cbd5e1;
  /* ... 深色模式变量 */
}
```

### 错误处理

```javascript
// localStorage 不可用时的容错
(function() {
  try {
    var theme = localStorage.getItem('studio_theme') || 'light';
    if (theme === 'dark') {
      document.documentElement.classList.add('theme-dark');
    }
  } catch(e) {
    // 静默失败，使用默认主题
  }
})();
```

---

## 2. i18n.js - 国际化模块

### 功能概述

i18n.js 提供完整的多语言支持系统，目前支持中文（zh）和英文（en），通过字典管理和事件机制实现运行时语言切换。

### 代码位置

- **文件：** [i18n.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/i18n.js)

### 架构设计

```
┌──────────────────────────────────────┐
│         翻译字典 (dict)               │
│  {                                   │
│    zh: { 'key': '中文' },            │
│    en: { 'key': 'English' }          │
│  }                                   │
└──────────────────────────────────────┘
         ↕
┌──────────────────────────────────────┐
│      StudioI18n API                  │
│  - t(key)           翻译单个键        │
│  - tf(key, vars)    翻译并插值        │
│  - lang()           获取当前语言      │
│  - set(lang)        设置语言          │
│  - apply()          应用到 DOM        │
└──────────────────────────────────────┘
         ↕
┌──────────────────────────────────────┐
│      DOM 自动翻译                     │
│  [data-i18n="key"]  文本内容          │
│  [data-i18n-title="key"] 标题         │
│  [data-i18n-placeholder="key"] 占位符 │
└──────────────────────────────────────┘
```

### 核心数据结构

#### 翻译字典

```javascript
const dict = {
  zh: {
    'common.apiSettings': 'API 设置',
    'common.darkMode': '黑夜模式',
    'common.language': '中文',
    'nav.textToImage': '文生图',
    'nav.canvas': '无限画布',
    'studio.ready': '系统就绪',
    // ... 数百个翻译键
  },
  en: {
    'common.apiSettings': 'API Settings',
    'common.darkMode': 'Dark Mode',
    'common.language': 'English',
    'nav.textToImage': 'Text to Image',
    'nav.canvas': 'Infinite Canvas',
    'studio.ready': 'System Ready',
    // ... 对应英文
  }
};
```

### 核心函数

#### `StudioI18n.t(key)`

**功能：** 翻译单个键

**逻辑：**
```javascript
function t(key) {
  const lang = currentLang();
  return dict[lang]?.[key] || dict['zh']?.[key] || key;
}
```

**回退策略：**
1. 当前语言翻译
2. 中文翻译（默认回退）
3. 返回键名本身

#### `StudioI18n.tf(key, vars)`

**功能：** 翻译并插值

**逻辑：**
```javascript
function tf(key, vars = {}) {
  let text = t(key);
  Object.entries(vars).forEach(([k, v]) => {
    text = text.replaceAll(`{${k}}`, v);
  });
  return text;
}
```

**使用示例：**
```javascript
// 字典中定义
'canvas.loopImageWillOutput': '当前会输出 {n} 张图片'

// 使用
StudioI18n.tf('canvas.loopImageWillOutput', { n: 4 });
// 返回：'当前会输出 4 张图片'
```

#### `StudioI18n.apply()`

**功能：** 自动翻译页面元素

**逻辑：**
```javascript
function apply() {
  // 翻译文本内容
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  
  // 翻译 title 属性
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
  
  // 翻译 placeholder 属性
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
}
```

#### `StudioI18n.set(lang)`

**功能：** 设置语言并触发同步

**逻辑：**
```javascript
set(lang) {
  const next = (lang === 'en') ? 'en' : 'zh';
  localStorage.setItem(KEY, next);
  apply();  // 应用到当前页面
  applyTheme(currentTheme());  // 重新应用主题（语言可能影响主题）
  
  // 触发事件
  window.dispatchEvent(new CustomEvent('studio-lang-change', { 
    detail: { lang: next } 
  }));
}
```

### 事件系统

#### 语言变化事件

```javascript
// 监听语言变化
window.addEventListener('studio-lang-change', () => {
  // 更新特定组件的文本
  updateComponentTexts();
});

// 跨窗口同步（message 事件）
window.addEventListener('message', event => {
  if (event.data?.type === 'studio-lang') {
    setTimeout(() => apply(), 0);
  }
});

// 同域同步（storage 事件）
window.addEventListener('storage', event => {
  if (event.key === KEY) {
    apply();
  }
});
```

### 使用示例

```javascript
// 获取当前语言
const lang = StudioI18n.lang();  // 'zh' 或 'en'

// 翻译单个键
const text = StudioI18n.t('common.apiSettings');  // 'API 设置'

// 翻译并插值
const count = StudioI18n.tf('canvas.imageCount', { count: 5 });
// 返回：'5 张图片'

// 设置语言
StudioI18n.set('en');

// 应用到页面
StudioI18n.apply();
```

### HTML 集成

```html
<!-- 自动翻译文本内容 -->
<div data-i18n="studio.ready">系统就绪</div>

<!-- 自动翻译 title -->
<button data-i18n-title="canvas.increase" title="增加">+</button>

<!-- 自动翻译 placeholder -->
<input data-i18n-placeholder="canvas.promptPlaceholder" 
       placeholder="输入提示词...">
```

### 翻译覆盖率

当前翻译键覆盖：
- 通用：API 设置、黑暗模式、语言、取消、确定、保存、删除
- 导航：文生图、细节增强、图片编辑、角度控制、在线生图、GPT 对话、无限画布
- 画布：节点类型、循环、分组、日志、裁剪、遮罩、画笔
- API：平台、模型、LoRA、验证
- 在线生图：提示词、尺寸、比例、生成、归档
- GPT 对话：对话、历史、发送
- ComfyUI：工作流、节点、参数

---

## 3. image-preview.js - 图片预览模块

### 功能概述

image-preview.js 提供图片滚轮缩放和拖拽平移功能，支持双击复位，基于 CSS transform 实现硬件加速。

### 代码位置

- **文件：** [image-preview.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/image-preview.js)

### 架构设计

```
┌──────────────────────────────────────┐
│  .studio-preview-frame (容器)         │
│  - overflow: hidden                  │
│  - 监听 wheel, mousedown             │
│  ┌────────────────────────────────┐  │
│  │  .studio-preview-img (图片)     │  │
│  │  - transform: translate scale   │  │
│  │  - 不响应 pointer-events        │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 核心函数

#### `StudioImagePreview.attach(container, options)`

**功能：** 绑定预览功能到容器

**参数：**
```javascript
{
  container: HTMLElement,  // 外框容器
  options: {
    img: HTMLImageElement, // 图片元素（可选，默认取 .studio-preview-img）
    minZoom: 1,            // 最小缩放（默认 1）
    maxZoom: 6             // 最大缩放（默认 6）
  }
}
```

**返回：**
```javascript
{
  reset: Function,     // 复位函数
  apply: Function,     // 应用变换函数
  getZoom: Function    // 获取当前缩放比例
}
```

#### 滚轮缩放 (`onWheel`)

**逻辑：**
```javascript
function onWheel(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // 获取鼠标在容器中的位置
  const rect = container.getBoundingClientRect();
  const lx = e.clientX - rect.left;
  const ly = e.clientY - rect.top;
  
  // 计算缩放前的相对位置
  const before = {
    x: (lx - pan.x) / zoom,
    y: (ly - pan.y) / zoom
  };
  
  // 计算缩放因子
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const nz = Math.max(minZoom, Math.min(maxZoom, zoom * factor));
  zoom = nz;
  
  // 更新平移（保持鼠标位置不变）
  pan = nz <= 1.001 ? { x: 0, y: 0 } : {
    x: lx - before.x * nz,
    y: ly - before.y * nz
  };
  
  apply();
}
```

**数学模型：**
```
新位置 = 鼠标位置 - (相对位置 × 新缩放比例)
```

#### 拖拽平移 (`onDown`, `onMove`, `onUp`)

**逻辑：**
```javascript
function onDown(e) {
  // 仅左键且缩放后生效
  if (e.button !== 0 || zoom <= 1.001) return;
  
  // 排除按钮和链接
  if (e.target.closest('[data-no-pan], button, a, input, textarea')) return;
  
  drag = { 
    sx: e.clientX, 
    sy: e.clientY, 
    ox: pan.x, 
    oy: pan.y 
  };
  container.classList.add('panning');
  e.preventDefault();
}

function onMove(e) {
  if (!drag) return;
  
  pan = {
    x: drag.ox + e.clientX - drag.sx,
    y: drag.oy + e.clientY - drag.sy
  };
  apply();
}

function onUp() {
  if (!drag) return;
  drag = null;
  container.classList.remove('panning');
}
```

#### 双击复位 (`onDblClick`)

**逻辑：**
```javascript
function onDblClick(e) {
  if (zoom <= 1.001) return;  // 已复位则忽略
  e.preventDefault();
  e.stopPropagation();
  reset();
}

function reset() {
  zoom = 1;
  pan = { x: 0, y: 0 };
  drag = null;
  container.classList.remove('panning');
  apply();
}
```

#### 应用变换 (`apply`)

**逻辑：**
```javascript
function apply() {
  img.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
  img.style.transformOrigin = '0 0';
}
```

### CSS 样式

```css
.studio-preview-frame {
  position: relative;
  width: min(1280px, 92vw);
  height: min(820px, 78vh);
  max-width: 100%;
  border-radius: 24px;
  overflow: hidden;
  background: rgba(241,245,249,.72);
  border: 1px solid rgba(15,23,42,.08);
  box-shadow: 0 30px 90px rgba(15,23,42,.18);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.studio-preview-frame.panning { 
  cursor: grabbing; 
}

.studio-preview-frame.panning .studio-preview-img { 
  transition: none; 
}

.studio-preview-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform .12s ease-out;
  transform-origin: 0 0;
  -webkit-user-drag: none;
  user-select: none;
  pointer-events: none;  /* 不响应鼠标事件 */
  background: transparent;
}
```

### 性能优化

#### 硬件加速

```css
.studio-preview-img {
  transform: translate3d(0, 0, 0);  /* 触发 GPU 加速 */
  will-change: transform;            /* 提示浏览器优化 */
}
```

#### 过渡动画

```javascript
// 拖拽时禁用过渡（实时响应）
container.classList.add('panning');
// CSS: .panning .studio-preview-img { transition: none; }

// 释放后恢复过渡（平滑动画）
container.classList.remove('panning');
// CSS: transition: transform .12s ease-out;
```

### 使用示例

```javascript
// 绑定预览
const preview = StudioImagePreview.attach(container, {
  minZoom: 1,
  maxZoom: 6
});

// 手动复位
preview.reset();

// 获取当前缩放
const zoom = preview.getZoom();

// 应用变换（内部调用）
preview.apply();
```

### 错误处理

```javascript
// 容器或图片不存在时返回 null
function attach(container, options) {
  if (!container) return null;
  
  const img = options.img
    || container.querySelector('.studio-preview-img')
    || container.querySelector('img');
    
  if (!img) return null;
  
  // ... 继续绑定
}
```

---

## 4. history-bulk-manager.js - 历史批量管理模块

### 功能概述

history-bulk-manager.js 提供历史记录的批量选择和删除功能，支持框选、点击选择和工具栏操作。

### 代码位置

- **文件：** [history-bulk-manager.js](file:///c:/Users/Administrator/Desktop/26-5-17-无限画布/static/history-bulk-manager.js)

### 架构设计

```
┌──────────────────────────────────────┐
│  .history-bulk-surface (表面层)       │
│  ┌────────────────────────────────┐  │
│  │  .history-bulk-toolbar (工具栏)  │  │
│  │  - 批量管理按钮                  │  │
│  │  - 删除按钮                      │  │
│  │  - 已选择计数                    │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  .masonry-grid (瀑布流网格)     │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐      │  │
│  │  │Item │ │Item │ │Item │ ...  │  │
│  │  └─────┘ └─────┘ └─────┘      │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │  .history-select-box (选择框)   │  │
│  │  (拖拽时显示)                    │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 核心函数

#### `HistoryBulkManager.attach(options)`

**功能：** 绑定批量管理功能到瀑布流网格

**参数：**
```javascript
{
  masonry: HTMLElement | string,  // 网格元素或选择器
  onDelete: Function               // 删除回调（可选）
}
```

**返回：**
```javascript
{
  sync: Function,           // 同步 UI 状态
  setSelecting: Function,   // 设置选择模式
  isSelecting: Function     // 是否在选择模式
}
```

#### 选择模式切换

```javascript
let selecting = false;
let selected = new Set();  // 存储选中的时间戳

toggleBtn.onclick = () => setSelecting(!selecting);

function setSelecting(next) {
  selecting = Boolean(next);
  if (!selecting) selected.clear();  // 退出时清空选择
  sync();  // 同步 UI
}
```

#### 卡片选择

```javascript
// 点击切换选中状态
function toggleCard(card) {
  const ts = cardTs(card);  // 获取 data-history-ts
  if (!ts) return;
  
  if (selected.has(ts)) {
    selected.delete(ts);
  } else {
    selected.add(ts);
  }
  sync();
}

// 点击事件（捕获阶段）
masonry.addEventListener('click', e => {
  if (!selecting) return;
  if (e.target.closest('.history-bulk-toolbar')) return;
  if (down?.dragged) {  // 如果是拖拽则忽略
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  
  const card = e.target.closest('.masonry-item[data-history-ts]');
  if (!card || !masonry.contains(card)) return;
  
  e.preventDefault();
  e.stopPropagation();
  toggleCard(card);
}, true);  // 注意：true 表示捕获阶段
```

#### 框选逻辑

```javascript
// 鼠标按下
document.addEventListener('mousedown', e => {
  if (!selecting || e.button !== 0) return;
  if (shouldIgnorePointer(e)) return;  // 排除工具栏等
  if (!insideHistoryBand(e.clientY)) return;  // 仅在历史区域有效
  
  e.preventDefault();
  e.stopPropagation();
  removeSelectBoxes();
  drag = null;
  clearNativeSelection();
  
  down = { sx: e.clientX, sy: e.clientY, dragged: false };
}, true);

// 鼠标移动（开始框选）
window.addEventListener('mousemove', e => {
  if (down && !drag) {
    const moved = Math.hypot(e.clientX - down.sx, e.clientY - down.sy);
    if (moved < 6) return;  // 移动距离小于 6px 则忽略
    
    e.preventDefault();
    clearNativeSelection();
    down.dragged = true;
    
    // 创建选择框
    const box = document.createElement('div');
    box.className = 'history-select-box';
    document.body.appendChild(box);
    drag = { sx: down.sx, sy: down.sy, box };
  }
  
  if (!drag) return;
  
  e.preventDefault();
  clearNativeSelection();
  
  // 更新选择框位置和大小
  const x = Math.min(drag.sx, e.clientX);
  const y = Math.min(drag.sy, e.clientY);
  const w = Math.abs(e.clientX - drag.sx);
  const h = Math.abs(e.clientY - drag.sy);
  
  Object.assign(drag.box.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`
  });
  
  // 检测相交卡片
  const r = { left: x, top: y, right: x + w, bottom: y + h };
  selectableCards().forEach(card => {
    const cr = card.getBoundingClientRect();
    const hit = cr.left < r.right && cr.right > r.left && 
                cr.top < r.bottom && cr.bottom > r.top;
    if (hit) selected.add(cardTs(card));
  });
  
  sync();
});
```

#### 批量删除

```javascript
deleteBtn.onclick = async () => {
  if (!selected.size) return;
  
  const targets = [...selected];
  deleteBtn.disabled = true;
  
  for (const ts of targets) {
    const res = await deleteHistory(ts);
    if (res.success) {
      // 从 DOM 移除卡片
      document.querySelector(`[data-history-ts="${CSS.escape(ts)}"]`)?.remove();
      selected.delete(ts);
    }
  }
  
  sync();
  options.onDelete?.(targets);  // 调用回调
};

// 删除 API 调用
function deleteHistory(timestamp) {
  return fetch('/api/history/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timestamp })
  }).then(r => r.json()).catch(() => ({ success: false }));
}
```

### UI 同步

```javascript
function sync() {
  const l = labels();  // 获取当前语言标签
  
  // 更新按钮文本
  toolbar.querySelector('[data-bulk-toggle]').textContent = 
    selecting ? l.done : l.manage;
  deleteBtn.textContent = l.delete;
  
  // 更新计数
  countEl.textContent = selected.size 
    ? `${selected.size} ${l.selected}` 
    : '';
  
  // 更新工具栏状态
  toolbar.classList.toggle('is-selecting', selecting);
  surface.classList.toggle('is-selecting', selecting);
  document.body.classList.toggle('history-bulk-selecting', selecting);
  
  // 更新卡片选中状态
  selectableCards().forEach(card => {
    card.classList.toggle('bulk-selected', selected.has(cardTs(card)));
    
    // 添加复选标记
    if (!card.querySelector('.bulk-check')) {
      const check = document.createElement('span');
      check.className = 'bulk-check';
      card.appendChild(check);
    }
  });
}
```

### CSS 样式

```css
/* 选择模式光标 */
body.history-bulk-selecting,
body.history-bulk-selecting * {
  user-select: none !important;
  cursor: crosshair;
}

/* 选中卡片样式 */
.masonry-item.bulk-selected::after {
  opacity: 1;
  background: rgba(255,255,255,.42);
  box-shadow: inset 0 0 0 2px rgba(17,24,39,.9);
}

.masonry-item.bulk-selected {
  outline: 2px solid rgba(17,24,39,.9);
  outline-offset: 3px;
}

/* 复选标记 */
.bulk-check {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #fff;
  color: #111827;
  border: 2px solid rgba(17,24,39,.9);
  display: none;
  align-items: center;
  justify-content: center;
}

.masonry-item.bulk-selected .bulk-check {
  background: #111827;
  color: #fff;
}

.bulk-check::before {
  content: "";
  width: 8px;
  height: 5px;
  border-left: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(-45deg);
  opacity: 0;
}

.masonry-item.bulk-selected .bulk-check::before {
  opacity: 1;
}

/* 选择框 */
.history-select-box {
  position: fixed;
  z-index: 9999;
  border: 1px solid rgba(17,24,39,.72);
  background: rgba(17,24,39,.09);
  pointer-events: none;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(255,255,255,.5) inset;
}
```

### 事件监听

```javascript
// 语言变化同步
window.addEventListener('studio-lang-change', sync);
window.addEventListener('message', event => {
  if (event.data?.type === 'studio-lang') setTimeout(sync, 0);
});

// DOM 变化自动同步（MutationObserver）
const observer = new MutationObserver(() => {
  if (!selecting) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 30);
});
observer.observe(masonry, { childList: true });
```

### 使用示例

```javascript
// 绑定批量管理
const manager = HistoryBulkManager.attach({
  masonry: document.getElementById('masonry'),
  onDelete: (deletedTimestamps) => {
    console.log('已删除:', deletedTimestamps);
    // 更新后端或本地缓存
  }
});

// 手动进入选择模式
manager.setSelecting(true);

// 检查是否在选择模式
if (manager.isSelecting()) {
  console.log('当前是批量选择模式');
}

// 同步 UI（例如添加新卡片后）
manager.sync();
```

### 错误处理

```javascript
// 元素不存在时返回 null
function attach(options) {
  const masonry = typeof options.masonry === 'string' 
    ? document.querySelector(options.masonry) 
    : (options.masonry || document.getElementById('masonry'));
    
  if (!masonry || masonry._historyBulkManager) {
    return masonry?._historyBulkManager || null;
  }
  
  // ... 继续绑定
}

// 删除失败时跳过
for (const ts of targets) {
  const res = await deleteHistory(ts);
  if (res.success) {
    // 仅成功时从 DOM 移除
    document.querySelector(`[data-history-ts="${CSS.escape(ts)}"]`)?.remove();
    selected.delete(ts);
  }
}
```

---

## 模块集成

### 初始化顺序

```html
<head>
  <!-- 1. 主题（最先加载） -->
  <script src="/static/theme.js"></script>
  
  <!-- 2. 国际化 -->
  <script src="/static/i18n.js"></script>
  
  <!-- 3. 其他模块 -->
  <script src="/static/image-preview.js"></script>
  <script src="/static/history-bulk-manager.js"></script>
</head>
```

### 模块间依赖

```
theme.js
  ↓ (主题变化事件)
i18n.js, image-preview.js, history-bulk-manager.js

i18n.js
  ↓ (语言变化事件)
history-bulk-manager.js (同步标签文本)

image-preview.js
  └ 独立模块，无依赖

history-bulk-manager.js
  └ 依赖 i18n.js (获取翻译标签)
```

### 全局 API

```javascript
// 所有模块通过全局对象暴露 API
window.StudioTheme        // 主题管理
window.StudioI18n         // 国际化
window.StudioImagePreview // 图片预览
window.HistoryBulkManager // 历史批量管理
```

---

## 已知问题

1. **theme.js**：localStorage 满时可能抛出异常
2. **i18n.js**：部分翻译键未覆盖
3. **image-preview.js**：触控设备支持不完善
4. **history-bulk-manager.js**：大量历史记录时框选性能下降

## 未来改进建议

1. **theme.js**：支持自定义主题色
2. **i18n.js**：动态加载翻译文件
3. **image-preview.js**：支持多点触控
4. **history-bulk-manager.js**：虚拟滚动优化性能
