/**
 * Generator Node 模块
 * 负责无限画布中 API 生成节点的创建、渲染、运行等功能
 */

// 模块状态
var generatorNodeDeps = null;

/**
 * 初始化模块，接收 canvas.html 的依赖注入
 */
function initGeneratorNode(canvasDeps) {
    generatorNodeDeps = canvasDeps;
    injectGeneratorNodeCSS();
}

/**
 * 注入 Generator 节点 CSS 样式
 */
function injectGeneratorNodeCSS() {
    if (document.getElementById('generator-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'generator-node-styles';
    style.textContent = `
        .generator-body { display:flex; flex-direction:column; gap:10px; min-height:0; }
        .gen-settings { display:flex; flex-direction:column; gap:8px; }
        .gen-settings-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .gen-count-row { display:flex; align-items:center; gap:4px; }
        .gen-stepper { display:flex; align-items:center; gap:2px; background:#f8fafc; border:1px solid #edf2f7; border-radius:999px; padding:2px; }
        .gen-step-btn { width:24px; height:24px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:transparent; border:none; color:#64748b; cursor:pointer; }
        .gen-step-btn:hover { background:#edf2f7; color:#111827; }
        .gen-count-input { width:32px; height:24px; border:none; background:transparent; text-align:center; font-size:11px; font-weight:700; color:#111827; outline:none; }
        .gen-btn { height:40px; width:100%; border-radius:16px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.12em; }
        .gen-btn:disabled { background:#e5e7eb; color:#94a3b8; cursor:not-allowed; }
        .gen-btn.running i { color:#facc15; fill:#facc15; animation:zapPulse .8s ease-in-out infinite; }
        .gen-cascade-btn { height:40px; width:100%; border-radius:16px; background:var(--strong); color:var(--strong-text); display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.12em; transition:all .15s ease; border:none; cursor:pointer; }
        .gen-cascade-btn:hover { filter:brightness(1.1); }
        .gen-cascade-btn:disabled { opacity:.4; cursor:not-allowed; filter:none; }
        .gen-cascade-btn.gen-cascade-stop { background:var(--card-solid); color:var(--text); border:1.5px solid var(--strong); }
        .gen-cascade-btn.gen-cascade-stop:hover { background:var(--strong); color:var(--strong-text); }
        .gen-run-row { margin-top:10px; }
        @keyframes zapPulse { 0%,100% { transform:scale(1); opacity:.72; } 50% { transform:scale(1.18); opacity:1; } }
    `;
    document.head.appendChild(style);
}

/**
 * 创建新的 API 生成节点
 */
function addGeneratorNode(point) {
    const p = point || generatorNodeDeps.defaultPoint(120, 0);
    generatorNodeDeps.addNode({
        id: generatorNodeDeps.uid('gen'),
        type: 'generator',
        x: p.x,
        y: p.y,
        apiProvider: '',
        model: generatorNodeDeps.allImageModels()[0] || generatorNodeDeps.models.gpt,
        ratio: 'square',
        resolution: '1k',
        count: 1,
        customRatioWidth: '',
        customRatioHeight: '',
        customRatio: '',
        customWidth: '',
        customHeight: '',
        customSize: '',
        inputs: [],
        running: false,
        runStatus: '',
        runError: '',
        _cascadeFailed: false
    });
}

/**
 * 渲染 API 生成节点内容
 */
function renderGeneratorBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    const inputSources = generatorNodeDeps.generatorSources(node);
    const ordered = generatorNodeDeps.orderedSources(node, inputSources);
    const imageInputs = ordered.filter(src => src.refs?.length);
    const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
    node.apiProvider = generatorNodeDeps.resolveImageProviderId(node.apiProvider || '');
    const imageProviderModels = generatorNodeDeps.providerImageModels(node.apiProvider);
    if(!imageProviderModels.length) node.model = '';
    else if(!imageProviderModels.includes(generatorNodeDeps.resolveImageModel(node.model))) node.model = imageProviderModels[0] || '';
    const referenceImages = ordered.flatMap(src => src.refs || []);
    wrap.innerHTML = `
        <div class="prompt-list mb-3"></div>
        <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Images</div>
        <div class="input-list"></div>
        <div class="gen-settings">
            <div class="gen-settings-row">
                <select class="select-lite provider-select">${generatorNodeDeps.providerOptions(node.apiProvider)}</select>
                <select class="select-lite model-select">${generatorNodeDeps.imageModelOptions(node.model, node.apiProvider)}</select>
            </div>
            <div class="gen-settings-row">
                <select class="select-lite resolution compact-select" data-field="resolution">
                    <option value="1k">1K</option>
                    <option value="2k">2K</option>
                    <option value="4k">4K</option>
                    <option value="custom">自定义</option>
                </select>
                <select class="select-lite ratio compact-select" data-field="ratio">
                    <option value="square">1:1</option>
                    <option value="portrait">2:3</option>
                    <option value="landscape">3:2</option>
                    <option value="portrait43">3:4</option>
                    <option value="landscape43">4:3</option>
                    <option value="story">9:16</option>
                    <option value="wide">16:9</option>
                    <option value="custom">自定义</option>
                </select>
                <div class="gen-count-row">
                    <div class="gen-stepper">
                        <button class="gen-step-btn" data-step="-1" type="button" title="减少" aria-label="减少生成数量"><i data-lucide="chevron-left" class="w-3.5 h-3.5"></i></button>
                        <input class="gen-count-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${Math.max(1, Math.min(8, Number(node.count || 1)))}">
                        <button class="gen-step-btn" data-step="1" type="button" title="增加" aria-label="增加生成数量"><i data-lucide="chevron-right" class="w-3.5 h-3.5"></i></button>
                    </div>
                </div>
            </div>
            <div class="gen-settings-row custom-ratio-row" style="display:none">
                <label class="field">
                    <div class="setting-title">比例宽</div>
                    <input class="setting-input custom-ratio-w-input" type="number" min="1" step="1" value="${generatorNodeDeps.escapeHtml(node.customRatioWidth || '')}" placeholder="4">
                </label>
                <label class="field">
                    <div class="setting-title">比例高</div>
                    <input class="setting-input custom-ratio-h-input" type="number" min="1" step="1" value="${generatorNodeDeps.escapeHtml(node.customRatioHeight || '')}" placeholder="3">
                </label>
            </div>
            <div class="gen-settings-row custom-size-row" style="display:none">
                <label class="field">
                    <div class="setting-title">宽度</div>
                    <input class="setting-input custom-w-input" type="number" min="64" step="64" value="${generatorNodeDeps.escapeHtml(node.customWidth || '')}" placeholder="自动">
                </label>
                <label class="field">
                    <div class="setting-title">高度</div>
                    <input class="setting-input custom-h-input" type="number" min="64" step="64" value="${generatorNodeDeps.escapeHtml(node.customHeight || '')}" placeholder="自动">
                </label>
                <button class="secondary-btn fit-size-btn" type="button" style="height:32px;align-self:flex-end;padding:0 10px;font-size:11px">适配图片尺寸</button>
            </div>
        </div>
        <div class="gen-run-row">
            <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? '生成中' : 'API生成'}</button>
            ${generatorNodeDeps.cascadeBtnHtml ? generatorNodeDeps.cascadeBtnHtml(node) : ''}
        </div>
        ${generatorNodeDeps.retryBarHtml ? generatorNodeDeps.retryBarHtml(node) : ''}
    `;
    const providerSelect = wrap.querySelector('.provider-select');
    const modelSelect = wrap.querySelector('.model-select');
    providerSelect.onmousedown = e => e.stopPropagation();
    providerSelect.onclick = e => e.stopPropagation();
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.apiProvider = e.target.value;
        const providerModels = generatorNodeDeps.providerImageModels(node.apiProvider);
        if(!providerModels.includes(generatorNodeDeps.resolveImageModel(node.model))) node.model = providerModels[0] || '';
        modelSelect.innerHTML = generatorNodeDeps.imageModelOptions(node.model, node.apiProvider);
        generatorNodeDeps.scheduleSave();
    };
    modelSelect.onmousedown = e => e.stopPropagation();
    modelSelect.onclick = e => e.stopPropagation();
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        generatorNodeDeps.scheduleSave();
    };
    const ratioSelect = wrap.querySelector('.ratio');
    const resolutionSelect = wrap.querySelector('.resolution');
    const customRatioRow = wrap.querySelector('.custom-ratio-row');
    const customSizeRow = wrap.querySelector('.custom-size-row');
    const customRatioWInput = wrap.querySelector('.custom-ratio-w-input');
    const customRatioHInput = wrap.querySelector('.custom-ratio-h-input');
    const customWInput = wrap.querySelector('.custom-w-input');
    const customHInput = wrap.querySelector('.custom-h-input');
    const fitSizeBtn = wrap.querySelector('.fit-size-btn');
    if((!node.customRatioWidth || !node.customRatioHeight) && node.customRatio) {
        const raw = String(node.customRatio || '');
        if(raw.includes(':')){
            const [w,h] = raw.split(':');
            node.customRatioWidth = node.customRatioWidth || w;
            node.customRatioHeight = node.customRatioHeight || h;
        }
    }
    if((!node.customWidth || !node.customHeight) && node.customSize) {
        const match = String(node.customSize || '').trim().match(/^(\d+)\s*[xX*]\s*(\d+)$/);
        if(match){
            node.customWidth = node.customWidth || match[1];
            node.customHeight = node.customHeight || match[2];
        }
    }
    const syncSizeControls = () => {
        const ratioValue = node.ratio && [...ratioSelect.options].some(opt => opt.value === node.ratio) ? node.ratio : 'square';
        ratioSelect.value = ratioValue;
        resolutionSelect.value = node.resolution || '1k';
        ratioSelect.disabled = node.resolution === 'custom';
        customRatioRow.style.display = node.ratio === 'custom' ? 'flex' : 'none';
        customSizeRow.style.display = node.resolution === 'custom' ? 'flex' : 'none';
        customRatioWInput.value = node.customRatioWidth || '';
        customRatioHInput.value = node.customRatioHeight || '';
        customWInput.value = node.customWidth || '';
        customHInput.value = node.customHeight || '';
        if(fitSizeBtn) fitSizeBtn.disabled = !referenceImages.some(ref => ref.url);
    };
    ratioSelect.onmousedown = e => e.stopPropagation();
    ratioSelect.onclick = e => e.stopPropagation();
    ratioSelect.onchange = e => {
        e.stopPropagation();
        node.ratio = e.target.value;
        if(node.ratio !== 'custom') {
            node.customRatio = '';
            node.customRatioWidth = '';
            node.customRatioHeight = '';
        }
        syncSizeControls();
        generatorNodeDeps.scheduleSave();
    };
    resolutionSelect.onmousedown = e => e.stopPropagation();
    resolutionSelect.onclick = e => e.stopPropagation();
    resolutionSelect.onchange = e => {
        e.stopPropagation();
        node.resolution = e.target.value;
        if(node.resolution === 'custom') {
            node.ratio = '';
        } else if(!node.ratio) {
            node.ratio = 'square';
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        } else {
            node.customSize = '';
            node.customWidth = '';
            node.customHeight = '';
        }
        syncSizeControls();
        generatorNodeDeps.scheduleSave();
    };
    [customRatioWInput, customRatioHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customRatioWidth = customRatioWInput.value;
            node.customRatioHeight = customRatioHInput.value;
            node.customRatio = node.customRatioWidth && node.customRatioHeight ? `${node.customRatioWidth}:${node.customRatioHeight}` : '';
            node.ratio = 'custom';
            syncSizeControls();
            generatorNodeDeps.scheduleSave();
        };
    });
    [customWInput, customHInput].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
        input.oninput = e => {
            node.customWidth = customWInput.value;
            node.customHeight = customHInput.value;
            node.customSize = node.customWidth && node.customHeight ? `${node.customWidth}x${node.customHeight}` : '';
            node.resolution = 'custom';
            node.ratio = '';
            syncSizeControls();
            generatorNodeDeps.scheduleSave();
        };
    });
    if(fitSizeBtn){
        fitSizeBtn.onmousedown = e => e.stopPropagation();
        fitSizeBtn.onclick = async e => {
            e.stopPropagation();
            const ref = referenceImages.find(item => item.url);
            if(!ref) return;
            try {
                const dims = await generatorNodeDeps.getImageDimensions(ref.url);
                node.customWidth = dims.width;
                node.customHeight = dims.height;
                node.customSize = `${dims.width}x${dims.height}`;
                node.resolution = 'custom';
                syncSizeControls();
                generatorNodeDeps.scheduleSave();
            } catch(err) {}
        };
    }
    syncSizeControls();
    const countInput = wrap.querySelector('.gen-count-input');
    countInput.onmousedown = e => e.stopPropagation();
    countInput.onclick = e => e.stopPropagation();
    countInput.oninput = e => {
        const value = Math.max(1, Math.min(8, Number(e.target.value) || 1));
        node.count = value;
        generatorNodeDeps.scheduleSave();
    };
    countInput.onblur = e => { 
        e.target.value = String(Math.max(1, Math.min(8, Number(node.count || 1)))); 
    };
    wrap.querySelectorAll('[data-step]').forEach(btn => {
        btn.onclick = e => {
            e.stopPropagation();
            const next = Math.max(1, Math.min(8, Number(node.count || 1) + Number(btn.dataset.step || 0)));
            node.count = next;
            countInput.value = String(next);
            generatorNodeDeps.scheduleSave();
        };
    });
    const list = wrap.querySelector('.input-list');
    list.innerHTML = imageInputs.length ? '' : '<div class="text-[11px] text-gray-300 py-2">把图片或图片组连到这里</div>';
    imageInputs.forEach((src, i) => {
        const item = document.createElement('div');
        item.className = 'input-item';
        item.draggable = true;
        item.dataset.sourceId = src.id;
        item.innerHTML = `<span class="input-index">${i + 1}</span>${src.preview ? `<img src="${src.preview}">` : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>'}<span class="input-label">${generatorNodeDeps.escapeHtml(src.label)}</span>`;
        item.ondragstart = e => {
            e.stopPropagation();
            generatorNodeDeps.internalDrag = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/x-canvas-input', src.id);
        };
        item.ondragend = () => { generatorNodeDeps.internalDrag = false; };
        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
        item.ondrop = e => {
            e.preventDefault();
            e.stopPropagation();
            generatorNodeDeps.reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
            generatorNodeDeps.internalDrag = false;
        };
        list.appendChild(item);
    });
    generatorNodeDeps.renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
    wrap.querySelector('.gen-btn').onclick = e => { 
        e.stopPropagation(); 
        runGenerator(node.id); 
    };
    if (generatorNodeDeps.bindCascadeButtons) generatorNodeDeps.bindCascadeButtons(wrap, node.id);
    return wrap;
}

/**
 * 运行 API 生成
 */
async function runGenerator(genId, opts = {}) {
    const cascade = opts.cascade || false;
    const loopRefs = opts.loopRefs || null;
    const loopPrompt = opts.loopPrompt || '';
    const gen = generatorNodeDeps.nodes.find(n => n.id === genId);
    if (!gen || (gen.running && !cascade)) return;
    const sources = generatorNodeDeps.generatorSources(gen);
    const ordered = generatorNodeDeps.orderedSources(gen, sources);
    const prompt = loopPrompt || ordered.map(s => s.prompt).filter(Boolean).join('\n\n');
    const refs = loopRefs || ordered.flatMap(s => s.refs || []);
    if (!prompt && !refs.length) { 
        if (!cascade) alert('请先连接提示词或图片'); 
        return; 
    }
    const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
    let out = generatorNodeDeps.connections
        .filter(c => c.from === gen.id)
        .map(c => generatorNodeDeps.nodes.find(n => n.id === c.to))
        .find(n => n?.type === 'output');
    if (!out && !cascade) {
        out = {
            id: generatorNodeDeps.uid('out'), 
            type: 'output', 
            x: gen.x + 460, 
            y: gen.y, 
            images: []
        };
        generatorNodeDeps.nodes.push(out);
        generatorNodeDeps.connections.push({ id: generatorNodeDeps.uid('c'), from: gen.id, to: out.id });
    }
    if (!out && cascade) return;

    const payload = {
        prompt: prompt || 'Edit the reference images.',
        provider_id: generatorNodeDeps.resolveImageProviderId(gen.apiProvider || ''),
        model: generatorNodeDeps.resolveImageModel(gen.model),
        size: (() => {
            const SIZE_MAP = {
                square: { '1k': '1024x1024', '2k': '2048x2048', '4k': '4096x4096' },
                portrait: { '1k': '832x1216', '2k': '1664x2432', '4k': '3328x4864' },
                landscape: { '1k': '1216x832', '2k': '2432x1664', '4k': '4864x3328' },
                story: { '1k': '768x1344', '2k': '1536x2688', '4k': '3072x5376' },
                wide: { '1k': '1344x768', '2k': '2688x1536', '4k': '5376x3072' }
            };
            if (gen.resolution === 'custom') return gen.customSize || '1024x1024';
            return SIZE_MAP[gen.ratio || 'square'][gen.resolution || '1k'] || '1024x1024';
        })(),
        protocol: String(generatorNodeDeps.resolveImageModel(gen.model) || '').toLowerCase().includes('gemini') ? 'gemini' : 'openai',
        reference_images: refs
    };
    const quality = gen.quality;
    if(quality && ['auto','low','medium','high'].includes(quality)) payload.quality = quality;
    if(!cascade){ gen.running = true; }
    try {
        const taskInfos = await Promise.all(Array.from({length:count}, () => createCanvasImageTaskModule(payload)));
        const pendingIds = taskInfos.map(() => generatorNodeDeps.uid('p'));
        if(out) out._pending = [...(out._pending || []), ...taskInfos.map((task, index) => ({id:pendingIds[index], startedAt:Date.now(), canvasTaskId:task.task_id}))];
        generatorNodeDeps.render();
        generatorNodeDeps.scheduleSave();
        const statuses = await Promise.all(taskInfos.map(task => pollCanvasImageTaskModule(task.task_id)));
        if(statuses.some(s => s === 'failed')) throw new Error('生成失败');
        if(!cascade){ gen.runStatus = 'done'; gen.runError = ''; }
        gen.running = false;
        generatorNodeDeps.render();
        generatorNodeDeps.scheduleSave();
    } catch(err) {
        gen.runStatus = 'failed'; gen.runError = err.message || String(err);
        gen.running = false;
        gen._cascadeFailed = Boolean(cascade);
        generatorNodeDeps.render();
        generatorNodeDeps.scheduleSave();
        if(cascade) throw err;
        alert(err.message || '生成失败');
    }
}

async function createCanvasImageTaskModule(payload){
    const res = await fetch('/api/canvas-image-tasks', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(payload)
    });
    if(!res.ok) throw new Error(((await res.json())?.detail) || '创建画布生图任务失败');
    return res.json();
}
const activeCanvasTaskPollsModule = new Set();
async function pollCanvasImageTaskModule(taskId){
    if(!taskId) return 'failed';
    if(activeCanvasTaskPollsModule.has(taskId)) return 'running';
    activeCanvasTaskPollsModule.add(taskId);
    try {
        while(true){
            const res = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`);
            if(!res.ok) throw new Error(((await res.json())?.detail) || '查询画布生图任务失败');
            const data = await res.json();
            if(data.status === 'succeeded'){
                completeCanvasImageTaskModule(taskId, data.result || {});
                return 'succeeded';
            }
            if(data.status === 'failed'){
                pendingCleanupModule(taskId);
                return 'failed';
            }
            await new Promise(resolve => setTimeout(resolve, 1800));
        }
    } catch(err) {
        pendingCleanupModule(taskId);
        return 'failed';
    } finally {
        activeCanvasTaskPollsModule.delete(taskId);
    }
}
function pendingCleanupModule(taskId){
    if(!generatorNodeDeps) return;
    for(const n of generatorNodeDeps.getNodes()){
        if(n.type !== 'output') continue;
        n._pending = (n._pending || []).filter(p => p.canvasTaskId !== taskId);
    }
}
function completeCanvasImageTaskModule(taskId, result){
    if(!generatorNodeDeps) return;
    for(const n of generatorNodeDeps.getNodes()){
        if(n.type !== 'output') continue;
        const idx = (n._pending || []).findIndex(p => p.canvasTaskId === taskId);
        if(idx === -1) continue;
        const [pending] = (n._pending || []).splice(idx, 1);
        const images = result.images || [];
        if(images.length && window.outputNode) window.outputNode.appendImage(n, images, null);
        break;
    }
}


