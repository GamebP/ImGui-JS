/* ImGui Browser Port — Draw (ported from imgui_draw.cpp)
 * Immediate-mode draw lists adapted to Canvas2D.
 * Core drawList ops are recorded by widgets as {t:'rect'|'rectFilled'|'line'|'circle'|'text',...}
 * and flushed here per window, back-to-front by window z.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");

function css(col) { return ImGui.colToCss(col); }

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (r < 0.5) { ctx.rect(x, y, w, h); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

class CanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }
  renderFrame(imguiCtx) {
    const ctx = this.ctx;
    const io = imguiCtx.io;
    const dpr = (io.DisplayFramebufferScale && io.DisplayFramebufferScale.x) || 1;
    const W = io.DisplaySize.x, H = io.DisplaySize.y;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr);
      this.canvas.height = Math.round(H * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Background draw-list layer (GetBackgroundDrawList): below all windows.
    if (imguiCtx._bgOps && imguiCtx._bgOps.length) {
      const st = imguiCtx.style;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      for (const op of imguiCtx._bgOps) this.drawOp(ctx, st, op);
      ctx.restore();
      imguiCtx._bgOps.length = 0;
    }
    const wins = [...imguiCtx.windows.values()]
      .filter((w) => w.open !== false)
      .sort((a, b) => a.z - b.z);
    for (const w of wins) this.drawWindow(imguiCtx, w);
    // Popup overlay layer: top Z, viewport-clipped only (never parent-clipped).
    if (imguiCtx._overlayOps && imguiCtx._overlayOps.length) {
      const st = imguiCtx.style;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      for (const op of imguiCtx._overlayOps) this.drawOp(ctx, st, op);
      ctx.restore();
      imguiCtx._overlayOps.length = 0;
    }
    // NOTE: no software cursor ring — the OS pointer is already visible and a
    // canvas-drawn ring lags one frame behind, rendering as a ghost artifact.
  }
  drawWindow(c, w) {
    const ctx = this.ctx, st = c.style;
    const x = w.pos.x, y = w.pos.y, ww = w.sizeFull.x, hh = w.sizeFull.y;
    const noBg = (w.flags & ImGui.WindowFlags.NoBackground) !== 0;
    ctx.save();
    // shadow
    if (!noBg) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      roundRectPath(ctx, x, y, ww, hh, st.WindowRounding);
      ctx.fillStyle = css(st.Colors[w.collapsed ? ImGui.Col.TitleBgCollapsed : ImGui.Col.WindowBg]);
      ctx.fill();
      ctx.restore();
    }
    // title bar
    if (w.titleH > 0) {
      // TitleBgActive follows FOCUS (click-to-focus, or the window being
      // dragged) — never hover. contentHover is true for every window under
      // the cursor, so using it here flashed all hovered titles bright blue.
      const isDragging = (c.activeKind === "move" && c.activePayload && c.activePayload.win === w);
      const focused = (c.focusedWindow === w) || isDragging;
      const active = focused;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, ww, w.titleH + st.WindowRounding);
      ctx.clip();
      roundRectPath(ctx, x, y, ww, w.titleH + st.WindowRounding, st.WindowRounding);
      ctx.fillStyle = css(st.Colors[w.collapsed ? ImGui.Col.TitleBgCollapsed : (active ? ImGui.Col.TitleBgActive : ImGui.Col.TitleBg)]);
      ctx.fill();
      ctx.restore();
      // title text
      ctx.save();
      ctx.fillStyle = css(st.Colors[ImGui.Col.Text]);
      ctx.font = "600 13px -apple-system,Segoe UI,Roboto,Arial,sans-serif";
      ctx.textBaseline = "middle";
      const label = ImGui.findRenderedTextEnd(w.name) || w.name;
      ctx.fillText(label, x + 10, y + w.titleH / 2 + 0.5);
      // close [x]
      if (w.open !== null && w.open !== undefined) {
        const cs = 16, cx = x + ww - 8 - cs, cy = y + (w.titleH - cs) / 2;
        const hov = c.hoveredId === ((w.id ^ 0xc0ffee) >>> 0);
        ctx.fillStyle = hov ? "rgba(231,76,60,0.95)" : "rgba(255,255,255,0.18)";
        roundRectPath(ctx, cx, cy, cs, cs, 4); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx + 4, cy + 4); ctx.lineTo(cx + cs - 4, cy + cs - 4);
        ctx.moveTo(cx + cs - 4, cy + 4); ctx.lineTo(cx + 4, cy + cs - 4);
        ctx.stroke();
      }
      // collapse arrow
      if (!(w.flags & ImGui.WindowFlags.NoCollapse)) {
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "11px sans-serif";
        ctx.fillText(w.collapsed ? "▶" : "▼", x + ww - (w.open !== null && w.open !== undefined ? 32 : 12) - 8, y + w.titleH / 2 + 0.5);
      }
      ctx.restore();
      // title separator
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, y + w.titleH + 0.5); ctx.lineTo(x + ww - 0.5, y + w.titleH + 0.5); ctx.stroke();
    }
    if (w.collapsed) {
      // border only
      ctx.strokeStyle = css(st.Colors[ImGui.Col.Border]); ctx.lineWidth = st.WindowBorderSize;
      roundRectPath(ctx, x + 0.5, y + 0.5, ww - 1, hh - 1, st.WindowRounding); ctx.stroke();
      ctx.restore();
      return;
    }
    // border
    ctx.strokeStyle = css(st.Colors[ImGui.Col.Border]); ctx.lineWidth = st.WindowBorderSize;
    roundRectPath(ctx, x + 0.5, y + 0.5, ww - 1, hh - 1, st.WindowRounding); ctx.stroke();
    // content ops clipped to the window interior (Begin/End clipping cycle);
    // when a scrollbar is present the clip shrinks by ScrollbarSize.
    const clipW = ww - (w.padding.x - 2) * 2 - ((w.scrollMax > 0) ? st.ScrollbarSize : 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + w.padding.x - 2, y + w.titleH, clipW, hh - w.titleH - 4);
    ctx.clip();
    // Apply scroll translation for content rendering
    if (w.scrollY > 0) {
      ctx.translate(0, -Math.round(w.scrollY));
    }
    for (const op of w.drawList) this.drawOp(ctx, st, op);
    // visual debug: outline every item rect pushed this frame via itemAdd()
    if (c._debugMode && c._debugRects && c._debugRects.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,0,255,0.9)"; ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      for (const r of c._debugRects) {
        // only rects belonging to this window's draw space (rough filter)
        if (r.x >= x - 2 && r.x <= x + ww + 2) ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      ctx.restore();
      const li = c.lastItem && c.lastItem.rect;
      if (li) {
        ctx.save();
        ctx.strokeStyle = "rgba(0,255,255,1)"; ctx.lineWidth = 1.5;
        ctx.strokeRect(li.x - 1.5, li.y - 1.5, li.w + 3, li.h + 3);
        ctx.restore();
      }
    }
    ctx.restore();
    // resize grip
    if (!(w.flags & ImGui.WindowFlags.NoResize)) {
      const hov = c.hoveredId === ((w.id ^ 0xbe51ed) >>> 0);
      ctx.fillStyle = css(st.Colors[hov ? ImGui.Col.ResizeGripHovered : ImGui.Col.ResizeGrip]);
      ctx.beginPath();
      const gx = x + ww - 16, gy = y + hh - 16;
      ctx.moveTo(gx + 16, gy); ctx.lineTo(gx, gy + 16); ctx.lineTo(gx + 16, gy + 16);
      ctx.closePath(); ctx.fill();
    }
    // window chrome (scrollbar): drawn unclipped, above content
    if (w._chromeOps) for (const op of w._chromeOps) this.drawOp(ctx, st, op);
    ctx.restore();
  }
  // Optional neon glow: any op may carry glow:true (+glowColor/glowBlur or
  // shadowColor/shadowBlur aliases). Implemented with Canvas2D shadow state
  // so ESP boxes, buttons and frames can bloom without extra draw calls.
  _applyGlow(ctx, st, op) {
    if (!op.glow) return null;
    const col = op.glowColor || op.shadowColor || op.css || css(op.col);
    ctx.save();
    ctx.shadowColor = (typeof col === "string") ? col : css(col);
    ctx.shadowBlur = op.glowBlur || op.shadowBlur || 12;
    return true;
  }
  drawOp(ctx, st, op) {
    if (!op || !op.t) return;
    switch (op.t) {
      case "pushClip":
        ctx.save();
        ctx.beginPath();
        ctx.rect(op.x, op.y, Math.max(0, op.w), Math.max(0, op.h));
        ctx.clip();
        break;
      case "popClip":
        ctx.restore();
        break;
      case "childClip": {
        // Child sub-panel: clip its inner ops to its own bounds so nothing
        // overflowing the border leaks into the parent window's layout.
        ctx.save();
        ctx.beginPath();
        ctx.rect(op.x, op.y, op.w, op.h);
        ctx.clip();
        if (op.ops) for (const o of op.ops) this.drawOp(ctx, st, o);
        ctx.restore();
        break;
      }
      case "polyline": {
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        const gl = this._applyGlow(ctx, st, op);
        ctx.beginPath();
        (op.pts || []).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        if (op.closed) ctx.closePath();
        ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "polygon": {
        ctx.fillStyle = op.css || css(op.col);
        const gl2 = this._applyGlow(ctx, st, op);
        ctx.beginPath();
        (op.pts || []).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath(); ctx.fill();
        if (gl2) ctx.restore();
        break;
      }
      case "image": {
        // op.el = HTMLCanvasElement/Image/Video or {w,h,draw(ctx,x,y,w,h)} procedural
        try {
          if (op.el && op.el.draw) op.el.draw(ctx, op.x, op.y, op.w, op.h);
          else if (op.el) ctx.drawImage(op.el, op.x, op.y, op.w, op.h);
          else { ctx.fillStyle = op.css || "#3a3a5a"; ctx.fillRect(op.x, op.y, op.w, op.h); }
        } catch { ctx.fillStyle = "#3a3a5a"; ctx.fillRect(op.x, op.y, op.w, op.h); }
        if (op.border) { ctx.strokeStyle = css(st.Colors[ImGui.Col.Border]); ctx.lineWidth = 1; ctx.strokeRect(op.x + .5, op.y + .5, op.w - 1, op.h - 1); }
        break;
      }
      case "rectTop": {
        // Tab shape: rounded top corners, flat bottom (merges with baseline).
        const rr = Math.max(0, Math.min(op.r || 0, op.w / 2, op.h));
        ctx.fillStyle = op.css || css(op.col);
        ctx.beginPath();
        ctx.moveTo(op.x, op.y + op.h);
        ctx.lineTo(op.x, op.y + rr);
        ctx.arcTo(op.x, op.y, op.x + rr, op.y, rr);
        ctx.lineTo(op.x + op.w - rr, op.y);
        ctx.arcTo(op.x + op.w, op.y, op.x + op.w, op.y + rr, rr);
        ctx.lineTo(op.x + op.w, op.y + op.h);
        ctx.closePath(); ctx.fill();
        break;
      }
      case "rectFilled": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.fillStyle = op.css || css(op.col);
        roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r || 0); ctx.fill();
        if (gl) ctx.restore();
        break;
      }
      case "rect": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r || 0); ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "line": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "circleFilled": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.fillStyle = op.css || css(op.col);
        ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); ctx.fill();
        if (gl) ctx.restore();
        break;
      }
      case "circle": { // AddCircle: stroke-only ring (notify icons emit this)
        const gl = this._applyGlow(ctx, st, op);
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.beginPath(); ctx.arc(op.x, op.y, Math.max(0.1, op.r), 0, Math.PI * 2); ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "bezierCubic": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(op.p1.x, op.p1.y);
        ctx.bezierCurveTo(op.p2.x, op.p2.y, op.p3.x, op.p3.y, op.p4.x, op.p4.y); ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "bezierQuad": {
        const gl = this._applyGlow(ctx, st, op);
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(op.p1.x, op.p1.y);
        ctx.quadraticCurveTo(op.p2.x, op.p2.y, op.p3.x, op.p3.y); ctx.stroke();
        if (gl) ctx.restore();
        break;
      }
      case "rectGradient": { // AddRectFilledMultiColor: horizontal tl->tr blend
        const g = ctx.createLinearGradient(op.x, 0, op.x + op.w, 0);
        g.addColorStop(0, css(op.tl)); g.addColorStop(1, css(op.tr));
        ctx.fillStyle = g; ctx.fillRect(op.x, op.y, op.w, op.h);
        break;
      }
      case "text": {
        ctx.fillStyle = op.css || css(op.col);
        ctx.font = op.font || "13px -apple-system,Segoe UI,Roboto,Arial,sans-serif";
        ctx.textBaseline = op.baseline || "top";
        if (op.wrap && op.maxW) {
          this.wrapText(ctx, op.str, op.x, op.y, op.maxW, 16);
        } else ctx.fillText(op.str, op.x, op.y);
        break;
      }
    }
  }
  wrapText(ctx, str, x, y, maxW, lh) {
    const words = String(str).split(/\s+/);
    let line = "", yy = y;
    for (const wd of words) {
      const t = line ? line + " " + wd : wd;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = wd; yy += lh; }
      else line = t;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy - y + lh;
  }
}

ImGui.CanvasRenderer = CanvasRenderer;
global.__IMGUI_DRAW__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
