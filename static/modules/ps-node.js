/**
 * PS Node 模块
 * 负责无限画布中 PS 节点的创建、渲染、ComfyUI工作流执行等功能
 * 基于 ps.json 工作流，通过 ComfyUI API 执行 Photoshop 插件工作流
 */

// 模块状态
let psDeps = null;

/**
 * 初始化模块，接收 canvas.html 的依赖注入
 */
function initPSNode(canvasDeps) {
    psDeps = canvasDeps;
}

/**
 * 创建新的 PS 节点
 * 如果有point参数则在指定位置创建，否则查找最近的image节点并在其右侧创建
 */
function addPSNode(point) {
    console.log('[PS Node] addPSNode called, point:', point);
    console.log('[PS Node] psDeps:', psDeps);
    
    let p;
    if (point) {
        // 如果指定了位置，使用指定位置
        p = point;
    } else {
        // 否则查找image节点并在其右侧创建
        const nodes = psDeps.getNodes();
        const imageNodes = nodes.filter(n => n.type === 'image');
        
        if (imageNodes.length > 0) {
            // 找到最后一个image节点
            const lastImage = imageNodes[imageNodes.length - 1];
            p = {
                x: lastImage.x + (lastImage.w || 260) + 50,  // 在image节点右侧50px处
                y: lastImage.y
            };
        } else {
            // 如果没有image节点，使用默认位置
            p = psDeps.defaultPoint(200, 0);
        }
    }
    
    console.log('[PS Node] Creating node at:', p);
    const newNode = {
        id: psDeps.uid('ps'),
        type: 'ps',
        x: p.x,
        y: p.y,
        w: 460,
        psImages: [],
        psMasks: [],
        running: false
    };
    console.log('[PS Node] New node:', newNode);
    psDeps.addNode(newNode);
    console.log('[PS Node] Node added successfully');
}

/**
 * 渲染 PS 节点的 DOM 内容
 * @param {Object} node - 节点数据对象
 * @param {HTMLElement} body - 节点的 body 容器
 */
function renderPSNode(node, body) {
    const imageHtml = renderImagePreview(node);
    const pendingHtml = renderPendingItems(node);
    
    const runBtnHtml = `<button class="ps-run-btn ${node.running ? 'running' : ''}" type="button" ${node.running ? 'disabled' : ''}>
        <i data-lucide="play" class="w-3 h-3"></i>
        <span>${node.running ? '执行中...' : '获取ps图像'}</span>
    </button>`;
    
    body.innerHTML = `
        <div class="ps-header">${runBtnHtml}</div>
        <div class="ps-preview-grid">
            ${imageHtml ? `<div class="ps-preview-section">
                <div class="ps-section-title">图像输出</div>
                <div class="ps-grid">${imageHtml}</div>
            </div>` : ''}
            ${pendingHtml ? `<div class="ps-grid">${pendingHtml}</div>` : ''}
            ${!imageHtml && !pendingHtml ? '<div class="ps-empty">等待 Photoshop 插件输出...<br><span class="text-[10px]">点击"获取ps图像"执行工作流</span></div>' : ''}
        </div>
    `;
    
    bindPSEvents(body, node);
    
    // 绑定运行按钮事件
    const runBtn = body.querySelector('.ps-run-btn');
    if (runBtn) {
        runBtn.onclick = (e) => {
            e.stopPropagation();
            if (!node.running) {
                runPSNode(node.id);
            }
        };
    }
    
    // 初始化lucide图标
    if (psDeps.refreshIcons) {
        setTimeout(() => psDeps.refreshIcons(), 0);
    }
}

/**
 * 渲染图像预览
 */
function renderImagePreview(node) {
    const images = node.psImages || [];
    return images.map(url => {
        return `<div class="ps-img-wrap">
            <img src="${url}" data-url="${url}" alt="PS output image">
            <button class="ps-del" title="删除">×</button>
        </div>`;
    }).join('');
}

/**
 * 渲染遮罩预览
 */
function renderMaskPreview(node) {
    const masks = node.psMasks || [];
    return masks.map(url => {
        return `<div class="ps-img-wrap">
            <img src="${url}" data-url="${url}" alt="PS mask image">
            <button class="ps-del" title="删除">×</button>
        </div>`;
    }).join('');
}

/**
 * 渲染加载中的项目
 */
function renderPendingItems(node) {
    return (node._pending || []).map(p => {
        const percent = p.progress ?? 0;
        const dashoffset = 226 - (226 * percent / 100);
        return `<div class="ps-img-wrap loading-wrap" data-pending-id="${p.id}" style="position:relative;">
            <div class="pyramid-progress" style="position:absolute; top:-65px; left:0; right:0; text-align:center; z-index:20; pointer-events:none;">
                <div class="pyramid-progress-text" style="position:relative; top:auto; left:auto; transform:none; font-size:16px; font-weight:800; color:#00f0ff; text-shadow:0 0 10px rgba(0,240,255,.8);">${percent}%</div>
            </div>
            <div class="pyramid-loader">
                <div class="pyramid-wrapper">
                    <div class="side side1"></div>
                    <div class="side side2"></div>
                    <div class="side side3"></div>
                    <div class="side side4"></div>
                    <div class="shadow"></div>
                </div>
                <svg class="pyramid-progress-ring" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-90deg); width:120px; height:120px; z-index:15; pointer-events:none;" viewBox="0 0 80 80">
                    <circle class="pyramid-progress-ring-bg" cx="40" cy="40" r="36" style="stroke-width:4;"/>
                    <circle class="pyramid-progress-ring-fill" cx="40" cy="40" r="36" style="stroke-width:4; stroke-dashoffset:${dashoffset}"/>
                </svg>
            </div>
            <button class="ps-del" title="删除">×</button>
        </div>`;
    }).join('');
}

/**
 * 绑定PS节点事件
 */
function bindPSEvents(body, node) {
    body.querySelectorAll('.ps-img-wrap').forEach(wrap => {
        const img = wrap.querySelector('img');
        const del = wrap.querySelector('.ps-del');
        
        if (img) {
            img.draggable = true;
            img.ondragstart = e => {
                e.stopPropagation();
                img.dataset.dragging = '1';
                setDragPreview(e, img);
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('application/x-canvas-ps-image', img.dataset.url);
                e.dataTransfer.setData('text/uri-list', img.dataset.url);
            };
            img.ondragend = () => setTimeout(() => { delete img.dataset.dragging; }, 0);
            img.onclick = e => {
                e.stopPropagation();
                if(img.dataset.dragging) return;
                openLightbox(img.dataset.url, node);
            };
        }
        
        if (del) {
            del.onmousedown = e => e.stopPropagation();
            del.onclick = e => {
                e.stopPropagation();
                const pid = wrap.dataset.pendingId;
                if(pid){
                    node._pending = (node._pending || []).filter(p => p.id !== pid);
                } else {
                    const url = img?.dataset.url;
                    if(node.psImages) {
                        const idx = node.psImages.indexOf(url);
                        if(idx >= 0) node.psImages.splice(idx, 1);
                    }
                    if(node.psMasks) {
                        const idx = node.psMasks.indexOf(url);
                        if(idx >= 0) node.psMasks.splice(idx, 1);
                    }
                    psDeps.scheduleSave();
                }
                psDeps.render();
            };
        }
    });
}

/**
 * 设置拖拽预览
 */
function setDragPreview(event, img){
    if(!event.dataTransfer || !img) return;
    const wrap = document.createElement('div');
    wrap.className = 'output-drag-preview';
    const clone = img.cloneNode();
    clone.removeAttribute('id');
    wrap.appendChild(clone);
    document.body.appendChild(wrap);
    const rect = img.getBoundingClientRect();
    event.dataTransfer.setDragImage(wrap, Math.min(rect.width / 2, 120), Math.min(rect.height / 2, 120));
    setTimeout(() => wrap.remove(), 0);
}

/**
 * 打开灯箱
 */
function openLightbox(url, node){
    if(!url) return;
    
    const outputLightbox = document.getElementById('outputLightbox');
    const outputLightboxImg = document.getElementById('outputLightboxImg');
    const outputPreview = document.getElementById('outputPreview');
    const outputResolution = document.getElementById('outputResolution');
    const outputDownloadBtn = document.getElementById('outputDownloadBtn');
    
    if(!outputLightbox || !outputLightboxImg) return;
    
    outputLightboxImg.style.display = '';
    const video = outputPreview?.querySelector('.lightbox-video');
    if (video) {
        video.style.display = 'none';
        video.pause();
    }
    
    outputLightboxImg.onload = () => {
        outputResolution.textContent = `${outputLightboxImg.naturalWidth} x ${outputLightboxImg.naturalHeight}`;
        const rect = outputLightboxImg.getBoundingClientRect();
        outputPreview.style.width = `${rect.width}px`;
        outputPreview.style.height = `${rect.height}px`;
    };
    outputPreview.style.width = '';
    outputPreview.style.height = '';
    outputLightboxImg.src = url;
    
    outputDownloadBtn.onclick = e => {
        e.stopPropagation();
        downloadUrl(url, getDownloadName(url)).catch(err => alert(err.message || '下载失败'));
    };
    
    outputLightbox.classList.add('open');
    psDeps.refreshIcons();
}

/**
 * 获取下载文件名
 */
function getDownloadName(url){
    const clean = (url || '').split('?')[0];
    const ext = clean.includes('.') ? clean.split('.').pop() : 'png';
    return `ps-output-${Date.now()}.${ext || 'png'}`;
}

/**
 * 下载URL
 */
async function downloadUrl(url, filename){
    const res = await fetch(url);
    if(!res.ok) throw new Error('下载失败');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/**
 * 检查遮罩是否为空（全白）
 * @param {string} maskUrl - 遮罩图像URL
 * @returns {Promise<boolean>} - 如果遮罩全白则返回true
 */
async function checkMaskEmpty(maskUrl) {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        return new Promise((resolve) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, img.width, img.height);
                const data = imageData.data;
                
                // 检查所有像素是否都是白色（RGB都是255）
                // 允许一定的容差（比如250-255都算白色）
                const threshold = 250;
                let isWhite = true;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    
                    // 如果任何一个通道低于阈值，说明不是全白
                    if (r < threshold || g < threshold || b < threshold) {
                        isWhite = false;
                        break;
                    }
                }
                
                console.log('[PS Node] Mask check - is white:', isWhite, 'threshold:', threshold);
                resolve(isWhite);
            };
            
            img.onerror = () => {
                console.warn('[PS Node] Failed to load mask for check, assuming empty');
                resolve(true); // 加载失败，假设为空
            };
            
            img.src = maskUrl;
        });
    } catch (err) {
        console.error('[PS Node] Mask check error:', err);
        return true; // 出错时假设为空
    }
}

/**
 * 追加PS图像到output节点
 */
function appendPSImages(node, images, type){
    if(!node) return;
    
    if(type === 'mask') {
        node.psMasks = node.psMasks || [];
        const list = (images || []).filter(Boolean).filter(url => !node.psMasks.includes(url));
        if(list.length) {
            node.psMasks = [...node.psMasks, ...list];
        }
    } else {
        node.psImages = node.psImages || [];
        const list = (images || []).filter(Boolean).filter(url => !node.psImages.includes(url));
        if(list.length) {
            node.psImages = [...node.psImages, ...list];
        }
    }
}

/**
 * 运行PS节点 - 执行ComfyUI工作流
 * PS节点不需要输入，直接执行ps.json工作流，输出节点#2和#4的结果
 */
async function runPSNode(nodeId, opts={}) {
    const nodes = psDeps.getNodes();
    const connections = psDeps.getConnections();
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.running) return;
    
    const cascade = opts.cascade || false;
    
    if (!cascade) {
        node.running = true;
        psDeps.render();
    }
    
    const startTime = Date.now();
    const run = {
        nodeType: 'ps',
        node: node,
        prompt: '',
        refs: [],
        taskLabel: 'Photoshop'
    };
    
    const pendingId = psDeps.uid('p');
    psDeps.render();
    
    let ws = null;
    let lastError = '';
    
    try {
        // 建立 WebSocket 连接监听进度
        const wsUrl = `ws://127.0.0.1:8188/ws?clientId=${window.CLIENT_ID}`;
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
                    
                    console.log('[PS Node] WebSocket message:', message.type);
                } catch (e) {
                    console.warn('WebSocket 消息处理错误:', e);
                }
            };
        } catch (e) {
            console.warn('WebSocket 连接失败，使用基本模式:', e.message);
        }
        
        // 调用后端 API 执行 ps.json 工作流
        // ps.json工作流不需要输入，直接执行
        const response = await fetch('/api/workflows/ps.json/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: {},
                config: { fields: [] },
                client_id: window.CLIENT_ID
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        // 处理返回的图像
        // 后端返回的 data.images 只包含节点#2的主图像（节点#5已被后端过滤）
        if (data.images && data.images.length) {
            console.log('[PS Node] Received images:', data.images);
            
            // 直接使用后端返回的图像作为主图像
            const mainImages = data.images;
            
            if (mainImages.length) {
                console.log('[PS Node] Using main images as output');
                
                // 只存储到PS节点的psImages，不传递到output节点
                node.psImages = [...(node.psImages || []), ...mainImages];
                
                console.log('[PS Node] Final state - psImages:', node.psImages.length, 'psMasks:', (node.psMasks || []).length);
            }
        }
        
        psDeps.render();
        psDeps.scheduleSave();
        
    } catch (err) {
        lastError = err.message || 'PS 工作流执行失败';
        console.error('[PS Node] Execution error:', err);
        psDeps.render();
        if (!cascade) {
            alert(`PS节点执行失败: ${err.message}`);
        }
    } finally {
        if (ws) {
            try { ws.close(); } catch (e) {}
        }
    }
    
    const runMs = Date.now() - startTime;
    run.request = {
        backend: 'ComfyUI-PS',
        workflow_json: 'ps.json'
    };
    
    if (lastError) {
        if (window.addGenerationLog) {
            window.addGenerationLog({run, outputs: [], runMs, error: lastError});
        }
    }
    
    if (!cascade) {
        node.running = false;
        psDeps.render();
    }
}

// 导出模块
window.psNodeModule = {
    init: initPSNode,
    addPSNode: addPSNode,
    renderPSNode: renderPSNode,
    runPSNode: runPSNode,
    appendPSImages: appendPSImages
};

console.log('[PS Node Module] Loaded successfully, window.psNodeModule:', !!window.psNodeModule);
