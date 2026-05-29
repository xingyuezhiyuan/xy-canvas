/**
 * 独立图像编辑器模块
 * 提供裁剪、画笔两种编辑模式
 * 不依赖 canvas 上下文，可嵌入任何页面使用
 *
 * 使用方法:
 *   ImageEditor.open(imageUrl, {
 *       onSave: function(result) { console.log(result.url); },
 *       onCancel: function() {}
 *   });
 */

(function() {
    'use strict';

    var E = {};
    var opts = null;
    var currentImageUrl = '';
    var cropState = null;
    var cropDrag = null;
    var editMode = 'crop';
    var zoomState = { scale: 1 };

    var brushState = {
        drawing: false, brushSize: 14, brushColor: '#ff2d55',
        lastX: 0, lastY: 0, tool: 'free', startX: 0, startY: 0, snapshot: null
    };
    var brushUndoStack = [], brushRedoStack = [], BRUSH_HISTORY_MAX = 40, brushLabelCounter = 1;

    var outpaintState = {
        expandLeft: 0, expandRight: 0, expandTop: 0, expandBottom: 0,
        dragging: null, startMouse: null, startExpands: null
    };

    function el(id) { return document.getElementById(id); }

    function injectCSS() {
        if (el('ie-styles')) return;
        var s = document.createElement('style');
        s.id = 'ie-styles';
        s.textContent = [
            '.ie-modal{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(248,250,252,.42);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}',
            '.ie-modal.open{display:flex}',
            '.ie-panel{width:min(1480px,calc(100vw - 36px));height:min(980px,calc(100vh - 36px));border-radius:22px;background:#fff;border:1px solid #e8edf3;box-shadow:0 30px 90px rgba(15,23,42,.22);padding:14px;display:flex;flex-direction:column;gap:10px}',
            '.ie-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
            '.ie-title{font-size:13px;font-weight:900;color:#111827}',
            '.ie-sub{margin-top:3px;color:#94a3b8;font-size:11px;font-weight:600}',
            '.ie-stage{flex:1;min-height:0;border-radius:20px;background:#f8fafc;border:1px solid #edf2f7;overflow:auto}',
            '.ie-stage-inner{min-width:100%;min-height:100%;width:max-content;height:max-content;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;margin:auto}',
            '.ie-wrap{position:relative;display:inline-block;line-height:0;user-select:none}',
            '.ie-wrap img{display:block;max-width:min(820px,calc(100vw - 108px));max-height:62vh;border-radius:14px;background:#f8fafc}',
            '.ie-crop{position:absolute;left:10%;top:10%;width:80%;height:80%;border:2px solid #f8fafc;box-shadow:0 0 0 9999px rgba(15,23,42,.48),0 12px 30px rgba(15,23,42,.2);border-radius:10px;cursor:move}',
            '.ie-handle{position:absolute;right:-7px;bottom:-7px;width:18px;height:18px;border-radius:999px;background:#fff;border:2px solid #111827;cursor:nwse-resize}',
            '.ie-tabs{display:flex;gap:8px;margin-bottom:8px}',
            '.ie-tab{height:32px;border-radius:999px;padding:0 14px;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;cursor:pointer;border:1px solid #cffafe;background:#f0f9ff;color:#0891b2}',
            '.ie-tab.active{background:#0891b2;color:#fff;border:none}',
            '.ie-actions{display:flex;justify-content:flex-end;gap:8px}',
            '.ie-btn{height:38px;border-radius:999px;padding:0 14px;display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;cursor:pointer;border:none}',
            '.ie-btn.secondary{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}',
            '.ie-btn.secondary:hover{background:#e2e8f0;color:#111827}',
            '.ie-btn.primary{background:#111827;color:#fff}',
            '.ie-btn.primary:hover{background:#000}',
            '.ie-btn:disabled{opacity:.4;cursor:default}',
            '.ie-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0}',
            '.ie-bar label{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#64748b}',
            '.ie-bar input[type=range]{width:100px}',
            '.ie-bar input[type=color]{width:40px;height:28px;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer}',
            '.ie-bar button{height:28px;padding:0 12px;border-radius:999px;display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;cursor:pointer}',
            '.ie-draw{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
            '.ie-cur{position:fixed;pointer-events:none;border:2px solid rgba(8,145,178,.8);border-radius:50%;transform:translate(-50%,-50%);z-index:100000;display:none;box-shadow:0 0 4px rgba(8,145,178,.4)}',
            '.ie-cur.active{display:block}',
            '.ie-op-frame{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5}',
            '.ie-op-region{position:absolute;pointer-events:auto;background:rgba(255,255,255,.15);outline:1px dashed rgba(8,145,178,.5);cursor:default}',
            '.ie-op-handle{position:absolute;width:14px;height:14px;margin:-7px;border-radius:999px;background:#0891b2;border:2px solid #fff;box-shadow:0 1px 4px rgba(15,23,42,.3)}',
            '.ie-op-handle.l{top:50%;left:0;cursor:w-resize}.ie-op-handle.r{top:50%;right:0;cursor:e-resize}.ie-op-handle.t{top:0;left:50%;cursor:n-resize}.ie-op-handle.b{bottom:0;left:50%;cursor:s-resize}',
            '.ie-op-handle.tl{top:0;left:0;cursor:nw-resize}.ie-op-handle.tr{top:0;right:0;cursor:ne-resize}.ie-op-handle.bl{bottom:0;left:0;cursor:sw-resize}.ie-op-handle.br{bottom:0;right:0;cursor:se-resize}',
            '.ie-op-size{position:absolute;bottom:-26px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:800;color:#0891b2;background:rgba(255,255,255,.9);padding:2px 8px;border-radius:6px;white-space:nowrap;pointer-events:none}',
            '.theme-dark .ie-modal{background:rgba(2,6,23,.65)}',
            '.theme-dark .ie-panel{background:#0f172a;border-color:rgba(148,163,184,.15);box-shadow:0 30px 90px rgba(0,0,0,.5)}',
            '.theme-dark .ie-title{color:#f1f5f9}',
            '.theme-dark .ie-sub{color:#64748b}',
            '.theme-dark .ie-stage{background:#020617;border-color:rgba(148,163,184,.12)}',
            '.theme-dark .ie-wrap img{background:#020617}',
            '.theme-dark .ie-crop{border-color:rgba(255,255,255,.6);box-shadow:0 0 0 9999px rgba(0,0,0,.6),0 12px 30px rgba(0,0,0,.4)}',
            '.theme-dark .ie-handle{background:#1e293b;border-color:#94a3b8}',
            '.theme-dark .ie-tab{background:rgba(8,145,178,.12);border-color:rgba(8,145,178,.3);color:#22d3ee}',
            '.theme-dark .ie-tab.active{background:#0891b2;color:#fff;border:none}',
            '.theme-dark .ie-btn.secondary{background:rgba(148,163,184,.12);color:#94a3b8;border-color:rgba(148,163,184,.2)}',
            '.theme-dark .ie-btn.secondary:hover{background:rgba(148,163,184,.2);color:#f1f5f9}',
            '.theme-dark .ie-btn.primary{background:#22d3ee;color:#020617}',
            '.theme-dark .ie-btn.primary:hover{background:#06b6d4}',
            '.theme-dark .ie-bar{background:#020617;border-color:rgba(148,163,184,.15)}',
            '.theme-dark .ie-bar label{color:#94a3b8}',
            '.theme-dark .ie-bar input[type=color]{border-color:rgba(148,163,184,.25)}',
            '.theme-dark .ie-op-handle{background:#22d3ee;border-color:#020617;box-shadow:0 1px 4px rgba(0,0,0,.5)}',
            '.theme-dark .ie-op-size{background:rgba(15,23,42,.9);color:#22d3ee}'
        ].join('');
        document.head.appendChild(s);
    }

    function buildModal() {
        if (el('ieModal')) return;
        var div = document.createElement('div');
        div.id = 'ieModal';
        div.className = 'ie-modal';
        div.onclick = function(e) { if (e.target === div) cancel(); };

        div.innerHTML = '<div class="ie-panel" onclick="event.stopPropagation()">'
            + '<div class="ie-head"><div>'
            + '<div class="ie-tabs">'
            + '<button class="ie-tab active" id="ieTabCrop" onclick="ImageEditor._sw(\'crop\')">裁剪</button>'
            + '<button class="ie-tab" id="ieTabBrush" onclick="ImageEditor._sw(\'brush\')">画笔</button>'
            + '<button class="ie-tab" id="ieTabOutpaint" onclick="ImageEditor._sw(\'outpaint\')">扩图</button>'
            + '</div>'
            + '<div class="ie-title" id="ieTitle">裁剪图片</div>'
            + '<div class="ie-sub" id="ieSub">拖动裁剪框移动，拖右下角调整大小</div>'
            + '</div>'
            + '<button class="ie-btn secondary" onclick="ImageEditor.close()" title="关闭" style="flex:0 0 38px">\u2715</button>'
            + '</div>'
            + '<div class="ie-stage" id="ieStage"><div class="ie-stage-inner">'
            + '<div class="ie-wrap" id="ieWrap">'
            + '<img id="ieImg" alt="" crossorigin="anonymous">'
            + '<canvas id="ieDraw" class="ie-draw" style="display:none"></canvas>'
            + '<div id="ieBox" class="ie-crop"><div id="ieHandle" class="ie-handle"></div></div>'
            + '<div id="ieOpFrame" class="ie-op-frame" style="display:none">'
            + '<div id="ieOpRegion" class="ie-op-region">'
            + '<div class="ie-op-handle l" data-op="left"></div>'
            + '<div class="ie-op-handle r" data-op="right"></div>'
            + '<div class="ie-op-handle t" data-op="top"></div>'
            + '<div class="ie-op-handle b" data-op="bottom"></div>'
            + '<div class="ie-op-handle tl" data-op="topleft"></div>'
            + '<div class="ie-op-handle tr" data-op="topright"></div>'
            + '<div class="ie-op-handle bl" data-op="bottomleft"></div>'
            + '<div class="ie-op-handle br" data-op="bottomright"></div>'
            + '<div id="ieOpSize" class="ie-op-size"></div>'
            + '</div></div>'
            + '</div></div></div>'

            // 画笔工具栏
            + '<div id="ieBrushBar" class="ie-bar" style="display:none">'
            + '<button class="ie-btn primary" data-bt="free" onclick="ImageEditor._bt(\'free\')">\u270E</button>'
            + '<button class="ie-btn secondary" data-bt="rect" onclick="ImageEditor._bt(\'rect\')">\u25A1</button>'
            + '<button class="ie-btn secondary" data-bt="ellipse" onclick="ImageEditor._bt(\'ellipse\')">\u25CB</button>'
            + '<button class="ie-btn secondary" data-bt="mark" onclick="ImageEditor._bt(\'mark\')">\u2691</button>'
            + '<button class="ie-btn secondary" data-bt="label" onclick="ImageEditor._bt(\'label\')">#</button>'
            + '<label>颜色: <input id="iePColor" type="color" value="#ff2d55" oninput="ImageEditor._pc(this.value)"></label>'
            + '<label>画笔: <input id="iePSize" type="range" min="2" max="80" value="14" oninput="ImageEditor._ps(this.value)"><span id="iePSL">14px</span></label>'
            + '<button class="ie-btn secondary" id="ieBUndo" onclick="ImageEditor._bUndo()" disabled style="opacity:.4">\u21A9</button>'
            + '<button class="ie-btn secondary" id="ieBRedo" onclick="ImageEditor._bRedo()" disabled style="opacity:.4">\u21AA</button>'
            + '<button class="ie-btn secondary" onclick="ImageEditor._bClr()">\u2718 清空</button>'
            + '</div>'

            + '<div class="ie-actions">'
            + '<button class="ie-btn secondary" onclick="ImageEditor.close()">取消</button>'
            + '<button class="ie-btn primary" id="ieApply" onclick="ImageEditor._apCrop()">'
            + '<span id="ieAIcon" style="display:inline">\u2716</span>'
            + '<span id="ieAT">应用裁剪</span>'
            + '</button>'
            + '</div></div>';

        document.body.appendChild(div);
        bindCropEvents();
        bindOpEvents();
        bindZoom();
    }

    E.open = function(imageUrl, options) {
        opts = options || {};
        currentImageUrl = imageUrl;
        injectCSS();
        buildModal();

        cropState = null;
        brushUndoStack = []; brushRedoStack = []; brushLabelCounter = 1;
        outpaintState.expandLeft = 0; outpaintState.expandRight = 0;
        outpaintState.expandTop = 0; outpaintState.expandBottom = 0;
        outpaintState.dragging = null;
        zoomState.scale = 1;
        editMode = 'crop';

        var img = el('ieImg'), modal = el('ieModal');
        modal.classList.add('open');
        img.onload = function() {
            resetCropBox();
            resetZoom();
            switchMode('crop');
        };
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
    };

    E.close = function() {
        var modal = el('ieModal');
        if (modal) modal.classList.remove('open');
        cleanup();
    };

    E._sw = switchMode;

    function cleanup() {
        cropState = null; cropDrag = null;
        outpaintState.expandLeft = 0; outpaintState.expandRight = 0;
        outpaintState.expandTop = 0; outpaintState.expandBottom = 0;
        outpaintState.dragging = null;
        var img = el('ieImg'), dc = el('ieDraw');
        if (img) img.style.cursor = '';
        if (dc) { dc.style.cursor = ''; dc.onmouseenter = null; dc.onmouseleave = null; dc.onmousemove = null; dc.onmousedown = null; dc.onmousemove = null; dc.onmouseup = null; dc.onmouseleave = null; }
        hideCur();
    }

    function cancel() {
        E.close();
        if (opts && opts.onCancel) opts.onCancel();
    }

    // ---- 裁剪 ----
    function boxB() {
        var img = el('ieImg');
        return { w: img.clientWidth || 1, h: img.clientHeight || 1 };
    }

    function resetCropBox() {
        if (!cropState) { cropState = { x: 0, y: 0, w: 0, h: 0 }; }
        var b = boxB();
        cropState.x = Math.round(b.w * 0.08);
        cropState.y = Math.round(b.h * 0.08);
        cropState.w = Math.round(b.w * 0.84);
        cropState.h = Math.round(b.h * 0.84);
        renderCB();
    }

    function renderCB() {
        if (!cropState) return;
        var box = el('ieBox');
        box.style.left = cropState.x + 'px';
        box.style.top = cropState.y + 'px';
        box.style.width = cropState.w + 'px';
        box.style.height = cropState.h + 'px';
    }

    function clampCrop() {
        if (!cropState) return;
        var b = boxB();
        cropState.w = Math.max(24, Math.min(cropState.w, b.w));
        cropState.h = Math.max(24, Math.min(cropState.h, b.h));
        cropState.x = Math.max(0, Math.min(cropState.x, b.w - cropState.w));
        cropState.y = Math.max(0, Math.min(cropState.y, b.h - cropState.h));
    }

    function bindCropEvents() {
        var box = el('ieBox'), handle = el('ieHandle');
        if (box) box.addEventListener('mousedown', function(e) {
            if (!cropState) return;
            e.preventDefault(); e.stopPropagation();
            cropDrag = { mode: 'move', sx: e.clientX, sy: e.clientY, st: { x: cropState.x, y: cropState.y, w: cropState.w, h: cropState.h } };
        });
        if (handle) handle.addEventListener('mousedown', function(e) {
            if (!cropState) return;
            e.preventDefault(); e.stopPropagation();
            cropDrag = { mode: 'resize', sx: e.clientX, sy: e.clientY, st: { x: cropState.x, y: cropState.y, w: cropState.w, h: cropState.h } };
        });
        window.addEventListener('mousemove', function(e) {
            if (!cropDrag || !cropState) return;
            var dx = e.clientX - cropDrag.sx, dy = e.clientY - cropDrag.sy;
            if (cropDrag.mode === 'move') {
                cropState.x = cropDrag.st.x + dx; cropState.y = cropDrag.st.y + dy;
            } else {
                cropState.w = cropDrag.st.w + dx; cropState.h = cropDrag.st.h + dy;
            }
            clampCrop(); renderCB();
        });
        window.addEventListener('mouseup', function() { cropDrag = null; });
    }

    // ---- 缩放 ----
    function bindZoom() {
        var stage = el('ieStage');
        if (!stage) return;
        if (stage._wh) stage.removeEventListener('wheel', stage._wh, { passive: false });
        stage._wh = function(e) {
            if (!cropState) return;
            e.preventDefault(); e.stopPropagation();
            var old = zoomState.scale;
            zoomState.scale = Math.max(0.15, Math.min(6, zoomState.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
            var r = stage.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, cx = stage.scrollLeft + mx, cy = stage.scrollTop + my;
            applyZoom();
            var s = zoomState.scale / old;
            stage.scrollLeft = cx * s - mx; stage.scrollTop = cy * s - my;
        };
        stage.addEventListener('wheel', stage._wh, { passive: false });
    }

    function applyZoom() {
        var img = el('ieImg');
        if (!img || !img.naturalWidth) return;
        var oldW = img.clientWidth;
        img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
        img.style.width = Math.round(img.naturalWidth * zoomState.scale) + 'px';
        img.style.height = Math.round(img.naturalHeight * zoomState.scale) + 'px';

        var dc = el('ieDraw');
        if (dc) {
            var saved = null;
            if (dc.width > 0 && dc.height > 0) { try { saved = dc.toDataURL('image/png'); } catch(e) {} }
            dc.width = img.naturalWidth; dc.height = img.naturalHeight;
            dc.style.width = img.clientWidth + 'px'; dc.style.height = img.clientHeight + 'px';
            if (saved) { var ri = new Image(); ri.onload = function() { dc.getContext('2d').drawImage(ri, 0, 0, dc.width, dc.height); }; ri.src = saved; }
        }

        if (cropState && oldW > 0) {
            var s = img.clientWidth / oldW;
            cropState.x = Math.round(cropState.x * s); cropState.y = Math.round(cropState.y * s);
            cropState.w = Math.round(cropState.w * s); cropState.h = Math.round(cropState.h * s);
            clampCrop(); renderCB();
        }

        if (editMode === 'outpaint') renderOpFrame();
    }

    function resetZoom() {
        var stage = el('ieStage'), img = el('ieImg');
        zoomState.scale = 1;
        if (img) { img.style.maxWidth = ''; img.style.maxHeight = ''; img.style.width = ''; img.style.height = ''; }
        applyZoom();
        if (stage) { stage.scrollLeft = 0; stage.scrollTop = 0; }
    }

    // ---- 模式切换 ----
    function switchMode(mode) {
        editMode = mode;
        var tabs = { crop: 'ieTabCrop', brush: 'ieTabBrush', outpaint: 'ieTabOutpaint' };
        Object.keys(tabs).forEach(function(k) {
            var tb = el(tabs[k]);
            if (tb) {
                tb.classList.toggle('active', k === mode);
                tb.style.background = k === mode ? '#0891b2' : '#f0f9ff';
                tb.style.color = k === mode ? '#fff' : '#0891b2';
                tb.style.border = k === mode ? 'none' : '1px solid #cffafe';
            }
        });

        var els = {
            box: el('ieBox'), draw: el('ieDraw'), bBar: el('ieBrushBar'),
            title: el('ieTitle'), sub: el('ieSub'), ab: el('ieApply'), at: el('ieAT'), ai: el('ieAIcon'),
            opFrame: el('ieOpFrame')
        };
        var img = el('ieImg'), dc = el('ieDraw');

        if (els.box) els.box.style.display = 'none';
        if (els.draw) els.draw.style.display = 'none';
        if (els.bBar) els.bBar.style.display = 'none';
        if (els.opFrame) els.opFrame.style.display = 'none';

        if (img) img.style.cursor = '';
        if (dc) { dc.style.cursor = ''; dc.onmouseenter = null; dc.onmouseleave = null; dc.onmousemove = null; }
        hideCur();

        if (mode === 'crop') {
            if (els.box) els.box.style.display = 'block';
            if (els.title) els.title.textContent = '裁剪图片';
            if (els.sub) els.sub.textContent = '拖动裁剪框移动，拖右下角调整大小';
            if (els.ai) els.ai.style.display = 'inline';
            if (els.at) els.at.textContent = '应用裁剪';
            els.ab.setAttribute('onclick', 'ImageEditor._apCrop()');
        } else if (mode === 'brush') {
            if (dc) { dc.style.display = 'block'; dc.style.pointerEvents = 'auto'; }
            if (els.bBar) els.bBar.style.display = 'flex';
            if (els.title) els.title.textContent = '画笔编辑器';
            if (els.sub) els.sub.textContent = '用画笔在图片上自由绘画';
            if (els.ai) els.ai.style.display = 'none';
            if (els.at) els.at.textContent = '应用画笔';
            els.ab.setAttribute('onclick', 'ImageEditor._apBrush()');
            setTimeout(initBrush, 50);
            syncBrushTools();
            if (dc) {
                dc.style.cursor = 'none';
                dc.onmouseenter = function() { createCur(); updateCurSize(brushState.brushSize * zoomState.scale); showCur(); };
                dc.onmouseleave = function() { hideCur(); };
            }
        } else if (mode === 'outpaint') {
            if (els.opFrame) els.opFrame.style.display = 'block';
            if (els.title) els.title.textContent = '扩图';
            if (els.sub) els.sub.textContent = '拖动边缘或角上的手柄向四周扩展画布';
            if (els.ai) els.ai.style.display = 'none';
            if (els.at) els.at.textContent = '应用扩图';
            els.ab.setAttribute('onclick', 'ImageEditor._apOutpaint()');
            initOutpaint();
        }
    }

    // ---- 画笔 ----
    function initBrush() {
        var dc = el('ieDraw'), img = el('ieImg');
        if (!dc || !img || !img.naturalWidth) return;
        dc.width = img.naturalWidth; dc.height = img.naturalHeight;
        dc.style.width = img.clientWidth + 'px'; dc.style.height = img.clientHeight + 'px';

        var ctx = dc.getContext('2d');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.clearRect(0, 0, dc.width, dc.height);
        brushUndoStack = []; brushRedoStack = []; brushLabelCounter = 1;
        syncBB();

        dc.onmousedown = null; dc.onmousemove = null; dc.onmouseup = null; dc.onmouseleave = null;

        dc.onmousedown = function(e) {
            if (editMode !== 'brush') return;
            e.preventDefault(); e.stopPropagation();
            var r = dc.getBoundingClientRect(), sx = dc.width / r.width, sy = dc.height / r.height;
            var x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sy;

            if (brushState.tool === 'label') { pushBHist(); drawLbl(x, y); syncBB(); return; }
            if (brushState.tool === 'mark') { pushBHist(); drawFlg(x, y); syncBB(); return; }

            pushBHist();
            brushState.drawing = true; brushState.lastX = x; brushState.lastY = y;
            brushState.startX = x; brushState.startY = y;
            if (brushState.tool !== 'free') { brushState.snapshot = ctx.getImageData(0, 0, dc.width, dc.height); }
            else { ctx.fillStyle = brushState.brushColor; ctx.beginPath(); ctx.arc(x, y, brushState.brushSize / 2, 0, Math.PI * 2); ctx.fill(); }
        };

        dc.onmousemove = function(e) {
            if (!brushState.drawing || editMode !== 'brush') return;
            e.preventDefault();
            var r = dc.getBoundingClientRect(), sx = dc.width / r.width, sy = dc.height / r.height;
            var x = (e.clientX - r.left) * sx, y = (e.clientY - r.top) * sy;
            if (brushState.tool === 'free') {
                ctx.strokeStyle = brushState.brushColor; ctx.lineWidth = brushState.brushSize;
                ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(brushState.lastX, brushState.lastY); ctx.lineTo(x, y); ctx.stroke();
            } else if (brushState.tool === 'rect' || brushState.tool === 'ellipse') {
                if (brushState.snapshot) ctx.putImageData(brushState.snapshot, 0, 0);
                drawShape(ctx, { x: brushState.startX, y: brushState.startY }, { x: x, y: y });
            }
            brushState.lastX = x; brushState.lastY = y;
        };

        dc.onmouseup = function() { brushState.drawing = false; brushState.snapshot = null; syncBB(); };
        dc.onmouseleave = function() { brushState.drawing = false; brushState.snapshot = null; hideCur(); syncBB(); };
    }

    function pushBHist() {
        var cv = el('ieDraw');
        if (!cv) return;
        var ctx = cv.getContext('2d');
        brushUndoStack.push({ d: ctx.getImageData(0, 0, cv.width, cv.height), lc: brushLabelCounter });
        if (brushUndoStack.length > BRUSH_HISTORY_MAX) brushUndoStack.shift();
        brushRedoStack = []; syncBB();
    }

    function syncBB() {
        var ub = el('ieBUndo'), rb = el('ieBRedo');
        if (ub) { ub.disabled = !brushUndoStack.length; ub.style.opacity = brushUndoStack.length ? '1' : '.4'; }
        if (rb) { rb.disabled = !brushRedoStack.length; rb.style.opacity = brushRedoStack.length ? '1' : '.4'; }
    }

    function syncBrushTools() {
        document.querySelectorAll('#ieBrushBar [data-bt]').forEach(function(b) {
            var act = b.getAttribute('data-bt') === brushState.tool;
            b.className = 'ie-btn ' + (act ? 'primary' : 'secondary');
        });
    }

    E._bt = function(t) { brushState.tool = t; syncBrushTools(); };
    E._ps = function(v) { brushState.brushSize = parseInt(v); var l = el('iePSL'); if (l) l.textContent = v + 'px'; updateCurSize(brushState.brushSize * zoomState.scale); };
    E._pc = function(c) { brushState.brushColor = c; };
    E._bUndo = function() {
        if (!brushUndoStack.length) return;
        var cv = el('ieDraw'); if (!cv) return;
        var ctx = cv.getContext('2d');
        brushRedoStack.push({ d: ctx.getImageData(0, 0, cv.width, cv.height), lc: brushLabelCounter });
        var snap = brushUndoStack.pop(); ctx.putImageData(snap.d, 0, 0);
        if (snap.lc) brushLabelCounter = snap.lc;
        syncBB();
    };
    E._bRedo = function() {
        if (!brushRedoStack.length) return;
        var cv = el('ieDraw'); if (!cv) return;
        var ctx = cv.getContext('2d');
        brushUndoStack.push({ d: ctx.getImageData(0, 0, cv.width, cv.height), lc: brushLabelCounter });
        var snap = brushRedoStack.pop(); ctx.putImageData(snap.d, 0, 0);
        if (snap.lc) brushLabelCounter = snap.lc;
        syncBB();
    };
    E._bClr = function() {
        var cv = el('ieDraw'); if (!cv) return;
        cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
        brushUndoStack = []; brushRedoStack = []; brushLabelCounter = 1;
        syncBB();
    };

    function drawShape(ctx, s, e) {
        ctx.strokeStyle = brushState.brushColor; ctx.lineWidth = brushState.brushSize; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var x = Math.min(s.x, e.x), y = Math.min(s.y, e.y), w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);
        if (brushState.tool === 'rect') ctx.strokeRect(x, y, w, h);
        else if (brushState.tool === 'ellipse') { ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2); ctx.stroke(); }
    }

    function drawLbl(x, y) {
        var cv = el('ieDraw'); if (!cv) return;
        var ctx = cv.getContext('2d'), size = Math.max(18, brushState.brushSize * 2.2);
        var n = brushLabelCounter++, txt = n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n);
        ctx.save(); ctx.font = '900 ' + size + 'px Arial,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, size / 8); ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(txt, x, y);
        ctx.fillStyle = brushState.brushColor; ctx.fillText(txt, x, y); ctx.restore();
    }

    function drawFlg(x, y) {
        var cv = el('ieDraw'); if (!cv) return;
        var ctx = cv.getContext('2d'), size = Math.max(24, brushState.brushSize * 2.5);
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = 'rgba(2,6,23,.72)'; ctx.lineWidth = size / 10;
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(0, size); ctx.stroke();
        ctx.fillStyle = brushState.brushColor;
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .8, -size * .6); ctx.lineTo(0, -size * .2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = size / 20; ctx.stroke();
        ctx.restore();
    }

    // ---- 扩图 ----
    function initOutpaint() {
        var img = el('ieImg');
        if (!img || !img.naturalWidth) return;
        outpaintState.expandLeft = 0;
        outpaintState.expandRight = 0;
        outpaintState.expandTop = 0;
        outpaintState.expandBottom = 0;
        renderOpFrame();
    }

    function renderOpFrame() {
        var img = el('ieImg');
        var region = el('ieOpRegion');
        var sizeLabel = el('ieOpSize');
        if (!img || !region || !img.naturalWidth) return;
        var cw = img.clientWidth || 1;
        var ch = img.clientHeight || 1;
        var s = zoomState.scale || 1;
        var ox = outpaintState.expandLeft * s;
        var oy = outpaintState.expandTop * s;
        var ow = cw + (outpaintState.expandLeft + outpaintState.expandRight) * s;
        var oh = ch + (outpaintState.expandTop + outpaintState.expandBottom) * s;
        region.style.left = (-ox) + 'px';
        region.style.top = (-oy) + 'px';
        region.style.width = ow + 'px';
        region.style.height = oh + 'px';
        if (sizeLabel) {
            var nw = img.naturalWidth + (outpaintState.expandLeft + outpaintState.expandRight);
            var nh = img.naturalHeight + (outpaintState.expandTop + outpaintState.expandBottom);
            sizeLabel.textContent = nw + ' x ' + nh;
        }
    }

    function bindOpEvents() {
        var region = el('ieOpRegion');
        if (!region) return;
        region.addEventListener('mousedown', function(e) {
            var handle = e.target.closest('[data-op]');
            if (!handle) return;
            e.preventDefault();
            e.stopPropagation();
            var dir = handle.getAttribute('data-op');
            outpaintState.dragging = dir;
            outpaintState.startMouse = { x: e.clientX, y: e.clientY };
            outpaintState.startExpands = {
                left: outpaintState.expandLeft,
                right: outpaintState.expandRight,
                top: outpaintState.expandTop,
                bottom: outpaintState.expandBottom
            };
        });
    }

    function clampOpExpand(v) {
        return Math.max(0, Math.round(v));
    }

    window.addEventListener('mousemove', function(e) {
        if (!outpaintState.dragging) return;
        var img = el('ieImg');
        if (!img || !img.naturalWidth) return;
        var s = zoomState.scale || 1;
        var dx = (e.clientX - outpaintState.startMouse.x) / s;
        var dy = (e.clientY - outpaintState.startMouse.y) / s;
        var st = outpaintState.startExpands;
        var dir = outpaintState.dragging;
        if (dir === 'left' || dir === 'topleft' || dir === 'bottomleft') {
            outpaintState.expandLeft = clampOpExpand(st.left - dx);
        }
        if (dir === 'right' || dir === 'topright' || dir === 'bottomright') {
            outpaintState.expandRight = clampOpExpand(st.right + dx);
        }
        if (dir === 'top' || dir === 'topleft' || dir === 'topright') {
            outpaintState.expandTop = clampOpExpand(st.top - dy);
        }
        if (dir === 'bottom' || dir === 'bottomleft' || dir === 'bottomright') {
            outpaintState.expandBottom = clampOpExpand(st.bottom + dy);
        }
        renderOpFrame();
    });

    window.addEventListener('mouseup', function() {
        if (outpaintState.dragging) {
            outpaintState.dragging = null;
            outpaintState.startMouse = null;
            outpaintState.startExpands = null;
        }
    });

    E._apOutpaint = async function() {
        var img = el('ieImg');
        if (!img || !img.naturalWidth || !img.naturalHeight) return;
        var nw = img.naturalWidth;
        var nh = img.naturalHeight;
        var outW = nw + outpaintState.expandLeft + outpaintState.expandRight;
        var outH = nh + outpaintState.expandTop + outpaintState.expandBottom;
        if (outW <= nw && outH <= nh) { alert('请拖动边缘手柄扩展画布区域'); return; }
        var cv = document.createElement('canvas');
        cv.width = outW;
        cv.height = outH;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, outpaintState.expandLeft, outpaintState.expandTop, nw, nh);
        var blob = await new Promise(function(r) { cv.toBlob(r, 'image/png'); });
        if (!blob) return;
        var data = await upBlob(blob, 'edit_outpaint_' + Date.now() + '.png');
        var file = data.files && data.files[0];
        if (file) {
            E.close(); if (opts && opts.onSave) opts.onSave({ url: file.url, name: file.name || file.url.split('/').pop(), operation: 'outpaint' });
        }
    };

    // ---- 通用上传（上传到 /api/ai/upload，返回本地 /output/ 路径） ----
    function upBlob(blob, name) {
        var form = new FormData();
        form.append('files', blob, name);
        return fetch('/api/ai/upload', { method: 'POST', body: form }).then(function(r) { return r.json(); });
    }

    // ---- 应用操作 ----
    E._apCrop = async function() {
        if (!cropState) return;
        var img = el('ieImg');
        if (!img.naturalWidth || !img.naturalHeight) return;
        var sx = Math.max(0, Math.round(cropState.x * (img.naturalWidth / (img.clientWidth || 1))));
        var sy = Math.max(0, Math.round(cropState.y * (img.naturalHeight / (img.clientHeight || 1))));
        var sw = Math.max(1, Math.round(cropState.w * (img.naturalWidth / (img.clientWidth || 1))));
        var sh = Math.max(1, Math.round(cropState.h * (img.naturalHeight / (img.clientHeight || 1))));
        var cv = document.createElement('canvas');
        cv.width = sw; cv.height = sh;
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        var blob = await new Promise(function(r) { cv.toBlob(r, 'image/png'); });
        if (!blob) return;
        var data = await upBlob(blob, 'edit_crop_' + Date.now() + '.png');
        var file = data.files && data.files[0];
        if (file) {
            E.close(); if (opts && opts.onSave) opts.onSave({ url: file.url, name: file.name || file.url.split('/').pop() });
        }
    };

    E._apBrush = async function() {
        var dc = el('ieDraw'), img = el('ieImg');
        if (!img || !img.naturalWidth || !img.naturalHeight) return;
        var cv = document.createElement('canvas');
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        ctx.drawImage(dc, 0, 0);
        var blob = await new Promise(function(r) { cv.toBlob(r, 'image/png'); });
        if (!blob) return;
        var data = await upBlob(blob, 'edit_brush_' + Date.now() + '.png');
        var file = data.files && data.files[0];
        if (file) {
            E.close(); if (opts && opts.onSave) opts.onSave({ url: file.url, name: file.name || file.url.split('/').pop() });
        }
    };

    // ---- 自定义光标 ----
    var cursorEl = null;
    var cursorInit = false;
    function createCur() {
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.className = 'ie-cur';
            document.body.appendChild(cursorEl);
        }
        if (!cursorInit) {
            cursorInit = true;
            document.addEventListener('mousemove', function(e) {
                if (cursorEl && cursorEl.classList.contains('active')) {
                    cursorEl.style.left = e.clientX + 'px';
                    cursorEl.style.top = e.clientY + 'px';
                }
            });
        }
        return cursorEl;
    }
    function updateCurPos(x, y) { if (cursorEl) { cursorEl.style.left = x + 'px'; cursorEl.style.top = y + 'px'; } }
    function updateCurSize(s) { if (cursorEl) { cursorEl.style.width = s + 'px'; cursorEl.style.height = s + 'px'; } }
    function showCur() { if (cursorEl) cursorEl.classList.add('active'); }
    function hideCur() { if (cursorEl) cursorEl.classList.remove('active'); }

    E.close = E.close;

    window.ImageEditor = E;
})();
