/**
 * 抠半透明模式
 * 全局依赖: ComfyUIRegistry, comfyNameForRef, uploadMaskOnly, CLIENT_ID
 */

/**
 * 抠半透明模式设置
 */
function sdmatteSettings(node) {
    return `
        <div class="gen-settings-row">
            <label class="field">
                <div class="setting-title">推理尺寸</div>
                <input class="setting-input" data-field="sdmatteInferenceSize" type="number" 
                       min="512" max="2048" step="64" 
                       value="${Number(node.sdmatteInferenceSize || 1024)}">
            </label>
        </div>
        <div class="gen-settings-row">
            <label class="field">
                <div class="setting-title">遮罩优化</div>
                <select class="setting-input" data-field="sdmatteMaskRefine">
                    <option value="true"${node.sdmatteMaskRefine !== 'false' ? ' selected' : ''}>开启</option>
                    <option value="false"${node.sdmatteMaskRefine === 'false' ? ' selected' : ''}>关闭</option>
                </select>
            </label>
        </div>
        <div class="gen-settings-row">
            <label class="field">
                <div class="setting-title">遮罩约束</div>
                <input class="setting-input" data-field="sdmatteTrimapConstraint" type="number" 
                       min="0" max="1" step="0.1" 
                       value="${Number(node.sdmatteTrimapConstraint || 0.8)}">
            </label>
        </div>
    `;
}

/**
 * 抠半透明模式执行
 */
async function sdmatteExecute(node, refs, prompt, promptId) {
    const ref = refs[0];
    
    let inputName, maskName;
    if (ref.mask) {
        inputName = await comfyNameForRef(ref);
        maskName = await uploadMaskOnly(ref.mask);
    } else {
        inputName = await comfyNameForRef(ref);
        maskName = null;
    }
    
    const workflowData = {
        "1": {
            "inputs": {
                "image": inputName
            },
            "class_type": "LoadImage",
            "_meta": {
                "title": "加载图像"
            }
        },
        "4": {
            "inputs": {
                "image": [
                    "72",
                    0
                ],
                "alpha": [
                    "56",
                    0
                ]
            },
            "class_type": "JoinImageWithAlpha",
            "_meta": {
                "title": "合并图像Alpha"
            }
        },
        "8": {
            "inputs": {
                "filename_prefix": "透明2",
                "images": [
                    "4",
                    0
                ]
            },
            "class_type": "SaveImage",
            "_meta": {
                "title": "保存图像"
            }
        },
        "54": {
            "inputs": {
                "ckpt_name": "SDMatte_plus.safetensors",
                "inference_size": Number(node.sdmatteInferenceSize || 1024),
                "is_transparent": false,
                "output_mode": "matted_rgb",
                "mask_refine": node.sdmatteMaskRefine !== 'false',
                "trimap_constraint": Number(node.sdmatteTrimapConstraint || 0.8),
                "force_cpu": false,
                "image": [
                    "72",
                    0
                ],
                "trimap": [
                    "72",
                    1
                ]
            },
            "class_type": "SDMatteApply",
            "_meta": {
                "title": "应用SDMatte"
            }
        },
        "56": {
            "inputs": {
                "mask": [
                    "54",
                    0
                ]
            },
            "class_type": "LayerMask: MaskInvert",
            "_meta": {
                "title": "图层遮罩：遮罩反转"
            }
        },
        "72": {
            "inputs": {
                "invert_mask": false,
                "detect": "mask_area",
                "top_reserve": 20,
                "bottom_reserve": 20,
                "left_reserve": 20,
                "right_reserve": 20,
                "round_to_multiple": "8",
                "image": [
                    "1",
                    0
                ],
                "mask": [
                    "73",
                    0
                ]
            },
            "class_type": "LayerUtility: CropByMask V2",
            "_meta": {
                "title": "图层工具：遮罩裁剪_V2"
            }
        },
        "73": maskName ? {
            "inputs": {
                "image": maskName,
                "channel": "red"
            },
            "class_type": "LoadImageMask",
            "_meta": {
                "title": "加载图像遮罩"
            }
        } : {
            "inputs": {
                "masks": [
                    "1",
                    1
                ]
            },
            "class_type": "Mask Fill Holes",
            "_meta": {
                "title": "遮罩填充漏洞"
            }
        }
    };
    
    const result = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: prompt || "抠半透明",
            workflow_data: workflowData,
            type: 'sdmatte',
            client_id: CLIENT_ID,
            canvas_id: window.canvas?.id || ''
        })
    }).then(async r => { 
        if (!r.ok) throw new Error((await r.json()).detail || '抠半透明失败'); 
        return r.json(); 
    });
    
    if (result.error) throw new Error(`抠半透明失败：${result.error}`);
    if (!result.images?.length) throw new Error('抠半透明失败：未返回图片');
    return { images: result.images || [] };
}

// 注册到 ComfyUI 注册表
ComfyUIRegistry.sdmatte = {
    label: '抠半透明',
    requiresImage: true,
    tooltip: '需要在图像节点双击，用遮罩工具涂抹全部你需要抠出的半透明物体如玻璃、烟雾等',
    settings: sdmatteSettings,
    execute: sdmatteExecute
};
