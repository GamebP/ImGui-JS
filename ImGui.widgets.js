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
// Popup input preemption: while a popup owns the left click, underlying
// widgets (empty popup-box stack) must not start interactions.
function clickSuppressed() {
  const cc = ctx();
  return !!cc._suppressChrome && !(cc._popupBoxStack && cc._popupBoxStack.length);
}
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
  const ww = w.sizeFull.x - w.padding.x * 2;
  c.beforeItemPlacement(ww, 6);
  const x = w.pos.x + w.padding.x, y = w.dc.cursorPos.y + 2;
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
  const maxW = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const lines = Math.max(1, Math.ceil(textW(str) / Math.max(40, maxW)));
  c.beforeItemPlacement(maxW, lines * 16);
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
  const pressed = Button((active ? "(●) " : "(○) ") + label);
  return pressed;
}

// ---------- sliders / drags ----------
function sliderBehavior(id, x, y, wd, ht, vmin, vmax, value) {
  const c = ctx();
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
  const sliderW = Math.max(80, w.sizeFull.x - w.padding.x * 2 - tw - 70);
  const wd = sliderW + 8 + tw + 56, ht = 20;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const r = sliderBehavior(id, x, y + 4, sliderW, 12, vmin, vmax, value);
  const grabT = (r.value - vmin) / Math.max(1e-6, vmax - vmin);
  emit({ t: "rectFilled", x, y: y + 6, w: sliderW, h: 8, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  emit({ t: "rectFilled", x: x + grabT * (sliderW - 12), y: y + 3, w: 12, h: 14, r: 4, col: st.Colors[r.hovered || c.activeId === id ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
  const valStr = Number(r.value).toFixed(3);
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)}: ${valStr}`, x: x + sliderW + 10, y: y + 2, col: st.Colors[ImGui.Col.Text] });
  return r;
}
function SliderInt(label, value, vmin, vmax) {
  const r = SliderFloat(label, value, vmin, vmax);
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
function InputText(label, text, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, text };
  const st = c.style;
  const tw = textW(ImGui.findRenderedTextEnd(label));
  const bw = Math.max(120, w.sizeFull.x - w.padding.x * 2 - tw - 16);
  const wd = bw + tw + 12, ht = st.FontSize + st.FramePadding.y * 2 + 2;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, wd, ht, id);
  const h = c.hovered(x, y + 0, bw, ht);
  if (h) c.anyWindowHovered = true;
  const isActive = c.activeId === id && c.activeKind === "text";
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "text"; c.activePayload = { value: text };
    if (ImGui._backendFocusText) ImGui._backendFocusText(x + w.pos.x * 0 + (x - w.pos.x) + 0, y, bw, ht, text, (nv) => {
      if (c.activePayload) c.activePayload.value = nv;
    });
  }
  if (isActive && c.io.MouseClicked[0] && !h) {
    // click outside -> commit & close
    text = c.activePayload ? c.activePayload.value : text;
    c.activeId = 0; c.activeKind = null;
    if (ImGui._backendBlurText) ImGui._backendBlurText();
    return { changed: true, text };
  }
  let shown = isActive && c.activePayload ? c.activePayload.value : text;
  // live typing via InputChars when no hidden input (fallback)
  if (isActive && c.io.InputChars) {
    shown += c.io.InputChars;
    if (c.activePayload) c.activePayload.value = shown;
  }
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[isActive ? ImGui.Col.FrameBgActive : (h ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg)] });
  emit({ t: "rect", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
  const display = shown.length > 24 ? "…" + shown.slice(-23) : (shown || (isActive ? "" : "(empty)"));
  emit({ t: "text", str: display + (isActive ? "▌" : ""), x: x + 6, y: y + 5, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: y + 5, col: st.Colors[ImGui.Col.Text] });
  const changed = isActive && shown !== text;
  return { changed, text: shown };
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
  const bw = Math.max(140, w.sizeFull.x - w.padding.x * 2 - textW(label) - 20);
  const ht = st.FontSize + st.FramePadding.y * 2 + 2;
  c.beforeItemPlacement(bw + textW(label) + 12, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + textW(label) + 12, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const bb = c.buttonBehavior(id, x, y, bw, ht);
  if (bb.pressed) c.comboOpen = c.comboOpen === id ? 0 : id;
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: st.FrameRounding, col: st.Colors[bb.hovered ? ImGui.Col.ButtonHovered : ImGui.Col.FrameBg] });
  emit({ t: "text", str: String(preview), x: x + 8, y: y + 5, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "text", str: c.comboOpen === id ? "▲" : "▼", x: x + bw - 20, y: y + 5, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 8, y: y + 5, col: st.Colors[ImGui.Col.Text] });
  // stash popup anchor for EndCombo items
  c._comboAnchor = { x, y: y + ht + 2, w: bw, id };
  return c.comboOpen === id;
}
function EndCombo() { const c = ctx(); c._comboAnchor = null; }
function Combo(label, current, items) {
  const preview = items[current] !== undefined ? items[current] : "";
  let changed = false, index = current;
  if (BeginCombo(label, preview)) {
    const c = ctx();
    const a = c._comboAnchor;
    // draw popup box as overlay ops in same window (clipped but visible since near anchor)
    const itemH = 22, ph = items.length * itemH + 8;
    emit({ t: "rectFilled", x: a.x, y: a.y, w: a.w, h: ph, r: 6, col: c.style.Colors[ImGui.Col.PopupBg] });
    emit({ t: "rect", x: a.x, y: a.y, w: a.w, h: ph, r: 6, col: c.style.Colors[ImGui.Col.Border], th: 1 });
    for (let i = 0; i < items.length; i++) {
      const iy = a.y + 4 + i * itemH;
      const h = c.hovered(a.x + 4, iy, a.w - 8, itemH - 2);
      if (h) emit({ t: "rectFilled", x: a.x + 4, y: iy, w: a.w - 8, h: itemH - 2, r: 4, col: c.style.Colors[ImGui.Col.HeaderHovered] });
      else if (i === current) emit({ t: "rectFilled", x: a.x + 4, y: iy, w: a.w - 8, h: itemH - 2, r: 4, col: c.style.Colors[ImGui.Col.Header] });
      emit({ t: "text", str: items[i], x: a.x + 12, y: iy + 3, col: c.style.Colors[ImGui.Col.Text] });
      if (h && c.io.MouseClicked[0]) { index = i; changed = true; c.comboOpen = 0; }
    }
    // click elsewhere closes
    const m = c.io.MousePos;
    const inside = m.x >= a.x && m.x <= a.x + a.w && m.y >= a.y && m.y <= a.y + ph;
    if (c.io.MouseClicked[0] && !inside) c.comboOpen = 0;
    EndCombo();
  }
  return { changed, index };
}
function Selectable(label, selected = false) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const wd = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const ht = 20;
  c.beforeItemPlacement(wd, ht);
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
  const n = Math.min(items.length, Math.max(2, hItems));
  // child frame
  if (BeginChild(label + "##box", 0, n * 22 + 8, true)) {
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
  const wd = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const ht = 18;
  c.beforeItemPlacement(wd, ht);
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
  const wd = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const ht = 22;
  c.beforeItemPlacement(wd, ht);
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

// ---------- child ----------
const _childStack = [];
function BeginChild(id, wArg = 0, hArg = 0, border = false) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style;
  const wd = wArg > 0 ? wArg : w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const ht = hArg > 0 ? hArg : 120;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  c.itemAdd(x, y, wd, ht, 0);
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: st.ChildRounding, col: st.Colors[ImGui.Col.ChildBg][3] === 0 ? [1, 1, 1, 0.03] : st.Colors[ImGui.Col.ChildBg] });
  if (border) emit({ t: "rect", x, y, w: wd, h: ht, r: st.ChildRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
  // Isolate the child scope: save the ENTIRE parent DC state so inner
  // indentation (or early returns) can never leak into outer siblings.
  // cursorMaxPos stays shared so inner content still grows the parent window.
  _childStack.push({
    cursorPos: { ...w.dc.cursorPos },
    cursorPosPrevLine: { ...w.dc.cursorPosPrevLine },
    cursorStartPos: { ...w.dc.cursorStartPos },
    indent: w._indent || 0,
    lineUsed: w.dc._lineUsed,
    currLineHeight: w.dc.currLineHeight,
    bounds: { x, y, w: wd, h: ht },
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
  const b = w._childBounds;
  const st = _childStack.pop();
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
function IsItemHovered() { return ctx().isItemHovered(); }

Object.assign(ImGui, {
  SameLine, NewLine, Spacing, Separator, Indent, Unindent, Dummy,
  Text, TextColored, TextWrapped, BulletText,
  Button, SmallButton, InvisibleButton,
  Checkbox, RadioButton,
  SliderFloat, SliderInt, DragFloat,
  InputText, InputTextMultiline,
  ColorEdit3, ColorEdit4,
  BeginCombo, EndCombo, Combo, Selectable, ListBox, ProgressBar,
  CollapsingHeader, TreeNode, TreePop,
  BeginChild, EndChild,
  Begin, End, SetNextWindowPos, SetNextWindowSize, SetNextWindowCollapsed, IsItemHovered,
  _measure: textW,
});
global.__IMGUI_WIDGETS__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
