/**
 * 简单去背景模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, CLIENT_ID（ComfyUI 节点模式）
 * 同时保留 window.jiandanBeijing API 供 online.html 等独立页面使用
 * 所有请求通过后端代理，不走 ComfyUI 直连
 */

// ======== ComfyUI 节点模式（无限画布中使用） ========

/**
 * 简单去背景模式设置
 */
function jiandanbeijingSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field">
                <div class="setting-title">加速模式</div>
                <select class="setting-input" data-field="jiandanTorch">
                    <option value="default"${node.jiandanTorch !== 'off' ? ' selected' : ''}>启用 TorchScript</option>
                    <option value="off"${node.jiandanTorch === 'off' ? ' selected' : ''}>禁用 TorchScript</option>
                </select>
            </label>
        </div>
    `;
}

/**
 * 简单去背景模式执行（画布节点调用）
 */
async function jiandanbeijingExecute(node, refs, prompt, promptId) {
    const inputName = await comfyNameForRef(refs[0]);

    const workflowData = {
        "2": {
            "inputs": { "images": ["4", 0] },
            "class_type": "PreviewImage",
            "_meta": { "title": "预览图像" }
        },
        "3": {
            "inputs": { "image": inputName },
            "class_type": "LoadImage",
            "_meta": { "title": "加载图像" }
        },
        "4": {
            "inputs": {
                "torchscript_jit": node.jiandanTorch === 'off' ? 'disabled' : 'default',
                "image": ["3", 0]
            },
            "class_type": "InspyrenetRembg",
            "_meta": { "title": "InspyrenetRembg" }
        }
    };

    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: prompt || "去除背景",
            workflow_data: workflowData,
            type: 'jiandanbeijing',
            params: {
                "3": { image: inputName },
                "4": { torchscript_jit: node.jiandanTorch === 'off' ? 'disabled' : 'default' }
            },
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => {
        if (!r.ok) throw new Error((await r.json()).detail || '去背景失败');
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        return data;
    });

    if (result.error) throw new Error(`去背景失败：${result.error}`);
    if (!result.images?.length) throw new Error('去背景失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
if (typeof ComfyUIRegistry !== 'undefined') {
    ComfyUIRegistry.jiandanbeijing = {
        label: '简单去背景',
        requiresImage: true,
        tooltip: '使用 InspyrenetRembg 去除图像背景',
        settings: jiandanbeijingSettings,
        execute: jiandanbeijingExecute
    };
}

// ======== 独立页面 API（online.html 等使用，后端代理模式） ========

/**
 * 上传图像到后端（后端会自动分发到可用的 ComfyUI 实例）
 */
async function jiandanUploadImage(imageUrl) {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error('图像下载失败');
    const blob = await response.blob();
    const filename = imageUrl.split('/').pop()?.split('?')[0] || 'remove_bg.png';
    const formData = new FormData();
    formData.append('files', blob, filename);
    const uploadResult = await fetch('/api/ai/upload', {
        method: 'POST',
        headers: headers,
        body: formData
    });
    if (!uploadResult.ok) throw new Error(`图片上传失败: ${await uploadResult.text()}`);
    const uploadData = await uploadResult.json();
    return uploadData.files?.[0]?.comfy_name || filename;
}

/**
 * 运行简单去背景工作流（通过后端代理）
 */
async function jiandanRunWorkflow(imageName) {
    const workflowData = {
        "2": {
            "inputs": { "images": ["4", 0] },
            "class_type": "PreviewImage",
            "_meta": { "title": "预览图像" }
        },
        "3": {
            "inputs": { "image": imageName },
            "class_type": "LoadImage",
            "_meta": { "title": "加载图像" }
        },
        "4": {
            "inputs": {
                "torchscript_jit": "default",
                "image": ["3", 0]
            },
            "class_type": "InspyrenetRembg",
            "_meta": { "title": "InspyrenetRembg" }
        }
    };

    // 支持代理模式：检测是否使用 ComfyUI 代理
    const headers = { 'Content-Type': 'application/json' };
    if (typeof IS_LOCAL_SERVER !== 'undefined' && !IS_LOCAL_SERVER && typeof COMFYUI_SERVER !== 'undefined') {
        headers['X-ComfyUI-Server-Url'] = COMFYUI_SERVER;
    }

    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            prompt: '去除背景',
            workflow_data: workflowData,
            type: 'online',
            params: {
                "3": { image: imageName }
            },
            client_id: typeof CLIENT_ID !== 'undefined' ? CLIENT_ID : ('online_' + Date.now())
        })
    });

    if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))).detail || response.statusText;
        throw new Error(detail);
    }

    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return result;
}

/**
 * 处理图片去除背景（独立页面使用）
 */
async function jiandanRemoveBackground(imageUrl) {
    const comfyImageName = await jiandanUploadImage(imageUrl);
    const result = await jiandanRunWorkflow(comfyImageName);
    if (result.error) throw new Error(result.error);
    if (!result.images?.length) throw new Error('未返回处理结果');
    return result.images[0];
}

window.jiandanBeijing = {
    removeBackground: jiandanRemoveBackground,
    uploadImage: jiandanUploadImage,
    runWorkflow: jiandanRunWorkflow
};
