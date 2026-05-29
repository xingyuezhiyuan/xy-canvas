/**
 * Image Node 模块
 * 负责无限画布中 image 节点的创建、渲染、上传、裁剪等功能
 */

// 模块状态
let imageNodeDeps = null;
let cropState = null;
let cropDrag = null;
let maskState = {
    nodeId: null,
    mode: 'crop',
    drawing: false,
    brushSize: 20,
    lastX: 0,
    lastY: 0
};

// 遮罩历史记录（撤销/重做）
let maskUndoStack = [];
let maskRedoStack = [];
const MASK_HISTORY_MAX = 40;

let maskEventHandlers = {
    mousedown: null,
    mousemove: null,
    mouseup: null,
    mouseleave: null
};

// 编辑模式状态
let imageEditMode = 'crop'; // 当前编辑模式: 'crop', 'mask', 'brush', 'grid'

// 画笔模式状态
let brushState = {
    drawing: false,
    brushSize: 14,
    brushColor: '#ff2d55',
    lastX: 0,
    lastY: 0,
    tool: 'free', // 当前工具: 'free', 'rect', 'ellipse', 'mark', 'label'
    startX: 0,
    startY: 0,
    snapshot: null // 形状预览时的画布快照
};

// 画笔历史记录（撤销/重做）
let brushUndoStack = [];
let brushRedoStack = [];
const BRUSH_HISTORY_MAX = 40;
let brushLabelCounter = 1; // 数字标签计数器

// 宫格切分状态
let gridState = {
    horizontalLines: 2,
    verticalLines: 2,
    gapSize: 0,
    customMode: false,
    customOrientation: 'h', // 'h' 或 'v'
    customLines: [] // 自定义切割线位置
};

// 图片编辑器缩放状态
let imageEditorZoom = {
    scale: 1,
    panning: false,
    startX: 0,
    startY: 0
};

// 资产选择器状态
let assetPickerState = {
    currentNodeId: null,
    loading: false
};

/**
 * 初始化模块，接收 canvas.html 的依赖注入
 */
function init(canvasDeps) {
    imageNodeDeps = canvasDeps;
    injectImageNodeCSS();
    setupCropEventListeners();
    setupImageEditZoom();
    setupGridInputListeners();
    
    // 预先创建光标元素
    createBrushCursorElement();
}

/**
 * 设置宫格输入框事件监听器
 */
function setupGridInputListeners() {
    ['gridHorizontalLines', 'gridVerticalLines', 'gridGapSize'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                syncGridGapValue();
                refreshGridSplitPreview();
            });
        }
    });
}

/**
 * 注入 image 节点相关 CSS 样式
 */
function injectImageNodeCSS() {
    if (document.getElementById('image-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'image-node-styles';
    style.textContent = `
        .image-node { width:260px; position: relative; }
        .image-node .node-body { min-height:0; }
        .image-node.has-image .node-body { cursor:move; }
        .image-node img { display:block; width:100%; max-height:260px; object-fit:contain; border-radius:16px; background:#f8fafc; }
        .node.sized.image-node .node-body { display:flex; flex-direction:column; gap:8px; }
        .node.sized.image-node img { flex:1; min-height:0; height:100%; max-height:none; }
        .image-caption { flex:0 0 auto; }
        .blank-image { height:190px; border:1px dashed #cbd5e1; border-radius:16px; background:#f8fafc; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; color:#94a3b8; cursor:pointer; transition:all .2s var(--ease); }
        .node.sized .blank-image { height:100%; min-height:72px; }
        .blank-image:hover,.blank-image.drag-over { border-color:#111827; color:#111827; background:#fff; }
        .image-edit-modal { position:absolute; inset:0; z-index:80; display:none; align-items:center; justify-content:center; padding:18px; background:rgba(248,250,252,.42); backdrop-filter:blur(18px); }
        .image-edit-modal.open { display:flex; }
        .image-edit-panel { width:min(1480px, calc(100vw - 36px)); height:min(980px, calc(100vh - 36px)); border-radius:22px; background:#fff; border:1px solid #e8edf3; box-shadow:0 30px 90px rgba(15,23,42,.22); padding:14px; display:flex; flex-direction:column; gap:10px; }
        .image-edit-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .image-edit-title { font-size:13px; font-weight:900; color:#111827; }
        .image-edit-sub { margin-top:3px; color:#94a3b8; font-size:11px; font-weight:600; }
        .image-edit-stage { min-height:320px; max-height:68vh; border-radius:20px; background:#f8fafc; border:1px solid #edf2f7; display:flex; align-items:center; justify-content:center; overflow:auto; padding:16px; }
        .crop-canvas { position:relative; display:inline-block; line-height:0; user-select:none; }
        .crop-canvas img { display:block; max-width:min(820px, calc(100vw - 108px)); max-height:62vh; border-radius:14px; background:#f8fafc; }
        .crop-box { position:absolute; left:10%; top:10%; width:80%; height:80%; border:2px solid #f8fafc; box-shadow:0 0 0 9999px rgba(15,23,42,.48), 0 12px 30px rgba(15,23,42,.2); border-radius:10px; cursor:move; }
        .crop-handle { position:absolute; right:-7px; bottom:-7px; width:18px; height:18px; border-radius:999px; background:#fff; border:2px solid #111827; cursor:nwse-resize; }
        .image-edit-actions { display:flex; justify-content:flex-end; gap:8px; }
        .image-edit-btn { height:38px; border-radius:999px; padding:0 14px; display:flex; align-items:center; justify-content:center; gap:7px; font-size:11px; font-weight:800; }
        .image-edit-btn.secondary { background:var(--soft); color:var(--muted); border:1px solid var(--line); }
        .image-edit-btn.secondary:hover { background:var(--soft-2); color:var(--text); }
        .image-edit-btn.primary { background:var(--strong); color:var(--strong-text); }
        .editor-tab.active { background:#0891b2; color:#fff; }
        .editor-tab:not(.active) { background:#f0f9ff; color:#0891b2; border:1px solid #cffafe; }
        .editor-tab:hover:not(.active) { background:#e0f2fe; }
        #maskOverlay { touch-action:none; }
        .mask-preview { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; opacity:0.5; pointer-events:none; border-radius:16px; }
        .image-container { position:relative; width:100%; height:100%; }
        .image-container img:first-child { display:block; width:100%; height:100%; object-fit:contain; }
        
        /* 新增样式 - 画笔和宫格模式 */
        .image-edit-tools { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:8px; border-radius:12px; background:var(--soft); border:1px solid var(--line); }
        .image-edit-tools label { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:var(--muted); }
        .image-edit-tools input[type="range"] { width:100px; }
        .image-edit-tools input[type="color"] { width:40px; height:28px; border:1px solid #e2e8f0; border-radius:6px; cursor:pointer; }
        .image-edit-tools button { height:28px; padding:0 12px; border-radius:999px; display:flex; align-items:center; gap:6px; font-size:10px; font-weight:800; }
        .edit-draw-canvas { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
        .crop-canvas.brush-mode .edit-draw-canvas,
        .crop-canvas.grid-mode .edit-draw-canvas { pointer-events:auto; }
        .grid-gap-control { display:flex; align-items:center; gap:6px; font-size:11px; font-weight:700; color:#475569; }
        .grid-gap-value { min-width:36px; text-align:center; font-size:10px; font-weight:900; color:#0891b2; }
        .image-edit-zoom-label { color:#94a3b8; font-size:11px; font-weight:800; padding:0 4px; margin-right:auto; cursor:pointer; user-select:none; }
        .menu-btn { width:100%; height:38px; border-radius:12px; display:flex; align-items:center; gap:9px; padding:0 10px; color:#475569; font-size:12px; font-weight:700; }
        .menu-btn:hover { background:#f8fafc; color:#111827; }
        .create-menu { position:absolute; z-index:40; display:none; width:190px; padding:8px; border-radius:18px; background:rgba(255,255,255,.96); border:1px solid #e8edf3; box-shadow:0 20px 50px rgba(15,23,42,.14); backdrop-filter:blur(16px); }
        .create-menu.open { display:block; }
        .image-preview-wrap { position:relative; }
        .image-preview-wrap.drag-over img { outline:2px solid #111827; outline-offset:2px; background:#fff; }
        .image-edit-stage { flex:1; min-height:0; border-radius:20px; background:#f8fafc; border:1px solid #edf2f7; overflow:auto; }
        .image-edit-stage-inner { min-width:100%; min-height:100%; width:max-content; height:max-content; display:flex; align-items:center; justify-content:center; padding:18px; box-sizing:border-box; margin:auto; }
        .image-edit-stage.overflow-x .image-edit-stage-inner { justify-content:flex-start; }
        .image-edit-stage.overflow-y .image-edit-stage-inner { align-items:flex-start; }
        
        /* 自定义画笔光标 */
        .custom-brush-cursor {
            position: fixed;
            pointer-events: none;
            border: 2px solid rgba(8, 145, 178, 0.8);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            z-index: 10000;
            display: none;
            box-shadow: 0 0 4px rgba(8, 145, 178, 0.4);
        }
        .custom-brush-cursor.active {
            display: block;
        }
        
        /* 资产按钮样式 - 绝对定位在节点右上角，关闭按钮左侧 */
        .image-asset-btn-absolute {
            position: absolute;
            top: 8px;
            right: 36px;
            height: 26px;
            padding: 0 10px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--muted);
            background: var(--card);
            border: 1px solid var(--line);
            cursor: pointer;
            transition: all 0.15s var(--ease);
            font-size: 11px;
            font-weight: 800;
            z-index: 10;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            white-space: nowrap;
        }
        .image-asset-btn-absolute:hover {
            color: var(--strong);
            border-color: var(--strong);
            background: var(--card-solid);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        .image-caption-wrap {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
        }
        .image-caption-wrap .image-caption {
            flex: 1;
            min-width: 0;
        }
        .image-asset-btn {
            flex: 0 0 auto;
            width: 22px;
            height: 22px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--muted);
            background: var(--soft);
            border: 1px solid var(--line);
            cursor: pointer;
            transition: all 0.15s var(--ease);
            padding: 0;
        }
        .image-asset-btn:hover {
            color: var(--strong);
            border-color: var(--strong);
            background: var(--soft-2);
        }
    `;
    document.head.appendChild(style);
}

/**
 * 创建自定义画笔光标元素
 */
function createBrushCursorElement() {
    let cursor = document.getElementById('customBrushCursor');
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'customBrushCursor';
        cursor.className = 'custom-brush-cursor';
        document.body.appendChild(cursor);
    }
    return cursor;
}

/**
 * 更新自定义画笔光标位置和大小
 */
function updateBrushCursorPosition(clientX, clientY) {
    const cursor = document.getElementById('customBrushCursor');
    if (!cursor) return;
    
    cursor.style.left = clientX + 'px';
    cursor.style.top = clientY + 'px';
}

/**
 * 更新自定义画笔光标大小
 */
function updateBrushCursorSize(displaySize) {
    const cursor = document.getElementById('customBrushCursor');
    if (!cursor) return;
    
    cursor.style.width = displaySize + 'px';
    cursor.style.height = displaySize + 'px';
}

/**
 * 显示自定义画笔光标
 */
function showBrushCursor() {
    const cursor = document.getElementById('customBrushCursor');
    if (cursor) cursor.classList.add('active');
}

/**
 * 隐藏自定义画笔光标
 */
function hideBrushCursor() {
    const cursor = document.getElementById('customBrushCursor');
    if (cursor) cursor.classList.remove('active');
}

/**
 * 设置裁剪器事件监听
 */
function setupCropEventListeners() {
    const cropBox = document.getElementById('cropBox');
    const cropHandle = document.getElementById('cropHandle');
    
    if (cropBox) {
        cropBox.addEventListener('mousedown', event => beginCropDrag(event, 'move'));
    }
    if (cropHandle) {
        cropHandle.addEventListener('mousedown', event => beginCropDrag(event, 'resize'));
    }
    
    // 全局裁剪事件监听（在 init 时设置，确保函数已定义）
    window.addEventListener('mousemove', event => {
        updateCropDrag(event);
    });

    window.addEventListener('mouseup', () => {
        stopCropDrag();
    });
}

/**
 * 创建新的 image 节点
 */
function addImageNode(point) {
    const p = point || imageNodeDeps.defaultPoint(-120, 0);
    imageNodeDeps.addNode({
        id: imageNodeDeps.uid('img'),
        type: 'image',
        x: p.x,
        y: p.y,
        w: 260,  // 默认宽度
        h: 336,  // 默认高度
        url: '',
        name: '空白图片'
    });
}

/**
 * 批量上传图片到画布
 */
async function uploadImages(files, point) {
    if (!imageNodeDeps.ensureCanvas()) return;
    const imgs = [...files].filter(file => file.type.startsWith('image/'));
    if (!imgs.length) return;
    const form = new FormData();
    imgs.forEach(file => form.append('files', file));
    form.append('canvas_id', window.canvas?.id || '');
    const data = await fetch('/api/ai/upload', { method: 'POST', body: form }).then(r => r.json());
    const base = point || imageNodeDeps.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    (data.files || []).forEach((file, i) => {
        imageNodeDeps.getNodes().push({
            id: imageNodeDeps.uid('img'),
            type: 'image',
            x: base.x + i * 36,
            y: base.y + i * 36,
            url: file.url,
            name: file.name
        });
    });
    imageNodeDeps.render();
    imageNodeDeps.scheduleSave();
}

/**
 * 填充空白 image 节点
 */
async function fillImageNode(nodeId, files) {
    if (!imageNodeDeps.ensureCanvas()) return;
    const imgs = [...files].filter(file => file.type.startsWith('image/'));
    if (!imgs.length) return;
    const form = new FormData();
    form.append('files', imgs[0]);
    form.append('canvas_id', window.canvas?.id || '');
    try {
        const data = await fetch('/api/ai/upload', { method: 'POST', body: form }).then(r => r.json());
        const file = data.files?.[0];
        const node = imageNodeDeps.findNode(nodeId);
        if (file && node) {
            node.url = file.url;
            node.name = file.name;
            imageNodeDeps.render();
            imageNodeDeps.scheduleSave();
        }
    } catch (error) {
        console.error('[image-node] Upload failed:', error);
    }
}

/**
 * 打开文件选择器为节点选择图片
 */
function pickImageForNode(nodeId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    input.onchange = () => {
        fillImageNode(nodeId, input.files);
        document.body.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
}

/**
 * 检测 DataTransfer items 是否包含图片文件
 */
function hasImageFiles(items) {
    return [...(items || [])].some(item => item.kind === 'file' && item.type.startsWith('image/'));
}

/**
 * 检测 DataTransfer 是否包含 Output 节点的图片拖拽数据
 */
function hasOutputImageDrag(dataTransfer) {
    return [...(dataTransfer?.types || [])].includes('application/x-canvas-output-image');
}

/**
 * 从 Output 节点的 URL 设置图片节点
 */
function setImageNodeFromOutput(nodeId, url) {
    const node = imageNodeDeps.findNode(nodeId);
    if (!node || node.type !== 'image' || !url) return;
    
    node.url = url;
    // 从 URL 提取文件名
    const urlParts = url.split('/');
    node.name = urlParts[urlParts.length - 1] || 'image';
    
    imageNodeDeps.render();
    imageNodeDeps.scheduleSave();
}

/**
 * 清空图片节点
 */
function clearImageNode(nodeId, event = null) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    }
    
    const node = imageNodeDeps.findNode(nodeId);
    if (!node || node.type !== 'image') return;
    
    node.url = '';
    node.name = '空白图片';
    imageNodeDeps.render();
    imageNodeDeps.scheduleSave();
}

/**
 * 处理图片粘贴事件
 */
function handleImagePaste(e) {
    if (!imageNodeDeps.canvas) return false;
    const files = [...(e.clipboardData?.items || [])]
        .filter(x => x.kind === 'file' && x.type.startsWith('image/'))
        .map(x => x.getAsFile());
    if (!files.length) return false;
    
    const blank = [...imageNodeDeps.selected]
        .map(id => imageNodeDeps.findNode(id))
        .find(n => n?.type === 'image' && !n.url);
    
    if (blank) {
        fillImageNode(blank.id, files);
    } else {
        uploadImages(files);
    }
    return true;
}

/**
 * 渲染 image 节点的 DOM 内容
 * @param {Object} node - 节点数据对象
 * @param {HTMLElement} body - 节点的 body 容器
 */
function renderImageNode(node, body) {
    if (node.url) {
        let html = '';
        if (node.mask) {
            html = `<div class="image-container"><img src="${imageNodeDeps.escapeHtml(node.url)}" draggable="false"><img src="${imageNodeDeps.escapeHtml(node.mask)}" class="mask-preview"></div>`;
        } else {
            html = `<img src="${imageNodeDeps.escapeHtml(node.url)}" draggable="false">`;
        }
        
        // 添加 caption 区域和绝对定位的资产按钮
        html += `
            <div class="image-caption">${imageNodeDeps.escapeHtml(node.name || 'image')}</div>
            <button class="image-asset-btn-absolute" onclick="window.openAssetPicker('${imageNodeDeps.escapeHtml(node.id)}')" title="从资产库选择图片">
                资产
            </button>
        `;
        
        body.innerHTML = html;
        body.onmousedown = e => imageNodeDeps.startNodeDrag(e, node);
        
        const loadedImg = body.querySelector('img');
        loadedImg.ondblclick = e => {
            e.preventDefault();
            e.stopPropagation();
            openImageEditor(node.id);
        };
        
        // 添加右键菜单事件
        body.oncontextmenu = e => {
            e.preventDefault();
            e.stopPropagation();
            openImageNodeMenu(node.id, e.clientX, e.clientY);
        };
        
        // 添加拖拽支持(已有图片的节点)
        body.ondragover = e => {
            if (hasImageFiles(e.dataTransfer?.items) || hasOutputImageDrag(e.dataTransfer)) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) ? 'copy' : 'move';
                const previewWrap = body.querySelector('.image-preview-wrap');
                if (previewWrap) previewWrap.classList.add('drag-over');
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
            }
        };
        
        body.ondragleave = e => {
            e.stopPropagation();
            const previewWrap = body.querySelector('.image-preview-wrap');
            if (previewWrap) previewWrap.classList.remove('drag-over');
        };
        
        body.ondrop = e => {
            if (hasOutputImageDrag(e.dataTransfer)) {
                e.preventDefault();
                e.stopPropagation();
                const previewWrap = body.querySelector('.image-preview-wrap');
                if (previewWrap) previewWrap.classList.remove('drag-over');
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
                setImageNodeFromOutput(node.id, e.dataTransfer.getData('application/x-canvas-output-image'));
            } else if (hasImageFiles(e.dataTransfer?.items)) {
                e.preventDefault();
                e.stopPropagation();
                const previewWrap = body.querySelector('.image-preview-wrap');
                if (previewWrap) previewWrap.classList.remove('drag-over');
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
                fillImageNode(node.id, e.dataTransfer.files);
            }
        };
        
        if (loadedImg.complete && loadedImg.naturalHeight > 0) {
            requestAnimationFrame(imageNodeDeps.refreshGeometry);
        } else {
            loadedImg.onload = () => imageNodeDeps.refreshGeometryAfterLayout();
        }
    } else {
        // 空白图片节点也显示资产按钮
        body.innerHTML = `
            <div class="blank-image">
                <i data-lucide="image-plus" class="w-7 h-7"></i>
                <div class="text-[11px] font-bold">点击、拖拽或粘贴图片</div>
            </div>
            <button class="image-asset-btn-absolute" onclick="window.openAssetPicker('${imageNodeDeps.escapeHtml(node.id)}')" title="从资产库选择图片">
                资产
            </button>
        `;
        const blank = body.querySelector('.blank-image');
        blank.onclick = (e) => {
            e.stopPropagation();
            pickImageForNode(node.id);
        };
        blank.ondragover = e => {
            if (hasImageFiles(e.dataTransfer?.items) || hasOutputImageDrag(e.dataTransfer)) {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) ? 'copy' : 'move';
                blank.classList.add('drag-over');
                // 关闭全局拖拽覆盖层
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
            }
        };
        blank.ondragleave = e => {
            e.stopPropagation();
            blank.classList.remove('drag-over');
        };
        blank.ondrop = e => {
            if (hasOutputImageDrag(e.dataTransfer)) {
                e.preventDefault();
                e.stopPropagation();
                blank.classList.remove('drag-over');
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
                setImageNodeFromOutput(node.id, e.dataTransfer.getData('application/x-canvas-output-image'));
            } else if (hasImageFiles(e.dataTransfer?.items)) {
                e.preventDefault();
                e.stopPropagation();
                blank.classList.remove('drag-over');
                const dropOverlay = document.getElementById('dropOverlay');
                if (dropOverlay) dropOverlay.classList.remove('active');
                fillImageNode(node.id, e.dataTransfer.files);
            }
        };
    }
    
    if (imageNodeDeps.refreshIcons) {
        imageNodeDeps.refreshIcons();
    }
}

/**
 * 获取裁剪画布的尺寸
 */
function cropBounds() {
    const img = document.getElementById('cropImage');
    return { w: img.clientWidth || 1, h: img.clientHeight || 1 };
}

/**
 * 渲染裁剪框位置
 */
function renderCropBox() {
    if (!cropState) return;
    const box = document.getElementById('cropBox');
    box.style.left = `${cropState.x}px`;
    box.style.top = `${cropState.y}px`;
    box.style.width = `${cropState.w}px`;
    box.style.height = `${cropState.h}px`;
}

/**
 * 重置裁剪框到默认位置
 */
function resetCropBox() {
    if (!cropState) return;
    const { w, h } = cropBounds();
    cropState.x = Math.round(w * 0.08);
    cropState.y = Math.round(h * 0.08);
    cropState.w = Math.round(w * 0.84);
    cropState.h = Math.round(h * 0.84);
    renderCropBox();
}

/**
 * 限制裁剪框在图片范围内
 */
function clampCrop() {
    if (!cropState) return;
    const { w, h } = cropBounds();
    cropState.w = Math.max(24, Math.min(cropState.w, w));
    cropState.h = Math.max(24, Math.min(cropState.h, h));
    cropState.x = Math.max(0, Math.min(cropState.x, w - cropState.w));
    cropState.y = Math.max(0, Math.min(cropState.y, h - cropState.h));
}

/**
 * 打开图片编辑器
 */
function openImageEditor(nodeId) {
    const node = imageNodeDeps.findNode(nodeId);
    if (!node?.url) return;
    
    maskState.nodeId = nodeId;
    cropState = { nodeId, x: 0, y: 0, w: 0, h: 0 };
    maskState.mode = 'mask';
    
    const modal = document.getElementById('imageEditModal');
    const img = document.getElementById('cropImage');
    
    modal.classList.add('open');
    img.onload = () => {
        resetCropBox();
        resetImageEditZoom();
        switchEditorMode('mask');
        if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
    };
    img.crossOrigin = 'anonymous';
    img.src = node.url;
    
    if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
}

/**
 * 关闭图片编辑器
 */
function closeImageEditor() {
    const modal = document.getElementById('imageEditModal');
    if (modal) {
        modal.classList.remove('open');
    }
    cropState = null;
    cropDrag = null;
    maskState.nodeId = null;
    maskState.drawing = false;
    imageEditMode = 'crop';
    imageEditorZoom.scale = 1;
    
    // 恢复光标
    const img = document.getElementById('cropImage');
    const maskOverlay = document.getElementById('maskOverlay');
    const editDrawCanvas = document.getElementById('editDrawCanvas');
    
    if (img) img.style.cursor = '';
    if (maskOverlay) {
        maskOverlay.style.cursor = '';
        maskOverlay.onmouseenter = null;
        maskOverlay.onmouseleave = null;
        maskOverlay.onmousemove = null;
    }
    if (editDrawCanvas) {
        editDrawCanvas.style.cursor = '';
        editDrawCanvas.onmouseenter = null;
        editDrawCanvas.onmouseleave = null;
        editDrawCanvas.onmousemove = null;
    }
    hideBrushCursor();
    
    const overlay = document.getElementById('maskOverlay');
    if (overlay) {
        overlay.getContext('2d').clearRect(0, 0, overlay.width, overlay.height);
        
        if (maskEventHandlers.mousedown) {
            overlay.removeEventListener('mousedown', maskEventHandlers.mousedown);
        }
        if (maskEventHandlers.mousemove) {
            overlay.removeEventListener('mousemove', maskEventHandlers.mousemove);
        }
        if (maskEventHandlers.mouseup) {
            overlay.removeEventListener('mouseup', maskEventHandlers.mouseup);
        }
        if (maskEventHandlers.mouseleave) {
            overlay.removeEventListener('mouseleave', maskEventHandlers.mouseleave);
        }
    }
}

/**
 * 应用图片编辑区缩放
 */
function applyImageEditZoom() {
    const img = document.getElementById('cropImage');
    if (!img || !img.naturalWidth) return;
    
    const oldW = img.clientWidth;
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.width = Math.round(img.naturalWidth * imageEditorZoom.scale) + 'px';
    img.style.height = Math.round(img.naturalHeight * imageEditorZoom.scale) + 'px';
    
    // 调整绘制画布尺寸（需要保存内容）
    const editCanvas = document.getElementById('editDrawCanvas');
    if (editCanvas) {
        // 保存当前绘制内容
        let savedContent = null;
        if (editCanvas.width > 0 && editCanvas.height > 0) {
            try {
                savedContent = editCanvas.toDataURL('image/png');
            } catch (e) {
                // 如果无法保存（如跨域问题），则忽略
                savedContent = null;
            }
        }
        
        // 调整尺寸（会清除内容）
        editCanvas.width = img.naturalWidth;
        editCanvas.height = img.naturalHeight;
        editCanvas.style.width = `${img.clientWidth}px`;
        editCanvas.style.height = `${img.clientHeight}px`;
        
        // 恢复保存的内容
        if (savedContent) {
            const ctx = editCanvas.getContext('2d');
            const restoreImg = new Image();
            restoreImg.onload = function() {
                ctx.drawImage(restoreImg, 0, 0, editCanvas.width, editCanvas.height);
            };
            restoreImg.src = savedContent;
        }
    }
    
    // 调整遮罩画布显示尺寸
    const maskOverlay = document.getElementById('maskOverlay');
    if (maskOverlay && maskOverlay.width > 0) {
        maskOverlay.style.width = `${img.clientWidth}px`;
        maskOverlay.style.height = `${img.clientHeight}px`;
    }
    
    // 按比例同步裁剪框位置
    if (cropState && oldW > 0) {
        const scale = img.clientWidth / oldW;
        cropState.x = Math.round(cropState.x * scale);
        cropState.y = Math.round(cropState.y * scale);
        cropState.w = Math.round(cropState.w * scale);
        cropState.h = Math.round(cropState.h * scale);
        clampCrop();
        renderCropBox();
    }
    
    // 刷新宫格预览
    if (imageEditMode === 'grid') refreshGridSplitPreview();
    
    // 更新缩放标签
    _updateZoomLabel();
}

/**
 * 重置图片编辑区缩放
 */
function resetImageEditZoom() {
    const stage = document.getElementById('imageEditStage');
    const img = document.getElementById('cropImage');
    
    imageEditorZoom.scale = 1.0;
    
    if (img) {
        img.style.maxWidth = '';
        img.style.maxHeight = '';
        img.style.width = '';
        img.style.height = '';
    }
    
    applyImageEditZoom();
    
    if (stage) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
    }
}

/**
 * 更新缩放标签显示
 */
function _updateZoomLabel() {
    const el = document.getElementById('imageEditZoomLabel');
    if (el) el.textContent = Math.round(imageEditorZoom.scale * 100) + '%';
}

/**
 * 设置图片编辑区滚轮缩放事件
 */
function setupImageEditZoom() {
    const stage = document.getElementById('imageEditStage');
    if (!stage) return;
    
    // 移除旧的事件监听器(如果存在)
    if (stage._wheelHandler) {
        stage.removeEventListener('wheel', stage._wheelHandler, { passive: false });
    }
    
    const wheelHandler = function(event) {
        if (!cropState) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const oldZoom = imageEditorZoom.scale;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        imageEditorZoom.scale = Math.max(0.15, Math.min(6.0, imageEditorZoom.scale * factor));
        
        // 焦点缩放：保持鼠标指向的图片位置不动
        const stageRect = stage.getBoundingClientRect();
        const mx = event.clientX - stageRect.left;
        const my = event.clientY - stageRect.top;
        const contentX = stage.scrollLeft + mx;
        const contentY = stage.scrollTop + my;
        
        applyImageEditZoom();
        
        const scale = imageEditorZoom.scale / oldZoom;
        stage.scrollLeft = contentX * scale - mx;
        stage.scrollTop = contentY * scale - my;
    };
    
    stage.addEventListener('wheel', wheelHandler, { passive: false });
    stage._wheelHandler = wheelHandler;
    
    // 全局光标更新监听器（确保光标流畅移动）
    if (!window.__brushCursorMouseMoveHandler) {
        window.__brushCursorMouseMoveHandler = function(e) {
            const cursor = document.getElementById('customBrushCursor');
            if (cursor && cursor.classList.contains('active')) {
                cursor.style.left = e.clientX + 'px';
                cursor.style.top = e.clientY + 'px';
            }
        };
        document.addEventListener('mousemove', window.__brushCursorMouseMoveHandler);
    }
}

/**
 * 设置图片编辑模式
 */
function setImageEditMode(mode) {
    if (['crop', 'mask', 'brush', 'grid'].includes(mode)) {
        imageEditMode = mode;
        switchEditorMode(mode);
    }
}

function switchEditorMode(mode) {
    imageEditMode = mode;
    maskState.mode = mode;
    
    const cropTab = document.getElementById('cropTab');
    const maskTab = document.getElementById('maskTab');
    const brushTab = document.getElementById('brushTab');
    const gridTab = document.getElementById('gridTab');
    const cropBox = document.getElementById('cropBox');
    const maskOverlay = document.getElementById('maskOverlay');
    const editDrawCanvas = document.getElementById('editDrawCanvas');
    const maskToolbar = document.getElementById('maskToolbar');
    const brushToolbar = document.getElementById('brushToolbar');
    const gridToolbar = document.getElementById('gridToolbar');
    const editorTitle = document.getElementById('imageEditTitle');
    const editorSub = document.getElementById('imageEditSub');
    const editorResetBtn = document.getElementById('editorResetBtn');
    const editorApplyText = document.getElementById('editorApplyText');
    const editorApplyBtn = document.getElementById('editorApplyBtn');
    const cropIcon = editorApplyBtn.querySelector('.apply-icon-crop');
    const maskIcon = editorApplyBtn.querySelector('.apply-icon-mask');
    const brushIcon = editorApplyBtn.querySelector('.apply-icon-brush');
    const gridIcon = editorApplyBtn.querySelector('.apply-icon-grid');
    const img = document.getElementById('cropImage');
    
    // 隐藏所有工具和控件
    if (cropBox) cropBox.style.display = 'none';
    if (maskOverlay) maskOverlay.style.display = 'none';
    if (editDrawCanvas) editDrawCanvas.style.display = 'none';
    if (maskToolbar) maskToolbar.style.display = 'none';
    if (brushToolbar) brushToolbar.style.display = 'none';
    if (gridToolbar) gridToolbar.style.display = 'none';
    
    // 重置所有标签样式
    [cropTab, maskTab, brushTab, gridTab].forEach(tab => {
        if (tab) {
            tab.classList.remove('active');
            tab.style.background = '#f0f9ff';
            tab.style.color = '#0891b2';
            tab.style.border = '1px solid #cffafe';
        }
    });
    
    // 移除旧的光标事件监听
    if (img) img.style.cursor = '';
    if (maskOverlay) {
        maskOverlay.style.cursor = '';
        maskOverlay.onmouseenter = null;
        maskOverlay.onmouseleave = null;
        maskOverlay.onmousemove = null;
    }
    if (editDrawCanvas) {
        editDrawCanvas.style.cursor = '';
        editDrawCanvas.onmouseenter = null;
        editDrawCanvas.onmouseleave = null;
        editDrawCanvas.onmousemove = null;
    }
    hideBrushCursor();
    
    if (mode === 'crop') {
        if (cropTab) {
            cropTab.classList.add('active');
            cropTab.style.background = '#0891b2';
            cropTab.style.color = '#fff';
            cropTab.style.border = 'none';
        }
        if (cropBox) cropBox.style.display = 'block';
        if (editorResetBtn) editorResetBtn.style.display = 'flex';
        if (editorTitle) editorTitle.textContent = '裁剪图片';
        if (editorSub) editorSub.textContent = '拖动裁剪框移动，拖右下角调整大小';
        if (editorApplyText) editorApplyText.textContent = '应用裁剪';
        if (cropIcon) cropIcon.style.display = '';
        if (maskIcon) maskIcon.style.display = 'none';
        if (brushIcon) brushIcon.style.display = 'none';
        if (gridIcon) gridIcon.style.display = 'none';
        editorApplyBtn.setAttribute('onclick', 'window.imageNodeModule.applyImageCrop()');
    } else if (mode === 'mask') {
        if (maskTab) {
            maskTab.classList.add('active');
            maskTab.style.background = '#0891b2';
            maskTab.style.color = '#fff';
            maskTab.style.border = 'none';
        }
        if (maskOverlay) maskOverlay.style.display = 'block';
        if (maskToolbar) maskToolbar.style.display = 'flex';
        if (editorResetBtn) editorResetBtn.style.display = 'none';
        if (editorTitle) editorTitle.textContent = '遮罩编辑器';
        if (editorSub) editorSub.textContent = '用画笔绘制遮罩区域,白色为遮罩部分';
        if (editorApplyText) editorApplyText.textContent = '应用遮罩';
        if (maskIcon) maskIcon.style.display = '';
        if (cropIcon) cropIcon.style.display = 'none';
        if (brushIcon) brushIcon.style.display = 'none';
        if (gridIcon) gridIcon.style.display = 'none';
        editorApplyBtn.setAttribute('onclick', 'window.imageNodeModule.applyMask()');
        setTimeout(() => initMaskCanvas(), 50);
        
        // 添加遮罩模式的光标事件（绑定到 maskOverlay）
        if (maskOverlay) {
            maskOverlay.style.cursor = 'none';
            maskOverlay.onmouseenter = () => {
                createBrushCursorElement();
                const displaySize = maskState.brushSize * imageEditorZoom.scale;
                updateBrushCursorSize(displaySize);
                showBrushCursor();
            };
            maskOverlay.onmouseleave = () => hideBrushCursor();
            maskOverlay.onmousemove = (e) => {
                updateBrushCursorPosition(e.clientX, e.clientY);
            };
        }
    } else if (mode === 'brush') {
        if (brushTab) {
            brushTab.classList.add('active');
            brushTab.style.background = '#0891b2';
            brushTab.style.color = '#fff';
            brushTab.style.border = 'none';
        }
        if (editDrawCanvas) {
            editDrawCanvas.style.display = 'block';
            editDrawCanvas.style.pointerEvents = 'auto';
        }
        if (brushToolbar) brushToolbar.style.display = 'flex';
        if (editorResetBtn) editorResetBtn.style.display = 'none';
        if (editorTitle) editorTitle.textContent = '画笔编辑器';
        if (editorSub) editorSub.textContent = '用画笔在图片上自由绘画';
        if (editorApplyText) editorApplyText.textContent = '应用画笔';
        if (brushIcon) brushIcon.style.display = '';
        if (cropIcon) cropIcon.style.display = 'none';
        if (maskIcon) maskIcon.style.display = 'none';
        if (gridIcon) gridIcon.style.display = 'none';
        editorApplyBtn.setAttribute('onclick', 'window.imageNodeModule.applyImageBrush()');
        setTimeout(() => initBrushCanvas(), 50);
        syncBrushToolButtons();
    } else if (mode === 'grid') {
        if (gridTab) {
            gridTab.classList.add('active');
            gridTab.style.background = '#0891b2';
            gridTab.style.color = '#fff';
            gridTab.style.border = 'none';
        }
        if (editDrawCanvas) {
            editDrawCanvas.style.display = 'block';
            editDrawCanvas.style.pointerEvents = 'none';
        }
        if (gridToolbar) gridToolbar.style.display = 'flex';
        if (editorResetBtn) editorResetBtn.style.display = 'none';
        if (editorTitle) editorTitle.textContent = '宫格切分';
        if (editorSub) editorSub.textContent = '设置切割线数量,预览切割效果';
        if (editorApplyText) editorApplyText.textContent = '应用切分';
        if (gridIcon) gridIcon.style.display = '';
        if (cropIcon) cropIcon.style.display = 'none';
        if (maskIcon) maskIcon.style.display = 'none';
        if (brushIcon) brushIcon.style.display = 'none';
        editorApplyBtn.setAttribute('onclick', 'window.imageNodeModule.applyImageGridSplit()');
        setTimeout(() => initGridSplitPreview(), 50);
    }
    
    if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
}

function initMaskCanvas() {
    const overlay = document.getElementById('maskOverlay');
    const img = document.getElementById('cropImage');
    if (!overlay || !img || !img.naturalWidth) return;
    
    // 使用图片的自然尺寸作为遮罩画布尺寸
    overlay.width = img.naturalWidth;
    overlay.height = img.naturalHeight;
    // 设置显示尺寸与图片一致
    overlay.style.width = `${img.clientWidth}px`;
    overlay.style.height = `${img.clientHeight}px`;
    
    const ctx = overlay.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    maskEventHandlers.mousedown = function(e) {
        if (maskState.mode !== 'mask') return;
        e.preventDefault();
        e.stopPropagation();
        maskState.drawing = true;
        
        // 保存历史快照
        pushMaskHistory();
        
        // 计算鼠标位置在自然尺寸下的坐标
        const rect = overlay.getBoundingClientRect();
        const scaleX = overlay.width / rect.width;
        const scaleY = overlay.height / rect.height;
        maskState.lastX = (e.clientX - rect.left) * scaleX;
        maskState.lastY = (e.clientY - rect.top) * scaleY;
        
        ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.beginPath();
        ctx.arc(maskState.lastX, maskState.lastY, maskState.brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
        
        syncMaskHistoryButtons();
    };
    
    maskEventHandlers.mousemove = function(e) {
        if (!maskState.drawing || maskState.mode !== 'mask') return;
        e.preventDefault();
        
        // 计算鼠标位置在自然尺寸下的坐标
        const rect = overlay.getBoundingClientRect();
        const scaleX = overlay.width / rect.width;
        const scaleY = overlay.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
        ctx.lineWidth = maskState.brushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(maskState.lastX, maskState.lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        
        maskState.lastX = x;
        maskState.lastY = y;
    };
    
    maskEventHandlers.mouseup = function() {
        maskState.drawing = false;
    };
    
    maskEventHandlers.mouseleave = function() {
        maskState.drawing = false;
    };
    
    overlay.addEventListener('mousedown', maskEventHandlers.mousedown);
    overlay.addEventListener('mousemove', maskEventHandlers.mousemove);
    overlay.addEventListener('mouseup', maskEventHandlers.mouseup);
    overlay.addEventListener('mouseleave', maskEventHandlers.mouseleave);
    
    const node = imageNodeDeps.findNode(maskState.nodeId);
    if (node?.mask) {
        const maskImg = new Image();
        maskImg.crossOrigin = 'anonymous';
        maskImg.onload = () => {
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            ctx.drawImage(maskImg, 0, 0, overlay.width, overlay.height);
        };
        maskImg.src = node.mask;
    }
}

function beginMaskDraw(event) {
    if (maskState.mode !== 'mask') return;
    event.preventDefault();
    event.stopPropagation();
    maskState.drawing = true;
    const overlay = document.getElementById('maskOverlay');
    const rect = overlay.getBoundingClientRect();
    maskState.lastX = event.clientX - rect.left;
    maskState.lastY = event.clientY - rect.top;
    
    const ctx = overlay.getContext('2d');
    ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.beginPath();
    ctx.arc(maskState.lastX, maskState.lastY, maskState.brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawMask(event) {
    if (!maskState.drawing || maskState.mode !== 'mask') return;
    event.preventDefault();
    
    const overlay = document.getElementById('maskOverlay');
    const rect = overlay.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const ctx = overlay.getContext('2d');
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.lineWidth = maskState.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    ctx.moveTo(maskState.lastX, maskState.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    
    maskState.lastX = x;
    maskState.lastY = y;
}

function stopMaskDraw() {
    maskState.drawing = false;
}

function updateBrushSize(size) {
    maskState.brushSize = parseInt(size);
    document.getElementById('brushSizeLabel').textContent = `${size}px`;
    
    // 同步更新光标大小
    const displaySize = maskState.brushSize * imageEditorZoom.scale;
    updateBrushCursorSize(displaySize);
}

function clearMask() {
    pushMaskHistory();
    const overlay = document.getElementById('maskOverlay');
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    syncMaskHistoryButtons();
}

function fillMask() {
    pushMaskHistory();
    const overlay = document.getElementById('maskOverlay');
    const ctx = overlay.getContext('2d');
    ctx.fillStyle = 'rgba(59, 130, 246, 0.6)';
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    syncMaskHistoryButtons();
}

/**
 * 保存遮罩历史快照（用于撤销）
 */
function pushMaskHistory() {
    const overlay = document.getElementById('maskOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    maskUndoStack.push(ctx.getImageData(0, 0, overlay.width, overlay.height));
    if (maskUndoStack.length > MASK_HISTORY_MAX) maskUndoStack.shift();
    maskRedoStack = [];
    syncMaskHistoryButtons();
}

/**
 * 同步遮罩撤销/重做按钮状态
 */
function syncMaskHistoryButtons() {
    const undoBtn = document.getElementById('maskUndoBtn');
    const redoBtn = document.getElementById('maskRedoBtn');
    if (undoBtn) {
        undoBtn.disabled = !maskUndoStack.length;
        undoBtn.style.opacity = maskUndoStack.length ? '1' : '.4';
    }
    if (redoBtn) {
        redoBtn.disabled = !maskRedoStack.length;
        redoBtn.style.opacity = maskRedoStack.length ? '1' : '.4';
    }
}

/**
 * 撤销遮罩操作
 */
function undoMaskDrawing() {
    if (!maskUndoStack.length) return;
    const overlay = document.getElementById('maskOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    maskRedoStack.push(ctx.getImageData(0, 0, overlay.width, overlay.height));
    const snapshot = maskUndoStack.pop();
    ctx.putImageData(snapshot, 0, 0);
    syncMaskHistoryButtons();
}

/**
 * 重做遮罩操作
 */
function redoMaskDrawing() {
    if (!maskRedoStack.length) return;
    const overlay = document.getElementById('maskOverlay');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    maskUndoStack.push(ctx.getImageData(0, 0, overlay.width, overlay.height));
    const snapshot = maskRedoStack.pop();
    ctx.putImageData(snapshot, 0, 0);
    syncMaskHistoryButtons();
}

/**
 * 开始拖拽裁剪框
 */
function beginCropDrag(event, mode) {
    if (!cropState) return;
    event.preventDefault();
    event.stopPropagation();
    cropDrag = { mode, sx: event.clientX, sy: event.clientY, start: { ...cropState } };
}

/**
 * 更新拖拽位置
 */
function updateCropDrag(event) {
    if (!cropDrag || !cropState) return;
    const dx = event.clientX - cropDrag.sx;
    const dy = event.clientY - cropDrag.sy;
    if (cropDrag.mode === 'move') {
        cropState.x = cropDrag.start.x + dx;
        cropState.y = cropDrag.start.y + dy;
    } else {
        cropState.w = cropDrag.start.w + dx;
        cropState.h = cropDrag.start.h + dy;
    }
    clampCrop();
    renderCropBox();
}

/**
 * 停止拖拽
 */
function stopCropDrag() {
    cropDrag = null;
}

/**
 * 上传裁剪后的 blob
 */
async function uploadCroppedBlob(blob, name) {
    const form = new FormData();
    form.append('files', blob, name);
    form.append('canvas_id', window.canvas?.id || '');
    const data = await fetch('/api/ai/upload', { method: 'POST', body: form }).then(r => r.json());
    return data.files?.[0];
}

/**
 * 应用裁剪并上传
 */
async function applyImageCrop() {
    if (!cropState) return;
    const node = imageNodeDeps.findNode(cropState.nodeId);
    const img = document.getElementById('cropImage');
    if (!node || !img.naturalWidth || !img.naturalHeight) return;
    
    const scaleX = img.naturalWidth / (img.clientWidth || 1);
    const scaleY = img.naturalHeight / (img.clientHeight || 1);
    const sx = Math.max(0, Math.round(cropState.x * scaleX));
    const sy = Math.max(0, Math.round(cropState.y * scaleY));
    const sw = Math.max(1, Math.round(cropState.w * scaleX));
    const sh = Math.max(1, Math.round(cropState.h * scaleY));
    
    const canvasEl = document.createElement('canvas');
    canvasEl.width = sw;
    canvasEl.height = sh;
    canvasEl.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    
    const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
    if (!blob) return;
    
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const file = await uploadCroppedBlob(blob, `${base}_crop.png`);
    if (file) {
        node.url = file.url;
        node.name = file.name;
        closeImageEditor();
        imageNodeDeps.render();
        imageNodeDeps.scheduleSave();
    }
}

async function applyMask() {
    const overlay = document.getElementById('maskOverlay');
    const img = document.getElementById('cropImage');
    const node = imageNodeDeps.findNode(maskState.nodeId);
    
    if (!node || !img.naturalWidth || !img.naturalHeight) return;
    
    // overlay 已经是自然尺寸，直接处理
    const ctx = overlay.getContext('2d');
    const imageData = ctx.getImageData(0, 0, overlay.width, overlay.height);
    const data = imageData.data;
    
    // 转换为黑白遮罩
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha > 50) {
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 255;
        } else {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            data[i + 3] = 255;
        }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const maskDataUrl = overlay.toDataURL('image/png');
    node.mask = maskDataUrl;
    
    closeImageEditor();
    imageNodeDeps.render();
    imageNodeDeps.scheduleSave();
}

/**
 * 初始化画笔画布
 */
function initBrushCanvas() {
    const overlay = document.getElementById('editDrawCanvas');
    const img = document.getElementById('cropImage');
    if (!overlay || !img || !img.naturalWidth) return;
    
    overlay.width = img.naturalWidth;
    overlay.height = img.naturalHeight;
    overlay.style.width = `${img.clientWidth}px`;
    overlay.style.height = `${img.clientHeight}px`;
    
    const ctx = overlay.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    // 重置历史记录
    brushUndoStack = [];
    brushRedoStack = [];
    brushLabelCounter = 1;
    syncBrushHistoryButtons();
    
    // 清理事件监听
    overlay.onmousedown = null;
    overlay.onmousemove = null;
    overlay.onmouseup = null;
    overlay.onmouseleave = null;
    
    overlay.onmousedown = function(e) {
        if (imageEditMode !== 'brush') return;
        e.preventDefault();
        e.stopPropagation();
        
        const rect = overlay.getBoundingClientRect();
        const scaleX = overlay.width / rect.width;
        const scaleY = overlay.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // 数字标签和标志工具：点击即绘制，不需要拖拽
        if (brushState.tool === 'label') {
            pushBrushHistory();
            drawNumberLabel(x, y);
            syncBrushHistoryButtons();
            return;
        }
        if (brushState.tool === 'mark') {
            pushBrushHistory();
            drawMarkFlag(x, y);
            syncBrushHistoryButtons();
            return;
        }
        
        // 自由画笔、矩形、椭圆：需要保存历史并开始拖拽
        pushBrushHistory();
        brushState.drawing = true;
        brushState.lastX = x;
        brushState.lastY = y;
        brushState.startX = x;
        brushState.startY = y;
        
        // 对于形状工具，保存当前画布快照用于预览
        if (brushState.tool !== 'free') {
            brushState.snapshot = ctx.getImageData(0, 0, overlay.width, overlay.height);
        } else {
            // 自由画笔：直接绘制起始点
            ctx.fillStyle = brushState.brushColor;
            ctx.beginPath();
            ctx.arc(x, y, brushState.brushSize / 2, 0, Math.PI * 2);
            ctx.fill();
        }
    };
    
    overlay.onmousemove = function(e) {
        if (!brushState.drawing || imageEditMode !== 'brush') return;
        e.preventDefault();
        
        const rect = overlay.getBoundingClientRect();
        const scaleX = overlay.width / rect.width;
        const scaleY = overlay.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        if (brushState.tool === 'free') {
            // 自由画笔：连续绘制线条
            ctx.strokeStyle = brushState.brushColor;
            ctx.lineWidth = brushState.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            ctx.beginPath();
            ctx.moveTo(brushState.lastX, brushState.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
        } else if (brushState.tool === 'rect' || brushState.tool === 'ellipse') {
            // 形状工具：恢复快照后绘制预览
            if (brushState.snapshot) {
                ctx.putImageData(brushState.snapshot, 0, 0);
            }
            drawBrushShape(ctx, { x: brushState.startX, y: brushState.startY }, { x, y });
        }
        
        brushState.lastX = x;
        brushState.lastY = y;
    };
    
    overlay.onmouseup = function() {
        brushState.drawing = false;
        brushState.snapshot = null;
        syncBrushHistoryButtons();
    };
    
    overlay.onmouseleave = function() {
        brushState.drawing = false;
        brushState.snapshot = null;
        hideBrushCursor();
        syncBrushHistoryButtons();
    };
    
    // 添加光标显示事件
    overlay.style.cursor = 'none';
    overlay.onmouseenter = function(e) {
        createBrushCursorElement();
        const displaySize = brushState.brushSize * imageEditorZoom.scale;
        updateBrushCursorSize(displaySize);
        showBrushCursor();
    };
}

/**
 * 更新画笔大小
 */
function updatePaintBrushSize(size) {
    brushState.brushSize = parseInt(size);
    const label = document.getElementById('paintBrushSizeLabel');
    if (label) label.textContent = `${size}px`;
    
    // 同步更新光标大小
    const displaySize = brushState.brushSize * imageEditorZoom.scale;
    updateBrushCursorSize(displaySize);
}

/**
 * 更新画笔颜色
 */
function updatePaintBrushColor(color) {
    brushState.brushColor = color;
}

/**
 * 设置当前画笔工具
 */
function setBrushTool(tool) {
    brushState.tool = ['free', 'rect', 'ellipse', 'mark', 'label'].includes(tool) ? tool : 'free';
    syncBrushToolButtons();
}

/**
 * 同步画笔工具按钮样式
 */
function syncBrushToolButtons() {
    document.querySelectorAll('[data-brush-tool]').forEach(btn => {
        const active = btn.dataset.brushTool === brushState.tool;
        btn.classList.toggle('primary', active);
        btn.classList.toggle('secondary', !active);
    });
}

/**
 * 获取画笔绘图上下文
 */
function getBrushCtx() {
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return null;
    return overlay.getContext('2d');
}

/**
 * 设置画笔样式
 */
function setupBrushStyle(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushState.brushSize;
    ctx.strokeStyle = brushState.brushColor;
    ctx.fillStyle = brushState.brushColor;
    ctx.globalCompositeOperation = 'source-over';
}

/**
 * 保存画笔历史快照（用于撤销）
 */
function pushBrushHistory() {
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    brushUndoStack.push({
        imageData: ctx.getImageData(0, 0, overlay.width, overlay.height),
        labelCounter: brushLabelCounter
    });
    if (brushUndoStack.length > BRUSH_HISTORY_MAX) brushUndoStack.shift();
    brushRedoStack = [];
    syncBrushHistoryButtons();
}

/**
 * 恢复画笔历史快照
 */
function restoreBrushSnapshot(snapshot) {
    if (!snapshot) return;
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.putImageData(snapshot.imageData, 0, 0);
    if (snapshot.labelCounter) brushLabelCounter = snapshot.labelCounter;
}

/**
 * 同步撤销/重做按钮状态
 */
function syncBrushHistoryButtons() {
    const undoBtn = document.getElementById('brushUndoBtn');
    const redoBtn = document.getElementById('brushRedoBtn');
    if (undoBtn) {
        undoBtn.disabled = !brushUndoStack.length;
        undoBtn.style.opacity = brushUndoStack.length ? '1' : '.4';
    }
    if (redoBtn) {
        redoBtn.disabled = !brushRedoStack.length;
        redoBtn.style.opacity = brushRedoStack.length ? '1' : '.4';
    }
}

/**
 * 撤销画笔操作
 */
function undoBrushDrawing() {
    if (!brushUndoStack.length) return;
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    brushRedoStack.push({
        imageData: ctx.getImageData(0, 0, overlay.width, overlay.height),
        labelCounter: brushLabelCounter
    });
    const snapshot = brushUndoStack.pop();
    restoreBrushSnapshot(snapshot);
    syncBrushHistoryButtons();
}

/**
 * 重做画笔操作
 */
function redoBrushDrawing() {
    if (!brushRedoStack.length) return;
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    brushUndoStack.push({
        imageData: ctx.getImageData(0, 0, overlay.width, overlay.height),
        labelCounter: brushLabelCounter
    });
    const snapshot = brushRedoStack.pop();
    restoreBrushSnapshot(snapshot);
    syncBrushHistoryButtons();
}

/**
 * 绘制带圈数字
 */
function circledNumber(n) {
    if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
    return String(n);
}

/**
 * 绘制数字标签
 */
function drawNumberLabel(x, y) {
    const ctx = getBrushCtx();
    if (!ctx) return;
    const size = Math.max(18, brushState.brushSize * 2.2);
    const text = circledNumber(brushLabelCounter++);
    
    ctx.save();
    ctx.font = `900 ${size}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = brushState.brushColor;
    ctx.fillText(text, x, y);
    ctx.restore();
}

/**
 * 绘制标志（旗帜图标）
 */
function drawMarkFlag(x, y) {
    const ctx = getBrushCtx();
    if (!ctx) return;
    const size = Math.max(24, brushState.brushSize * 2.5);
    
    ctx.save();
    ctx.translate(x, y);
    
    // 旗杆
    ctx.strokeStyle = 'rgba(2,6,23,0.72)';
    ctx.lineWidth = size / 10;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(0, size);
    ctx.stroke();
    
    // 旗面
    ctx.fillStyle = brushState.brushColor;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.8, -size * 0.6);
    ctx.lineTo(0, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    
    // 旗面描边
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = size / 20;
    ctx.stroke();
    
    ctx.restore();
}

/**
 * 绘制形状（矩形或椭圆）
 */
function drawBrushShape(ctx, start, end, preview = false) {
    setupBrushStyle(ctx);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    
    if (brushState.tool === 'rect') {
        ctx.strokeRect(x, y, w, h);
    } else if (brushState.tool === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * 清空画笔绘制内容
 */
function clearBrushDrawing() {
    const overlay = document.getElementById('editDrawCanvas');
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    brushUndoStack = [];
    brushRedoStack = [];
    brushLabelCounter = 1;
    syncBrushHistoryButtons();
}

/**
 * 应用画笔绘制结果
 */
async function applyImageBrush() {
    const overlay = document.getElementById('editDrawCanvas');
    const img = document.getElementById('cropImage');
    const node = imageNodeDeps.findNode(maskState.nodeId);
    
    if (!node || !img.naturalWidth || !img.naturalHeight) return;
    
    // 创建临时 Canvas 合并原图和画笔
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    const tempCtx = tempCanvas.getContext('2d');
    
    // 绘制原图
    tempCtx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
    
    // 绘制画笔内容
    tempCtx.drawImage(overlay, 0, 0);
    
    // 上传合并后的图片
    const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const form = new FormData();
    form.append('files', blob, `${base}_brush.png`);
    form.append('canvas_id', window.canvas?.id || '');
    
    try {
        const data = await fetch('/api/ai/upload', { method: 'POST', body: form }).then(r => r.json());
        const file = data.files?.[0];
        if (file) {
            node.url = file.url;
            node.name = file.name;
            closeImageEditor();
            imageNodeDeps.render();
            imageNodeDeps.scheduleSave();
        }
    } catch (error) {
        console.error('[image-node] Brush apply failed:', error);
    }
}

/**
 * 初始化宫格切分预览
 */
function initGridSplitPreview() {
    const overlay = document.getElementById('editDrawCanvas');
    const img = document.getElementById('cropImage');
    if (!overlay || !img || !img.naturalWidth) return;
    
    overlay.width = img.naturalWidth;
    overlay.height = img.naturalHeight;
    overlay.style.width = `${img.clientWidth}px`;
    overlay.style.height = `${img.clientHeight}px`;
    
    syncGridGapValue();
    refreshGridSplitPreview();
}

/**
 * 刷新宫格切分预览
 */
function refreshGridSplitPreview() {
    const overlay = document.getElementById('editDrawCanvas');
    const img = document.getElementById('cropImage');
    if (!overlay || !img || !img.naturalWidth) return;
    
    // 从 DOM 输入框读取最新值
    const hLines = Math.max(0, Math.min(20, Number(document.getElementById('gridHorizontalLines')?.value || 0)));
    const vLines = Math.max(0, Math.min(20, Number(document.getElementById('gridVerticalLines')?.value || 0)));
    const gap = Math.max(0, Math.min(240, Number(document.getElementById('gridGapSize')?.value || 0)));
    
    // 更新状态
    gridState.horizontalLines = hLines;
    gridState.verticalLines = vLines;
    gridState.gapSize = gap;
    
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    
    if (imageEditMode !== 'grid') return;
    
    const w = overlay.width;
    const h = overlay.height;
    const lineWidth = Math.max(2, Math.round(Math.min(w, h) / 320));
    
    // 绘制辅助线函数:白色实线带黑色描边
    const drawGuideLine = (x1, y1, x2, y2) => {
        ctx.save();
        ctx.lineWidth = lineWidth + 2;
        ctx.strokeStyle = 'rgba(2,6,23,0.72)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.restore();
    };
    
    if (!gridState.customMode) {
        // 常规模式:按行列数切割
        
        // 更新切割计数显示
        const splitCount = (hLines + 1) * (vLines + 1);
        const countLabel = document.getElementById('gridSplitCount');
        if (countLabel) countLabel.textContent = `将切分为 ${splitCount} 张图片`;
        
        // 计算实际的行列数(线条数+1)
        const cols = vLines + 1;
        const rows = hLines + 1;
        
        // 绘制垂直线
        for (let i = 1; i < cols; i++) {
            const x = i * w / cols;
            if (gap > 0) {
                drawGuideLine(x - gap / 2, 0, x - gap / 2, h);
                drawGuideLine(x + gap / 2, 0, x + gap / 2, h);
            } else {
                drawGuideLine(x, 0, x, h);
            }
        }
        
        // 绘制水平线
        for (let i = 1; i < rows; i++) {
            const y = i * h / rows;
            if (gap > 0) {
                drawGuideLine(0, y - gap / 2, w, y - gap / 2);
                drawGuideLine(0, y + gap / 2, w, y + gap / 2);
            } else {
                drawGuideLine(0, y, w, y);
            }
        }
    } else {
        // 自定义模式:绘制自定义切割线
        const countLabel = document.getElementById('gridSplitCount');
        if (countLabel) countLabel.textContent = `将切分为 ${gridState.customLines.length + 1} 张图片`;
        
        gridState.customLines.forEach(line => {
            if (line.orientation === 'h') {
                const y = line.position * h;
                if (gap > 0) {
                    drawGuideLine(0, y - gap / 2, w, y - gap / 2);
                    drawGuideLine(0, y + gap / 2, w, y + gap / 2);
                } else {
                    drawGuideLine(0, y, w, y);
                }
            } else {
                const x = line.position * w;
                if (gap > 0) {
                    drawGuideLine(x - gap / 2, 0, x - gap / 2, h);
                    drawGuideLine(x + gap / 2, 0, x + gap / 2, h);
                } else {
                    drawGuideLine(x, 0, x, h);
                }
            }
        });
    }
}

/**
 * 切换自定义宫格模式
 */
function toggleGridCustomMode() {
    gridState.customMode = !gridState.customMode;
    gridState.customLines = [];
    
    const regularControls = document.getElementById('gridRegularControls');
    const customControls = document.getElementById('gridCustomControls');
    const customToggle = document.getElementById('gridCustomToggle');
    
    if (regularControls) regularControls.style.display = gridState.customMode ? 'none' : 'contents';
    if (customControls) customControls.style.display = gridState.customMode ? 'flex' : 'none';
    if (customToggle) {
        customToggle.classList.toggle('primary', gridState.customMode);
        customToggle.classList.toggle('secondary', !gridState.customMode);
    }
    
    refreshGridSplitPreview();
}

/**
 * 设置自定义切割线方向
 */
function setGridCustomOrientation(orientation) {
    gridState.customOrientation = orientation;
    
    const orientH = document.getElementById('gridOrientH');
    const orientV = document.getElementById('gridOrientV');
    
    if (orientH) {
        orientH.classList.toggle('primary', orientation === 'h');
        orientH.classList.toggle('secondary', orientation !== 'h');
    }
    if (orientV) {
        orientV.classList.toggle('primary', orientation === 'v');
        orientV.classList.toggle('secondary', orientation !== 'v');
    }
}

/**
 * 撤销上一条自定义切割线
 */
function undoGridCustomLine() {
    gridState.customLines.pop();
    refreshGridSplitPreview();
    
    const undoBtn = document.getElementById('gridUndoBtn');
    if (undoBtn) {
        undoBtn.disabled = gridState.customLines.length === 0;
        undoBtn.style.opacity = gridState.customLines.length === 0 ? '0.4' : '1';
    }
}

/**
 * 清除所有自定义切割线
 */
function clearGridCustomLines() {
    gridState.customLines = [];
    refreshGridSplitPreview();
    
    const undoBtn = document.getElementById('gridUndoBtn');
    if (undoBtn) {
        undoBtn.disabled = true;
        undoBtn.style.opacity = '0.4';
    }
}

/**
 * 同步切割间隔显示值
 */
function syncGridGapValue() {
    const gapInput = document.getElementById('gridGapSize');
    const gapValue = document.getElementById('gridGapValue');
    if (gapInput && gapValue) {
        const gap = Math.max(0, Math.min(240, Number(gapInput.value || 0)));
        gridState.gapSize = gap;
        gapValue.textContent = `${gap}`;
    }
}

/**
 * 应用宫格切分并上传图片
 */
async function applyImageGridSplit() {
    const img = document.getElementById('cropImage');
    const node = imageNodeDeps.findNode(maskState.nodeId);
    
    if (!node || !img.naturalWidth || !img.naturalHeight) return;
    
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const gap = gridState.gapSize;
    
    let cutPositions = [];
    
    if (!gridState.customMode) {
        // 常规模式:计算切割位置
        const hLines = gridState.horizontalLines;
        const vLines = gridState.verticalLines;
        
        const yPositions = [0];
        for (let i = 1; i <= hLines; i++) {
            yPositions.push((h / (hLines + 1)) * i);
        }
        yPositions.push(h);
        
        const xPositions = [0];
        for (let i = 1; i <= vLines; i++) {
            xPositions.push((w / (vLines + 1)) * i);
        }
        xPositions.push(w);
        
        // 生成所有切分区域
        for (let row = 0; row < yPositions.length - 1; row++) {
            for (let col = 0; col < xPositions.length - 1; col++) {
                cutPositions.push({
                    x: xPositions[col] + gap / 2,
                    y: yPositions[row] + gap / 2,
                    w: xPositions[col + 1] - xPositions[col] - gap,
                    h: yPositions[row + 1] - yPositions[row] - gap
                });
            }
        }
    } else {
        // 自定义模式
        const xCuts = [0];
        const yCuts = [0];
        
        gridState.customLines.forEach(line => {
            if (line.orientation === 'h') {
                yCuts.push(line.position * h);
            } else {
                xCuts.push(line.position * w);
            }
        });
        
        xCuts.push(w);
        yCuts.push(h);
        
        for (let row = 0; row < yCuts.length - 1; row++) {
            for (let col = 0; col < xCuts.length - 1; col++) {
                cutPositions.push({
                    x: xCuts[col] + gap / 2,
                    y: yCuts[row] + gap / 2,
                    w: xCuts[col + 1] - xCuts[col] - gap,
                    h: yCuts[row + 1] - yCuts[row] - gap
                });
            }
        }
    }
    
    // 切分并上传所有图片
    const base = (node.name || 'image').replace(/\.[^.]+$/, '');
    const uploadedFiles = [];
    
    for (let i = 0; i < cutPositions.length; i++) {
        const cut = cutPositions[i];
        
        if (cut.w < 10 || cut.h < 10) continue; // 跳过太小的切分
        
        const canvasEl = document.createElement('canvas');
        canvasEl.width = Math.round(cut.w);
        canvasEl.height = Math.round(cut.h);
        const ctx = canvasEl.getContext('2d');
        
        ctx.drawImage(img, cut.x, cut.y, cut.w, cut.h, 0, 0, cut.w, cut.h);
        
        const blob = await new Promise(resolve => canvasEl.toBlob(resolve, 'image/png'));
        if (!blob) continue;
        
        const form = new FormData();
        form.append('files', blob, `${base}_grid_${i + 1}.png`);
        form.append('canvas_id', window.canvas?.id || '');
        
        try {
            const data = await fetch('/api/ai/upload', { method: 'POST', body: form }).then(r => r.json());
            const file = data.files?.[0];
            if (file) uploadedFiles.push(file);
        } catch (error) {
            console.error(`[image-node] Grid split ${i + 1} failed:`, error);
        }
    }
    
    if (uploadedFiles.length > 0) {
        // 更新第一个节点为第一张图片
        node.url = uploadedFiles[0].url;
        node.name = uploadedFiles[0].name;
        
        // 创建其他图片节点
        const basePoint = { x: Number(node.x || 0), y: Number(node.y || 0) };
        const cols = Math.min(4, Math.ceil(Math.sqrt(uploadedFiles.length)));
        
        for (let i = 1; i < uploadedFiles.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            imageNodeDeps.getNodes().push({
                id: imageNodeDeps.uid('img'),
                type: 'image',
                x: basePoint.x + 24 + col * 284,
                y: basePoint.y + 58 + row * 394,
                w: 260,
                h: 336,
                url: uploadedFiles[i].url,
                name: uploadedFiles[i].name
            });
        }
        
        closeImageEditor();
        imageNodeDeps.render();
        imageNodeDeps.scheduleSave();
    }
}

function applyCurrentMode() {
    if (imageEditMode === 'crop') {
        applyImageCrop();
    } else if (imageEditMode === 'mask') {
        applyMask();
    } else if (imageEditMode === 'brush') {
        applyImageBrush();
    } else if (imageEditMode === 'grid') {
        applyImageGridSplit();
    }
}

async function uploadImageWithMask(imageUrl, maskUrl) {
    const [imgResp, maskResp] = await Promise.all([
        fetch(imageUrl),
        fetch(maskUrl)
    ]);
    
    const imgBitmap = await imgResp.blob();
    const maskBitmap = await maskResp.blob();
    
    const img = await createImageBitmap(imgBitmap);
    const mask = await createImageBitmap(maskBitmap);
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    
    ctx.drawImage(img, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = mask.width;
    maskCanvas.height = mask.height;
    const maskCtx = maskCanvas.getContext('2d');
    maskCtx.drawImage(mask, 0, 0);
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
    
    for (let i = 0; i < data.length; i += 4) {
        const maskR = maskData[i];
        const maskG = maskData[i + 1];
        const maskB = maskData[i + 2];
        const maskBrightness = (maskR + maskG + maskB) / 3;
        
        data[i + 3] = maskBrightness;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            const filename = `mask_image_${Date.now()}.png`;
            const form = new FormData();
            form.append('files', blob, filename);
            const data = await fetch('/api/upload', {method:'POST', body:form}).then(r => r.json());
            resolve(data.files?.[0]?.comfy_name || filename);
        }, 'image/png');
    });
}

async function uploadMaskOnly(maskUrl) {
    const maskResp = await fetch(maskUrl);
    const maskBitmap = await maskResp.blob();
    const mask = await createImageBitmap(maskBitmap);
    
    const canvas = document.createElement('canvas');
    canvas.width = mask.width;
    canvas.height = mask.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(mask, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const maskR = data[i];
        const maskG = data[i + 1];
        const maskB = data[i + 2];
        const maskBrightness = (maskR + maskG + maskB) / 3;
        
        data[i] = maskBrightness;
        data[i + 1] = maskBrightness;
        data[i + 2] = maskBrightness;
        data[i + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            const filename = `mask_${Date.now()}.png`;
            const form = new FormData();
            form.append('files', blob, filename);
            const data = await fetch('/api/upload', {method:'POST', body:form}).then(r => r.json());
            resolve(data.files?.[0]?.comfy_name || filename);
        }, 'image/png');
    });
}

/**
 * 打开图片节点右键菜单
 */
function openImageNodeMenu(nodeId, clientX, clientY) {
    const node = imageNodeDeps.findNode(nodeId);
    if (!node || node.type !== 'image') return;
    
    const imageNodeMenu = document.getElementById('imageNodeMenu');
    if (!imageNodeMenu) return;
    
    // 关闭其他菜单
    closeCreateMenu();
    
    const hasUrl = !!node.url;
    
    // 设置菜单内容
    imageNodeMenu.innerHTML = `
        <button class="menu-btn" data-image-replace="${imageNodeDeps.escapeHtml(nodeId)}"><i data-lucide="image-plus" class="w-4 h-4"></i><span>替换</span></button>
        ${hasUrl ? `
        <div class="menu-divider"></div>
        <button class="menu-btn" data-image-to-asset="${imageNodeDeps.escapeHtml(nodeId)}"><i data-lucide="folder-open" class="w-4 h-4"></i><span>发送到资产库</span></button>
        ` : ''}
    `;
    imageNodeMenu.style.left = `${clientX}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    
    // 绑定替换按钮事件
    imageNodeMenu.querySelector('[data-image-replace]').onclick = e => {
        e.stopPropagation();
        closeImageNodeMenu();
        pickImageForNode(nodeId);
    };
    
    // 绑定发送到资产库事件
    const assetBtn = imageNodeMenu.querySelector('[data-image-to-asset]');
    if (assetBtn) {
        assetBtn.onclick = async e => {
            e.stopPropagation();
            closeImageNodeMenu();
            const url = node.url;
            if (url) {
                await window.sendToAssetLibrary(url);
                if (window.canvas) {
                    window.openAssetLibrary();
                }
            }
        };
    }
    
    if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
}

/**
 * 关闭图片节点右键菜单
 */
function closeImageNodeMenu() {
    const imageNodeMenu = document.getElementById('imageNodeMenu');
    if (imageNodeMenu) {
        imageNodeMenu.classList.remove('open');
        imageNodeMenu.classList.remove('output-node-menu');
        imageNodeMenu.innerHTML = '';
    }
}

/**
 * 关闭所有创建菜单(辅助函数)
 */
function closeCreateMenu() {
    const menus = ['createMenu', 'linkCreateMenu', 'nodeInputMenu', 'nodeOutputMenu', 'imageNodeMenu'];
    menus.forEach(id => {
        const menu = document.getElementById(id);
        if (menu) {
            menu.classList.remove('open');
            menu.innerHTML = '';
        }
    });
}

// 导出到全局
window.imageNodeModule = {
    // 现有函数
    init,
    addImageNode,
    uploadImages,
    fillImageNode,
    pickImageForNode,
    renderImageNode,
    openImageEditor,
    closeImageEditor,
    hasImageFiles,
    handleImagePaste,
    beginCropDrag,
    applyImageCrop,
    resetCropBox,
    switchEditorMode,
    initMaskCanvas,
    beginMaskDraw,
    drawMask,
    stopMaskDraw,
    updateBrushSize,
    clearMask,
    fillMask,
    undoMaskDrawing,
    redoMaskDrawing,
    applyMask,
    applyCurrentMode,
    uploadImageWithMask,
    uploadMaskOnly,
    
    // 新增函数
    openImageNodeMenu,
    closeImageNodeMenu,
    closeCreateMenu,
    hasOutputImageDrag,
    setImageNodeFromOutput,
    clearImageNode,
    setImageEditMode,
    initBrushCanvas,
    updatePaintBrushSize,
    updatePaintBrushColor,
    setBrushTool,
    undoBrushDrawing,
    redoBrushDrawing,
    clearBrushDrawing,
    applyImageBrush,
    initGridSplitPreview,
    refreshGridSplitPreview,
    toggleGridCustomMode,
    setGridCustomOrientation,
    undoGridCustomLine,
    clearGridCustomLines,
    applyImageGridSplit,
    syncGridGapValue,
    applyImageEditZoom,
    resetImageEditZoom,
    setupImageEditZoom,
    
    // 资产选择器
    openAssetPicker,
    closeAssetPicker,
    applyAssetToNode
};

window.uploadImageWithMask = uploadImageWithMask;
window.uploadMaskOnly = uploadMaskOnly;
window.setImageNodeFromOutput = setImageNodeFromOutput;
window.clearImageNode = clearImageNode;
window.openImageNodeMenu = openImageNodeMenu;
window.closeImageNodeMenu = closeImageNodeMenu;
window.applyCurrentMode = applyCurrentMode;
window.resetImageEditZoom = resetImageEditZoom;

/**
 * 打开资产选择器浮层
 * @param {string} nodeId - 当前图片节点 ID
 */
function openAssetPicker(nodeId) {
    const node = imageNodeDeps.findNode(nodeId);
    if (!node || node.type !== 'image') return;
    
    if (!window.canvas) {
        alert('请先打开画布');
        return;
    }
    
    assetPickerState.currentNodeId = nodeId;
    assetPickerState.loading = true;
    
    // 创建或获取浮层元素
    let overlay = document.getElementById('assetPickerOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'assetPickerOverlay';
        overlay.className = 'asset-picker-overlay';
        overlay.onclick = e => {
            if (e.target === overlay) closeAssetPicker();
        };
        document.body.appendChild(overlay);
    }
    
    // 创建内容
    overlay.innerHTML = `
        <div class="asset-picker-panel" onclick="event.stopPropagation()">
            <div class="asset-picker-head">
                <div class="asset-picker-title">
                    <i data-lucide="folder-open" class="w-4 h-4"></i>
                    <span>选择资产图片</span>
                </div>
                <button class="asset-picker-close" onclick="closeAssetPicker()">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <div id="assetPickerContent" class="asset-picker-content"></div>
        </div>
    `;
    
    const content = document.getElementById('assetPickerContent');
    
    // 显示加载状态
    content.innerHTML = `
        <div class="asset-picker-empty">
            <div class="spinner"></div>
            <span>加载资产图片...</span>
        </div>
    `;
    
    overlay.classList.add('open');
    
    // 请求资产列表
    loadAssetPickerImages();
    
    if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
}

/**
 * 加载资产库中的图片
 */
async function loadAssetPickerImages() {
    if (!window.canvas) return;
    
    const content = document.getElementById('assetPickerContent');
    if (!content) return;
    
    try {
        const res = await fetch(`/api/canvases/${window.canvas.id}/assets`);
        if (!res.ok) throw new Error('获取资产列表失败');
        
        const data = await res.json();
        const files = data.files || [];
        
        // 过滤图片类型资产
        const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
        const images = files.filter(f => {
            const ext = (f.name || '').split('.').pop().toLowerCase();
            return imageExts.includes(ext);
        });
        
        renderAssetPickerGrid(images);
    } catch (e) {
        content.innerHTML = `
            <div class="asset-picker-empty">
                <i data-lucide="alert-circle" class="w-8 h-8"></i>
                <span>加载失败: ${imageNodeDeps.escapeHtml(e.message || e)}</span>
            </div>
        `;
        if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
    }
}

/**
 * 渲染资产图片网格
 * @param {Array} images - 图片资产数组
 */
function renderAssetPickerGrid(images) {
    const content = document.getElementById('assetPickerContent');
    if (!content) return;
    
    const nodeId = assetPickerState.currentNodeId;
    
    if (!images.length) {
        content.innerHTML = `
            <div class="asset-picker-empty">
                <i data-lucide="image-off" class="w-8 h-8"></i>
                <span>暂无图片资产</span>
                <span style="font-size:10px;color:var(--faint);font-weight:400;">请先上传图片到资产库</span>
            </div>
        `;
    } else {
        content.innerHTML = `
            <div class="asset-picker-grid">
                ${images.map(img => `
                    <div class="asset-picker-item" onclick="window.applyAssetToNode('${imageNodeDeps.escapeHtml(nodeId)}', '${imageNodeDeps.escapeHtml(img.url)}', '${imageNodeDeps.escapeHtml(img.name)}')">
                        <img src="${imageNodeDeps.escapeHtml(img.url)}" alt="${imageNodeDeps.escapeHtml(img.name)}" loading="lazy">
                        <div class="asset-picker-item-name">${imageNodeDeps.escapeHtml(img.name)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (imageNodeDeps.refreshIcons) imageNodeDeps.refreshIcons();
}

/**
 * 关闭资产选择器浮层
 */
function closeAssetPicker() {
    const overlay = document.getElementById('assetPickerOverlay');
    if (overlay) {
        overlay.classList.remove('open');
    }
    assetPickerState.currentNodeId = null;
    assetPickerState.loading = false;
}

/**
 * 应用资产图片到节点
 * @param {string} nodeId - 节点 ID
 * @param {string} url - 图片 URL
 * @param {string} name - 图片名称
 */
function applyAssetToNode(nodeId, url, name) {
    const node = imageNodeDeps.findNode(nodeId);
    if (!node || node.type !== 'image') {
        closeAssetPicker();
        return;
    }
    
    // 更新节点数据
    node.url = url;
    node.name = name;
    
    // 渲染并保存
    imageNodeDeps.render();
    imageNodeDeps.scheduleSave();
    
    // 关闭浮层
    closeAssetPicker();
}

// 全局暴露资产选择器函数
window.openAssetPicker = openAssetPicker;
window.closeAssetPicker = closeAssetPicker;
window.applyAssetToNode = applyAssetToNode;
