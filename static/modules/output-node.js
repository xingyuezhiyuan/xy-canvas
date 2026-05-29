// output-node.js - Output 节点模块
// 负责 output 节点的渲染、图像管理、灯箱、对比、拖拽等功能

(function() {
    'use strict';
    
    // ==================== 辅助函数引用 ====================
    // 以下函数由 canvas.html 提供，在全局作用域中可用：
    // - uid(type): 生成唯一 ID
    // - escapeHtml(text): HTML 转义
    // - scheduleSave(): 调度保存
    // - render(): 重新渲染画布
    // - refreshIcons(): 刷新图标
    // - screenToWorld(clientX, clientY): 坐标转换
    // - nodes: 节点数组
    // - connections: 连接数组
    // - viewport: 视口状态
    // - selected: 选中节点集合
    
    // ==================== 视频辅助函数 ====================
    
    function isVideoUrl(url) {
        if (!url) return false;
        const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const clean = url.split('?')[0].toLowerCase();
        return videoExts.some(ext => clean.endsWith(ext));
    }
    
    // ==================== 渲染系统 ====================
    // 负责 output 节点的 DOM 渲染
    
    function renderPendingItems(node) {
        return (node._pending || []).map(p => {
            const percent = p.progress ?? 0;
            const dashoffset = 226 - (226 * percent / 100);
            return `<div class="output-img-wrap loading-wrap" data-pending-id="${p.id}" style="position:relative;">
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
                <button class="output-del" title="删除">×</button>
            </div>`;
        }).join('');
    }

    function renderImageGrid(node) {
        return (node.images || []).map(url => {
            if (isVideoUrl(url)) {
                return `<div class="output-img-wrap"><video src="${url}" data-url="${url}" muted playsinline loop alt="generated video"></video><button class="output-del" title="删除">×</button></div>`;
            }
            return `<div class="output-img-wrap"><img src="${url}" data-url="${url}" alt="generated output"><button class="output-del" title="删除">×</button></div>`;
        }).join('');
    }

    function renderTextOutputs(node) {
        return (node.textOutputs || []).map((t, i) => 
            `<div class="output-text-wrap" data-text-idx="${i}">
                <div class="output-text-title">${escapeHtml(t.preset || '')}</div>
                <pre class="output-text-pre">${escapeHtml(t.text || '').substring(0, 500)}</pre>
                <div class="output-text-actions">
                    <button onclick="window.outputNode.copyText(event, '${node.id}', ${i})" class="text-[10px] text-gray-400 hover:text-black">📋 复制</button>
                    <button onclick="window.outputNode.deleteText(event, '${node.id}', ${i})" class="text-[10px] text-red-400 hover:text-red-600" title="删除">×</button>
                </div>
            </div>`
        ).join('');
    }

    function bindOutputEvents(body, node) {
        body.querySelectorAll('.output-img-wrap').forEach(wrap => {
            const img = wrap.querySelector('img');
            const video = wrap.querySelector('video');
            const del = wrap.querySelector('.output-del');
            
            if (img) {
                img.draggable = true;
                img.ondragstart = e => {
                    e.stopPropagation();
                    img.dataset.dragging = '1';
                    window.outputNode.setDragPreview(e, img);
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-canvas-output-image', img.dataset.url);
                    e.dataTransfer.setData('text/uri-list', img.dataset.url);
                };
                img.ondragend = () => setTimeout(() => { delete img.dataset.dragging; }, 0);
                img.onclick = e => {
                    e.stopPropagation();
                    if(img.dataset.dragging) return;
                    window.outputNode.openLightbox(img.dataset.url, node);
                };
            }
            
            if (video) {
                video.draggable = true;
                video.ondragstart = e => {
                    e.stopPropagation();
                    video.dataset.dragging = '1';
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('application/x-canvas-output-video', video.dataset.url);
                    e.dataTransfer.setData('text/uri-list', video.dataset.url);
                };
                video.ondragend = () => setTimeout(() => { delete video.dataset.dragging; }, 0);
                video.onclick = e => {
                    e.stopPropagation();
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                };
            }
            
            del.onmousedown = e => e.stopPropagation();
            del.onclick = e => {
                e.stopPropagation();
                const pid = wrap.dataset.pendingId;
                if(pid){
                    node._pending = (node._pending || []).filter(p => p.id !== pid);
                } else {
                    const url = img?.dataset.url || video?.dataset.url;
                    const idx = (node.images || []).indexOf(url);
                    if(idx >= 0) node.images.splice(idx, 1);
                    if(node.imageComparisons) delete node.imageComparisons[url];
                    scheduleSave();
                }
                render();
            };
        });
    }
    
    // ==================== 辅助函数 ====================
    
    function outputDownloadName(url){
        const clean = (url || '').split('?')[0];
        const ext = clean.includes('.') ? clean.split('.').pop() : 'png';
        return `canvas-output-${Date.now()}.${ext || 'png'}`;
    }

    function outputImageName(url){
        const clean = (url || '').split('?')[0];
        const name = clean.split('/').filter(Boolean).pop();
        return name ? decodeURIComponent(name) : 'output image';
    }
    
    // ==================== 拖拽系统 ====================
    // 负责图像拖拽预览和跨应用拖拽
    
    function setOutputDragPreview(event, img){
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
    
    // ==================== 图像操作 ====================
    // 负责图像追加、删除和创建图像节点
    
    function appendOutputImages(out, images, compareRef){
        const list = (images || []).filter(Boolean).filter(url => !(out.images || []).includes(url));
        if(!out) return;
        if(list.length) {
            out.images = [...(out.images || []), ...list];
        }
        // 无论图片是否已存在，只要有对比图引用，就保存对比数据
        if(compareRef?.url){
            out.imageComparisons = out.imageComparisons || {};
            const targetImages = list.length ? list : (images || []).filter(Boolean);
            targetImages.forEach(url => {
                out.imageComparisons[url] = {url:compareRef.url, name:compareRef.name || 'input image'};
            });
        }
    }

    function createImageCardFromOutput(url, point){
        if(!ensureCanvas() || !url) return;
        const p = point || defaultPoint(0, 0);
        nodes.push({id:uid('img'), type:'image', x:p.x, y:p.y, url, name:outputImageName(url)});
        render();
        scheduleSave();
    }

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
    
    // ==================== 对比系统 ====================
    // 负责 Before/After 对比功能
    
    let outputCompareDrag = false;
    
    function outputCompareUrlFor(url, out){
        const source = out?.imageComparisons?.[url];
        return typeof source === 'string' ? source : source?.url || '';
    }

    function setOutputCompareMode(active){
        const outputPreview = document.getElementById('outputPreview');
        const outputCompareOriginalWrap = document.getElementById('outputCompareOriginalWrap');
        const outputCompareSlider = document.getElementById('outputCompareSlider');
        
        if(!outputPreview) return;
        outputPreview.classList.toggle('compare-mode', active);
        if(active && outputCompareOriginalWrap && outputCompareSlider){
            outputCompareOriginalWrap.style.clipPath = 'inset(0 50% 0 0)';
            outputCompareSlider.style.left = '50%';
        }
    }

    function updateOutputCompareSlider(clientX){
        const outputCompareContainer = document.getElementById('outputCompareContainer');
        const outputCompareOriginalWrap = document.getElementById('outputCompareOriginalWrap');
        const outputCompareSlider = document.getElementById('outputCompareSlider');
        
        const rect = outputCompareContainer?.getBoundingClientRect();
        if(!rect?.width) return;
        const percent = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
        outputCompareOriginalWrap.style.clipPath = `inset(0 ${100 - percent}% 0 0)`;
        outputCompareSlider.style.left = `${percent}%`;
    }

    function initOutputCompareEvents(){
        const outputCompareContainer = document.getElementById('outputCompareContainer');
        const outputCompareSlider = document.getElementById('outputCompareSlider');
        if(!outputCompareContainer || !outputCompareSlider) return;
        
        outputCompareContainer.addEventListener('mousedown', e => {
            outputCompareDrag = true;
            updateOutputCompareSlider(e.clientX);
            e.preventDefault();
            e.stopPropagation();
        });
        outputCompareSlider.addEventListener('mousedown', e => {
            outputCompareDrag = true;
            e.preventDefault();
            e.stopPropagation();
        });
        window.addEventListener('mousemove', e => {
            if(outputCompareDrag) updateOutputCompareSlider(e.clientX);
        });
        window.addEventListener('mouseup', () => { outputCompareDrag = false; });
        outputCompareContainer.addEventListener('touchstart', e => {
            outputCompareDrag = true;
            updateOutputCompareSlider(e.touches[0].clientX);
            e.preventDefault();
            e.stopPropagation();
        }, {passive:false});
        window.addEventListener('touchmove', e => {
            if(outputCompareDrag) {
                updateOutputCompareSlider(e.touches[0].clientX);
                e.preventDefault();
            }
        }, {passive:false});
        window.addEventListener('touchend', () => { outputCompareDrag = false; });
    }
    
    // ==================== 灯箱系统 ====================
    // 负责大图查看和下载
    
    let currentOutputCompareUrl = '';
    
    // 预览缩放状态
    let outputPreviewZoom = 1;
    let outputPreviewPan = {x: 0, y: 0};
    let outputPreviewPanDrag = null;

    function applyOutputPreviewZoom(){
        const outputLightboxImg = document.getElementById('outputLightboxImg');
        const outputCompareResult = document.getElementById('outputCompareResult');
        const outputCompareOriginal = document.getElementById('outputCompareOriginal');
        const outputPreview = document.getElementById('outputPreview');
        const transform = `translate(${outputPreviewPan.x}px, ${outputPreviewPan.y}px) scale(${outputPreviewZoom})`;
        [outputLightboxImg, outputCompareResult, outputCompareOriginal].forEach(img => {
            if(img){
                img.style.transform = transform;
                img.style.transformOrigin = '0 0';
            }
        });
        if(outputPreview) outputPreview.classList.toggle('zoomed', outputPreviewZoom > 1.001);
    }
    
    function resetOutputPreviewZoom(){
        outputPreviewZoom = 1;
        outputPreviewPan = {x: 0, y: 0};
        outputPreviewPanDrag = null;
        const outputPreview = document.getElementById('outputPreview');
        if(outputPreview) outputPreview.classList.remove('panning');
        applyOutputPreviewZoom();
    }
    
    function initOutputPreviewZoomEvents(){
        const outputPreview = document.getElementById('outputPreview');
        const outputLightboxVideo = document.getElementById('outputLightboxVideo');
        if(!outputPreview) return;
        
        // 鼠标滚轮缩放
        outputPreview.addEventListener('wheel', e => {
            if(outputLightboxVideo && outputLightboxVideo.style.display === 'block') return;
            e.preventDefault();
            e.stopPropagation();
            const rect = outputPreview.getBoundingClientRect();
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            const before = {
                x:(localX - outputPreviewPan.x) / outputPreviewZoom,
                y:(localY - outputPreviewPan.y) / outputPreviewZoom
            };
            const factor = e.deltaY > 0 ? .9 : 1.1;
            const nextZoom = Math.max(1, Math.min(6, outputPreviewZoom * factor));
            outputPreviewZoom = nextZoom;
            outputPreviewPan = nextZoom <= 1.001 ? {x: 0, y: 0} : {
                x:localX - before.x * nextZoom,
                y:localY - before.y * nextZoom
            };
            applyOutputPreviewZoom();
        }, {passive:false});
        
        // 鼠标拖拽平移（仅在放大时启用）
        outputPreview.addEventListener('mousedown', e => {
            if(outputLightboxVideo && outputLightboxVideo.style.display === 'block') return;
            if(e.button !== 0 || outputPreviewZoom <= 1.001) return;
            if(e.target.closest('.output-preview-actions, .output-resolution, .output-compare-slider')) return;
            outputPreviewPanDrag = {
                sx:e.clientX,
                sy:e.clientY,
                ox:outputPreviewPan.x,
                oy:outputPreviewPan.y
            };
            outputPreview.classList.add('panning');
            e.preventDefault();
            e.stopPropagation();
        });
        window.addEventListener('mousemove', e => {
            if(!outputPreviewPanDrag) return;
            outputPreviewPan = {
                x:outputPreviewPanDrag.ox + e.clientX - outputPreviewPanDrag.sx,
                y:outputPreviewPanDrag.oy + e.clientY - outputPreviewPanDrag.sy
            };
            applyOutputPreviewZoom();
        });
        window.addEventListener('mouseup', () => {
            outputPreviewPanDrag = null;
            const outputPreview = document.getElementById('outputPreview');
            if(outputPreview) outputPreview.classList.remove('panning');
        });
    }

    function openOutputLightbox(url, out){
        if(!url) return;
        resetOutputPreviewZoom();
        
        const outputLightbox = document.getElementById('outputLightbox');
        const outputLightboxImg = document.getElementById('outputLightboxImg');
        const outputLightboxVideo = document.getElementById('outputLightboxVideo');
        const outputPreview = document.getElementById('outputPreview');
        const outputResolution = document.getElementById('outputResolution');
        const outputDownloadBtn = document.getElementById('outputDownloadBtn');
        const outputCompareResult = document.getElementById('outputCompareResult');
        const outputCompareOriginal = document.getElementById('outputCompareOriginal');
        
        if(!outputLightbox || !outputLightboxImg) return;
        
        outputResolution.textContent = '--';
        currentOutputCompareUrl = outputCompareUrlFor(url, out);
        setOutputCompareMode(false);
        
        const videoMode = isVideoUrl(url);
        if(outputLightboxImg) outputLightboxImg.style.display = videoMode ? 'none' : 'block';
        if(outputLightboxVideo) outputLightboxVideo.style.display = videoMode ? 'block' : 'none';
        if(outputCompareResult) outputCompareResult.style.display = videoMode ? 'none' : 'block';
        if(outputCompareOriginal) outputCompareOriginal.style.display = videoMode ? 'none' : 'block';
        
        if(videoMode){
            if(outputLightboxImg) outputLightboxImg.src = '';
            if(outputCompareResult) outputCompareResult.src = '';
            if(outputCompareOriginal) outputCompareOriginal.src = '';
            if(outputLightboxVideo){
                outputLightboxVideo.onloadedmetadata = () => {
                    outputResolution.textContent = outputLightboxVideo.videoWidth && outputLightboxVideo.videoHeight
                        ? `${outputLightboxVideo.videoWidth} x ${outputLightboxVideo.videoHeight}`
                        : 'Video';
                };
                outputLightboxVideo.src = url;
            }
            outputDownloadBtn.onclick = e => {
                e.stopPropagation();
                downloadUrl(url, outputDownloadName(url)).catch(err => alert(err.message || '下载失败'));
            };
            outputLightbox.classList.add('open');
            refreshIcons();
            return;
        }
        
        // 图片模式
        if(outputLightboxVideo){
            outputLightboxVideo.pause();
            outputLightboxVideo.src = '';
        }
        outputLightboxImg.draggable = false;
        if(outputCompareResult) outputCompareResult.draggable = false;
        if(outputCompareOriginal) outputCompareOriginal.draggable = false;
        
        outputLightboxImg.onload = () => {
            outputResolution.textContent = `${outputLightboxImg.naturalWidth} x ${outputLightboxImg.naturalHeight}`;
        };
        outputLightboxImg.src = url;
        if(outputCompareResult) outputCompareResult.src = url;
        if(outputCompareOriginal) outputCompareOriginal.src = currentOutputCompareUrl || '';
        
        if(outputPreview){
            outputPreview.ondblclick = e => {
                e.stopPropagation();
                const hasCompare = !!currentOutputCompareUrl;
                setOutputCompareMode(!outputPreview.classList.contains('compare-mode') && hasCompare);
            };
        }
        
        outputDownloadBtn.onclick = e => {
            e.stopPropagation();
            downloadUrl(url, outputDownloadName(url)).catch(err => alert(err.message || '下载失败'));
        };
        
        outputLightbox.classList.add('open');
        refreshIcons();
    }

    function closeOutputLightbox(){
        const outputLightbox = document.getElementById('outputLightbox');
        const outputLightboxImg = document.getElementById('outputLightboxImg');
        const outputLightboxVideo = document.getElementById('outputLightboxVideo');
        const outputPreview = document.getElementById('outputPreview');
        const outputCompareResult = document.getElementById('outputCompareResult');
        const outputCompareOriginal = document.getElementById('outputCompareOriginal');
        
        resetOutputPreviewZoom();
        outputLightbox?.classList.remove('open');
        setOutputCompareMode(false);
        
        if(outputLightboxVideo){
            outputLightboxVideo.pause();
            outputLightboxVideo.src = '';
        }
        
        if(outputLightboxImg){
            outputLightboxImg.src = '';
            outputLightboxImg.style.display = '';
        }
        if(outputCompareResult) outputCompareResult.src = '';
        if(outputCompareOriginal) outputCompareOriginal.src = '';
        if(outputPreview){
            outputPreview.style.width = '';
            outputPreview.style.height = '';
            outputPreview.ondblclick = null;
        }
        currentOutputCompareUrl = '';
    }
    
    // ==================== 文本操作 ====================
    // 负责文本输出的复制和删除
    
    function copyTextToClipboard(event, nodeId, idx) {
        const node = nodes.find(n => n.id === nodeId);
        if(node && node.textOutputs && node.textOutputs[idx]) {
            const text = node.textOutputs[idx].text;
            navigator.clipboard.writeText(text).then(() => {
                const btn = event.target;
                const original = btn.textContent;
                btn.textContent = '✅ 已复制';
                setTimeout(() => { btn.textContent = original; }, 1500);
            });
        }
    }

    function removeTextOutput(event, nodeId, idx) {
        const node = nodes.find(n => n.id === nodeId);
        if(node && node.textOutputs) {
            node.textOutputs.splice(idx, 1);
            render();
            scheduleSave();
        }
    }
    
    // ==================== 导出接口 ====================
    window.outputNode = {
        init: function(){
            initOutputPreviewZoomEvents();
            initOutputCompareEvents();
        },
        renderBody: function(node) {
            const body = document.createElement('div');
            body.className = 'node-body';
            
            const imagesHtml = renderImageGrid(node);
            const textOutputsHtml = renderTextOutputs(node);
            const pendingHtml = renderPendingItems(node);
            
            body.innerHTML = `<div class="output-grid">${imagesHtml}${textOutputsHtml}${pendingHtml}</div>`;
            
            bindOutputEvents(body, node);
            
            return body;
        },
        setDragPreview: setOutputDragPreview,
        openLightbox: openOutputLightbox,
        closeLightbox: closeOutputLightbox,
        copyText: copyTextToClipboard,
        deleteText: removeTextOutput,
        appendImage: appendOutputImages,
        createImageCard: createImageCardFromOutput,
        downloadUrl: downloadUrl,
        outputDownloadName: outputDownloadName,
        getCompareUrl: outputCompareUrlFor,
        initCompareEvents: initOutputCompareEvents,
        setCompareMode: setOutputCompareMode,
        updateSlider: updateOutputCompareSlider
    };
})();
