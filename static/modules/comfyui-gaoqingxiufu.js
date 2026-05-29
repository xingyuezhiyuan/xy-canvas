/**
 * 高清修复模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID
 */

/**
 * 高清修复模式设置
 */
function gaoqingxiufuSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">提示词</div><input class="setting-input" data-field="gqPrompt" type="text" value="${node.gqPrompt || ''}" placeholder="可选，留空使用默认"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">缩放至长度</div><input class="setting-input" data-field="gqSize" type="number" min="512" max="4096" step="64" value="${Number(node.gqSize || 1536)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">随机种子</div><input class="setting-input" data-field="gqSeed" type="number" min="0" max="999999999999999" value="${Number(node.gqSeed || 385997506968388)}"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">降噪强度</div><input class="setting-input" type="range" min="0" max="1" step="0.01" data-field="gqDenoise" value="${Number(node.gqDenoise || 0.3)}"><span class="range-val">${Number(node.gqDenoise || 0.3).toFixed(2)}</span></label>
        </div>
    `;
}

/**
 * 高清修复模式执行
 */
async function gaoqingxiufuExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);
    
    // 内嵌高清修复工作流（18个节点）
    const workflow = {
        "29": {
            "inputs": { "pixels": ["428", 0], "vae": ["37", 0] },
            "class_type": "VAEEncode",
            "_meta": { "title": "VAE编码" }
        },
        "30": {
            "inputs": { "conditioning": ["41", 0], "latent": ["29", 0] },
            "class_type": "ReferenceLatent",
            "_meta": { "title": "参考Latent" }
        },
        "31": {
            "inputs": { "conditioning": ["39", 0], "latent": ["29", 0] },
            "class_type": "ReferenceLatent",
            "_meta": { "title": "参考Latent" }
        },
        "32": {
            "inputs": { "samples": ["372", 0], "vae": ["37", 0] },
            "class_type": "VAEDecode",
            "_meta": { "title": "VAE解码" }
        },
        "34": {
            "inputs": { "clip_name": "qwen_3_8b_fp8mixed.safetensors", "type": "flux2", "device": "default" },
            "class_type": "CLIPLoader",
            "_meta": { "title": "加载CLIP" }
        },
        "37": {
            "inputs": { "vae_name": "flux2-vae.safetensors" },
            "class_type": "VAELoader",
            "_meta": { "title": "加载VAE" }
        },
        "39": {
            "inputs": { "conditioning": ["41", 0] },
            "class_type": "ConditioningZeroOut",
            "_meta": { "title": "条件零化" }
        },
        "41": {
            "inputs": {
                "text": prompt || "高清修复，最佳画质",
                "嵌入提示词": null,
                "clip": ["34", 0]
            },
            "class_type": "CLIPTextEncode",
            "_meta": { "title": "CLIP文本编码器" }
        },
        "43": {
            "inputs": { "unet_name": "Flux2-Klein-9B-True-v2-fp8mixed.safetensors", "weight_dtype": "default" },
            "class_type": "UNETLoader",
            "_meta": { "title": "UNET加载器" }
        },
        "46": {
            "inputs": { "image": inputName },
            "class_type": "LoadImage",
            "_meta": { "title": "加载图像" }
        },
        "65": {
            "inputs": {
                "method": "mkl",
                "strength": 0.6,
                "multithread": true,
                "image_ref": ["428", 0],
                "image_target": ["32", 0]
            },
            "class_type": "ColorMatch",
            "_meta": { "title": "图像调色" }
        },
        "367": {
            "inputs": { "noise_seed": Number(node.gqSeed || 385997506968388) },
            "class_type": "RandomNoise",
            "_meta": { "title": "随机噪波" }
        },
        "372": {
            "inputs": {
                "noise": ["367", 0],
                "guider": ["373", 0],
                "sampler": ["374", 0],
                "sigmas": ["430", 0],
                "latent_image": ["29", 0]
            },
            "class_type": "SamplerCustomAdvanced",
            "_meta": { "title": "自定义采样器(高级)" }
        },
        "373": {
            "inputs": {
                "cfg": 1,
                "model": ["43", 0],
                "positive": ["30", 0],
                "negative": ["31", 0]
            },
            "class_type": "CFGGuider",
            "_meta": { "title": "CFG引导" }
        },
        "374": {
            "inputs": { "sampler_name": "euler" },
            "class_type": "KSamplerSelect",
            "_meta": { "title": "K采样器选择" }
        },
        "427": {
            "inputs": {
                "reserved": 0.6,
                "mode": "auto",
                "seed": 516370609521328,
                "auto_max_reserved": 0,
                "clean_gpu_before": true
            },
            "class_type": "ReservedVRAMSetter",
            "_meta": { "title": " ⚙️设置预留虚拟内存（GB）" }
        },
        "428": {
            "inputs": {
                "aspect_ratio": "original",
                "proportional_width": 1,
                "proportional_height": 1,
                "fit": "letterbox",
                "method": "lanczos",
                "round_to_multiple": "8",
                "scale_to_side": "longest",
                "scale_to_length": Number(node.gqSize || 1536),
                "background_color": "#000000",
                "image": ["46", 0]
            },
            "class_type": "LayerUtility: ImageScaleByAspectRatio V2",
            "_meta": { "title": "图层工具：按宽高比缩放_V2" }
        },
        "429": {
            "inputs": {
                "purge_cache": true,
                "purge_models": true,
                "anything": ["65", 0]
            },
            "class_type": "LayerUtility: PurgeVRAM",
            "_meta": { "title": "图层工具：清除虚拟内存" }
        },
        "430": {
            "inputs": {
                "scheduler": "simple",
                "steps": 6,
                "denoise": Number(node.gqDenoise || 0.3),
                "model": ["43", 0]
            },
            "class_type": "BasicScheduler",
            "_meta": { "title": "基础调度器" }
        },
        "432": {
            "inputs": {
                "custom_path": "",
                "filename_prefix": "comfyui",
                "timestamp": "None",
                "format": "png",
                "quality": 80,
                "meta_data": false,
                "blind_watermark": "",
                "save_workflow_as_json": false,
                "preview": true,
                "images": ["65", 0]
            },
            "class_type": "LayerUtility: SaveImagePlus",
            "_meta": { "title": "图层工具：保存图像增强版(高级)" }
        }
    };
    
    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: prompt || "高清修复，最佳画质",
            workflow_data: workflow,
            type: 'gaoqingxiufu',
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '高清修复失败'); return r.json(); });
    
    if (result.error) throw new Error(`高清修复失败：${result.error}`);
    if (!result.images?.length) throw new Error('高清修复失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.gaoqingxiufu = {
    label: '高清修复',
    requiresImage: true,
    tooltip: '提升图像分辨率和清晰度，修复细节瑕疵',
    settings: gaoqingxiufuSettings,
    execute: gaoqingxiufuExecute
};
