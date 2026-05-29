// 画布核心代码 - 从canvas.html提取
// 提取时间: 2026-05-19
// 代码行数: 4287


(function(){
    var t = localStorage.getItem('xy_auth_token');
    var u = localStorage.getItem('xy_auth_user');
    if (!t || !u) {
        window.top.location.href = '/static/login.html';
    }
})();

function apiUrl(path) {
    var token = localStorage.getItem('xy_auth_token');
    var sep = path.includes('?') ? '&' : '?';
    return path + sep + 'token=' + encodeURIComponent(token || '');
}

function refreshIcons(){ if(window.lucide) lucide.createIcons(); }
        refreshIcons();
        const shell = document.getElementById('shell');
        const canvasGate = document.getElementById('canvasGate');
        const board = document.getElementById('board');
        const world = document.getElementById('world');
        const nodesEl = document.getElementById('nodes');
        const linksEl = document.getElementById('links');
        const linkControlsEl = document.getElementById('linkControls');
        const dropOverlay = document.getElementById('dropOverlay');
        const createMenu = document.getElementById('createMenu');
        const selectionBox = document.getElementById('selectionBox');
        const selectionHub = document.getElementById('selectionHub');
        const gateStatus = document.getElementById('gateStatus');
        const gateCreateBtn = document.getElementById('gateCreateBtn');
        const gateRefreshBtn = document.getElementById('gateRefreshBtn');
        const gateBackBtn = document.getElementById('gateBackBtn');
        const gateTrashBtn = document.getElementById('gateTrashBtn');
        const gateTrashCount = document.getElementById('gateTrashCount');
        const gateTitleText = document.getElementById('gateTitleText');
        const gateSubtitle = document.getElementById('gateSubtitle');
        const gateCanvasList = document.getElementById('gateCanvasList');
        const gateTitleInput = document.getElementById('gateTitleInput');
        const gateConfirmBtn = document.getElementById('gateConfirmBtn');
        const gateCancelBtn = document.getElementById('gateCancelBtn');
        const backToManagerBtn = document.getElementById('backToManagerBtn');
        const currentCanvasTitle = document.getElementById('currentCanvasTitle');
        const currentCanvasTime = document.getElementById('currentCanvasTime');
        const logModal = document.getElementById('logModal');
        const logList = document.getElementById('logList');
        const outputLightbox = document.getElementById('outputLightbox');
        const outputPreview = document.getElementById('outputPreview');
        const outputLightboxImg = document.getElementById('outputLightboxImg');
        const outputCompareContainer = document.getElementById('outputCompareContainer');
        const outputCompareResult = document.getElementById('outputCompareResult');
        const outputCompareOriginal = document.getElementById('outputCompareOriginal');
        const outputCompareOriginalWrap = document.getElementById('outputCompareOriginalWrap');
        const outputCompareSlider = document.getElementById('outputCompareSlider');
        const outputResolution = document.getElementById('outputResolution');
        const outputDownloadBtn = document.getElementById('outputDownloadBtn');
        const modelModal = document.getElementById('modelModal');
        const modelManagerTitle = document.getElementById('modelManagerTitle');
        const modelManagerSub = document.getElementById('modelManagerSub');
        const modelManagerList = document.getElementById('modelManagerList');
        const modelManagerNewInput = document.getElementById('modelManagerNewInput');
        let canvases = [];
        let deletedCanvases = [];
        window.canvas = null;
        let nodes = [];
        let connections = [];
        let viewport = {x: -1800, y: -1000, scale: 1};
        let dragNode = null;
        let dragBoard = null;
        let resizeNode = null;
        let llmPaneDrag = null;
        let tempLink = null;
        let selectDrag = null;
        let menuPoint = null;
        let internalDrag = false;
        let selected = new Set();
        let undoStack = [];
        const UNDO_MAX = 30;
        let saveTimer = null;
        let creatingCanvas = false;
        let trashMode = false;
        let pendingDeleteCanvasId = null;
        let pendingPurgeCanvasId = null;
        let emojiPickerCanvasId = null;
        let apiProviders = [];
        let models = {gpt:'gpt-image-1', nano:'nano-banana'};
        let imageModels = ['gpt-image-1', 'nano-banana'];
        let chatModels = ['gpt-4o-mini'];
        let msChatModels = [];
        let comfyWorkflows = [];
        let comfyWorkflowCache = {};
        let localImageModels = [];
        let localChatModels = [];
        let isDropOverlayActive = false; // 跟踪 dropOverlay 状态，避免频繁 DOM 操作
        const MS_GEN_MODELS = {
            zimage:    { label: 'ZImage',     modelId: 'Tongyi-MAI/Z-Image-Turbo',            supportsImage: false, endpoint: '/generate'            },
            qwen_edit: { label: 'Qwen Edit',  modelId: 'Qwen/Qwen-Image-Edit-2511',            supportsImage: true,  endpoint: '/api/angle/generate'  },
            klein_edit:{ label: 'Klein',      modelId: 'black-forest-labs/FLUX.2-klein-9B',   supportsImage: true,  endpoint: '/api/ms/generate'     }
        };
        let hasManagedImageModels = false;
        let hasManagedChatModels = false;
        let managedModelKind = 'image';
        let managedModelsDraft = [];
        let managedDragIndex = null;
        let outputCompareDrag = false;
        let currentOutputCompareUrl = '';
        const CLIENT_ID = 'canvas_' + Math.random().toString(36).slice(2);
        const CANVAS_EMOJIS = ['layers','sparkles','image','palette','wand-2','star','heart','rocket','flame','moon','cloud','leaf','gem','compass','pin','flag','bookmark','crown'];
        function renderCanvasIcon(icon, size = 14) {
            // 旧的默认 emoji 或空值都映射为 layers
            if(!icon || icon === '🧩') return `<i data-lucide="layers" style="width:${size}px;height:${size}px"></i>`;
            // 含非 ASCII 字符（用户旧选过的 emoji）继续按文本渲染
            if(/[^\x00-\x7F]/.test(icon)) return escapeHtml(icon);
            return `<i data-lucide="${escapeHtml(icon)}" style="width:${size}px;height:${size}px"></i>`;
        }

        const SIZE_MAP = {
            square: { '1k':'1024x1024', '2k':'2048x2048', '4k':'3840x2160' },
            portrait: { '1k':'1024x1536', '2k':'1360x2048', '4k':'2352x3520' },
            portrait43: { '1k':'1008x1344', '2k':'1536x2048', '4k':'2448x3264' },
            landscape43: { '1k':'1344x1008', '2k':'2048x1536', '4k':'3264x2448' },
            landscape: { '1k':'1536x1024', '2k':'2048x1360', '4k':'3520x2352' },
            story: { '1k':'720x1280', '2k':'1152x2048', '4k':'2160x3840' },
            wide: { '1k':'1280x720', '2k':'2048x1152', '4k':'3840x2160' }
        };
        const RES_LONG_SIDE = { '1k':1536, '2k':2048, '4k':3840 };
        const RES_PIXEL_LIMIT = { '1k':1572864, '2k':4194304, '4k':8294400 };
        function apiImageSize(ratioValue, resolutionValue, customRatioValue='', customSizeValue=''){
            if(resolutionValue === 'custom') return String(customSizeValue || '').trim();
            const resolutionKey = resolutionValue || '1k';
            if(ratioValue === 'custom'){
                const parts = String(customRatioValue || '').split(':');
                if(parts.length === 2 && parts[0] && parts[1]){
                    const rw = Number(parts[0]), rh = Number(parts[1]);
                    if(rw > 0 && rh > 0){
                        const longSide = RES_LONG_SIDE[resolutionKey] || 1024;
                        if(rw >= rh){
                            const w = longSide;
                            const h = Math.max(64, Math.round(longSide * rh / rw / 64) * 64);
                            const pixelLimit = RES_PIXEL_LIMIT[resolutionKey] || (longSide * longSide);
                            if(w * h > pixelLimit){
                                const scale = Math.sqrt(pixelLimit / (w * h));
                                return `${Math.round(w * scale / 64) * 64}x${Math.round(h * scale / 64) * 64}`;
                            }
                            return `${w}x${h}`;
                        } else {
                            const h = longSide;
                            const w = Math.max(64, Math.round(longSide * rw / rh / 64) * 64);
                            const pixelLimit = RES_PIXEL_LIMIT[resolutionKey] || (longSide * longSide);
                            if(w * h > pixelLimit){
                                const scale = Math.sqrt(pixelLimit / (w * h));
                                return `${Math.round(w * scale / 64) * 64}x${Math.round(h * scale / 64) * 64}`;
                            }
                            return `${w}x${h}`;
                        }
                    }
                }
                return SIZE_MAP.square[resolutionKey] || SIZE_MAP.square['1k'];
            }
            const ratioKey = ratioValue && SIZE_MAP[ratioValue] ? ratioValue : 'square';
            return SIZE_MAP[ratioKey]?.[resolutionKey] || SIZE_MAP.square[resolutionKey] || SIZE_MAP.square['1k'];
        }
        const CUSTOM_IMAGE_MODELS_KEY = 'canvas_custom_image_models';
        const MANAGED_IMAGE_MODELS_KEY = 'canvas_image_models_ordered';
        const MANAGED_CHAT_MODELS_KEY = 'canvas_chat_models_ordered';
        const CANVAS_THEME_KEY = 'canvas_theme';

        function uid(prefix='n'){ return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`; }
        function applyTheme(theme){
            const dark = theme === 'dark';
            document.body.classList.toggle('theme-dark', dark);
            shell.classList.toggle('theme-dark', dark);
        }
        function loadLocalModelLists(){
            try {
                const managedRaw = localStorage.getItem(MANAGED_IMAGE_MODELS_KEY);
                const raw = JSON.parse(managedRaw || localStorage.getItem(CUSTOM_IMAGE_MODELS_KEY) || '[]');
                localImageModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
                hasManagedImageModels = Boolean(managedRaw);
            } catch(e) {
                localImageModels = [];
                hasManagedImageModels = false;
            }
            try {
                const managedRaw = localStorage.getItem(MANAGED_CHAT_MODELS_KEY);
                const raw = JSON.parse(managedRaw || '[]');
                localChatModels = Array.isArray(raw) ? raw.filter(Boolean) : [];
                hasManagedChatModels = Boolean(managedRaw);
            } catch(e) {
                localChatModels = [];
                hasManagedChatModels = false;
            }
        }
        function uniqueModels(list){
            const seen = new Set();
            return list.map(item => String(item || '').trim()).filter(item => {
                if(!item || seen.has(item)) return false;
                seen.add(item);
                return true;
            });
        }
        function allImageModels(){
            return uniqueModels(hasManagedImageModels ? localImageModels : [...imageModels, ...localImageModels]);
        }
        function allChatModels(){
            return uniqueModels(hasManagedChatModels ? localChatModels : [...chatModels, ...localChatModels]);
        }
        
        // ========== 新增：提供商相关辅助函数 ==========
        function defaultApiProviders(){
            return [{id:'comfly', name:'Comfly', base_url:'', enabled:true, image_models:imageModels, chat_models:chatModels, video_models:[], has_key:false, key_preview:''}];
        }
        function normalizeProviderId(value){
            return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
        }
        function imageApiProviders(){
            const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
                .filter(p => p.id !== 'modelscope' && p.enabled !== false && (p.image_models || []).length);
            return providers;
        }
        function providerById(id){
            return (apiProviders.length ? apiProviders : defaultApiProviders()).find(p => p.id === id) || imageApiProviders()[0] || defaultApiProviders()[0];
        }
        function resolveProviderId(id){
            return providerById(id)?.id || 'comfly';
        }
        function chatApiProviders(){
            const providers = (apiProviders.length ? apiProviders : defaultApiProviders())
                .filter(p => p.enabled !== false && (p.chat_models || []).length);
            return providers.length ? providers : defaultApiProviders();
        }
        function resolveChatProviderId(id){
            const providers = chatApiProviders();
            return providers.find(p => p.id === id)?.id || providers[0]?.id || 'comfly';
        }
        function chatProviderOptions(selectedId){
            const selected = resolveChatProviderId(selectedId);
            return chatApiProviders().map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
        }
        function providerChatModels(providerId){
            const provider = apiProviders.find(p => p.id === providerId);
            return uniqueModels(provider?.chat_models || []);
        }
        function resolveImageProviderId(id){
            const providers = imageApiProviders();
            return providers.find(p => p.id === id)?.id || providers[0]?.id || '';
        }
        function providerOptions(selectedId){
            const selected = resolveImageProviderId(selectedId);
            const providers = imageApiProviders();
            if(!providers.length) return `<option value="" disabled selected>暂无 API 平台</option>`;
            return providers.map(provider => `<option value="${escapeHtml(provider.id)}" ${provider.id === selected ? 'selected' : ''}>${escapeHtml(provider.name || provider.id)}</option>`).join('');
        }
        function providerImageModels(providerId){
            const provider = apiProviders.find(p => p.id === providerId);
            return uniqueModels(provider?.image_models || []);
        }
        function imageModelOptions(selectedModel, providerId){
            const models = providerImageModels(providerId);
            const selectedValue = resolveImageModel(selectedModel);
            const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
            const hasSelected = models.includes(selectedValue);
            return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}<option value="__manage__">管理模型列表...</option>`;
        }
        function chatModelOptions(selectedModel, providerId){
            const models = providerId ? providerChatModels(providerId) : allChatModels();
            const selectedValue = resolveChatModel(selectedModel, providerId);
            const options = models.map(model => `<option value="${escapeHtml(model)}" ${model === selectedValue ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('');
            const hasSelected = models.includes(selectedValue);
            return `${hasSelected || !selectedValue ? '' : `<option value="${escapeHtml(selectedValue)}" selected>${escapeHtml(selectedValue)}</option>`}${options}<option value="__manage__">管理模型列表...</option>`;
        }
        
        // ========== 新增：复制和工具函数 ==========
        async function copyTextToClipboard(text){
            const value = String(text || '');
            if(!value) return false;
            try {
                if(navigator.clipboard?.writeText){
                    await navigator.clipboard.writeText(value);
                    return true;
                }
            } catch(_) {}
            try {
                const ta = document.createElement('textarea');
                ta.value = value;
                ta.setAttribute('readonly', '');
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                const ok = document.execCommand('copy');
                ta.remove();
                return ok;
            } catch(_) {
                return false;
            }
        }
        function escapeAttr(value){
            return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        // ========== 新增：retryBarHtml 和级联按钮 ==========
        function retryBarHtml(node){
            if(node.runStatus !== 'failed' || !node._cascadeFailed) return '';
            return `<div class="node-retry-bar" data-retry-bar>
                <span class="node-retry-msg" title="${escapeAttr(node.runError||'')}">${escapeHtml((node.runError||'生成失败').slice(0,60))}</span>
                <button class="node-retry-btn" type="button" data-retry="${node.id}">重试</button>
                <button class="node-stop-btn" type="button" data-stop="${node.id}">停止</button>
            </div>`;
        }
        function bindCascadeButtons(wrap, nodeId){
            wrap.querySelectorAll(`[data-cascade="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); runNodeCascade(nodeId); };
            });
            wrap.querySelectorAll(`[data-cascade-stop="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); cascadeStopIds.add(nodeId); b.disabled = true; b.querySelector('span').textContent = '停止中…'; };
            });
            wrap.querySelectorAll(`[data-retry="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); retryNodeAndDownstream(nodeId); };
            });
            wrap.querySelectorAll(`[data-stop="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); cancelCascade(nodeId); };
            });
        }
        
        // ========== 新增：LLM 输入图片 ==========
        function llmInputImages(node){
            const urls = [];
            connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).forEach(n => {
                if(n.type === 'image' && n.url) urls.push(n.url);
                if(n.type === 'output' && (n.images||[]).length){
                    const last = [...n.images].reverse().find(x => typeof x === 'string');
                    if(last) urls.push(last);
                }
                if(n.type === 'group'){
                    (n.items || []).map(id => nodes.find(x => x.id === id)).filter(x => x?.type === 'image' && x?.url).forEach(img => urls.push(img.url));
                }
            });
            return urls;
        }
        
        // ========== 新增：重试和取消级联 ==========
        async function retryNodeAndDownstream(nodeId){
            const target = nodes.find(n => n.id === nodeId);
            if(!target) return;
            target.runStatus = '';
            target.runError = '';
            target._cascadeFailed = false;
            if(typeof refreshNodes === 'function') refreshNodes([nodeId]);
            if(target.type === 'llm' && typeof runLLMNode === 'function'){
                await runLLMNode(nodeId, {cascade: false});
            }
        }
        function cancelCascade(nodeId){
            const order = computeCascadeOrder ? computeCascadeOrder(nodeId) : [nodeId];
            order.forEach(id => {
                const n = nodes.find(x => x.id === id);
                if(n && (n.runStatus === 'queued' || n.runStatus === 'failed')){
                    n.runStatus = '';
                    n.runError = '';
                    n._cascadeFailed = false;
                }
            });
            if(typeof refreshNodes === 'function') refreshNodes(order);
        }
        
        function resolveImageModel(value){
            if(value === 'gpt') return models.gpt;
            if(value === 'nano') return models.nano;
            return value || allImageModels()[0] || models.gpt;
        }
        function resolveChatModel(value, providerId=''){
            const providerModels = providerId ? providerChatModels(providerId) : allChatModels();
            return value || providerModels[0] || allChatModels()[0] || chatModels[0] || 'gpt-4o-mini';
        }
        function formatCanvasTime(value){
            if(!value) return '--';
            const raw = Number(value);
            const time = raw < 10000000000 ? raw * 1000 : raw;
            const date = new Date(time);
            if(Number.isNaN(date.getTime())) return '--';
            return date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        }
        function setStatus(text){
            document.getElementById('saveState').textContent = text;
            if(gateStatus) gateStatus.textContent = text;
        }
        function refreshGateViewControls(){
            canvasGate.classList.toggle('trash-mode', trashMode);
            if(gateTitleText) gateTitleText.textContent = trashMode ? '回收站' : '选择画布';
            if(gateSubtitle) gateSubtitle.textContent = trashMode ? '已删除画布可恢复，30 天后自动清理。' : '打开已有画布，或新建一个开始创作。';
            const trashCount = deletedCanvases.length;
            if(gateTrashCount){
                gateTrashCount.textContent = String(trashCount);
                gateTrashCount.classList.toggle('visible', trashCount > 0);
            }
            const countPill = document.getElementById('gateCountPill');
            if(countPill){
                const items = trashMode ? deletedCanvases : canvases;
                countPill.textContent = `${items.length} 个`;
            }
        }
        function setCanvasMode(open){
            shell.classList.toggle('no-canvas', !open);
            if(!open){
                nodesEl.innerHTML = '';
                linksEl.innerHTML = '';
                linkControlsEl.innerHTML = '';
                selectionHub.classList.remove('open');
            } else if(currentCanvasTitle) {
                currentCanvasTitle.textContent = window.canvas?.title || '未命名画布';
                currentCanvasTime.textContent = formatCanvasTime(window.canvas?.updated_at || window.canvas?.created_at);
            }
            refreshIcons();
        }
        function ensureCanvas(){
            if(window.canvas) return true;
            setStatus('请先新建或选择画布');
            return false;
        }
        function setCreateMode(active){
            creatingCanvas = active;
            if(active) trashMode = false;
            canvasGate.classList.toggle('creating', active);
            refreshGateViewControls();
            setStatus(active ? '输入画布名称后确认' : (canvases.length ? '请选择或新建画布' : '暂无画布，请先新建画布'));
            if(active) {
                gateTitleInput.focus();
                gateTitleInput.select();
            } else {
                gateTitleInput.value = '';
            }
            refreshIcons();
        }
        function screenToWorld(clientX, clientY){
            const rect = board.getBoundingClientRect();
            return { x:(clientX - rect.left - viewport.x) / viewport.scale, y:(clientY - rect.top - viewport.y) / viewport.scale };
        }
        function applyViewport(){
            world.style.transform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`;
            if(typeof scheduleMinimapRender === 'function') scheduleMinimapRender();
        }
        function refreshGeometry(){
            renderLinks();
            renderSelectionHub();
        }
        function refreshGeometryAfterLayout(){
            requestAnimationFrame(() => {
                refreshGeometry();
                requestAnimationFrame(refreshGeometry);
            });
        }
        function scheduleSave(){
            if(!window.canvas) return;
            setStatus('Saving...');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveCanvas, 500);
        }
        async function saveCanvas(){
            if(!window.canvas) return;
            sanitizeConnections();
            try {
                const res = await fetch(apiUrl(`/api/canvases/${window.canvas.id}`), {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({ title:window.canvas.title, icon:window.canvas.icon || '🧩', nodes, connections, viewport, logs:window.canvas.logs || [] })
                });
                if(!res.ok) throw new Error('save failed');
                window.canvas.updated_at = Date.now();
                if(currentCanvasTime) currentCanvasTime.textContent = formatCanvasTime(window.canvas.updated_at);
                setStatus('Saved');
                loadCanvasList(false);
            } catch(e) {
                setStatus('Save failed');
                console.error(e);
            }
        }

        async function loadConfig(){
            loadLocalModelLists();
            try {
                const cfg = await fetch('/api/config').then(r=>r.json());
                imageModels = cfg.image_models?.length ? cfg.image_models : imageModels;
                chatModels = cfg.chat_models?.length ? cfg.chat_models : chatModels;
                msChatModels = cfg.ms_chat_models?.length ? cfg.ms_chat_models : msChatModels;
                models.nano = imageModels.find(m => m.toLowerCase().includes('nano')) || 'nano-banana';
                models.gpt = imageModels.find(m => !m.toLowerCase().includes('nano')) || cfg.image_model || 'gpt-image-1';
                try {
                    const wf = await fetch('/api/workflows').then(r=>r.json());
                    comfyWorkflows = wf.workflows || [];
                } catch(_) {
                    comfyWorkflows = [];
                }
            } catch(e) {}
        }
        
        // 监听 API 设置页面的变更广播，实时刷新工作流列表
        try {
            const apiChannel = new BroadcastChannel('studio-api');
            apiChannel.onmessage = async (e) => {
                if(e.data?.type === 'providers-changed' || e.data?.type === 'workflows-changed'){
                    await loadConfig();
                    if(typeof render === 'function') render();
                }
            };
        } catch(e) { /* 不支持 BroadcastChannel 的旧浏览器忽略 */ }
        
        function msChatModelOptions(selected){
            const list = msChatModels.length ? msChatModels : ['MiniMax/MiniMax-M2.7:MiniMax','Qwen/Qwen3-235B-A22B'];
            const sel = selected || list[0] || '';
            return list.map(m => `<option value="${escapeHtml(m)}" ${m === sel ? 'selected' : ''}>${escapeHtml(m.split('/').pop().split(':')[0])}</option>`).join('');
        }
        async function loadCanvasList(openFirst=true){
            try {
                const res = await fetch(apiUrl('/api/canvases'));
                if(!res.ok) throw new Error('画布列表加载失败');
                const data = await res.json();
                canvases = data.canvases || [];
                refreshGateViewControls();
                renderCanvasList();
                refreshTrashCount();
                if(openFirst && canvases[0]) await openCanvas(canvases[0].id);
                else if(!window.canvas) {
                    setCanvasMode(false);
                    setStatus(trashMode ? (deletedCanvases.length ? '回收站' : '回收站为空') : (canvases.length ? '请选择或新建画布' : '暂无画布，请先新建画布'));
                }
            } catch(e) {
                setStatus('画布列表加载失败');
                console.error(e);
            }
        }
        async function loadTrashList(){
            try {
                const res = await fetch(apiUrl('/api/canvases/trash'));
                if(!res.ok) throw new Error('回收站加载失败');
                const data = await res.json();
                deletedCanvases = data.canvases || [];
                refreshGateViewControls();
                renderCanvasList();
                setStatus(deletedCanvases.length ? '回收站' : '回收站为空');
            } catch(e) {
                setStatus('回收站加载失败');
                console.error(e);
            }
        }
        async function refreshTrashCount(){
            if(trashMode) return;
            try {
                const res = await fetch(apiUrl('/api/canvases/trash'));
                if(!res.ok) return;
                const data = await res.json();
                deletedCanvases = data.canvases || [];
                refreshGateViewControls();
            } catch(e) {}
        }
        async function setTrashMode(active){
            trashMode = active;
            creatingCanvas = false;
            pendingDeleteCanvasId = null;
            pendingPurgeCanvasId = null;
            emojiPickerCanvasId = null;
            canvasGate.classList.toggle('creating', false);
            refreshGateViewControls();
            if(trashMode) await loadTrashList();
            else await loadCanvasList(false);
            refreshIcons();
        }
        function renderCanvasList(){
            renderCanvasListInto(gateCanvasList);
        }
        function renderCanvasListInto(list){
            if(!list) return;
            refreshGateViewControls();
            const items = trashMode ? deletedCanvases : canvases;
            list.innerHTML = '';
            if(!items.length){
                const empty = document.createElement('div');
                empty.className = 'gate-list-empty';
                empty.innerHTML = trashMode
                    ? `<div class="gate-list-empty-icon"><i data-lucide="trash-2" class="w-6 h-6"></i></div>回收站为空`
                    : `<div class="gate-list-empty-icon"><i data-lucide="layout-grid" class="w-6 h-6"></i></div>暂无画布<br>点击右上方「新建画布」开始创作`;
                list.appendChild(empty);
                refreshIcons();
                return;
            }
            items.forEach(item => {
                const row = document.createElement('div');
                row.className = `canvas-item ${window.canvas?.id === item.id ? 'active' : ''}`;
                row.innerHTML = `
                    <div class="canvas-open" role="button" tabindex="${trashMode ? '-1' : '0'}">
                        <div class="canvas-card-icon-row">
                            <span class="canvas-preview-mark" role="button" tabindex="0" title="${trashMode ? '已删除画布' : '修改画布图标'}">${renderCanvasIcon(item.icon, 16)}</span>
                        </div>
                        <div class="canvas-card-title">${escapeHtml(item.title)}</div>
                        <div class="canvas-card-meta">
                            <span class="canvas-card-meta-dot"></span>
                            <div class="canvas-card-time">${trashMode ? `删除于 ${formatCanvasTime(item.deleted_at)}` : formatCanvasTime(item.updated_at || item.created_at)}</div>
                        </div>
                    </div>
                    ${trashMode ? (pendingPurgeCanvasId === item.id ? `
                        <div class="canvas-delete-confirm">
                            <div class="canvas-delete-box">
                                <div class="canvas-delete-title">彻底删除？无法恢复</div>
                                <div class="canvas-delete-actions">
                                    <button class="canvas-confirm-btn" type="button">确定</button>
                                    <button class="canvas-cancel-btn" type="button">取消</button>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <button class="canvas-delete canvas-restore" type="button" title="恢复画布" aria-label="恢复画布 ${escapeHtml(item.title)}" style="right:42px">
                            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                        </button>
                        <button class="canvas-delete canvas-purge" type="button" title="彻底删除" aria-label="彻底删除 ${escapeHtml(item.title)}">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i>
                        </button>
                    `) : (pendingDeleteCanvasId === item.id ? `
                        <div class="canvas-delete-confirm">
                            <div class="canvas-delete-box">
                                <div class="canvas-delete-title">移入回收站？</div>
                                <div class="canvas-delete-actions">
                                    <button class="canvas-confirm-btn" type="button">确定</button>
                                    <button class="canvas-cancel-btn" type="button">取消</button>
                                </div>
                            </div>
                        </div>
                    ` : `
                        <button class="canvas-card-edit" type="button" title="重命名" aria-label="重命名 ${escapeHtml(item.title)}">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button class="canvas-delete" type="button" title="移入回收站" aria-label="移入回收站 ${escapeHtml(item.title)}">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    `)}
                    ${!trashMode && emojiPickerCanvasId === item.id ? `
                        <div class="emoji-picker">
                            ${CANVAS_EMOJIS.map(icon => `<button class="emoji-option" type="button" data-icon="${escapeHtml(icon)}">${renderCanvasIcon(icon, 14)}</button>`).join('')}
                        </div>
                    ` : ''}
                `;
                if(!trashMode) row.querySelector('.canvas-open').onclick = () => openCanvas(item.id);
                const titleEl = row.querySelector('.canvas-card-title');
                const editBtn = row.querySelector('.canvas-card-edit');
                if(editBtn && titleEl && !trashMode) {
                    editBtn.onmousedown = e => e.stopPropagation();
                    editBtn.onclick = e => { e.stopPropagation(); startTitleEdit(item.id, titleEl); };
                }
                const iconBtn = row.querySelector('.canvas-preview-mark');
                if(iconBtn && !trashMode) {
                    iconBtn.onclick = e => toggleEmojiPicker(item.id, e);
                    iconBtn.onkeydown = e => {
                        if(e.key === 'Enter' || e.key === ' ') toggleEmojiPicker(item.id, e);
                    };
                }
                row.querySelectorAll('.emoji-option').forEach(btn => {
                    btn.onclick = e => setCanvasIcon(item.id, btn.dataset.icon, e);
                });
                const deleteBtn = row.querySelector('.canvas-delete');
                if(deleteBtn) deleteBtn.onclick = e => requestDeleteCanvas(item.id, e);
                const confirmBtn = row.querySelector('.canvas-confirm-btn');
                if(confirmBtn) confirmBtn.onclick = e => trashMode ? purgeCanvas(item.id, e) : deleteCanvas(item.id, e);
                const cancelBtn = row.querySelector('.canvas-cancel-btn');
                if(cancelBtn) cancelBtn.onclick = e => cancelDeleteCanvas(e);
                const restoreBtn = row.querySelector('.canvas-restore');
                if(restoreBtn) restoreBtn.onclick = e => restoreCanvas(item.id, e);
                const purgeBtn = row.querySelector('.canvas-purge');
                if(purgeBtn) purgeBtn.onclick = e => requestPurgeCanvas(item.id, e);
                list.appendChild(row);
            });
            refreshIcons();
        }
        async function createCanvas(){
            var t = localStorage.getItem('xy_auth_token');
            var u = localStorage.getItem('xy_auth_user');
            if (!t || !u) {
                window.top.location.href = '/static/login.html';
                return;
            }
            const customTitle = gateTitleInput?.value.trim();
            const title = customTitle || `新画布 ${new Date().toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}`;
            trashMode = false;
            refreshGateViewControls();
            setStatus('Creating...');
            try {
                const res = await fetch(apiUrl('/api/canvases'), {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title})});
                if(!res.ok) throw new Error('新建画布失败');
                const data = await res.json();
                window.canvas = data.canvas;
                nodes = window.canvas.nodes || [];
                connections = window.canvas.connections || [];
                viewport = window.canvas.viewport || {x:0, y:0, scale:1};
                // 存储画布输出文件夹信息
                window.currentCanvasOutputFolder = window.canvas.output_folder || '';
                sanitizeConnections();
                selected.clear();
                setCanvasMode(true);
                render();
                setStatus('Saved');
                setCreateMode(false);
                await loadCanvasList(false);
                renderCanvasList();
            } catch(e) {
                setStatus('新建画布失败');
                console.error(e);
            }
        }
        function toggleEmojiPicker(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            pendingDeleteCanvasId = null;
            emojiPickerCanvasId = emojiPickerCanvasId === id ? null : id;
            renderCanvasList();
        }
        async function setCanvasIcon(id, icon, event){
            event?.preventDefault();
            event?.stopPropagation();
            const item = canvases.find(c => c.id === id);
            if(item) item.icon = icon || 'layers';
            emojiPickerCanvasId = null;
            renderCanvasList();
            try {
                let target = window.canvas?.id === id ? window.canvas : null;
                if(!target) {
                    const data = await fetch(apiUrl(`/api/canvases/${id}`)).then(r => r.json());
                    target = data.canvas;
                }
                target.icon = icon || 'layers';
                const res = await fetch(apiUrl(`/api/canvases/${id}`), {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({
                        title:target.title,
                        icon:target.icon,
                        nodes:target.nodes || [],
                        connections:target.connections || [],
                        viewport:target.viewport || {x:0, y:0, scale:1}
                    })
                });
                if(!res.ok) throw new Error('图标保存失败');
                if(window.canvas?.id === id) window.canvas.icon = target.icon;
                await loadCanvasList(false);
            } catch(e) {
                setStatus('图标保存失败');
                console.error(e);
            }
        }
        function startTitleEdit(id, titleEl){
            if(!titleEl || titleEl.querySelector('input')) return;
            const item = canvases.find(c => c.id === id);
            const current = item?.title || titleEl.textContent || '';
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 80;
            input.value = current;
            input.className = 'canvas-card-title-input';
            titleEl.innerHTML = '';
            titleEl.appendChild(input);
            input.onmousedown = e => e.stopPropagation();
            input.onclick = e => e.stopPropagation();
            input.focus();
            input.select();
            let done = false;
            const finish = async (commit) => {
                if(done) return;
                done = true;
                const newTitle = input.value.trim();
                if(commit && newTitle && newTitle !== current){
                    await setCanvasTitle(id, newTitle);
                } else {
                    renderCanvasList();
                }
            };
            input.onblur = () => finish(true);
            input.onkeydown = e => {
                e.stopPropagation();
                if(e.key === 'Enter'){ e.preventDefault(); finish(true); }
                if(e.key === 'Escape'){ e.preventDefault(); finish(false); }
            };
        }
        async function setCanvasTitle(id, title){
            const item = canvases.find(c => c.id === id);
            if(item) item.title = title;
            if(window.canvas?.id === id) window.canvas.title = title;
            renderCanvasList();
            try {
                let target = window.canvas?.id === id ? window.canvas : null;
                if(!target){
                    const data = await fetch(apiUrl(`/api/canvases/${id}`)).then(r => r.json());
                    target = data.canvas;
                }
                target.title = title;
                const res = await fetch(apiUrl(`/api/canvases/${id}`), {
                    method:'PUT',
                    headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({
                        title:target.title,
                        icon:target.icon,
                        nodes:target.nodes || [],
                        connections:target.connections || [],
                        viewport:target.viewport || {x:0, y:0, scale:1}
                    })
                });
                if(!res.ok) throw new Error('重命名失败');
                if(currentCanvasTitle && window.canvas?.id === id) currentCanvasTitle.textContent = title;
                await loadCanvasList(false);
            } catch(e){
                setStatus('重命名失败');
                console.error(e);
            }
        }
        async function openCanvas(id){
            var t = localStorage.getItem('xy_auth_token');
            var u = localStorage.getItem('xy_auth_user');
            if (!t || !u) {
                window.top.location.href = '/static/login.html';
                return;
            }
            setStatus('Opening...');
            try {
                const res = await fetch(apiUrl(`/api/canvases/${id}`));
                if(!res.ok) throw new Error('打开画布失败');
                const data = await res.json();
                window.canvas = data.canvas;
                nodes = window.canvas.nodes || [];
                connections = window.canvas.connections || [];
                viewport = window.canvas.viewport || {x:0, y:0, scale:1};
                // 存储画布输出文件夹信息
                window.currentCanvasOutputFolder = window.canvas.output_folder || '';
                nodes.forEach(n => { if(n.running) n.running = false; });
                sanitizeConnections();
                selected.clear();
                setCanvasMode(true);
                renderCanvasList();
                render();
                setStatus('Ready');
            } catch(e) {
                setStatus('打开画布失败');
                console.error(e);
            }
        }
        async function returnToCanvasManager(){
            clearTimeout(saveTimer);
            if(window.canvas) await saveCanvas();
            window.canvas = null;
            nodes = [];
            connections = [];
            selected.clear();
            viewport = {x: -1800, y: -1000, scale: 1};
            setCanvasMode(false);
            trashMode = false;
            pendingPurgeCanvasId = null;
            refreshGateViewControls();
            await loadCanvasList(false);
            setCreateMode(false);
        }
        function requestDeleteCanvas(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            emojiPickerCanvasId = null;
            pendingPurgeCanvasId = null;
            pendingDeleteCanvasId = id;
            renderCanvasList();
        }
        function requestPurgeCanvas(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            emojiPickerCanvasId = null;
            pendingDeleteCanvasId = null;
            pendingPurgeCanvasId = id;
            renderCanvasList();
        }
        function cancelDeleteCanvas(event){
            event?.preventDefault();
            event?.stopPropagation();
            pendingDeleteCanvasId = null;
            pendingPurgeCanvasId = null;
            renderCanvasList();
        }
        async function deleteCanvas(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            setStatus('Moving to trash...');
            try {
                const res = await fetch(apiUrl(`/api/canvases/${id}`), {method:'DELETE'});
                if(!res.ok) throw new Error('移入回收站失败');
                const deletingCurrent = window.canvas?.id === id;
                pendingDeleteCanvasId = null;
                canvases = canvases.filter(item => item.id !== id);
                if(deletingCurrent){
                    window.canvas = null;
                    nodes = [];
                    connections = [];
                    selected.clear();
                    viewport = {x: -1800, y: -1000, scale: 1};
                    setCanvasMode(false);
                }
                renderCanvasList();
                setStatus(canvases.length ? '已移入回收站' : '暂无画布，请先新建画布');
                await loadCanvasList(false);
            } catch(e) {
                setStatus('移入回收站失败');
                console.error(e);
            }
        }
        async function restoreCanvas(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            setStatus('Restoring...');
            try {
                const res = await fetch(apiUrl(`/api/canvases/${id}/restore`), {method:'POST'});
                if(!res.ok) throw new Error('恢复画布失败');
                pendingPurgeCanvasId = null;
                deletedCanvases = deletedCanvases.filter(item => item.id !== id);
                await loadCanvasList(false);
                await loadTrashList();
                setStatus('画布已恢复');
            } catch(e) {
                setStatus('恢复画布失败');
                console.error(e);
            }
        }
        async function purgeCanvas(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            setStatus('Deleting...');
            try {
                const res = await fetch(apiUrl(`/api/canvases/${id}/purge`), {method:'DELETE'});
                if(!res.ok) throw new Error('彻底删除失败');
                pendingPurgeCanvasId = null;
                deletedCanvases = deletedCanvases.filter(item => item.id !== id);
                renderCanvasList();
                setStatus(deletedCanvases.length ? '已彻底删除' : '回收站为空');
                await loadTrashList();
            } catch(e) {
                setStatus('彻底删除失败');
                console.error(e);
            }
        }
        window.createCanvas = createCanvas;
        window.loadCanvasList = loadCanvasList;
        window.openCanvas = openCanvas;
        window.deleteCanvas = deleteCanvas;
        window.returnToCanvasManager = returnToCanvasManager;
        gateCreateBtn.addEventListener('click', () => setCreateMode(true));
        gateBackBtn.addEventListener('click', () => setTrashMode(false));
        gateTrashBtn.addEventListener('click', () => setTrashMode(true));
        gateRefreshBtn.addEventListener('click', () => trashMode ? loadTrashList() : loadCanvasList(false));
        gateConfirmBtn.addEventListener('click', createCanvas);
        gateCancelBtn.addEventListener('click', () => setCreateMode(false));
        gateTitleInput.addEventListener('keydown', e => {
            if(e.key === 'Enter') createCanvas();
            if(e.key === 'Escape') setCreateMode(false);
        });
        document.addEventListener('mousedown', e => {
            if(emojiPickerCanvasId === null) return;
            if(e.target.closest('.emoji-picker') || e.target.closest('.canvas-preview-mark')) return;
            emojiPickerCanvasId = null;
            renderCanvasList();
        });
        window.addEventListener('studio-theme-change', event => applyTheme(event.detail?.theme || 'light'));
        modelManagerNewInput.addEventListener('keydown', e => {
            if(e.key === 'Enter') addManagedModel();
            if(e.key === 'Escape') closeModelManager();
        });
        backToManagerBtn.addEventListener('click', returnToCanvasManager);

        function addNode(node){
            if(!ensureCanvas()) return;
            nodes.push(node);
            render();
            scheduleSave();
        }
        
        function pushUndo(){
            if(!window.canvas) return;
            undoStack.push({nodes:JSON.parse(JSON.stringify(nodes)), connections:JSON.parse(JSON.stringify(connections))});
            if(undoStack.length > UNDO_MAX) undoStack.shift();
        }
        
        function performUndo(){
            if(!window.canvas || !undoStack.length) return;
            const state = undoStack.pop();
            nodes = state.nodes;
            connections = state.connections;
            selected.clear();
            syncGeneratorInputs();
            refreshGeneratorInputViews();
            render();
            scheduleSave();
        }
        function defaultPoint(dx=0, dy=0){ return screenToWorld(window.innerWidth / 2 + dx, window.innerHeight / 2 + dy); }
        function addPromptNode(point){
            const p = point || defaultPoint(0, 0);
            addNode({id:uid('prompt'), type:'prompt', x:p.x, y:p.y, text:''});
        }
        function addLLMNode(point){
            const p = point || defaultPoint(80, 0);
            const providerId = resolveChatProviderId('');
            addNode({
                id:uid('llm'),
                type:'llm',
                x:p.x,
                y:p.y,
                model:providerChatModels(providerId)[0] || resolveChatModel(),
                mode:'node',
                llmProvider:providerId,
                llmMsModel:'',
                systemPrompt:'You are a helpful assistant. Rewrite the input into a concise image prompt.',
                showSystem:false,
                userInput:'',
                chatInput:'',
                messages:[],
                outputText:'',
                llmInputHeight:110,
                llmOutputHeight:150,
                running:false
            });
        }
        function addGeneratorNode(point){
            const p = point || defaultPoint(120, 0);
            const providerId = resolveImageProviderId('');
            addNode({id:uid('gen'), type:'generator', x:p.x, y:p.y, apiProvider:providerId, model:providerImageModels(providerId)[0] || allImageModels()[0] || models.gpt, ratio:'square', resolution:'1k', count:1, customRatio:'', customSize:'', customRatioWidth:'', customRatioHeight:'', customWidth:'', customHeight:'', inputs:[]});
        }
        function addMsGenNode(point){
            const p = point || defaultPoint(140, 0);
            addNode({id:uid('msgen'), type:'msgen', x:p.x, y:p.y, msgenModel:'zimage', msWidth:1024, msHeight:1024, fitImage:false, inputs:[], running:false});
        }
        async function getImageDimensions(url){
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = url;
            });
        }
        async function urlToBase64(url){
            const res = await fetch(url);
            if(!res.ok) throw new Error('图片读取失败');
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }
        function renderMsGenBody(node){
            const wrap = document.createElement('div');
            wrap.className = 'generator-body';
            const modelKey = node.msgenModel || 'zimage';
            const msModel = MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage;
            const inputSources = generatorSources(node);
            const ordered = orderedSources(node, inputSources);
            const imageInputs = ordered.filter(src => src.refs?.length);
            const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
            const fitOn = node.fitImage;
            const loraStrength = node.kleinLoraStrength ?? 0.8;
            wrap.innerHTML = `
                <div class="ms-model-tabs">
                    ${Object.entries(MS_GEN_MODELS).map(([k,m]) =>
                        `<button type="button" data-model="${k}" class="${modelKey===k?'active':''}">${escapeHtml(m.label)}</button>`
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
                    <button class="gen-btn mt-3 ${node.running?'running':''}" ${node.running?'disabled':''}>
                        <i data-lucide="zap" class="w-4 h-4"></i>${node.running?'生成中':'MS 生成'}
                    </button>
                </div>
            `;
            wrap.querySelectorAll('.ms-model-tabs button').forEach(btn => {
                btn.onclick = e => { e.stopPropagation(); node.msgenModel = btn.dataset.model; render(); scheduleSave(); };
            });
            const wInput = wrap.querySelector('.ms-w-input');
            const hInput = wrap.querySelector('.ms-h-input');
            [wInput, hInput].forEach(inp => {
                inp.onmousedown = e => e.stopPropagation();
                inp.onclick = e => e.stopPropagation();
            });
            wInput.oninput = e => { node.msWidth = parseInt(e.target.value) || 0; scheduleSave(); };
            hInput.oninput = e => { node.msHeight = parseInt(e.target.value) || 0; scheduleSave(); };
            const fitCheck = wrap.querySelector('.fit-check');
            fitCheck.onchange = e => { node.fitImage = e.target.checked; scheduleSave(); render(); };
            const loraCheck = wrap.querySelector('.lora-check');
            if(loraCheck){
                loraCheck.onchange = e => { node.kleinLora = e.target.checked; scheduleSave(); render(); };
            }
            const loraSlider = wrap.querySelector('.lora-strength-slider');
            if(loraSlider){
                loraSlider.onmousedown = e => e.stopPropagation();
                loraSlider.onclick = e => e.stopPropagation();
                loraSlider.oninput = e => {
                    node.kleinLoraStrength = parseFloat(e.target.value);
                    const val = wrap.querySelector('.lora-strength-val');
                    if(val) val.textContent = node.kleinLoraStrength.toFixed(2);
                    scheduleSave();
                };
            }
            // Make entire setting-check pill clickable (not just the checkbox square)
            wrap.querySelectorAll('.setting-check').forEach(pill => {
                pill.onmousedown = e => e.stopPropagation();
                const cb = pill.querySelector('input[type="checkbox"]');
                if(!cb) return;
                pill.onclick = e => {
                    e.stopPropagation();
                    e.preventDefault(); // prevent native label activation; we handle it
                    cb.checked = !cb.checked;
                    cb.dispatchEvent(new Event('change'));
                };
                cb.onclick = e => e.stopPropagation(); // prevent bubble → pill.onclick
            });
            if(msModel.supportsImage){
                const list = wrap.querySelector('.ms-img-list');
                if(list){
                    list.innerHTML = imageInputs.length ? '' : '<div class="text-[11px] text-gray-300 py-2">把图片或图片组连到这里</div>';
                    imageInputs.forEach((src, i) => {
                        const item = document.createElement('div');
                        item.className = 'input-item';
                        item.draggable = true;
                        item.dataset.sourceId = src.id;
                        item.innerHTML = `<span class="input-index">${i+1}</span>${src.preview?`<img src="${src.preview}">`:'<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>'}<span class="input-label">${escapeHtml(src.label)}</span>`;
                        item.ondragstart = e => { e.stopPropagation(); internalDrag=true; e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('application/x-canvas-input', src.id); };
                        item.ondragend = () => { internalDrag=false; };
                        item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
                        item.ondrop = e => { e.preventDefault(); e.stopPropagation(); reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id); internalDrag=false; };
                        list.appendChild(item);
                    });
                }
            }
            renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
            wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runMsGenNode(node.id); };
            
            const cascadeHtml = cascadeBtnHtml(node);
            if(cascadeHtml) {
                wrap.querySelector('.ms-controls').insertAdjacentHTML('beforeend', cascadeHtml);
                bindCascadeButtons(wrap, node.id);
            }
            
            return wrap;
        }
        async function runMsGenNode(nodeId, opts={}){
            const cascade = opts.cascade || false;
            const loopRefs = opts.loopRefs || null;
            const loopPrompt = opts.loopPrompt || '';
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.running) return;
            const sources = orderedSources(node, generatorSources(node));
            const prompt = loopPrompt || sources.map(s => s.prompt).filter(Boolean).join('\n\n');
            const refs = loopRefs || sources.flatMap(s => s.refs || []);
            const modelKey = node.msgenModel || 'zimage';
            const msModel = MS_GEN_MODELS[modelKey] || MS_GEN_MODELS.zimage;
            if(!prompt){ if(!cascade) alert('请先连接提示词'); return; }
            if(msModel.supportsImage && !refs.length){ if(!cascade) alert('请先连接图片'); return; }
            let out = connections.filter(c => c.from===node.id).map(c => nodes.find(n => n.id===c.to)).find(n => n?.type==='output');
            if(!out && !cascade){
                out = {id:uid('out'), type:'output', x:node.x+460, y:node.y, images:[]};
                nodes.push(out);
                connections.push({id:uid('c'), from:node.id, to:out.id});
            }
            if(!out && cascade) return;
            
            const pendingId = uid('p');
            if(out) out._pending = [...(out._pending || []), {id: pendingId}];
            if(!cascade) {
                node.running = true;
                render();
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
                if(node.fitImage && refs.length && refs[0].url){
                    try {
                        const dims = await getImageDimensions(refs[0].url);
                        width = dims.width; height = dims.height;
                    } catch(e) {}
                }
                const imageUrls = [];
                if(msModel.supportsImage){
                    for(const ref of refs.slice(0,3)){
                        if(ref.url){
                            try { imageUrls.push(await urlToBase64(ref.url)); }
                            catch(e){ imageUrls.push(ref.url); }
                        }
                    }
                }
                let apiBody;
                if(modelKey === 'zimage'){
                    apiBody = { prompt, resolution: `${width}x${height}`, client_id: CLIENT_ID };
                } else if(modelKey === 'qwen_edit'){
                    apiBody = { prompt, image_urls: imageUrls, client_id: CLIENT_ID };
                } else {
                    apiBody = { prompt, model: msModel.modelId, image_urls: imageUrls, client_id: CLIENT_ID };
                    if(node.kleinLora){
                        const s = node.kleinLoraStrength ?? 0.8;
                        apiBody.loras = { 'Daniel8152/Klein-enhance': s };
                    }
                }
                const res = await fetch(msModel.endpoint, {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify(apiBody)
                });
                if(!res.ok) throw new Error((await res.json()).detail || 'MS生成失败');
                const data = await res.json();
                const outputUrls = data.url ? [data.url] : [];
                const runMs = Date.now() - startTime;
                
                run.request = {
                    task_id: data.task_id || '',
                    request_id: data.request_id || '',
                    backend: 'ModelScope'
                };
                
                out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                if(data.url) window.outputNode.appendImage(out, [data.url], refs[0]);
                
                window.addGenerationLog({run, outputs: outputUrls, runMs});
                
                render();
                scheduleSave();
            } catch(err){
                const runMs = Date.now() - startTime;
                if(out) out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                
                window.addGenerationLog({run, outputs: [], runMs, error: err.message || 'MS生成失败'});
                
                render();
                if(!cascade) alert(err.message || 'MS生成失败');
            }
            if(!cascade) {
                node.running = false;
                render();
            }
        }
        function addComfyNode(point){
            const p = point || defaultPoint(160, 0);
            addNode({
                id:uid('comfy'),
                type:'comfy',
                x:p.x,
                y:p.y,
                w:420,
                h:460,
                mode:'klein',
                workflowId:'',
                workflowName:'',
                workflowParams:{},
                width:1024,
                height:1024,
                enhanceStrength:0.5,
                enhanceUpscale:false,
                enhanceUpscaleRes:2048,
                editUpscale:false,
                editUpscaleRes:2048,
                editModel:allImageModels()[0] || models.gpt,
                ratio:'square',
                resolution:'1k',
                count:1,
                cgSize:1536,
                cgSeed:627408158948073,
                style2dSize:1536,
                style2dSeed:955309619881078,
                gqSize:1536,
                gqSeed:872354623564321,
                gqDenoise:0.5,
                gqPrompt:'',
                ktSize:1024,
                ktSeed:45157923637773,
                ktLeft:504,
                ktTop:0,
                ktRight:504,
                ktBottom:0,
                ktPrompt:'移除绿色区域',
                rmbgModel:'BEN2',
                rmbgBackground:'Alpha',
                rmbgRes:1024,
                qeSize:1024,
                qePrompt:'',
                qeSeed:411725770964575,
                yichuwutiSteps:8,
                yichuwutiMaskGrow:40,
                yichuwutiSeed:945749561778401,
                sdmatteInferenceSize:1024,
                sdmatteMaskRefine:'true',
                sdmatteTrimapConstraint:0.8,
                tubiaoSize:1536,
                tubiaoSeed:180309040720206,
                tubiaoStrength:1,
                styleTransferSize:1024,
                inputs:[]
            });
        }
        function addOutputNode(point){
            const p = point || defaultPoint(260, 0);
            addNode({id:uid('out'), type:'output', x:p.x, y:p.y, images:[], imageComparisons:{}});
        }
        
        // ==================== Output 节点右键菜单 ====================
        function openOutputNodeMenu(nodeId, clientX, clientY){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.type !== 'output') return;
            
            const menu = document.getElementById('imageNodeMenu');
            if(!menu) return;
            
            const imageCount = outputImageUrls(node).length;
            const downloadableCount = outputDownloadableImageUrls(node).length;
            
            menu.classList.add('output-node-menu');
            menu.innerHTML = `
                <div class="menu-section-title">Output 操作</div>
                <button class="menu-btn" data-output-convert="${nodeId}" ${imageCount ? '' : 'disabled'}>
                    <i data-lucide="replace" class="w-4 h-4"></i>
                    <span>转换成输入组</span>
                </button>
                <button class="menu-btn" data-output-copy="${nodeId}" ${imageCount ? '' : 'disabled'}>
                    <i data-lucide="copy-plus" class="w-4 h-4"></i>
                    <span>转换为输入组</span>
                </button>
                <button class="menu-btn" data-output-send-ps="${nodeId}" ${imageCount ? '' : 'disabled'}>
                    <i data-lucide="send" class="w-4 h-4"></i>
                    <span>发送图像到photoshop</span>
                </button>
                <div class="menu-divider"></div>
                <div class="menu-section-title">文件操作</div>
                <button class="menu-btn" data-output-download="${nodeId}" ${downloadableCount ? '' : 'disabled'}>
                    <i data-lucide="download" class="w-4 h-4"></i>
                    <span>下载所有图片 (${downloadableCount})</span>
                </button>
                <button class="menu-btn" data-output-to-asset="${nodeId}" ${imageCount ? '' : 'disabled'}>
                    <i data-lucide="folder-open" class="w-4 h-4"></i>
                    <span>发送到资产库 (${imageCount})</span>
                </button>
            `;
            
            const menuWidth = 260;
            menu.style.left = `${Math.max(10, Math.min(window.innerWidth - menuWidth - 10, clientX))}px`;
            menu.style.top = `${clientY}px`;
            menu.classList.add('open');
            
            const convertBtn = menu.querySelector('[data-output-convert]');
            if(convertBtn){
                convertBtn.onclick = e => {
                    e.stopPropagation();
                    convertOutputNodeToInputGroup(nodeId);
                    closeOutputNodeMenu();
                };
            }
            
            const copyBtn = menu.querySelector('[data-output-copy]');
            if(copyBtn){
                copyBtn.onclick = e => {
                    e.stopPropagation();
                    copyOutputNodeToInputGroup(nodeId);
                    closeOutputNodeMenu();
                };
            }
            
            const downloadBtn = menu.querySelector('[data-output-download]');
            if(downloadBtn){
                downloadBtn.onclick = e => {
                    e.stopPropagation();
                    downloadOutputNodeImages(nodeId);
                    closeOutputNodeMenu();
                };
            }
            
            const sendPsBtn = menu.querySelector('[data-output-send-ps]');
            if(sendPsBtn){
                sendPsBtn.onclick = e => {
                    e.stopPropagation();
                    window.psSend.sendOutputImageToPhotoshop(nodeId);
                    closeOutputNodeMenu();
                };
            }
            
            const assetBtn = menu.querySelector('[data-output-to-asset]');
            if(assetBtn){
                assetBtn.onclick = async e => {
                    e.stopPropagation();
                    closeOutputNodeMenu();
                    const node = nodes.find(n => n.id === nodeId);
                    if(node) {
                        const urls = outputImageUrls(node);
                        await window.sendToAssetLibrary(urls);
                        window.openAssetLibrary();
                    }
                };
            }
            
            refreshIcons();
        }
        
        function closeOutputNodeMenu(){
            const menu = document.getElementById('imageNodeMenu');
            if(menu) {
                menu.classList.remove('open');
                menu.classList.remove('output-node-menu');
                menu.innerHTML = '';
            }
        }
        
        // 添加点击空白处关闭菜单的事件
        document.addEventListener('mousedown', e => {
            const menu = document.getElementById('imageNodeMenu');
            if(menu && menu.classList.contains('open')) {
                if(!menu.contains(e.target)) {
                    closeOutputNodeMenu();
                    if (window.closeAudioNodeMenu) window.closeAudioNodeMenu();
                    if (window.closeVideoNodeMenu) window.closeVideoNodeMenu();
                    if (window.closeUploadVideoNodeMenu) window.closeUploadVideoNodeMenu();
                }
            }
        });
        
        function outputImageUrls(node){
            return (node?.images || []).filter(url => url && !isVideoUrl(url));
        }
        
        function outputDownloadableImageUrls(node){
            return outputImageUrls(node).filter(url => !isMissingAssetUrl(url) && (url.startsWith('/output/') || url.startsWith('/assets/')));
        }
        
        function createInputGroupFromOutput(node, point){
            const urls = outputImageUrls(node);
            if(!node || !urls.length) return null;
            
            const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(urls.length))));
            const cardW = 260;
            const cardH = 336;
            const gap = 24;
            const base = point || {x:Number(node.x || 0), y:Number(node.y || 0)};
            
            const imageNodes = urls.map((url, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const img = {
                    id:uid('img'),
                    type:'image',
                    x:base.x + 24 + col * (cardW + gap),
                    y:base.y + 58 + row * (cardH + gap),
                    w:cardW,
                    h:cardH,
                    url,
                    name:outputImageName(url)
                };
                nodes.push(img);
                return img;
            });
            
            const rows = Math.ceil(urls.length / cols);
            const group = {
                id:uid('grp'),
                type:'group',
                x:base.x,
                y:base.y,
                w:cols * cardW + (cols - 1) * gap + 48,
                h:rows * cardH + (rows - 1) * gap + 90,
                items:imageNodes.map(img => img.id)
            };
            nodes.push(group);
            return group;
        }
        
        function convertOutputNodeToInputGroup(nodeId){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.type !== 'output') return;
            if(!outputImageUrls(node).length) return;
            
            pushUndo();
            const downstream = connections.filter(c => c.from === nodeId).map(c => c.to);
            const group = createInputGroupFromOutput(node, {x:Number(node.x || 0), y:Number(node.y || 0)});
            if(!group) return;
            
            nodes = nodes.filter(n => n.id !== nodeId);
            connections = connections.filter(c => c.from !== nodeId && c.to !== nodeId);
            
            downstream.forEach(toId => {
                if(canConnect(group.id, toId) && !connections.some(c => c.from === group.id && c.to === toId)){
                    connections.push({id:uid('c'), from:group.id, to:toId});
                }
            });
            
            selected.clear();
            selected.add(group.id);
            syncGeneratorInputs();
            refreshGeneratorInputViews();
            render();
            scheduleSave();
        }
        
        function copyOutputNodeToInputGroup(nodeId){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.type !== 'output') return;
            if(!outputImageUrls(node).length) return;
            
            pushUndo();
            const group = createInputGroupFromOutput(node, {x:Number(node.x || 0) + 36, y:Number(node.y || 0) + 36});
            if(!group) return;
            
            selected.clear();
            selected.add(group.id);
            syncGeneratorInputs();
            refreshGeneratorInputViews();
            render();
            scheduleSave();
        }
        
        function outputImageName(url){
            const clean = (url || '').split('?')[0];
            const name = clean.split('/').filter(Boolean).pop();
            return name ? decodeURIComponent(name) : 'output image';
        }
        
        async function downloadOutputNodeImages(nodeId){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.type !== 'output') return;
            
            const urls = outputDownloadableImageUrls(node);
            if(!urls.length){
                alert('没有可下载的图片');
                return;
            }
            
            for(const url of urls){
                try {
                    await window.outputNode.downloadUrl(url, window.outputNode.outputDownloadName ? window.outputNode.outputDownloadName(url) : `canvas-output-${Date.now()}.png`);
                } catch(err) {
                    console.error('Download failed:', url, err);
                }
            }
        }
        
        function isVideoUrl(url){
            if(!url) return false;
            const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
            const clean = url.split('?')[0].toLowerCase();
            return videoExts.some(ext => clean.endsWith(ext));
        }
        
        function isMissingAssetUrl(url){
            return url && url.startsWith('/assets/missing/');
        }
        
        function openCreateMenu(clientX, clientY){
            menuPoint = screenToWorld(clientX, clientY);
            createMenu.style.left = `${clientX}px`;
            createMenu.style.top = `${clientY}px`;
            createMenu.classList.add('open');
            refreshIcons();
        }
        function closeCreateMenu(){ createMenu.classList.remove('open'); }
        function menuAdd(type){
            console.log('[Canvas] menuAdd called with type:', type);
            closeCreateMenu();
            if(type === 'image') window.imageNodeModule.addImageNode(menuPoint);
            if(type === 'prompt') addPromptNode(menuPoint);
            if(type === 'loop') addLoopNode(menuPoint);
            if(type === 'llm') addLLMNode(menuPoint);
            if(type === 'generator') addGeneratorNode(menuPoint);
            if(type === 'msgen') addMsGenNode(menuPoint);
            if(type === 'comfy') addComfyNode(menuPoint);
            if(type === 'video') addVideoNode(menuPoint);
            if(type === 'audio') addAudioNode(menuPoint);
            if(type === 'upload-video') addUploadVideoNode(menuPoint);
            if(type === 'output') addOutputNode(menuPoint);
            if(type === 'ps') {
                console.log('[Canvas] Calling psNodeModule.addPSNode');
                window.psNodeModule.addPSNode(menuPoint);
            }
        }

        function render(){
            applyViewport();
            nodesEl.innerHTML = '';
            nodes.forEach(node => nodesEl.appendChild(renderNode(node)));
            refreshGeometry();
            refreshGeometryAfterLayout();
            refreshIcons();
        }
        function isNodeControl(target){
            return !!target.closest('textarea, input, select, option, button, .seg, .gen-btn, .comfy-run, .ps-run-btn, .input-item, .blank-image, .mode-tabs, .ms-model-tabs, .llm-provider, .llm-output, .llm-chat-log, .llm-bubble, .llm-pane-resizer');
        }
        function isNodeDragSurface(target){
            return !isNodeControl(target) && !target.closest('.port, .resize-handle, .output-img-wrap');
        }
        function renderNode(node){
            const el = document.createElement('div');
            const size = defaultNodeSize(node.type);
            const hasFixedSize = Boolean(node.h || size.h);
            el.className = `node ${node.type}-node ${node.url ? 'has-image' : ''} ${hasFixedSize ? 'sized' : ''} ${selected.has(node.id) ? 'selected' : ''}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.style.width = `${node.w || size.w}px`;
            if(node.h || size.h) el.style.height = `${node.h || size.h}px`;
            el.dataset.id = node.id;
            el.onclick = (e) => {
                e.stopPropagation();
                if(isNodeControl(e.target)) return;
                if(e.ctrlKey || e.metaKey) selected.has(node.id) ? selected.delete(node.id) : selected.add(node.id);
                else if(!selected.has(node.id)) { selected.clear(); selected.add(node.id); }
                render();
            };
            const title = node.type === 'image' ? 'Image' : node.type === 'text' ? 'Text' : node.type === 'prompt' ? 'Prompt' : node.type === 'promptGroup' ? 'Prompts' : node.type === 'group' ? 'Group' : node.type === 'output' ? 'Output' : node.type === 'llm' ? 'LLM' : node.type === 'comfy' ? 'ComfyUI' : node.type === 'msgen' ? 'Modelscope生成' : node.type === 'loop' ? '循环' : node.type === 'video' ? '视频生成' : node.type === 'audio' ? '音频' : node.type === 'upload-video' ? '视频' : node.type === 'ps' ? '获取photoshop图像' : 'API生成';
            el.innerHTML = `<div class="node-head"><span class="node-title">${title}</span><button onclick="deleteNode('${node.id}', event)" class="text-gray-300 hover:text-red-500"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
            const body = document.createElement('div');
            body.className = 'node-body';
            if(node.type === 'image') {
                if (window.imageNodeModule) {
                    window.imageNodeModule.renderImageNode(node, body);
                }
            }
            if(node.type === 'prompt') {
                body.innerHTML = `<textarea placeholder="输入提示词...">${escapeHtml(node.text || '')}</textarea>`;
                const textarea = body.querySelector('textarea');
                textarea.onmousedown = e => e.stopPropagation();
                textarea.onclick = e => e.stopPropagation();
                textarea.oninput = e => { node.text = e.target.value; scheduleSave(); syncGeneratorInputs(); refreshGeneratorInputViews(); };
            }
            if(node.type === 'text') {
                const textContent = node.text || '';
                const textUrl = node.text_url || '';
                const imageHtml = node.image_url ? `<img src="${node.image_url}" class="text-node-image" style="max-width:100%; max-height:120px; border-radius:8px; margin-bottom:8px; object-fit:contain;">` : '';
                const preId = `text-pre-${node.id}`;
                body.innerHTML = `
                    <div class="text-node-content">
                        ${node.title ? `<div class="text-node-title text-xs font-bold text-gray-500 mb-2">${escapeHtml(node.title)}</div>` : ''}
                        ${imageHtml}
                        <pre id="${preId}" class="text-node-pre">${escapeHtml(textContent) || '<span class="text-gray-400">加载中...</span>'}</pre>
                    </div>
                    <div class="text-node-actions">
                        <button onclick="copyTextToClipboard('${node.id}', event)" class="text-[10px] text-gray-400 hover:text-black">📋 复制</button>
                        ${textUrl ? `<a href="${textUrl}" download class="text-[10px] text-gray-400 hover:text-black" onclick="event.stopPropagation()">💾 下载</a>` : ''}
                    </div>
                `;
                body.onmousedown = e => startNodeDrag(e, node);
                
                // 如果有 text_url 但文本内容为空，异步加载
                if(textUrl && !textContent) {
                    loadTextFromUrl(node, preId);
                }
            }
            if(node.type === 'group') {
                const items = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
                const imgCount = items.filter(n => n.type === 'image').length;
                const promptCount = items.filter(n => n.type === 'prompt').length;
                const parts = [];
                if(imgCount) parts.push(`${imgCount} 张图片`);
                if(promptCount) parts.push(`${promptCount} 个提示词`);
                const text = parts.length ? parts.join(' · ') + ' 已成组' : '拖入图片或提示词到此';
                body.innerHTML = `<div class="text-[11px] text-gray-400">${text}</div>`;
            }
            if(node.type === 'promptGroup') {
                const promptNodes = (node.items || []).map(id => nodes.find(n => n.id === id)).filter(Boolean);
                body.innerHTML = `<div class="text-[11px] text-gray-400">${promptNodes.length} 个提示词已成组</div>`;
            }
            if(node.type === 'llm') body.appendChild(renderLLMBody(node));
            if(node.type === 'generator') body.appendChild(renderGeneratorBody(node));
            if(node.type === 'msgen') body.appendChild(renderMsGenBody(node));
            if(node.type === 'comfy') body.appendChild(renderComfyBody(node));
            if(node.type === 'loop') body.appendChild(renderLoopBody(node));
            if(node.type === 'video') {
                body.appendChild(renderVideoBody(node));
                el.oncontextmenu = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openVideoNodeMenu(node.id, e.clientX, e.clientY);
                };
            }
            if(node.type === 'audio') {
                body.appendChild(renderAudioBody(node));
                el.oncontextmenu = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openAudioNodeMenu(node.id, e.clientX, e.clientY);
                };
            }
            if(node.type === 'upload-video') {
                body.appendChild(renderUploadVideoBody(node));
                el.oncontextmenu = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openUploadVideoNodeMenu(node.id, e.clientX, e.clientY);
                };
            }
            if(node.type === 'ps') {
                if (window.psNodeModule) {
                    window.psNodeModule.renderPSNode(node, body);
                }
            }
            if(node.type === 'output') {
                body.appendChild(window.outputNode.renderBody(node));
                el.oncontextmenu = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openOutputNodeMenu(node.id, e.clientX, e.clientY);
                };
            }
            el.appendChild(body);
            el.querySelectorAll('button, select, textarea, input').forEach(control => {
                control.addEventListener('mousedown', e => e.stopPropagation());
                control.addEventListener('click', e => e.stopPropagation());
            });
            el.onmousedown = e => {
                if(e.button !== 0 || !isNodeDragSurface(e.target)) return;
                startNodeDrag(e, node);
            };
            const canInput = ['generator','comfy','output','llm','msgen','video'].includes(node.type) || (node.type === 'loop' && node.imageInput);
            const canOutput = ['image','prompt','loop','group','promptGroup','generator','comfy','llm','msgen','video','audio','upload-video','ps'].includes(node.type);
            if(canInput) el.insertAdjacentHTML('beforeend', '<div class="port in" title="连接到这里"></div>');
            if(canOutput) el.insertAdjacentHTML('beforeend', '<div class="port out" title="拖线连接"></div>');
            el.insertAdjacentHTML('beforeend', '<div class="resize-handle" title="调整大小"></div>');
            el.querySelector('.node-head').onmousedown = e => startNodeDrag(e, node);
            el.querySelector('.resize-handle').onmousedown = e => startNodeResize(e, node);
            el.ondragstart = function(e) {
                if (e.target.tagName === 'IMG') {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', e.target.src || '');
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
            };
            const out = el.querySelector('.port.out');
            if(out) out.onmousedown = e => startLink(e, node.id, 'out');
            const inp = el.querySelector('.port.in');
            if(inp) inp.onmousedown = e => startLink(e, node.id, 'in');
            return el;
        }
        function defaultNodeSize(type){
            if(type === 'image') return {w:260, h:0};
            if(type === 'prompt') return {w:310, h:0};
            if(type === 'llm') return {w:420, h:520};
            if(type === 'generator') return {w:380, h:0};
            if(type === 'msgen') return {w:380, h:0};
            if(type === 'comfy') return {w:420, h:460};
            if(type === 'output') return {w:460, h:0};
            if(type === 'loop') return {w:336, h:0};
            if(type === 'video') return {w:380, h:0};
            if(type === 'audio') return {w:320, h:0};
            if(type === 'upload-video') return {w:320, h:0};
            if(type === 'ps') return {w:460, h:0};
            return {w:260, h:0};
        }
        function renderLLMBody(node){
            const wrap = document.createElement('div');
            wrap.className = 'llm-body';
            const mode = node.mode || 'node';
            node.llmProvider = resolveChatProviderId(node.llmProvider || 'comfly');
            const llmProv = node.llmProvider;
            if(llmProv === 'modelscope') node.model = node.llmMsModel || node.model;
            if(!providerChatModels(llmProv).includes(node.model)) node.model = providerChatModels(llmProv)[0] || node.model;
            const modelOpts = chatModelOptions(node.model, llmProv);
            node.showSystem = Boolean(node.showSystem);
            wrap.innerHTML = `
                <div class="llm-row">
                    <select class="select-lite llm-provider-select" style="flex:1">${chatProviderOptions(llmProv)}</select>
                    <select class="select-lite llm-model">${modelOpts}</select>
                    <div class="llm-mode"><button data-mode="node">节点</button><button data-mode="chat">聊天</button></div>
                    <button class="llm-sys-toggle ${node.showSystem ? 'active' : ''}" type="button">System</button>
                </div>
                ${node.showSystem ? `<textarea class="llm-system" placeholder="系统提示词...">${escapeHtml(node.systemPrompt || '')}</textarea>` : ''}
                <div class="llm-node-pane"></div>
                <div class="llm-chat-pane"></div>
            `;
            const providerSelect = wrap.querySelector('.llm-provider-select');
            const modelSelect = wrap.querySelector('.llm-model');
            providerSelect.value = llmProv;
            modelSelect.value = resolveChatModel(node.model, llmProv);
            [providerSelect, modelSelect].forEach(input => {
                input.onmousedown = e => e.stopPropagation();
                input.onclick = e => e.stopPropagation();
            });
            providerSelect.onchange = e => {
                e.stopPropagation();
                node.llmProvider = e.target.value;
                const models = providerChatModels(node.llmProvider);
                node.model = models[0] || '';
                if(node.llmProvider === 'modelscope') node.llmMsModel = node.model;
                render();
                scheduleSave();
            };
            modelSelect.onchange = e => {
                e.stopPropagation();
                if(e.target.value === '__manage__'){
                    e.target.value = resolveChatModel(node.model, llmProv);
                    openModelManager('chat');
                    return;
                }
                node.model = e.target.value;
                if((node.llmProvider||'comfly') === 'modelscope') node.llmMsModel = e.target.value;
                scheduleSave();
            };
            wrap.querySelector('.llm-sys-toggle').onclick = e => { e.stopPropagation(); node.showSystem = !node.showSystem; render(); scheduleSave(); };
            const sysEl = wrap.querySelector('.llm-system');
            if(sysEl){ sysEl.oninput = e => { node.systemPrompt = e.target.value; scheduleSave(); }; bindScrollableText(sysEl); }
            wrap.querySelectorAll('[data-mode]').forEach(btn => {
                btn.classList.toggle('active', mode === btn.dataset.mode);
                btn.onclick = e => { e.stopPropagation(); node.mode = btn.dataset.mode; render(); scheduleSave(); };
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
        function renderLLMNodePane(container, node){
            const connectedInput = llmInputText(node);
            const isReadonly = connectedInput.length > 0;
            const inputValue = connectedInput || node.userInput || '';
            const inputHeight = Math.max(70, node.llmInputHeight || 110);
            const outputHeight = Math.max(70, node.llmOutputHeight || 150);
            const inputPlaceholder = isReadonly ? '(来自连接)' : '直接输入，或连接提示词节点…';
            container.innerHTML = `
                <div class="llm-pane-label">Input${isReadonly ? ' <span style="font-size:9px;opacity:.5;font-weight:600;text-transform:none;letter-spacing:0">(来自连接)</span>' : ''}</div>
                <textarea class="llm-input-area llm-input-output" style="height:${inputHeight}px; flex:0 0 ${inputHeight}px;" ${isReadonly ? 'readonly' : ''} placeholder="${inputPlaceholder}">${escapeHtml(inputValue)}</textarea>
                <div class="llm-pane-resizer" title="拖动调整输入/输出高度"></div>
                <div class="llm-pane-label">Output</div>
                <div class="llm-output-wrap" style="height:${outputHeight}px; flex:0 0 ${outputHeight}px;">
                    <button class="llm-copy-btn llm-output-copy" type="button" title="复制"><i data-lucide="copy" class="w-3.5 h-3.5"></i></button>
                    <div class="llm-output llm-result-output">${escapeHtml(node.outputText || '运行后会输出文本，可连到生成卡片')}</div>
                </div>
                <div class="gen-run-row mt-2">
                    <button class="llm-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="play" class="w-4 h-4"></i>${node.running ? '运行中' : 'Run LLM'}</button>
                    ${cascadeBtnHtml(node) || ''}
                </div>
                ${retryBarHtml(node) || ''}
            `;
            const inputEl = container.querySelector('.llm-input-output');
            bindScrollableText(inputEl);
            if(!isReadonly){
                inputEl.oninput = e => { node.userInput = e.target.value; };
            }
            bindScrollableText(container.querySelector('.llm-result-output'));
            container.querySelector('.llm-pane-resizer').onmousedown = e => startLLMPaneResize(e, node);
            container.querySelector('.llm-run').onclick = e => { e.stopPropagation(); runLLMNode(node.id); };
            bindCascadeButtons(container, node.id);
            const copyBtn = container.querySelector('.llm-output-copy');
            if(copyBtn){
                copyBtn.onmousedown = e => e.stopPropagation();
                copyBtn.onclick = async e => {
                    e.stopPropagation();
                    const text = node.outputText || '';
                    if(!text) return;
                    if(await copyTextToClipboard(text)){
                        copyBtn.classList.add('copied');
                        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
                    }
                };
            }
        }
        function renderLLMChatPane(container, node){
            const messages = node.messages || [];
            container.innerHTML = `
                <div class="llm-chat-log">${messages.length ? messages.map((msg, mi) => `<div class="llm-bubble ${msg.role === 'user' ? 'user' : 'assistant'}" data-msg-idx="${mi}">${escapeHtml(msg.content || '')}${msg.role === 'assistant' ? `<button class="llm-bubble-copy" type="button" title="复制"><i data-lucide="copy" style="width:11px;height:11px;display:inline-block;vertical-align:middle"></i></button>` : ''}</div>`).join('') : '<div class="text-[11px] text-gray-300">开始一段聊天...</div>'}</div>
                <textarea class="llm-chat-input mt-2" rows="2" placeholder="输入消息...">${escapeHtml(node.chatInput || '')}</textarea>
                <button class="llm-run mt-2" ${node.running ? 'disabled' : ''}><i data-lucide="send" class="w-4 h-4"></i>${node.running ? '发送中' : 'Send'}</button>
            `;
            bindScrollableText(container.querySelector('.llm-chat-log'));
            bindScrollableText(container.querySelector('.llm-chat-input'));
            const chatInputEl = container.querySelector('.llm-chat-input');
            chatInputEl.oninput = e => { node.chatInput = e.target.value; scheduleSave(); };
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
                    if(await copyTextToClipboard(msg.content || '')){
                        btn.classList.add('copied');
                        setTimeout(() => btn.classList.remove('copied'), 1500);
                    }
                };
            });
        }
        function bindScrollableText(el){
            if(!el) return;
            el.onmousedown = e => e.stopPropagation();
            el.onclick = e => e.stopPropagation();
            el.onwheel = e => e.stopPropagation();
        }
        function startLLMPaneResize(e, node){
            e.preventDefault();
            e.stopPropagation();
            llmPaneDrag = {
                node,
                sy:e.clientY,
                inputStart:Math.max(70, node.llmInputHeight || 110),
                outputStart:Math.max(70, node.llmOutputHeight || 150)
            };
            window.onmousemove = onLLMPaneResize;
            window.onmouseup = endDrag;
        }
        function onLLMPaneResize(e){
            if(!llmPaneDrag) return;
            const total = llmPaneDrag.inputStart + llmPaneDrag.outputStart;
            const delta = (e.clientY - llmPaneDrag.sy) / viewport.scale;
            const minPane = 70;
            const nextInput = Math.max(minPane, Math.min(total - minPane, llmPaneDrag.inputStart + delta));
            const nextOutput = Math.max(minPane, total - nextInput);
            llmPaneDrag.node.llmInputHeight = Math.round(nextInput);
            llmPaneDrag.node.llmOutputHeight = Math.round(nextOutput);
            const el = nodesEl.querySelector(`.node[data-id="${llmPaneDrag.node.id}"]`);
            if(el){
                const inputEl = el.querySelector('.llm-input-output');
                const outputEl = el.querySelector('.llm-result-output');
                if(inputEl){
                    inputEl.style.height = `${llmPaneDrag.node.llmInputHeight}px`;
                    inputEl.style.flexBasis = `${llmPaneDrag.node.llmInputHeight}px`;
                }
                if(outputEl){
                    outputEl.style.height = `${llmPaneDrag.node.llmOutputHeight}px`;
                    outputEl.style.flexBasis = `${llmPaneDrag.node.llmOutputHeight}px`;
                }
            }
        }
        function llmInputText(node){
            return connections.filter(c => c.to === node.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).map(n => {
                if(n.type === 'prompt') return n.text || '';
                if(n.type === 'promptGroup') return (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean).join('\n\n');
                if(n.type === 'llm') return n.outputText || '';
                return '';
            }).filter(Boolean).join('\n\n');
        }
        function isTerminalGenerator(nodeId){
            const GEN_TYPES = ['generator','msgen','comfy','llm','video'];
            for(const c of connections.filter(c => c.from === nodeId)){
                const t = nodes.find(n => n.id === c.to);
                if(!t) continue;
                if(GEN_TYPES.includes(t.type)) return false;
                if(t.type === 'output'){
                    for(const c2 of connections.filter(cc => cc.from === t.id)){
                        const t2 = nodes.find(n => n.id === c2.to);
                        if(t2 && GEN_TYPES.includes(t2.type)) return false;
                    }
                }
            }
            return true;
        }
        
        function resolveCascadeLoop(targetId){
            const upstream = new Set();
            const walk = (id) => {
                if(upstream.has(id)) return;
                upstream.add(id);
                connections.filter(c => c.to === id).forEach(c => walk(c.from));
            };
            walk(targetId);
            const loops = nodes.filter(n => n.type === 'loop' && upstream.has(n.id));
            if(!loops.length) return null;
            const loop = loops[loops.length - 1];
            return {node:loop, count:loop.count || 3, mode:loop.mode === 'parallel' ? 'parallel' : 'serial'};
        }
        
        function cascadeBtnHtml(node){
            if(!isTerminalGenerator(node.id)) return '';
            const loop = resolveCascadeLoop(node.id);
            if(!loop) return '';
            const suffix = ` × ${loop.count} 轮`;
            if(cascadeSerialIds.has(node.id)){
                return `<div class="gen-run-row" style="margin-top:10px"><button class="gen-cascade-btn gen-cascade-stop" type="button" data-cascade-stop="${node.id}"><i data-lucide="square" class="w-4 h-4"></i><span>停止循环</span></button></div>`;
            }
            return `<div class="gen-run-row" style="margin-top:10px"><button class="gen-cascade-btn" type="button" data-cascade="${node.id}" title="从循环节点启动整条工作流"><i data-lucide="play-circle" class="w-4 h-4"></i><span>批量运行${suffix}</span></button></div>`;
        }
        
        function bindCascadeButtons(wrap, nodeId){
            wrap.querySelectorAll(`[data-cascade="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); runNodeCascade(nodeId); };
            });
            wrap.querySelectorAll(`[data-cascade-stop="${nodeId}"]`).forEach(b => {
                b.onmousedown = e => e.stopPropagation();
                b.onclick = e => { e.stopPropagation(); cascadeStopIds.add(nodeId); b.disabled = true; b.querySelector('span').textContent = '停止中…'; };
            });
        }
        
        async function runNodeCascade(nodeId){
            const target = nodes.find(n => n.id === nodeId);
            if(!target) return;
            if(target.running){ alert('当前节点正在运行'); return; }
            cascadeSerialIds.add(nodeId);
            
            const order = computeCascadeOrder(nodeId);
            if(!order.length){ alert('没有可运行的生成节点'); return; }
            
            const loop = resolveCascadeLoop(nodeId);
            const totalRounds = loop?.count || 1;
            const startIdx = Math.max(1, Number(loop?.node?.loopStart) || 1);
            const loopBatchSize = loop?.node?.imageInput ? Math.max(1, Math.min(100, Number(loop?.node?.imageBatchSize) || 1)) : 1;
            const endIdx = startIdx + (totalRounds - 1) * loopBatchSize;
            
            order.forEach(id => {
                const n = nodes.find(x => x.id === id);
                if(n) n.generatedOutputs = [];
            });
            
            try {
                for(let round = startIdx; round <= endIdx; round++){
                    if(cascadeStopIds.has(nodeId)) break;
                    
                    const ctx = loop ? { index: round, total: endIdx, nodeId: loop.node.id } : null;
                    loopContext = ctx;
                    
                    order.forEach(id => {
                        const n = nodes.find(x => x.id === id);
                        if(n) n._cascadeIdx = `${round - startIdx + 1}/${totalRounds}`;
                    });
                    refreshNodes(order);
                    
                    for(const id of order){
                        if(cascadeStopIds.has(nodeId)) break;
                        const n = nodes.find(x => x.id === id);
                        if(!n) continue;
                        try {
                            await runCascadeNodeByType(n, { cascade: true });
                        } catch(err) {
                            console.error(`节点 ${id} 运行失败:`, err);
                        }
                    }
                }
            } finally {
                cascadeSerialIds.delete(nodeId);
                cascadeStopIds.delete(nodeId);
                loopContext = null;
                order.forEach(id => {
                    const n = nodes.find(x => x.id === id);
                    if(n) { n._cascadeIdx = ''; n.runStatus = ''; }
                });
                refreshNodes(order);
                scheduleSave();
            }
        }
        
        function computeCascadeOrder(targetId){
            const upstream = new Set();
            const found = [];
            const walk = (id) => {
                if(upstream.has(id)) return;
                upstream.add(id);
                const n = nodes.find(x => x.id === id);
                if(n && ['generator','msgen','comfy','llm','video'].includes(n.type)) found.push(id);
                connections.filter(c => c.to === id).forEach(c => walk(c.from));
            };
            walk(targetId);
            return found.reverse();
        }
        
        function refreshNodes(ids){
            ids.forEach(id => {
                const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
                if(el) {
                    const n = nodes.find(x => x.id === id);
                    if(n && n.type === 'loop') {
                        const body = el.querySelector('.node-body');
                        if(body) {
                            body.innerHTML = '';
                            body.appendChild(renderLoopBody(n));
                        }
                    }
                }
            });
            refreshIcons();
        }
        
        let cascadeSerialIds = new Set();
        let cascadeStopIds = new Set();
        let loopContext = null;
        
        function renderGeneratorBody(node){
            const wrap = document.createElement('div');
            wrap.className = 'generator-body';
            const inputSources = generatorSources(node);
            const ordered = orderedSources(node, inputSources);
            const imageInputs = ordered.filter(src => src.refs?.length);
            const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
            const referenceImages = ordered.flatMap(src => src.refs || []);
            node.apiProvider = resolveImageProviderId(node.apiProvider || '');
            const imageProviderModels = providerImageModels(node.apiProvider);
            if(!imageProviderModels.length) node.model = '';
            else if(!imageProviderModels.includes(resolveImageModel(node.model))) node.model = imageProviderModels[0] || '';
            wrap.innerHTML = `
                <div class="prompt-list mb-3"></div>
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Images</div>
                <div class="input-list"></div>
                <div class="gen-settings">
                    <div class="gen-settings-row">
                        <select class="select-lite provider-select">${providerOptions(node.apiProvider)}</select>
                        <select class="select-lite model-select">${imageModelOptions(node.model, node.apiProvider)}</select>
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
                            <input class="setting-input custom-ratio-w-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioWidth || '')}" placeholder="4">
                        </label>
                        <label class="field">
                            <div class="setting-title">比例高</div>
                            <input class="setting-input custom-ratio-h-input" type="number" min="1" step="1" value="${escapeHtml(node.customRatioHeight || '')}" placeholder="3">
                        </label>
                    </div>
                    <div class="gen-settings-row custom-size-row" style="display:none">
                        <label class="field">
                            <div class="setting-title">宽度</div>
                            <input class="setting-input custom-w-input" type="number" min="64" step="64" value="${escapeHtml(node.customWidth || '')}" placeholder="自动">
                        </label>
                        <label class="field">
                            <div class="setting-title">高度</div>
                            <input class="setting-input custom-h-input" type="number" min="64" step="64" value="${escapeHtml(node.customHeight || '')}" placeholder="自动">
                        </label>
                        <button class="secondary-btn fit-size-btn" type="button" style="height:32px;align-self:flex-end;padding:0 10px;font-size:11px">适配图片尺寸</button>
                    </div>
                </div>
                <div class="gen-run-row">
                    <button class="gen-btn ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? '生成中' : 'API生成'}</button>
                    ${cascadeBtnHtml(node) || ''}
                </div>
                ${retryBarHtml(node) || ''}
            `;
            const providerSelect = wrap.querySelector('.provider-select');
            const modelSelect = wrap.querySelector('.model-select');
            providerSelect.onmousedown = e => e.stopPropagation();
            providerSelect.onclick = e => e.stopPropagation();
            providerSelect.onchange = e => {
                e.stopPropagation();
                node.apiProvider = e.target.value;
                const providerModels = providerImageModels(node.apiProvider);
                if(!providerModels.includes(resolveImageModel(node.model))) node.model = providerModels[0] || '';
                modelSelect.innerHTML = imageModelOptions(node.model, node.apiProvider);
                scheduleSave();
            };
            modelSelect.onmousedown = e => e.stopPropagation();
            modelSelect.onclick = e => e.stopPropagation();
            modelSelect.onchange = e => {
                e.stopPropagation();
                if(e.target.value === '__manage__'){
                    e.target.value = resolveImageModel(node.model);
                    openModelManager('image');
                    return;
                }
                node.model = e.target.value;
                scheduleSave();
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
                scheduleSave();
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
                scheduleSave();
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
                    scheduleSave();
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
                    scheduleSave();
                };
            });
            if(fitSizeBtn){
                fitSizeBtn.onmousedown = e => e.stopPropagation();
                fitSizeBtn.onclick = async e => {
                    e.stopPropagation();
                    const ref = referenceImages.find(item => item.url);
                    if(!ref) return;
                    try {
                        const dims = await getImageDimensions(ref.url);
                        node.customWidth = dims.width;
                        node.customHeight = dims.height;
                        node.customSize = `${dims.width}x${dims.height}`;
                        node.resolution = 'custom';
                        node.ratio = '';
                        syncSizeControls();
                        scheduleSave();
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
                scheduleSave();
            };
            countInput.onblur = e => { e.target.value = String(Math.max(1, Math.min(8, Number(node.count || 1)))); };
            wrap.querySelectorAll('[data-step]').forEach(btn => {
                btn.onclick = e => {
                    e.stopPropagation();
                    const next = Math.max(1, Math.min(8, Number(node.count || 1) + Number(btn.dataset.step || 0)));
                    node.count = next;
                    countInput.value = String(next);
                    scheduleSave();
                };
            });
            const list = wrap.querySelector('.input-list');
            list.innerHTML = imageInputs.length ? '' : '<div class="text-[11px] text-gray-300 py-2">把图片或图片组连到这里</div>';
            imageInputs.forEach((src, i) => {
                const item = document.createElement('div');
                item.className = 'input-item';
                item.draggable = true;
                item.dataset.sourceId = src.id;
                item.innerHTML = `<span class="input-index">${i + 1}</span>${src.preview ? `<img src="${src.preview}">` : '<i data-lucide="image" class="w-6 h-6 text-slate-400"></i>'}<span class="input-label">${escapeHtml(src.label)}</span>`;
                item.ondragstart = e => {
                    e.stopPropagation();
                    internalDrag = true;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-canvas-input', src.id);
                };
                item.ondragend = () => { internalDrag = false; };
                item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
                item.ondrop = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
                    internalDrag = false;
                };
                list.appendChild(item);
            });
            renderPromptPreview(wrap.querySelector('.prompt-list'), promptInputs);
            wrap.querySelector('.gen-btn').onclick = e => { e.stopPropagation(); runGenerator(node.id); };
            if(bindCascadeButtons) bindCascadeButtons(wrap, node.id);
            return wrap;
        }
        function renderPromptPreview(container, promptInputs){
            if(!container) return;
            container.innerHTML = promptInputs.length ? `<div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Prompts</div>${promptInputs.map(src => `<div class="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 line-clamp-2">${escapeHtml(src.label)}</div>`).join('')}` : '';
        }
        function imageRefsFromNode(n){
            if(!n) return [];
            if(n.type === 'image' && n.url) return [{url:n.url, name:n.name || 'image', mask:n.mask}];
            if(n.type === 'output' && (n.images||[]).length){
                const last = [...n.images].reverse().find(img => img && !img.startsWith('data:video'));
                return last ? [{url:last, name:'output.png'}] : [];
            }
            if(['generator','msgen','comfy'].includes(n.type)){
                return (n.images || []).filter(url => url && !url.startsWith('data:video')).map(url => ({url, name:'generated.png'}));
            }
            if(n.type === 'group') {
                const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
                return items.flatMap(img => {
                    if(img.type === 'image' && img.url) return [{url:img.url, name:img.name || 'image', mask:img.mask}];
                    return [];
                });
            }
            return [];
        }
        
        function loopInputImageRefs(node){
            if(!node?.imageInput) return [];
            const allRefs = connections
                .filter(c => c.to === node.id)
                .flatMap(c => imageRefsFromNode(nodes.find(n => n.id === c.from)))
                .filter(ref => ref?.url);
            if(!allRefs.length) return [];
            const startBase = Math.max(1, Number(node.loopStart) || 1);
            const batchSize = Math.max(1, Math.min(100, Number(node.imageBatchSize) || 1));
            const currentIndex = Math.max(1, Number(startBase) || 1);
            const start = Math.max(0, currentIndex - 1);
            return allRefs.slice(start, start + batchSize);
        }
        
        function generatorSources(gen){
            return connections.filter(c => c.to === gen.id).map(c => nodes.find(n => n.id === c.from)).filter(Boolean).map(n => {
                if(n.type === 'output' && (n.images||[]).length){
                    const last = [...n.images].reverse().find(img => img && !img.startsWith('data:video'));
                    if(last) return {id:n.id, type:'outputImage', label:'上游输出', preview:last, refs:[{url:last, name:'output.png'}], prompt:''};
                }
                if(n.type === 'ps' && (n.psImages||[]).length){
                    console.log('[ComfyUI] PS node found with images:', n.psImages.length);
                    const lastImage = [...n.psImages].reverse().find(img => img && !img.startsWith('data:video'));
                    const lastMask = (n.psMasks || []).length > 0 ? (n.psMasks || []).slice(-1)[0] : null;
                    console.log('[ComfyUI] PS node lastImage:', lastImage, 'lastMask:', lastMask);
                    if(lastImage) return {id:n.id, type:'psImage', label:'PS输出', preview:lastImage, refs:[{url:lastImage, name:'ps-output.png', mask:lastMask}], prompt:''};
                }
                if(['generator','msgen','comfy'].includes(n.type)){
                    const generatedImages = (n.images || []).filter(url => url && !url.startsWith('data:video'));
                    if(generatedImages.length){
                        return generatedImages.map((url, i) => ({
                            id:`${n.id}:generated:${i}:${url}`,
                            type:'generatedImage',
                            label:`上游生成 ${i + 1}`,
                            preview:url,
                            refs:[{url, name:`generated-${i+1}.png`}],
                            prompt:''
                        }));
                    }
                }
                if(n.type === 'image' && n.url) return {id:n.id, type:'image', label:n.name || 'image', preview:n.url, refs:[{url:n.url, name:n.name || 'image', mask:n.mask}], prompt:''};
                if(n.type === 'group') {
                    const items = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean);
                    const sources = items.filter(x => x.type === 'image' && x.url).map(img => ({
                        id:`${n.id}:${img.id}`,
                        type:'groupImage',
                        groupId:n.id,
                        imageId:img.id,
                        label:img.name || 'image',
                        preview:img.url,
                        refs:[{url:img.url, name:img.name || 'image', mask:img.mask}],
                        prompt:''
                    }));
                    const prompts = items.filter(x => x.type === 'prompt').map(p => p.text || '').filter(Boolean);
                    if(prompts.length){
                        const combined = prompts.join('\n\n');
                        sources.push({
                            id:`${n.id}:prompts`,
                            type:'groupPrompt',
                            groupId:n.id,
                            label:combined.slice(0, 32),
                            refs:[],
                            prompt:combined
                        });
                    }
                    return sources;
                }
                if(n.type === 'prompt') return {id:n.id, type:'prompt', label:(n.text || '提示词').slice(0, 32), refs:[], prompt:n.text || ''};
                if(n.type === 'loop') {
                    const prompt = n.variablePrompt || '';
                    const count = n.count || 3;
                    const refs = loopInputImageRefs(n);
                    if(refs.length){
                        return refs.map((ref, i) => ({
                            id:`${n.id}:image:${i}:${ref.url}`,
                            type:'loopImage',
                            label:`循环图片 ${i + 1}`,
                            preview:ref.url,
                            refs:[ref],
                            prompt:i === 0 ? prompt : ''
                        }));
                    }
                    return {id:n.id, type:'loop', label:`循环 ${count}x`, refs:[], prompt};
                }
                if(n.type === 'promptGroup') {
                    const prompts = (n.items || []).map(id => nodes.find(x => x.id === id)).filter(Boolean).map(p => p.text || '').filter(Boolean);
                    return {id:n.id, type:'promptGroup', label:`提示词 ${prompts.length} 个`, refs:[], prompt:prompts.join('\n\n')};
                }
                if(n.type === 'llm' && (n.mode || 'node') === 'node' && n.outputText) return {id:n.id, type:'llm', label:(n.outputText || 'LLM').slice(0, 32), refs:[], prompt:n.outputText || ''};
                return null;
            }).flat().filter(Boolean);
        }
        function orderedSources(gen, sources){
            gen.inputs = (gen.inputs || []).filter(id => sources.some(s => s.id === id));
            sources.forEach(s => { if(!gen.inputs.includes(s.id)) gen.inputs.push(s.id); });
            return gen.inputs.map(id => sources.find(s => s.id === id)).filter(Boolean);
        }
        function reorderInput(gen, movedId, targetId){
            if(!movedId || movedId === targetId) return;
            const sources = generatorSources(gen);
            const imageIds = sources.filter(s => s.refs?.length).map(s => s.id);
            if(!imageIds.includes(movedId) || !imageIds.includes(targetId)) return;
            const promptIds = (gen.inputs || []).filter(id => !imageIds.includes(id));
            const ids = (gen.inputs || []).filter(id => imageIds.includes(id));
            const from = ids.indexOf(movedId), to = ids.indexOf(targetId);
            if(from < 0 || to < 0) return;
            ids.splice(to, 0, ids.splice(from, 1)[0]);
            gen.inputs = [...ids, ...promptIds];
            render();
            scheduleSave();
        }
        function syncGeneratorInputs(){
            nodes.filter(n => ['generator','comfy','msgen','video','loop'].includes(n.type)).forEach(gen => orderedSources(gen, generatorSources(gen)));
        }
        function refreshGeneratorInputViews(){
            nodes.filter(n => ['generator','comfy','msgen'].includes(n.type)).forEach(gen => {
                const el = nodesEl.querySelector(`.node[data-id="${gen.id}"]`);
                if(!el) return;
                const sources = orderedSources(gen, generatorSources(gen));
                renderPromptPreview(el.querySelector('.prompt-list'), sources.filter(src => src.prompt && !src.refs?.length));
            });
        }
        function modelManagerLabel(kind){
            return kind === 'chat'
                ? { title:'管理 LLM 模型', sub:'这些模型会出现在 LLM 节点下拉框里。拖动排序，删除或新增后保存。' }
                : { title:'管理生成模型', sub:'这些模型会出现在生成卡片下拉框里。拖动排序，删除或新增后保存。' };
        }
        function renderModelManagerList(){
            if(!managedModelsDraft.length){
                modelManagerList.innerHTML = '<div class="model-empty">暂无模型，输入名称后添加</div>';
                refreshIcons();
                return;
            }
            modelManagerList.innerHTML = managedModelsDraft.map((model, index) => `
                <div class="model-row" draggable="true" data-index="${index}">
                    <div class="model-drag" title="拖动排序"><i data-lucide="grip-vertical" class="w-4 h-4"></i></div>
                    <div class="model-name" title="${escapeHtml(model)}">${escapeHtml(model)}</div>
                    <button class="model-delete" type="button" title="删除" aria-label="删除模型"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            `).join('');
            modelManagerList.querySelectorAll('.model-row').forEach(row => {
                row.ondragstart = e => {
                    managedDragIndex = Number(row.dataset.index);
                    row.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                };
                row.ondragend = () => row.classList.remove('dragging');
                row.ondragover = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
                row.ondrop = e => {
                    e.preventDefault();
                    const targetIndex = Number(row.dataset.index);
                    if(managedDragIndex === null || managedDragIndex === targetIndex) return;
                    const [moved] = managedModelsDraft.splice(managedDragIndex, 1);
                    managedModelsDraft.splice(targetIndex, 0, moved);
                    managedDragIndex = null;
                    renderModelManagerList();
                };
                row.querySelector('.model-delete').onclick = e => {
                    e.stopPropagation();
                    managedModelsDraft.splice(Number(row.dataset.index), 1);
                    renderModelManagerList();
                };
            });
            refreshIcons();
        }
        function addManagedModel(){
            const value = modelManagerNewInput.value.trim();
            if(!value) return;
            managedModelsDraft = uniqueModels([...managedModelsDraft, value]);
            modelManagerNewInput.value = '';
            renderModelManagerList();
            modelManagerNewInput.focus();
        }
        function openModelManager(kind='image'){
            managedModelKind = kind;
            managedModelsDraft = [...(kind === 'chat' ? allChatModels() : allImageModels())];
            const label = modelManagerLabel(kind);
            modelManagerTitle.textContent = label.title;
            modelManagerSub.textContent = label.sub;
            modelManagerNewInput.value = '';
            renderModelManagerList();
            modelModal.classList.add('open');
            modelManagerNewInput.focus();
            refreshIcons();
        }
        function closeModelManager(){
            modelModal.classList.remove('open');
        }
        function saveModelManager(){
            managedModelsDraft = uniqueModels(managedModelsDraft);
            if(managedModelKind === 'chat'){
                localChatModels = [...managedModelsDraft];
                hasManagedChatModels = true;
                localStorage.setItem(MANAGED_CHAT_MODELS_KEY, JSON.stringify(localChatModels));
            } else {
                localImageModels = [...managedModelsDraft];
                hasManagedImageModels = true;
                localStorage.setItem(MANAGED_IMAGE_MODELS_KEY, JSON.stringify(localImageModels));
            }
            closeModelManager();
            render();
            scheduleSave();
        }
        function refreshRunNodes(node, out){
            render();
        }
        async function createCanvasImageTask(payload){
            const res = await fetch('/api/canvas-image-tasks', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body:JSON.stringify(payload)
            });
            if(!res.ok) throw new Error(((await res.json())?.detail) || '创建画布生图任务失败');
            return res.json();
        }
        function findPendingTask(taskId){
            for(const n of nodes){
                if(n.type !== 'output') continue;
                const p = (n._pending || []).find(item => item.canvasTaskId === taskId);
                if(p) return {out: n, pending: p};
            }
            return null;
        }
        const activeCanvasTaskPolls = new Set();
        async function pollCanvasImageTask(taskId){
            if(!taskId) return 'failed';
            if(activeCanvasTaskPolls.has(taskId)) return 'running';
            activeCanvasTaskPolls.add(taskId);
            try {
                while(true){
                    const res = await fetch(`/api/canvas-image-tasks/${encodeURIComponent(taskId)}`);
                    if(!res.ok) throw new Error(((await res.json())?.detail) || '查询画布生图任务失败');
                    const data = await res.json();
                    if(data.status === 'succeeded'){
                        completeCanvasImageTask(taskId, data.result || {});
                        return 'succeeded';
                    }
                    if(data.status === 'failed'){
                        const found = findPendingTask(taskId);
                        if(found) found.out._pending = (found.out._pending || []).filter(p => p.canvasTaskId !== taskId);
                        return 'failed';
                    }
                    await new Promise(resolve => setTimeout(resolve, 1800));
                }
            } catch(err) {
                const found = findPendingTask(taskId);
                if(found) found.out._pending = (found.out._pending || []).filter(p => p.canvasTaskId !== taskId);
                return 'failed';
            } finally {
                activeCanvasTaskPolls.delete(taskId);
            }
        }
        function completeCanvasImageTask(taskId, result){
            const found = findPendingTask(taskId);
            if(!found) return;
            const {out, pending} = found;
            const images = result.images || [];
            out._pending = (out._pending || []).filter(p => p.id !== pending.id);
            if(images.length && window.outputNode) window.outputNode.appendImage(out, images, null);
        }
        async function runGenerator(genId, opts={}){
            const cascade = opts.cascade || false;
            const gen = nodes.find(n => n.id === genId);
            if(!gen || (gen.running && !cascade)) return;
            const sources = orderedSources(gen, generatorSources(gen));
            const prompt = sources.map(s => s.prompt).filter(Boolean).join('\n\n');
            const refs = sources.flatMap(s => s.refs || []);
            if(!prompt && !refs.length){ if(!cascade) alert('请先连接提示词或图片'); return; }
            const count = Math.max(1, Math.min(8, Number(gen.count || 1)));
            let out = connections.filter(c => c.from === gen.id).map(c => nodes.find(n => n.id === c.to)).find(n => n?.type === 'output');
            if(!out && !cascade) {
                out = {id:uid('out'), type:'output', x:gen.x + 460, y:gen.y, images:[]};
                nodes.push(out);
                connections.push({id:uid('c'), from:gen.id, to:out.id});
            }
            if(!out && cascade) return;

            const model = resolveImageModel(gen.model);
            const payload = { prompt: prompt || 'Edit the reference images.', provider_id:resolveImageProviderId(gen.apiProvider || ''), model, size:apiImageSize(gen.ratio ?? 'square', gen.resolution || '1k', gen.customRatio || '', gen.customSize || ''), protocol:String(model || '').toLowerCase().includes('gemini') ? 'gemini' : 'openai', reference_images:refs };
            const quality = gen.quality;
            if(quality && ['auto','low','medium','high'].includes(quality)) payload.quality = quality;
            if(!cascade){ gen.running = true; }
            try {
                const taskInfos = await Promise.all(Array.from({length:count}, () => createCanvasImageTask(payload)));
                const pendingIds = taskInfos.map(() => uid('p'));
                if(out) out._pending = [...(out._pending || []), ...taskInfos.map((task, index) => ({id:pendingIds[index], startedAt:Date.now(), canvasTaskId:task.task_id}))];
                refreshRunNodes(gen, out);
                scheduleSave();
                const statuses = await Promise.all(taskInfos.map(task => pollCanvasImageTask(task.task_id)));
                if(statuses.some(s => s === 'failed')) throw new Error('生成失败');
                gen.running = false;
                refreshRunNodes(gen, out);
                scheduleSave();
            } catch(err) {
                gen.runStatus = 'failed'; gen.runError = err.message || String(err);
                gen.running = false;
                refreshRunNodes(gen, out);
                scheduleSave();
                if(cascade) throw err;
                alert(err.message || '生成失败');
            }
        }
        async function uploadCanvasUrlToComfy(url){
            const blob = await fetch(url).then(r => {
                if(!r.ok) throw new Error('图片读取失败');
                return r.blob();
            });
            const filename = (url || '').split('/').pop()?.split('?')[0] || `canvas_${Date.now()}.png`;
            const form = new FormData();
            form.append('files', blob, filename);
            const data = await fetch('/api/upload', {method:'POST', body:form}).then(async r => {
                if(!r.ok) throw new Error((await r.json()).detail || '图片上传到 ComfyUI 失败');
                return r.json();
            });
            return data.files?.[0]?.comfy_name || filename;
        }
        function renderComfyBody(node) {
            const wrap = document.createElement('div');
            wrap.className = 'comfy-body';
            const inputSources = generatorSources(node);
            const ordered = orderedSources(node, inputSources);
            const imageInputs = ordered.filter(src => src.refs?.length);
            const promptInputs = ordered.filter(src => src.prompt && !src.refs?.length);
            const mode = node.mode || 'klein';
            
            const modeTabsHtml = Object.entries(ComfyUIRegistry)
                .map(([key, config]) => 
                    `<button type="button" data-mode="${key}" class="${mode === key ? 'active' : ''}">${config.label}</button>`
                ).join('');
            
            const isCustomWorkflow = mode === 'custom';
            
            wrap.innerHTML = `
                <div class="mode-tabs">
                    ${modeTabsHtml}
                    <button type="button" data-mode="custom" class="${mode === 'custom' ? 'active' : ''}">自定义</button>
                </div>
                <div class="comfy-content">
                    ${isCustomWorkflow ? `
                        <div class="comfy-workflow-select">
                            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">工作流</div>
                            <select class="workflow-select-input" data-field="workflowId">
                                <option value="">选择工作流...</option>
                            </select>
                        </div>
                        <div class="workflow-params-container"></div>
                    ` : `
                        <div class="comfy-images">
                            <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Images</div>
                            <div class="input-list mt-2"></div>
                        </div>
                    `}
                </div>
                <div class="comfy-controls">
                    <div class="gen-settings comfy-settings"></div>
                    <button class="comfy-run ${node.running ? 'running' : ''}" ${node.running ? 'disabled' : ''}><i data-lucide="zap" class="w-4 h-4"></i>${node.running ? '处理中' : (isCustomWorkflow ? 'Run Workflow' : 'Run ComfyUI')}</button>
                </div>
            `;
            
            wrap.querySelectorAll('[data-mode]').forEach(btn => {
                btn.onclick = e => {
                    e.stopPropagation();
                    node.mode = btn.dataset.mode;
                    render();
                    scheduleSave();
                };
            });
            
            if (isCustomWorkflow) {
                renderWorkflowSelect(wrap.querySelector('.workflow-select-input'), node);
                renderWorkflowParams(wrap.querySelector('.workflow-params-container'), node);
                loadWorkflowList(node, wrap);
            } else {
                renderComfyImages(wrap.querySelector('.input-list'), node, imageInputs);
                renderComfySettings(wrap.querySelector('.comfy-settings'), node);
            }
            
            wrap.querySelector('.comfy-run').onclick = e => { 
                e.stopPropagation(); 
                if (node.mode === 'custom') {
                    runCustomWorkflow(node.id);
                } else {
                    runComfyNode(node.id);
                }
            };
            
            const cascadeHtml = cascadeBtnHtml(node);
            if(cascadeHtml) {
                wrap.querySelector('.comfy-controls').insertAdjacentHTML('beforeend', cascadeHtml);
                bindCascadeButtons(wrap, node.id);
            }
            
            return wrap;
        }
        
        async function loadWorkflowList(node, wrap) {
            const select = wrap?.querySelector('.workflow-select-input') || document.querySelector(`[data-id="${node.id}"] .workflow-select-input`);
            if (!select) {
                return;
            }
            
            select.innerHTML = '<option value="">选择工作流...</option>';
            comfyWorkflows.forEach(wf => {
                const opt = document.createElement('option');
                opt.value = wf.name;
                opt.textContent = wf.title || wf.name.replace('.json', '');
                select.appendChild(opt);
            });
            
            if (node.workflowId && comfyWorkflows.some(w => w.name === node.workflowId)) {
                select.value = node.workflowId;
            }
        }
        
        async function ensureComfyWorkflow(name) {
            if (!name || !comfyWorkflows.some(w => w.name === name)) return null;
            if (comfyWorkflowCache[name]) return comfyWorkflowCache[name];
            
            try {
                const res = await fetch(`/api/workflows/${encodeURIComponent(name)}`);
                if (!res.ok) return null;
                const data = await res.json();
                comfyWorkflowCache[name] = data;
                return data;
            } catch (e) {
                console.error('加载工作流失败:', e);
                return null;
            }
        }
        
        function renderWorkflowSelect(select, node) {
            if (!select) return;
            
            select.onmousedown = e => e.stopPropagation();
            select.onclick = e => e.stopPropagation();
            
            select.onchange = async e => {
                e.stopPropagation();
                const workflowName = select.value;
                node.workflowId = workflowName;
                node.workflowName = workflowName;
                node.workflowParams = {};
                
                if (workflowName) {
                    await ensureComfyWorkflow(workflowName);
                    const wfData = comfyWorkflowCache[workflowName];
                    if (wfData) {
                        const config = wfData.config || { fields: [] };
                        config.fields.forEach(f => {
                            if (f.default !== undefined && f.default !== null) {
                                node.workflowParams[f.id] = f.default;
                            }
                        });
                    }
                    render();
                    scheduleSave();
                }
                
                render();
                scheduleSave();
            };
            
            if (node.workflowId) {
                select.value = node.workflowId;
            }
        }
        
        function renderWorkflowParams(container, node) {
            if (!container || !node.workflowId) {
                if (container) container.innerHTML = '';
                return;
            }
            
            async function renderParams() {
                await ensureComfyWorkflow(node.workflowId);
                const wfData = comfyWorkflowCache[node.workflowId];
                
                if (!wfData) {
                    container.innerHTML = '<div class="text-[11px] text-red-400 py-2">工作流加载失败</div>';
                    return;
                }
                
                const config = wfData.config || { fields: [] };
                const fields = config.fields || [];
                
                if (fields.length === 0) {
                    container.innerHTML = '<div class="text-[11px] text-gray-400 py-2">此工作流没有暴露参数</div>';
                    return;
                }
                
                container.innerHTML = fields.map(field => {
                    const value = node.workflowParams[field.id] ?? field.default ?? '';
                    const inputHtml = renderFieldInput(field, value);
                    return `
                        <div class="workflow-param-row">
                            <div class="workflow-param-label">${field.display_name || field.id}</div>
                            ${inputHtml}
                        </div>
                    `;
                }).join('');
                
                container.querySelectorAll('.workflow-param-input').forEach(input => {
                    input.onmousedown = e => e.stopPropagation();
                    input.onclick = e => e.stopPropagation();
                    input.onchange = e => updateWorkflowParam(node, input, e);
                    input.oninput = e => updateWorkflowParam(node, input, e);
                });
            }
            
            renderParams();
        }
        
        function renderFieldInput(field, value) {
            const fieldClass = 'workflow-param-input';
            const dataAttr = `data-field="${field.id}"`;
            const fieldType = field.type || field.control_type || 'text';
            
            if (fieldType === 'textarea' || field.type === 'long_text') {
                return `<textarea class="${fieldClass}" ${dataAttr} placeholder="${field.description || ''}">${escapeHtml(String(value))}</textarea>`;
            } else if (fieldType === 'number' || field.type === 'int' || field.type === 'float') {
                const step = field.type === 'float' ? '0.01' : '1';
                return `<input type="number" class="${fieldClass}" ${dataAttr} step="${step}" value="${escapeHtml(String(value))}" placeholder="${field.description || ''}">`;
            } else if (fieldType === 'dropdown' || field.type === 'select') {
                const options = field.options || field.choices || [];
                const optionsHtml = options.map(opt => {
                    const optValue = typeof opt === 'object' ? opt.value : opt;
                    const optLabel = typeof opt === 'object' ? opt.label : opt;
                    const selected = String(value) === String(optValue) ? 'selected' : '';
                    return `<option value="${escapeHtml(String(optValue))}" ${selected}>${escapeHtml(String(optLabel))}</option>`;
                }).join('');
                return `<select class="${fieldClass}" ${dataAttr}>${optionsHtml}</select>`;
            } else if (fieldType === 'boolean' || field.type === 'bool') {
                const checked = value ? 'checked' : '';
                return `<label class="setting-check ${checked ? 'active' : ''}" data-toggle-field="workflowParams.${field.id}"><span class="check-dot"></span>${field.display_name || field.id}</label>`;
            } else {
                return `<input type="text" class="${fieldClass}" ${dataAttr} value="${escapeHtml(String(value))}" placeholder="${field.description || ''}">`;
            }
        }
        
        function updateWorkflowParam(node, input, event) {
            event?.stopPropagation();
            const field = input.dataset.field;
            if (!field) return;
            
            if (input.type === 'checkbox') {
                node.workflowParams[field] = input.checked;
            } else if (input.type === 'number') {
                node.workflowParams[field] = Number(input.value) || 0;
            } else if (input.tagName === 'SELECT') {
                node.workflowParams[field] = input.value;
            } else if (input.tagName === 'TEXTAREA') {
                node.workflowParams[field] = input.value;
            } else {
                node.workflowParams[field] = input.value;
            }
            scheduleSave();
        }
        
        async function runCustomWorkflow(nodeId) {
            const node = nodes.find(n => n.id === nodeId);
            if (!node || node.running || !node.workflowId) {
                if (!node.workflowId) alert('请先选择工作流');
                return;
            }
            
            // 查找或创建 Output 节点
            let out = connections.filter(c => c.from === node.id)
                .map(c => nodes.find(n => n.id === c.to))
                .find(n => n?.type === 'output');
            if (!out) {
                out = { id: uid('out'), type: 'output', x: node.x + 480, y: node.y, images: [] };
                nodes.push(out);
                connections.push({ id: uid('c'), from: node.id, to: out.id });
            }
            
            node.running = true;
            render();
            
            try {
                // 加载工作流配置
                const wfData = comfyWorkflowCache[node.workflowId];
                if (!wfData) {
                    await ensureComfyWorkflow(node.workflowId);
                }
                const config = comfyWorkflowCache[node.workflowId]?.config || { title: node.workflowName, fields: [] };
                
                // 获取连接的图片输入
                const sources = orderedSources(node, generatorSources(node));
                const imageInputs = sources.filter(src => src.refs?.length);
                
                // 上传图片到 ComfyUI 并构建参数字典
                const params = { ...node.workflowParams };
                const imageFields = config.fields.filter(f => f.type === 'image');
                
                for (let i = 0; i < Math.min(imageFields.length, imageInputs.length); i++) {
                    const field = imageFields[i];
                    const imageInput = imageInputs[i];
                    
                    // 取第一张参考图
                    const ref = (imageInput.refs || [])[0];
                    if (ref && ref.url && field.node && field.input) {
                        // 上传图片到 ComfyUI
                        const comfyName = await uploadCanvasUrlToComfy(ref.url);
                        // 将图片文件名设置到字段参数
                        params[field.id] = comfyName;
                    }
                }
                
                // 添加 pending 状态以显示进度
                const pendingId = uid('p');
                out._pending = [...(out._pending || []), { id: pendingId, progress: 0, statusText: '准备中...', startedAt: Date.now() }];
                render();
                
                // 连接 WebSocket 监听进度
                let ws = null;
                let actualPromptId = null;
                
                try {
                    const wsUrl = `ws://127.0.0.1:8188/ws?clientId=${CLIENT_ID}`;
                    try {
                        ws = await new Promise((resolve, reject) => {
                            const socket = new WebSocket(wsUrl);
                            socket.onopen = () => resolve(socket);
                            socket.onerror = () => reject(new Error('WebSocket 连接失败'));
                            setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
                        });
                        
                        ws.onmessage = (event) => {
                            try {
                                if (typeof event.data !== 'string') return;
                                const message = JSON.parse(event.data);
                                
                                if (message.type === 'status' || message.type === 'crystools.monitor') return;
                                
                                const msgPromptId = message.data?.prompt_id;
                                if (!msgPromptId) return;
                                
                                if (!actualPromptId) {
                                    actualPromptId = msgPromptId;
                                }
                                
                                if (msgPromptId !== actualPromptId) return;
                                
                                const pendingItem = out._pending?.find(p => p.id === pendingId);
                                if (!pendingItem) return;
                                
                                if (message.type === 'progress') {
                                    const data = message.data;
                                    const percent = Math.round((data.value / data.max) * 100);
                                    pendingItem.progress = percent;
                                    pendingItem.statusText = `采样中 ${data.value}/${data.max}`;
                                    render();
                                } else if (message.type === 'executing') {
                                    const data = message.data;
                                    if (data.node === null) {
                                        pendingItem.progress = 100;
                                        pendingItem.statusText = '执行完成';
                                    } else {
                                        if (pendingItem.progress < 5) {
                                            pendingItem.progress = 5;
                                        }
                                        pendingItem.statusText = `节点 #${data.node}`;
                                    }
                                    render();
                                } else if (message.type === 'execution_start') {
                                    pendingItem.progress = 2;
                                    pendingItem.statusText = '开始执行...';
                                    render();
                                } else if (message.type === 'execution_cached') {
                                    pendingItem.statusText = '使用缓存...';
                                    render();
                                }
                            } catch (e) {
                                console.warn('WebSocket 消息处理错误:', e);
                            }
                        };
                    } catch (e) {
                        console.warn('WebSocket 连接失败，使用基本模式:', e.message);
                    }
                    
                    // 调用后端 API 执行工作流
                    const response = await fetch(`/api/workflows/${encodeURIComponent(node.workflowId)}/run`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fields: params,
                            config: config,
                            client_id: CLIENT_ID
                        })
                    });
                    
                    if (!response.ok) {
                        throw new Error((await response.json()).detail || '工作流执行失败');
                    }
                    
                    const data = await response.json();
                    
                    // 移除 pending 状态
                    out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                    
                    // 添加生成的图片
                    if (data.images && data.images.length) {
                        window.outputNode.appendImage(out, data.images, null);
                    }
                    
                    node.running = false;
                    render();
                    scheduleSave();
                } finally {
                    if (ws) {
                        try { ws.close(); } catch (e) {}
                    }
                }
            } catch (err) {
                // 移除 pending 状态
                out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                node.running = false;
                render();
                alert(`工作流执行失败: ${err.message}`);
            }
        }
        
        function renderComfyImages(list, node, imageInputs) {
            list.innerHTML = imageInputs.length ? '' : '<div class="text-[11px] text-gray-300 py-2">把图片或图片组连到这里</div>';
            imageInputs.forEach((src, i) => {
                const item = document.createElement('div');
                item.className = 'input-item';
                item.draggable = true;
                item.dataset.sourceId = src.id;
                item.innerHTML = `<span class="input-index">${i + 1}</span>${src.preview ? `<img src="${src.preview}">` : '<i data-lucide="text" class="w-6 h-6 text-slate-400"></i>'}<span class="input-label">图${i + 1}</span>`;
                item.ondragstart = e => {
                    e.stopPropagation();
                    internalDrag = true;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('application/x-canvas-input', src.id);
                };
                item.ondragend = () => { internalDrag = false; };
                item.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
                item.ondrop = e => {
                    e.preventDefault();
                    e.stopPropagation();
                    reorderInput(node, e.dataTransfer.getData('application/x-canvas-input'), src.id);
                    internalDrag = false;
                };
                list.appendChild(item);
            });
        }
        
        function renderComfySettings(container, node) {
            const mode = node.mode || 'klein';
            const modeConfig = ComfyUIRegistry[mode];
            
            if (modeConfig && modeConfig.settings) {
                container.innerHTML = modeConfig.settings(node);
            } else {
                container.innerHTML = '';
            }
            
            container.querySelectorAll('[data-toggle-field]').forEach(btn => {
                btn.onmousedown = e => e.stopPropagation();
                btn.onclick = e => {
                    e.stopPropagation();
                    const field = btn.dataset.toggleField;
                    node[field] = !node[field];
                    render();
                    scheduleSave();
                };
            });
            
            container.querySelectorAll('input, select').forEach(input => {
                input.onmousedown = e => e.stopPropagation();
                input.onclick = e => e.stopPropagation();
                if (input.classList.contains('model-select')) return;
                input.onchange = e => updateComfyField(node, input, e);
                input.oninput = e => updateComfyField(node, input, e);
            });
        }
        
        function updateComfyField(node, input, event) {
            event?.stopPropagation();
            const field = input.dataset.field;
            if (!field) return;
            
            if (input.type === 'checkbox') {
                node[field] = input.checked;
                if (field === 'enhanceUpscale') render();
            } else if (field === 'enhanceStrength') {
                node[field] = Number(input.value) || 0.5;
                const val = input.closest('.field')?.querySelector('.enhance-strength-val');
                if (val) val.textContent = node[field].toFixed(2);
            } else if (['width', 'height', 'enhanceUpscaleRes', 'editUpscaleRes', 'count', 'cgSize', 'cgSeed', 'kleinSize', 'kleinSeed', 'pgSeed'].includes(field)) {
                node[field] = Number(input.value) || 0;
            } else if (input.tagName === 'SELECT') {
                node[field] = input.value;
            } else {
                node[field] = input.value;
            }
            scheduleSave();
        }
        
        function runCascadeNodeByType(node, opts={}){
            const runOpts = {cascade:true, ...opts};
            if(node.type === 'generator') return runGenerator(node.id, runOpts);
            if(node.type === 'msgen') return runMsGenNode(node.id, runOpts);
            if(node.type === 'comfy') return runComfyNode(node.id, runOpts);
            if(node.type === 'llm') return runLLMNode(node.id);
            if(node.type === 'video') return runVideoNode(node.id, runOpts);
            return Promise.resolve();
        }
        
        async function runLoopCascade(loopId) {
            const loopNode = nodes.find(n => n.id === loopId);
            if (!loopNode || loopNode.running) return;
            
            const count = loopNode.count || 3;
            const sources = generatorSources(loopNode);
            const imageSources = sources.filter(s => s.refs?.length);
            
            if (!imageSources.length && !loopNode.variablePrompt) {
                alert('请先连接图片或输入提示词');
                return;
            }
            
            const targetNode = findLoopCascadeTarget(loopId);
            if (!targetNode) {
                alert('未找到下游生成节点');
                return;
            }
            
            const target = nodes.find(n => n.id === targetNode);
            if (!target) return;
            
            loopNode.running = true;
            render();
            
            try {
                const allRefs = imageSources.flatMap(s => s.refs || []);
                const batchSize = loopNode.imageInput ? Math.max(1, Math.min(100, Number(loopNode.imageBatchSize) || 1)) : 1;
                const startIdx = Math.max(1, Number(loopNode.loopStart) || 1) - 1;
                
                for (let i = 0; i < count; i++) {
                    loopContext = { index: i + 1, total: count, nodeId: loopNode.id };
                    
                    const prompt = loopNode.variablePrompt 
                        ? loopNode.variablePrompt.replace(/《计数》/g, String(i + 1))
                        : '';
                    
                    const batchStart = startIdx + i * batchSize;
                    const batchRefs = allRefs.slice(batchStart, batchStart + batchSize);
                    
                    if (!batchRefs.length && !prompt) {
                        break;
                    }
                    
                    await runCascadeNodeByType(target, { cascade: true, loopContext, loopRefs: batchRefs, loopPrompt: prompt });
                }
            } catch (err) {
                alert(`循环执行失败: ${err.message}`);
            } finally {
                loopNode.running = false;
                loopContext = null;
                render();
                scheduleSave();
            }
        }
        
        function findLoopCascadeTarget(loopId) {
            const runTypes = ['generator', 'msgen', 'comfy', 'llm', 'video'];
            const seen = new Set();
            const candidates = [];
            
            const walk = (id, depth = 0) => {
                if (seen.has(id)) return;
                seen.add(id);
                connections.filter(c => c.from === id).forEach(c => {
                    const next = nodes.find(n => n.id === c.to);
                    if (!next) return;
                    if (runTypes.includes(next.type)) {
                        candidates.push({ id: next.id, depth: depth + 1 });
                    }
                    walk(next.id, depth + 1);
                });
            };
            
            walk(loopId);
            return candidates.sort((a, b) => b.depth - a.depth)[0]?.id || '';
        }
        
        async function runComfyNode(nodeId, opts={}) {
            const node = nodes.find(n => n.id === nodeId);
            if (!node || node.running) return;
            
            const cascade = opts.cascade || false;
            const loopRefs = opts.loopRefs || null;
            const loopPrompt = opts.loopPrompt || '';
            
            // 自动运行上游 PS 节点（如果有连接且 PS 节点没有图像）
            const upstreamPSNodes = connections.filter(c => c.to === nodeId)
                .map(c => nodes.find(n => n.id === c.from))
                .filter(n => n?.type === 'ps' && !(n.psImages || []).length);
            
            for (const psNode of upstreamPSNodes) {
                if (psNode && !psNode.running && window.psNodeModule) {
                    console.log('[ComfyUI] Auto-running upstream PS node:', psNode.id);
                    await window.psNodeModule.runPSNode(psNode.id, { cascade: true });
                }
            }
            
            const sources = orderedSources(node, generatorSources(node));
            console.log('[ComfyUI] Sources found:', sources.length, sources);
            const prompt = loopPrompt || sources.map(s => s.prompt).filter(Boolean).join('\n\n');
            const refs = loopRefs || sources.flatMap(s => s.refs || []);
            console.log('[ComfyUI] Refs found:', refs.length, refs);
            const mode = node.mode || 'klein';
            
            const modeConfig = ComfyUIRegistry[mode];
            if (!modeConfig) {
                alert('未知的 ComfyUI 模式');
                return;
            }
            if (modeConfig.requiresImage && !refs.length) {
                alert('请先连接图片');
                return;
            }
            
            let out = connections.filter(c => c.from === node.id)
                .map(c => nodes.find(n => n.id === c.to))
                .find(n => n?.type === 'output');
            if (!out && !cascade) {
                out = { id: uid('out'), type: 'output', x: node.x + 480, y: node.y, images: [] };
                nodes.push(out);
                connections.push({ id: uid('c'), from: node.id, to: out.id });
            }
            if (!out && cascade) {
                return;
            }
            
            if (!cascade) {
                node.running = true;
                render();
            }
            
            const startTime = Date.now();
            const run = {
                nodeType: 'comfy',
                node: node,
                prompt: prompt,
                refs: refs,
                taskLabel: modeConfig.label || mode || 'ComfyUI'
            };
            
            const allImages = [];
            let lastError = '';
            let lastPromptId = '';
            
            // 判断是否为多图模式（如风格迁移需要同时传入多张图片）
            const multiImageMode = modeConfig.maxImages && modeConfig.maxImages > 1;
            
            if (multiImageMode && refs.length > 0) {
                // 多图模式：一次性传入所有 refs
                const pendingId = uid('p');
                if (out) {
                    out._pending = [...(out._pending || []), { id: pendingId, progress: 0, statusText: '处理中...' }];
                }
                render();
                
                let ws = null;
                let actualPromptId = null;
                
                try {
                    const wsUrl = `ws://127.0.0.1:8188/ws?clientId=${CLIENT_ID}`;
                    try {
                        ws = await new Promise((resolve, reject) => {
                            const socket = new WebSocket(wsUrl);
                            socket.onopen = () => resolve(socket);
                            socket.onerror = () => reject(new Error('WebSocket 连接失败'));
                            setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
                        });
                        
                        ws.onmessage = (event) => {
                            try {
                                if (typeof event.data !== 'string') return;
                                const message = JSON.parse(event.data);
                                
                                if (message.type === 'status' || message.type === 'crystools.monitor') return;
                                
                                const msgPromptId = message.data?.prompt_id;
                                if (!msgPromptId) return;
                                
                                if (!actualPromptId) {
                                    actualPromptId = msgPromptId;
                                    lastPromptId = msgPromptId;
                                }
                                
                                if (msgPromptId !== actualPromptId) return;
                                
                                if (message.type === 'progress') {
                                    const data = message.data;
                                    const percent = Math.round((data.value / data.max) * 100);
                                    const pendingItem = out._pending?.find(p => p.id === pendingId);
                                    if (pendingItem) {
                                        pendingItem.progress = percent;
                                        pendingItem.statusText = `采样中 ${data.value}/${data.max}`;
                                        render();
                                    }
                                } else if (message.type === 'executing') {
                                    const data = message.data;
                                    const pendingItem = out._pending?.find(p => p.id === pendingId);
                                    if (pendingItem) {
                                        if (data.node === null) {
                                            pendingItem.progress = 100;
                                            pendingItem.statusText = '执行完成';
                                        } else {
                                            if (pendingItem.progress < 5) {
                                                pendingItem.progress = 5;
                                            }
                                            pendingItem.statusText = `节点 #${data.node}`;
                                        }
                                        render();
                                    }
                                } else if (message.type === 'execution_start') {
                                    const pendingItem = out._pending?.find(p => p.id === pendingId);
                                    if (pendingItem) {
                                        pendingItem.progress = 2;
                                        pendingItem.statusText = '开始执行...';
                                        render();
                                    }
                                } else if (message.type === 'execution_cached') {
                                    const pendingItem = out._pending?.find(p => p.id === pendingId);
                                    if (pendingItem) {
                                        pendingItem.statusText = '使用缓存...';
                                        render();
                                    }
                                }
                            } catch (e) {
                                console.warn('WebSocket 消息处理错误:', e);
                            }
                        };
                    } catch (e) {
                        console.warn('WebSocket 连接失败，使用基本模式:', e.message);
                    }
                    
                    const result = await modeConfig.execute(node, refs, prompt, actualPromptId);
                    
                    if (out) {
                        out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                        
                        if (result.images && result.images.length) {
                            allImages.push(...result.images);
                            window.outputNode.appendImage(out, result.images);
                        }
                        
                        if (result.text && mode === 'promptgen') {
                            out.textOutputs = [...(out.textOutputs || []), {
                                text: result.text,
                                preset: node.pgPreset || '',
                                timestamp: Date.now()
                            }];
                        }
                    }
                    
                    render();
                    scheduleSave();
                } catch (err) {
                    lastError = err.message || 'ComfyUI 执行失败';
                    if (out) {
                        out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                    }
                    render();
                    if (!cascade) {
                        alert(`处理失败: ${err.message}`);
                    }
                } finally {
                    if (ws) {
                        try { ws.close(); } catch (e) {}
                    }
                }
            } else {
                // 单图模式：逐张处理
                for (let i = 0; i < refs.length; i++) {
                    const ref = refs[i];
                    const pendingId = uid('p');
                    if (out) {
                        out._pending = [...(out._pending || []), { id: pendingId, progress: 0, statusText: `处理 ${i+1}/${refs.length}...` }];
                    }
                    render();
                    
                    let ws = null;
                    let actualPromptId = null;
                    
                    try {
                        const wsUrl = `ws://127.0.0.1:8188/ws?clientId=${CLIENT_ID}`;
                        try {
                            ws = await new Promise((resolve, reject) => {
                                const socket = new WebSocket(wsUrl);
                                socket.onopen = () => resolve(socket);
                                socket.onerror = () => reject(new Error('WebSocket 连接失败'));
                                setTimeout(() => reject(new Error('WebSocket 连接超时')), 5000);
                            });
                            
                            ws.onmessage = (event) => {
                                try {
                                    if (typeof event.data !== 'string') return;
                                    const message = JSON.parse(event.data);
                                    
                                    if (message.type === 'status' || message.type === 'crystools.monitor') return;
                                    
                                    const msgPromptId = message.data?.prompt_id;
                                    if (!msgPromptId) return;
                                    
                                    if (!actualPromptId) {
                                        actualPromptId = msgPromptId;
                                        lastPromptId = msgPromptId;
                                    }
                                    
                                    if (msgPromptId !== actualPromptId) return;
                                    
                                    if (message.type === 'progress') {
                                        const data = message.data;
                                        const percent = Math.round((data.value / data.max) * 100);
                                        const pendingItem = out._pending?.find(p => p.id === pendingId);
                                        if (pendingItem) {
                                            pendingItem.progress = percent;
                                            pendingItem.statusText = `采样中 ${data.value}/${data.max}`;
                                            render();
                                        }
                                    } else if (message.type === 'executing') {
                                        const data = message.data;
                                        const pendingItem = out._pending?.find(p => p.id === pendingId);
                                        if (pendingItem) {
                                            if (data.node === null) {
                                                pendingItem.progress = 100;
                                                pendingItem.statusText = '执行完成';
                                            } else {
                                                if (pendingItem.progress < 5) {
                                                    pendingItem.progress = 5;
                                                }
                                                pendingItem.statusText = `节点 #${data.node}`;
                                            }
                                            render();
                                        }
                                    } else if (message.type === 'execution_start') {
                                        const pendingItem = out._pending?.find(p => p.id === pendingId);
                                        if (pendingItem) {
                                            pendingItem.progress = 2;
                                            pendingItem.statusText = '开始执行...';
                                            render();
                                        }
                                    } else if (message.type === 'execution_cached') {
                                        const pendingItem = out._pending?.find(p => p.id === pendingId);
                                        if (pendingItem) {
                                            pendingItem.statusText = '使用缓存...';
                                            render();
                                        }
                                    }
                                } catch (e) {
                                    console.warn('WebSocket 消息处理错误:', e);
                                }
                            };
                        } catch (e) {
                            console.warn('WebSocket 连接失败，使用基本模式:', e.message);
                        }
                        
                        const singleRef = [ref];
                        const result = await modeConfig.execute(node, singleRef, prompt, actualPromptId);
                        
                        if (out) {
                            out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                            
                            if (result.images && result.images.length) {
                                allImages.push(...result.images);
                                window.outputNode.appendImage(out, result.images, ref);
                            }
                            
                            if (result.text && mode === 'promptgen') {
                                out.textOutputs = [...(out.textOutputs || []), {
                                    text: result.text,
                                    preset: node.pgPreset || '',
                                    timestamp: Date.now()
                                }];
                            }
                        }
                        
                        render();
                        scheduleSave();
                    } catch (err) {
                        lastError = err.message || 'ComfyUI 执行失败';
                        if (out) {
                            out._pending = (out._pending || []).filter(p => p.id !== pendingId);
                        }
                        render();
                        if (!cascade) {
                            alert(`第 ${i+1} 张图片处理失败: ${err.message}`);
                        }
                        break;
                    } finally {
                        if (ws) {
                            try { ws.close(); } catch (e) {}
                        }
                    }
                }
            }
            
            const runMs = Date.now() - startTime;
            run.request = {
                prompt_id: lastPromptId,
                backend: 'ComfyUI',
                workflow_json: modeConfig.label || mode || ''
            };
            
            if (lastError) {
                window.addGenerationLog({run, outputs: [], runMs, error: lastError});
            } else if (allImages.length > 0) {
                window.addGenerationLog({run, outputs: allImages, runMs});
            }
            
            if (!cascade) {
                node.running = false;
                render();
            }
        }
        
        async function callCanvasLLM(node, message, messages=[]){
            const llmProv = node.llmProvider || 'comfly';
            const msModel = node.llmMsModel || (msChatModels[0] || '');
            const result = await fetch('/api/canvas-llm', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                    message,
                    model: llmProv === 'modelscope' ? msModel : resolveChatModel(node.model),
                    ms_model: llmProv === 'modelscope' ? msModel : '',
                    provider: llmProv,
                    system_prompt:node.systemPrompt || 'You are a helpful assistant.',
                    messages
                })
            }).then(async r => { if(!r.ok) throw new Error((await r.json()).detail || 'LLM 运行失败'); return r.json(); });
            return result.text || '';
        }
        async function runLLMNode(nodeId){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.running) return;
            const input = llmInputText(node) || node.userInput || '';
            if(!input){ alert('请先连接 Prompt 或直接输入文本'); return; }
            node.running = true;
            render();
            try {
                node.outputText = await callCanvasLLM(node, input, []);
                node.running = false;
                render();
                scheduleSave();
            } catch(err) {
                node.running = false;
                render();
                alert(err.message || 'LLM 运行失败');
            }
        }
        async function runLLMChat(nodeId){
            const node = nodes.find(n => n.id === nodeId);
            if(!node || node.running) return;
            const message = (node.chatInput || '').trim();
            if(!message) return;
            node.messages = node.messages || [];
            const history = node.messages.slice();
            node.messages.push({role:'user', content:message});
            node.chatInput = '';
            node.running = true;
            render();
            try {
                const text = await callCanvasLLM(node, message, history);
                node.messages.push({role:'assistant', content:text});
                node.outputText = text;
                node.running = false;
                render();
                scheduleSave();
            } catch(err) {
                node.running = false;
                render();
                alert(err.message || 'LLM 运行失败');
            }
        }

        function deleteNode(id, event){
            event.stopPropagation();
            nodes = nodes.filter(n => n.id !== id);
            connections = connections.filter(c => c.from !== id && c.to !== id);
            selected.delete(id);
            render();
            scheduleSave();
        }
        function deleteConnection(id, event){
            event?.preventDefault();
            event?.stopPropagation();
            connections = connections.filter(c => c.id !== id);
            syncGeneratorInputs();
            render();
            scheduleSave();
        }
        function groupSelectedImages(){
            if(!ensureCanvas()) return;
            const targets = [...selected].map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' || n?.type === 'prompt');
            let group;
            if(targets.length){
                const box = nodeBounds(targets.map(n => n.id));
                group = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:targets.map(n => n.id)};
            } else {
                const p = defaultPoint(0, 0);
                group = {id:uid('grp'), type:'group', x:p.x, y:p.y, w:300, h:220, items:[]};
            }
            nodes.push(group);
            selected.clear();
            selected.add(group.id);
            render();
            scheduleSave();
        }
        function nodeBounds(ids){
            const rects = ids.map(id => {
                const n = nodes.find(item => item.id === id);
                const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
                if(!n) return null;
                return {x:n.x, y:n.y, w:el?.offsetWidth || n.w || 260, h:el?.offsetHeight || n.h || 220};
            }).filter(Boolean);
            const x1 = Math.min(...rects.map(r => r.x));
            const y1 = Math.min(...rects.map(r => r.y));
            const x2 = Math.max(...rects.map(r => r.x + r.w));
            const y2 = Math.max(...rects.map(r => r.y + r.h));
            return {x:x1, y:y1, w:x2 - x1, h:y2 - y1};
        }

        function startSelection(e){
            selectDrag = {sx:e.clientX, sy:e.clientY, x:e.clientX, y:e.clientY};
            selectionBox.style.display = 'block';
            updateSelectionBox(e.clientX, e.clientY);
            window.onmousemove = e2 => updateSelectionBox(e2.clientX, e2.clientY);
            window.onmouseup = finishSelection;
        }
        function updateSelectionBox(x, y){
            if(!selectDrag) return;
            selectDrag.x = x; selectDrag.y = y;
            const left = Math.min(selectDrag.sx, x);
            const top = Math.min(selectDrag.sy, y);
            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${Math.abs(x - selectDrag.sx)}px`;
            selectionBox.style.height = `${Math.abs(y - selectDrag.sy)}px`;
        }
        function finishSelection(){
            if(!selectDrag) return;
            const rect = selectionBox.getBoundingClientRect();
            selectionBox.style.display = 'none';
            selected.clear();
            nodesEl.querySelectorAll('.node').forEach(el => {
                const r = el.getBoundingClientRect();
                const overlaps = r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top;
                if(overlaps) selected.add(el.dataset.id);
            });
            selectDrag = null;
            window.onmousemove = null;
            window.onmouseup = null;
            render();
        }
        function renderSelectionHub(){
            selectionHub.innerHTML = '';
            selectionHub.classList.remove('open');
        }
        function startSelectionLink(e, kind){
            e.preventDefault();
            e.stopPropagation();
            const p = screenToWorld(e.clientX, e.clientY);
            tempLink = {from:`selection:${kind}`, x1:p.x, y1:p.y, x2:p.x, y2:p.y};
            window.onmousemove = e2 => { const next = screenToWorld(e2.clientX, e2.clientY); tempLink.x2 = next.x; tempLink.y2 = next.y; renderLinks(); };
            window.onmouseup = e2 => {
                const targetPort = nearestPort(e2.clientX, e2.clientY, 'in');
                const target = targetPort?.closest('.generator-node');
                if(target) connectSelectionToGenerator(kind, target.dataset.id);
                tempLink = null;
                window.onmousemove = null;
                window.onmouseup = null;
                render();
                scheduleSave();
            };
        }
        function connectSelectionToGenerator(kind, genId){
            const ids = [...selected];
            let source = null;
            if(kind === 'images'){
                const imgs = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'image' && n.url);
                if(!imgs.length) return;
                const box = nodeBounds(imgs.map(n => n.id));
                source = {id:uid('grp'), type:'group', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:imgs.map(n => n.id)};
            } else {
                const prompts = ids.map(id => nodes.find(n => n.id === id)).filter(n => n?.type === 'prompt');
                if(!prompts.length) return;
                const box = nodeBounds(prompts.map(n => n.id));
                source = {id:uid('pg'), type:'promptGroup', x:box.x - 24, y:box.y - 58, w:box.w + 48, h:box.h + 90, items:prompts.map(n => n.id)};
            }
            nodes.push(source);
            connections.push({id:uid('c'), from:source.id, to:genId});
            selected.clear();
            selected.add(source.id);
            syncGeneratorInputs();
        }

        function cloneNode(n, dx, dy){
            const copy = JSON.parse(JSON.stringify(n));
            copy.id = uid(n.type);
            copy.x = n.x + dx;
            copy.y = n.y + dy;
            copy.running = false;
            return copy;
        }
        function copySelectedNodes(dx=20, dy=20){
            if(!window.canvas || !selected.size) return;
            const el = document.activeElement;
            if(el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
            const toCopy = [...selected].map(id => nodes.find(n => n.id === id)).filter(Boolean);
            if(!toCopy.length) return;
            const idMap = new Map();
            const copies = toCopy.map(n => { const c = cloneNode(n, dx, dy); idMap.set(n.id, c.id); return c; });
            copies.forEach(c => {
                if((c.type === 'group' || c.type === 'promptGroup') && c.items)
                    c.items = c.items.map(id => idMap.get(id) || id);
            });
            nodes.push(...copies);
            selected.clear();
            copies.forEach(c => selected.add(c.id));
            render();
            scheduleSave();
        }
        function startNodeDrag(e, node){
            e.preventDefault();
            e.stopPropagation();
            let dragTarget = node;
            if(e.altKey){
                const copy = cloneNode(node, 0, 0);
                const isGroup = node.type === 'group' || node.type === 'promptGroup';
                if(isGroup && node.items?.length){
                    const idMap = new Map();
                    const childCopies = node.items
                        .map(id => nodes.find(n => n.id === id)).filter(Boolean)
                        .map(child => { const cc = cloneNode(child, 0, 0); idMap.set(child.id, cc.id); return cc; });
                    copy.items = copy.items.map(id => idMap.get(id) || id);
                    nodes.push(...childCopies, copy);
                } else {
                    nodes.push(copy);
                }
                selected.clear();
                selected.add(copy.id);
                dragTarget = copy;
                render();
            }
            const isGroup = dragTarget.type === 'group' || dragTarget.type === 'promptGroup';
            const collected = new Map();
            const collect = n => {
                if(!n || collected.has(n.id) || n.id === dragTarget.id) return;
                collected.set(n.id, {node:n, ox:n.x, oy:n.y});
                if(n.type === 'group' || n.type === 'promptGroup'){
                    (n.items || []).map(id => nodes.find(x => x.id === id)).forEach(collect);
                }
            };
            if(isGroup){
                (dragTarget.items || []).map(id => nodes.find(n => n.id === id)).forEach(collect);
            }
            // 如果被拖节点在多选里，所有其他选中节点（含其组成员）一起移动
            if(selected.has(dragTarget.id) && selected.size > 1){
                [...selected].forEach(id => collect(nodes.find(n => n.id === id)));
            }
            const children = [...collected.values()];
            dragNode = {node: dragTarget, children, sx:e.clientX, sy:e.clientY, ox:dragTarget.x, oy:dragTarget.y};
            window.onmousemove = onNodeDrag;
            window.onmouseup = endDrag;
        }
        function onNodeDrag(e){
            if(!dragNode) return;
            const dx = (e.clientX - dragNode.sx) / viewport.scale;
            const dy = (e.clientY - dragNode.sy) / viewport.scale;
            dragNode.node.x = dragNode.ox + dx;
            dragNode.node.y = dragNode.oy + dy;
            const el = nodesEl.querySelector(`.node[data-id="${dragNode.node.id}"]`);
            if(el){
                el.style.left = `${dragNode.node.x}px`;
                el.style.top = `${dragNode.node.y}px`;
            }
            (dragNode.children || []).forEach(childDrag => {
                childDrag.node.x = childDrag.ox + dx;
                childDrag.node.y = childDrag.oy + dy;
                const childEl = nodesEl.querySelector(`.node[data-id="${childDrag.node.id}"]`);
                if(childEl){
                    childEl.style.left = `${childDrag.node.x}px`;
                    childEl.style.top = `${childDrag.node.y}px`;
                }
            });
            renderLinks();
            renderSelectionHub();
        }
        function startNodeResize(e, node){
            e.preventDefault();
            e.stopPropagation();
            const el = nodesEl.querySelector(`.node[data-id="${node.id}"]`);
            const rect = el?.getBoundingClientRect();
            resizeNode = {
                node,
                sx:e.clientX,
                sy:e.clientY,
                sw:(rect?.width ? rect.width / viewport.scale : node.w || defaultNodeSize(node.type).w),
                sh:(rect?.height ? rect.height / viewport.scale : node.h || defaultNodeSize(node.type).h || 160)
            };
            window.onmousemove = onNodeResize;
            window.onmouseup = endDrag;
        }
        function onNodeResize(e){
            if(!resizeNode) return;
            const min = defaultNodeSize(resizeNode.node.type);
            const nextW = Math.max(Math.min(min.w, 220), resizeNode.sw + (e.clientX - resizeNode.sx) / viewport.scale);
            const nextH = Math.max(96, resizeNode.sh + (e.clientY - resizeNode.sy) / viewport.scale);
            resizeNode.node.w = Math.round(nextW);
            resizeNode.node.h = Math.round(nextH);
            const el = nodesEl.querySelector(`.node[data-id="${resizeNode.node.id}"]`);
            if(el){
                el.classList.add('sized');
                el.style.width = `${resizeNode.node.w}px`;
                el.style.height = `${resizeNode.node.h}px`;
            }
            renderLinks();
            renderSelectionHub();
        }
        function startLink(e, originId, originKind){
            e.stopPropagation();
            originKind = originKind || 'out';
            const src = portPoint(originId, originKind);
            tempLink = {from:originId, originKind, x1:src.x, y1:src.y, x2:src.x, y2:src.y};
            window.onmousemove = e2 => { const p = screenToWorld(e2.clientX, e2.clientY); tempLink.x2 = p.x; tempLink.y2 = p.y; renderLinks(); };
            window.onmouseup = e2 => {
                const targetKind = originKind === 'out' ? 'in' : 'out';
                const targetPort = nearestPort(e2.clientX, e2.clientY, targetKind);
                const target = targetPort?.closest('.node');
                if(target){
                    const targetId = target.dataset.id;
                    const fromId = originKind === 'out' ? originId : targetId;
                    const toId = originKind === 'out' ? targetId : originId;
                    if(canConnect(fromId, toId)){
                        if(!connections.some(c => c.from === fromId && c.to === toId)) connections.push({id:uid('c'), from:fromId, to:toId});
                        syncGeneratorInputs();
                        scheduleSave();
                        render();
                    }
                }
                tempLink = null;
                window.onmousemove = null;
                window.onmouseup = null;
                renderLinks();
            };
        }
        function nearestPort(clientX, clientY, kind){
            const selector = `.port.${kind}`;
            const direct = document.elementFromPoint(clientX, clientY)?.closest(selector);
            if(direct) return direct;
            let best = null;
            let bestDistance = Infinity;
            nodesEl.querySelectorAll(selector).forEach(port => {
                const r = port.getBoundingClientRect();
                const cx = r.left + r.width / 2;
                const cy = r.top + r.height / 2;
                const d = Math.hypot(clientX - cx, clientY - cy);
                if(d < bestDistance){
                    bestDistance = d;
                    best = port;
                }
            });
            return bestDistance <= 48 ? best : null;
        }
        function canConnect(fromId, toId){
            if(!fromId || !toId || fromId === toId) return false;
            const from = nodes.find(n => n.id === fromId);
            const to = nodes.find(n => n.id === toId);
            if(!from || !to) return false;
            const GENERATOR_TYPES = ['generator','comfy','msgen','video'];
            const IMAGE_OUTPUT_TYPES = ['generator','msgen','comfy'];
            if(GENERATOR_TYPES.includes(from.type)){
                if(to.type === 'output') return true;
                if(IMAGE_OUTPUT_TYPES.includes(from.type) && GENERATOR_TYPES.includes(to.type)){
                    return true;
                }
                return false;
            }
            if(to.type === 'loop') return Boolean(to.imageInput) && ['image','group','output'].includes(from.type);
            if(to.type === 'llm') return ['prompt','loop','promptGroup','llm','image','group','output'].includes(from.type);
            if(from.type === 'llm') return GENERATOR_TYPES.includes(to.type);
            if(from.type === 'loop') return GENERATOR_TYPES.includes(to.type);
            if(from.type === 'ps') return GENERATOR_TYPES.includes(to.type) || to.type === 'output';
            return GENERATOR_TYPES.includes(to.type) && ['image','prompt','loop','group','promptGroup','output','llm'].includes(from.type);
        }
        function sanitizeConnections(){
            connections = (connections || []).filter(c => canConnect(c.from, c.to));
        }
        function endDrag(){
            if(dragNode){
                const moved = [dragNode.node, ...(dragNode.children || []).map(c => c.node)].filter(Boolean);
                // 拖动 group/promptGroup 自身时不重新评估（成员跟着一起走，包含关系不变）
                const draggedGroup = moved.some(n => n.type === 'group' || n.type === 'promptGroup');
                if(!draggedGroup) updateGroupMembership(moved);
            }
            dragNode = null;
            dragBoard = null;
            resizeNode = null;
            llmPaneDrag = null;
            window.onmousemove = null;
            window.onmouseup = null;
            scheduleSave();
        }
        function nodeRect(n){
            const el = nodesEl.querySelector(`.node[data-id="${n.id}"]`);
            const w = el?.offsetWidth || n.w || 260;
            const h = el?.offsetHeight || n.h || 200;
            return {x:n.x, y:n.y, w, h, cx:n.x + w/2, cy:n.y + h/2};
        }
        function updateGroupMembership(movedNodes){
            const pairs = [
                {childType:'image', groupType:'group'},
                {childType:'prompt', groupType:'group'},
                {childType:'prompt', groupType:'promptGroup'}
            ];
            let changed = false;
            pairs.forEach(({childType, groupType}) => {
                const groups = nodes.filter(n => n.type === groupType);
                const children = movedNodes.filter(n => n?.type === childType);
                if(!children.length || !groups.length) return;
                children.forEach(child => {
                    const cr = nodeRect(child);
                    const containing = groups.find(g => {
                        const gr = nodeRect(g);
                        return cr.cx >= gr.x && cr.cx <= gr.x + gr.w && cr.cy >= gr.y && cr.cy <= gr.y + gr.h;
                    });
                    groups.forEach(g => {
                        if(g === containing) return;
                        const idx = (g.items || []).indexOf(child.id);
                        if(idx >= 0){ g.items.splice(idx, 1); changed = true; }
                    });
                    if(containing){
                        containing.items = containing.items || [];
                        if(!containing.items.includes(child.id)){ containing.items.push(child.id); changed = true; }
                    }
                });
            });
            if(changed) render();
        }

        function portPoint(id, kind){
            const n = nodes.find(x => x.id === id);
            const el = nodesEl.querySelector(`.node[data-id="${id}"]`);
            if(!n || !el) return {x:0,y:0};
            const port = el.querySelector(`.port.${kind}`);
            if(port){
                const r = port.getBoundingClientRect();
                return screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
            }
            const w = el.offsetWidth || n.w || 260, h = el.offsetHeight || n.h || 160;
            return kind === 'out' ? {x:n.x + w, y:n.y + h / 2} : {x:n.x, y:n.y + h / 2};
        }
        function renderLinks(){
            linksEl.innerHTML = '';
            linkControlsEl.innerHTML = '';
            connections.forEach(c => {
                const a = portPoint(c.from, 'out'), b = portPoint(c.to, 'in');
                linksEl.appendChild(pathEl(a.x, a.y, b.x, b.y, 'link'));
                const btn = linkDeleteButton(c, a, b);
                linkControlsEl.appendChild(btn);
                linksEl.appendChild(linkHitEl(a.x, a.y, b.x, b.y, c.id));
            });
            if(tempLink) linksEl.appendChild(pathEl(tempLink.x1, tempLink.y1, tempLink.x2, tempLink.y2, 'link temp'));
        }
        function linkDeleteButton(connection, a, b){
            const btn = document.createElement('button');
            btn.className = `link-delete ${isConnectionSelected(connection) ? 'visible' : ''}`;
            btn.type = 'button';
            btn.title = '删除连线';
            btn.setAttribute('aria-label', '删除连线');
            btn.dataset.connectionId = connection.id;
            btn.style.left = `${(a.x + b.x) / 2}px`;
            btn.style.top = `${(a.y + b.y) / 2}px`;
            btn.textContent = '×';
            btn.onmouseenter = () => setConnectionHover(connection.id, true);
            btn.onmouseleave = () => setConnectionHover(connection.id, false);
            btn.onclick = e => deleteConnection(connection.id, e);
            return btn;
        }
        function linkHitEl(x1,y1,x2,y2,id){
            const p = pathEl(x1, y1, x2, y2, 'link-hit');
            p.dataset.connectionId = id;
            p.onmouseenter = () => setConnectionHover(id, true);
            p.onmouseleave = () => setConnectionHover(id, false);
            p.onmouseover = () => setConnectionHover(id, true);
            p.onmouseout = () => setConnectionHover(id, false);
            return p;
        }
        function setConnectionHover(id, active){
            const btn = linkControlsEl.querySelector(`[data-connection-id="${id}"]`);
            if(btn) btn.classList.toggle('hover', active);
        }
        function isConnectionSelected(connection){
            return selected.has(connection.from) || selected.has(connection.to);
        }
        function pathEl(x1,y1,x2,y2,cls){
            const p = document.createElementNS('http://www.w3.org/2000/svg','path');
            const dx = Math.max(80, Math.abs(x2 - x1) * .45);
            p.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
            p.setAttribute('class', cls);
            return p;
        }

        board.onmousedown = e => {
            if(!window.canvas) return;
            // Dismiss any open native select dropdown
            if(document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
            if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
            closeCreateMenu();
            closeOutputNodeMenu();
            if(e.ctrlKey || e.metaKey){
                e.preventDefault();
                startSelection(e);
                return;
            }
            selected.clear();
            render();
            dragBoard = {sx:e.clientX, sy:e.clientY, ox:viewport.x, oy:viewport.y};
            window.onmousemove = e2 => { viewport.x = dragBoard.ox + e2.clientX - dragBoard.sx; viewport.y = dragBoard.oy + e2.clientY - dragBoard.sy; applyViewport(); };
            window.onmouseup = endDrag;
        };
        board.ondblclick = e => {
            if(!window.canvas) return;
            if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
            openCreateMenu(e.clientX, e.clientY);
        };
        
        // 添加右键菜单支持
        board.oncontextmenu = e => {
            if(!window.canvas) return;
            if(e.target !== board && e.target !== world && e.target !== nodesEl && e.target !== linksEl) return;
            e.preventDefault();
            openCreateMenu(e.clientX, e.clientY);
        };
        board.onwheel = e => {
            if(!window.canvas) return;
            e.preventDefault();
            const before = screenToWorld(e.clientX, e.clientY);
            viewport.scale = viewport.scale * (e.deltaY > 0 ? .92 : 1.08);
            const rect = board.getBoundingClientRect();
            viewport.x = e.clientX - rect.left - before.x * viewport.scale;
            viewport.y = e.clientY - rect.top - before.y * viewport.scale;
            applyViewport();
            renderLinks();
            renderSelectionHub();
            scheduleSave();
        };
        board.addEventListener('dragover', e => {
            const isImageDrag = window.imageNodeModule.hasImageFiles(e.dataTransfer?.items) || hasOutputImageDrag(e.dataTransfer) || hasAssetImageDrag(e.dataTransfer);
            if(isImageDrag){
                e.preventDefault();
                e.dataTransfer.dropEffect = hasOutputImageDrag(e.dataTransfer) || hasAssetImageDrag(e.dataTransfer) ? 'copy' : 'move';
                // 只在状态改变时才操作 DOM，避免频繁操作导致闪烁
                if(!isDropOverlayActive){
                    dropOverlay.classList.add('active');
                    isDropOverlayActive = true;
                }
            }
        });
        board.addEventListener('dragleave', e => {
            if(e.target === board && isDropOverlayActive){
                dropOverlay.classList.remove('active');
                isDropOverlayActive = false;
            }
        });
        board.addEventListener('drop', e => {
            // 重置状态
            if(isDropOverlayActive){
                dropOverlay.classList.remove('active');
                isDropOverlayActive = false;
            }
            
            if(hasOutputImageDrag(e.dataTransfer)) {
                e.preventDefault();
                window.outputNode.createImageCard(e.dataTransfer.getData('application/x-canvas-output-image'), screenToWorld(e.clientX, e.clientY));
                return;
            }
            if(hasAssetImageDrag(e.dataTransfer)) {
                e.preventDefault();
                const url = e.dataTransfer.getData('application/x-canvas-asset-image');
                if(url) {
                    window.createImageNodeFromAsset(url, screenToWorld(e.clientX, e.clientY));
                }
                return;
            }
            if(internalDrag || e.dataTransfer?.types?.includes('application/x-canvas-input')) {
                e.preventDefault();
                internalDrag = false;
                return;
            }
            if(!window.imageNodeModule.hasImageFiles(e.dataTransfer?.items)) return;
            e.preventDefault();
            window.imageNodeModule.uploadImages(e.dataTransfer.files, screenToWorld(e.clientX, e.clientY));
        });
        window.addEventListener('paste', e => {
            if (window.imageNodeModule && window.imageNodeModule.handleImagePaste(e)) return;
        });
        window.addEventListener('keydown', e => {
            if(!window.canvas) return;
            if(e.key === 'Escape' && document.getElementById('imageEditModal').classList.contains('open')) { window.imageNodeModule.closeImageEditor(); return; }
            if(e.key === 'Escape' && outputLightbox.classList.contains('open')) { window.outputNode.closeLightbox(); return; }
            if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); performUndo(); return; }
            if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelectedImages(); }
            if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelectedNodes(); }
            if(e.key === 'Delete' || e.key === 'Backspace') {
                const tag = document.activeElement?.tagName;
                if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
                if(selected.size === 0) return;
                e.preventDefault();
                deleteSelectedNodes();
            }
        });
        function deleteSelectedNodes(){
            if(!window.canvas || selected.size === 0) return;
            // 收集所有需要删除的 id（含 group 的 items 一并删除）
            const toDelete = new Set();
            const collect = id => {
                if(toDelete.has(id)) return;
                toDelete.add(id);
                const n = nodes.find(x => x.id === id);
                if(n && (n.type === 'group' || n.type === 'promptGroup')){
                    (n.items || []).forEach(collect);
                }
            };
            selected.forEach(collect);
            nodes = nodes.filter(n => !toDelete.has(n.id));
            connections = connections.filter(c => !toDelete.has(c.from) && !toDelete.has(c.to));
            selected.clear();
            render();
            scheduleSave();
        }
        function hasOutputImageDrag(dataTransfer){ return [...(dataTransfer?.types || [])].includes('application/x-canvas-output-image'); }
        function hasAssetImageDrag(dataTransfer){ return [...(dataTransfer?.types || [])].includes('application/x-canvas-asset-image'); }
        function escapeHtml(str){ return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }

        // WebSocket - 监听新图像/文本并导入画布
        (function initWebSocket() {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.hostname}:${window.location.port || 3000}/ws/stats`;
            console.log('[WS] Connecting to:', wsUrl);
            
            const socket = new WebSocket(wsUrl);
            socket.onopen = () => console.log('[WS] Connected');
            socket.onerror = (err) => console.error('[WS] Error:', err);
            socket.onclose = (e) => console.log('[WS] Closed:', e.code, e.reason);
            
            socket.onmessage = (e) => {
                try {
                    const msg = JSON.parse(e.data);
                    console.log('[WS] Message:', msg.type, msg.data);
                    if (msg.type === 'new_image' && msg.data) {
                        // 优先处理文本输出（通过 text_url），仅限 promptgen 模式
                        if (msg.data.text_url && msg.data.text && msg.data.type === 'promptgen') {
                            console.log('[WS] Importing text from:', msg.data.text_url);
                            importTextToCanvas(msg.data.text_url, msg.data.text, msg.data.type || 'generated', msg.data.prompt || '', msg.data.images?.[0] || '');
                        }
                        // 处理图像输出
                        else if (msg.data.images?.length > 0) {
                            console.log('[WS] Importing image:', msg.data.images[0]);
                            importImageToCanvas(msg.data.images[0], msg.data.type || 'generated', msg.data.prompt || '');
                        }
                    }
                } catch (err) {
                    console.error('[WS] Parse error:', err);
                }
            };
        })();

        function importImageToCanvas(url, type, prompt) {
            const generatorTypes = ['comfy', 'msgen', 'generator', 'ps'];
            const outputNodes = new Set();
            
            for (const node of nodes) {
                if (!generatorTypes.includes(node.type)) continue;
                const out = connections.filter(c => c.from === node.id)
                    .map(c => nodes.find(n => n.id === c.to))
                    .find(n => n?.type === 'output');
                if (out) {
                    outputNodes.add(out);
                }
            }
            
            if (outputNodes.size > 0 && window.outputNode) {
                for (const out of outputNodes) {
                    if ((out.images || []).includes(url)) continue;
                    window.outputNode.appendImage(out, [url], null);
                }
                render();
                scheduleSave();
                return;
            }
            
            // 如果没有找到 output 节点，创建新的 image 节点
            const p = defaultPoint(Math.random() * 200 - 100, Math.random() * 100 - 50);
            const nodeId = 'img-' + Date.now();
            const node = {
                id: nodeId,
                type: 'image',
                x: p.x,
                y: p.y,
                url: url,
                name: `${type}: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`,
                source: type
            };
            addNode(node);
        }

        async function importTextToCanvas(textUrl, textContent, type, prompt, imageUrl) {
            const p = defaultPoint(Math.random() * 200 - 100, Math.random() * 100 - 50);
            const nodeId = 'text-' + Date.now();
            const node = {
                id: nodeId,
                type: 'text',
                x: p.x,
                y: p.y,
                text_url: textUrl,
                text: textContent,
                title: `${type}: ${prompt.substring(0, 30)}${prompt.length > 30 ? '...' : ''}`,
                image_url: imageUrl || '',
                source: type
            };
            addNode(node);
        }

        async function copyTextToClipboard(nodeId, event) {
            event.stopPropagation();
            const node = canvasData.nodes.find(n => n.id === nodeId);
            if(node && node.text) {
                navigator.clipboard.writeText(node.text).then(() => {
                    const btn = event.target;
                    const original = btn.textContent;
                    btn.textContent = '✅ 已复制';
                    setTimeout(() => { btn.textContent = original; }, 1500);
                });
            }
        }

        async function loadTextFromUrl(node, preId) {
            if(!node.text_url) return;
            try {
                const response = await fetch(node.text_url);
                if(response.ok) {
                    const text = await response.text();
                    node.text = text;
                    const preEl = document.getElementById(preId);
                    if(preEl) {
                        preEl.textContent = text;
                    }
                    scheduleSave();
                }
            } catch(err) {
                console.error('Failed to load text from URL:', err);
                const preEl = document.getElementById(preId);
                if(preEl) {
                    preEl.textContent = '加载失败';
                }
            }
        }

        window.onload = async () => {
            applyTheme(localStorage.getItem('studio_theme') || localStorage.getItem(CANVAS_THEME_KEY) || 'light');
            if(window.outputNode) window.outputNode.init();
            applyViewport();
            await loadConfig();
            await loadCanvasList(false);
            setCanvasMode(false);
            
            // 初始化 image node 模块
            if (window.imageNodeModule) {
                window.imageNodeModule.init({
                    nodes,
                    connections,
                    selected,
                    render,
                    nodesEl,
                    refreshGeometry,
                    refreshGeometryAfterLayout,
                    uid,
                    escapeHtml,
                    defaultPoint,
                    startNodeDrag,
                    ensureCanvas,
                    screenToWorld,
                    scheduleSave,
                    syncGeneratorInputs,
                    refreshGeneratorInputViews,
                    refreshIcons,
                    canvas,
                    addNode,
                    findNode: (id) => nodes.find(n => n.id === id),
                    getNodes: () => nodes,
                    getConnections: () => connections
                });
                
                // 暴露全局函数供模块使用
                window.getNodes = () => nodes;
                window.getConnections = () => connections;
                window.runLoopCascade = runLoopCascade;
                window.cascadeBtnHtml = cascadeBtnHtml;
                window.bindCascadeButtons = bindCascadeButtons;
            }
            
            // 初始化 PS node 模块
            console.log('[Canvas] Checking psNodeModule:', !!window.psNodeModule);
            if (window.psNodeModule) {
                console.log('[Canvas] Initializing psNodeModule...');
                window.psNodeModule.init({
                    nodes,
                    connections,
                    selected,
                    render,
                    nodesEl,
                    refreshGeometry,
                    refreshGeometryAfterLayout,
                    uid,
                    escapeHtml,
                    defaultPoint,
                    startNodeDrag,
                    ensureCanvas,
                    screenToWorld,
                    scheduleSave,
                    syncGeneratorInputs,
                    refreshGeneratorInputViews,
                    refreshIcons,
                    canvas,
                    addNode,
                    findNode: (id) => nodes.find(n => n.id === id),
                    getNodes: () => nodes,
                    getConnections: () => connections
                });
            }
            
            // 初始化 PS Send 模块
            if (window.psSend) {
                console.log('[Canvas] Initializing psSend module...');
                window.psSend.init({
                    getNodes: () => nodes
                });
            }
            
            // 初始化新模块
            const moduleDeps = {
                nodes,
                connections,
                selected,
                render,
                nodesEl,
                refreshGeometry,
                refreshGeometryAfterLayout,
                uid,
                escapeHtml,
                escapeAttr,
                defaultPoint,
                startNodeDrag,
                ensureCanvas,
                screenToWorld,
                scheduleSave,
                syncGeneratorInputs,
                refreshGeneratorInputViews,
                refreshIcons,
                canvas,
                addNode,
                findNode: (id) => nodes.find(n => n.id === id),
                getNodes: () => nodes,
                getConnections: () => connections,
                generatorSources,
                orderedSources,
                CLIENT_ID,
                viewport,
                internalDrag,
                reorderInput,
                renderPromptPreview,
                bindScrollableText,
                openModelManager,
                chatModelOptions,
                msChatModels,
                msChatModelOptions,
                resolveChatModel,
                resolveChatProviderId,
                chatProviderOptions,
                providerChatModels,
                chatApiProviders,
                models,
                allImageModels,
                imageModelOptions,
                resolveImageModel,
                resolveImageProviderId,
                providerOptions,
                providerImageModels,
                imageApiProviders,
                MS_GEN_MODELS,
                imageRefsFromNode,
                getImageDimensions,
                urlToBase64,
                isTerminalGenerator,
                resolveCascadeLoop,
                cascadeBtnHtml,
                bindCascadeButtons,
                retryBarHtml,
                cascadeSerialIds,
                cascadeStopIds,
                addGenerationLog,
                runNodeCascade,
                cancelCascade,
                retryNodeAndDownstream,
                computeCascadeOrder,
                runCascadeNodeByType,
                copyTextToClipboard,
                llmInputImages
            };
            
            if (typeof initLoopNode === 'function') initLoopNode(moduleDeps);
            if (typeof initVideoNode === 'function') initVideoNode(moduleDeps);
            if (typeof initAudioNode === 'function') initAudioNode(moduleDeps);
            if (typeof initUploadVideoNode === 'function') initUploadVideoNode(moduleDeps);
            if (typeof initLogsPanel === 'function') initLogsPanel(moduleDeps);
            
            // 初始化 LLM 节点模块
            if (typeof initLLMNode === 'function') {
                console.log('[Canvas] Initializing llmNode module...');
                initLLMNode(moduleDeps);
            }
            
            // 初始化 Generator 节点模块
            if (typeof initGeneratorNode === 'function') {
                console.log('[Canvas] Initializing generatorNode module...');
                initGeneratorNode(moduleDeps);
            }
            
            // 初始化 MS Generator 节点模块
            if (typeof initMsGenNode === 'function') {
                console.log('[Canvas] Initializing msgenNode module...');
                initMsGenNode(moduleDeps);
            }
        };
        
        // ==================== 安全调用代理（处理模块未加载情况）====================
        window.safeCallLLMNode = function(fn, ...args) {
            if (window.llmNode && typeof window.llmNode[fn] === 'function') {
                return window.llmNode[fn](...args);
            }
            console.warn(`[Canvas] llmNode.${fn} not available`);
        };
        window.safeCallGeneratorNode = function(fn, ...args) {
            if (window.generatorNode && typeof window.generatorNode[fn] === 'function') {
                return window.generatorNode[fn](...args);
            }
            console.warn(`[Canvas] generatorNode.${fn} not available`);
        };
        window.safeCallMsGenNode = function(fn, ...args) {
            if (window.msgenNode && typeof window.msgenNode[fn] === 'function') {
                return window.msgenNode[fn](...args);
            }
            console.warn(`[Canvas] msgenNode.${fn} not available`);
        };
    
        // 获取当前画布输出文件夹名
        window.getCurrentCanvasOutputFolder = function() {
            return window.currentCanvasOutputFolder || '';
        };
    