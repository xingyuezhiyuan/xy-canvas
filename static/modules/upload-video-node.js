let uploadVideoDeps = null;

function injectUploadVideoNodeCSS() {
    if (document.getElementById('upload-video-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'upload-video-node-styles';
    style.textContent = `
        .upload-video-node { width:320px; }
        .upload-video-node .node-body { min-height:80px; }
        .uv-body { display:flex; flex-direction:column; gap:8px; padding:0 0 4px 0; }
        .uv-upload-area { position:relative; height:120px; border:2px dashed var(--line-2); border-radius:14px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:var(--muted); font-size:11px; font-weight:700; cursor:pointer; transition:all .15s var(--ease); overflow:hidden; }
        .uv-upload-area:hover { border-color:var(--strong); color:var(--strong); background:rgba(0,240,255,.04); }
        .uv-upload-area input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; }
        .uv-upload-area video { width:100%; height:100%; object-fit:cover; position:absolute; inset:0; border-radius:12px; }
        .uv-upload-area .uv-upload-hint { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:4px; pointer-events:none; }
        .uv-upload-area.has-video .uv-upload-hint { opacity:0; transition:opacity .15s var(--ease); }
        .uv-upload-area.has-video:hover .uv-upload-hint { opacity:1; background:rgba(0,0,0,.5); color:#fff; padding:6px 12px; border-radius:8px; }
        .uv-file-name { font-size:10px; font-weight:700; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    `;
    document.head.appendChild(style);
}

function addUploadVideoNode(point) {
    const p = point || uploadVideoDeps.defaultPoint(220, 0);
    return uploadVideoDeps.addNode({
        id: uploadVideoDeps.uid('uv'),
        type: 'upload-video',
        x: p.x,
        y: p.y,
        url: '',
        name: ''
    });
}

function renderUploadVideoBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'uv-body';

    if (node.url) {
        wrap.innerHTML = `
            <div class="uv-upload-area has-video">
                <video src="${uploadVideoDeps.escapeAttr(node.url)}" preload="metadata" muted></video>
                <div class="uv-upload-hint">
                    <i data-lucide="upload" class="w-4 h-4"></i>
                    <span>替换视频</span>
                </div>
                <input type="file" accept="video/*,.mp4,.webm,.mov,.avi,.mkv" onchange="uploadVideoNodeModule.uploadVideo(this.files, '${node.id}')">
            </div>
            <div class="uv-file-name">${uploadVideoDeps.escapeHtml(node.name || node.url.split('/').pop() || '视频文件')}</div>
        `;
    } else {
        wrap.innerHTML = `
            <div class="uv-upload-area">
                <div class="uv-upload-hint">
                    <i data-lucide="upload" class="w-5 h-5"></i>
                    <span>点击上传视频文件</span>
                </div>
                <input type="file" accept="video/*,.mp4,.webm,.mov,.avi,.mkv" onchange="uploadVideoNodeModule.uploadVideo(this.files, '${node.id}')">
            </div>
        `;
    }

    if (uploadVideoDeps.refreshIcons) uploadVideoDeps.refreshIcons();
    return wrap;
}

async function uploadVideo(files, nodeId) {
    if (!files || !files.length) return;
    const file = files[0];
    const node = uploadVideoDeps.findNode(nodeId);
    if (!node) return;

    const form = new FormData();
    form.append('files', file);

    try {
        const res = await fetch(`/api/canvases/${uploadVideoDeps.canvas?.id || window.canvas?.id || ''}/assets/upload`, {
            method: 'POST',
            body: form
        });
        if (!res.ok) throw new Error('上传失败');
        const data = await res.json();
        if (data.files && data.files.length) {
            const uploaded = data.files[0];
            node.url = uploaded.url;
            node.name = uploaded.name || file.name;
            uploadVideoDeps.render();
            uploadVideoDeps.scheduleSave();
        }
    } catch (e) {
        alert('上传视频失败: ' + (e.message || e));
    }
}

function initUploadVideoNode(canvasDeps) {
    uploadVideoDeps = canvasDeps;
    injectUploadVideoNodeCSS();
}

function openUploadVideoNodeMenu(nodeId, clientX, clientY) {
    const node = uploadVideoDeps.findNode(nodeId);
    if (!node || node.type !== 'upload-video') return;

    const menu = document.getElementById('imageNodeMenu');
    if (!menu) return;

    if (uploadVideoDeps.closeCreateMenu) uploadVideoDeps.closeCreateMenu();

    const hasUrl = !!node.url;

    menu.innerHTML = `
        <div class="menu-section-title">视频节点操作</div>
        ${hasUrl ? `
        <button class="menu-btn" data-uv-to-asset="${uploadVideoDeps.escapeHtml(nodeId)}"><i data-lucide="folder-open" class="w-4 h-4"></i><span>发送到资产库</span></button>
        ` : ''}
    `;
    menu.style.left = `${clientX}px`;
    menu.style.top = `${clientY}px`;
    menu.classList.add('open');

    const assetBtn = menu.querySelector('[data-uv-to-asset]');
    if (assetBtn) {
        assetBtn.onclick = async e => {
            e.stopPropagation();
            closeUploadVideoNodeMenu();
            if (node.url) {
                await window.sendToAssetLibrary([node.url]);
                if (window.canvas) {
                    window.openAssetLibrary();
                }
            }
        };
    }

    if (uploadVideoDeps.refreshIcons) uploadVideoDeps.refreshIcons();
}

function closeUploadVideoNodeMenu() {
    const menu = document.getElementById('imageNodeMenu');
    if (menu) {
        menu.classList.remove('open');
        menu.classList.remove('output-node-menu');
        menu.innerHTML = '';
    }
}

window.addUploadVideoNode = addUploadVideoNode;
window.renderUploadVideoBody = renderUploadVideoBody;
window.initUploadVideoNode = initUploadVideoNode;
window.openUploadVideoNodeMenu = openUploadVideoNodeMenu;
window.closeUploadVideoNodeMenu = closeUploadVideoNodeMenu;
window.uploadVideoNodeModule = {
    uploadVideo,
    addUploadVideoNode
};
