/**
 * Video Node 模块
 * 负责无限画布中 video 节点的创建、渲染、视频生成等功能
 */

let videoDeps = null;

function injectVideoNodeCSS() {
    if (document.getElementById('video-node-styles')) return;
    const style = document.createElement('style');
    style.id = 'video-node-styles';
    style.textContent = `.video-node { width:380px; }.video-node .node-body { min-height:0; }.node.sized.video-node .generator-body { height:100%; display:flex; flex-direction:column; }.video-img-list { display:flex; flex-direction:column; gap:6px; margin-bottom:10px; }`;
    document.head.appendChild(style);
}

function addVideoNode(point) {
    const p = point || videoDeps.defaultPoint(160, 0);
    return videoDeps.addNode({
        id: videoDeps.uid('vid'),
        type: 'video',
        x: p.x,
        y: p.y,
        apiProvider: 'comfly',
        model: 'veo3-fast',
        duration: 5,
        aspectRatio: '16:9',
        resolution: '',
        enhancePrompt: false,
        enableUpsample: false,
        watermark: false,
        cameraFixed: false,
        generateAudio: false,
        useFrameRoles: false,
        inputs: [],
        running: false
    });
}

function renderVideoBody(node) {
    const wrap = document.createElement('div');
    wrap.className = 'generator-body';
    node.apiProvider = node.apiProvider || 'comfly';
    node.model = node.model || 'veo3-fast';
    node.duration = Math.max(1, Math.min(60, Number(node.duration) || 5));
    node.aspectRatio = node.aspectRatio || '16:9';
    wrap.innerHTML = `<div class="prompt-list mb-3"></div><div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">图片输入</div><div class="input-list video-img-list"></div><div class="gen-settings"><div class="gen-settings-row"><select class="select-lite video-provider" style="flex:1"><option value="comfly" ${node.apiProvider === 'comfly' ? 'selected' : ''}>Comfly</option><option value="modelscope" ${node.apiProvider === 'modelscope' ? 'selected' : ''}>ModelScope</option></select><select class="select-lite video-model" style="flex:2"><option value="veo3-fast" ${node.model === 'veo3-fast' ? 'selected' : ''}>veo3-fast</option><option value="veo3-full" ${node.model === 'veo3-full' ? 'selected' : ''}>veo3-full</option><option value="kling" ${node.model === 'kling' ? 'selected' : ''}>kling</option></select></div><div class="gen-settings-row"><label class="field" style="flex:1"><div class="setting-title">时长(秒)</div><input class="setting-input video-duration" type="number" min="1" max="60" step="1" value="${node.duration}"></label><label class="field" style="flex:1"><div class="setting-title">宽高比</div><select class="select-lite video-aspect compact-select"><option value="16:9" ${node.aspectRatio === '16:9' ? 'selected' : ''}>16:9</option><option value="9:16" ${node.aspectRatio === '9:16' ? 'selected' : ''}>9:16</option><option value="1:1" ${node.aspectRatio === '1:1' ? 'selected' : ''}>1:1</option><option value="4:3" ${node.aspectRatio === '4:3' ? 'selected' : ''}>4:3</option><option value="3:4" ${node.aspectRatio === '3:4' ? 'selected' : ''}>3:4</option><option value="21:9" ${node.aspectRatio === '21:9' ? 'selected' : ''}>21:9</option><option value="9:21" ${node.aspectRatio === '9:21' ? 'selected' : ''}>9:21</option><option value="keep_ratio" ${node.aspectRatio === 'keep_ratio' ? 'selected' : ''}>keep</option><option value="adaptive" ${node.aspectRatio === 'adaptive' ? 'selected' : ''}>adapt</option></select></label><label class="field" style="flex:1"><div class="setting-title">分辨率</div><select class="select-lite video-resolution compact-select"><option value="" ${!node.resolution ? 'selected' : ''}>Auto</option><option value="480p" ${node.resolution === '480p' ? 'selected' : ''}>480p</option><option value="720p" ${node.resolution === '720p' ? 'selected' : ''}>720p</option><option value="1080p" ${node.resolution === '1080p' ? 'selected' : ''}>1080p</option><option value="780P" ${node.resolution === '780P' ? 'selected' : ''}>780P</option></select></label></div><div class="gen-settings-row" style="flex-wrap:wrap"><button type="button" class="setting-check ${node.enhancePrompt ? 'active' : ''}" data-video-toggle="enhancePrompt"><span class="check-dot"></span>增强提示词</button><button type="button" class="setting-check ${node.enableUpsample ? 'active' : ''}" data-video-toggle="enableUpsample"><span class="check-dot"></span>超分辨率</button><button type="button" class="setting-check ${node.watermark ? 'active' : ''}" data-video-toggle="watermark"><span class="check-dot"></span>水印</button><button type="button" class="setting-check ${node.cameraFixed ? 'active' : ''}" data-video-toggle="cameraFixed"><span class="check-dot"></span>固定相机</button><button type="button" class="setting-check ${node.generateAudio ? 'active' : ''}" data-video-toggle="generateAudio"><span class="check-dot"></span>生成音频</button><button type="button" class="setting-check ${node.useFrameRoles ? 'active' : ''}" data-video-toggle="useFrameRoles"><span class="check-dot"></span>首尾帧模式</button></div></div><button class="gen-btn primary w-full mt-3" type="button"><i data-lucide="clapperboard" class="w-4 h-4"></i><span>生成视频</span></button>`;
    
    wrap.querySelector('.video-provider').onchange = (e) => {
        node.apiProvider = e.target.value;
        videoDeps.scheduleSave();
    };
    wrap.querySelector('.video-model').onchange = (e) => {
        node.model = e.target.value;
        videoDeps.scheduleSave();
    };
    wrap.querySelector('.video-duration').oninput = (e) => {
        node.duration = Math.max(1, Math.min(60, parseInt(e.target.value) || 5));
        videoDeps.scheduleSave();
    };
    wrap.querySelector('.video-aspect').onchange = (e) => {
        node.aspectRatio = e.target.value;
        videoDeps.scheduleSave();
    };
    wrap.querySelector('.video-resolution').onchange = (e) => {
        node.resolution = e.target.value;
        videoDeps.scheduleSave();
    };
    wrap.querySelectorAll('[data-video-toggle]').forEach(btn => {
        btn.onclick = () => {
            const field = btn.dataset.videoToggle;
            node[field] = !node[field];
            btn.classList.toggle('active');
            videoDeps.scheduleSave();
        };
    });
    wrap.querySelector('.gen-btn').onclick = () => {
        if (node.running) return;
        alert('视频生成功能待接入后端 API');
    };
    
    const cascadeHtml = (typeof window.cascadeBtnHtml === 'function') ? window.cascadeBtnHtml(node) : '';
    if(cascadeHtml) {
        wrap.insertAdjacentHTML('beforeend', cascadeHtml);
        if (typeof window.bindCascadeButtons === 'function') {
            window.bindCascadeButtons(wrap, node.id);
        }
    }
    
    if (videoDeps.refreshIcons) videoDeps.refreshIcons();
    
    wrap.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.openVideoNodeMenu(node.id, e.clientX, e.clientY);
    };
    
    return wrap;
}

function initVideoNode(canvasDeps) {
    videoDeps = canvasDeps;
    injectVideoNodeCSS();
    
    // 暴露创建视频节点函数到全局，供资产库右键菜单调用
    // 从资产库发送视频时，创建简单的"上传视频"节点（用于播放已有视频）
    window.createVideoNodeFromAsset = function(url, point) {
        if (!window.canvas || !url) return;
        if (typeof ensureCanvas === 'function' && !ensureCanvas()) return;
        
        const p = point || { x: 0, y: 0 };
        
        // 创建 upload-video 节点（简单的视频播放节点）
        const nodeId = videoDeps.addNode({
            id: videoDeps.uid('uv'),
            type: 'upload-video',
            x: p.x,
            y: p.y,
            url: url,
            name: url.split('/').pop() || '视频'
        });
        
        if (typeof videoDeps.render === 'function') videoDeps.render();
        if (typeof videoDeps.scheduleSave === 'function') videoDeps.scheduleSave();
    };
}

function openVideoNodeMenu(nodeId, clientX, clientY) {
    const node = videoDeps.findNode(nodeId);
    if (!node || node.type !== 'video') return;
    
    const imageNodeMenu = document.getElementById('imageNodeMenu');
    if (!imageNodeMenu) return;
    
    if (videoDeps.closeCreateMenu) videoDeps.closeCreateMenu();
    
    const sources = videoDeps.generatorSources(node);
    const inputUrls = [];
    const seen = new Set();
    sources.forEach(src => {
        (src.refs || []).forEach(ref => {
            if (ref.url && !seen.has(ref.url)) {
                seen.add(ref.url);
                inputUrls.push(ref.url);
            }
        });
    });
    const hasInputs = inputUrls.length > 0;
    
    imageNodeMenu.innerHTML = `
        <div class="menu-section-title">视频节点操作</div>
        <button class="menu-btn" data-video-info="${videoDeps.escapeHtml(nodeId)}"><i data-lucide="film" class="w-4 h-4"></i><span>视频设置</span></button>
        <div class="menu-divider"></div>
        <button class="menu-btn" data-video-to-asset="${videoDeps.escapeHtml(nodeId)}"><i data-lucide="folder-open" class="w-4 h-4"></i><span>发送到资产库${hasInputs ? ' (' + inputUrls.length + ')' : ''}</span></button>
    `;
    imageNodeMenu.style.left = `${clientX}px`;
    imageNodeMenu.style.top = `${clientY}px`;
    imageNodeMenu.classList.add('open');
    
    imageNodeMenu.querySelector('[data-video-info]').onclick = e => {
        e.stopPropagation();
        closeVideoNodeMenu();
    };
    
    const assetBtn = imageNodeMenu.querySelector('[data-video-to-asset]');
    if (assetBtn) {
        assetBtn.onclick = async e => {
            e.stopPropagation();
            closeVideoNodeMenu();
            if (inputUrls.length > 0) {
                await window.sendToAssetLibrary(inputUrls);
                if (window.canvas) {
                    window.openAssetLibrary();
                }
            } else {
                alert('请先连接图片节点到视频节点，或直接将图片复制到资产库。');
            }
        };
    }
    
    if (videoDeps.refreshIcons) videoDeps.refreshIcons();
}

function closeVideoNodeMenu() {
    const menu = document.getElementById('imageNodeMenu');
    if (menu) {
        menu.classList.remove('open');
        menu.classList.remove('output-node-menu');
        menu.innerHTML = '';
    }
}

window.addVideoNode = addVideoNode;
window.renderVideoBody = renderVideoBody;
window.initVideoNode = initVideoNode;
window.openVideoNodeMenu = openVideoNodeMenu;
window.closeVideoNodeMenu = closeVideoNodeMenu;
