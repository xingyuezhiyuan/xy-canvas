/**
 * PS Send 模块
 * 负责将 Output 节点的图像发送到 Photoshop
 * 通过上传图像到 ComfyUI 并调用 ps_send.json 工作流实现
 */

(function() {
    'use strict';
    
    let psSendDeps = null;
    
    /**
     * 初始化模块，接收 canvas.html 的依赖注入
     * @param {Object} canvasDeps - 画布依赖对象
     */
    function initPSSend(canvasDeps) {
        psSendDeps = canvasDeps;
    }
    
    /**
     * 验证 output 节点是否有可发送的图像
     * @param {Object} node - 节点对象
     * @returns {boolean}
     */
    function isOutputImageValid(node) {
        if (!node || node.type !== 'output') return false;
        const urls = node.images || [];
        return urls.length > 0 && urls.some(url => url && !url.startsWith('/assets/missing/'));
    }
    
    /**
     * 获取 output 节点的图像 URL 列表
     * @param {Object} node - 节点对象
     * @returns {string[]}
     */
    function getOutputImageUrls(node) {
        return (node.images || []).filter(url => url && !url.startsWith('/assets/missing/'));
    }
    
    /**
     * 上传图像到 ComfyUI 服务器
     * @param {string} imageUrl - 图像 URL
     * @returns {Promise<string>} ComfyUI 中的图像文件名
     */
    async function uploadImageToComfyUI(imageUrl) {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error('图像下载失败');
        }
        
        const blob = await response.blob();
        const filename = imageUrl.split('/').pop()?.split('?')[0] || 'output_image.png';
        
        const formData = new FormData();
        formData.append('files', blob, filename);
        
        const uploadResult = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResult.ok) {
            const errorText = await uploadResult.text();
            throw new Error(`图片上传失败: ${errorText}`);
        }
        
        const uploadData = await uploadResult.json();
        const comfyImageName = uploadData.files?.[0]?.comfy_name || filename;
        return comfyImageName;
    }
    
    /**
     * 执行 ps_send.json 工作流
     * @param {string} imageName - ComfyUI 中的图像文件名
     * @returns {Promise<Object>} 工作流执行结果
     */
    async function executePSSendWorkflow(imageName) {
        const payload = {
            fields: {
                'image': imageName
            },
            config: {
                fields: [{
                    node: '7',
                    input: 'image',
                    id: 'image',
                    type: 'image'
                }]
            },
            client_id: window.CLIENT_ID
        };
        
        const workflowResponse = await fetch('/api/workflows/ps_send.json/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!workflowResponse.ok) {
            const errorText = await workflowResponse.text();
            throw new Error(`工作流执行失败: ${errorText}`);
        }
        
        return await workflowResponse.json();
    }
    
    /**
     * 发送 output 节点的图像到 Photoshop
     * @param {string} nodeId - output 节点 ID
     */
    async function sendOutputImageToPhotoshop(nodeId) {
        const nodes = psSendDeps.getNodes();
        const node = nodes.find(n => n.id === nodeId);
        
        if (!node || node.type !== 'output') {
            console.error('[PS Send] Invalid node or not output type');
            return;
        }
        
        const urls = getOutputImageUrls(node);
        if (!urls.length) {
            alert('没有可发送的图片');
            return;
        }
        
        const imageUrl = urls[urls.length - 1];
        
        try {
            const comfyImageName = await uploadImageToComfyUI(imageUrl);
            await executePSSendWorkflow(comfyImageName);
            alert('已发送到Photoshop处理');
            
        } catch (err) {
            console.error('[PS Send] Error:', err);
            alert(`发送到Photoshop失败: ${err.message}`);
        }
    }
    
    // 导出模块
    window.psSend = {
        init: initPSSend,
        sendOutputImageToPhotoshop: sendOutputImageToPhotoshop,
        uploadImageToComfyUI: uploadImageToComfyUI,
        executePSSendWorkflow: executePSSendWorkflow,
        isOutputImageValid: isOutputImageValid
    };
    
    console.log('[PS Send Module] Loaded successfully');
})();
