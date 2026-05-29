/**
 * Loop Node 模块
 * 负责无限画布中 loop 节点的创建、渲染、循环执行等功能
 */

let loopDeps = null;

function injectLoopNodeCSS() {
    if (document.getElementById('loop-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'loop-node-styles';
    style.textContent = `.loop-node { width:336px; }.loop-node .node-body { overflow:auto !important; min-width:0; }.loop-body { display:flex; flex-direction:column; gap:10px; min-width:0; width:100%; max-width:100%; overflow:hidden; }.loop-count-row { display:flex; flex-direction:column; gap:8px; padding:8px 10px; border:1px solid var(--line-2); border-radius:16px; background:linear-gradient(180deg, var(--card-solid), var(--soft)); }.loop-toggle-row,.loop-run-row,.loop-image-row { display:flex; align-items:center; gap:8px; min-width:0; width:100%; }.loop-toggle-row { justify-content:flex-start; margin-top:6px; padding-top:8px; border-top:1px solid var(--line-2); }.loop-toggle-row .loop-toggle { flex:0 0 96px; }.loop-count-group { display:flex; align-items:center; gap:6px; flex:0 0 auto; }.loop-count-label { font-size:11px; font-weight:700; color:var(--muted); white-space:nowrap; }.loop-count-input { width:48px; height:30px; border:1px solid var(--line-2); border-radius:10px; background:var(--card-solid); color:var(--text); outline:none; padding:0 8px; font-size:13px; font-weight:900; text-align:center; }.loop-toggle { min-height:28px; flex:0 1 auto; max-width:100%; border-radius:999px; padding:4px 9px; display:flex; align-items:center; justify-content:center; gap:5px; border:1px solid var(--line-2); background:var(--card-solid); color:var(--muted); font-size:10.5px; line-height:1.15; font-weight:850; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:center; }.loop-toggle.active { background:var(--strong); color:var(--strong-text); border-color:var(--strong); }.loop-prompt-panel,.loop-image-panel { display:flex; flex-direction:column; gap:10px; min-width:0; width:100%; max-width:100%; overflow:hidden; box-sizing:border-box; }.loop-field { display:flex; flex-direction:column; gap:5px; min-width:0; width:100%; max-width:100%; overflow:hidden; box-sizing:border-box; }.loop-field textarea,.loop-variable-editor { display:block; inline-size:100%; max-inline-size:100%; min-inline-size:0; border:1px solid var(--line-2); border-radius:12px; background:var(--card-solid); color:var(--text); padding:10px 12px; font-size:12px; line-height:1.5; resize:none; outline:none; }.loop-variable-editor:empty::before { content:attr(data-placeholder); color:var(--faint); }.loop-start-row,.loop-image-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }.loop-token-btn { height:26px; border-radius:999px; padding:0 10px; display:flex; align-items:center; justify-content:center; gap:4px; border:1px solid var(--line-2); background:var(--card-solid); color:var(--muted); font-size:10px; font-weight:800; cursor:pointer; transition:all .15s var(--ease); }.loop-token-btn:hover { background:var(--soft-2); color:var(--text); }.loop-image-hint { font-size:11px; color:var(--faint); padding:4px 0; }.loop-image-list { display:flex; flex-direction:column; gap:6px; margin-top:6px; }.loop-image-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:10px; background:var(--soft); border:1px solid var(--line-2); font-size:11px; color:var(--muted); }.loop-run-btn { height:40px; width:100%; border-radius:16px; background:var(--strong); color:var(--strong-text); display:flex; align-items:center; justify-content:center; gap:8px; font-size:11px; font-weight:800; letter-spacing:.12em; transition:all .15s ease; }.loop-run-btn:hover { filter:brightness(1.1); }.loop-run-btn:disabled { opacity:.4; cursor:not-allowed; filter:none; }`;
    document.head.appendChild(style);
}

function addLoopNode(point) {
    const p = point || loopDeps.defaultPoint(40, 0);
    return loopDeps.addNode({
        id: loopDeps.uid('loop'),
        type: 'loop',
        x: p.x,
        y: p.y,
        count: 3,
        mode: 'serial',
        showPrompt: false,
        imageInput: false,
        loopStart: 1,
        imageBatchSize: 1,
        variablePrompt: '',
        fixedPrompt: ''
    });
}

function renderLoopBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'loop-body';
    
    node.count = Math.max(1, Number(node.count) || 3);
    node.mode = node.mode === 'parallel' ? 'parallel' : 'serial';
    node.showPrompt = Boolean(node.showPrompt);
    node.imageInput = Boolean(node.imageInput);
    node.loopStart = Math.max(1, Number(node.loopStart) || 1);
    node.imageBatchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
    
    const imageInputCount = getImageInputCount(node);
    
    const imageListHtml = node.imageInput ? buildImageListHtml(node) : '';
    
    wrap.innerHTML = `
        <div class="loop-count-row">
            <div class="loop-run-row">
                <div class="loop-count-group">
                    <span class="loop-count-label">循环次数</span>
                    <input class="loop-count-input" type="number" min="1" max="100" step="1" value="${node.count}">
                </div>
                <div class="seg loop-mode">
                    <button type="button" data-loop-mode="serial" class="${node.mode !== 'parallel' ? 'active' : ''}">串行</button>
                    <button type="button" data-loop-mode="parallel" class="${node.mode === 'parallel' ? 'active' : ''}">并行</button>
                </div>
            </div>
            <div class="loop-toggle-row">
                <button class="loop-toggle loop-image-toggle ${node.imageInput ? 'active' : ''}" type="button"><i data-lucide="image" class="w-3.5 h-3.5"></i>图片输入</button>
                <button class="loop-toggle loop-prompt-toggle ${node.showPrompt ? 'active' : ''}" type="button"><i data-lucide="text-cursor-input" class="w-3.5 h-3.5"></i>提示词</button>
            </div>
        </div>
        ${node.imageInput ? `<div class="loop-image-panel">
            <div class="loop-image-row">
                <span class="loop-count-label">起始计数</span>
                <input class="loop-count-input loop-image-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
                <span class="loop-count-label">批次大小</span>
                <input class="loop-count-input loop-batch-input" type="number" min="1" max="100" step="1" value="${node.imageBatchSize}">
            </div>
            <div class="loop-image-hint">${imageInputCount ? `将输入第 ${node.loopStart} 张图片` : '未连接图片'}</div>
            ${imageListHtml}
        </div>` : ''}
        ${node.showPrompt ? `<div class="loop-prompt-panel">
            <div class="loop-field">
                <div class="loop-variable-editor" contenteditable="true" data-placeholder="输入提示词，使用《计数》作为变量">${loopDeps.escapeHtml(node.variablePrompt || '')}</div>
            </div>
            <div class="loop-start-row">
                <button class="loop-token-btn loop-counter-token-btn" type="button" data-token="《计数》">《计数》</button>
                <span class="loop-count-label">起始计数</span>
                <input class="loop-count-input loop-start-input" type="number" min="1" max="9999" step="1" value="${node.loopStart}">
            </div>
        </div>` : ''}
        <div class="gen-run-row" style="margin-top:10px">
            <button class="loop-run-btn" type="button"><i data-lucide="play-circle" class="w-4 h-4"></i><span>批量运行</span></button>
        </div>
    `;
    
    bindLoopEvents(wrap, node);
    
    if (loopDeps.refreshIcons) loopDeps.refreshIcons();
    return wrap;
}

function getImageInputCount(node) {
    if (!node.imageInput) return 0;
    const nodes = (typeof window.getNodes === 'function') ? window.getNodes() : [];
    const connections = (typeof window.getConnections === 'function') ? window.getConnections() : [];
    
    const connectedImages = connections
        .filter(c => c.to === node.id)
        .map(c => nodes.find(n => n.id === c.from))
        .filter(n => {
            if (!n) return false;
            if (n.type === 'image' && n.url) return true;
            if (n.type === 'group') {
                const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
                return items.some(img => img.type === 'image' && img.url);
            }
            return false;
        });
    
    let count = 0;
    connectedImages.forEach(n => {
        if (n.type === 'image') {
            count++;
        } else if (n.type === 'group') {
            const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
            count += items.filter(img => img.type === 'image' && img.url).length;
        }
    });
    
    return count;
}

function buildImageListHtml(node) {
    const nodes = (typeof window.getNodes === 'function') ? window.getNodes() : [];
    const connections = (typeof window.getConnections === 'function') ? window.getConnections() : [];
    
    const connectedSources = connections
        .filter(c => c.to === node.id)
        .map(c => nodes.find(n => n.id === c.from))
        .filter(n => {
            if (!n) return false;
            if (n.type === 'image' && n.url) return true;
            if (n.type === 'group') {
                const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
                return items.some(img => img.type === 'image' && img.url);
            }
            return false;
        });
    
    if (!connectedSources.length) return '';
    
    const items = [];
    let index = 1;
    
    connectedSources.forEach(n => {
        if (n.type === 'image') {
            const name = n.name || `图片 ${index}`;
            items.push(`<div class="loop-image-item"><i data-lucide="image" class="w-3.5 h-3.5"></i><span>${loopDeps.escapeHtml(name)}</span></div>`);
            index++;
        } else if (n.type === 'group') {
            const groupItems = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
            const images = groupItems.filter(img => img.type === 'image' && img.url);
            
            if (images.length > 0) {
                const groupName = n.title || '图片分组';
                items.push(`<div class="loop-image-item" style="background:var(--soft-2)"><i data-lucide="folder" class="w-3.5 h-3.5"></i><span>${loopDeps.escapeHtml(groupName)} (${images.length}张)</span></div>`);
                images.forEach(img => {
                    const name = img.name || `图片 ${index}`;
                    items.push(`<div class="loop-image-item" style="margin-left:16px"><i data-lucide="image" class="w-3.5 h-3.5"></i><span>${loopDeps.escapeHtml(name)}</span></div>`);
                    index++;
                });
            }
        }
    });
    
    return `<div class="loop-image-list">${items.join('')}</div>`;
}

function bindLoopEvents(wrap, node) {
    const countInput = wrap.querySelector('.loop-count-input:not(.loop-image-start-input):not(.loop-batch-input):not(.loop-start-input)');
    if (countInput) {
        countInput.oninput = (e) => {
            node.count = Math.max(1, parseInt(e.target.value) || 1);
            loopDeps.scheduleSave();
        };
    }
    
    wrap.querySelectorAll('[data-loop-mode]').forEach(btn => {
        btn.onclick = () => {
            node.mode = btn.dataset.loopMode;
            wrap.querySelectorAll('[data-loop-mode]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loopDeps.scheduleSave();
        };
    });
    
    const imageToggle = wrap.querySelector('.loop-image-toggle');
    if (imageToggle) {
        imageToggle.onclick = function() {
            node.imageInput = !node.imageInput;
            this.classList.toggle('active');
            if (node.imageInput) {
                node.loopStart = Math.max(1, Number(node.loopStart) || 1);
            }
            loopDeps.render();
            loopDeps.scheduleSave();
        };
    }
    
    const promptToggle = wrap.querySelector('.loop-prompt-toggle');
    if (promptToggle) {
        promptToggle.onclick = () => {
            node.showPrompt = !node.showPrompt;
            loopDeps.render();
            loopDeps.scheduleSave();
        };
    }
    
    const imageStartInput = wrap.querySelector('.loop-image-start-input');
    if (imageStartInput) {
        imageStartInput.oninput = (e) => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            loopDeps.scheduleSave();
            if (typeof window.syncGeneratorInputs === 'function') {
                window.syncGeneratorInputs();
            }
        };
    }
    
    const batchInput = wrap.querySelector('.loop-batch-input');
    if (batchInput) {
        batchInput.oninput = (e) => {
            node.imageBatchSize = Math.max(1, Math.min(100, Number(e.target.value) || 1));
            e.target.value = node.imageBatchSize;
            loopDeps.scheduleSave();
            if (typeof window.syncGeneratorInputs === 'function') {
                window.syncGeneratorInputs();
            }
        };
    }
    
    const startInput = wrap.querySelector('.loop-start-input');
    if (startInput) {
        startInput.oninput = (e) => {
            node.loopStart = Math.max(1, Number(e.target.value) || 1);
            loopDeps.scheduleSave();
            if (typeof window.syncGeneratorInputs === 'function') {
                window.syncGeneratorInputs();
            }
        };
    }
    
    const variableEditor = wrap.querySelector('.loop-variable-editor');
    if (variableEditor) {
        variableEditor.oninput = () => {
            node.variablePrompt = variableEditor.textContent;
            loopDeps.scheduleSave();
        };
        
        wrap.querySelector('.loop-counter-token-btn').addEventListener('click', () => {
            variableEditor.textContent += '《计数》';
            node.variablePrompt = variableEditor.textContent;
            loopDeps.scheduleSave();
        });
    }
    
    wrap.querySelectorAll('button, select, textarea, input').forEach(control => {
        control.addEventListener('mousedown', e => e.stopPropagation());
        control.addEventListener('click', e => e.stopPropagation());
    });
    
    const runBtn = wrap.querySelector('.loop-run-btn');
    if (runBtn) {
        runBtn.onclick = (e) => {
            e.stopPropagation();
            if (typeof window.runLoopCascade === 'function') {
                window.runLoopCascade(node.id);
            } else {
                alert('循环节点运行功能待实现');
            }
        };
    }
}

function initLoopNode(canvasDeps) {
    loopDeps = canvasDeps;
    injectLoopNodeCSS();
}

window.addLoopNode = addLoopNode;
window.renderLoopBody = renderLoopBody;
window.initLoopNode = initLoopNode;