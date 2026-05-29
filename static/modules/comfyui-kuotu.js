/**
 * 扩图模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID
 */

/**
 * 扩图模式设置
 */
function kuotuSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">目标尺寸</div><input class="setting-input" data-field="ktSize" type="number" min="512" max="4096" step="64" value="${Number(node.ktSize || 1024)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">左扩展</div><input class="setting-input" data-field="ktLeft" type="number" min="0" max="2000" value="${Number(node.ktLeft || 504)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">上扩展</div><input class="setting-input" data-field="ktTop" type="number" min="0" max="2000" value="${Number(node.ktTop || 0)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">右扩展</div><input class="setting-input" data-field="ktRight" type="number" min="0" max="2000" value="${Number(node.ktRight || 504)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">下扩展</div><input class="setting-input" data-field="ktBottom" type="number" min="0" max="2000" value="${Number(node.ktBottom || 0)}"></label>
        </div>
    `;
}

/**
 * 扩图模式执行
 */
async function kuotuExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);
    
    const workflowData = {
        "10": { "inputs": { "vae_name": "flux2-vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "加载VAE" } },
        "11": { "inputs": { "conditioning": ["19", 0] }, "class_type": "ConditioningZeroOut", "_meta": { "title": "条件零化" } },
        "13": { "inputs": { "unet_name": "flux-2-klein-9b-fp8.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "UNET加载器" } },
        "14": { "inputs": { "clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "加载CLIP" } },
        "17": { "inputs": { "samples": ["95", 0], "vae": ["10", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE解码" } },
        "19": { "inputs": { "text": node.ktPrompt || prompt || "移除绿色区域", "clip": ["14", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP文本编码器" } },
        "62": { "inputs": { "filename_prefix": "ComfyUI", "images": ["124", 0] }, "class_type": "SaveImage", "_meta": { "title": "保存图像" } },
        "63": { "inputs": { "image": inputName }, "class_type": "LoadImage", "_meta": { "title": "加载图像" } },
        "73": { "inputs": { "conditioning": ["11", 0], "latent": ["75", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent" } },
        "74": { "inputs": { "conditioning": ["19", 0], "latent": ["75", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent" } },
        "75": { "inputs": { "pixels": ["123", 0], "vae": ["10", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE编码" } },
        "83": { "inputs": { "width": ["131", 3], "height": ["131", 4], "batch_size": 1 }, "class_type": "EmptyFlux2LatentImage", "_meta": { "title": "Flux2代 空Latent" } },
        "95": { "inputs": { "seed": Number(node.ktSeed || 45157923637773), "steps": 6, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["13", 0], "positive": ["74", 0], "negative": ["73", 0], "latent_image": ["83", 0] }, "class_type": "KSampler", "_meta": { "title": "K采样器" } },
        "108": { "inputs": { "left": Number(node.ktLeft || 504), "top": Number(node.ktTop || 0), "right": Number(node.ktRight || 504), "bottom": Number(node.ktBottom || 0), "feathering": 0, "image": ["116", 0] }, "class_type": "ImagePadForOutpaint", "_meta": { "title": "外补画板" } },
        "116": { "inputs": { "upscale_method": "lanczos", "megapixels": 1, "resolution_steps": 1, "image": ["63", 0] }, "class_type": "ImageScaleToTotalPixels", "_meta": { "title": "缩放图像（像素）" } },
        "123": { "inputs": { "color": "0, 255, 0", "device": "cpu", "image": ["131", 0], "mask": ["131", 1] }, "class_type": "DrawMaskOnImage", "_meta": { "title": "合并图像与遮罩" } },
        "124": { "inputs": { "method": "mkl", "strength": 0.4, "multithread": true, "image_ref": ["116", 0], "image_target": ["17", 0] }, "class_type": "ColorMatch", "_meta": { "title": "图像调色" } },
        "131": { "inputs": { "aspect_ratio": "original", "proportional_width": 1, "proportional_height": 1, "fit": "letterbox", "method": "lanczos", "round_to_multiple": "8", "scale_to_side": "longest", "scale_to_length": Number(node.ktSize || 1024), "background_color": "#000000", "image": ["108", 0], "mask": ["108", 1] }, "class_type": "LayerUtility: ImageScaleByAspectRatio V2", "_meta": { "title": "图层工具：按宽高比缩放_V2" } }
    };
    
    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: node.ktPrompt || prompt || "移除绿色区域",
            workflow_data: workflowData,
            type: 'kuotu',
            params: {
                "63": { image: inputName },
                "19": { text: node.ktPrompt || prompt || "移除绿色区域" },
                "95": { seed: Number(node.ktSeed || 45157923637773) },
                "108": { left: Number(node.ktLeft || 504), top: Number(node.ktTop || 0), right: Number(node.ktRight || 504), bottom: Number(node.ktBottom || 0) },
                "131": { scale_to_length: Number(node.ktSize || 1024) }
            },
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '扩图失败'); return r.json(); });
    
    if (result.error) throw new Error(`扩图失败：${result.error}`);
    if (!result.images?.length) throw new Error('扩图失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.kuotu = {
    label: '扩图',
    requiresImage: true,
    tooltip: '智能扩展图像画布，可分别设置上下左右的扩展像素',
    settings: kuotuSettings,
    execute: kuotuExecute
};
