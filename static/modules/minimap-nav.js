/**
 * 小导航栏模块 (Minimap Nav)
 * 在无限画布右下角显示迷你地图，支持点击/拖拽导航
 */

let minimapViewport = null;
let minimapState = null;
let minimapRenderQueued = false;
let minimapDrag = false;
let minimapInitialized = false;

function initMinimap() {
  if (minimapInitialized) return;
  minimapInitialized = true;

  injectMinimapCSS();
  injectMinimapHTML();
  bindMinimapEvents();
  scheduleMinimapRender();
}

function injectMinimapCSS() {
  const id = 'minimap-nav-style';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .minimap { position:absolute; right:22px; bottom:22px; z-index:24; width:188px; height:126px; padding:8px; border-radius:16px; background:var(--panel); border:1px solid var(--line); box-shadow:0 16px 42px var(--shadow); backdrop-filter:blur(16px); overflow:hidden; pointer-events:auto; cursor:crosshair; }
    .minimap-content { position:relative; width:100%; height:100%; border-radius:10px; background:rgba(148,163,184,.08); overflow:hidden; }
    .minimap-node { position:absolute; border-radius:3px; background:rgba(15,23,42,.64); border:1px solid rgba(255,255,255,.32); min-width:2px; min-height:2px; }
    .minimap-node.selected { background:#111827; box-shadow:0 0 0 1px rgba(255,255,255,.7); }
    .minimap-viewport { position:absolute; border:1.5px solid #111827; background:rgba(17,24,39,.08); border-radius:5px; box-shadow:0 0 0 1px rgba(255,255,255,.75); pointer-events:none; }
    .minimap-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--faint); font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; pointer-events:none; }
    body.theme-dark .minimap-node { background:rgba(248,250,252,.7); border-color:rgba(15,23,42,.35); }
    body.theme-dark .minimap-node.selected { background:#fff; box-shadow:0 0 0 1px rgba(15,23,42,.8); }
    body.theme-dark .minimap-viewport { border-color:#f8fafc; background:rgba(248,250,252,.1); box-shadow:0 0 0 1px rgba(15,23,42,.8); }
  `;
  document.head.appendChild(style);
}

function injectMinimapHTML() {
  const board = document.getElementById('board');
  if (!board || document.getElementById('minimap')) return;
  const div = document.createElement('div');
  div.id = 'minimap';
  div.className = 'minimap';
  div.title = '导航地图';
  div.innerHTML = `
    <div id="minimapContent" class="minimap-content">
      <div id="minimapViewport" class="minimap-viewport"></div>
    </div>
  `;
  board.appendChild(div);
  minimapViewport = document.getElementById('minimapViewport');
}

function bindMinimapEvents() {
  const minimap = document.getElementById('minimap');
  if (!minimap) return;
  minimap.addEventListener('mousedown', e => {
    if (!window.canvas || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    minimapDrag = true;
    centerViewportOnWorldPoint(minimapEventToWorld(e));
    window.onmousemove = e2 => {
      if (minimapDrag) centerViewportOnWorldPoint(minimapEventToWorld(e2));
    };
    window.onmouseup = () => {
      minimapDrag = false;
      window.onmousemove = null;
      window.onmouseup = null;
      if (typeof scheduleSave === 'function') scheduleSave();
    };
  });
}

function estimatedNodeRect(n) {
  const el = document.querySelector(`.node[data-id="${CSS.escape(n.id)}"]`);
  const size = typeof defaultNodeSize === 'function' ? defaultNodeSize(n.type) : { w: 260, h: 160 };
  const w = el?.offsetWidth || n.w || size.w || 260;
  const h = el?.offsetHeight || n.h || size.h || 160;
  return { x: n.x || 0, y: n.y || 0, w, h };
}

function currentWorldViewRect() {
  const board = document.getElementById('board');
  if (!board) return { x: 0, y: 0, w: 1000, h: 700 };
  const rect = board.getBoundingClientRect();
  const scale = viewport.scale || 1;
  return {
    x: -viewport.x / scale,
    y: -viewport.y / scale,
    w: rect.width / scale,
    h: rect.height / scale
  };
}

function minimapBounds() {
  const rects = (nodes || []).map(estimatedNodeRect);
  rects.push(currentWorldViewRect());
  if (!rects.length) return { x: 0, y: 0, w: 1000, h: 700 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  rects.forEach(r => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  });
  const pad = Math.max(240, Math.max(maxX - minX, maxY - minY) * 0.08);
  return { x: minX - pad, y: minY - pad, w: Math.max(1, maxX - minX + pad * 2), h: Math.max(1, maxY - minY + pad * 2) };
}

function scheduleMinimapRender() {
  if (minimapRenderQueued) return;
  minimapRenderQueued = true;
  requestAnimationFrame(() => {
    minimapRenderQueued = false;
    renderMinimap();
  });
}

function renderMinimap() {
  const minimapContent = document.getElementById('minimapContent');
  let vp = document.getElementById('minimapViewport');
  if (!minimapContent || !vp) return;
  const bounds = minimapBounds();
  const cw = minimapContent.clientWidth || 172;
  const ch = minimapContent.clientHeight || 110;
  const scale = Math.min(cw / bounds.w, ch / bounds.h);
  const mapW = bounds.w * scale;
  const mapH = bounds.h * scale;
  const ox = (cw - mapW) / 2;
  const oy = (ch - mapH) / 2;
  minimapState = { bounds, scale, ox, oy, cw, ch };
  const nodeHtml = (nodes || []).map(n => {
    const r = estimatedNodeRect(n);
    return `<div class="minimap-node ${selected.has(n.id) ? 'selected' : ''}" style="left:${ox + (r.x - bounds.x) * scale}px;top:${oy + (r.y - bounds.y) * scale}px;width:${Math.max(3, r.w * scale)}px;height:${Math.max(3, r.h * scale)}px"></div>`;
  }).join('');
  minimapContent.innerHTML = `${nodeHtml}${nodes?.length ? '' : '<div class="minimap-empty">EMPTY</div>'}<div id="minimapViewport" class="minimap-viewport"></div>`;
  vp = document.getElementById('minimapViewport');
  if (vp) updateMinimapViewport();
}

function updateMinimapViewport() {
  const vp = document.getElementById('minimapViewport');
  if (!vp || !minimapState) return;
  const r = currentWorldViewRect();
  const { bounds, scale, ox, oy } = minimapState;
  vp.style.left = `${ox + (r.x - bounds.x) * scale}px`;
  vp.style.top = `${oy + (r.y - bounds.y) * scale}px`;
  vp.style.width = `${Math.max(8, r.w * scale)}px`;
  vp.style.height = `${Math.max(8, r.h * scale)}px`;
}

function minimapEventToWorld(e) {
  const minimapContent = document.getElementById('minimapContent');
  if (!minimapState && minimapContent) renderMinimap();
  if (!minimapState) return { x: 0, y: 0 };
  const state = minimapState;
  const rect = minimapContent.getBoundingClientRect();
  const x = (e.clientX - rect.left - state.ox) / state.scale + state.bounds.x;
  const y = (e.clientY - rect.top - state.oy) / state.scale + state.bounds.y;
  return { x, y };
}

function centerViewportOnWorldPoint(point) {
  const board = document.getElementById('board');
  if (!board) return;
  const rect = board.getBoundingClientRect();
  viewport.x = rect.width / 2 - point.x * viewport.scale;
  viewport.y = rect.height / 2 - point.y * viewport.scale;
  if (typeof applyViewport === 'function') applyViewport();
  if (typeof refreshGeometry === 'function') refreshGeometry();
}

initMinimap();
