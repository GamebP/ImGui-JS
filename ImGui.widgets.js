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
  if (stack && stack.length > 0) {
    const t = stack[stack.length - 1];
    return Math.max(0, (t.bounds.x + t.bounds.w - 6) - w.dc.cursorPos.x);
  }
  return Math.max(0, w.pos.x + w.sizeFull.x - w.padding.x - scrollbarReserve - w.dc.cursorPos.x);
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
function itemWidthOverride() { const c = ctx(); const s = c._itemWidthStack; return (s && s.length > 0 && s[s.length - 1] > 0) ? s[s.length - 1] : 0; }
function frameCol(base, hov, act, h, held) {
  const c = ctx(), st = c.style;
  return h ? (held ? st.Colors[act] : st.Colors[hov]) : st.Colors[base];
}

// ---------- layout ----------
function SameLine(offX = 0, spacing = -1) { ctx().sameLine(offX, spacing); }
function NewLine() { const w = cur(); if (w) { ctx().newLineBreak(); } }
function Spacing() { const w = cur(); if (!w) return; const c = ctx(); c.beforeItemPlacement(0, 4); c.itemSize(0, 4); }
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
  c.beforeItemPlacement(tw, th);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(tw, th); c.itemAdd(x, y, tw, th, 0);
  emit({ t: "text", str: label, x, y, col: st.Colors[ImGui.Col.Text] });
}
function TextColored(col, str) {
  const c = ctx(), w = cur(); if (!w) return;
  const tw = textW(str), th = 16;
  c.beforeItemPlacement(tw, th);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(tw, th); c.itemAdd(x, y, tw, th, 0);
  emit({ t: "text", str, x, y, col });
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
function Button(label, wArg = 0, hArg = 0) {
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
  emit({ t: "text", str: shown, x: x + (wd - tw) / 2, y: y + (ht - st.FontSize) / 2 - 1, col: st.Colors[ImGui.Col.Text] });
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
function SliderFloat(label, value, vmin, vmax, format = "%.3f") {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
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
  const r = sliderBehavior(id, x, y + 4, sliderW, 12, vmin, vmax, value);
  const grabT = (r.value - vmin) / Math.max(1e-6, vmax - vmin);
  emit({ t: "rectFilled", x, y: y + 6, w: sliderW, h: 8, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  emit({ t: "rectFilled", x: x + grabT * (sliderW - 12), y: y + 3, w: 12, h: 14, r: 4, col: st.Colors[r.hovered || c.activeId === id ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
  const valStr = formatValue(format, r.value);
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)}: ${valStr}`, x: x + sliderW + 10, y: y + 2, col: st.Colors[ImGui.Col.Text] });
  return r;
}
function SliderInt(label, value, vmin, vmax) {
  const r = SliderFloat(label, value, vmin, vmax, "%.0f");
  const iv = Math.round(r.value);
  return { changed: r.changed && iv !== value, value: iv };
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
function InputText(label, text, flags = 0, hint = "") {
  const c = ctx(), w = cur(); if (!w) return { changed: false, text };
  if ((c._disabledDepth || 0) > 0) { c.beforeItemPlacement(0, c.style.FontSize + c.style.FramePadding.y * 2 + 2); const bw2 = itemWidthOverride() || 200; c.itemSize(bw2 + 80, 22); emit({ t: "text", str: ImGui.findRenderedTextEnd(label) + ": " + String(text||""), x: w.dc.cursorPos.x, y: w.dc.cursorPos.y, col: c.style.Colors[ImGui.Col.TextDisabled] }); return { changed: false, text }; }
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
    c.activeId = id; c.activeKind = "text";
    c.activePayload = { value: String(text || ""), cursorPos: String(text || "").length, commit: false };
    if (ImGui._backendFocusText) {
      ImGui._backendFocusText(c.activePayload.value, (nv) => {
        if (c.activePayload) c.activePayload.value = nv;
      });
    }
  }

  // Deactivation: click outside, or Enter/Escape (commit flag set by backend).
  let deactivated = false, finalVal = String(text || "");
  if (isActive && ((c.io.MouseClicked[0] && !h) || (c.activePayload && c.activePayload.commit))) {
    finalVal = c.activePayload ? c.activePayload.value : String(text || "");
    c.activeId = 0; c.activeKind = null; c.activePayload = null;
    if (ImGui._backendBlurText) ImGui._backendBlurText();
    deactivated = true;
  }

  const activeNow = isActive && !deactivated;
  let currentVal = activeNow && c.activePayload ? c.activePayload.value : String(text || "");
  // live typing fallback when no backend capture exists (headless/tests)
  if (activeNow && c.io.InputChars) {
    currentVal += c.io.InputChars;
    if (c.activePayload) c.activePayload.value = currentVal;
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
function InputTextMultiline(label, text, wArg = 0, hArg = 60) {
  // simplified: single-line box taller
  const r = InputText(label, text);
  return r;
}

// ---------- color (native canvas picker via popup — no detached DOM) ----------
function ColorEdit3(label, color) { return ColorEdit4(label, [color[0], color[1], color[2], 1]); }
function ColorEdit4(label, color) {
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
    const cp = ImGui.ColorPicker4(label + "##popup", col);
    if (cp.changed) { col = cp.color; changed = true; }
    ImGui.EndPopup();
  }
  if (changed) return { changed: true, color: col };
  return { changed: false, color };
}

// ---------- combo / selectable ----------
function BeginCombo(label, preview) {
  const c = ctx(), w = cur(); if (!w) return false;
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
  emit({ t: "text", str: String(preview), x: x + 8, y: textY, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "text", str: c.comboOpen === id ? "▲" : "▼", x: x + bw - 18, y: textY, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: textY, col: st.Colors[ImGui.Col.Text] });
  // stash popup anchor for EndCombo items (flush seam, zero gap)
  c._comboAnchor = { x, y: y + ht, w: bw, id, triggerY: y, triggerH: ht };
  return c.comboOpen === id;
}
function EndCombo() { const c = ctx(); c._comboAnchor = null; }
function Combo(label, current, items) {
  const preview = items[current] !== undefined ? items[current] : "";
  let changed = false, index = current;
  if (BeginCombo(label, preview)) {
    const c = ctx(), w = cur(), a = c._comboAnchor;
    const st = c.style;
    const itemH = st.FontSize + st.FramePadding.y * 2; // ~19px
    const ph = items.length * itemH + 6;
    const screenAnchorY = a.y - (w.scrollY || 0);
    // Combo choices live in the top overlay, in viewport coordinates. This
    // keeps them above later widgets and anchored to a scrolled control.
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
    // Do not let underlying controls claim the pointer while choices are open.
    c._comboRect = { x: a.x, y: py, w: a.w, h: ph };
    const m = c.io.MousePos;
    for (let i = 0; i < items.length; i++) {
      const iy = py + 3 + i * itemH;
      const h = m.x >= a.x + 2 && m.x <= a.x + a.w - 2 && m.y >= iy && m.y <= iy + itemH;
      if (h) ops.push({ t: "rectFilled", x: a.x + 2, y: iy, w: a.w - 4, h: itemH, r: 2, col: st.Colors[ImGui.Col.HeaderHovered] });
      else if (i === current) ops.push({ t: "rectFilled", x: a.x + 2, y: iy, w: a.w - 4, h: itemH, r: 2, col: st.Colors[ImGui.Col.Header] });
      const itemTextY = iy + Math.round((itemH - st.FontSize) * 0.5);
      ops.push({ t: "text", str: items[i], x: a.x + 8, y: itemTextY, col: st.Colors[ImGui.Col.Text] });
      if (h && c.io.MouseClicked[0]) { index = i; changed = true; c.comboOpen = 0; c.io.MouseClicked[0] = false; c.io.MouseDown[0] = false; }
    }
    // outside click dismisses and consumes the click
    if (c.io.MouseClicked[0] && !(m.x >= a.x && m.x <= a.x + a.w && m.y >= py && m.y <= py + ph) && !(m.x >= a.x && m.x <= a.x + a.w && m.y >= a.triggerY && m.y <= a.triggerY + a.triggerH)) {
      c.comboOpen = 0; c.io.MouseClicked[0] = false;
    }
    const inside = m.x >= a.x && m.x <= a.x + a.w && m.y >= py && m.y <= py + ph;
    const onTrigger = m.x >= a.x && m.x <= a.x + a.w &&
      m.y >= a.triggerY && m.y <= a.triggerY + a.triggerH;
    // Let the combo button process its normal release click so clicking it
    // again closes the list instead of dismissing then immediately reopening.
    if (c.io.MouseClicked[0] && !inside && !onTrigger) c.comboOpen = 0;
    c._overlayOps = c._overlayOps || [];
    c._overlayOps.push(...ops);
    EndCombo();
  } else {
    const c = ctx();
    // A click outside an open list remains consumed for the rest of that frame.
    if (!c.io.MouseClicked[0]) c._comboRect = null;
  }
  return { changed, index };
}
function Selectable(label, selected = false) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const ht = 20;
  c.beforeItemPlacement(0, ht);
  const wd = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const bb = c.buttonBehavior(id, x, y, wd, ht);
  if (selected) emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: st.Colors[ImGui.Col.Header] });
  else if (bb.hovered) emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: st.Colors[ImGui.Col.HeaderHovered] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + 8, y: y + 3, col: st.Colors[ImGui.Col.Text] });
  return bb.pressed;
}
function ListBox(label, current, items, hItems = 4) {
  Text(label);
  let idx = current, changed = false;
  if (BeginChild(label + "##box", 0, items.length * 22 + 8, true)) {
    for (let i = 0; i < items.length; i++) {
      if (Selectable(items[i], i === idx)) { idx = i; changed = true; }
    }
  }
  EndChild();
  return { changed, index: idx };
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
  const ht = hArg > 0 ? hArg : 120;
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
  const b = st ? st.bounds : undefined;
  // If the content overflowed the requested box (items leak above the border),
  // grow the box + border to fit before wrapping the inner ops — otherwise
  // the overflow would clip silently and the parent cursor wouldn't advance.
  let boxH = st ? st.bounds.h : 0;
  if (st) {
    const contentH = (w.dc.cursorMaxPos.y - st.bounds.y) + 6; // content + bottom padding
    if (contentH > boxH) {
      boxH = contentH;
      const bg = w.drawList[st.bgIndex];
      if (bg && bg.t === "rectFilled") bg.h = boxH;
      if (st.borderIndex >= 0) {
        const bd = w.drawList[st.borderIndex];
        if (bd && bd.t === "rect") bd.h = boxH;
      }
      st.bounds.h = boxH;
    }
  }
  // Clip the child's inner ops to its own box before popping state. This
  // replaces the items that overflowed the border with a nested clip group,
  // so nested children produce nested groups (innermost clipped first).
  if (st && typeof st.clipMark === "number" && st.clipMark < w.drawList.length) {
    const innerOps = w.drawList.splice(st.clipMark, w.drawList.length - st.clipMark);
    w.drawList.splice(st.clipMark, 0, { t: "childClip", x: st.bounds.x, y: st.bounds.y, w: st.bounds.w, h: boxH, ops: innerOps });
  }
  // Restore the outer scope even if inner code left it unbalanced.
  if (st) {
    w._indent = st.indent || 0;
    w.dc.cursorStartPos = { ...st.cursorStartPos };
  }
  if (b) {
    w.dc.cursorPos.x = b.x;
    w.dc.cursorPos.y = Math.max(w.dc.cursorPos.y, b.y + b.h + c.style.ItemSpacing.y);
    w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
    w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, b.y + b.h);
  }
  w._childBounds = null;
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
  Button, SmallButton, InvisibleButton,
  Checkbox, RadioButton, Toggle,
  SliderFloat, SliderInt, DragFloat,
  InputText, InputTextMultiline,
  ColorEdit3, ColorEdit4,
  BeginCombo, EndCombo, Combo, Selectable, ListBox, ProgressBar,
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
