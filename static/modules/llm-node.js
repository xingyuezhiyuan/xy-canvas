/**
 * LLM Node 模块
 * 负责无限画布中 LLM 节点的创建、渲染、运行等功能
 */

// 模块状态
var llmNodeDeps = null;

/**
 * 初始化模块，接收 canvas.html 的依赖注入
 */
function initLLMNode(canvasDeps) {
    llmNodeDeps = canvasDeps;
    injectLLMNodeCSS();
}

/**
 * 注入 LLM 节点 CSS 样式
 */
function injectLLMNodeCSS() {
    if (document.getElementById('llm-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'llm-node-styles';
    style.textContent = `
        .llm-node { width:420px; }
        .llm-body { display:flex; flex-direction:column; gap:10px; min-height:0; }
        .node.sized.llm-node .llm-body { height:100%; }
        .llm-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .llm-mode { background:#f8fafc; border:1px solid #edf2f7; border-radius:999px; padding:3px; display:flex; gap:2px; }
        .llm-mode button { height:28px; border-radius:999px; padding:0 10px; color:#64748b; border:1px solid transparent; font-size:10px; font-weight:700; }
        .llm-mode button.active { background:#fff; color:#111827; border-color:#cbd5e1; box-shadow:0 1px 4px rgba(15,23,42,.12); }
        .llm-system,.llm-chat-input { width:100%; resize:none; border:1px solid #edf2f7; border-radius:14px; outline:none; padding:10px; background:#fbfdff; color:#111827; font-size:12px; line-height:1.5; }
        .llm-system { height:74px; }
        .llm-chat-log { min-height:82px; max-height:150px; overflow:auto; display:flex; flex-direction:column; gap:8px; padding:8px; border-radius:14px; background:#f8fafc; border:1px solid #edf2f7; user-select:text; cursor:text; }
        .node.sized.llm-node .llm-chat-log { flex:1; max-height:none; }
        .llm-bubble { max-width:86%; border-radius:14px; padding:7px 9px; font-size:12px; line-height:1.45; white-space:pre-wrap; user-select:text; cursor:text; }
        .llm-bubble.user { align-self:flex-end; background:#111827; color:#fff; }
        .llm-bubble.assistant { align-self:flex-start; background:#fff; color:#475569; border:1px solid #edf2f7; }
        .llm-output { min-height:70px; max-height:130px; overflow:auto; border:1px solid #edf2f7; border-radius:14px; background:#f8fafc; padding:10px; font-size:12px; line-height:1.5; color:#475569; white-space:pre-wrap; user-select:text; cursor:text; }
        .llm-pane-label { flex:0 0 auto; color:#94a3b8; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
        .llm-pane-resizer { height:12px; flex:0 0 12px; display:flex; align-items:center; justify-content:center; cursor:row-resize; touch-action:none; }
        .llm-pane-resizer::before { content:""; width:52px; height:3px; border-radius:999px; background:#cbd5e1; opacity:.72; transition:opacity .14s var(--ease), background .14s var(--ease); }
        .llm-pane-resizer:hover::before { opacity:1; background:#94a3b8; }
        .node.sized.llm-node .llm-output { flex:1; max-height:none; }
        .node.sized.llm-node .llm-node-pane,
        .node.sized.llm-node .llm-chat-pane { flex:1; min-height:0; display:flex; flex-direction:column; gap:6px; }
        .node.sized.llm-node .llm-run { margin-top:auto; flex-shrink:0; }
        .llm-run { height:36px; width:100%; border-radius:14px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.08em; }
        .llm-run:disabled { background:#e5e7eb; color:#94a3b8; cursor:not-allowed; }
        .theme-dark .llm-system,
        .theme-dark .llm-chat-input { background:#0f172a; color:var(--text); border-color:var(--line); }
        .theme-dark .llm-chat-log,
        .theme-dark .llm-output { background:var(--soft); border-color:var(--line); color:var(--muted); }
        .theme-dark .llm-pane-resizer::before { background:#475569; }
    `;
    document.head.appendChild(style);
}

/**
 * 创建新的 LLM 节点
 */
function addLLMNode(point) {
    const p = point || llmNodeDeps.defaultPoint(80, 0);
    llmNodeDeps.addNode({
        id: llmNodeDeps.uid('llm'),
        type: 'llm',
        x: p.x,
        y: p.y,
        model: llmNodeDeps.resolveChatModel(),
        mode: 'node',
        llmProvider: 'comfly',
        llmMsModel: '',
        systemPrompt: 'You are a helpful assistant. Rewrite the input into a concise image prompt.',
        showSystem: false,
        userInput: '',
        chatInput: '',
        messages: [],
        outputText: '',
        llmInputHeight: 110,
        llmOutputHeight: 150,
        running: false,
        runStatus: '',
        runError: '',
        _cascadeFailed: false
    });
}

/**
 * 渲染 LLM 节点内容
 */
function renderLLMBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'llm-body';
    const mode = node.mode || 'node';
    node.llmProvider = llmNodeDeps.resolveChatProviderId(node.llmProvider || 'comfly');
    const llmProv = node.llmProvider;
    if(llmProv === 'modelscope') node.model = node.llmMsModel || node.model;
    if(!llmNodeDeps.providerChatModels(llmProv).includes(node.model)) node.model = llmNodeDeps.providerChatModels(llmProv)[0] || node.model;
    const modelOpts = llmNodeDeps.chatModelOptions(node.model, llmProv);
    const imgs = llmNodeDeps.llmInputImages(node);
    const imgBadge = imgs.length ? `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;background:rgba(16,185,129,.12);color:#047857;font-size:10.5px;font-weight:700;width:fit-content;line-height:1.4"><i data-lucide="image" class="w-3 h-3"></i>已连接 ${imgs.length} 张图片 · 需选 VL 视觉模型（如 Qwen2.5-VL）</div>` : '';
    node.showSystem = Boolean(node.showSystem);
    wrap.innerHTML = `
        <div class="llm-row">
            <select class="select-lite llm-provider-select" style="flex:1">${llmNodeDeps.chatProviderOptions(llmProv)}</select>
            <select class="select-lite llm-model">${modelOpts}</select>
            <div class="llm-mode"><button data-mode="node">节点</button><button data-mode="chat">聊天</button></div>
            <button class="llm-sys-toggle ${node.showSystem ? 'active' : ''}" type="button">System</button>
        </div>
        ${imgBadge}
        ${node.showSystem ? `<textarea class="llm-system" placeholder="系统提示词...">${llmNodeDeps.escapeHtml(node.systemPrompt || '')}</textarea>` : ''}
        <div class="llm-node-pane"></div>
        <div class="llm-chat-pane"></div>
    `;
    
    const providerSelect = wrap.querySelector('.llm-provider-select');
    const modelSelect = wrap.querySelector('.llm-model');
    providerSelect.value = llmProv;
    modelSelect.value = llmNodeDeps.resolveChatModel(node.model, llmProv);
    [providerSelect, modelSelect].forEach(input => {
        input.onmousedown = e => e.stopPropagation();
        input.onclick = e => e.stopPropagation();
    });
    providerSelect.onchange = e => {
        e.stopPropagation();
        node.llmProvider = e.target.value;
        const models = llmNodeDeps.providerChatModels(node.llmProvider);
        node.model = models[0] || '';
        if(node.llmProvider === 'modelscope') node.llmMsModel = node.model;
        llmNodeDeps.render();
        llmNodeDeps.scheduleSave();
    };
    modelSelect.onchange = e => {
        e.stopPropagation();
        node.model = e.target.value;
        if((node.llmProvider||'comfly') === 'modelscope') node.llmMsModel = e.target.value;
        llmNodeDeps.scheduleSave();
    };
    wrap.querySelector('.llm-sys-toggle').onclick = e => { e.stopPropagation(); node.showSystem = !node.showSystem; llmNodeDeps.render(); llmNodeDeps.scheduleSave(); };
    const sysEl = wrap.querySelector('.llm-system');
    if(sysEl){ sysEl.oninput = e => { node.systemPrompt = e.target.value; llmNodeDeps.scheduleSave(); }; llmNodeDeps.bindScrollableText(sysEl); }
    wrap.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', mode === btn.dataset.mode);
        btn.onclick = e => { e.stopPropagation(); node.mode = btn.dataset.mode; llmNodeDeps.render(); llmNodeDeps.scheduleSave(); };
    });
    const nodePane = wrap.querySelector('.llm-node-pane');
    const chatPane = wrap.querySelector('.llm-chat-pane');
    if(mode === 'chat'){
        nodePane.style.display = 'none';
        renderLLMChatPane(chatPane, node);
    } else {
        chatPane.style.display = 'none';
        renderLLMNodePane(nodePane, node);
    }
    return wrap;
}

/**
 * 渲染 LLM 节点模式面板
 */
function renderLLMNodePane(container, node) {
    const connectedInput = llmNodeDeps.llmInputText ? llmNodeDeps.llmInputText(node) : '';
    const isReadonly = connectedInput.length > 0;
    const inputValue = connectedInput || node.userInput || '';
    const inputHeight = Math.max(70, node.llmInputHeight || 110);
    const outputHeight = Math.max(70, node.llmOutputHeight || 150);
    const inputPlaceholder = isReadonly ? '(来自连接)' : '直接输入，或连接提示词节点…';
    container.innerHTML = `
        <div class="llm-pane-label">Input${isReadonly ? ' <span style="font-size:9px;opacity:.5;font-weight:600;text-transform:none;letter-spacing:0">(来自连接)</span>' : ''}</div>
        <textarea class="llm-input-area llm-input-output" style="height:${inputHeight}px; flex:0 0 ${inputHeight}px;" ${isReadonly ? 'readonly' : ''} placeholder="${inputPlaceholder}">${llmNodeDeps.escapeHtml(inputValue)}</textarea>
        <div class="llm-pane-resizer" title="拖动调整输入/输出高度"></div>
        <div class="llm-pane-label">Output</div>
        <div class="llm-output-wrap" style="height:${outputHeight}px; flex:0 0 ${outputHeight}px;">
            <button class="llm-copy-btn llm-output-copy" type="button" title="复制"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
            <div class="llm-output llm-result-output">${llmNodeDeps.escapeHtml(node.outputText || '运行后会输出文本，可连到生成卡片')}</div>
        </div>
        <div class="gen-run-row mt-2">
            <button class="llm-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="play" class="w-4 h-4"></i>${node.running ? '运行中' : 'Run LLM'}</button>
            ${llmNodeDeps.cascadeBtnHtml ? llmNodeDeps.cascadeBtnHtml(node) : ''}
        </div>
        ${llmNodeDeps.retryBarHtml ? llmNodeDeps.retryBarHtml(node) : ''}
    `;
    const inputEl = container.querySelector('.llm-input-output');
    llmNodeDeps.bindScrollableText(inputEl);
    if(!isReadonly){
        inputEl.oninput = e => { node.userInput = e.target.value; };
    }
    llmNodeDeps.bindScrollableText(container.querySelector('.llm-result-output'));
    container.querySelector('.llm-pane-resizer').onmousedown = e => startLLMPaneResize(e, node);
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMNode(node.id); };
    if (llmNodeDeps.bindCascadeButtons) llmNodeDeps.bindCascadeButtons(container, node.id);
    const copyBtn = container.querySelector('.llm-output-copy');
    if(copyBtn){
        copyBtn.onmousedown = e => e.stopPropagation();
        copyBtn.onclick = async e => {
            e.stopPropagation();
            const text = node.outputText || '';
            if(!text) return;
            if(await llmNodeDeps.copyTextToClipboard(text)){
                copyBtn.classList.add('copied');
                setTimeout(() => copyBtn.classList.remove('copied'), 1500);
            }
        };
    }
}

/**
 * 渲染 LLM 聊天模式面板
 */
function renderLLMChatPane(container, node) {
    const messages = node.messages || [];
    container.innerHTML = `
        <div class="llm-chat-log">${messages.length ? messages.map((msg, mi) => `<div class="llm-bubble ${msg.role === 'user' ? 'user' : 'assistant'}" data-msg-idx="${mi}">${llmNodeDeps.escapeHtml(msg.content || '')}${msg.role === 'assistant' ? `<button class="llm-bubble-copy" type="button" title="复制"><i data-lucide="copy" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i></button>` : ''}</div>`).join('') : '<div class="text-[11px] text-gray-300">开始一段聊天...</div>'}</div>
        <textarea class="llm-chat-input mt-2" rows="2" placeholder="输入消息...">${llmNodeDeps.escapeHtml(node.chatInput || '')}</textarea>
        <button class="llm-run mt-2" ${node.running ? 'disabled' : ''}><i data-lucide="send" class="w-4 h-4"></i>${node.running ? '发送中' : 'Send'}</button>
    `;
    llmNodeDeps.bindScrollableText(container.querySelector('.llm-chat-log'));
    llmNodeDeps.bindScrollableText(container.querySelector('.llm-chat-input'));
    const chatInputEl = container.querySelector('.llm-chat-input');
    chatInputEl.oninput = e => { node.chatInput = e.target.value; llmNodeDeps.scheduleSave(); };
    chatInputEl.onkeydown = e => {
        if(e.key === 'Enter' && !e.shiftKey && !e.isComposing){
            e.preventDefault();
            e.stopPropagation();
            runLLMChat(node.id);
        }
    };
    container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMChat(node.id); };
    container.querySelectorAll('.llm-bubble-copy').forEach(btn => {
        btn.onmousedown = e => e.stopPropagation();
        btn.onclick = async e => {
            e.stopPropagation();
            const bubble = btn.closest('.llm-bubble');
            const idx = Number(bubble?.dataset.msgIdx);
            const msg = (node.messages || [])[idx];
            if(!msg) return;
            if(await llmNodeDeps.copyTextToClipboard(msg.content || '')){
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1500);
            }
        };
    });
}

/**
 * 调用 LLM API
 */
async function callCanvasLLM(node, message, messages = []) {
    const llmProv = node.llmProvider || 'comfly';
    const msModel = node.llmMsModel || (llmNodeDeps.msChatModels[0] || '');
    const result = await fetch('/api/canvas-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message,
            model: llmProv === 'modelscope' ? msModel : llmNodeDeps.resolveChatModel(node.model),
            ms_model: llmProv === 'modelscope' ? msModel : '',
            provider: llmProv,
            system_prompt: node.systemPrompt || 'You are a helpful assistant.',
            messages
        })
    }).then(async r => { 
        if (!r.ok) throw new Error((await r.json()).detail || 'LLM 运行失败'); 
        return r.json(); 
    });
    return result.text || '';
}

/**
 * 运行节点模式 LLM
 */
async function runLLMNode(nodeId, opts={}) {
    const cascade = opts.cascade || false;
    const node = llmNodeDeps.nodes.find(n => n.id === nodeId);
    if(!node || (node.running && !cascade)) return;
    const input = (llmNodeDeps.llmInputText ? llmNodeDeps.llmInputText(node) : '') || node.userInput || '';
    if(!input){
        if(cascade) throw new Error('LLM 缺少提示词输入');
        alert('请先连接 Prompt 或直接输入文本');
        return;
    }
    if(!cascade){ node.running = true; node.runStatus = ''; node.runError = ''; node._cascadeFailed = false; llmNodeDeps.render(); }
    try {
        node.outputText = await callCanvasLLM(node, input, []);
        if(!cascade) node.running = false;
        node.runStatus = 'done'; node.runError = '';
        llmNodeDeps.render();
        llmNodeDeps.scheduleSave();
    } catch(err) {
        if(!cascade) node.running = false;
        node.runStatus = 'failed'; node.runError = err.message || String(err);
        if(cascade) node._cascadeFailed = true;
        llmNodeDeps.render();
        if(cascade) throw err;
        alert(err.message || 'LLM 运行失败');
    }
}

/**
 * 运行聊天模式 LLM
 */
async function runLLMChat(nodeId) {
    const node = llmNodeDeps.nodes.find(n => n.id === nodeId);
    if (!node || node.running) return;
    const message = (node.chatInput || '').trim();
    if (!message) return;
    node.messages = node.messages || [];
    const history = node.messages.slice();
    node.messages.push({ role: 'user', content: message });
    node.chatInput = '';
    node.running = true;
    llmNodeDeps.render();
    try {
        const text = await callCanvasLLM(node, message, history);
        node.messages.push({ role: 'assistant', content: text });
        node.outputText = text;
        node.running = false;
        llmNodeDeps.render();
        llmNodeDeps.scheduleSave();
    } catch (err) {
        node.running = false;
        llmNodeDeps.render();
        alert(err.message || 'LLM 运行失败');
    }
}

/**
 * 获取 LLM 输入文本
 */
function llmInputText(node) {
    return llmNodeDeps.connections
        .filter(c => c.to === node.id)
        .map(c => llmNodeDeps.nodes.find(n => n.id === c.from))
        .filter(Boolean)
        .map(n => {
            if (n.type === 'prompt') return n.text || '';
            if (n.type === 'promptGroup') return (n.items || [])
                .map(id => llmNodeDeps.nodes.find(x => x.id === id))
                .filter(Boolean)
                .map(p => p.text || '')
                .filter(Boolean)
                .join('\n\n');
            if (n.type === 'llm') return n.outputText || '';
            return '';
        })
        .filter(Boolean)
        .join('\n\n');
}

/**
 * 开始 LLM 面板拖拽调整
 */
function startLLMPaneResize(e, node) {
    e.preventDefault();
    e.stopPropagation();
    llmPaneDrag = {
        node,
        sy: e.clientY,
        inputStart: Math.max(70, node.llmInputHeight || 110),
        outputStart: Math.max(70, node.llmOutputHeight || 150)
    };
    window.onmousemove = onLLMPaneResize;
    window.onmouseup = endLLMPaneResize;
}

/**
 * LLM 面板拖拽中
 */
function onLLMPaneResize(e) {
    if (!llmPaneDrag) return;
    const total = llmPaneDrag.inputStart + llmPaneDrag.outputStart;
    const delta = (e.clientY - llmPaneDrag.sy) / (llmNodeDeps.viewport?.scale || 1);
    const minPane = 70;
    const nextInput = Math.max(minPane, Math.min(total - minPane, llmPaneDrag.inputStart + delta));
    const nextOutput = Math.max(minPane, total - nextInput);
    llmPaneDrag.node.llmInputHeight = Math.round(nextInput);
    llmPaneDrag.node.llmOutputHeight = Math.round(nextOutput);
    const el = llmNodeDeps.nodesEl.querySelector(`.node[data-id="${llmPaneDrag.node.id}"]`);
    if (el) {
        const inputEl = el.querySelector('.llm-input-output');
        const outputEl = el.querySelector('.llm-result-output');
        if (inputEl) {
            inputEl.style.height = `${llmPaneDrag.node.llmInputHeight}px`;
            inputEl.style.flexBasis = `${llmPaneDrag.node.llmInputHeight}px`;
        }
        if (outputEl) {
            outputEl.style.height = `${llmPaneDrag.node.llmOutputHeight}px`;
            outputEl.style.flexBasis = `${llmPaneDrag.node.llmOutputHeight}px`;
        }
    }
}

/**
 * 结束 LLM 面板拖拽
 */
function endLLMPaneResize() {
    llmPaneDrag = null;
    window.onmousemove = null;
    window.onmouseup = null;
    llmNodeDeps.scheduleSave();
}


