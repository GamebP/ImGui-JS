/* ImGui Browser Port — Widgets (ported from imgui_widgets.cpp + imgui.cpp layout)
 * Implements: Text/Button/Checkbox/Radio/Slider/Drag/InputText/ColorEdit/
 *   Combo/Selectable/ListBox/ProgressBar/SameLine/Separator/CollapsingHeader/
 *   TreeNode/BeginChild/Columns-lite(progress via tables simplified).
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");
const ctx = () => ImGui.GetContext();
const cur = () => ctx().current;

// measure helper (canvas 2d measure, cached canvas)
let _mc = null;
function textW(s, font = "13px -apple-system,Segoe UI,Roboto,Arial,sans-serif") {
  if (!_mc) _mc = document.createElement("canvas").getContext("2d");
  _mc.font = font;
  return _mc.measureText(s).width;
}
function emit(op) { const w = cur(); if (w) w.drawList.push(op); }
// ---------- InputText callback data + edit helpers (Feature 2) ----------
// Callback payload mirroring ImGuiInputTextCallbackData: live Buf accessors
// over the widget payload plus selection and splice helpers.
class InputTextCallbackData {
  constructor(P, flag) {
    this._p = P;
    this.EventFlag = flag;
    this.EventChar = 0;
    this.EventKey = "";
    this.SelectionStart = P.cursorPos || 0;
    this.SelectionEnd = P.cursorPos || 0;
    this._dirty = false;
  }
  get Buf() { return this._p.value; }
  set Buf(v) { this._p.value = String(v == null ? "" : v); this._p.cursorPos = this._p.value.length; this._dirty = true; }
  get BufTextLen() { return this._p.value.length; }
  get CursorPos() { return this._p.cursorPos || 0; }
  set CursorPos(v) { this._p.cursorPos = Math.max(0, Math.min(this._p.value.length, v | 0)); }
  get BufDirty() { return !!this._dirty; }
  set BufDirty(v) { this._dirty = !!v; }
  HasSelection() { return this.SelectionEnd > this.SelectionStart; }
  SelectAll() { this.SelectionStart = 0; this.SelectionEnd = this._p.value.length; }
  ClearSelection() { this.SelectionStart = this.SelectionEnd = this.CursorPos; }
  DeleteChars(pos, bytesCount) {
    const s = this._p.value;
    pos = Math.max(0, Math.min(s.length, pos | 0));
    this._p.value = s.slice(0, pos) + s.slice(pos + Math.max(0, bytesCount | 0));
    this._p.cursorPos = Math.max(0, Math.min(this._p.value.length, this._p.cursorPos));
    this._dirty = true;
  }
  InsertChars(pos, text) {
    const s = this._p.value, t = String(text == null ? "" : text);
    pos = Math.max(0, Math.min(s.length, pos | 0));
    this._p.value = s.slice(0, pos) + t + s.slice(pos);
    this._p.cursorPos = pos + t.length;
    this._dirty = true;
  }
}
// Shared text edit ops used by widgets.js and (guarded) ImGui.backend.js.
const _textEdit = {
  // Per character filter for single key inserts. Returns the accepted char
  // or null when rejected. Runs flag filters first, then the user CharFilter
  // (nonzero return rejects; the callback may rewrite EventChar).
  filterChar(P, ch) {
    const F = ImGui.InputTextFlags || {};
    const fl = (P && P.inputFlags) || 0;
    if ((fl & (F.CharsUppercase || 0)) !== 0) ch = ch.toUpperCase();
    if ((fl & (F.CharsNoBlank || 0)) !== 0 && /\s/.test(ch)) return null;
    if ((fl & (F.CharsDecimal || 0)) !== 0 && !/[0-9+\-.*/]/.test(ch)) return null;
    if ((fl & (F.CharsHexadecimal || 0)) !== 0 && !/[0-9a-fA-F]/.test(ch)) return null;
    const cb = P && P.inputCallback;
    if ((fl & (F.CharFilter || F.CallbackCharFilter || 0)) !== 0 && typeof cb === "function") {
      const d = new InputTextCallbackData(P, (F.CallbackCharFilter || F.CharFilter || 0));
      d.EventChar = ch.codePointAt(0) || 0;
      let ret = 0;
      try { ret = cb(d) | 0; } catch (e) { console.error("[ImGui] char filter error:", e); }
      if (ret) return null;
      const rep = String.fromCodePoint(d.EventChar || 0);
      // A callback Buf write already landed in the payload: accept as is.
      if (d._dirty) return "";
      if (rep) ch = rep;
    }
    return ch;
  },
  // Bulk filter for pasted or IME committed strings.
  filterBulk(P, s) {
    let out = "";
    for (const ch of String(s == null ? "" : s)) {
      const acc = this.filterChar(P, ch);
      if (acc === null) continue;
      if (acc === "") return P.value; // callback rewrote the buffer wholesale
      out += acc;
    }
    return out;
  },
  // Insert one filtered char: space boundaries snapshot history for undo.
  insert(P, ch) {
    const acc = this.filterChar(P, ch);
    if (acc === null) return false;
    if (acc === "") return true; // filter callback handled the buffer itself
    if (P.history) {
      P.history.r.length = 0;
      if (acc === " ") this.push(P);
    }
    P.value += acc;
    P.cursorPos = P.value.length;
    return true;
  },
  // Undo stack: pre change snapshots on activation and space boundaries
  // (maximum 50 states). Commit pushes nothing: the first undo must move.
  push(P) {
    const h = P && P.history;
    if (!h) return;
    if (h.u[h.u.length - 1] !== P.value) {
      h.u.push(P.value);
      if (h.u.length > 50) h.u.shift();
    }
    h.r.length = 0;
  },
  undo(P) {
    const h = P && P.history;
    if (!h || !h.u.length) return false;
    h.r.push(P.value);
    P.value = h.u.pop();
    P.cursorPos = P.value.length;
    return true;
  },
  redo(P) {
    const h = P && P.history;
    if (!h || !h.r.length) return false;
    h.u.push(P.value);
    P.value = h.r.pop();
    P.cursorPos = P.value.length;
    return true;
  },
};
// Arm a text payload with flags, callback, and undo history, then focus the
// backend capture input with a filtering commit wrapper for IME pastes.
// extra merges additional payload fields (e.g. { multiline: true }).
function initTextPayload(c, id, kind, text, flags, callback, extra) {
  const start = String(text == null ? "" : text);
  const P = {
    value: start, cursorPos: start.length, commit: false,
    inputFlags: flags | 0,
    inputCallback: (typeof callback === "function") ? callback : null,
    history: { u: [start], r: [] },
  };
  if (extra) Object.assign(P, extra);
  c.activeId = id; c.activeKind = kind; c.activePayload = P;
  if (ImGui._backendFocusText) {
    ImGui._backendFocusText(P.value, (nv) => {
      if (c.activePayload !== P) return;
      const keepCb = P.inputCallback;
      const tmp = { value: "", cursorPos: 0, inputFlags: P.inputFlags, inputCallback: keepCb, history: null };
      const filtered = _textEdit.filterBulk(tmp, nv);
      const merged = tmp.value + filtered;
      if (merged !== P.value) {
        P.value = merged;
        P.cursorPos = merged.length;
        fireTextCallback(c, P, (ImGui.InputTextFlags || {}).CallbackEdit);
      }
    });
  }
  return P;
}
function fireTextCallback(c, P, flag) {
  const cb = P && P.inputCallback;
  if (typeof cb !== "function" || !flag) return;
  try { cb(new InputTextCallbackData(P, flag)); } catch (e) { console.error("[ImGui] input callback error:", e); }
}
// Remaining content width from the cursor (child/indent/cell aware).
// Block widgets call this AFTER beforeItemPlacement so it measures the fresh line.
function contentAvail() {
  const w = cur(); if (!w) return 0;
  const c = ctx();
  // Deduct scrollbar width whenever a vertical scrollbar is active, exactly
  // like GetContentRegionAvail().x in C++ (ScrollbarSize eats into the work rect).
  const hasScrollbar = (w.scrollMax > 0) && !(w.flags & ImGui.WindowFlags.NoScrollbar);
  const scrollbarReserve = hasScrollbar ? (c.style.ScrollbarSize + 2) : 0;
  // Inside a child panel, the wrapping boundary is the child's inner right
  // edge, NOT the parent window's right edge (which would overflow the panel).
  const stack = c._childStack;
  let avail;
  if (stack && stack.length > 0) {
    const t = stack[stack.length - 1];
    avail = Math.max(0, (t.bounds.x + t.bounds.w - 6) - w.dc.cursorPos.x);
  } else {
    avail = Math.max(0, w.pos.x + w.sizeFull.x - w.padding.x - scrollbarReserve - w.dc.cursorPos.x);
  }
  // Inside a table cell, cap at the cell inner right edge: without this a
  // widthless Selectable (or Combo, Slider) spans the whole window, stealing
  // clicks from later columns and painting across the row.
  const tbl = c._table;
  if (tbl && tbl._cell && tbl.col >= 0) {
    const cellRight = tbl._cell.x0 + tbl._cell.w - c.style.CellPadding.x;
    avail = Math.max(0, Math.min(avail, cellRight - w.dc.cursorPos.x));
  }
  return avail;
}
// Popup input preemption: while a popup owns the left click, underlying
// widgets (empty popup-box stack) must not start interactions.
function clickSuppressed() {
  const cc = ctx();
  return !!cc._suppressChrome && !(cc._popupBoxStack && cc._popupBoxStack.length);
}
// Printf-like formatter: consumes argsArray sequentially, supports
// %d / %i / %f / %s / %.Nf.
function formatString(fmt, argsArray) {
  const args = Array.isArray(argsArray) ? argsArray.slice() : [];
  return String(fmt === undefined ? "" : fmt).replace(
    /%(?:\.(\d+))?([difs])/g,
    (m, prec, spec) => {
      const v = args.length ? args.shift() : undefined;
      if (spec === "s") return String(v);
      if (spec === "d" || spec === "i") return String(Math.trunc(Number(v) || 0));
      return (Number(v) || 0).toFixed(prec !== undefined ? +prec : 6);
    },
  );
}
function formatValue(fmt, v) {
  const m = String(fmt).match(/%(?:\.(\d+))?([fdg])/);
  if (!m) return String(v);
  const prec = m[1] !== undefined ? +m[1] : (m[2] === 'd' ? 0 : 6);
  if (m[2] === 'd') return Math.round(v).toFixed(0);
  if (m[2] === 'g') return Number(+v).toPrecision(Math.max(1, prec || 6)).replace(/\.?0+$/, '');
  return (+v).toFixed(prec);
}
function itemWidthOverride() {
  const c = ctx();
  if (c._nextItemWidth !== undefined && c._nextItemWidth !== null) {
    const w = c._nextItemWidth; c._nextItemWidth = undefined;
    if (w !== 0) return w > 0 ? w : 0;
  }
  const s = c._itemWidthStack; return (s && s.length > 0 && s[s.length - 1] > 0) ? s[s.length - 1] : 0;
}
function frameCol(base, hov, act, h, held) {
  const c = ctx(), st = c.style;
  return h ? (held ? st.Colors[act] : st.Colors[hov]) : st.Colors[base];
}
// Resolve an alignment anchor to {x,y} in the unit square. Accepts an
// ImGui.Align vector ([ax, ay]), a plain {x, y} object, or null to use the
// style default. Components clamp to the unit interval.
function _num01(v, d) {
  v = Number(v);
  if (!Number.isFinite(v)) return d;
  return Math.max(0, Math.min(1, v));
}
function resolveAlign(a, fallback) {
  const fb = fallback || { x: 0.5, y: 0.5 };
  if (Array.isArray(a)) return { x: _num01(a[0], fb.x), y: _num01(a[1], fb.y) };
  if (a && typeof a === "object") return { x: _num01(a.x, fb.x), y: _num01(a.y, fb.y) };
  return { x: fb.x, y: fb.y };
}
// Aligned label placement inside a box at (x, y) sized (wd, ht) with inner
// padding (padX, padY): tx = x + padX + (usableW - tw) * alignX (same for y
// with FontSize as the text height). Rounds to whole pixels for crisp text.
function alignedTextPos(x, y, wd, ht, tw, padX, padY, al) {
  const st = ctx().style;
  const usableW = Math.max(0, wd - padX * 2);
  const usableH = Math.max(0, ht - padY * 2);
  return {
    x: Math.round(x + padX + (usableW - tw) * al.x),
    y: Math.round(y + padY + (usableH - st.FontSize) * al.y),
  };
}

// ---------- layout ----------
function SameLine(offX = 0, spacing = -1) { ctx().sameLine(offX, spacing); }
function NewLine() { const w = cur(); if (w) { ctx().newLineBreak(); } }
function Spacing(height = null) {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  // Default gap is two item spacings (8px at default metrics): one closes the
  // previous line, one opens clean air before the next widget. Pass an exact
  // pixel count for custom gaps (Spacing(3), Spacing(12)).
  const spacingH = (height !== null && height !== undefined) ? height : st.ItemSpacing.y * 2;
  c.beforeItemPlacement(0, spacingH);
  c.itemSize(0, spacingH);
}
function Separator() {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  c.beforeItemPlacement(0, 6);
  const ww = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y + 2;
  emit({ t: "line", x1: x, y1: y, x2: x + ww, y2: y, col: st.Colors[ImGui.Col.Separator], th: 1 });
  c.itemSize(ww, 6);
}
function Indent(wd = 0) { const w = cur(); if (w) w._indent = (w._indent || 0) + (wd || ctx().style.IndentSpacing); }
function Unindent(wd = 0) { const w = cur(); if (w) w._indent = Math.max(0, (w._indent || 0) - (wd || ctx().style.IndentSpacing)); }
function Dummy(wd, ht) { const c = ctx(); c.beforeItemPlacement(wd, ht); c.itemSize(wd, ht); }

// ---------- text ----------
function Text(str, ...args) {
  const c = ctx(), w = cur(); if (!w) return;
  let s = str === undefined ? "" : String(str);
  if (args.length) s = s.replace(/%[sdif]/g, () => String(args.shift()));
  const st = c.style;
  const label = s;
  const tw = textW(label), th = 16;
  // Table cell alignment: first item in a center/right cell shifts x; text
  // draws vertically centered by default (AlignMiddle). Layout cursor stays
  // top-padded so 20px widgets keep fitting the 22px row exactly.
  let dy = 0;
  const tc = c._table;
  const tcell = (tc && tc.col >= 0 && tc._cell && tc.rowY !== undefined && tc.rowH) ? tc._cell : null;
  if (tcell) {
    const usableW = Math.max(0, tcell.w - st.CellPadding.x * 2);
    const atOrigin = Math.abs(w.dc.cursorPos.x - (tcell.x0 + st.CellPadding.x)) < 1;
    let dx = 0;
    if (atOrigin && tcell.ax === (2 << 16)) dx = Math.max(0, (usableW - tw) / 2);
    else if (atOrigin && tcell.ax === (3 << 16)) dx = Math.max(0, usableW - tw);
    if (dx) { w.dc.cursorPos.x += dx; if (w.dc._cellStartX !== undefined) w.dc._cellStartX += dx; }
  }
  c.beforeItemPlacement(tw, th);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  if (tcell) {
    const midY = tc.rowY + Math.round((tc.rowH - st.FontSize) / 2);
    if (tcell.ay === (2 << 20) || tcell.ay === 0) dy = midY - y;
    else if (tcell.ay === (3 << 20)) dy = (tc.rowY + tc.rowH - st.FontSize - (st.CellPadding.y || 0)) - y;
  }
  c.itemSize(tw, th); c.itemAdd(x, y + dy, tw, th, 0);
  emit({ t: "text", str: label, x, y: y + dy, col: st.Colors[ImGui.Col.Text] });
}
function TextColored(col, str) {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  const tw = textW(str), th = 16;
  let dy = 0;
  const tc = c._table;
  const tcell = (tc && tc.col >= 0 && tc._cell && tc.rowY !== undefined && tc.rowH) ? tc._cell : null;
  if (tcell) {
    const usableW = Math.max(0, tcell.w - st.CellPadding.x * 2);
    const atOrigin = Math.abs(w.dc.cursorPos.x - (tcell.x0 + st.CellPadding.x)) < 1;
    let dx = 0;
    if (atOrigin && tcell.ax === (2 << 16)) dx = Math.max(0, (usableW - tw) / 2);
    else if (atOrigin && tcell.ax === (3 << 16)) dx = Math.max(0, usableW - tw);
    if (dx) { w.dc.cursorPos.x += dx; if (w.dc._cellStartX !== undefined) w.dc._cellStartX += dx; }
  }
  c.beforeItemPlacement(tw, th);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  if (tcell) {
    const midY = tc.rowY + Math.round((tc.rowH - st.FontSize) / 2);
    if (tcell.ay === (2 << 20) || tcell.ay === 0) dy = midY - y;
    else if (tcell.ay === (3 << 20)) dy = (tc.rowY + tc.rowH - st.FontSize - (st.CellPadding.y || 0)) - y;
  }
  c.itemSize(tw, th); c.itemAdd(x, y + dy, tw, th, 0);
  emit({ t: "text", str, x, y: y + dy, col });
}
function TextWrapped(str) {
  const c = ctx(), w = cur(); if (!w) return;
  c.beforeItemPlacement(0, 16);
  const maxW = Math.max(40, contentAvail());
  const lines = Math.max(1, Math.ceil(textW(str) / maxW));
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  emit({ t: "text", str, x, y, col: c.style.Colors[ImGui.Col.Text], wrap: true, maxW });
  c.itemSize(maxW, lines * 16);
}
function BulletText(str) {
  const c = ctx(), w = cur(); if (!w) return;
  c.beforeItemPlacement(textW(str) + 14, 16);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  emit({ t: "circleFilled", x: x + 4, y: y + 8, r: 2.5, col: c.style.Colors[ImGui.Col.Text] });
  const tx = x + 14;
  emit({ t: "text", str, x: tx, y, col: c.style.Colors[ImGui.Col.Text] });
  const wd = textW(str) + 14;
  c.itemSize(wd, 16);
}

// ---------- button ----------
function Button(label, wArg = 0, hArg = 0, align = null) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const shown = ImGui.findRenderedTextEnd(label);
  const tw = textW(shown);
  const wd = wArg > 0 ? wArg : tw + st.FramePadding.x * 2;
  const ht = hArg > 0 ? hArg : st.FontSize + st.FramePadding.y * 2;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const bb = c.buttonBehavior(id, x, y, wd, ht);
  // Smooth hover/active color transition (HImGuiAnimation tween layer).
  const targetCol = bb.held ? st.Colors[ImGui.Col.ButtonActive]
    : bb.hovered ? st.Colors[ImGui.Col.ButtonHovered]
    : st.Colors[ImGui.Col.Button];
  const btnCol = (ImGui.Animation && ImGui.Animation.Color)
    ? ImGui.Animation.Color("btn:" + id, targetCol, 0.12)
    : targetCol;
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: st.FrameRounding, col: btnCol });
  const al = resolveAlign(align, st.ButtonTextAlign);
  const tp = alignedTextPos(x, y, wd, ht, tw, st.FramePadding.x, st.FramePadding.y, al);
  emit({ t: "text", str: shown, x: tp.x, y: tp.y, col: st.Colors[ImGui.Col.Text] });
  return bb.pressed;
}
function SmallButton(label) { return Button(label, 0, 20); }
function InvisibleButton(id, wd, ht) {
  const c = ctx(), w = cur(); if (!w) return false;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const hid = w.getID(id);
  c.itemAdd(x, y, wd, ht, hid);
  const bb = c.buttonBehavior(hid, x, y, wd, ht);
  return bb.pressed;
}

// ---------- checkbox / radio ----------
function Checkbox(label, checked) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, checked };
  const st = c.style;
  const box = 16, gap = 6;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  const wd = box + gap + tw, ht = 18;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const bb = c.buttonBehavior(id, x, y, wd, ht);
  let ch = !!checked, changed = false;
  if (bb.pressed) { ch = !ch; changed = true; }
  emit({ t: "rectFilled", x, y: y + 1, w: box, h: box, r: 4, col: frameCol(ImGui.Col.FrameBg, ImGui.Col.FrameBgHovered, ImGui.Col.FrameBgActive, bb.hovered, bb.held) });
  emit({ t: "rect", x, y: y + 1, w: box, h: box, r: 4, col: st.Colors[ImGui.Col.Border], th: 1 });
  if (ch) {
    emit({ t: "line", x1: x + 3, y1: y + 9, x2: x + 7, y2: y + 13, col: st.Colors[ImGui.Col.CheckMark], th: 2.5 });
    emit({ t: "line", x1: x + 7, y1: y + 13, x2: x + 13, y2: y + 4, col: st.Colors[ImGui.Col.CheckMark], th: 2.5 });
  }
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + box + gap, y: y + 1, col: st.Colors[ImGui.Col.Text] });
  return { changed, checked: ch };
}
function RadioButton(label, active) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const rad = 8, gap = 6;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  const wd = rad * 2 + gap + tw, ht = 20;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const bb = c.buttonBehavior(id, x, y, wd, ht);
  const cy = y + 4 + rad / 2;
  emit({ t: "circleFilled", x: x + rad / 2 + 2, y: cy, r: rad / 2 + 2, col: st.Colors[ImGui.Col.Border] });
  emit({ t: "circleFilled", x: x + rad / 2 + 2, y: cy, r: rad / 2 + 1, col: st.Colors[bb.hovered ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg] });
  if (active) emit({ t: "circleFilled", x: x + rad / 2 + 2, y: cy, r: 3, col: st.Colors[ImGui.Col.CheckMark] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + rad * 2 + gap, y: y + 2, col: st.Colors[ImGui.Col.Text] });
  return bb.pressed;
}

// ---------- toggle switch (DeAr ImGui pill switch) ----------
function Toggle(label, checked) {
  const c = ctx(), w = cur();
  if (!w) return { changed: false, checked };

  const st = c.style;
  const shown = ImGui.findRenderedTextEnd(label);
  const tw = textW(shown);

  // Dimensions for standard ImGui toggle pill
  const trackW = 34;
  const trackH = 18;
  const gap = 8;
  const totalW = trackW + (tw > 0 ? gap + tw : 0);
  const totalH = Math.max(trackH, st.FontSize + st.FramePadding.y);

  c.beforeItemPlacement(totalW, totalH);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(totalW, totalH);

  const id = w.getID(label);
  c.itemAdd(x, y, totalW, totalH, id);
  const bb = c.buttonBehavior(id, x, y, totalW, totalH);

  let ch = !!checked, changed = false;
  if (bb.pressed) {
    ch = !ch;
    changed = true;
  }

  // Smooth sliding animation for the knob (0.0 = left/off, 1.0 = right/on)
  const targetT = ch ? 1.0 : 0.0;
  const t = (ImGui.Animation && ImGui.Animation.Float)
    ? ImGui.Animation.Float("toggle:" + id, targetT, 0.12)
    : targetT;

  // Track colors: muted FrameBg for off, blue/accent for on
  const offCol = st.Colors[bb.hovered ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg];
  const onCol = st.Colors[bb.hovered ? ImGui.Col.ButtonHovered : ImGui.Col.ButtonActive];
  const trackCol = ImGui.lerpCol(offCol, onCol, t);

  const radius = trackH * 0.5;
  const centerY = y + Math.round((totalH - trackH) * 0.5);

  // 1. Draw rounded background pill
  emit({ t: "rectFilled", x, y: centerY, w: trackW, h: trackH, r: radius, col: trackCol });
  emit({ t: "rect", x, y: centerY, w: trackW, h: trackH, r: radius, col: st.Colors[ImGui.Col.Border], th: 1 });

  // 2. Draw sliding circular knob
  const knobR = radius - 2.5;
  const knobMinX = x + radius;
  const knobMaxX = x + trackW - radius;
  const knobX = knobMinX + (knobMaxX - knobMinX) * t;
  const knobY = centerY + radius;
  emit({ t: "circleFilled", x: knobX, y: knobY, r: knobR, col: [1, 1, 1, 1] });

  // 3. Draw label text to the right
  if (tw > 0) {
    emit({
      t: "text",
      str: shown,
      x: x + trackW + gap,
      y: y + Math.round((totalH - st.FontSize) * 0.5),
      col: st.Colors[ImGui.Col.Text]
    });
  }

  return { changed, checked: ch };
}

// ---------- scalar type dispatch (InputScalar/SliderScalar backing) ----------
// Per type limits, integer flag, and default format. S64/U64 exceed float
// integer precision and clamp to the safe integer range (documented limit).
const DataTypeInfo = [
  { min: -128, max: 127, integer: true, fmt: "%d" },                       // S8
  { min: 0, max: 255, integer: true, fmt: "%u" },                          // U8
  { min: -32768, max: 32767, integer: true, fmt: "%d" },                   // S16
  { min: 0, max: 65535, integer: true, fmt: "%u" },                        // U16
  { min: -2147483648, max: 2147483647, integer: true, fmt: "%d" },         // S32
  { min: 0, max: 4294967295, integer: true, fmt: "%u" },                   // U32
  { min: -9007199254740991, max: 9007199254740991, integer: true, fmt: "%d" }, // S64 (safe int clamp)
  { min: 0, max: 9007199254740991, integer: true, fmt: "%u" },              // U64 (safe int clamp)
  { min: -Infinity, max: Infinity, integer: false, fmt: "%.3f" },          // Float
  { min: -Infinity, max: Infinity, integer: false, fmt: "%.6f" },          // Double
];
function scalarInfo(dataType) {
  return DataTypeInfo[dataType] || DataTypeInfo[ImGui.DataType.Float];
}
function scalarClamp(v, info, lo, hi) {
  let mn = info.min, mx = info.max;
  if (lo !== undefined && lo !== null && Number.isFinite(lo)) mn = Math.max(mn, lo);
  if (hi !== undefined && hi !== null && Number.isFinite(hi)) mx = Math.min(mx, hi);
  if (info.integer) v = Math.round(v);
  return Math.max(mn, Math.min(mx, v));
}
function scalarFormat(dataType, format, v) {
  const fmt = format || scalarInfo(dataType).fmt;
  if (fmt.indexOf("%u") >= 0) return String(Math.max(0, Math.round(v)));
  return formatValue(fmt, v);
}

// ---------- sliders / drags ----------
function sliderBehavior(id, x, y, wd, ht, vmin, vmax, value) {
  const c = ctx();
  if ((c._disabledDepth || 0) > 0) return { changed: false, value, hovered: false };
  const h = c.hovered(x, y, wd, ht);
  if (h) c.anyWindowHovered = true;
  let v = value, changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "slider"; c.activePayload = { vmin, vmax };
  }
  if (c.activeId === id && c.activeKind === "slider") {
    const m = c.io.MousePos;
    let t = (m.x - x) / Math.max(1, wd);
    t = Math.max(0, Math.min(1, t));
    const nv = vmin + t * (vmax - vmin);
    if (nv !== v) { v = nv; changed = true; }
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; c.activePayload = null; }
  }
  return { changed, value: v, hovered: h };
}
function scalarBehavior(id, x, y, wd, ht, lo, hi, logarithmic, value) {
  const c = ctx();
  if ((c._disabledDepth || 0) > 0) return { changed: false, value, hovered: false };
  const h = c.hovered(x, y, wd, ht);
  if (h) c.anyWindowHovered = true;
  let v = value, changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "slider"; c.activePayload = { vmin: lo, vmax: hi };
  }
  if (c.activeId === id && c.activeKind === "slider") {
    const m = c.io.MousePos;
    let t = (m.x - x) / Math.max(1, wd);
    t = Math.max(0, Math.min(1, t));
    // Logarithmic scale needs a strictly positive range, else linear.
    const useLog = logarithmic && lo > 0 && hi > lo;
    const nv = useLog ? lo * Math.pow(hi / lo, t) : lo + t * (hi - lo);
    if (nv !== v) { v = nv; changed = true; }
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; c.activePayload = null; }
  }
  return { changed, value: v, hovered: h };
}
function SliderScalar(label, dataType, value, vmin, vmax, format, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
  const info = scalarInfo(dataType);
  const lo = (vmin === undefined || vmin === null) ? info.min : Math.max(info.min, vmin);
  const hi = (vmax === undefined || vmax === null) ? info.max : Math.min(info.max, vmax);
  const st = c.style;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  c.beforeItemPlacement(0, 20);
  const ctlW = itemWidthOverride() || Math.max(80, contentAvail() - tw - 70);
  const sliderW = Math.max(80, ctlW);
  const wd = sliderW + 8 + tw + 56, ht = 20;
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const log = (flags & (ImGui.SliderScalarFlags ? ImGui.SliderScalarFlags.Logarithmic : 1)) !== 0;
  const r = scalarBehavior(id, x, y + 4, sliderW, 12, lo, hi, log, value);
  const nv = scalarClamp(r.value, info, lo, hi);
  const changed = r.changed && nv !== value;
  const grabT = hi > lo ? (Math.max(lo, Math.min(hi, nv)) - lo) / (hi - lo) : 0;
  emit({ t: "rectFilled", x, y: y + 6, w: sliderW, h: 8, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  emit({ t: "rectFilled", x: x + grabT * (sliderW - 12), y: y + 3, w: 12, h: 14, r: 4, col: st.Colors[r.hovered || c.activeId === id ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
  const valStr = scalarFormat(dataType, format, nv);
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)}: ${valStr}`, x: x + sliderW + 10, y: y + 2, col: st.Colors[ImGui.Col.Text] });
  return { changed, value: nv, hovered: r.hovered };
}
function SliderFloat(label, value, vmin, vmax, format = "%.3f") {
  return SliderScalar(label, ImGui.DataType.Float, value, vmin, vmax, format);
}
function SliderInt(label, value, vmin, vmax) {
  const r = SliderScalar(label, ImGui.DataType.S32, value, vmin, vmax, undefined);
  return { changed: r.changed, value: r.value, hovered: r.hovered };
}
function DragFloat(label, value, speed = 0.05, vmin = 0, vmax = 0) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
  const st = c.style;
  const wd = 200, ht = 22;
  c.beforeItemPlacement(wd + textW(label) + 10, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd + textW(label) + 10, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const h = c.hovered(x, y, wd, ht);
  if (h) c.anyWindowHovered = true;
  let v = value, changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) { c.activeId = id; c.activeKind = "drag"; c.activePayload = { startX: c.io.MousePos.x, startV: value, speed }; }
  if (c.activeId === id && c.activeKind === "drag") {
    const dx = c.io.MousePos.x - c.activePayload.startX;
    v = c.activePayload.startV + dx * speed * Math.max(0.1, Math.abs(vmax - vmin) / 200 || 1);
    if (vmax > vmin) v = Math.max(vmin, Math.min(vmax, v));
    changed = v !== value;
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: st.FrameRounding, col: st.Colors[h ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg] });
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)} ${Number(v).toFixed(3)} (drag)`, x: x + 6, y: y + 4, col: st.Colors[ImGui.Col.Text] });
  return { changed, value: v };
}

// ---------- input text (uses hidden DOM input managed by backend) ----------
function InputText(label, text, flags = 0, hint = "", callback = null) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, text };
  if ((c._disabledDepth || 0) > 0) { c.beforeItemPlacement(0, c.style.FontSize + c.style.FramePadding.y * 2 + 2); const bw2 = itemWidthOverride() || 200; c.itemSize(bw2 + 80, 22); emit({ t: "text", str: ImGui.findRenderedTextEnd(label) + ": " + String(text||""), x: w.dc.cursorPos.x, y: w.dc.cursorPos.y, col: c.style.Colors[ImGui.Col.TextDisabled] }); return { changed: false, text }; }
  const F = ImGui.InputTextFlags || {};
  const st = c.style;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  const ht = st.FontSize + st.FramePadding.y * 2 + 2;
  c.beforeItemPlacement(0, ht);
  const bw = itemWidthOverride() ? itemWidthOverride() : Math.max(120, contentAvail() - tw - 16);
  const wd = bw + tw + 12;
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const h = c.hovered(x, y, bw, ht);
  if (h) c.anyWindowHovered = true;
  const isActive = c.activeId === id && c.activeKind === "text";

  // Activation: edit state lives in activePayload; rendering is 100% Canvas2D
  // (the backend input stays strictly off-screen — IME/mobile capture only,
  // cf. official Emscripten ports which never overlay a DOM box).
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    initTextPayload(c, id, "text", text, flags, callback);
  }

  // Deactivation: click outside, or Enter/Escape (commit flag set by backend).
  // No history push here: snapshots are pre change states only (activation,
  // space boundaries), so the first undo always moves.
  let deactivated = false, finalVal = String(text || "");
  if (isActive && ((c.io.MouseClicked[0] && !h) || (c.activePayload && c.activePayload.commit))) {
    if (c.activePayload) finalVal = c.activePayload.value;
    c.activeId = 0; c.activeKind = null; c.activePayload = null;
    if (ImGui._backendBlurText) ImGui._backendBlurText();
    deactivated = true;
  }

  const activeNow = isActive && !deactivated;
  let currentVal = activeNow && c.activePayload ? c.activePayload.value : String(text || "");
  // live typing fallback when no backend capture exists (headless/tests)
  if (activeNow && c.io.InputChars) {
    for (const ch of String(c.io.InputChars)) {
      if (_textEdit.insert(c.activePayload, ch)) { currentVal = c.activePayload.value; fireTextCallback(c, c.activePayload, F.CallbackEdit); }
    }
  }
  // CallbackAlways fires every frame while the edit is live.
  if (activeNow && c.activePayload && (flags & (F.CallbackAlways || 0))) {
    fireTextCallback(c, c.activePayload, F.CallbackAlways);
  }

  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[activeNow ? ImGui.Col.FrameBgActive : (h ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg)] });
  emit({ t: "rect", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.Border], th: 1 });

  // Text + blinking caret, always canvas-rendered (cf. imgui_widgets.cpp)
  const innerX = x + st.FramePadding.x + 2;
  const innerY = y + Math.round((ht - st.FontSize) / 2);
  if (currentVal !== "") {
    // keep the tail visible: trim from the start until it fits the box
    let displayStr = currentVal;
    while (displayStr.length > 0 && textW(displayStr) > (bw - 16)) displayStr = displayStr.slice(1);
    emit({ t: "text", str: displayStr, x: innerX, y: innerY, col: st.Colors[ImGui.Col.Text] });
    if (activeNow && Math.floor(Date.now() / 500) % 2 === 0) {
      const cx = innerX + textW(displayStr) + 1;
      emit({ t: "line", x1: cx, y1: innerY, x2: cx, y2: innerY + st.FontSize, col: st.Colors[ImGui.Col.Text], th: 1.5 });
    }
  } else if (hint !== "") {
    // Dimmed hint inside the box while empty (Dear ImGui: hint replaces value)
    emit({ t: "text", str: hint, x: innerX, y: innerY, col: st.Colors[ImGui.Col.TextDisabled] });
    if (activeNow) emit({ t: "line", x1: innerX, y1: innerY, x2: innerX, y2: innerY + st.FontSize, col: st.Colors[ImGui.Col.Text], th: 1.5 });
  } else if (activeNow) {
    emit({ t: "line", x1: innerX, y1: innerY, x2: innerX, y2: innerY + st.FontSize, col: st.Colors[ImGui.Col.Text], th: 1.5 });
  } else {
    emit({ t: "text", str: "(empty)", x: innerX, y: innerY, col: st.Colors[ImGui.Col.TextDisabled] });
  }

  // Label stays outside, to the right
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: innerY, col: st.Colors[ImGui.Col.Text] });

  const changed = deactivated ? (finalVal !== text) : (activeNow && currentVal !== text);
  // On the commit frame the payload is already gone: return the committed
  // value, otherwise callers like `s = InputText(...).text` would lose the edit.
  return { changed, text: deactivated ? finalVal : currentVal };
}
function InputTextMultiline(label, text, wArg = 0, hArg = 60, flags = 0, callback = null) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, text };
  const st = c.style;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  const ht = Math.max(40, hArg > 0 ? hArg : 60);
  // Reserve the full tall box FIRST so following widgets never overlap it.
  c.beforeItemPlacement(0, ht);
  const bw = wArg > 0 ? wArg : Math.max(120, contentAvail() - tw - 16);
  const wd = bw + tw + 12;
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const h = c.hovered(x, y, bw, ht);
  if (h) c.anyWindowHovered = true;
  const isActive = c.activeId === id && c.activeKind === "text";
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    initTextPayload(c, id, "text", text, flags, callback, { multiline: true });
  }
  let deactivated = false, finalVal = String(text || "");
  if (isActive && ((c.io.MouseClicked[0] && !h) || (c.activePayload && c.activePayload.commit))) {
    if (c.activePayload) finalVal = c.activePayload.value;
    c.activeId = 0; c.activeKind = null; c.activePayload = null;
    if (ImGui._backendBlurText) ImGui._backendBlurText();
    deactivated = true;
  }
  const activeNow = isActive && !deactivated;
  let currentVal = activeNow && c.activePayload ? c.activePayload.value : String(text || "");
  if (activeNow && c.io.InputChars) {
    const F = ImGui.InputTextFlags || {};
    for (const ch of String(c.io.InputChars)) {
      if (_textEdit.insert(c.activePayload, ch)) { currentVal = c.activePayload.value; fireTextCallback(c, c.activePayload, F.CallbackEdit); }
    }
  }
  if (activeNow && c.activePayload && (flags & ((ImGui.InputTextFlags || {}).CallbackAlways || 0))) {
    fireTextCallback(c, c.activePayload, (ImGui.InputTextFlags || {}).CallbackAlways);
  }
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[activeNow ? ImGui.Col.FrameBgActive : (h ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg)] });
  emit({ t: "rect", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
  const lineH = st.FontSize + 2;
  const lines = String(currentVal).split("\n");
  const maxLines = Math.max(1, Math.floor((ht - 6) / lineH));
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    let s = lines[i];
    while (s.length > 0 && textW(s) > (bw - 12)) s = s.slice(0, -1);
    emit({ t: "text", str: s, x: x + st.FramePadding.x + 2, y: y + 3 + i * lineH, col: st.Colors[ImGui.Col.Text] });
  }
  if (currentVal === "") emit({ t: "text", str: "(empty)", x: x + st.FramePadding.x + 2, y: y + 3, col: st.Colors[ImGui.Col.TextDisabled] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: y + 3, col: st.Colors[ImGui.Col.Text] });
  const changed = deactivated ? (finalVal !== text) : (activeNow && currentVal !== text);
  return { changed, text: deactivated ? finalVal : currentVal };
}

// ---------- color (native canvas picker via popup — no detached DOM) ----------
function ColorEdit3(label, color, flags = 0) { return ColorEdit4(label, [color[0], color[1], color[2], 1], flags); }
function ColorEdit4(label, color, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, color };
  const st = c.style;
  const ht = st.FontSize + st.FramePadding.y * 2, bw = 20;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  c.beforeItemPlacement(bw + tw + 40, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + tw + 40, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const bb = c.buttonBehavior(id, x, y, bw, ht);
  let col = [...color], changed = false;
  const cssC = `rgba(${Math.round(col[0] * 255)},${Math.round(col[1] * 255)},${Math.round(col[2] * 255)},${col[3]})`;
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.FrameBg] });
  w.drawList.push({ t: "rectFilled", x: x + 2, y: y + 2, w: bw - 4, h: ht - 4, r: Math.max(0, st.FrameRounding - 1), css: cssC });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: y + 3, col: st.Colors[ImGui.Col.Text] });
  // Swatch click opens the canvas picker popup anchored under the swatch.
  if (bb.pressed) ImGui.OpenPopup("##picker_" + id, x, y + ht + 2);
  if (ImGui.BeginPopup("##picker_" + id)) {
    const cp = ImGui.ColorPicker4(label + "##popup", col, flags);
    if (cp.changed) { col = cp.color; changed = true; }
    ImGui.EndPopup();
  }
  if (changed) return { changed: true, color: col };
  return { changed: false, color };
}

// ---------- combo / selectable ----------
function BeginCombo(label, preview, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return false;
  const CF = ImGui.ComboFlags || {};
  const st = c.style;
  const ht = st.FontSize + st.FramePadding.y * 2 + 2;
  c.beforeItemPlacement(0, ht);
  const bw = itemWidthOverride() ? Math.max(80, itemWidthOverride()) : Math.max(140, contentAvail() - textW(label) - 20);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + textW(label) + 12, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const bb = c.buttonBehavior(id, x, y, bw, ht);
  if (bb.pressed) c.comboOpen = c.comboOpen === id ? 0 : id;
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[bb.hovered || c.comboOpen === id ? ImGui.Col.ButtonHovered : ImGui.Col.FrameBg] });
  emit({ t: "rect", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
  const textY = y + Math.round((ht - st.FontSize) * 0.5);
  if (!(flags & (CF.NoPreview || 0))) {
    emit({ t: "text", str: String(preview), x: x + 8, y: textY, col: st.Colors[ImGui.Col.Text] });
  }
  if (!(flags & (CF.NoArrowButton || 0))) {
    emit({ t: "text", str: c.comboOpen === id ? "▲" : "▼", x: x + bw - 18, y: textY, col: st.Colors[ImGui.Col.Text] });
  }
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: textY, col: st.Colors[ImGui.Col.Text] });
  // stash popup anchor for EndCombo items (flush seam, zero gap)
  c._comboAnchor = { x, y: y + ht, w: bw, id, triggerY: y, triggerH: ht, flags: flags | 0 };
  // trigger rect for BeginComboPreview custom drawing (absolute coords)
  c._comboPreviewRect = { x, y, w: bw, h: ht };
  return c.comboOpen === id;
}
function EndCombo() { const c = ctx(); c._comboAnchor = null; }
// Custom preview scope: after BeginCombo returns true with NoPreview, draw
// icons, colors, or text into the returned trigger rect via the window draw
// list, then call EndComboPreview (no-op, kept for API symmetry).
function BeginComboPreview() {
  const c = ctx();
  if (c.comboOpen && c._comboPreviewRect) return { ...c._comboPreviewRect };
  return null;
}
function EndComboPreview() {}
// Height policy: smallest matching height flag wins, default 8 rows.
function comboMaxVisible(flags) {
  const CF = ImGui.ComboFlags || {};
  if (flags & (CF.HeightSmall || 0)) return 4;
  if (flags & (CF.HeightRegular || 0)) return 8;
  if (flags & (CF.HeightLarge || 0)) return 20;
  if (flags & (CF.HeightLargest || 0)) return 999;
  return 8;
}
function Combo(label, current, items, a, b) {
  // Overloads: items array (4th arg is ComboFlags), items as delimited
  // string, or getter function (4th/5th args are userData/count as before).
  let flags = 0;
  if (typeof items === "string") items = items.split("\0").filter((s) => s.length > 0);
  else if (typeof items === "function") {
    const getter = items, userData = a, count = b | 0;
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(String(getter(userData, i)));
    items = arr;
  } else {
    if (!Array.isArray(items)) items = [];
    flags = a | 0;
  }
  const preview = items[current] !== undefined ? items[current] : "";
  let changed = false, index = current;
  if (BeginCombo(label, preview, flags)) {
    const c = ctx(), w = cur(), an = c._comboAnchor;
    const st = c.style;
    const itemH = st.FontSize + st.FramePadding.y * 2; // ~19px
    const n = items.length;
    const maxVisible = comboMaxVisible(flags);
    const scrollable = n > maxVisible;
    const visRows = scrollable ? maxVisible : n;
    const ph = visRows * itemH + 6;
    const screenAnchorY = an.y - (w.scrollY || 0);
    // Combo choices live in the top overlay, in viewport coordinates. This
    // keeps them above later widgets and anchored to a scrolled control.
    let py = screenAnchorY;
    if (py + ph > w.pos.y + w.sizeFull.y - 4 || py + ph > c.io.DisplaySize.y - 8) {
      py = (an.triggerY - (w.scrollY || 0)) - ph;
    }
    py = Math.max(4, py);
    const popupBg = [0.10, 0.10, 0.12, 1.0];
    const ops = [
      { t: "rectFilled", x: an.x, y: py, w: an.w, h: ph, r: st.PopupRounding || 2, col: popupBg },
      { t: "rect", x: an.x, y: py, w: an.w, h: ph, r: st.PopupRounding || 2, col: st.Colors[ImGui.Col.Border], th: 1 },
    ];
    // Do not let underlying controls claim the pointer while choices are open.
    c._comboRect = { x: an.x, y: py, w: an.w, h: ph };
    // Internal scroll state per combo, reset whenever the list opens.
    c._comboScroll = c._comboScroll || {};
    const skey = "combo:" + an.id;
    if (c._comboLastOpen !== an.id) { c._comboScroll[skey] = 0; c._comboLastOpen = an.id; }
    let sc = c._comboScroll[skey] || 0;
    const maxScroll = Math.max(0, (n - maxVisible) * itemH);
    const m = c.io.MousePos;
    const inList = m.x >= an.x && m.x <= an.x + an.w && m.y >= py && m.y <= py + ph;
    if (scrollable) {
      // Own the wheel while open so the parent window never scrolls beneath.
      c._wheelTrap = c._wheelTrap || [];
      c._wheelTrap.push({ x: an.x, y: py, w: an.w, h: ph });
      if (inList && c.io.MouseWheel !== 0) {
        sc = Math.max(0, Math.min(maxScroll, sc - c.io.MouseWheel * itemH * 2));
        c._comboScroll[skey] = sc;
        c.io.MouseWheel = 0;
      }
    }
    const start = scrollable ? Math.max(0, Math.min(n - 1, Math.floor(sc / itemH))) : 0;
    const yOff = scrollable ? sc - start * itemH : 0;
    const rows = scrollable ? Math.min(n - start, maxVisible + 1) : n;
    for (let k = 0; k < rows; k++) {
      const i = start + k;
      const iy = py + 3 + k * itemH - yOff;
      const h = m.x >= an.x + 2 && m.x <= an.x + an.w - 2 && m.y >= iy && m.y <= iy + itemH;
      if (h) ops.push({ t: "rectFilled", x: an.x + 2, y: iy, w: an.w - 4, h: itemH, r: 2, col: st.Colors[ImGui.Col.HeaderHovered] });
      else if (i === current) ops.push({ t: "rectFilled", x: an.x + 2, y: iy, w: an.w - 4, h: itemH, r: 2, col: st.Colors[ImGui.Col.Header] });
      const itemTextY = iy + Math.round((itemH - st.FontSize) * 0.5);
      ops.push({ t: "text", str: items[i], x: an.x + 8, y: itemTextY, col: st.Colors[ImGui.Col.Text] });
      if (h && c.io.MouseClicked[0]) { index = i; changed = true; c.comboOpen = 0; c.io.MouseClicked[0] = false; c.io.MouseDown[0] = false; }
    }
    if (scrollable && maxScroll > 0) {
      const trackH = ph - 6, thumbH = Math.max(12, trackH * maxVisible / n);
      const thumbY = py + 3 + (trackH - thumbH) * (sc / maxScroll);
      ops.push({ t: "rectFilled", x: an.x + an.w - 9, y: thumbY, w: 6, h: thumbH, r: 3, col: st.Colors[ImGui.Col.ScrollbarGrab] });
    }
    // outside click dismisses and consumes the click
    if (c.io.MouseClicked[0] && !inList && !(m.x >= an.x && m.x <= an.x + an.w && m.y >= an.triggerY && m.y <= an.triggerY + an.triggerH)) {
      c.comboOpen = 0; c.io.MouseClicked[0] = false;
    }
    const onTrigger = m.x >= an.x && m.x <= an.x + an.w &&
      m.y >= an.triggerY && m.y <= an.triggerY + an.triggerH;
    // Let the combo button process its normal release click so clicking it
    // again closes the list instead of dismissing then immediately reopening.
    if (c.io.MouseClicked[0] && !inList && !onTrigger) c.comboOpen = 0;
    if (c.comboOpen !== an.id) { c._comboLastOpen = 0; delete c._comboScroll[skey]; }
    c._overlayOps = c._overlayOps || [];
    c._overlayOps.push(...ops);
    EndCombo();
  } else {
    const c = ctx();
    // A click outside an open list remains consumed for the rest of that frame.
    if (!c.io.MouseClicked[0]) c._comboRect = null;
    if (c._comboLastOpen) c._comboLastOpen = 0;
  }
  return { changed, index };
}
function Selectable(label, selected = false, flags = 0, sizeArg, align = null) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const F = ImGui.SelectableFlags || {};
  const ht = (sizeArg && sizeArg[1] > 0) ? sizeArg[1] : 20;
  c.beforeItemPlacement(0, ht);
  const wd = (sizeArg && sizeArg[0] > 0) ? sizeArg[0] : contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const disabled = !!(flags & (F.Disabled || 0));
  const hov = disabled ? false : c.hovered(x, y, wd, ht);
  if (hov) c.anyWindowHovered = true;
  const bb = disabled ? { pressed: false, hovered: false, held: false } : c.buttonBehavior(id, x, y, wd, ht);
  const hl = !!(flags & (F.Highlight || 0));
  if (selected) emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: st.Colors[ImGui.Col.Header] });
  else if (hov || hl) emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: st.Colors[ImGui.Col.HeaderHovered] });
  const al = resolveAlign(align, st.SelectableTextAlign);
  const tp = alignedTextPos(x, y, wd, ht, textW(ImGui.findRenderedTextEnd(label)), st.FramePadding.x, st.FramePadding.y, al);
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: tp.x, y: tp.y, col: st.Colors[disabled ? ImGui.Col.TextDisabled : ImGui.Col.Text] });
  if (bb.pressed && !(flags & ((F.DontClosePopups || 0) | (F.NoAutoClosePopups || 0)))) {
    if (c._popupBoxStack && c._popupBoxStack.length && ImGui.CloseCurrentPopup) ImGui.CloseCurrentPopup();
    else if (c.comboOpen) c.comboOpen = 0;
  }
  return bb.pressed && !disabled;
}
const SelectableFlags = { DontClosePopups: 1 << 0, NoAutoClosePopups: 1 << 0, SpanAllColumns: 1 << 1, AllowDoubleClick: 1 << 2, Disabled: 1 << 3, AllowOverlap: 1 << 4, Highlight: 1 << 5 };
function ListBox(label, current, items, hItems = 4) {
  // Breathing room between the label baseline and the child border so the
  // outline never glues itself to the text. Skipped for ID only labels.
  const shown = ImGui.findRenderedTextEnd(label);
  if (shown.length > 0) {
    Text(label);
    Spacing(3);
  }
  const r = listBoxImpl(label, items, hItems, false, current);
  return { changed: r.changed, index: r.single };
}
// Shared virtualized list viewport for ListBox (single) and ListBoxMulti.
// hItems > 0 sizes the viewport to that many rows and virtualizes the rest
// through an internal wheel offset (only visible rows emit Selectables, so a
// 10k item list costs a dozen draw ops). hItems <= 0 fits every item like
// the legacy implementation.
function listBoxImpl(label, items, hItems, multi, selection) {
  const c = ctx(), w = cur();
  if (!w) return { changed: false, single: 0, selection };
  const n = items.length;
  const rowH = 20, gapY = c.style.ItemSpacing.y, pitch = rowH + gapY, padY = 12;
  const fitH = padY + n * rowH + Math.max(0, n - 1) * gapY;
  const viewH = (hItems > 0) ? padY + hItems * rowH + Math.max(0, hItems - 1) * gapY : fitH;
  const sid = w.getID(label + "##scroll");
  c._listScroll = c._listScroll || {};
  c._listBoxRects = c._listBoxRects || {};
  const max = Math.max(0, fitH - viewH);
  let sc = Math.max(0, Math.min(max, c._listScroll[sid] || 0));
  // Wheel over the previous frame box scrolls internally. The parent window
  // skips its own wheel step for trapped rects (see the begin wrapper), so a
  // tall list never drags the whole window along.
  const prev = c._listBoxRects[sid];
  const m = c.io.MousePos;
  if (max > 0 && prev && m.x >= prev.x && m.x <= prev.x + prev.w && m.y >= prev.y && m.y <= prev.y + prev.h) {
    if (c.io.MouseWheel !== 0) {
      sc = Math.max(0, Math.min(max, sc - c.io.MouseWheel * pitch * 3));
      c.io.MouseWheel = 0;
    }
    c._wheelTrap = c._wheelTrap || [];
    c._wheelTrap.push({ ...prev });
  }
  c._listScroll[sid] = sc;
  const start = max > 0 ? Math.max(0, Math.min(n - 1, Math.floor(sc / pitch))) : 0;
  const end = max > 0 ? Math.min(n, start + Math.ceil(viewH / pitch) + 1) : n;
  let changed = false;
  if (BeginChild(label + "##box", 0, viewH, true)) {
    // True viewport scroll: rows keep natural positions (top offset shifts
    // the cursor directly, never through Dummy, whose itemSize would inflate
    // the line height and drift every following row) while EndChild
    // translates content up by sc under the box clip. Hit testing follows
    // via the child stack scroll (see hovered()).
    const stack = c._childStack;
    if (stack && stack.length) stack[stack.length - 1].scroll = sc;
    if (start > 0) {
      w.dc.cursorPos.y += start * pitch;
      w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
      w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, w.dc.cursorPos.y);
    }
    for (let i = start; i < end; i++) {
      if (multi) {
        if (Selectable(items[i], selection.has(i))) {
          changed = listMultiClick(c, sid, selection, i) || changed;
        }
      } else {
        if (Selectable(items[i], i === selection)) {
          if (selection !== i) { selection = i; changed = true; }
        }
      }
    }
  }
  EndChild();
  // Record this frame box for next frame hover, wheel, and trap checks, and
  // draw the scrollbar thumb when scrolling is live.
  const ops = w.drawList;
  for (let k = ops.length - 1; k >= 0; k--) {
    if (ops[k].t === "childClip") {
      const b = ops[k];
      c._listBoxRects[sid] = { x: b.x, y: b.y, w: b.w, h: b.h };
      if (max > 0) {
        const st = c.style;
        const trackX = b.x + b.w - 11, trackY = b.y + 2, trackH = Math.max(1, b.h - 4);
        const thumbH = Math.max(14, trackH * (viewH / fitH));
        const thumbY = trackY + (trackH - thumbH) * (max > 0 ? sc / max : 0);
        w.drawList.push({ t: "rectFilled", x: trackX, y: trackY, w: 7, h: trackH, r: 3, col: st.Colors[ImGui.Col.ScrollbarBg] });
        w.drawList.push({ t: "rectFilled", x: trackX, y: thumbY, w: 7, h: thumbH, r: 3, col: st.Colors[ImGui.Col.ScrollbarGrab] });
      }
      break;
    }
  }
  return { changed, single: selection, selection };
}
// Modifier click resolution for ListBoxMulti: plain click replaces, Ctrl
// toggles, Shift unions the range from the last clicked index.
function listMultiClick(c, sid, set, i) {
  const io = c.io;
  const ctrl = !!(io.KeysDown["ControlLeft"] || io.KeysDown["ControlRight"]);
  const shift = !!(io.KeysDown["ShiftLeft"] || io.KeysDown["ShiftRight"]);
  c._listMultiLast = c._listMultiLast || {};
  let changed = false;
  if (shift) {
    const from = (c._listMultiLast[sid] === undefined) ? i : c._listMultiLast[sid];
    const a = Math.min(from, i), b = Math.max(from, i);
    for (let k = a; k <= b; k++) {
      if (!set.has(k)) { set.add(k); changed = true; }
    }
  } else if (ctrl) {
    if (set.has(i)) set.delete(i); else set.add(i);
    changed = true;
    c._listMultiLast[sid] = i;
  } else {
    if (!(set.size === 1 && set.has(i))) {
      set.clear(); set.add(i); changed = true;
    }
    c._listMultiLast[sid] = i;
  }
  return changed;
}
// ListBoxMulti(label, selection, items, hItems): multi select list. selection
// accepts a Set (mutated live), an Array of indices (rewritten sorted), or a
// boolean map {index: true}. Returns { changed, selection: Set }.
function ListBoxMulti(label, selection, items, hItems = 4) {
  const shown = ImGui.findRenderedTextEnd(label);
  if (shown.length > 0) {
    Text(label);
    Spacing(3);
  }
  let set, write = null;
  if (selection instanceof Set) { set = selection; }
  else if (Array.isArray(selection)) {
    set = new Set(selection.filter((i) => i >= 0 && i < items.length));
    write = (ns) => { selection.length = 0; [...ns].sort((a, b) => a - b).forEach((i) => selection.push(i)); };
  } else {
    set = new Set();
    const src = selection || {};
    for (const k of Object.keys(src)) { const i = +k; if (src[k] && i >= 0 && i < items.length) set.add(i); }
    write = (ns) => { for (const k of Object.keys(src)) src[k] = false; for (const i of ns) src[i] = true; };
  }
  const r = listBoxImpl(label, items, hItems, true, set);
  if (r.changed && write) write(set);
  return { changed: r.changed, selection: set };
}
function ProgressBar(frac, label = "") {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  const ht = 18;
  c.beforeItemPlacement(0, ht);
  const wd = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 6, col: st.Colors[ImGui.Col.FrameBg] });
  emit({ t: "rectFilled", x, y, w: Math.max(6, wd * Math.max(0, Math.min(1, frac))), h: ht, r: 6, col: st.Colors[ImGui.Col.ButtonHovered] });
  if (label) emit({ t: "text", str: label, x: x + 8, y: y + 2, col: st.Colors[ImGui.Col.Text] });
}

// ---------- collapsing / tree ----------
function CollapsingHeader(label, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const ht = 22;
  c.beforeItemPlacement(0, ht);
  const wd = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const bb = c.buttonBehavior(id, x, y, wd, ht);
  const key = w.name + "##" + label;
  if (c.headerOpen.get(key) === undefined) c.headerOpen.set(key, true);
  if (bb.pressed) c.headerOpen.set(key, !c.headerOpen.get(key));
  const open = c.headerOpen.get(key);
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: st.Colors[bb.hovered ? ImGui.Col.HeaderHovered : ImGui.Col.Header] });
  emit({ t: "text", str: (open ? "▼ " : "▶ ") + ImGui.findRenderedTextEnd(label), x: x + 8, y: y + 4, col: st.Colors[ImGui.Col.Text] });
  return open;
}
function TreeNode(label) {
  // Delegate so PushID/Indent balance exactly with TreePop (PopID+Unindent).
  // TreeNodeEx lives in extended.js (loaded after this file); resolve lazily.
  if (ImGui.TreeNodeEx) return ImGui.TreeNodeEx(label, 0);
  const open = CollapsingHeader(label);
  if (open) Indent();
  return open;
}
function TreePop() { Unindent(); }

// ---------- printf-style text wrappers ----------
function TextV(fmt, args) { Text(formatString(fmt, args)); }
function TextColoredV(col, fmt, args) { TextColored(col, formatString(fmt, args)); }
function TextWrappedV(fmt, args) { TextWrapped(formatString(fmt, args)); }
function BulletTextV(fmt, args) { BulletText(formatString(fmt, args)); }
function TextDisabledV(fmt, args) { (ImGui.TextDisabled || TextDisabledFallback)(formatString(fmt, args)); }
function TextDisabledFallback(s) { TextColored([0.5, 0.5, 0.5, 1], s); }
function TreeNodeV(id, fmt, args) {
  const label = formatString(fmt, args);
  return TreeNode(id !== undefined && id !== null && id !== "" ? label + "##" + id : label);
}

// ---------- child ----------
function BeginChild(id, wArg = 0, hArg = 0, border = false) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  // Auto-fill height (cf. C++ size.y<=0 semantics): hArg<=0 stretches to the
  // window's interior bottom edge. Exactly one bottom padding is subtracted:
  // the box ends flush with the interior (content may touch it without
  // scrolling). Subtracting twice would leave a dead gap and would NOT fix
  // overflow, because the EndChild growth path and the parent contentH
  // padding each add their own independent overshoot (measured +6 and +8).
  const availH = (w.sizeFull.y > 0)
    ? Math.max(40, (w.pos.y + w.sizeFull.y - w.padding.y) - w.dc.cursorPos.y)
    : 240;
  const ht = hArg > 0 ? hArg : (hArg < 0 ? Math.max(40, availH + hArg) : availH);
  c.beforeItemPlacement(0, ht);
  const wd = wArg > 0 ? wArg : contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  c.itemAdd(x, y, wd, ht, 0);
  const bgIndex = w.drawList.length;
  const childBg = st.Colors[ImGui.Col.ChildBg];
  const windowBg = st.Colors[ImGui.Col.WindowBg];
  // The port renders over live webpage content, so ImGui's default fully
  // transparent ChildBg exposes page text through the child and looks like
  // ghosted content. Use an opaque window-colored fill unless a child color
  // was explicitly configured.
  const childFill = childBg[3] === 0 ? [windowBg[0], windowBg[1], windowBg[2], 1] : childBg;
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: st.ChildRounding, col: childFill });
  const borderIndex = border ? w.drawList.length : -1;
  if (border) emit({ t: "rect", x, y, w: wd, h: ht, r: st.ChildRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
  // Isolate the child scope: save the ENTIRE parent DC state so inner
  // indentation (or early returns) can never leak into outer siblings.
  // cursorMaxPos stays shared so inner content still grows the parent window.
  // clipMark: index in drawList where the child's inner ops begin. At
  // EndChild we wrap those ops in a childClip op so any that overflow the
  // fixed box are clipped instead of leaking over the border / sibling layout.
  c._childStack = c._childStack || [];
  c._childStack.push({
    cursorPos: { ...w.dc.cursorPos },
    cursorPosPrevLine: { ...w.dc.cursorPosPrevLine },
    cursorStartPos: { ...w.dc.cursorStartPos },
    indent: w._indent || 0,
    lineUsed: w.dc._lineUsed,
    currLineHeight: w.dc.currLineHeight,
    fixedH: hArg > 0, // fixed-height boxes never auto-grow (scroll/clip instead)
    parentMaxPosY: w.dc.cursorMaxPos.y, // parent extent before child content
    bounds: { x, y, w: wd, h: ht },
    clipMark: w.drawList.length,
    bgIndex: bgIndex,
    borderIndex: borderIndex,
  });
  // Reset the child work area to its own origin with a clean slate.
  w._indent = 0;
  w.dc.cursorStartPos = { x: x + 6, y: y + 6 };
  w.dc.cursorPos.x = x + 6; w.dc.cursorPos.y = y + 6;
  w.dc.cursorPosPrevLine = { x: x + 6, y: y + 6 };
  w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
  w.dc.currLineHeight = 0; w.dc._lineUsed = false; w.dc._lockFeed = true;
  return true;
}
function EndChild() {
  const c = ctx(), w = cur(); if (!w) return;
  const st = (c._childStack || []).pop();
  if (!st) { w._childBounds = null; return; }
  const b = st.bounds;
  // If inner content truly overflowed the requested box, grow the box plus
  // border to fit before wrapping the inner ops. Growth fires ONLY on genuine
  // overflow: the box reservation itself (b.y + boxH, via itemSize) and any
  // taller pre existing parent content (parentMaxPosY, e.g. a tall SameLine
  // neighbor) never count as overflow. The old test compared content plus an
  // unconditional 6px against the box, so an exactly fitting box always grew
  // by 6px past the window interior and phantom scrolled the parent.
  let boxH = b.h;
  if (!st.fixedH) {
    const base = Math.max(st.parentMaxPosY || 0, b.y + boxH);
    if (w.dc.cursorMaxPos.y > base) {
      boxH = (w.dc.cursorMaxPos.y - b.y) + 6; // overflow plus bottom breathing room
      const bg = w.drawList[st.bgIndex];
      if (bg && bg.t === "rectFilled") bg.h = boxH;
      if (st.borderIndex >= 0) {
        const bd = w.drawList[st.borderIndex];
        if (bd && bd.t === "rect") bd.h = boxH;
      }
      b.h = boxH;
    }
  }
  // Clip the child's inner ops to its own box before popping state. This
  // replaces the items that overflowed the border with a nested clip group,
  // so nested children produce nested groups (innermost clipped first). A
  // scrolled child carries its offset so the renderer translates content up
  // under the same clip (hit testing mirrors it via the child stack).
  if (typeof st.clipMark === "number" && st.clipMark < w.drawList.length) {
    const innerOps = w.drawList.splice(st.clipMark, w.drawList.length - st.clipMark);
    w.drawList.splice(st.clipMark, 0, { t: "childClip", x: b.x, y: b.y, w: b.w, h: boxH, sy: st.scroll || 0, ops: innerOps });
  }
  // Restore the outer scope even if inner code left it unbalanced.
  w._indent = st.indent || 0;
  w.dc.cursorStartPos = { ...st.cursorStartPos };
  // Register the child box as an item on the parent line (cf. C++ ItemSize):
  // the parent continues at the box's TOP-RIGHT with the line marked used, so
  // SameLine() after EndChild lands beside the box instead of below it. A
  // following widget WITHOUT SameLine takes the normal line-feed path and
  // lands below the box exactly as before (y = top + height + spacing).
  w.dc.cursorPos.x = b.x + b.w;
  w.dc.cursorPos.y = b.y;
  w.dc.cursorPosPrevLine = { x: b.x, y: b.y };
  w.dc.currLineHeight = Math.max(st.currLineHeight || 0, boxH);
  w.dc._lineUsed = true;
  w.dc.lastItemWidth = b.w;
  w.dc.lastItemHeight = boxH;
  w.dc.cursorMaxPos.y = Math.max(st.parentMaxPosY || 0, b.y + boxH);
  w.dc.cursorMaxPos.x = Math.max(w.dc.cursorMaxPos.x, b.x + b.w);
  w._childBounds = null;
}

// ---------- keybind (universal keyboard + mouse capture) ----------
// Friendly label for e.code values ("KeyF"->"F", "Digit1"->"1", mouse M1..M5).
function formatKeyName(code) {
  if (!code || code === "None") return "None";
  const map = {
    ControlLeft: "LCtrl", ControlRight: "RCtrl",
    ShiftLeft: "LShift", ShiftRight: "RShift",
    AltLeft: "LAlt", AltRight: "RAlt",
    MetaLeft: "LWin", MetaRight: "RWin",
    Escape: "Esc", Space: "Space",
    ArrowUp: "Up", ArrowDown: "Down",
    ArrowLeft: "Left", ArrowRight: "Right",
    Enter: "Enter", Backspace: "Back",
    Delete: "Del", Insert: "Ins",
    M1: "Mouse 1", M2: "Mouse 2", M3: "Mouse 3",
    M4: "Mouse 4", M5: "Mouse 5",
  };
  if (map[code]) return map[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  return code;
}
// KeyBind(label, currentBind): click the box, press any key or mouse button
// (M1..M5) to bind it; Escape clears to "None". The backend keydown/mousedown
// listeners feed the pending bind via c.activePayload ({done, result}).
// Returns {changed, key}. Query live state with Backend.isKeyOrMouseActive().
function KeyBind(label, currentBind) {
  const c = ctx(), w = cur();
  if (!w) return { changed: false, key: currentBind };
  const st = c.style;
  const shown = ImGui.findRenderedTextEnd(label);
  const tw = textW(shown);
  const bw = 90, ht = 20;
  const fullW = bw + (tw > 0 ? tw + 10 : 0);
  c.beforeItemPlacement(fullW, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(fullW, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const bb = c.buttonBehavior(id, x, y, bw, ht);
  const isListening = (c.activeId === id && c.activeKind === "keybind");
  let newBind = currentBind || "None";
  let changed = false;
  if (bb.pressed && !isListening) {
    c.activeId = id;
    c.activeKind = "keybind";
    c.activePayload = { justActivated: true, done: false, result: currentBind };
  } else if (isListening && c.activePayload) {
    // First evaluation after activation: arm the listener without consuming
    // anything, so the click that opened it can never become the new bind.
    c.activePayload.justActivated = false;
    if (c.activePayload.done) {
      newBind = c.activePayload.result || "None";
      changed = (newBind !== currentBind);
      c.activeId = 0;
      c.activeKind = null;
      c.activePayload = null;
    }
  }
  const bgCol = isListening
    ? st.Colors[ImGui.Col.ButtonActive]
    : (bb.hovered ? st.Colors[ImGui.Col.FrameBgHovered] : st.Colors[ImGui.Col.FrameBg]);
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding || 3, col: bgCol });
  emit({ t: "rect", x, y, w: bw, h: ht, r: st.FrameRounding || 3, col: st.Colors[ImGui.Col.Border], th: 1 });
  const textStr = isListening ? "Press Key/M..." : ("[ " + formatKeyName(newBind) + " ]");
  const textWd = textW(textStr);
  const tx = x + Math.max(4, (bw - textWd) / 2);
  const ty = y + Math.round((ht - st.FontSize) / 2);
  emit({ t: "text", str: textStr, x: tx, y: ty, col: isListening ? [1, 1, 0, 1] : st.Colors[ImGui.Col.Text] });
  if (tw > 0) emit({ t: "text", str: shown, x: x + bw + 8, y: ty, col: st.Colors[ImGui.Col.Text] });
  return { changed, key: newBind };
}

// ---------- multi-select combo ----------
// MultiCombo(label, flagsMap): dropdown where each entry is a checkbox row.
// flagsMap = { Wallhack: true, Chams: false, ... } (mutated in place).
// Returns {changed, flags}. Requires a unique label per call site.
function MultiCombo(label, flagsMap) {
  const c = ctx(), w = cur();
  if (!w) return { changed: false, flags: flagsMap };
  const keys = Object.keys(flagsMap);
  const preview = keys.filter((k) => flagsMap[k]).join(", ") || "(None)";
  let changed = false;
  if (BeginCombo(label, preview)) {
    const a = c._comboAnchor;
    const st = c.style;
    const itemH = st.FontSize + st.FramePadding.y * 2;
    const ph = keys.length * itemH + 6;
    const screenAnchorY = a.y - (w.scrollY || 0);
    let py = screenAnchorY;
    if (py + ph > w.pos.y + w.sizeFull.y - 4 || py + ph > c.io.DisplaySize.y - 8) {
      py = (a.triggerY - (w.scrollY || 0)) - ph;
    }
    py = Math.max(4, py);
    const popupBg = [0.10, 0.10, 0.12, 1.0];
    const ops = [
      { t: "rectFilled", x: a.x, y: py, w: a.w, h: ph, r: st.PopupRounding || 2, col: popupBg },
      { t: "rect", x: a.x, y: py, w: a.w, h: ph, r: st.PopupRounding || 2, col: st.Colors[ImGui.Col.Border], th: 1 },
    ];
    c._comboRect = { x: a.x, y: py, w: a.w, h: ph };
    const m = c.io.MousePos;
    const box = 13, gap = 7;
    keys.forEach((key, i) => {
      const iy = py + 3 + i * itemH;
      const h = m.x >= a.x + 2 && m.x <= a.x + a.w - 2 && m.y >= iy && m.y <= iy + itemH;
      if (h) ops.push({ t: "rectFilled", x: a.x + 2, y: iy, w: a.w - 4, h: itemH, r: 2, col: st.Colors[ImGui.Col.HeaderHovered] });
      const bx = a.x + 8, by = iy + Math.round((itemH - box) / 2);
      ops.push({ t: "rectFilled", x: bx, y: by, w: box, h: box, r: 3, col: st.Colors[ImGui.Col.FrameBg] });
      ops.push({ t: "rect", x: bx, y: by, w: box, h: box, r: 3, col: st.Colors[ImGui.Col.Border], th: 1 });
      if (flagsMap[key]) {
        ops.push({ t: "line", x1: bx + 2.5, y1: by + 7, x2: bx + 5.5, y2: by + 10, col: st.Colors[ImGui.Col.CheckMark], th: 2.2 });
        ops.push({ t: "line", x1: bx + 5.5, y1: by + 10, x2: bx + 10.5, y2: by + 3, col: st.Colors[ImGui.Col.CheckMark], th: 2.2 });
      }
      const itemTextY = iy + Math.round((itemH - st.FontSize) * 0.5);
      ops.push({ t: "text", str: key, x: bx + box + gap, y: itemTextY, col: st.Colors[ImGui.Col.Text] });
      if (h && c.io.MouseClicked[0]) {
        flagsMap[key] = !flagsMap[key];
        changed = true;
        c.io.MouseClicked[0] = false; c.io.MouseDown[0] = false;
      }
    });
    // Outside click dismisses (trigger click toggles via BeginCombo itself).
    if (c.io.MouseClicked[0] && !(m.x >= a.x && m.x <= a.x + a.w && m.y >= py && m.y <= py + ph) && !(m.x >= a.x && m.x <= a.x + a.w && m.y >= a.triggerY && m.y <= a.triggerY + a.triggerH)) {
      c.comboOpen = 0; c.io.MouseClicked[0] = false;
    }
    c._overlayOps = c._overlayOps || [];
    c._overlayOps.push(...ops);
    EndCombo();
  } else {
    const cc = ctx();
    if (!cc.io.MouseClicked[0]) cc._comboRect = null;
  }
  return { changed, flags: flagsMap };
}

// ---------- window wrappers (mirror imgui.h) ----------
function Begin(name, pOpen, flags) { return ctx().begin(name, pOpen, flags); }
function End() { ctx().end(); }
function SetNextWindowPos(x, y, cond) { ctx().setNextWindowPos(x, y, cond); }
function SetNextWindowSize(wd, ht, cond) { ctx().setNextWindowSize(wd, ht, cond); }
function SetNextWindowCollapsed(coll, cond) { ctx().setNextWindowCollapsed(coll, cond); }
function SetNextWindowFocus(name = '') { ctx().setNextWindowFocus(name); }
function SetNextWindowScroll(x, y) { ctx().setNextWindowScroll(x, y); }
function SetNextWindowContentSize(w, h) { ctx().setNextWindowContentSize(w, h); }
function SetNextWindowBgAlpha(a) { ctx().setNextWindowBgAlpha(a); }
function SetWindowPos(x, y) { const w = cur(); if (w) w.pos = { x, y }; }
function SetWindowSize(w2, h2) { const w = cur(); if (w) { w.size.x = w2; w.size.y = h2; w.sizeFull.x = w2; w.sizeFull.y = h2; } }
function SetWindowCollapsed(c) { const w = cur(); if (w) w.collapsed = !!c; }
function SetWindowFocus() { const w = cur(); if (w) w.z = ++globalThis.__IMGUI_WINSEQ__; }
function GetScrollX() { const w = cur(); return 0; }
function GetScrollY() { const w = cur(); return w ? (w.scrollY || 0) : 0; }
function SetScrollX() {}
function SetScrollY(y) { const w = cur(); if (w) w.scrollY = Math.max(0, y); }
function GetScrollMaxX() { return 0; }
function GetScrollMaxY() { const w = cur(); return w ? (w.scrollMax || 0) : 0; }
function SetScrollHereX(center = true) {}
function SetScrollHereY(center = true) { const w = cur(); if (w && w.scrollMax > 0 && ctx().lastItem.rect) { w.scrollY = Math.max(0, (ctx().lastItem.rect.y - w.pos.y - w.titleH) - w.sizeFull.y / 2); } }
function IsItemHovered() { return ctx().isItemHovered(); }

Object.assign(ImGui, {
  SameLine, NewLine, Spacing, Separator, Indent, Unindent, Dummy,
  Text, TextColored, TextWrapped, BulletText,
  TextV, TextColoredV, TextWrappedV, BulletTextV, TextDisabledV, TreeNodeV, formatString,
  InputTextCallbackData, _textEdit, fireTextCallback,
  Button, SmallButton, InvisibleButton,
  Checkbox, RadioButton, Toggle,
  SliderFloat, SliderInt, DragFloat, SliderScalar, DataTypeInfo,
  InputText, InputTextMultiline,
  ColorEdit3, ColorEdit4,
  BeginCombo, EndCombo, Combo, BeginComboPreview, EndComboPreview, MultiCombo, Selectable, SelectableFlags, ListBox, ListBoxMulti, ProgressBar,
  KeyBind, formatKeyName,
  CollapsingHeader, TreeNode, TreePop,
  BeginChild, EndChild,
  Begin, End, SetNextWindowPos, SetNextWindowSize, SetNextWindowCollapsed, IsItemHovered,
  SetNextWindowFocus, SetNextWindowScroll, SetNextWindowContentSize, SetNextWindowBgAlpha,
  SetWindowPos, SetWindowSize, SetWindowCollapsed, SetWindowFocus,
  GetScrollX, GetScrollY, SetScrollX, SetScrollY, GetScrollMaxX, GetScrollMaxY, SetScrollHereX, SetScrollHereY,
  _measure: textW,
});
global.__IMGUI_WIDGETS__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
