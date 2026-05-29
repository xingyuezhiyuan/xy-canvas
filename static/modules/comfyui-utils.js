/**
 * ComfyUI 工具函数
 * 全局依赖: uploadCanvasUrlToComfy(), CLIENT_ID
 */

/**
 * 上传图片到 ComfyUI 并返回文件名
 */
async function comfyNameForRef(ref) {
    if (ref.comfy_name) return ref.comfy_name;
    if (!ref.url) throw new Error('缺少输入图片');
    return uploadCanvasUrlToComfy(ref.url);
}

/**
 * 运行 ComfyUI 超分放大
 */
async function runComfyUpscale(imageUrl, resolution) {
    if (!imageUrl) throw new Error('超分失败：缺少输入图片');
    const nextInput = await uploadCanvasUrlToComfy(imageUrl);
    const upscale = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            workflow_json: 'upscale.json',
            params: {
                "15": { image: nextInput },
                "172": { seed: Math.floor(Math.random() * 4294967295), resolution: Number(resolution || 2048) }
            },
            type: 'enhance',
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '超分失败'); return r.json(); });
    if (upscale.error) throw new Error(`超分失败：${upscale.error}`);
    if (!upscale.images?.length) throw new Error('超分失败：未返回图片');
    return upscale.images || [];
}

// 导出到全局
window.comfyNameForRef = comfyNameForRef;
window.runComfyUpscale = runComfyUpscale;
