/**
 * 视角转换模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID
 */

/**
 * 视角转换模式设置
 */
function qwenEditSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">视角提示词</div><input class="setting-input" data-field="qePrompt" type="text" value="${node.qePrompt || ''}" placeholder="描述想要的视角，如：从正面看"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">图像最长边</div><input class="setting-input" data-field="qeSize" type="number" min="512" max="2048" step="64" value="${Number(node.qeSize || 1024)}"></label>
        </div>
    `;
}

/**
 * 视角转换模式执行
 */
async function qwenEditExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);
    
    const workflowData = {
        "1": {
            "inputs": { "prompt": node.qePrompt || prompt || "", "clip": ["4", 0], "vae": ["3", 0], "image1": ["11", 0] },
            "class_type": "TextEncodeQwenImageEditPlus",
            "_meta": { "title": "文本编码（QwenImageEditPlus）" }
        },
        "2": { "inputs": { "pixels": ["11", 0], "vae": ["3", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE编码" } },
        "3": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "加载VAE" } },
        "4": { "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "加载CLIP" } },
        "5": { "inputs": { "lora_name": "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1, "model": ["6", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA加载器（仅模型）" } },
        "6": { "inputs": { "lora_name": "qwen-image-edit-2511-multiple-angles-lora.safetensors", "strength_model": 1, "model": ["7", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "LoRA加载器（仅模型）" } },
        "7": { "inputs": { "unet_name": "qwen_image_edit_2511_fp8mixed.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "UNet加载器" } },
        "8": { "inputs": { "text": "", "clip": ["4", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP文本编码器" } },
        "11": {
            "inputs": {
                "aspect_ratio": "original",
                "proportional_width": 1,
                "proportional_height": 1,
                "fit": "crop",
                "method": "lanczos",
                "round_to_multiple": "8",
                "scale_to_side": "longest",
                "scale_to_length": Number(node.qeSize || 1024),
                "background_color": "#000000",
                "image": ["14", 0]
            },
            "class_type": "LayerUtility: ImageScaleByAspectRatio V2",
            "_meta": { "title": "图层工具：按宽高比缩放 V2" }
        },
        "13": { "inputs": { "filename_prefix": "Qwen_Edit_2511", "images": ["21", 0] }, "class_type": "SaveImage", "_meta": { "title": "保存图像" } },
        "14": { "inputs": { "image": inputName }, "class_type": "LoadImage", "_meta": { "title": "加载图像" } },
        "16": { "inputs": { "shift": 3.1, "model": ["5", 0] }, "class_type": "ModelSamplingAuraFlow", "_meta": { "title": "采样算法（AuraFlow）" } },
        "17": { "inputs": { "strength": 1, "model": ["16", 0] }, "class_type": "CFGNorm", "_meta": { "title": "CFG归一化" } },
        "18": { "inputs": { "reference_latents_method": "index_timestep_zero", "conditioning": ["8", 0] }, "class_type": "FluxKontextMultiReferenceLatentMethod", "_meta": { "title": "FluxKontext多参考潜在方法" } },
        "19": { "inputs": { "reference_latents_method": "index_timestep_zero", "conditioning": ["1", 0] }, "class_type": "FluxKontextMultiReferenceLatentMethod", "_meta": { "title": "FluxKontext多参考潜在方法" } },
        "20": {
            "inputs": {
                "seed": Number(node.qeSeed || 411725770964575),
                "steps": 6,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1,
                "model": ["17", 0],
                "positive": ["19", 0],
                "negative": ["18", 0],
                "latent_image": ["2", 0]
            },
            "class_type": "KSampler",
            "_meta": { "title": "KSampler" }
        },
        "21": { "inputs": { "samples": ["20", 0], "vae": ["3", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE解码" } },
        "55": { "inputs": { "text": node.qePrompt || prompt || "" }, "class_type": "CR Text", "_meta": { "title": "文本" } }
    };
    
    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: node.qePrompt || prompt || "",
            workflow_data: workflowData,
            type: 'qwen_edit',
            params: {
                "14": { image: inputName },
                "1": { prompt: node.qePrompt || prompt || "" },
                "55": { text: node.qePrompt || prompt || "" },
                "11": { scale_to_length: Number(node.qeSize || 1024) },
                "20": { seed: Number(node.qeSeed || 411725770964575) }
            },
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '视角转换失败'); return r.json(); });
    
    if (result.error) throw new Error(`视角转换失败：${result.error}`);
    if (!result.images?.length) throw new Error('视角转换失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.qwen_edit = {
    label: '视角转换',
    requiresImage: true,
    tooltip: '改变图像的拍摄视角，如正面、俯视、仰视等',
    settings: qwenEditSettings,
    execute: qwenEditExecute
};
