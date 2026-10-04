/* ImGui Browser Port — Widgets2 (ported from imgui_widgets.cpp second half)
 * Missing variants: ArrowButton, CheckboxFlags, RadioButton(int), Slider N/Angle/VSlider,
 * Drag family, InputFloat/Int/Double/WithHint, ColorButton/Picker, Image(-Button),
 * PlotLines/Histogram, LabelText, Value, SeparatorText, TextDisabled, Begin/EndListBox.
 * All functions are immediate-mode and use the core item system from ImGui.core.js.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__ || !global.__IMGUI_WIDGETS__) throw new Error("ImGui.core.js + ImGui.widgets.js must load first");
const ctx = () => ImGui.GetContext();
const cur = () => ctx().current;
const measure = (s) => (ImGui._measure ? ImGui._measure(s) : s.length * 7);
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
function dis() { const c = ctx(); return (c._disabledDepth || 0) > 0; }
function itemWidthOverride() {
  const c = ctx();
  if (c._nextItemWidth !== undefined && c._nextItemWidth !== null) {
    const w = c._nextItemWidth; c._nextItemWidth = undefined;
    if (w !== 0) return w > 0 ? w : 0;
  }
  const s = c._itemWidthStack; return (s && s.length > 0 && s[s.length - 1] > 0) ? s[s.length - 1] : 0;
}
function clickSuppressed() {
  const cc = ctx();
  return !!cc._suppressChrome && !(cc._popupBoxStack && cc._popupBoxStack.length);
}

// ---------- ArrowButton ----------
function ArrowButton(id, dir) { // dir: 0=left 1=right 2=up 3=down
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style, sz = 24;
  c.beforeItemPlacement(sz, sz);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(sz, sz);
  const hid = w.getID(id + "##arrow");
  c.itemAdd(x, y, sz, sz, hid);
  if (dis()) { emit({ t: "rectFilled", x, y, w: sz, h: sz, r: st.FrameRounding, col: st.Colors[ImGui.Col.FrameBg] }); return false; }
  const bb = c.buttonBehavior(hid, x, y, sz, sz);
  emit({ t: "rectFilled", x, y, w: sz, h: sz, r: st.FrameRounding, col: st.Colors[bb.hovered ? (bb.held ? ImGui.Col.ButtonActive : ImGui.Col.ButtonHovered) : ImGui.Col.Button] });
  const cx = x + sz / 2, cy = y + sz / 2, r = 6;
  const tri = dir === 1 ? [{ x: cx - 3, y: cy - r }, { x: cx - 3, y: cy + r }, { x: cx + 5, y: cy }]
    : dir === 0 ? [{ x: cx + 3, y: cy - r }, { x: cx + 3, y: cy + r }, { x: cx - 5, y: cy }]
    : dir === 2 ? [{ x: cx - r, y: cy + 3 }, { x: cx + r, y: cy + 3 }, { x: cx, y: cy - 5 }]
    : [{ x: cx - r, y: cy - 3 }, { x: cx + r, y: cy - 3 }, { x: cx, y: cy + 5 }];
  emit({ t: "polygon", pts: tri, col: st.Colors[ImGui.Col.Text] });
  return bb.pressed;
}

// ---------- CheckboxFlags / RadioButton(int) ----------
function CheckboxFlags(label, flags, mask) {
  const on = (flags & mask) !== 0;
  const r = ImGui.Checkbox(label, on);
  let v = flags;
  if (r.changed) v = on ? (flags & ~mask) : (flags | mask);
  return { changed: r.changed, value: v };
}
function RadioButtonInt(label, current, vButton) {
  const active = current === vButton;
  const pressed = ImGui.RadioButton(label, active);
  return { pressed, changed: pressed, value: pressed ? vButton : current };
}

// ---------- Slider N-variants / Angle / VSlider ----------
function SliderFloatN(label, values, vmin, vmax) {
  let changed = false;
  const out = values.slice();
  for (let i = 0; i < values.length; i++) {
    const r = ImGui.SliderFloat(`${label}##${i}`, values[i], vmin, vmax);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function SliderFloat2(l, v, a, b) { const r = SliderFloatN(l, v, a, b); return { changed: r.changed, values: r.values }; }
function SliderFloat3(l, v, a, b) { const r = SliderFloatN(l, v, a, b); return { changed: r.changed, values: r.values }; }
function SliderFloat4(l, v, a, b) { const r = SliderFloatN(l, v, a, b); return { changed: r.changed, values: r.values }; }
function SliderIntN_compact(label, values, vmin, vmax) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value: values };
  const st = c.style, n = values.length, bw = 160, ht = 22;
  c.beforeItemPlacement(bw + 46, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + 46, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const h = c.hovered(x, y, bw, ht);
  if (h) c.anyWindowHovered = true;
  let changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) { c.activeId = id; c.activeKind = "sliderintsc"; }
  const bwHalf = bw / n;
  if (c.activeId === id && c.activeKind === "sliderintsc") {
    // Mouse X is screen space; slider rect lives in scrolled content space.
    const curMouseX = c.io.MousePos.x;
    let i = Math.floor((curMouseX - x) / bwHalf);
    i = Math.max(0, Math.min(n - 1, i));
    const t = Math.max(0, Math.min(1, (curMouseX - (x + i * bwHalf)) / bwHalf));
    const nv = Math.round(vmin + t * (vmax - vmin));
    if (nv !== values[i]) { values[i] = nv; changed = true; }
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  for (let i = 0; i < n; i++) {
    const t = (values[i] - vmin) / Math.max(1e-6, vmax - vmin);
    const gx = x + i * bwHalf + 2 + t * Math.max(1, bwHalf - 14);
    emit({ t: "rectFilled", x: gx, y: y + 3, w: 10, h: ht - 6, r: 3, col: st.Colors[h ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
    emit({ t: "text", str: String(values[i]), x: x + i * bwHalf + 4, y: y + 3, col: st.Colors[ImGui.Col.Text] });
    if (i > 0) emit({ t: "text", str: "/", x: x + i * bwHalf - 5, y: y + 3, col: st.Colors[ImGui.Col.TextDisabled] });
  }
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + bw + 6, y: y + 3, col: st.Colors[ImGui.Col.Text] });
  return { changed, value: values, hovered: h };
}
function SliderInt2(l, v, a, b) { return SliderIntN_compact(l, v, a, b); }
function SliderInt3(l, v, a, b) { return SliderIntN_compact(l, v, a, b); }
function SliderInt4(l, v, a, b) { return SliderIntN_compact(l, v, a, b); }
function fmtNum(v, format) {
  if (!format) return String(v);
  const m = /%\.(\d+)f/.exec(format);
  if (m) return v.toFixed(+m[1]);
  if (format.indexOf("%f") >= 0) return String(v);
  if (/%d/.test(format)) return String(Math.round(v));
  return format;
}
function VSliderScalar(label, value, vmin, vmax, format) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
  const st = c.style, bw = 16, ht = 120;
  c.beforeItemPlacement(bw + 8, ht + 20);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + 8, ht + 20);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const h = c.hovered(x, y, bw, ht);
  if (h) c.anyWindowHovered = true;
  let v = value, changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) { c.activeId = id; c.activeKind = "vsliderscalar"; }
  const curMouseY = (w && w.scrollY && !w.dc._inPopup) ? (c.io.MousePos.y + w.scrollY) : c.io.MousePos.y;
  if (c.activeId === id && c.activeKind === "vsliderscalar") {
    const t = 1 - (curMouseY - y) / Math.max(1, ht);
    v = vmin + Math.max(0, Math.min(1, t)) * (vmax - vmin);
    changed = v !== value;
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  const ft = (v - vmin) / Math.max(1e-6, vmax - vmin);
  const gy = y + (1 - ft) * (ht - 10);
  emit({ t: "polygon", pts: [{ x: x + 2, y: gy }, { x: x + bw - 2, y: gy }, { x: x + bw / 2, y: gy + 8 }], col: st.Colors[h ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
  const txt = `${ImGui.findRenderedTextEnd(label)} ${fmtNum(v, format)}`;
  emit({ t: "text", str: txt, x, y: y + ht + 4, col: st.Colors[ImGui.Col.Text] });
  return { changed, value: v, hovered: h };
}
function SliderIntN(label, values, vmin, vmax) {
  let changed = false;
  const out = values.slice();
  for (let i = 0; i < values.length; i++) {
    const r = ImGui.SliderInt(`${label}##${i}`, values[i], vmin, vmax);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function SliderAngle(label, rad, vmin = -Math.PI, vmax = Math.PI) {
  const deg = rad * 180 / Math.PI;
  const r = ImGui.SliderFloat(label, deg, vmin * 180 / Math.PI, vmax * 180 / Math.PI);
  return { changed: r.changed, value: r.value * Math.PI / 180 };
}
function VSliderFloat(label, wArg, hArg, value, vmin, vmax) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
  const st = c.style, bw = Math.max(24, wArg || 28), ht = hArg || 120;
  c.beforeItemPlacement(bw + 46, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw + 46, ht);
  const id = w.getID(label);
  c.itemAdd(x, y, bw, ht, id);
  const h = c.hovered(x, y, bw, ht);
  if (h) c.anyWindowHovered = true;
  let v = value, changed = false;
  if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) { c.activeId = id; c.activeKind = "vslider"; }
  // Mouse Y is in screen space; slider bounds are in scrolled content space.
  const curMouseY = (w && w.scrollY && !w.dc._inPopup) ? (c.io.MousePos.y + w.scrollY) : c.io.MousePos.y;
  if (c.activeId === id && c.activeKind === "vslider") {
    const t = 1 - (curMouseY - y) / Math.max(1, ht);
    v = vmin + Math.max(0, Math.min(1, t)) * (vmax - vmin);
    changed = v !== value;
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  const ft = (v - vmin) / Math.max(1e-6, vmax - vmin);
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: 6, col: st.Colors[ImGui.Col.FrameBg] });
  const gh = 14, gy = y + (1 - ft) * (ht - gh);
  emit({ t: "rectFilled", x: x + 2, y: gy, w: bw - 4, h: gh, r: 5, col: st.Colors[h ? ImGui.Col.SliderGrabActive : ImGui.Col.SliderGrab] });
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)} ${Number(v).toFixed(2)}`, x: x + bw + 6, y: y + ht / 2 - 7, col: st.Colors[ImGui.Col.Text] });
  return { changed, value: v, hovered: h };
}
function VSliderInt(label, wArg, hArg, value, vmin, vmax) {
  const r = VSliderFloat(label, wArg, hArg, value, vmin, vmax);
  const iv = Math.round(r.value);
  return { changed: r.changed && iv !== value, value: iv };
}

// ---------- Drag family ----------
function DragInt(label, value, speed = 1, vmin = 0, vmax = 0) {
  const r = ImGui.DragFloat(label, value, speed, vmin, vmax);
  const iv = Math.round(r.value);
  return { changed: r.changed && iv !== value, value: iv };
}
function DragFloatN(label, values, speed = 0.05, vmin = 0, vmax = 0) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = ImGui.DragFloat(`${label}##${i}`, values[i], speed, vmin, vmax);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function DragIntN(label, values, speed = 1, vmin = 0, vmax = 0) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = DragInt(`${label}##${i}`, values[i], speed, vmin, vmax);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}

// ---------- Input numerics / hints ----------
function numericBox(label, text, parse, fmt) {
  const r = ImGui.InputText(label, text);
  const v = parse(r.text);
  return { changed: r.changed, text: r.text, value: v, ok: !Number.isNaN(v) };
}
function InputFloat(label, value, step = 0, fmt = "%.3f") {
  const r = numericBox(label, String(value), parseFloat);
  return { changed: r.changed, value: r.ok ? r.value : value };
}
function InputInt(label, value, step = 1) {
  const r = numericBox(label, String(value), (s) => parseInt(s, 10));
  return { changed: r.changed, value: r.ok ? r.value : value };
}
function InputDouble(label, value) {
  const r = numericBox(label, String(value), parseFloat);
  return { changed: r.changed, value: r.ok ? r.value : value };
}
function InputFloatN(label, values, step = 0, fmt = "%.3f", vmin, vmax) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = InputFloat(`${label}##${i}`, values[i], step, fmt);
    let v = r.value;
    if (vmin !== undefined && vmax !== undefined) v = Math.max(vmin, Math.min(vmax, v));
    out[i] = v; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function InputIntN(label, values, vmin, vmax) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = InputInt(`${label}##${i}`, values[i]);
    let v = r.value;
    if (vmin !== undefined && vmax !== undefined) v = Math.max(vmin, Math.min(vmax, v));
    out[i] = v; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function InputFloat2(l, v, vmin, vmax, step, fmt) { const r = InputFloatN(l, v, step, fmt, vmin, vmax); return { changed: r.changed, value: r.values }; }
function InputFloat3(l, v, vmin, vmax, step, fmt) { const r = InputFloatN(l, v, step, fmt, vmin, vmax); return { changed: r.changed, value: r.values }; }
// Single-row horizontal segmented drag: 4 sub-boxes in one row, each dragged
// individually. partition = (totalW - 3*Style.ItemInnerSpacing.x)/4.
function segDrag4(label, values, isInt, speed, vmin, vmax, format) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, values };
  const st = c.style, ht = 22;
  const tw = measure(ImGui.findRenderedTextEnd(label));
  c.beforeItemPlacement(0, ht);
  const totalW = Math.max(80, itemWidthOverride() || (contentAvail() - tw - 16));
  const part = Math.max(16, (totalW - 3 * st.ItemInnerSpacing.x) / 4);
  const wd = part * 4 + 3 * st.ItemInnerSpacing.x;
  const x0 = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd + tw + 12, ht);
  c.itemAdd(x0, y, wd, ht, w.getID(label));
  let changed = false;
  if (c.activeKind === "segdrag" && !c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; c.activePayload = null; }
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (part + st.ItemInnerSpacing.x);
    const h = c.hovered(x, y, part, ht);
    if (h) c.anyWindowHovered = true;
    const id = w.getID(label + "##seg" + i);
    if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
      c.activeId = id; c.activeKind = "segdrag";
      c.activePayload = { i, startX: c.io.MousePos.x, startV: values[i] };
    }
    if (c.activeId === id && c.activeKind === "segdrag" && c.activePayload) {
      const dx = c.io.MousePos.x - c.activePayload.startX;
      let nv = c.activePayload.startV + dx * speed * Math.max(0.1, Math.abs(vmax - vmin) / 200 || 1);
      if (isInt) nv = Math.round(nv);
      if (vmax > vmin) nv = Math.max(vmin, Math.min(vmax, nv));
      if (nv !== values[i]) { values[i] = nv; changed = true; }
    }
    const active = c.activeId === id && c.activeKind === "segdrag";
    emit({ t: "rectFilled", x, y, w: part, h: ht, r: st.FrameRounding, col: st.Colors[h || active ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg] });
    emit({ t: "text", str: fmtNum(values[i], format), x: x + 6, y: y + 4, col: st.Colors[ImGui.Col.Text] });
  }
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x0 + wd + 8, y: y + 4, col: st.Colors[ImGui.Col.Text] });
  return { changed, values };
}
function DragFloat4(label, values, speed = 0.05, vmin = 0, vmax = 0, format = "%.3f") {
  return segDrag4(label, values, false, speed, vmin, vmax, format);
}
function DragInt4(label, values, speed = 1, vmin = 0, vmax = 0, format = "%d") {
  return segDrag4(label, values, true, speed, vmin, vmax, format);
}
// Single-row horizontal segmented input: 4 sub-boxes, each edited individually.
function InputFloat4(label, values, format = "%.3f") {
  const c = ctx(), w = cur(); if (!w) return { changed: false, values };
  const st = c.style;
  const tw = measure(ImGui.findRenderedTextEnd(label));
  const ht = st.FontSize + st.FramePadding.y * 2 + 2;
  c.beforeItemPlacement(0, ht);
  const totalW = Math.max(80, itemWidthOverride() || (contentAvail() - tw - 16));
  const part = Math.max(16, (totalW - 3 * st.ItemInnerSpacing.x) / 4);
  const wd = part * 4 + 3 * st.ItemInnerSpacing.x;
  const x0 = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd + tw + 12, ht);
  c.itemAdd(x0, y, wd, ht, w.getID(label));
  let changed = false;

  // Finalize the active segment on outside click or Enter/Escape commit.
  if (c.activeKind === "segtext" && c.activeId !== 0 && c.activePayload) {
    const p = c.activePayload;
    const x = x0 + p.i * (part + st.ItemInnerSpacing.x);
    const hSeg = c.hovered(x, y, part, ht);
    if ((c.io.MouseClicked[0] && !hSeg) || p.commit) {
      const v = parseFloat(p.value);
      if (!Number.isNaN(v) && v !== values[p.i]) { values[p.i] = v; changed = true; }
      c.activeId = 0; c.activeKind = null; c.activePayload = null;
      if (ImGui._backendBlurText) ImGui._backendBlurText();
    } else if (c.io.InputChars) {
      p.value += c.io.InputChars;
    }
  }

  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (part + st.ItemInnerSpacing.x);
    const h = c.hovered(x, y, part, ht);
    if (h) c.anyWindowHovered = true;
    const id = w.getID(label + "##seg" + i);
    if (h && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
      c.activeId = id; c.activeKind = "segtext";
      c.activePayload = { i, value: String(values[i]), commit: false };
      if (ImGui._backendFocusText) {
        ImGui._backendFocusText(String(values[i]), (nv) => { if (c.activePayload) c.activePayload.value = nv; });
      }
    }
    const activeNow = c.activeId === id && c.activeKind === "segtext" && c.activePayload;
    const curVal = activeNow ? c.activePayload.value : fmtNum(values[i], format);
    emit({ t: "rectFilled", x, y, w: part, h: ht, r: st.FrameRounding, col: st.Colors[activeNow ? ImGui.Col.FrameBgActive : (h ? ImGui.Col.FrameBgHovered : ImGui.Col.FrameBg)] });
    emit({ t: "rect", x, y, w: part, h: ht, r: st.FrameRounding, col: st.Colors[ImGui.Col.Border], th: 1 });
    const innerY = y + Math.round((ht - st.FontSize) / 2);
    let displayStr = curVal;
    while (displayStr.length > 0 && measure(displayStr) > (part - 16)) displayStr = displayStr.slice(1);
    emit({ t: "text", str: displayStr, x: x + st.FramePadding.x + 2, y: innerY, col: st.Colors[ImGui.Col.Text] });
    if (activeNow && Math.floor(Date.now() / 500) % 2 === 0) {
      const cx = x + st.FramePadding.x + 2 + measure(displayStr) + 1;
      emit({ t: "line", x1: cx, y1: innerY, x2: cx, y2: innerY + st.FontSize, col: st.Colors[ImGui.Col.Text], th: 1.5 });
    }
  }
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x0 + wd + 8, y: y + Math.round((ht - st.FontSize) / 2), col: st.Colors[ImGui.Col.Text] });
  return { changed, values };
}
function InputTextWithHint(label, hint, text, flags = 0) {
  // Hint is drawn INSIDE the empty box by InputText itself (TextDisabled);
  // the label stays outside to the right. Never overlay the last emitted op.
  return ImGui.InputText(label, text, flags, hint);
}

// ---------- ColorButton / ColorPicker ----------
function ColorButton(id, color, wArg = 0, hArg = 0) {
  const c = ctx(), w = cur(); if (!w) return false;
  const st = c.style, bw = wArg || 28, ht = hArg || 22;
  c.beforeItemPlacement(bw, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw, ht);
  const hid = w.getID(id + "##cbtn");
  c.itemAdd(x, y, bw, ht, hid);
  const bb = c.buttonBehavior(hid, x, y, bw, ht);
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  const cssC = `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},${color[3] === undefined ? 1 : color[3]})`;
  w.drawList.push({ t: "rectFilled", x: x + 2, y: y + 2, w: bw - 4, h: ht - 4, r: 3, css: cssC });
  return bb.pressed;
}
function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
  return m;
}
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; }
  return [h, mx === 0 ? 0 : d / mx, mx];
}
function ColorPicker4(label, color) {
  // Inline picker anchored at WindowPos + Padding + CursorPos, clamped to the
  // window's clip rect so it never renders "on the other side of the world".
  const c = ctx(), w = cur(); if (!w) return { changed: false, color };
  const st = c.style;
  c.beforeItemPlacement(0, 26);
  const availW = Math.max(60, contentAvail());
  const S = Math.min(150, Math.max(80, availW - 18 - 60));
  const HB = 18;
  const needW = S + HB + 14, ht = S + 26;
  // Absolute anchor = window-relative cursor; clamp inside content area.
  let x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  const minX = w.pos.x + w.padding.x + (w._indent || 0);
  const maxX = w.pos.x + w.sizeFull.x - w.padding.x - needW;
  if (maxX > minX) x = Math.max(minX, Math.min(maxX, x));
  c.itemSize(needW, ht);
  const id = w.getID(label + "##picker");
  c.itemAdd(x, y, needW, S, id);
  let [h, s, v] = rgb2hsv(color[0], color[1], color[2]);
  let changed = false;
  // Mouse Y is in screen space; the picker rect lives in scrolled content
  // space (cursorPos already carries the -scrollY offset from Draw).
  const curMouseY = (w && w.scrollY && !w.dc._inPopup) ? (c.io.MousePos.y + w.scrollY) : c.io.MousePos.y;
  const setSV = (mx, my) => {
    s = Math.max(0, Math.min(1, (mx - x) / S)); v = Math.max(0, Math.min(1, 1 - (my - y) / S)); changed = true;
  };
  const setH = (my) => { h = Math.max(0, Math.min(0.999, (my - y) / S)); changed = true; };
  const inSV = c.hovered(x, y, S, S), inH = c.hovered(x + S + 6, y, HB, S);
  if ((inSV || inH) && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "picker"; c.activePayload = { zone: inH ? "h" : "sv" };
    if (inH) setH(curMouseY); else setSV(c.io.MousePos.x, curMouseY);
  }
  if (c.activeId === id && c.activeKind === "picker") {
    if (c.activePayload.zone === "h") setH(curMouseY); else setSV(c.io.MousePos.x, curMouseY);
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  // draw SV square as 16x16 cells (cheap gradient approx)
  const N = 16;
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const cc = hsv2rgb(h, ix / (N - 1), 1 - iy / (N - 1));
    emit({ t: "rectFilled", x: x + (ix * S) / N, y: y + (iy * S) / N, w: S / N + 1, h: S / N + 1, r: 0, css: `rgb(${cc.map((n) => Math.round(n * 255)).join(",")})` });
  }
  for (let iy = 0; iy < N; iy++) {
    const cc = hsv2rgb(iy / N, 1, 1);
    emit({ t: "rectFilled", x: x + S + 6, y: y + (iy * S) / N, w: HB, h: S / N + 1, r: 0, css: `rgb(${cc.map((n) => Math.round(n * 255)).join(",")})` });
  }
  // markers
  emit({ t: "rect", x: x + s * S - 4, y: y + (1 - v) * S - 4, w: 8, h: 8, r: 4, css: "#fff", th: 1.5 });
  emit({ t: "rect", x: x + S + 4, y: y + h * S - 2, w: HB + 4, h: 5, r: 2, css: "#fff", th: 1.5 });
  const rgb = hsv2rgb(h, s, v);
  const out = [rgb[0], rgb[1], rgb[2], color[3] === undefined ? 1 : color[3]];
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x, y: y + S + 6, col: st.Colors[ImGui.Col.Text] });
  c.anyWindowHovered = c.anyWindowHovered || inSV || inH;
  return { changed, color: out };
}
function ColorPicker3(label, color) {
  const r = ColorPicker4(label, [color[0], color[1], color[2], 1]);
  return { changed: r.changed, color: [r.color[0], r.color[1], r.color[2]] };
}

// ---------- Image / ImageButton ----------
function Image(el, wArg, hArg) {
  const c = ctx(), w = cur(); if (!w) return;
  const bw = wArg || 64, ht = hArg || 64;
  c.beforeItemPlacement(bw, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw, ht); c.itemAdd(x, y, bw, ht, 0);
  emit({ t: "image", el, x, y, w: bw, h: ht, border: true });
}
function ImageButton(id, el, wArg, hArg) {
  const c = ctx(), w = cur(); if (!w) return false;
  const bw = wArg || 64, ht = hArg || 64;
  c.beforeItemPlacement(bw, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw, ht);
  const hid = w.getID(id + "##imgbtn");
  c.itemAdd(x, y, bw, ht, hid);
  const bb = c.buttonBehavior(hid, x, y, bw, ht);
  emit({ t: "image", el, x, y, w: bw, h: ht, border: true });
  if (bb.hovered) emit({ t: "rect", x, y, w: bw, h: ht, r: 4, col: c.style.Colors[ImGui.Col.ButtonHovered], th: 2 });
  return bb.pressed;
}

// ---------- Plots ----------
function plotFrame(label, values, overlay, ht, isHist, scaleMin, scaleMax) {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  c.beforeItemPlacement(0, ht + 18);
  const bw = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(bw, ht + 18);
  const vals = Array.isArray(values) ? values : [];
  let mn = scaleMin, mx = scaleMax;
  if (mn === undefined || mx === undefined) {
    mn = Infinity; mx = -Infinity;
    for (const v of vals) { const n = typeof v === "function" ? 0 : v; if (n < mn) mn = n; if (n > mx) mx = n; }
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (mx - mn < 1e-6) { mx = mn + 1; }
  }
  emit({ t: "rectFilled", x, y, w: bw, h: ht, r: 4, col: st.Colors[ImGui.Col.FrameBg] });
  if (vals.length) {
    if (isHist) {
      const bwBar = bw / vals.length;
      vals.forEach((vv, i) => {
        const t = (vv - mn) / (mx - mn);
        const bh = Math.max(2, t * (ht - 4));
        emit({ t: "rectFilled", x: x + i * bwBar + 1, y: y + ht - 2 - bh, w: Math.max(1, bwBar - 2), h: bh, r: 1, col: st.Colors[ImGui.Col.PlotHistogram || ImGui.Col.ButtonHovered] });
      });
    } else {
      const pts = vals.map((vv, i) => ({ x: x + 2 + (i / Math.max(1, vals.length - 1)) * (bw - 4), y: y + 2 + (1 - (vv - mn) / (mx - mn)) * (ht - 4) }));
      emit({ t: "polyline", pts, col: st.Colors[ImGui.Col.PlotLines || ImGui.Col.ButtonHovered], th: 1.5 });
    }
  }
  emit({ t: "text", str: `${ImGui.findRenderedTextEnd(label)}${overlay ? " " + overlay : ""}`, x, y: y + ht + 3, col: st.Colors[ImGui.Col.Text] });
}
function PlotLines(label, values, overlay = "", scaleMin, scaleMax, ht = 60) {
  plotFrame(label, values, overlay, ht, false, scaleMin, scaleMax);
}
function PlotHistogram(label, values, overlay = "", scaleMin, scaleMax, ht = 60) {
  plotFrame(label, values, overlay, ht, true, scaleMin, scaleMax);
}

// ---------- LabelText / Value / misc text ----------
function LabelText(label, text) {
  const c = ctx(), w = cur(); if (!w) return;
  const str = `${ImGui.findRenderedTextEnd(label)}: ${text}`;
  c.beforeItemPlacement(measure(str), 16);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(measure(str), 16);
  emit({ t: "text", str, x, y, col: c.style.Colors[ImGui.Col.Text] });
}
function Value(label, v) {
  if (typeof v === "boolean") LabelText(label, v ? "true" : "false");
  else if (typeof v === "number") LabelText(label, Number.isInteger(v) ? String(v) : v.toFixed(3));
  else LabelText(label, String(v));
}
function TextDisabled(str) {
  const c = ctx(), w = cur(); if (!w) return;
  c.beforeItemPlacement(measure(str), 16);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(measure(str), 16);
  emit({ t: "text", str, x, y, col: c.style.Colors[ImGui.Col.TextDisabled] });
}
function SeparatorText(label) {
  const c = ctx(), w = cur(); if (!w) return;
  const st = c.style;
  // Left aligned section header (C++ SeparatorTextAlign default): 24px rule
  // prefix, label, then trailing rule to the right margin. Generous vertical
  // padding keeps the rules clear of widgets above and below.
  const padY = 6;
  const ht = st.FontSize + padY * 2;
  c.beforeItemPlacement(0, ht);
  const bw = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  const tw = measure(label);
  const rule = 24, gap = 6;
  const tx = x + rule + gap;
  const textY = y + padY;
  const midY = Math.round(y + ht / 2) + 0.5;
  emit({ t: "line", x1: x, y1: midY, x2: x + rule, y2: midY, col: st.Colors[ImGui.Col.Separator], th: 1 });
  emit({ t: "text", str: label, x: tx, y: textY, col: st.Colors[ImGui.Col.Text] });
  const tailX = tx + tw + gap;
  if (tailX < x + bw) emit({ t: "line", x1: tailX, y1: midY, x2: x + bw, y2: midY, col: st.Colors[ImGui.Col.Separator], th: 1 });
  c.itemSize(bw, ht);
}
function Bullet() {
  const c = ctx(), w = cur(); if (!w) return;
  c.beforeItemPlacement(12, 16);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  emit({ t: "circleFilled", x: x + 4, y: y + 8, r: 2.5, col: c.style.Colors[ImGui.Col.Text] });
  c.itemSize(12, 16);
}
function BeginListBox(label, wArg = 0, hArg = 0) {
  // hArg <= 0 auto fills remaining window height through BeginChild, so rows
  // are never sliced by a fixed default. Explicit heights still clip (this
  // port has no child scrolling), so size fixed boxes to fit their content.
  return ImGui.BeginChild(label + "##listbox", wArg, hArg, true);
}
function EndListBox() { ImGui.EndChild(); }

Object.assign(ImGui, {
  ArrowButton, CheckboxFlags, RadioButtonInt,
  SliderFloat2, SliderFloat3, SliderFloat4, SliderIntN, SliderInt2, SliderInt3, SliderInt4, SliderAngle, VSliderFloat, VSliderInt, VSliderScalar,
  DragInt, DragFloatN, DragIntN, DragFloat4, DragInt4,
  InputFloat, InputInt, InputDouble, InputFloatN, InputIntN, InputFloat2, InputFloat3, InputTextWithHint,
  ColorButton, ColorPicker3, ColorPicker4,
  Image, ImageButton, PlotLines, PlotHistogram,
  LabelText, Value, TextDisabled, SeparatorText, Bullet,
  BeginListBox, EndListBox,
  InputFloat4,
});
global.__IMGUI_WIDGETS2__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
