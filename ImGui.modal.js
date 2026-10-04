/* ImGui Browser Port — ModalDialog (original, notify-styled)
 * Standalone modal dialog: dark notify-style card WITHOUT the accent bar and
 * WITHOUT any animation (spawns and vanishes instantly), centered on the
 * viewport over a fullscreen dimmer. Single active dialog. Buttons arm on
 * left press and fire on release; onClick may chain into Show() for multi
 * step flows (auto close is skipped when the callback opens a new dialog).
 * Input beneath is blocked through the core modal lock (_activeModalRect),
 * synced every frame by the backend loop, plus a keyboard capture gate.
 * Requires: core (+extended for the overlay queue, backend for auto sync).
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");
const measure = (s) => (ImGui._measure ? ImGui._measure(s) : String(s).length * 7);
function wrapLines(str, maxW) {
  const words = String(str == null ? "" : str).split(/\s+/).filter((x) => x.length > 0);
  const lines = [];
  let line = "";
  for (const wd of words) {
    const t = line ? line + " " + wd : wd;
    if (measure(t) > maxW && line) { lines.push(line); line = wd; }
    else line = t;
  }
  if (line) lines.push(line);
  // Hard split a single overlong token so it can never overflow the card.
  const out = [];
  for (const ln of lines) {
    let s = ln;
    while (measure(s) > maxW && s.length > 1) {
      let cut = s.length - 1;
      while (cut > 1 && measure(s.slice(0, cut)) > maxW) cut--;
      out.push(s.slice(0, Math.max(1, cut)));
      s = s.slice(Math.max(1, cut));
    }
    out.push(s);
  }
  return out;
}
function inside(m, r) {
  return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
}

const ModalDialog = {
  // Show(config): { title, text, maxWidth (default 360), showCloseButton
  // (default true), buttons: [{ label, onClick, closeOnClick (default true) }] }
  Show(cfg) {
    const c = ImGui.GetContext();
    cfg = cfg || {};
    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons.map((b) => ({
      label: String(b && b.label !== undefined ? b.label : "OK"),
      onClick: b && typeof b.onClick === "function" ? b.onClick : null,
      closeOnClick: !b || b.closeOnClick !== false,
    })) : [];
    c._modalConfig = {
      title: String(cfg.title || ""),
      text: String(cfg.text || ""),
      maxWidth: Math.max(160, cfg.maxWidth || 360),
      showCloseButton: cfg.showCloseButton !== false,
      buttons,
    };
    c._modalSeq = (c._modalSeq || 0) + 1;
    c._modalArm = null;
    return this;
  },
  Close() {
    const c = ImGui.GetContext();
    c._modalConfig = null;
    c._modalArm = null;
    c._modalRect = null;
    c._modalBtnRects = [];
    if (!this._anyModalStillOpen(c)) c._activeModalRect = null;
    return this;
  },
  _anyModalStillOpen(c) {
    const stack = c._popupStack || [];
    for (const k of stack) {
      const r = (c._popupRects && c._popupRects[k]) || (c._popupRectsPrev && c._popupRectsPrev[k]);
      if (r && r.modal) return true;
    }
    return false;
  },
  IsOpen() {
    try { return !!ImGui.GetContext()._modalConfig; } catch { return false; }
  },
  // Backend loop calls this before userFn so every window in the frame
  // evaluates under the lock. Fullscreen rect: the dimmer covers everything.
  _syncLock() {
    let c = null;
    try { c = ImGui.GetContext(); } catch { return; }
    if (!c._modalConfig) return;
    const dw = c.io.DisplaySize.x, dh = c.io.DisplaySize.y;
    c._activeModalRect = { x: 0, y: 0, w: dw, h: dh };
  },
  // Render dimmer, card, title, close box, body, and buttons into the overlay
  // layer (topmost). Auto called by Backend.frame after userFn, guarded once
  // per frame so manual calls are safe. Layout is deterministic from viewport
  // and text metrics, so hit testing uses same frame rects (no stale data,
  // unlike animated toasts which must use previous frame rects).
  Render() {
    let c = null;
    try { c = ImGui.GetContext(); } catch { return; }
    const cfg = c._modalConfig;
    if (!cfg) return;
    if (c._modalRendered === c.frame) return;
    c._modalRendered = c.frame;
    const st = c.style, io = c.io, m = io.MousePos;
    const dw = io.DisplaySize.x, dh = io.DisplaySize.y;
    c._overlayOps = c._overlayOps || [];
    const ops = c._overlayOps;

    // Escape is a safety hatch: always dismisses, even without an X button.
    if (io.KeysDown && io.KeysDown["Escape"]) {
      io.KeysDown["Escape"] = false;
      this.Close();
      return;
    }

    const padX = 20, padY = 18, maxW = cfg.maxWidth;
    const titleH = cfg.title ? 22 : 0;
    const lines = cfg.text ? wrapLines(cfg.text, maxW) : [];
    const btnH = 26, btnGap = 8;
    const widths = cfg.buttons.map((b) => measure(b.label) + 32);
    const rowW = widths.reduce((a, b) => a + b, 0) + Math.max(0, cfg.buttons.length - 1) * btnGap;
    const cardW = Math.max(maxW + padX * 2, rowW + padX * 2);
    const cardH = padY + titleH + (cfg.title && lines.length ? 8 : 0) +
      lines.length * 16 + (cfg.buttons.length ? 12 + btnH : 0) + padY;
    const cx = Math.round((dw - cardW) / 2), cy = Math.round((dh - cardH) / 2);
    c._modalRect = { x: cx, y: cy, w: cardW, h: cardH };

    // 1. Dimmer: fullscreen, blocks sight and (via the modal lock) input.
    ops.push({ t: "rectFilled", x: 0, y: 0, w: dw, h: dh, r: 0, css: "rgba(0,0,0,0.6)" });
    // 2. Card: notify dark fill and thin border, rounding 6, no accent bar.
    ops.push({ t: "rectFilled", x: cx, y: cy, w: cardW, h: cardH, r: 6, col: [0.10, 0.10, 0.10, 0.95] });
    ops.push({ t: "rect", x: cx, y: cy, w: cardW, h: cardH, r: 6, col: [0.3, 0.3, 0.3, 1.0], th: 1 });

    const rects = [];
    if (cfg.title) {
      ops.push({ t: "text", str: cfg.title, x: cx + padX, y: cy + padY, col: st.Colors[ImGui.Col.Text], font: "600 14px -apple-system,Segoe UI,Roboto,Arial,sans-serif" });
    }
    if (cfg.showCloseButton) {
      const xs = 22, xr = { x: cx + cardW - padX - xs + 6, y: cy + padY - 3, w: xs, h: xs, idx: -1 };
      const xhov = inside(m, xr);
      if (xhov) {
        ops.push({ t: "rectFilled", x: xr.x, y: xr.y, w: xr.w, h: xr.h, r: 4, col: st.Colors[ImGui.Col.FrameBgHovered] });
        c.anyWindowHovered = true;
      }
      ops.push({ t: "text", str: "x", x: xr.x + Math.round((xs - measure("x")) / 2), y: xr.y + 3, col: st.Colors[ImGui.Col.Text] });
      rects.push(xr);
    }
    let by = cy + padY + titleH + (cfg.title && lines.length ? 8 : 0);
    for (const ln of lines) {
      ops.push({ t: "text", str: ln, x: cx + padX, y: by, col: st.Colors[ImGui.Col.Text] });
      by += 16;
    }
    if (cfg.buttons.length) {
      let bx = cx + cardW - padX - rowW;
      const bTop = cy + cardH - padY - btnH;
      cfg.buttons.forEach((b, i) => {
        const bw = widths[i];
        const r = { x: bx, y: bTop, w: bw, h: btnH, idx: i };
        const hov = inside(m, r);
        const armed = c._modalArm === i;
        if (hov) c.anyWindowHovered = true;
        const fill = armed ? st.Colors[ImGui.Col.ButtonActive]
          : hov ? st.Colors[ImGui.Col.ButtonHovered]
          : st.Colors[ImGui.Col.Button];
        ops.push({ t: "rectFilled", x: bx, y: bTop, w: bw, h: btnH, r: 4, col: fill });
        ops.push({ t: "text", str: b.label, x: bx + Math.round((bw - measure(b.label)) / 2), y: bTop + Math.round((btnH - st.FontSize) / 2), col: st.Colors[ImGui.Col.Text] });
        rects.push(r);
        bx += bw + btnGap;
      });
    }
    c._modalBtnRects = rects;

    // 3. Interaction: arm on left press, fire on release over the same box.
    // Beneath UI cannot arm because the modal lock voids its hover.
    if (c._modalArm !== null && c._modalArm !== undefined && !io.MouseDown[0] && !io.MouseReleased[0]) c._modalArm = null;
    if (io.MouseClicked[0] && (c._modalArm === null || c._modalArm === undefined)) {
      for (const r of rects) {
        if (inside(m, r)) { c._modalArm = r.idx; break; }
      }
    }
    if (io.MouseReleased[0] && c._modalArm !== null && c._modalArm !== undefined) {
      const idx = c._modalArm;
      c._modalArm = null;
      const hit = rects.some((r) => r.idx === idx && inside(m, r));
      if (hit) {
        if (idx === -1) { this.Close(); return; }
        const b = cfg.buttons[idx];
        const seq0 = c._modalSeq;
        if (b && b.onClick) {
          try { b.onClick(); } catch (e) { console.error("[ModalDialog]", e); }
        }
        // Chain safe: when onClick opened a new dialog the sequence moved,
        // so auto close must not destroy the fresh dialog.
        if (c._modalSeq === seq0 && (!b || b.closeOnClick !== false)) this.Close();
      }
    }
  },
};

Object.assign(ImGui, { ModalDialog });
global.__IMGUI_MODAL__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
