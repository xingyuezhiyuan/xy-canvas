/**
 * Asset Library 模块
 * 负责无限画布资产库功能：左侧滑出面板、资产文件夹管理、图片上传/拖入/删除
 * 预留保存工作流和保存画布功能
 */

let assetFolderCreated = false;

window.toggleAssetLibrary = function() {
    const sidebar = document.getElementById('assetSidebar');
    const backdrop = document.getElementById('assetBackdrop');
    if (sidebar.classList.contains('open')) {
        closeAssetLibrary();
    } else {
        openAssetLibrary();
    }
};

window.closeAssetLibrary = function() {
    document.getElementById('assetSidebar').classList.remove('open');
    document.getElementById('assetBackdrop').classList.remove('open');
};

window.openAssetLibrary = function() {
    const sidebar = document.getElementById('assetSidebar');
    const backdrop = document.getElementById('assetBackdrop');
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    refreshIcons();
    loadAssetLibrary();
};

async function loadAssetLibrary() {
    if (!ensureCanvas()) return;
    showAssetLoading(true);
    try {
        await ensureAssetFolder();
        await refreshAssetList();
    } catch (e) {
        showAssetError('加载资产库失败: ' + (e.message || e));
    }
    showAssetLoading(false);
}

function showAssetLoading(show) {
    const el = document.getElementById('assetLoading');
    if (el) el.style.display = show ? 'flex' : 'none';
    if (show) refreshIcons();
}

function showAssetError(msg) {
    const content = document.getElementById('assetContent');
    content.innerHTML = `<div class="asset-empty"><div class="asset-empty-icon"><i data-lucide="alert-circle" class="w-8 h-8"></i></div>${msg}</div>`;
    refreshIcons();
}

async function ensureAssetFolder() {
    if (!window.canvas) return;
    const res = await fetch(`/api/canvases/${window.canvas.id}/asset-folder`, { method: 'POST' });
    if (!res.ok) throw new Error('创建资产文件夹失败');
    const data = await res.json();
    assetFolderCreated = true;
    return data;
}

window.refreshAssetList = refreshAssetList;
async function refreshAssetList() {
    if (!window.canvas) return;
    const content = document.getElementById('assetContent');
    try {
        const res = await fetch(`/api/canvases/${window.canvas.id}/assets`);
        if (!res.ok) throw new Error('获取资产列表失败');
        const data = await res.json();
        renderAssets(data.files || []);
    } catch (e) {
        showAssetError('加载失败: ' + (e.message || e));
    }
}

function renderAssets(files) {
    const content = document.getElementById('assetContent');
    if (!files.length) {
        content.innerHTML = `
            <div class="asset-folder-status"><i data-lucide="folder" class="w-3.5 h-3.5 inline-block align-text-bottom"></i>资产文件夹已就绪</div>
            <div class="asset-upload-area" id="assetUploadArea">
                <i data-lucide="upload" class="w-5 h-5"></i>
                <span>点击上传图片，或在画布中右键上传到资产库</span>
                <input type="file" multiple accept="image/*,.txt,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.flac,.aac,.m4a" onchange="uploadAssetsToLibrary(this.files)">
            </div>
            <div class="asset-empty">
                <div class="asset-empty-icon"><i data-lucide="folder-open" class="w-8 h-8"></i></div>
                <span>暂无资产文件</span>
                <span style="font-size:10px;color:var(--faint);font-weight:400;">在画布中右键图片可上传到资产库</span>
            </div>
        `;
    } else {
        content.innerHTML = `
            <div class="asset-folder-status"><i data-lucide="folder" class="w-3.5 h-3.5 inline-block align-text-bottom"></i>资产文件夹 · ${files.length} 个文件</div>
            <div class="asset-upload-area" id="assetUploadArea">
                <i data-lucide="upload" class="w-5 h-5"></i>
                <span>点击上传图片，或在画布中右键上传到资产库</span>
                <input type="file" multiple accept="image/*,.txt,.mp4,.webm,.mov,.avi,.mkv,.mp3,.wav,.ogg,.flac,.aac,.m4a" onchange="uploadAssetsToLibrary(this.files)">
            </div>
            <div class="asset-grid">${files.map(f => renderAssetItem(f)).join('')}</div>
        `;
    }
    setupAssetDragDrop();
    refreshIcons();
}

function renderAssetItem(file) {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext);
    const isVideo = ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
    const isAudio = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext);
    const isText = ext === 'txt';
    
    if (isImage) {
        return `
            <div class="asset-item" 
                 draggable="false" 
                 title="${file.name}"
                 oncontextmenu="window.openAssetItemMenu('${file.name.replace(/'/g, "\\'")}', '${file.url.replace(/'/g, "\\'")}', 'image', event.clientX, event.clientY)">
                <img class="asset-item-img" src="${file.url}" alt="${file.name}" loading="lazy" draggable="true" data-asset-url="${file.url}" onclick="window.open('${file.url}', '_blank')" ondragstart="assetItemDragStart(event)">
                <div class="asset-item-name">${file.name}</div>
                <button class="asset-item-delete" type="button" onclick="deleteAssetFile('${file.name}', event)" title="删除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>
        `;
    }
    if (isVideo) {
        return `
            <div class="asset-item asset-item-video" 
                 draggable="false" 
                 title="${file.name}"
                 oncontextmenu="window.openAssetItemMenu('${file.name.replace(/'/g, "\\'")}', '${file.url.replace(/'/g, "\\'")}', 'video', event.clientX, event.clientY)">
                <div class="asset-item-media-preview">
                    <video class="asset-item-video-el" src="${file.url}" preload="metadata" muted onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0" onclick="window.open('${file.url}', '_blank')"></video>
                    <div class="asset-item-media-icon"><i data-lucide="film" class="w-5 h-5"></i></div>
                </div>
                <div class="asset-item-name">${file.name}</div>
                <button class="asset-item-delete" type="button" onclick="deleteAssetFile('${file.name}', event)" title="删除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>
        `;
    }
    if (isAudio) {
        return `
            <div class="asset-item asset-item-audio" 
                 draggable="false" 
                 title="${file.name}"
                 oncontextmenu="window.openAssetItemMenu('${file.name.replace(/'/g, "\\'")}', '${file.url.replace(/'/g, "\\'")}', 'audio', event.clientX, event.clientY)">
                <div class="asset-item-media-preview" onclick="previewAssetAudio('${file.url}', '${file.name.replace(/'/g, "\\'")}')">
                    <div class="asset-item-media-icon"><i data-lucide="music" class="w-6 h-6"></i></div>
                    <audio class="asset-item-audio-el" src="${file.url}" preload="none"></audio>
                </div>
                <div class="asset-item-name">${file.name}</div>
                <button class="asset-item-delete" type="button" onclick="deleteAssetFile('${file.name}', event)" title="删除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>
        `;
    }
    if (isText) {
        return `
            <div class="asset-item asset-item-text" 
                 draggable="false" 
                 title="${file.name}"
                 oncontextmenu="window.openAssetItemMenu('${file.name.replace(/'/g, "\\'")}', '${file.url.replace(/'/g, "\\'")}', 'text', event.clientX, event.clientY)">
                <div class="asset-item-media-preview" onclick="previewAssetText('${file.url}', '${file.name.replace(/'/g, "\\'")}')">
                    <div class="asset-item-media-icon"><i data-lucide="file-text" class="w-6 h-6"></i></div>
                    <div class="asset-item-text-preview" data-text-url="${file.url}">加载中...</div>
                </div>
                <div class="asset-item-name">${file.name}</div>
                <button class="asset-item-delete" type="button" onclick="deleteAssetFile('${file.name}', event)" title="删除"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
            </div>
        `;
    }
    return '';
}

window.uploadAssetsToLibrary = uploadAssetsToLibrary;
async function uploadAssetsToLibrary(files) {
    if (!window.canvas || !files || !files.length) return;
    const form = new FormData();
    for (const file of files) {
        form.append('files', file);
    }
    try {
        const res = await fetch(`/api/canvases/${window.canvas.id}/assets/upload`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('上传失败');
        await refreshAssetList();
    } catch (e) {
        alert('上传资产失败: ' + (e.message || e));
    }
}

window.copyToAssetLibrary = copyToAssetLibrary;
async function copyToAssetLibrary(url) {
    if (!window.canvas || !url) return;
    if (!url.startsWith('/output/')) {
        alert('只能从画布输出图片复制到资产库');
        return;
    }
    try {
        const res = await fetch(`/api/canvases/${window.canvas.id}/assets/copy-from-canvas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: [url] })
        });
        if (!res.ok) throw new Error('复制失败');
        const data = await res.json();
        if (data.files && data.files.length) {
            await refreshAssetList();
        }
    } catch (e) {
        alert('复制到资产库失败: ' + (e.message || e));
    }
}

window.deleteAssetFile = deleteAssetFile;
async function deleteAssetFile(filename, event) {
    event?.stopPropagation();
    try {
        const res = await fetch(`/api/canvases/${window.canvas.id}/assets/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename })
        });
        if (!res.ok) throw new Error('删除失败');
        await refreshAssetList();
    } catch (e) {
        alert('删除资产文件失败: ' + (e.message || e));
    }
};

window.assetItemDragStart = function(e) {
    const img = e.target;
    const url = img.getAttribute('data-asset-url') || img.src;
    if (!url) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-canvas-asset-image', url);
    e.dataTransfer.setData('text/uri-list', url);
    // 拖动时让 backdrop 不拦截事件，使画布能收到 dragover/drop
    const backdrop = document.getElementById('assetBackdrop');
    if (backdrop) backdrop.style.pointerEvents = 'none';
};

window.createImageNodeFromAsset = function(url, point) {
    if (!window.canvas || !url) return;
    if (typeof ensureCanvas === 'function' && !ensureCanvas()) return;
    const p = point || { x: 0, y: 0 };
    if (typeof nodes !== 'undefined' && Array.isArray(nodes)) {
        const id = 'img' + Date.now() + Math.random().toString(36).slice(2, 6);
        nodes.push({ id, type: 'image', x: p.x, y: p.y, url, name: url.split('/').pop() || 'asset' });
        if (typeof render === 'function') render();
        if (typeof scheduleSave === 'function') scheduleSave();
    }
};

function setupAssetDragDrop() {
    const uploadArea = document.getElementById('assetUploadArea');
    if (!uploadArea) return;
    uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer?.files;
        if (files && files.length) {
            uploadAssetsToLibrary(files);
        }
    });
}

window.previewAssetText = async function(url, name) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        const maxLen = 2000;
        const content = text.length > maxLen ? text.slice(0, maxLen) + '\n\n... (已截断，完整内容请在浏览器中打开)' : text;
        // 在覆盖层中显示文本内容
        let overlay = document.getElementById('assetTextPreviewOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'assetTextPreviewOverlay';
            overlay.className = 'asset-text-overlay';
            overlay.onclick = function(e) { if (e.target === overlay) overlay.classList.remove('open'); };
            document.body.appendChild(overlay);
        }
        overlay.innerHTML = `
            <div class="asset-text-overlay-head">
                <span>${name}</span>
                <button onclick="document.getElementById('assetTextPreviewOverlay').classList.remove('open')"><i data-lucide="x" class="w-4 h-4"></i></button>
            </div>
            <pre class="asset-text-overlay-body">${escapeHtmlForPreview(content)}</pre>
        `;
        overlay.classList.add('open');
        if (typeof refreshIcons === 'function') refreshIcons();
    } catch (e) {
        alert('加载文本内容失败: ' + (e.message || e));
    }
};

window.previewAssetAudio = function(url, name) {
    let overlay = document.getElementById('assetAudioPreviewOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'assetAudioPreviewOverlay';
        overlay.className = 'asset-text-overlay';
        overlay.onclick = function(e) { if (e.target === overlay) { overlay.classList.remove('open'); const audio = overlay.querySelector('audio'); if (audio) audio.pause(); } };
        document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
        <div class="asset-text-overlay-head">
            <span>${name}</span>
            <button onclick="document.getElementById('assetAudioPreviewOverlay').classList.remove('open'); const a = document.getElementById('assetAudioPlayer'); if(a) a.pause();"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>
        <div class="asset-audio-overlay-body">
            <i data-lucide="music" class="w-12 h-12" style="opacity:.3;margin-bottom:8px;"></i>
            <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:16px;">${name}</div>
            <audio id="assetAudioPlayer" src="${url}" controls autoplay style="width:100%;max-width:400px;"></audio>
        </div>
    `;
    overlay.classList.add('open');
    if (typeof refreshIcons === 'function') refreshIcons();
};

function escapeHtmlForPreview(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initCanvasDragToAsset() {
    document.addEventListener('dragstart', e => {
        const target = e.target;
        const imgNode = target.closest('.node.image-node, .node.output-node, .node.comfy-node');
        if (imgNode) {
            const img = target.tagName === 'IMG' ? target : target.querySelector('img');
            if (img && img.src) {
                e.dataTransfer.setData('text/plain', img.src);
            }
        }
    });

    // 拖动结束后恢复 backdrop 的指针事件
    document.addEventListener('dragend', () => {
        const backdrop = document.getElementById('assetBackdrop');
        if (backdrop) backdrop.style.pointerEvents = '';
    });

    const assetSidebar = document.getElementById('assetSidebar');
    const assetBackdrop = document.getElementById('assetBackdrop');
    const dragHint = document.getElementById('assetDragHint');

    assetBackdrop.addEventListener('dragover', e => {
        e.preventDefault();
    });
    assetBackdrop.addEventListener('drop', e => {
        e.preventDefault();
    });

    let dragEnterCount = 0;
    assetSidebar.addEventListener('dragenter', e => {
        e.preventDefault();
        dragEnterCount++;
        if (!assetSidebar.classList.contains('open')) return;
        dragHint.classList.add('show');
    });

    assetSidebar.addEventListener('dragover', e => {
        e.preventDefault();
        if (!assetSidebar.classList.contains('open')) return;
        dragHint.classList.add('show');
    });

    assetSidebar.addEventListener('dragleave', e => {
        dragEnterCount--;
        if (dragEnterCount <= 0) {
            dragEnterCount = 0;
            dragHint.classList.remove('show');
        }
    });

    assetSidebar.addEventListener('drop', async e => {
        e.preventDefault();
        dragEnterCount = 0;
        dragHint.classList.remove('show');
        if (!assetSidebar.classList.contains('open') || !window.canvas) return;

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            await uploadAssetsToLibrary(files);
            return;
        }

        const url = e.dataTransfer?.getData('text/plain');
        if (url && (url.startsWith('/output/') || url.startsWith('http'))) {
            const cleanUrl = url.includes('/output/') ? '/output/' + url.split('/output/')[1].split('?')[0] : url;
            await copyToAssetLibrary(cleanUrl);
        }
    });
}

window.showComingSoon = function(feature) {
    alert(`「${feature}」功能即将推出，敬请期待！`);
};

window.sendToAssetLibrary = async function(urls) {
    if (!window.canvas) {
        alert('请先打开画布');
        return;
    }
    if (!urls || (Array.isArray(urls) && !urls.length)) return;

    const urlList = Array.isArray(urls) ? urls : [urls];
    const validUrls = urlList.filter(u => u && (u.startsWith('/output/') || u.startsWith('http')));

    if (!validUrls.length) return;

    try {
        await ensureAssetFolder();
    } catch (e) {
        alert('创建资产文件夹失败，请重试');
        return;
    }

    let successCount = 0;
    for (const url of validUrls) {
        const cleanUrl = url.includes('/output/') ? '/output/' + url.split('/output/')[1].split('?')[0] : url;
        try {
            const res = await fetch(`/api/canvases/${window.canvas.id}/assets/copy-from-canvas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urls: [cleanUrl] })
            });
            if (res.ok) successCount++;
        } catch (_) {}
    }

    if (successCount > 0) {
        if (window.canvas && document.getElementById('assetSidebar').classList.contains('open')) {
            await refreshAssetList();
        }
    }
};

initCanvasDragToAsset();

/**
 * 获取画布可视区域中心的世界坐标
 * @returns {Object} { x, y } 世界坐标
 */
function getCanvasCenterPoint() {
    const board = document.getElementById('board');
    if (!board) return { x: 0, y: 0 };
    
    const rect = board.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // 将屏幕坐标转换为世界坐标
    if (typeof screenToWorld === 'function') {
        return screenToWorld(centerX, centerY);
    }
    
    // 如果没有 screenToWorld 函数，使用默认逻辑
    const scale = window.canvasScale || 1;
    const panX = window.canvasPanX || 0;
    const panY = window.canvasPanY || 0;
    
    return {
        x: (centerX - panX) / scale,
        y: (centerY - panY) / scale
    };
}

/**
 * 打开资产项右键菜单
 * @param {string} filename - 文件名
 * @param {string} fileUrl - 文件 URL
 * @param {string} fileType - 文件类型 (image/video/audio/text)
 * @param {number} clientX - 鼠标 X 坐标
 * @param {number} clientY - 鼠标 Y 坐标
 */
window.openAssetItemMenu = function(filename, fileUrl, fileType, clientX, clientY) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    const menu = document.getElementById('assetItemMenu');
    if (!menu) return;
    
    // 关闭其他菜单
    window.closeAssetItemMenu();
    
    const safeName = filename.replace(/'/g, "\\'");
    const safeUrl = fileUrl.replace(/'/g, "\\'");
    
    menu.innerHTML = `
        <div class="menu-section-title">资产操作</div>
        <button class="menu-btn" data-asset-send="${safeUrl}" data-asset-type="${fileType}">
            <i data-lucide="send" class="w-4 h-4"></i>
            <span>发送到画布</span>
        </button>
        <div class="menu-divider"></div>
        <button class="menu-btn" data-asset-download="${safeUrl}" data-asset-name="${safeName}">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>下载</span>
        </button>
    `;
    
    // 定位菜单（自动调整避免超出视口）
    const menuWidth = 190;
    const menuHeight = 150;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = clientX;
    let top = clientY;
    
    if (left + menuWidth > viewportWidth) {
        left = viewportWidth - menuWidth - 10;
    }
    if (top + menuHeight > viewportHeight) {
        top = viewportHeight - menuHeight - 10;
    }
    
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;
    menu.classList.add('open');
    
    // 绑定发送到画布事件
    const sendBtn = menu.querySelector('[data-asset-send]');
    if (sendBtn) {
        sendBtn.onclick = async e => {
            e.stopPropagation();
            window.closeAssetItemMenu();
            await window.sendAssetToCanvas(sendBtn.dataset.assetSend, sendBtn.dataset.assetType);
        };
    }
    
    // 绑定下载事件
    const downloadBtn = menu.querySelector('[data-asset-download]');
    if (downloadBtn) {
        downloadBtn.onclick = e => {
            e.stopPropagation();
            window.closeAssetItemMenu();
            window.downloadAssetFile(downloadBtn.dataset.assetDownload, downloadBtn.dataset.assetName);
        };
    }
    
    if (typeof refreshIcons === 'function') refreshIcons();
};

/**
 * 关闭资产项右键菜单
 */
window.closeAssetItemMenu = function() {
    const menu = document.getElementById('assetItemMenu');
    if (menu) {
        menu.classList.remove('open');
        menu.innerHTML = '';
    }
};

/**
 * 发送资产到画布
 * @param {string} fileUrl - 文件 URL
 * @param {string} fileType - 文件类型
 */
window.sendAssetToCanvas = async function(fileUrl, fileType) {
    if (!window.canvas) {
        alert('请先打开画布');
        return;
    }
    
    if (typeof ensureCanvas === 'function' && !ensureCanvas()) return;
    
    // 获取画布可视区域中心的世界坐标
    const point = getCanvasCenterPoint();
    
    if (fileType === 'image') {
        // 调用现有的创建图片节点函数
        if (typeof window.createImageNodeFromAsset === 'function') {
            window.createImageNodeFromAsset(fileUrl, point);
        }
    } else if (fileType === 'video') {
        // 调用视频节点创建函数
        if (typeof window.createVideoNodeFromAsset === 'function') {
            window.createVideoNodeFromAsset(fileUrl, point);
        }
    } else {
        alert('该类型暂不支持发送到画布');
    }
};

/**
 * 下载资产文件
 * @param {string} fileUrl - 文件 URL
 * @param {string} filename - 文件名
 */
window.downloadAssetFile = function(fileUrl, filename) {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// 点击外部关闭资产右键菜单
document.addEventListener('mousedown', e => {
    const menu = document.getElementById('assetItemMenu');
    if (menu && menu.classList.contains('open') && !menu.contains(e.target)) {
        window.closeAssetItemMenu();
    }
});
