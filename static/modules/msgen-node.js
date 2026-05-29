/**
 * MS Generator Node 模块
 * 负责无限画布中 MS 生成节点的创建、渲染、运行等功能
 */

// 模块状态
var msgenNodeDeps = null;

/**
 * 初始化模块，接收 canvas.html 的依赖注入
 */
function initMsGenNode(canvasDeps) {
    msgenNodeDeps = canvasDeps;
    injectMsGenNodeCSS();
}

/**
 * 注入 MS Generator 节点 CSS 样式
 */
function injectMsGenNodeCSS() {
    if (document.getElementById('msgen-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'msgen-node-styles';
    style.textContent = `
        .ms-model-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
        .ms-model-tabs button { height:30px; border-radius:999px; padding:0 12px; color:#64748b; border:1px solid #edf2f7; background:#f8fafc; font-size:10px; font-weight:700; }
        .ms-model-tabs button.active { background:#111827; color:#fff; border-color:#111827; }
        .ms-content { min-height:60px; }
        .ms-controls { display:flex; flex-direction:column; gap:8px; }
        .ms-w-input,.ms-h-input { background:#fff; border:1px solid #edf2f7; border-radius:8px; padding:4px 8px; font-size:11px; width:80px; }
        .ms-w-input:disabled,.ms-h-input:disabled { opacity:.5; cursor:not-allowed; }
        .fit-check,.lora-check { display:flex; align-items:center; gap:6px; cursor:pointer; }
        .gen-settings-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .gen-settings-row__field { flex:1; min-width:0; }
        .setting-title { font-size:11px; font-weight:700; color:#475569; }
        .setting-check { display:flex; align-items:center; gap:6px; cursor:pointer; padding:6px 10px; border-radius:8px; background:#f8fafc; border:1px solid #edf2f7; }
        .gen-btn { height:40px; width:100%; border-radius:16px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.12em; }
        .gen-btn:disabled { background:#e5e7eb; color:#94a3b8; cursor:not-allowed; }
        .gen-btn.running i { color:#facc15; fill:#facc15; animation:zapPulse .8s ease-in-out infinite; }
        .gen-cascade-btn { height:40px; width:100%; border-radius:16px; background:var(--strong); color:var(--strong-text); display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.12em; transition:all .15s ease; border:none; cursor:pointer; }
        .gen-cascade-btn:hover { filter:brightness(1.1); }
        .gen-cascade-btn:disabled { opacity:.4; cursor:not-allowed; filter:none; }
        .gen-cascade-btn.gen-cascade-stop { background:var(--card-solid); color:var(--text); border:1.5px solid var(--strong); }
        .gen-cascade-btn.gen-cascade-stop:hover { background:var(--strong); color:var(--strong-text); }
        .gen-run-row { margin-top:10px; }
        .canvas-range { width:100%; }
        .lora-strength-val { font-size:10px; font-weight:900; color:#0891b2; }
        @keyframes zapPulse { 0%,100% { transform:scale(1); opacity:.72; } 50% { transform:scale(1.18); opacity:1; } }
    `;
    document.head.appendChild(style);
}

/**
 * 创建新的 MS 生成节点
 */
function addMsGenNode(point) {
    const p = point || msgenNodeDeps.defaultPoint(140, 0);
    msgenNodeDeps.addNode({
        id: msgenNodeDeps.uid('msgen'),
        type: 'msgen',
        x: p.x,
        y: p.y,
        msgenModel: 'zimage',
        msWidth: 1024,
        msHeight: 1024,
        fitImage: false,
        kleinLora: false,
        kleinLoraStrength: 0.8,
        inputs: [],
        running: false,
        runStatus: '',
        runError: '',
        _cascadeFailed: false
    });
}

/**
 * 渲染 MS 生成节点内容
 */
function renderMsGenBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    const modelKey = node.msgenModel || 'zimage';
    const msModel = msgenNodeDeps.MS_GEN_MODELS[modelKey] || msgenNodeDeps.MS_GEN_MODELS.zimage;
    const inputSources = msgenNodeDeps.generatorSources(node);
    const ordered = msgenNodeDeps.orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    const fitOn = node.fitImage;
    const loraStrength = node.kleinLoraStrength ?? 0.8;
    wrap.innerHTML = `
        <div class="ms-model-tabs">
            ${Object.entries(msgenNodeDeps.MS_GEN_MODELS).map(([k, m]) =>
                `<button type="button" data-model="${k}" class="${modelKey === k ? 'active' : ''}">${msgenNodeDeps.escapeHtml(m.label)}</button>`
            ).join('')}
        </div>
        <div class="ms-content">
            <div class="prompt-list mt-2 mb-2"></div>
            ${msModel.supportsImage ? `
            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Images</div>
            <div class="input-list ms-img-list"></div>
            ` : ''}
        </div>
        <div class="ms-controls">
            <div class="mt-3 flex flex-col gap-2">
                <div class="gen-settings-row">
                    <label class="field gen-settings-row__field">
                        <div class="setting-title">宽度</div>
                        <input class="setting-input ms-w-input" type="number" min="64" step="64"
                            value="${node.msWidth || ''}" placeholder="Auto" ${fitOn ? 'disabled' : ''}>
                    </label>
                    <label class="field gen-settings-row__field">
                        <div class="setting-title">高度</div>
                        <input class="setting-input ms-h-input" type="number" min="64" step="64"
                            value="${node.msHeight || ''}" placeholder="Auto" ${fitOn ? 'disabled' : ''}>
                    </label>
                </div>
                <div class="gen-settings-row">
                    <label class="setting-check" style="cursor:pointer">
                        <input type="checkbox" class="fit-check" ${fitOn ? 'checked' : ''}>
                        <span style="font-size:11px;font-weight:700">适配图片尺寸</span>
                    </label>
                </div>
                ${modelKey === 'klein_edit' ? `
                <div class="gen-settings-row">
                    <label class="setting-check" style="cursor:pointer">
                        <input type="checkbox" class="lora-check" ${node.kleinLora ? 'checked' : ''}>
                        <span style="font-size:11px;font-weight:700">细节增强 LoRA</span>
                    </label>
                </div>
                ${node.kleinLora ? `
                <div class="gen-settings-row">
                    <label class="field" style="flex:1">
                        <div class="setting-title" style="display:flex;justify-content:space-between">
                            <span>LoRA 强度</span><span class="lora-strength-val">${loraStrength.toFixed(2)}</span>
                        </div>
                        <input type="range" class="canvas-range lora-strength-slider" min="0.1" max="1.0" step="0.05" value="${loraStrength}">
                    </label>
                </div>` : ''}` : ''}
            </div>
            <button class="gen-btn mt-3 ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}>
                <i data-lucide="zap" class="w-4 h-4"></i>${node.running ? '生成中' : 'MS 生成'}
            </button>
            ${msgenNodeDeps.cascadeBtnHtml ? msgenNodeDeps.cascadeBtnHtml(node) : ''}
        </div>
        ${msgenNodeDeps.retryBarHtml ? msgenNodeDeps.retryBarHtml(node) : ''}
    `;
    wrap.querySelectorAll('.ms-model-tabs button').forEach(btn => {
        btn.onclick = e => { 
            e.stopPropagation(); 
            node.msgenModel = btn.dataset.model; 
            msgenNodeDeps.render(); 
            msgenNodeDeps.scheduleSave(); 
        };
    });
    const wInput = wrap.querySelector('.ms-w-input');
    const hInput = wrap.querySelector('.ms-h-input');
    [wInput, hInput].forEach(inp => {
        inp.onmousedown = e => e.stopPropagation();
        inp.onclick = e => e.stopPropagation();
    });
    wInput.oninput = e => { 
        node.msWidth = parseInt(e.target.value) || 0; 
        msgenNodeDeps.scheduleSave(); 
    };
    hInput.oninput = e => { 
        node.msHeight = parseInt(e.target.value) || 0; 
        msgenNodeDeps.scheduleSave(); 
    };
    const fitCheck = wrap.querySelector('.fit-check');
    fitCheck.onchange = e => { 
        node.fitImage = e.target.checked; 
        msgenNodeDeps.scheduleSave(); 
        msgenNodeDeps.render(); 
    };
    const loraCheck = wrap.querySelector('.lora-check');
    if (loraCheck) {
        loraCheck.onchange = e => { 
            node.kleinLora = e.target.checked; 
            msgenNodeDeps.scheduleSave(); 
            msgenNodeDeps.render(); 
        };
    }
    const loraSlider = wrap.querySelector('.lora-strength-slider');
    if (loraSlider) {
        loraSlider.onmousedown = e => e.stopPropagation();
        loraSlider.onclick = e => e.stopPropagation();
        loraSlider.oninput = e => {
            node.kleinLoraStrength = parseFloat(e.target.value);
            const val = wrap.querySelector('.lora-strength-val');
            if (val) val.textContent = node.kleinLoraStrength.toFixed(2);
            msgenNodeDeps.scheduleSave();
        };
    }
    wrap.querySelectorAll('.setting-check').forEach(pill => {
        pill.onmousedown = e => e.stopPropagation();
        const cb = pill.querySelector('input[type="checkbox"]');
        if (!cb) return;
        pill.onclick = e => {
            e.stopPropagation();
            e.preventDefault();
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        };
        cb.onclick = e => e.stopPropagation();
    });
    if (msModel.supportsImage) {
        const list = wrap.querySelector('.ms-img-list');
        if (list) {
            list.innerHTML = imageInputs.length ? '' : '<div class="text-[11px] text-gray-300 py-2">把图片或图片组连到这里</div>';
            imageInputs.forEach((src, i) => {
                const item = document.createElement('div');
                item.className = 'input-item';
                item.draggable = true;
                item.dataset.sourceId = src.id;
                item.innerHTML = `<span class="input-index">${i + 1}</span>${src.preview ? `<img src="${src.preview}">` : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>'}<span class="input-label">${msgenNodeDeps.escapeHtml(src.label)}</span>`;
                item.ondragstart = e => { 
                    e.stopPropagation(); 
                    msgenNodeDeps.internalDrag = true; 
                    e.dataTransfer.effectAllowed = 'move'; 
                    e.dataTransfer.setData('application/x-canvas-input', src.id); 
                };
                item.ondragend = () => { msgenNodeDeps.internalDrag = false; };
                item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
                item.ondrop = e => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    msgenNodeDeps.reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id); 
                    msgenNodeDeps.internalDrag = false; 
                };
                list.appendChild(item);
            });
        }
    }
    msgenNodeDeps.renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { 
        e.stopPropagation(); 
        runMsGenNode(node.id); 
    };
    if (msgenNodeDeps.bindCascadeButtons) msgenNodeDeps.bindCascadeButtons(wrap, node.id);
    return wrap;
}

/**
 * 运行 MS 生成
 */
async function runMsGenNode(nodeId, opts = {}) {
    const cascade = opts.cascade || false;
    const loopRefs = opts.loopRefs || null;
    const loopPrompt = opts.loopPrompt || '';
    const node = msgenNodeDeps.nodes.find(n => n.id === nodeId);
    if (!node || (node.running && !cascade)) return;
    const sources = msgenNodeDeps.generatorSources(node);
    const ordered = msgenNodeDeps.orderedSources(node, sources);
    const prompt = loopPrompt || ordered.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = loopRefs || ordered.flatMap(s => s.refs || []);
    const modelKey = node.msgenModel || 'zimage';
    const msModel = msgenNodeDeps.MS_GEN_MODELS[modelKey] || msgenNodeDeps.MS_GEN_MODELS.zimage;
    if (!prompt) { 
        if (!cascade) alert('请先连接提示词'); 
        return; 
    }
    if (msModel.supportsImage && !refs.length) { 
        if (!cascade) alert('请先连接图片'); 
        return; 
    }
    let out = msgenNodeDeps.connections
        .filter(c => c.from === node.id)
        .map(c => msgenNodeDeps.nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if (!out && !cascade) {
        out = { id: msgenNodeDeps.uid('out'), type: 'output', x: node.x + 460, y: node.y, images: [] };
        msgenNodeDeps.nodes.push(out);
        msgenNodeDeps.connections.push({ id: msgenNodeDeps.uid('c'), from: node.id, to: out.id });
    }
    if (!out && cascade) return;
    
    const pendingId = msgenNodeDeps.uid('p');
    if (out) out._pending = [...(out._pending || []), { id: pendingId }];
    if (!cascade) {
        node.running = true;
        node.runStatus = '';
        node.runError = '';
        node._cascadeFailed = false;
        msgenNodeDeps.render();
    }
    
    const startTime = Date.now();
    const run = {
        nodeType: 'msgen',
        node: node,
        prompt: prompt,
        refs: refs,
        taskLabel: node.msCustomModel || modelKey || 'ModelScope'
    };
    
    try {
        let width = node.msWidth || 1024;
        let height = node.msHeight || 1024;
        if (node.fitImage && refs.length && refs[0].url) {
            try {
                const dims = await msgenNodeDeps.getImageDimensions(refs[0].url);
                width = dims.width;
                height = dims.height;
            } catch (e) {}
        }
        const imageUrls = [];
        if (msModel.supportsImage) {
            for (const ref of refs.slice(0, 3)) {
                if (ref.url) {
                    try { 
                        imageUrls.push(await msgenNodeDeps.urlToBase64(ref.url)); 
                    } catch (e) { 
                        imageUrls.push(ref.url); 
                    }
                }
            }
        }
        let apiBody;
        if (modelKey === 'zimage') {
            apiBody = { prompt, resolution: `${width}x${height}`, client_id: msgenNodeDeps.CLIENT_ID };
        } else if (modelKey === 'qwen_edit') {
            apiBody = { prompt, image_urls: imageUrls, client_id: msgenNodeDeps.CLIENT_ID };
        } else {
            apiBody = { prompt, model: msModel.modelId, image_urls: imageUrls, client_id: msgenNodeDeps.CLIENT_ID };
            if (node.kleinLora) {
                const s = node.kleinLoraStrength ?? 0.8;
                apiBody.loras = { 'Daniel8152/Klein-enhance': s };
            }
        }
        const res = await fetch(msModel.endpoint, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiBody)
        });
        if (!res.ok) throw new Error((await res.json()).detail || 'MS生成失败');
        const data = await res.json();
        const outputUrls = data.url ? [data.url] : [];
        const runMs = Date.now() - startTime;
        
        run.request = {
            task_id: data.task_id || '',
            request_id: data.request_id || '',
            backend: 'ModelScope'
        };
        
        out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        if (data.url && window.outputNode) window.outputNode.appendImage(out, [data.url], refs[0]);
        
        if (msgenNodeDeps.addGenerationLog) {
            msgenNodeDeps.addGenerationLog({ run, outputs: outputUrls, runMs });
        }
        
        if (!cascade) {
            node.runStatus = 'done';
            node.runError = '';
        }
        msgenNodeDeps.render();
        msgenNodeDeps.scheduleSave();
    } catch (err) {
        const runMs = Date.now() - startTime;
        if (out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
        
        if (msgenNodeDeps.addGenerationLog) {
            msgenNodeDeps.addGenerationLog({ run, outputs: [], runMs, error: err.message || 'MS生成失败' });
        }
        
        if (cascade) {
            node.runStatus = 'failed';
            node.runError = err.message || String(err);
            node._cascadeFailed = true;
        }
        msgenNodeDeps.render();
        if (cascade) throw err;
        if (!cascade) alert(err.message || 'MS生成失败');
    }
    if (!cascade) {
        node.running = false;
        msgenNodeDeps.render();
    }
}

// 导出到全局
window.addMsGenNode = addMsGenNode;
window.renderMsGenBody = renderMsGenBody;
window.runMsGenNode = runMsGenNode;
