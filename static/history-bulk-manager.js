(function(){
    const STYLE_ID = 'history-bulk-manager-style';
    const labels = () => {
        const en = window.StudioI18n?.lang?.() === 'en';
        return en ? {
            manage:'Manage',
            done:'Done',
            delete:'Delete',
            selected:'selected',
            cancel:'Cancel'
        } : {
            manage:'批量管理',
            done:'完成',
            delete:'删除',
            selected:'已选择',
            cancel:'取消'
        };
    };

    function ensureStyle(){
        if(document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .history-bulk-surface{position:relative}
            .history-bulk-surface.is-selecting{cursor:crosshair}
            .history-bulk-toolbar{display:flex;align-items:center;gap:10px;margin:-4px 0 18px;min-height:34px}
            .history-bulk-toolbar .bulk-spacer{flex:1}
            .history-bulk-btn{height:32px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.9);color:#475569;padding:0 12px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.12em;display:inline-flex;align-items:center;gap:7px;transition:all .18s ease}
            .history-bulk-btn:hover{background:#111827;color:#fff;border-color:#111827}
            .history-bulk-btn.danger{background:#111827;color:#fff;border-color:#111827}
            .history-bulk-btn.danger:disabled{opacity:.38;cursor:not-allowed}
            .history-bulk-btn[data-bulk-delete]{display:none}
            .history-bulk-toolbar.is-selecting .history-bulk-btn[data-bulk-delete]{display:inline-flex}
            .history-bulk-count{font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;letter-spacing:.12em}
            body.history-bulk-selecting,body.history-bulk-selecting *{user-select:none!important;-webkit-user-select:none!important}
            body.history-bulk-selecting{cursor:crosshair}
            .history-bulk-selecting .masonry-grid{cursor:crosshair}
            .history-bulk-selecting .masonry-item{position:relative;cursor:pointer!important}
            .history-bulk-selecting .masonry-item img{-webkit-user-drag:none;user-drag:none;pointer-events:none}
            .history-bulk-selecting .masonry-item::after{content:"";position:absolute;inset:0;border-radius:inherit;background:rgba(255,255,255,.34);opacity:0;transition:opacity .14s ease;pointer-events:none;z-index:8}
            .history-bulk-selecting .masonry-item:hover::after{opacity:1}
            .masonry-item.bulk-selected::after{opacity:1;background:rgba(255,255,255,.42);box-shadow:inset 0 0 0 2px rgba(17,24,39,.9)}
            .masonry-item.bulk-selected{outline:2px solid rgba(17,24,39,.9);outline-offset:3px}
            .bulk-check{position:absolute;top:10px;right:10px;width:26px;height:26px;border-radius:999px;background:#fff;color:#111827;border:2px solid rgba(17,24,39,.9);display:none;align-items:center;justify-content:center;z-index:12;box-shadow:0 10px 24px rgba(15,23,42,.18)}
            .history-bulk-selecting .bulk-check{display:flex}
            .bulk-check::before{content:"";width:8px;height:5px;border-left:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg);opacity:0}
            .masonry-item.bulk-selected .bulk-check{background:#111827;color:#fff}
            .masonry-item.bulk-selected .bulk-check::before{opacity:1}
            .history-select-box{position:fixed;z-index:9999;border:1px solid rgba(17,24,39,.72);background:rgba(17,24,39,.09);pointer-events:none;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.5) inset}
            html.studio-theme-dark .history-bulk-btn,body.studio-theme-dark .history-bulk-btn{background:#111722;border-color:#2a3444;color:#d8dee9}
            html.studio-theme-dark .history-bulk-btn:hover,body.studio-theme-dark .history-bulk-btn:hover{background:#d8dee9;color:#10141d;border-color:#d8dee9}
            html.studio-theme-dark .masonry-item.bulk-selected::after,body.studio-theme-dark .masonry-item.bulk-selected::after{background:rgba(15,23,42,.38);box-shadow:inset 0 0 0 2px rgba(226,232,240,.88)}
            html.studio-theme-dark .masonry-item.bulk-selected,body.studio-theme-dark .masonry-item.bulk-selected{outline-color:rgba(226,232,240,.88)}
            html.studio-theme-dark .bulk-check,body.studio-theme-dark .bulk-check{background:#10141d;color:#d8dee9;border-color:rgba(226,232,240,.78)}
            html.studio-theme-dark .masonry-item.bulk-selected .bulk-check,body.studio-theme-dark .masonry-item.bulk-selected .bulk-check{background:#d8dee9;color:#10141d}
        `;
        document.head.appendChild(style);
    }

    function deleteHistory(timestamp){
        return fetch('/api/history/delete', {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({timestamp})
        }).then(r => r.json()).catch(() => ({success:false}));
    }

    function attach(options={}){
        ensureStyle();
        const masonry = typeof options.masonry === 'string' ? document.querySelector(options.masonry) : (options.masonry || document.getElementById('masonry'));
        if(!masonry || masonry._historyBulkManager) return masonry?._historyBulkManager || null;
        const surface = masonry.closest('section') || masonry.parentElement || masonry;
        surface.classList.add('history-bulk-surface');
        const L = labels();
        const toolbar = document.createElement('div');
        toolbar.className = 'history-bulk-toolbar';
        toolbar.innerHTML = `
            <span class="bulk-spacer"></span>
            <span class="history-bulk-count" data-bulk-count></span>
            <button class="history-bulk-btn danger" type="button" data-bulk-delete disabled>${L.delete}</button>
            <button class="history-bulk-btn" type="button" data-bulk-toggle>${L.manage}</button>
        `;
        masonry.parentNode.insertBefore(toolbar, masonry);
        const toggleBtn = toolbar.querySelector('[data-bulk-toggle]');
        const deleteBtn = toolbar.querySelector('[data-bulk-delete]');
        const countEl = toolbar.querySelector('[data-bulk-count]');
        let selecting = false;
        let selected = new Set();
        let drag = null;
        let down = null;

        function removeSelectBoxes(){
            document.querySelectorAll('.history-select-box').forEach(box => box.remove());
        }
        function clearNativeSelection(){
            const sel = window.getSelection?.();
            if(sel && sel.rangeCount) sel.removeAllRanges();
        }
        function selectableCards(){
            return [...masonry.querySelectorAll('.masonry-item[data-history-ts]')];
        }
        function cardTs(card){ return card?.dataset?.historyTs || ''; }
        function sync(){
            const l = labels();
            toolbar.querySelector('[data-bulk-toggle]').textContent = selecting ? l.done : l.manage;
            deleteBtn.textContent = l.delete;
            deleteBtn.disabled = !selected.size;
            countEl.textContent = selected.size ? `${selected.size} ${l.selected}` : '';
            toolbar.classList.toggle('is-selecting', selecting);
            surface.classList.toggle('is-selecting', selecting);
            document.body.classList.toggle('history-bulk-selecting', selecting);
            selectableCards().forEach(card => {
                card.classList.toggle('bulk-selected', selected.has(cardTs(card)));
                if(!card.querySelector('.bulk-check')){
                    const check = document.createElement('span');
                    check.className = 'bulk-check';
                    card.appendChild(check);
                }
            });
        }
        function setSelecting(next){
            selecting = Boolean(next);
            if(!selecting) selected.clear();
            sync();
        }
        function toggleCard(card){
            const ts = cardTs(card);
            if(!ts) return;
            selected.has(ts) ? selected.delete(ts) : selected.add(ts);
            sync();
        }
        toggleBtn.onclick = () => setSelecting(!selecting);
        deleteBtn.onclick = async () => {
            if(!selected.size) return;
            const targets = [...selected];
            deleteBtn.disabled = true;
            for(const ts of targets){
                const res = await deleteHistory(ts);
                if(res.success){
                    document.querySelector(`[data-history-ts="${CSS.escape(ts)}"]`)?.remove();
                    selected.delete(ts);
                }
            }
            sync();
            options.onDelete?.(targets);
        };
        masonry.addEventListener('click', e => {
            if(!selecting) return;
            if(e.target.closest('.history-bulk-toolbar')) return;
            if(down?.dragged){
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const card = e.target.closest('.masonry-item[data-history-ts]');
            if(!card || !masonry.contains(card)) return;
            e.preventDefault();
            e.stopPropagation();
            toggleCard(card);
        }, true);
        function shouldIgnorePointer(e){
            return Boolean(e.target.closest('.history-bulk-toolbar,button,a,input,textarea,select'));
        }
        function insideHistoryBand(y){
            const rect = surface.getBoundingClientRect();
            return y >= rect.top - 24 && y <= rect.bottom + 96;
        }
        document.addEventListener('mousedown', e => {
            if(!selecting || e.button !== 0) return;
            if(shouldIgnorePointer(e)) return;
            if(!insideHistoryBand(e.clientY)) return;
            e.preventDefault();
            e.stopPropagation();
            removeSelectBoxes();
            drag = null;
            clearNativeSelection();
            down = {sx:e.clientX, sy:e.clientY, dragged:false};
        }, true);
        document.addEventListener('selectstart', e => {
            if(!selecting) return;
            if(e.clientY && !insideHistoryBand(e.clientY)) return;
            e.preventDefault();
            e.stopPropagation();
            clearNativeSelection();
        }, true);
        document.addEventListener('dragstart', e => {
            if(!selecting) return;
            const pointY = e.clientY || down?.sy;
            if(pointY && !insideHistoryBand(pointY)) return;
            e.preventDefault();
            e.stopPropagation();
        }, true);
        window.addEventListener('mousemove', e => {
            if((drag || down) && e.buttons === 0){
                finishDrag();
                return;
            }
            if(down && !drag){
                const moved = Math.hypot(e.clientX - down.sx, e.clientY - down.sy);
                if(moved < 6) return;
                e.preventDefault();
                clearNativeSelection();
                down.dragged = true;
                const box = document.createElement('div');
                box.className = 'history-select-box';
                document.body.appendChild(box);
                drag = {sx:down.sx, sy:down.sy, box};
            }
            if(!drag) return;
            e.preventDefault();
            clearNativeSelection();
            const x = Math.min(drag.sx, e.clientX);
            const y = Math.min(drag.sy, e.clientY);
            const w = Math.abs(e.clientX - drag.sx);
            const h = Math.abs(e.clientY - drag.sy);
            Object.assign(drag.box.style, {left:`${x}px`, top:`${y}px`, width:`${w}px`, height:`${h}px`});
            const r = {left:x, top:y, right:x+w, bottom:y+h};
            selectableCards().forEach(card => {
                const cr = card.getBoundingClientRect();
                const hit = cr.left < r.right && cr.right > r.left && cr.top < r.bottom && cr.bottom > r.top;
                if(hit) selected.add(cardTs(card));
            });
            sync();
        });
        function finishDrag(){
            if(drag){
                drag = null;
                sync();
            }
            removeSelectBoxes();
            if(down){
                setTimeout(() => { down = null; }, 0);
            }
        }
        document.addEventListener('mouseup', finishDrag, true);
        window.addEventListener('mouseup', finishDrag, true);
        document.addEventListener('pointerup', finishDrag, true);
        document.addEventListener('pointercancel', finishDrag, true);
        window.addEventListener('mouseleave', finishDrag);
        window.addEventListener('blur', finishDrag);
        window.addEventListener('studio-lang-change', sync);
        window.addEventListener('message', event => {
            if(event.data?.type === 'studio-lang') setTimeout(sync, 0);
        });
        let syncTimer = null;
        const observer = new MutationObserver(() => {
            if(!selecting) return;
            clearTimeout(syncTimer);
            syncTimer = setTimeout(sync, 30);
        });
        observer.observe(masonry, {childList:true});
        const manager = {sync, setSelecting, isSelecting:() => selecting};
        masonry._historyBulkManager = manager;
        sync();
        return manager;
    }

    window.HistoryBulkManager = {attach};
})();
