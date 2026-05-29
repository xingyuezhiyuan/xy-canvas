/**
 * 图像反推模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID
 */

/**
 * Promptgen 模式设置
 */
function promptgenSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">预设提示词风格</div>
                <select class="setting-input" data-field="pgPreset">
                    <option value="Prompt Style - Extreme Detailed"${node.pgPreset === 'Prompt Style - Extreme Detailed' ? ' selected' : ''}>Extreme Detailed</option>
                    <option value="Prompt Style - Simple"${node.pgPreset === 'Prompt Style - Simple' ? ' selected' : ''}>Simple</option>
                    <option value="Prompt Style - Artistic"${node.pgPreset === 'Prompt Style - Artistic' ? ' selected' : ''}>Artistic</option>
                    <option value="Prompt Style - Technical"${node.pgPreset === 'Prompt Style - Technical' ? ' selected' : ''}>Technical</option>
                </select>
            </label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">提示词</div><input class="setting-input" data-field="pgPrompt" type="text" value="${node.pgPrompt || '描述这个图像，只输出结果'}" placeholder="自定义提示词"></label>
        </div>
        <div class="gen-settings-row">
            <label class="field"><div class="setting-title">随机种子</div><input class="setting-input" data-field="pgSeed" type="number" min="0" max="999999999999999" value="${Number(node.pgSeed || 498061195854013)}"></label>
        </div>
    `;
}

/**
 * Promptgen 模式执行
 */
async function promptgenExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);
    const promptText = node.pgPrompt || prompt || "描述这个图像，只输出结果";
    const seed = Number(node.pgSeed || 498061195854013);
    const preset = node.pgPreset || "Prompt Style - Extreme Detailed";

    // 内嵌图像反推工作流（5个节点）
    const workflow = {
        "3": {
            "inputs": {
                "preset_prompt": preset,
                "custom_prompt": promptText,
                "system_prompt": "",
                "inference_mode": "one by one",
                "max_frames": 24,
                "max_size": 256,
                "seed": seed,
                "force_offload": false,
                "save_states": false,
                "llama_model": ["13", 0],
                "parameters": ["5", 0],
                "images": ["6", 0]
            },
            "class_type": "llama_cpp_instruct_adv",
            "_meta": { "title": "llama_cpp_指令（高级）" }
        },
        "5": {
            "inputs": {
                "max_tokens": 1024,
                "top_k": 30,
                "top_p": 0.9,
                "min_p": 0.05,
                "typical_p": 1,
                "temperature": 0.8,
                "repeat_penalty": 1,
                "frequency_penalty": 0,
                "presence_penalty": 1,
                "mirostat_mode": 0,
                "mirostat_eta": 0.1,
                "mirostat_tau": 5,
                "state_uid": -1
            },
            "class_type": "llama_cpp_parameters",
            "_meta": { "title": "llama_cpp_参数" }
        },
        "6": {
            "inputs": { "image": inputName },
            "class_type": "LoadImage",
            "_meta": { "title": "加载图像" }
        },
        "13": {
            "inputs": {
                "model": "Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-Q8_0.gguf",
                "mmproj": "mmproj-Qwen3.5-9B-Uncensored-HauhauCS-Aggressive-BF16.gguf",
                "chat_handler": "Qwen3.5",
                "n_ctx": 8192,
                "vram_limit": -1,
                "image_min_tokens": 0,
                "image_max_tokens": 0
            },
            "class_type": "llama_cpp_model_loader",
            "_meta": { "title": "Llama-Cpp 模型加载器" }
        },
        "15": {
            "inputs": {
                "text_undefined": "",
                "text": ["3", 0]
            },
            "class_type": "ShowText|pysssss",
            "_meta": { "title": "展示文本🐍" }
        }
    };

    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: promptText,
            workflow_data: workflow,
            type: 'promptgen',
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).detail || '图像反推失败'); return r.json(); });
    
    if (result.error) throw new Error(`图像反推失败：${result.error}`);
    if (!result.text) throw new Error('图像反推失败：未返回文本');
    return { images: result.images || [], text: result.text };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.promptgen = {
    label: '图像反推',
    requiresImage: true,
    returnsText: true,
    tooltip: '根据图像自动生成描述性提示词',
    settings: promptgenSettings,
    execute: promptgenExecute
};
