/**
 * Logs Panel 模块
 * 负责无限画布的生成日志面板功能
 * 日志存储在 canvas.logs 中，随画布保存
 */

function isVideoUrl(url) {
    if (!url) return false;
    const videoExts = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
    const clean = url.split('?')[0].toLowerCase();
    return videoExts.some(ext => clean.endsWith(ext));
}

function isMissingAssetUrl(url) {
    return url && url.startsWith('/assets/missing/');
}

function escapeAttr(text) {
    return String(text || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function formatRunDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.floor((ms % 60000) / 1000)}s`;
}

function renderCanvasLog() {
    const list = document.getElementById('logList');
    if (!list) return;
    
    const logs = window.canvas?.logs || [];
    
    if (logs.length === 0) {
        list.innerHTML = '<div class="log-empty">暂无日志记录</div>';
        return;
    }
    
    list.innerHTML = logs.map(log => {
        const thumbs = (log.outputs || []).slice(0, 8).map(url => {
            const safe = escapeAttr(url);
            if (isMissingAssetUrl(url)) {
                return `<div class="missing-asset compact" data-url="${safe}"><i data-lucide="image-off" class="w-4 h-4"></i></div>`;
            }
            return isVideoUrl(url) 
                ? `<video src="${safe}" data-url="${safe}" muted playsinline></video>` 
                : `<img src="${safe}" data-url="${safe}" alt="output">`;
        }).join('');
        
        const date = new Date(log.createdAt || Date.now()).toLocaleString('zh-CN');
        const req = log.request || {};
        const taskId = req.task_id || req.taskId || req.prompt_id || req.promptId || '';
        const requestId = req.request_id || req.requestId || req.id || '';
        const backend = req.backend || req.provider_id || req.providerId || '';
        const workflow = req.workflow_json || req.workflow || '';
        const taskLabel = log.taskLabel || log.model || log.nodeType || '';
        const idText = taskId || requestId || '';
        const backendText = workflow || backend || '';
        const durationText = formatRunDuration(log.runMs || 0);
        
        const subParts = [
            date,
            `输出 ${(log.outputs || []).length}`,
            idText ? `ID ${idText}` : '',
            backendText,
            durationText ? `耗时 ${durationText}` : ''
        ].filter(Boolean);
        
        return `
            <div class="log-item ${log.status === 'failed' || log.status === 'error' ? 'failed' : ''}">
                <div class="log-main">
                    <div class="log-meta-row">
                        <span class="log-chip ${log.status === 'failed' || log.status === 'error' ? 'status-failed' : 'status-ok'}">
                            ${log.status === 'failed' || log.status === 'error' ? '失败' : '成功'}
                        </span>
                        <span class="log-chip">${log.platform || '-'}</span>
                        ${taskLabel ? `<span class="log-chip">${taskLabel}</span>` : ''}
                        <span class="log-chip">${durationText}</span>
                    </div>
                    <div class="log-subline">
                        ${subParts.map(part => `<span title="${escapeAttr(part)}">${escapeHtml(part)}</span>`).join('')}
                    </div>
                    ${log.error ? `<div class="log-error" title="${escapeAttr(log.error)}">${escapeHtml(log.error)}</div>` : ''}
                    <div class="log-prompt" title="${escapeAttr(log.prompt || '无 prompt 信息')}" data-prompt="${escapeAttr(log.prompt || '')}">
                        ${escapeHtml(log.prompt || '无 prompt 信息')}
                    </div>
                </div>
                <div class="log-thumbs">${thumbs}</div>
            </div>
        `;
    }).join('');
    
    list.querySelectorAll('[data-url]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            if (window.outputNode && window.outputNode.openLightbox) {
                window.outputNode.openLightbox(el.dataset.url, null);
            }
        };
    });
    
    list.querySelectorAll('[data-prompt]').forEach(el => {
        el.onclick = e => {
            e.stopPropagation();
            const text = el.dataset.prompt || '';
            if (text) {
                navigator.clipboard?.writeText(text).then(() => {
                    const oldText = el.textContent;
                    el.textContent = '已复制';
                    el.classList.add('copied');
                    setTimeout(() => {
                        el.textContent = oldText;
                        el.classList.remove('copied');
                    }, 900);
                }).catch(() => {});
            }
        };
    });
    
    if (window.refreshIcons) window.refreshIcons();
}

function openCanvasLog() {
    const overlay = document.getElementById('logModal');
    if (overlay) {
        overlay.classList.add('open');
        renderCanvasLog();
    }
}

function closeCanvasLog() {
    const overlay = document.getElementById('logModal');
    if (overlay) overlay.classList.remove('open');
}

function addGenerationLog({run, outputs=[], runMs=0, error=''}) {
    if (!window.canvas) return;
    window.canvas.logs = window.canvas.logs || [];
    const entry = {
        id: window.uid ? window.uid('log') : `log-${Date.now()}`,
        createdAt: Date.now(),
        status: error ? 'failed' : 'success',
        platform: run?.platform || run?.nodeType || '',
        nodeType: run?.nodeType || '',
        model: run?.model || run?.taskLabel || '',
        taskLabel: run?.taskLabel || '',
        request: run?.request || {},
        prompt: run?.prompt || '',
        outputs: (outputs || []).filter(Boolean),
        refs: run?.refs || [],
        runMs: Number(runMs || 0),
        error: error ? String(error) : ''
    };
    window.canvas.logs = [entry, ...window.canvas.logs].slice(0, 500);
}

function clearCanvasLog() {
    if (window.canvas) {
        window.canvas.logs = [];
    }
    renderCanvasLog();
}

function initLogsPanel(canvasDeps) {
    // 日志面板初始化，日志数据存储在 canvas.logs 中
}

window.openCanvasLog = openCanvasLog;
window.closeCanvasLog = closeCanvasLog;
window.addGenerationLog = addGenerationLog;
window.clearCanvasLog = clearCanvasLog;
window.initLogsPanel = initLogsPanel;
