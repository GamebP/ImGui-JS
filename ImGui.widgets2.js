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
// InputScalar(label, dataType, value, step, stepFast, format, flags): generic
// numeric editor. Text box flanked by optional "-" and "+" step buttons when
// step > 0 (Shift swaps in stepFast). Parses per integer or float mode and
// clamps to the data type range. Returns { changed, value }.
function InputScalar(label, dataType, value, step = 0, stepFast = 0, format, flags = 0) {
  const c = ctx(), w = cur(); if (!w) return { changed: false, value };
  const info = ImGui.DataTypeInfo[dataType] || ImGui.DataTypeInfo[ImGui.DataType.Float];
  const fmt = format || info.fmt;
  const st = c.style;
  const shown = ImGui.findRenderedTextEnd(label);
  let v = (typeof value === "number" && Number.isFinite(value)) ? value : 0;
  let changed = false;
  const stepOn = step > 0;
  const shift = !!(c.io.KeysDown["ShiftLeft"] || c.io.KeysDown["ShiftRight"]);
  const stepEff = (shift && stepFast > 0) ? stepFast : step;
  // Step buttons live on the same row through explicit SameLine placement.
  if (stepOn) {
    c.beforeItemPlacement(22, 22);
    const bx = w.dc.cursorPos.x, by = w.dc.cursorPos.y;
    c.itemSize(22, 22);
    const bid = w.getID(label + "##dec");
    c.itemAdd(bx, by, 22, 22, bid);
    const bb = c.buttonBehavior(bid, bx, by, 22, 22);
    emit({ t: "rectFilled", x: bx, y: by, w: 22, h: 22, r: st.FrameRounding, col: st.Colors[bb.hovered ? ImGui.Col.ButtonHovered : ImGui.Col.Button] });
    emit({ t: "text", str: "-", x: bx + 8, y: by + 3, col: st.Colors[ImGui.Col.Text] });
    if (bb.pressed) {
      const nv = scalarClampNum(v - stepEff, info);
      if (nv !== v) { v = nv; changed = true; }
    }
    ImGui.SameLine();
  }
  const r = ImGui.InputText(label + "##scalar", scalarText(v, info, fmt));
  let parsed = info.integer ? parseInt(r.text, 10) : parseFloat(r.text);
  if (!Number.isNaN(parsed)) {
    const nv = scalarClampNum(parsed, info);
    if (nv !== v) { v = nv; changed = true; }
    else if (r.changed) changed = true;
  }
  if (stepOn) {
    ImGui.SameLine();
    c.beforeItemPlacement(22, 22);
    const bx = w.dc.cursorPos.x, by = w.dc.cursorPos.y;
    c.itemSize(22, 22);
    const bid = w.getID(label + "##inc");
    c.itemAdd(bx, by, 22, 22, bid);
    const bb = c.buttonBehavior(bid, bx, by, 22, 22);
    emit({ t: "rectFilled", x: bx, y: by, w: 22, h: 22, r: st.FrameRounding, col: st.Colors[bb.hovered ? ImGui.Col.ButtonHovered : ImGui.Col.Button] });
    emit({ t: "text", str: "+", x: bx + 7, y: by + 3, col: st.Colors[ImGui.Col.Text] });
    if (bb.pressed) {
      const nv = scalarClampNum(v + stepEff, info);
      if (nv !== v) { v = nv; changed = true; }
    }
    if (shown.length > 0) {
      emit({ t: "text", str: shown, x: w.dc.cursorPos.x + 8, y: by + 3, col: st.Colors[ImGui.Col.Text] });
      w.dc.cursorPos.x += measure(shown) + 8;
    }
  }
  void flags;
  return { changed, value: v };
}
function scalarClampNum(v, info) {
  if (info.integer) v = Math.round(v);
  return Math.max(info.min, Math.min(info.max, v));
}
function scalarText(v, info, fmt) {
  if (fmt && fmt.indexOf("%u") >= 0) return String(Math.max(0, Math.round(v)));
  if (fmt === "%d" || (!fmt && info.integer)) return String(Math.round(v));
  if (fmt && /%\.(\d+)f/.test(fmt)) return v.toFixed(+fmt.match(/%\.(\d+)f/)[1]);
  return String(v);
}
function InputFloat(label, value, step = 0, fmt = "%.3f") {
  return InputScalar(label, ImGui.DataType.Float, value, step, 0, fmt);
}
function InputInt(label, value, step = 1) {
  return InputScalar(label, ImGui.DataType.S32, value, step, 0, undefined);
}
function InputDouble(label, value) {
  return InputScalar(label, ImGui.DataType.Double, value, 0, 0, undefined);
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
function hex2(n) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();
}
function toHexString(color, withAlpha) {
  let s = "#" + hex2(color[0] * 255) + hex2(color[1] * 255) + hex2(color[2] * 255);
  if (withAlpha) s += hex2((color[3] === undefined ? 1 : color[3]) * 255);
  return s;
}
function parseHexString(s) {
  const m = /^\s*#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?\s*$/.exec(String(s || ""));
  if (!m) return null;
  const v = parseInt(m[1], 16);
  const out = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
  if (m[2]) out[3] = parseInt(m[2], 16) / 255;
  return out;
}
function checkerOps(x, y, w, h, cell) {
  const ops = [];
  const cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const light = (ix + iy) % 2 === 0;
      ops.push({ t: "rectFilled", x: x + ix * cell, y: y + iy * cell, w: Math.min(cell + 0.5, w - ix * cell), h: Math.min(cell + 0.5, h - iy * cell), r: 0, css: light ? "#b0b0b0" : "#707070" });
    }
  }
  return ops;
}
function ColorPicker4(label, color, flags = 0) {
  // Inline picker anchored at WindowPos + Padding + CursorPos, clamped to the
  // window's clip rect so it never renders "on the other side of the world".
  const CF = ImGui.ColorEditFlags || {};
  const c = ctx(), w = cur(); if (!w) return { changed: false, color };
  const st = c.style;
  c.beforeItemPlacement(0, 26);
  const availW = Math.max(60, contentAvail());
  const S = Math.min(150, Math.max(80, availW - 18 - 60));
  const HB = 18;
  const alphaOn = !(flags & (CF.NoAlpha || 0)) && !!(flags & (CF.AlphaBar || 0));
  const AB = alphaOn ? 16 : 0;
  const barW = S + 6 + HB + (alphaOn ? 6 + AB : 0);
  const showPreview = !!(flags & ((CF.AlphaPreview || 0) | (CF.AlphaPreviewHalf || 0)));
  const showRGB = !!(flags & (CF.DisplayRGB || 0));
  const showHex = !!(flags & (CF.DisplayHex || 0));
  const showA = showRGB && !(flags & (CF.NoAlpha || 0));
  const needW = barW, ht = (showPreview ? 24 : 0) + S + 26 + (showRGB ? (showA ? 4 : 3) * 26 : 0) + (showHex ? 26 : 0);
  // Absolute anchor = window-relative cursor; clamp inside content area.
  let x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  const minX = w.pos.x + w.padding.x + (w._indent || 0);
  const maxX = w.pos.x + w.sizeFull.x - w.padding.x - needW;
  if (maxX > minX) x = Math.max(minX, Math.min(maxX, x));
  c.itemSize(needW, ht);
  const id = w.getID(label + "##picker");
  c.itemAdd(x, y, needW, S, id);
  const orig = [color[0], color[1], color[2], color[3] === undefined ? 1 : color[3]];
  let [h, s, v] = rgb2hsv(color[0], color[1], color[2]);
  let alpha = color[3] === undefined ? 1 : color[3];
  let changed = false;
  // Mouse Y is in screen space; the picker rect lives in scrolled content
  // space (cursorPos already carries the -scrollY offset from Draw).
  const curMouseY = (w && w.scrollY && !w.dc._inPopup) ? (c.io.MousePos.y + w.scrollY) : c.io.MousePos.y;
  const setSV = (mx, my) => {
    s = Math.max(0, Math.min(1, (mx - x) / S)); v = Math.max(0, Math.min(1, 1 - (my - y) / S)); changed = true;
  };
  const setH = (my) => { h = Math.max(0, Math.min(0.999, (my - y) / S)); changed = true; };
  const setA = (my) => { alpha = Math.max(0, Math.min(1, 1 - (my - y) / S)); changed = true; };
  const ax = x + S + 6 + HB + (alphaOn ? 6 : 0);
  const inSV = c.hovered(x, y, S, S), inH = c.hovered(x + S + 6, y, HB, S);
  const inA = alphaOn && c.hovered(ax, y, AB, S);
  if ((inSV || inH || inA) && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "picker"; c.activePayload = { zone: inA ? "a" : (inH ? "h" : "sv") };
    if (inA) setA(curMouseY); else if (inH) setH(curMouseY); else setSV(c.io.MousePos.x, curMouseY);
  }
  if (c.activeId === id && c.activeKind === "picker") {
    if (c.activePayload.zone === "a") setA(curMouseY);
    else if (c.activePayload.zone === "h") setH(curMouseY);
    else setSV(c.io.MousePos.x, curMouseY);
    if (!c.io.MouseDown[0]) { c.activeId = 0; c.activeKind = null; }
  }
  let oy = y;
  // Split preview swatch: left half current edit, right half original entry
  // color, checkerboard beneath when a preview flag is set.
  if (showPreview) {
    for (const op of checkerOps(x, oy, barW, 16, 8)) emit(op);
    const rgbNow = hsv2rgb(h, s, v);
    emit({ t: "rectFilled", x, y: oy, w: barW / 2, h: 16, r: 0, css: `rgba(${Math.round(rgbNow[0] * 255)},${Math.round(rgbNow[1] * 255)},${Math.round(rgbNow[2] * 255)},${alpha})` });
    emit({ t: "rectFilled", x: x + barW / 2, y: oy, w: barW - barW / 2, h: 16, r: 0, css: `rgba(${Math.round(orig[0] * 255)},${Math.round(orig[1] * 255)},${Math.round(orig[2] * 255)},${orig[3]})` });
    emit({ t: "rect", x, y: oy, w: barW, h: 16, r: 2, col: st.Colors[ImGui.Col.Border], th: 1 });
    oy += 22;
  }
  const sy = oy;
  // draw SV square as 16x16 cells (cheap gradient approx)
  const N = 16;
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const cc = hsv2rgb(h, ix / (N - 1), 1 - iy / (N - 1));
    emit({ t: "rectFilled", x: x + (ix * S) / N, y: sy + (iy * S) / N, w: S / N + 1, h: S / N + 1, r: 0, css: `rgb(${cc.map((n) => Math.round(n * 255)).join(",")})` });
  }
  for (let iy = 0; iy < N; iy++) {
    const cc = hsv2rgb(iy / N, 1, 1);
    emit({ t: "rectFilled", x: x + S + 6, y: sy + (iy * S) / N, w: HB, h: S / N + 1, r: 0, css: `rgb(${cc.map((n) => Math.round(n * 255)).join(",")})` });
  }
  if (alphaOn) {
    const rgbA = hsv2rgb(h, s, v);
    const R = Math.round(rgbA[0] * 255), G = Math.round(rgbA[1] * 255), B = Math.round(rgbA[2] * 255);
    for (const op of checkerOps(ax, sy, AB, S, 8)) emit(op);
    // Vertical gradient needs slices: Canvas2D has no vertical blend op, so
    // stack thin horizontal bands from opaque (top) to clear (bottom).
    const SL = 24;
    for (let k = 0; k < SL; k++) {
      const a = 1 - (k + 0.5) / SL;
      emit({ t: "rectFilled", x: ax, y: sy + (k * S) / SL, w: AB, h: S / SL + 0.5, r: 0, css: `rgba(${R},${G},${B},${a.toFixed(3)})` });
    }
    emit({ t: "rect", x: ax, y: sy, w: AB, h: S, r: 2, col: st.Colors[ImGui.Col.Border], th: 1 });
  }
  // markers
  emit({ t: "rect", x: x + s * S - 4, y: sy + (1 - v) * S - 4, w: 8, h: 8, r: 4, css: "#fff", th: 1.5 });
  emit({ t: "rect", x: x + S + 4, y: sy + h * S - 2, w: HB + 4, h: 5, r: 2, css: "#fff", th: 1.5 });
  if (alphaOn) emit({ t: "rect", x: ax - 2, y: sy + (1 - alpha) * S - 2, w: AB + 4, h: 5, r: 2, css: "#fff", th: 1.5 });
  let rgb = hsv2rgb(h, s, v);
  const applyRgb = (r, g, b, a) => {
    const hh = rgb2hsv(r, g, b);
    h = hh[0]; s = hh[1]; v = hh[2];
    if (a !== undefined) alpha = Math.max(0, Math.min(1, a));
    rgb = [r, g, b];
    changed = true;
  };
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x, y: sy + S + 6, col: st.Colors[ImGui.Col.Text] });
  c.anyWindowHovered = c.anyWindowHovered || inSV || inH || inA;
  const out = [rgb[0], rgb[1], rgb[2], alpha];
  if (showRGB) {
    const comps = [["R", out[0]], ["G", out[1]], ["B", out[2]]];
    if (showA) comps.push(["A", out[3]]);
    for (const [nm, cv] of comps) {
      const rr = InputInt(nm + "##" + label + "rgb", Math.round(cv * 255));
      if (rr.changed) {
        const nv = Math.max(0, Math.min(255, rr.value)) / 255;
        const cur = [out[0], out[1], out[2], out[3]];
        if (nm === "R") cur[0] = nv; else if (nm === "G") cur[1] = nv; else if (nm === "B") cur[2] = nv; else cur[3] = nv;
        applyRgb(cur[0], cur[1], cur[2], cur[3]);
      }
    }
  }
  if (showHex) {
    c._hexEdit = c._hexEdit || {};
    const hk = "hex:" + id;
    const ckey = out.map((n) => Math.round(n * 1000)).join(",");
    let entry = c._hexEdit[hk];
    if (!entry || entry.applied !== ckey) entry = c._hexEdit[hk] = { text: toHexString(out, true), applied: ckey };
    const hr = InputTextWithHint("Hex##" + label + "hex", "#RRGGBB[AA]", entry.text);
    entry.text = hr.text;
    if (hr.changed) {
      const parsed = parseHexString(hr.text);
      if (parsed) {
        applyRgb(parsed[0], parsed[1], parsed[2], (flags & (CF.NoAlpha || 0)) ? undefined : parsed[3]);
        entry.applied = out.map((n) => Math.round(n * 1000)).join(",");
      }
    }
  }
  return { changed, color: [rgb[0], rgb[1], rgb[2], alpha] };
}
function ColorPicker3(label, color, flags = 0) {
  const r = ColorPicker4(label, [color[0], color[1], color[2], 1], flags);
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
function PlotLines(label, dataOrGetter, a, b, c, d, e, f, g) {
  // Dual form: legacy (label, valuesArray, overlay, scaleMin, scaleMax, ht)
  // versus getter form (label, dataOrGetter, count, offset, overlay,
  // scaleMin, scaleMax, ht, userData). The forms are disjoint: a numeric
  // third argument (or a function source) selects the getter form.
  if (typeof a === "number" || typeof dataOrGetter === "function") {
    plotFrame(label, samplePlot(dataOrGetter, a, b, g), c || "", (f === undefined ? 60 : f), false, d, e);
  } else {
    plotFrame(label, dataOrGetter, a || "", (d === undefined ? 60 : d), false, b, c);
  }
}
function PlotHistogram(label, dataOrGetter, a, b, c, d, e, f, g) {
  if (typeof a === "number" || typeof dataOrGetter === "function") {
    plotFrame(label, samplePlot(dataOrGetter, a, b, g), c || "", (f === undefined ? 60 : f), true, d, e);
  } else {
    plotFrame(label, dataOrGetter, a || "", (d === undefined ? 60 : d), true, b, c);
  }
}
// Extended getter forms with ring buffer offset:
// PlotLinesEx(label, dataOrGetter, count, offset, overlay, scaleMin, scaleMax, height, userData)
// A parallel PlotHistogramEx exists. The base names keep the legacy array
// signature above; the Ex forms add count, offset, and function getters.
// dataOrGetter: Array (wraps at (i + offset) % length, ring buffer style) or
// Function called as getter(userData, (i + offset) % count).
function samplePlot(dataOrGetter, count, offset, userData) {
  const off = offset | 0;
  if (typeof dataOrGetter === "function") {
    const n = Math.max(1, count | 0 || 128);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      let v = 0;
      try { v = Number(dataOrGetter(userData, (i + off) % n)); } catch (e) { v = 0; }
      out[i] = Number.isFinite(v) ? v : 0;
    }
    return out;
  }
  const arr = Array.isArray(dataOrGetter) ? dataOrGetter : [];
  if (!arr.length) return [];
  const n = Math.max(1, count | 0 || arr.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = Number(arr[(i + off) % arr.length]);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}
function PlotLinesEx(label, dataOrGetter, count, offset = 0, overlay = "", scaleMin, scaleMax, ht = 60, userData = null) {
  plotFrame(label, samplePlot(dataOrGetter, count, offset, userData), overlay, ht, false, scaleMin, scaleMax);
}
function PlotHistogramEx(label, dataOrGetter, count, offset = 0, overlay = "", scaleMin, scaleMax, ht = 60, userData = null) {
  plotFrame(label, samplePlot(dataOrGetter, count, offset, userData), overlay, ht, true, scaleMin, scaleMax);
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
  InputFloat, InputInt, InputDouble, InputScalar, InputFloatN, InputIntN, InputFloat2, InputFloat3, InputTextWithHint,
  ColorButton, ColorPicker3, ColorPicker4,
  Image, ImageButton, PlotLines, PlotHistogram, PlotLinesEx, PlotHistogramEx,
  LabelText, Value, TextDisabled, SeparatorText, Bullet,
  BeginListBox, EndListBox,
  InputFloat4,
});
global.__IMGUI_WIDGETS2__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
