/**
 * ComfyUI 模式提示模块
 * 为 ComfyUI 节点模式选项卡添加 hover 提示引导词
 * 
 * 使用方式：在 ComfyUIRegistry 模式的配置中添加 tooltip 字段即可
 * 示例：
 *   ComfyUIRegistry.styleTransfer = {
 *       label: '风格迁移',
 *       tooltip: '需要接入两张图片...',
 *       ...
 *   };
 */

(function() {
    'use strict';

    let tooltipEl = null;

    function injectTooltipCSS() {
        if (document.getElementById('comfyui-tooltip-styles')) return;
        const style = document.createElement('style');
        style.id = 'comfyui-tooltip-styles';
        style.textContent = `
            .comfy-mode-tooltip {
                position: fixed;
                z-index: 999999;
                background: rgba(15, 23, 42, 0.92);
                color: #fff;
                font-size: 13px;
                line-height: 1.6;
                padding: 8px 14px;
                border-radius: 8px;
                pointer-events: none;
                white-space: nowrap;
                max-width: 420px;
                opacity: 0;
                transition: opacity 0.12s ease;
                font-weight: 400;
                letter-spacing: 0.01em;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            }
            .comfy-mode-tooltip.visible {
                opacity: 1;
            }
        `;
        document.head.appendChild(style);
    }

    function createTooltip() {
        if (tooltipEl) return;
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'comfy-mode-tooltip';
        document.body.appendChild(tooltipEl);
    }

    function showTooltip(text, x, y) {
        if (!tooltipEl) createTooltip();
        tooltipEl.textContent = text;
        tooltipEl.style.left = x + 'px';
        tooltipEl.style.top = y + 'px';
        tooltipEl.classList.add('visible');
    }

    function hideTooltip() {
        if (tooltipEl) tooltipEl.classList.remove('visible');
    }

    function bindTooltip(btn) {
        if (btn._comfyTooltipBound) return;
        btn._comfyTooltipBound = true;

        const modeKey = btn.dataset.mode;
        const config = window.ComfyUIRegistry?.[modeKey];
        const tipText = config?.tooltip;
        if (!tipText) return;

        let showTimer = null;

        btn.addEventListener('mouseenter', function(e) {
            clearTimeout(showTimer);
            showTimer = setTimeout(() => {
                const rect = this.getBoundingClientRect();
                let x = rect.left;
                let y = rect.bottom + 6;
                if (x + 400 > window.innerWidth) {
                    x = window.innerWidth - 410;
                }
                showTooltip(tipText, x, y);
            }, 300);
        });

        btn.addEventListener('mouseleave', function() {
            clearTimeout(showTimer);
            hideTooltip();
        });
    }

    function scanModeTabs() {
        document.querySelectorAll('.mode-tabs [data-mode]').forEach(bindTooltip);
    }

    function init() {
        injectTooltipCSS();
        createTooltip();

        const observer = new MutationObserver(scanModeTabs);
        observer.observe(document.body, { childList: true, subtree: true });

        scanModeTabs();
    }

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
