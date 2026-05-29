let audioDeps = null;

function injectAudioNodeCSS() {
    if (document.getElementById('audio-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'audio-node-styles';
    style.textContent = `
        .audio-node { width:320px; }
        .audio-node .node-body { min-height:80px; }
        .audio-body { display:flex; flex-direction:column; gap:8px; padding:0 0 4px 0; }
        .audio-upload-area { position:relative; height:70px; border:2px dashed var(--line-2); border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:var(--muted); font-size:11px; font-weight:700; cursor:pointer; transition:all .15s var(--ease); }
        .audio-upload-area:hover { border-color:var(--strong); color:var(--strong); background:rgba(0,240,255,.04); }
        .audio-upload-area input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; }
        .audio-player-wrap { display:flex; align-items:center; gap:8px; padding:6px 0; }
        .audio-player-wrap audio { flex:1; height:32px; }
        .audio-file-name { font-size:10px; font-weight:700; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    `;
    document.head.appendChild(style);
}

function addAudioNode(point) {
    const p = point || audioDeps.defaultPoint(200, 0);
    return audioDeps.addNode({
        id: audioDeps.uid('aud'),
        type: 'audio',
        x: p.x,
        y: p.y,
        url: '',
        name: ''
    });
}

function renderAudioBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'audio-body';

    if (node.url) {
        wrap.innerHTML = `
            <div class="audio-player-wrap">
                <audio controls src="${audioDeps.escapeAttr(node.url)}" style="flex:1;height:32px;"></audio>
            </div>
            <div class="audio-file-name">${audioDeps.escapeHtml(node.name || node.url.split('/').pop() || '音频文件')}</div>
            <div class="audio-upload-area">
                <i data-lucide="music" class="w-4 h-4"></i>
                <span>替换音频</span>
                <input type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a" onchange="audioNodeModule.uploadAudio(this.files, '${node.id}')">
            </div>
        `;
    } else {
        wrap.innerHTML = `
            <div class="audio-upload-area">
                <i data-lucide="upload" class="w-4 h-4"></i>
                <span>点击上传音频文件</span>
                <input type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a" onchange="audioNodeModule.uploadAudio(this.files, '${node.id}')">
            </div>
        `;
    }

    if (audioDeps.refreshIcons) audioDeps.refreshIcons();
    
    wrap.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.openAudioNodeMenu(node.id, e.clientX, e.clientY);
    };
    
    return wrap;
}

async function uploadAudio(files, nodeId) {
    if (!files || !files.length) return;
    const file = files[0];
    const node = audioDeps.findNode(nodeId);
    if (!node) return;

    const form = new FormData();
    form.append('files', file);

    try {
        const res = await fetch(`/api/canvases/${audioDeps.canvas?.id || window.canvas?.id || ''}/assets/upload`, {
            method: 'POST',
            body: form
        });
        if (!res.ok) throw new Error('上传失败');
        const data = await res.json();
        if (data.files && data.files.length) {
            const uploaded = data.files[0];
            node.url = uploaded.url;
            node.name = uploaded.name || file.name;
            audioDeps.render();
            audioDeps.scheduleSave();
        }
    } catch (e) {
        alert('上传音频失败: ' + (e.message || e));
    }
}

function openAudioNodeMenu(nodeId, clientX, clientY) {
    const node = audioDeps.findNode(nodeId);
    if (!node || node.type !== 'audio') return;
    
    const imageNodeMenu = document.getElementById('imageNodeMenu');
    if (!imageNodeMenu) return;
    
    if (audioDeps.closeCreateMenu) audioDeps.closeCreateMenu();
    
    const hasUrl = !!node.url;
    
    imageNodeMenu.innerHTML = `
        <button class="menu-btn" data-audio-replace="${audioDeps.escapeHtml(nodeId)}"><i data-lucide="music" class="w-4 h-4"></i><span>替换音频</span></button>
        ${hasUrl ? `
        <div class="menu-divider"></div>
        <button class="menu-btn" data-audio-to-asset="${audioDeps.escapeHtml(nodeId)}"><i data-lucide="folder-open" class="w-4 h-4"></i><span>发送到资产库</span></button>
        ` : ''}
    `;
    imageNodeMenu.style.left = `${clientX}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    
    imageNodeMenu.querySelector('[data-audio-replace]').onclick = e => {
        e.stopPropagation();
        closeAudioNodeMenu();
        pickAudioForNode(nodeId);
    };
    
    const assetBtn = imageNodeMenu.querySelector('[data-audio-to-asset]');
    if (assetBtn) {
        assetBtn.onclick = async e => {
            e.stopPropagation();
            closeAudioNodeMenu();
            const url = node.url;
            if (url) {
                await window.sendToAssetLibrary(url);
                if (window.canvas) {
                    window.openAssetLibrary();
                }
            }
        };
    }
    
    if (audioDeps.refreshIcons) audioDeps.refreshIcons();
}

function closeAudioNodeMenu() {
    const menu = document.getElementById('imageNodeMenu');
    if (menu) {
        menu.classList.remove('open');
        menu.classList.remove('output-node-menu');
        menu.innerHTML = '';
    }
}

function pickAudioForNode(nodeId) {
    const node = audioDeps.findNode(nodeId);
    if (!node) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a';
    input.onchange = () => {
        if (input.files && input.files.length) {
            uploadAudio(input.files, nodeId);
        }
    };
    input.click();
}

function initAudioNode(canvasDeps) {
    audioDeps = canvasDeps;
    injectAudioNodeCSS();
}

window.addAudioNode = addAudioNode;
window.renderAudioBody = renderAudioBody;
window.initAudioNode = initAudioNode;
window.openAudioNodeMenu = openAudioNodeMenu;
window.closeAudioNodeMenu = closeAudioNodeMenu;
window.audioNodeModule = {
    uploadAudio,
    addAudioNode,
    openAudioNodeMenu,
    closeAudioNodeMenu
};
