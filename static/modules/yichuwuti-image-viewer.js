/**
 * 万物移除工具 - 图片查看器增强模块
 * 功能：鼠标滚轮缩放、键盘左右切换、按钮点击切换
 */

(function() {
    'use strict';

    let imageList = [];
    let currentIndex = 0;
    let currentScale = 1;
    let originalWidth = 0;
    let originalHeight = 0;

    function init(images, startIndex = 0) {
        imageList = images;
        currentIndex = startIndex;
        currentScale = 1;
        originalWidth = 0;
        originalHeight = 0;
        
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        setupEventListeners();
        showImage(currentIndex);
    }

    function setupEventListeners() {
        const lightbox = document.getElementById('lightbox');
        const img = document.getElementById('lightboxImg');
        
        if (!lightbox || !img) {
            console.error('lightbox 或 lightboxImg 元素不存在');
            return;
        }

        img.onwheel = handleWheel;
        
        window.addEventListener('keydown', handleKeyDown);
    }

    function handleWheel(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const img = document.getElementById('lightboxImg');
        if (!img || !img.naturalWidth) return;
        
        const oldZoom = currentScale;
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        currentScale = Math.max(0.15, Math.min(6.0, currentScale * factor));
        
        const lightboxRect = event.currentTarget.getBoundingClientRect();
        const mx = event.clientX - lightboxRect.left;
        const my = event.clientY - lightboxRect.top;
        const contentX = lightboxRect.width / 2 + (img.scrollLeft || 0);
        const contentY = lightboxRect.height / 2 + (img.scrollTop || 0);
        
        applyZoom();
        
        const scale = currentScale / oldZoom;
    }


    function handleMouseDown(event) {
    }

    function handleMouseMove(event) {
    }

    function handleMouseUp() {
    }

    function handleKeyDown(event) {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            prevImage();
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            nextImage();
        } else if (event.key === 'Escape') {
            closeLightbox();
        } else if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomIn();
        } else if (event.key === '-') {
            event.preventDefault();
            zoomOut();
        }
    }

    function showImage(index) {
        if (index < 0 || index >= imageList.length) return;
        
        currentIndex = index;
        currentScale = 1;
        originalWidth = 0;
        originalHeight = 0;
        
        const img = document.getElementById('lightboxImg');
        const res = document.getElementById('lightboxRes');
        
        img.src = imageList[currentIndex];
        img.onload = () => {
            originalWidth = img.naturalWidth;
            originalHeight = img.naturalHeight;
            res.textContent = `${img.naturalWidth}×${img.naturalHeight} (${currentIndex + 1}/${imageList.length})`;
            applyZoom();
        };
        
        updateNavigationButtons();
    }

    function applyZoom() {
        const img = document.getElementById('lightboxImg');
        if (!img || !originalWidth) return;
        
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.width = Math.round(originalWidth * currentScale) + 'px';
        img.style.height = Math.round(originalHeight * currentScale) + 'px';
    }

    function prevImage() {
        if (currentIndex > 0) {
            showImage(currentIndex - 1);
        } else {
            showImage(imageList.length - 1);
        }
    }

    function nextImage() {
        if (currentIndex < imageList.length - 1) {
            showImage(currentIndex + 1);
        } else {
            showImage(0);
        }
    }

    function zoomIn() {
        const newScale = Math.min(6.0, currentScale * 1.12);
        currentScale = newScale;
        applyZoom();
    }

    function zoomOut() {
        const newScale = Math.max(0.15, currentScale / 1.12);
        if (newScale <= 1) {
            currentScale = newScale;
            applyZoom();
        } else {
            currentScale = newScale;
            applyZoom();
        }
    }

    function updateNavigationButtons() {
        const prevBtn = document.getElementById('lightboxPrevBtn');
        const nextBtn = document.getElementById('lightboxNextBtn');
        
        if (prevBtn) prevBtn.style.display = imageList.length > 1 ? 'flex' : 'none';
        if (nextBtn) nextBtn.style.display = imageList.length > 1 ? 'flex' : 'none';
    }

    function closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        if (lightbox) {
            lightbox.classList.add('hidden');
            document.body.style.overflow = '';
            setTimeout(() => {
                const img = document.getElementById('lightboxImg');
                if (img) img.src = '';
            }, 300);
        }
        
        window.removeEventListener('keydown', handleKeyDown);
        resetState();
    }

    function resetState() {
        imageList = [];
        currentIndex = 0;
        currentScale = 1;
        originalWidth = 0;
        originalHeight = 0;
    }

    function getImageList() {
        return imageList;
    }

    function getCurrentIndex() {
        return currentIndex;
    }

    window.YichuwutiImageViewer = {
        init,
        prevImage,
        nextImage,
        closeLightbox,
        zoomIn,
        zoomOut,
        getImageList,
        getCurrentIndex
    };
})();
