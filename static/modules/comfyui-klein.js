/**
 * Klein 图像编辑模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID
 */

/**
 * Klein 模式设置
 */
function kleinSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">缩放最长边</div><input class="setting-input" data-field="kleinSize" type="number" min="512" max="2048" step="64" value="${Number(node.kleinSize || 1024)}"></label>
        </div>
        <div class="gen-settings-row">
            <button type="button" class="setting-check ${node.kleinIgnoreRef ? 'active' : ''}" data-toggle-field="kleinIgnoreRef"><span class="check-dot"></span>忽略参考图</button>
        </div>
    `;
}

/**
 * Klein 模式执行
 */
async function kleinExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);
    const refName = refs[1] ? await comfyNameForRef(refs[1]) : inputName;
    const promptText = prompt || "图像编辑";
    const seed = Number(node.kleinSeed || Math.floor(Math.random() * 10**15));
    const size = Number(node.kleinSize || 1024);
    const ignoreRef = Boolean(node.kleinIgnoreRef ?? true);

    const workflowData = {
        "1": { "inputs": { "sampler_name": "euler" }, "class_type": "KSamplerSelect", "_meta": { "title": "K采样器选择" } },
        "2": { "inputs": { "vae_name": "flux2-vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "加载VAE" } },
        "3": { "inputs": { "upscale_method": "nearest-exact", "megapixels": 1, "resolution_steps": 1, "image": ["35", 0] }, "class_type": "ImageScaleToTotalPixels", "_meta": { "title": "缩放图像（像素）" } },
        "4": { "inputs": { "image": refName }, "class_type": "LoadImage", "_meta": { "title": "加载图像-参考图" } },
        "5": { "inputs": { "conditioning": ["17", 0], "latent": ["6", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent-负向" } },
        "6": { "inputs": { "pixels": ["3", 0], "vae": ["2", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE编码-参考图" } },
        "7": { "inputs": { "conditioning": ["18", 0], "latent": ["6", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent-正向" } },
        "8": { "inputs": { "image": inputName }, "class_type": "LoadImage", "_meta": { "title": "加载图像-主图" } },
        "10": { "inputs": { "image": ["33", 0] }, "class_type": "GetImageSize", "_meta": { "title": "获取图像尺寸" } },
        "11": { "inputs": { "width": ["10", 0], "height": ["10", 1], "batch_size": 1 }, "class_type": "EmptyFlux2LatentImage", "_meta": { "title": "Flux2代 空Latent" } },
        "12": { "inputs": { "steps": 6, "width": ["10", 0], "height": ["10", 1] }, "class_type": "Flux2Scheduler", "_meta": { "title": "Flux2代 调度器" } },
        "13": { "inputs": { "cfg": 1, "model": ["14", 0], "positive": ["32", 0], "negative": ["34", 0] }, "class_type": "CFGGuider", "_meta": { "title": "CFG引导" } },
        "14": { "inputs": { "unet_name": "Flux2-Klein-9B-True-v2-fp8mixed.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "UNET加载器" } },
        "15": { "inputs": { "clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "加载CLIP" } },
        "16": { "inputs": { "text": promptText }, "class_type": "CR Text", "_meta": { "title": "🔤 文本" } },
        "17": { "inputs": { "conditioning": ["24", 0], "latent": ["19", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent-主图负向" } },
        "18": { "inputs": { "conditioning": ["25", 0], "latent": ["19", 0] }, "class_type": "ReferenceLatent", "_meta": { "title": "参考Latent-主图正向" } },
        "19": { "inputs": { "pixels": ["33", 0], "vae": ["2", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE编码-主图" } },
        "20": { "inputs": { "noise": ["23", 0], "guider": ["13", 0], "sampler": ["1", 0], "sigmas": ["12", 0], "latent_image": ["11", 0] }, "class_type": "SamplerCustomAdvanced", "_meta": { "title": "自定义采样器(高级)" } },
        "21": { "inputs": { "samples": ["20", 0], "vae": ["2", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE解码" } },
        "22": { "inputs": { "filename_prefix": "Flux2-Klein-4b-base", "images": ["21", 0] }, "class_type": "SaveImage", "_meta": { "title": "保存图像" } },
        "23": { "inputs": { "noise_seed": seed }, "class_type": "RandomNoise", "_meta": { "title": "随机噪波" } },
        "24": { "inputs": { "text": "", "嵌入提示词": null, "clip": ["15", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode ( Negative Prompt)" } },
        "25": { "inputs": { "text": ["16", 0], "嵌入提示词": null, "clip": ["15", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
        "29": { "inputs": { "value": false }, "class_type": "PrimitiveBoolean", "_meta": { "title": "布尔值" } },
        "31": { "inputs": { "value": ignoreRef }, "class_type": "PrimitiveBoolean", "_meta": { "title": "忽略参考图" } },
        "32": { "inputs": { "switch": ["31", 0], "on_false": ["7", 0], "on_true": ["18", 0] }, "class_type": "ComfySwitchNode", "_meta": { "title": "开关-正向" } },
        "34": { "inputs": { "switch": ["31", 0], "on_false": ["5", 0], "on_true": ["17", 0] }, "class_type": "ComfySwitchNode", "_meta": { "title": "开关-负向" } },
        "35": { "inputs": { "switch": ["31", 0], "on_false": ["4", 0], "on_true": ["8", 0] }, "class_type": "ComfySwitchNode", "_meta": { "title": "开关-参考图输入" } },
        "33": { "inputs": { "aspect_ratio": "original", "proportional_width": 1, "proportional_height": 1, "fit": "letterbox", "method": "lanczos", "round_to_multiple": "8", "scale_to_side": "longest", "scale_to_length": size, "background_color": "#000000", "image": ["8", 0] }, "class_type": "LayerUtility: ImageScaleByAspectRatio V2", "_meta": { "title": "图层工具：按宽高比缩放_V2" } }
    };

    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: promptText,
            workflow_data: workflowData,
            type: 'klein',
            params: {
                "8": { image: inputName },
                "4": { image: refName },
                "16": { text: promptText },
                "23": { noise_seed: seed },
                "33": { scale_to_length: size },
                "31": { value: ignoreRef }
            },
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '图像编辑失败'); return r.json(); });
    
    if (result.error) throw new Error(`图像编辑失败：${result.error}`);
    if (!result.images?.length) throw new Error('图像编辑失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.klein = {
    label: '图像编辑',
    requiresImage: true,
    tooltip: '接入一张主图（可选参考图），输入提示词描述编辑效果',
    settings: kleinSettings,
    execute: kleinExecute
};
