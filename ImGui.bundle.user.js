// ==UserScript==
// @name         ImGui Browser Port — Bundle (one-click install)
// @namespace    https://github.com/GamebP/ImGui-JS
// @version      1.0.5
// @description  Dear ImGui 1.92.9b window system ported to Violentmonkey — single-file bundle, no hosting needed. Drag windows, edit MY_MENU to build your own menu.
// @match        *://*/*
// @noframes
// @grant        none
// @run-at       document-idle
// @downloadURL   https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.bundle.user.js
// @updateURL     https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.bundle.user.js
// ==/UserScript==
/* BUNDLE: ImGui.core.js + ImGui.draw.js + ImGui.widgets.js + ImGui.backend.js + ImGui.main.js body.
 * Built from Build/. Edit the split files, then rebuild with: python3 build_bundle.py */
;(function(){/*__CORE__*/
/* ImGui Browser Port — Core (ported from imgui-1.92.9b)
 * Covers: imgui.h Begin/End API, imgui.cpp Begin/End lifecycle,
 *   imgui_internal.h ImGuiWindow + NextWindowData, ImGuiIO input queue,
 *   ImGuiStyle defaults, ID stack + ItemAdd/ButtonBehavior.
 * Exposes: globalThis.ImGui (namespace, created here, extended by widgets/draw/backend)
 * License: MIT (port). Original Dear ImGui (imgui-1.92.9b) is MIT by Omar Cornut.
 */
(function (global) {
"use strict";

const IMGUI_VERSION = "1.92.9b-js-port-1.0.5";

// ---- hash (ImHashStr FNV-1a, cf. imgui.cpp) ----
function hashStr(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function findRenderedTextEnd(label) {
  const i = label.indexOf("##");
  return i >= 0 ? label.slice(0, i) : label;
}

// ---- enums (imgui.h:1171 ImGuiWindowFlags_, imgui.h:1756 ImGuiCol_) ----
const WindowFlags = {
  None: 0, NoTitleBar: 1 << 0, NoResize: 1 << 1, NoMove: 1 << 2,
  NoScrollbar: 1 << 3, NoScrollWithMouse: 1 << 4, NoCollapse: 1 << 5,
  AlwaysAutoResize: 1 << 6, NoBackground: 1 << 7, NoSavedSettings: 1 << 8,
  NoMouseInputs: 1 << 9, MenuBar: 1 << 10, HorizontalScrollbar: 1 << 11,
  NoFocusOnAppearing: 1 << 12, NoBringToFrontOnFocus: 1 << 13,
  AlwaysVerticalScrollbar: 1 << 14, AlwaysHorizontalScrollbar: 1 << 15,
  NoNavInputs: 1 << 16, NoNavFocus: 1 << 17, UnsavedDocument: 1 << 18,
  NoNav: (1 << 16) | (1 << 17),
  NoDecoration: (1 << 0) | (1 << 1) | (1 << 3) | (1 << 5),
  NoInputs: (1 << 9) | (1 << 16) | (1 << 17),
};
const Cond = { None: 0, Always: 1, Once: 2, FirstUseEver: 4, Appearing: 8 };
const Col = {
  Text: 0, TextDisabled: 1, WindowBg: 2, ChildBg: 3, PopupBg: 4, Border: 5,
  BorderShadow: 6, FrameBg: 7, FrameBgHovered: 8, FrameBgActive: 9,
  TitleBg: 10, TitleBgActive: 11, TitleBgCollapsed: 12, MenuBarBg: 13,
  ScrollbarBg: 14, ScrollbarGrab: 15, ScrollbarGrabHovered: 16, ScrollbarGrabActive: 17,
  CheckMark: 18, CheckboxSelectedBg: 19, SliderGrab: 20, SliderGrabActive: 21,
  Button: 22, ButtonHovered: 23, ButtonActive: 24,
  Header: 25, HeaderHovered: 26, HeaderActive: 27,
  Separator: 28, SeparatorHovered: 29, SeparatorActive: 30,
  ResizeGrip: 31, ResizeGripHovered: 32, ResizeGripActive: 33,
  InputTextCursor: 34, TabHovered: 35, Tab: 36, TabSelected: 37,
  TabSelectedOverline: 38, TabDimmed: 39, TabDimmedSelected: 40,
  TabDimmedSelectedOverline: 41, PlotLines: 42, PlotLinesHovered: 43,
  PlotHistogram: 44, PlotHistogramHovered: 45, TableHeaderBg: 46,
  TableBorderStrong: 47, TableBorderLight: 48, TableRowBg: 49, TableRowBgAlt: 50,
  TextLink: 51, TextSelectedBg: 52, TreeLines: 53, DragDropTarget: 54,
  DragDropTargetBg: 55, UnsavedMarker: 56, NavCursor: 57,
  NavWindowingHighlight: 58, NavWindowingDimBg: 59, ModalWindowDimBg: 60,
  COUNT: 61,
  // Renamed aliases (imgui.h:1822)
  TabActive: 37, TabUnfocused: 39, TabUnfocusedActive: 40, NavHighlight: 57,
};

// ---- color helpers ----
function colF(r, g, b, a = 1) { return [r, g, b, a]; }
function colToCss(c, alphaMul = 1) {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * 255)));
  const a = Math.max(0, Math.min(1, c[3] * alphaMul));
  return `rgba(${r},${g},${b},${a})`;
}

// ---- style (exact defaults, imgui.cpp:1507-1592) ----
function lerpCol(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
}
function applyStyleDark(C) {
  C[Col.Text] = colF(1, 1, 1, 1);
  C[Col.TextDisabled] = colF(0.5, 0.5, 0.5, 1);
  C[Col.WindowBg] = colF(0.06, 0.06, 0.06, 0.94);
  C[Col.ChildBg] = colF(0, 0, 0, 0);
  C[Col.PopupBg] = colF(0.08, 0.08, 0.08, 0.94);
  C[Col.Border] = colF(0.43, 0.43, 0.50, 0.50);
  C[Col.BorderShadow] = colF(0, 0, 0, 0);
  C[Col.FrameBg] = colF(0.16, 0.29, 0.48, 0.54);
  C[Col.FrameBgHovered] = colF(0.26, 0.59, 0.98, 0.40);
  C[Col.FrameBgActive] = colF(0.26, 0.59, 0.98, 0.67);
  C[Col.TitleBg] = colF(0.04, 0.04, 0.04, 1);
  C[Col.TitleBgActive] = colF(0.16, 0.29, 0.48, 1);
  C[Col.TitleBgCollapsed] = colF(0, 0, 0, 0.51);
  C[Col.MenuBarBg] = colF(0.14, 0.14, 0.14, 1);
  C[Col.ScrollbarBg] = colF(0.02, 0.02, 0.02, 0.53);
  C[Col.ScrollbarGrab] = colF(0.31, 0.31, 0.31, 1);
  C[Col.ScrollbarGrabHovered] = colF(0.41, 0.41, 0.41, 1);
  C[Col.ScrollbarGrabActive] = colF(0.51, 0.51, 0.51, 1);
  C[Col.CheckMark] = colF(0.26, 0.59, 0.98, 1);
  C[Col.CheckboxSelectedBg] = lerpCol(C[Col.FrameBg], C[Col.FrameBgHovered], 0.65);
  C[Col.SliderGrab] = colF(0.24, 0.52, 0.88, 1);
  C[Col.SliderGrabActive] = colF(0.26, 0.59, 0.98, 1);
  C[Col.Button] = colF(0.26, 0.59, 0.98, 0.40);
  C[Col.ButtonHovered] = colF(0.26, 0.59, 0.98, 1);
  C[Col.ButtonActive] = colF(0.06, 0.53, 0.98, 1);
  C[Col.Header] = colF(0.26, 0.59, 0.98, 0.31);
  C[Col.HeaderHovered] = colF(0.26, 0.59, 0.98, 0.80);
  C[Col.HeaderActive] = colF(0.26, 0.59, 0.98, 1);
  C[Col.Separator] = [...C[Col.Border]];
  C[Col.SeparatorHovered] = colF(0.10, 0.40, 0.75, 0.78);
  C[Col.SeparatorActive] = colF(0.10, 0.40, 0.75, 1);
  C[Col.ResizeGrip] = colF(0.26, 0.59, 0.98, 0.20);
  C[Col.ResizeGripHovered] = colF(0.26, 0.59, 0.98, 0.67);
  C[Col.ResizeGripActive] = colF(0.26, 0.59, 0.98, 0.95);
  C[Col.InputTextCursor] = [...C[Col.Text]];
  C[Col.TabHovered] = [...C[Col.HeaderHovered]];
  C[Col.Tab] = lerpCol(C[Col.Header], C[Col.TitleBgActive], 0.80);
  C[Col.TabSelected] = lerpCol(C[Col.HeaderActive], C[Col.TitleBgActive], 0.60);
  C[Col.TabSelectedOverline] = [...C[Col.HeaderActive]];
  C[Col.TabDimmed] = lerpCol(C[Col.Tab], C[Col.TitleBg], 0.80);
  C[Col.TabDimmedSelected] = lerpCol(C[Col.TabSelected], C[Col.TitleBg], 0.40);
  C[Col.TabDimmedSelectedOverline] = colF(0.50, 0.50, 0.50, 0);
  C[Col.PlotLines] = colF(0.61, 0.61, 0.61, 1);
  C[Col.PlotLinesHovered] = colF(1, 0.43, 0.35, 1);
  C[Col.PlotHistogram] = colF(0.90, 0.70, 0, 1);
  C[Col.PlotHistogramHovered] = colF(1, 0.60, 0, 1);
  C[Col.TableHeaderBg] = colF(0.19, 0.19, 0.20, 1);
  C[Col.TableBorderStrong] = colF(0.31, 0.31, 0.35, 1);
  C[Col.TableBorderLight] = colF(0.23, 0.23, 0.25, 1);
  C[Col.TableRowBg] = colF(0, 0, 0, 0);
  C[Col.TableRowBgAlt] = colF(1, 1, 1, 0.06);
  C[Col.TextLink] = [...C[Col.HeaderActive]];
  C[Col.TextSelectedBg] = colF(0.26, 0.59, 0.98, 0.35);
  C[Col.TreeLines] = [...C[Col.Border]];
  C[Col.DragDropTarget] = colF(1, 1, 0, 0.90);
  C[Col.DragDropTargetBg] = colF(0, 0, 0, 0);
  C[Col.UnsavedMarker] = colF(1, 1, 1, 1);
  C[Col.NavCursor] = colF(0.26, 0.59, 0.98, 1);
  C[Col.NavWindowingHighlight] = colF(1, 1, 1, 0.70);
  C[Col.NavWindowingDimBg] = colF(0.80, 0.80, 0.80, 0.20);
  C[Col.ModalWindowDimBg] = colF(0.80, 0.80, 0.80, 0.35);
}
function makeStyleDark() {
  const s = {
    Alpha: 1.0, DisabledAlpha: 0.6,
    FontSize: 13,
    WindowPadding: { x: 8, y: 8 }, WindowRounding: 0, WindowBorderSize: 1,
    WindowMinSize: { x: 32, y: 32 }, WindowTitleAlign: { x: 0.0, y: 0.5 },
    ChildRounding: 0, ChildBorderSize: 1, PopupRounding: 0, PopupBorderSize: 1,
    FramePadding: { x: 4, y: 3 }, FrameRounding: 0, FrameBorderSize: 0,
    ItemSpacing: { x: 8, y: 4 }, ItemInnerSpacing: { x: 4, y: 4 },
    CellPadding: { x: 4, y: 2 },
    IndentSpacing: 21, ScrollbarSize: 14, ScrollbarRounding: 9,
    GrabMinSize: 12, GrabRounding: 0, FrameBorderShadow: 0,
    TitleBarHeight: 13 + 3 * 2, // FontSize + FramePadding.y * 2 (imgui.cpp)
    Colors: [],
  };
  const C = s.Colors;
  applyStyleDark(C);
  for (let i = 0; i < Col.COUNT; i++) if (!C[i]) C[i] = colF(0, 0, 0, 1);
  return s;
}

// ---- IO (subset of ImGuiIO, imgui.h:2429; backend writes via Add* fns) ----
function makeIO() {
  return {
    DisplaySize: { x: 1280, y: 800 }, DisplayFramebufferScale: { x: 1, y: 1 },
    DeltaTime: 1 / 60, Time: 0,
    MousePos: { x: -9999, y: -9999 },
    MouseDown: [false, false, false, false, false],
    MouseClicked: [false, false, false, false, false],
    MouseReleased: [false, false, false, false, false],
    MouseWheel: 0,
    KeysDown: {}, InputChars: "",
    WantCaptureMouse: false, WantCaptureKeyboard: false, WantTextInput: false,
    _prevDown: [false, false, false, false, false],
    AddMousePosEvent(x, y) { this.MousePos.x = x; this.MousePos.y = y; },
    AddMouseButtonEvent(b, down) { this.MouseDown[b] = !!down; },
    AddMouseWheelEvent(d) { this.MouseWheel += d; },
    AddInputCharactersUTF8(s) { this.InputChars += s; },
  };
}

// ---- window ----
let __winSeq = 1;
class ImGuiWindow {
  constructor(name, flags) {
    this.name = name;
    this.id = hashStr(name);
    this.flags = flags;
    this.pos = { x: 60 + (__winSeq * 37) % 300, y: 60 + (__winSeq * 53) % 220 };
    this.size = { x: 340, y: 0 }; // y==0 => auto-fit height
    this.sizeFull = { x: 340, y: 260 };
    this.collapsed = false;
    this.open = null; // bound bool or null
    this.z = __winSeq++;
    // Draw-context layout state (imgui.cpp ImGuiWindowTempData / DC).
    // All coordinates are absolute screen space, relative to w.pos.
    this.dc = {
      cursorPos: { x: 0, y: 0 },         // current placement cursor
      cursorPosPrevLine: { x: 0, y: 0 }, // origin of the current line
      cursorStartPos: { x: 0, y: 0 },    // top-left of work area (pos+padding)
      cursorMaxPos: { x: 0, y: 0 },      // widest/tallest extents touched
      lastItemWidth: 0,
      lastItemHeight: 0,
      prevLineHeight: 0,
      currLineHeight: 0,
      isSameLine: false,
      sameLineSpacing: -1,
      _lineUsed: false,  // a widget was placed on the current line
      _lockFeed: false,  // next widget is explicitly positioned: skip feed
    };
    this.idStack = [this.id];
    this.drawList = [];
    this.contentHover = false;
    this.appearing = true;
    this.titleH = 24;
    this.padding = { x: 8, y: 8 };
  }
  getID(label) { return hashStr(label + "###" + label, this.idStack[this.idStack.length - 1]); }
}

// ---- context ----
class ImGuiContext {
  constructor() {
    this.io = makeIO();
    this.style = makeStyleDark();
    this.windows = new Map(); // name -> ImGuiWindow
    this.windowStack = [];
    this.current = null;
    this.nextData = null; // {pos,size,collapsed}
    this.hoveredId = 0; this.activeId = 0;
    this.activeRect = null; this.activeKind = null; this.activePayload = null;
    this.lastItem = { id: 0, rect: null };
    this.frame = 0;
    this.openPopups = new Map(); // id -> {x,y}
    this.comboOpen = 0;
    this.treeOpen = new Map();
    this.headerOpen = new Map();
    this.anyWindowHovered = false;
    this.focusOrder = [];
    this._debugRects = [];
    this._debugMode = false;
  }
  // -- frame --
  newFrame(dt) {
    const io = this.io;
    if (dt && dt > 0 && dt < 1) io.DeltaTime = dt;
    io.Time += io.DeltaTime;
    for (let b = 0; b < 5; b++) {
      io.MouseClicked[b] = io.MouseDown[b] && !io._prevDown[b];
      io.MouseReleased[b] = !io.MouseDown[b] && io._prevDown[b];
      io._prevDown[b] = io.MouseDown[b];
    }
    this.frame++;
    this.windowStack.length = 0;
    this.current = null;
    this.anyWindowHovered = false;
    this._debugRects.length = 0;
    this.hoveredId = this.activeId !== 0 ? this.hoveredId : 0;
    io.WantTextInput = (this.activeKind === "text");
  }
  endFrame() {
    const io = this.io;
    io.WantCaptureMouse = this.anyWindowHovered || this.activeId !== 0;
    io.WantCaptureKeyboard = (this.activeKind === "text");
    io.MouseWheel = 0;
    io.InputChars = "";
    for (let b = 0; b < 5; b++) { io.MouseClicked[b] = false; io.MouseReleased[b] = false; }
  }
  findOrCreate(name, flags) {
    let w = this.windows.get(name);
    if (!w) { w = new ImGuiWindow(name, flags); this.windows.set(name, w); this.applyNext(w, true); }
    return w;
  }
  applyNext(w, first) {
    const n = this.nextData;
    if (!n) return;
    const condOnce = (c) => c === Cond.Always || c === Cond.Once || (c === Cond.FirstUseEver && first) || (c === Cond.Appearing && w.appearing);
    if (n.pos && condOnce(n.posCond)) w.pos = { ...n.pos };
    if (n.size && condOnce(n.sizeCond)) { w.size = { ...n.size }; w.sizeFull = { ...n.size }; }
    if (n.collapsed !== undefined && condOnce(n.collapsedCond)) w.collapsed = n.collapsed;
  }
  setNextWindowPos(x, y, cond = Cond.Once) {
    this.nextData = this.nextData || {};
    this.nextData.pos = { x, y }; this.nextData.posCond = cond;
  }
  setNextWindowSize(w, h, cond = Cond.Once) {
    this.nextData = this.nextData || {};
    this.nextData.size = { x: w, y: h }; this.nextData.sizeCond = cond;
  }
  setNextWindowCollapsed(c, cond = Cond.Once) {
    this.nextData = this.nextData || {};
    this.nextData.collapsed = !!c; this.nextData.collapsedCond = cond;
  }
  // -- Begin/End (cf. imgui.cpp:7527-8387, simplified) --
  begin(name, pOpen = null, flags = 0) {
    const io = this.io, st = this.style;
    const w = this.findOrCreate(name, flags);
    if (pOpen !== null && pOpen !== undefined) w.open = !!pOpen;
    this.applyNext(w, false);
    this.nextData = null;
    w.flags = flags;
    w.z = __winSeq++;
    w.titleH = (flags & WindowFlags.NoTitleBar) ? 0 : st.TitleBarHeight;
    w.padding = { ...st.WindowPadding };
    w.drawList.length = 0;
    w.idStack.length = 1;
    this.windowStack.push(w);
    this.current = w;
    const m = io.MousePos;
    const inWin = m.x >= w.pos.x && m.x <= w.pos.x + w.sizeFull.x &&
                  m.y >= w.pos.y && m.y <= w.pos.y + w.sizeFull.y;
    if (inWin) this.anyWindowHovered = true;
    w.contentHover = inWin;
    // title-bar interactions: drag-move, double-click collapse, close btn
    const barH = w.titleH;
    const inTitle = barH > 0 && m.x >= w.pos.x && m.x <= w.pos.x + w.sizeFull.x &&
                    m.y >= w.pos.y && m.y <= w.pos.y + barH;
    const moveId = (w.id ^ 0x9e3779b9) >>> 0;
    const closeId = (w.id ^ 0xc0ffee) >>> 0;
    const collapseId = (w.id ^ 0xc011a9) >>> 0;
    if (!(flags & WindowFlags.NoMouseInputs)) {
      // close button zone (right side of title)
      if (w.open !== null && w.open !== undefined && inTitle) {
        const cs = 16, cx = w.pos.x + w.sizeFull.x - 8 - cs, cy = w.pos.y + (barH - cs) / 2;
        if (m.x >= cx && m.x <= cx + cs && m.y >= cy && m.y <= cy + cs) {
          this.hoveredId = closeId;
          if (io.MouseClicked[0]) { w.open = false; io.MouseDown[0] = false; io._prevDown[0] = false; }
        }
      }
      // collapse on double-click title (approx: two clicks within 400ms)
      if (inTitle && !(flags & WindowFlags.NoCollapse)) {
        if (io.MouseClicked[0]) {
          const now = performance.now();
          if (now - (w._lastTitleClick || 0) < 400) w.collapsed = !w.collapsed;
          w._lastTitleClick = now;
        }
      }
      // move drag (suppressed while a popup owns the click)
      if (inTitle && !(flags & WindowFlags.NoMove) && io.MouseClicked[0] && this.activeId === 0 && !this._suppressChrome) {
        // ignore clicks on close box
        const cs = 16, cx = w.pos.x + w.sizeFull.x - 8 - cs;
        if (w.open === null || w.open === undefined || m.x < cx) {
          this.activeId = moveId; this.activeKind = "move";
          this.activePayload = { win: w, dx: m.x - w.pos.x, dy: m.y - w.pos.y };
        }
      }
      // resize drag (bottom-right grip 18px; suppressed while popup owns click)
      if (!(flags & WindowFlags.NoResize) && !w.collapsed && this.activeId === 0 && !this._suppressChrome) {
        const gx = w.pos.x + w.sizeFull.x - 18, gy = w.pos.y + w.sizeFull.y - 18;
        if (m.x >= gx && m.x <= w.pos.x + w.sizeFull.x && m.y >= gy && m.y <= w.pos.y + w.sizeFull.y) {
          this.hoveredId = (w.id ^ 0xbe51ed) >>> 0;
          if (io.MouseClicked[0]) {
            this.activeId = (w.id ^ 0xbe51ed) >>> 0; this.activeKind = "resize";
            this.activePayload = { win: w };
          }
        }
      }
    }
    // continue active drags
    if (this.activeKind === "move" && this.activePayload && this.activePayload.win === w) {
      if (io.MouseDown[0]) { w.pos.x = m.x - this.activePayload.dx; w.pos.y = m.y - this.activePayload.dy; }
      else { this.activeId = 0; this.activeKind = null; this.activePayload = null; }
    }
    if (this.activeKind === "resize" && this.activePayload && this.activePayload.win === w) {
      if (io.MouseDown[0]) {
        w.sizeFull.x = Math.max(st.WindowMinSize.x, m.x - w.pos.x);
        w.sizeFull.y = Math.max(80, m.y - w.pos.y);
        if (w.size.x > 0) w.size.x = w.sizeFull.x;
        if (w.size.y > 0) w.size.y = w.sizeFull.y;
      } else { this.activeId = 0; this.activeKind = null; this.activePayload = null; }
    }
    // setup cursor (work area origin = pos + title + padding)
    w.dc.cursorPos = { x: w.pos.x + w.padding.x, y: w.pos.y + barH + w.padding.y };
    w.dc.cursorStartPos = { ...w.dc.cursorPos };
    w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.cursorMaxPos = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc.prevLineHeight = 0;
    w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
    w.dc.isSameLine = false; w.dc.sameLineSpacing = -1;
    w.dc._lineUsed = false; w.dc._lockFeed = false;
    w.appearing = false;
    const skip = w.collapsed || w.open === false;
    return { visible: !skip, open: w.open === undefined ? null : w.open, window: w };
  }
  end() {
    const w = this.windowStack.pop();
    if (!w) return;
    const st = this.style;
    // auto-fit height if size.y==0 or AlwaysAutoResize
    const needH = (w.dc.cursorMaxPos.y - (w.pos.y + w.titleH + w.padding.y)) + w.padding.y;
    if (w.collapsed) {
      w.sizeFull.y = w.titleH + 2;
    } else if (w.size.y === 0 || (w.flags & WindowFlags.AlwaysAutoResize)) {
      w.sizeFull.y = Math.max(60, w.pos.y + w.titleH + w.padding.y + needH - w.pos.y);
    } else if (w.size.y > 0) {
      w.sizeFull.y = w.size.y;
    }
    if (w.size.x > 0) w.sizeFull.x = Math.max(st.WindowMinSize.x, w.size.x);
    // clamp on screen
    w.pos.x = Math.max(-w.sizeFull.x + 60, Math.min(this.io.DisplaySize.x - 60, w.pos.x));
    w.pos.y = Math.max(0, Math.min(this.io.DisplaySize.y - 30, w.pos.y));
    this.current = this.windowStack[this.windowStack.length - 1] || null;
  }
  // -- layout engine (imgui.cpp: ItemSize 11400, SameLine 11520) --
  // Widgets call beforeItemPlacement(wd, ht) FIRST (auto line-feed unless
  // SameLine/locked), draw at dc.cursorPos, then itemSize(wd, ht). Widgets
  // MUST NOT call nextLine() themselves; the feed happens implicitly.
  beforeItemPlacement(wd, ht) {
    const w = this.current; if (!w) return;
    const st = this.style, dc = w.dc;
    if (dc._lockFeed) {
      dc._lockFeed = false; // explicitly positioned: place exactly at cursor
    } else if (dc.isSameLine) {
      const sp = (dc.sameLineSpacing >= 0) ? dc.sameLineSpacing : st.ItemSpacing.x;
      dc.cursorPos.x += sp;
      dc.cursorPos.y = dc.cursorPosPrevLine.y;
    } else if (dc._lineUsed) {
      // Multi-widget table cells wrap to the CELL origin, never the window.
      // (Single-widget cells skip this via _lockFeed set by SetColumnIndex.)
      dc.cursorPos.x = (dc._cellStartX !== undefined) ? dc._cellStartX : dc.cursorStartPos.x + (w._indent || 0);
      dc.cursorPos.y += dc.currLineHeight + st.ItemSpacing.y;
      dc.cursorPosPrevLine = { ...dc.cursorPos };
      dc.prevLineHeight = dc.currLineHeight;
      dc.currLineHeight = 0;
    }
    dc.isSameLine = false; dc.sameLineSpacing = -1;
    dc._lineUsed = true;
  }
  itemSize(wd, ht, text_baseline_y = 0) {
    const w = this.current; if (!w) return;
    const dc = w.dc;
    dc.currLineHeight = Math.max(dc.currLineHeight, ht);
    dc.lastItemWidth = wd; dc.lastItemHeight = ht;
    dc.cursorPos.x += wd;
    dc.cursorMaxPos.x = Math.max(dc.cursorMaxPos.x, dc.cursorPos.x);
    dc.cursorMaxPos.y = Math.max(dc.cursorMaxPos.y, dc.cursorPos.y + ht);
    void text_baseline_y;
  }
  nextLine(ht) {
    // Explicit break (NewLine/Dummy/Spacing internals only).
    const w = this.current; if (!w) return;
    const st = this.style, dc = w.dc;
    dc.cursorPos.x = dc.cursorStartPos.x + (w._indent || 0);
    dc.cursorPos.y = Math.max(dc.cursorPos.y, dc.cursorPosPrevLine.y + Math.max(ht, dc.currLineHeight) + st.ItemSpacing.y);
    dc.cursorPosPrevLine = { ...dc.cursorPos };
    dc.prevLineHeight = dc.currLineHeight; dc.currLineHeight = 0;
    dc._lineUsed = false; dc.lastItemWidth = 0;
  }
  newLineBreak() {
    const w = this.current; if (!w) return;
    const st = this.style, dc = w.dc;
    dc.cursorPos.x = dc.cursorStartPos.x + (w._indent || 0);
    dc.cursorPos.y += dc.currLineHeight + st.ItemSpacing.y;
    dc.cursorPosPrevLine = { ...dc.cursorPos };
    dc.prevLineHeight = dc.currLineHeight; dc.currLineHeight = 0;
    dc._lineUsed = false; dc.lastItemWidth = 0;
  }
  sameLine(offset_from_start_x = 0, spacing = -1) {
    const w = this.current; if (!w) return;
    const dc = w.dc;
    dc.isSameLine = true;
    dc.sameLineSpacing = spacing;
    if (offset_from_start_x !== 0) {
      dc.cursorPos.x = dc.cursorPosPrevLine.x + offset_from_start_x;
    }
    dc.cursorPos.y = dc.cursorPosPrevLine.y;
  }
  itemAdd(x, y, wd, ht, id = 0) {
    const io = this.io;
    const visible = true;
    if (id) {
      this.lastItem = { id, rect: { x, y, w: wd, h: ht } };
      // Debug overlay: keep per-frame list of item rects (cleared in newFrame).
      if (this._debugRects) this._debugRects.push({ x, y, w: wd, h: ht });
    }
    return visible;
  }
  hovered(x, y, wd, ht) {
    const m = this.io.MousePos;
    return m.x >= x && m.x <= x + wd && m.y >= y && m.y <= y + ht;
  }
  buttonBehavior(id, x, y, wd, ht) {
    const io = this.io;
    const h = this.hovered(x, y, wd, ht);
    if (h) { this.hoveredId = id; this.anyWindowHovered = true; }
    let pressed = false;
    const active = this.activeId === id;
    if (h && io.MouseClicked[0] && this.activeId === 0) {
      this.activeId = id; this.activeKind = "button"; this.activePayload = { id };
    }
    if (this.activeId === id && this.activeKind === "button") {
      if (io.MouseReleased[0]) {
        if (h) pressed = true;
        this.activeId = 0; this.activeKind = null; this.activePayload = null;
      }
    }
    return { hovered: h, held: active, pressed };
  }
  isItemHovered() {
    const r = this.lastItem.rect; if (!r) return false;
    return this.hovered(r.x, r.y, r.w, r.h);
  }
}

let _ctx = null;
function CreateContext() { _ctx = new ImGuiContext(); return _ctx; }
function GetContext() { if (!_ctx) _ctx = new ImGuiContext(); return _ctx; }
function GetIO() { return GetContext().io; }
function GetStyle() { return GetContext().style; }
function SetDebugMode(on) { GetContext()._debugMode = !!on; }
function IsDebugMode() { return !!GetContext()._debugMode; }

const ImGuiBase = {
  VERSION: IMGUI_VERSION, WindowFlags, Cond, Col,
  hashStr, findRenderedTextEnd, colToCss, lerpCol, applyStyleDark,
  CreateContext, GetContext, GetIO, GetStyle, SetDebugMode, IsDebugMode,
  ImGuiWindow, ImGuiContext,
};

global.ImGui = global.ImGui || {};
Object.assign(global.ImGui, ImGuiBase);
global.__IMGUI_CORE__ = true;

})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__DRAW__*/
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
      const active = (c.windowStack[c.windowStack.length - 1] === w) || w.contentHover;
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
    ctx.restore();
  }
  drawOp(ctx, st, op) {
    switch (op.t) {
      case "polyline": {
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineJoin = "round"; ctx.lineCap = "round";
        ctx.beginPath();
        (op.pts || []).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        if (op.closed) ctx.closePath();
        ctx.stroke();
        break;
      }
      case "polygon": {
        ctx.fillStyle = op.css || css(op.col);
        ctx.beginPath();
        (op.pts || []).forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath(); ctx.fill();
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
      case "rectFilled":
        ctx.fillStyle = op.css || css(op.col);
        roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r || 0); ctx.fill();
        break;
      case "rect":
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        roundRectPath(ctx, op.x, op.y, op.w, op.h, op.r || 0); ctx.stroke();
        break;
      case "line":
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.beginPath(); ctx.moveTo(op.x1, op.y1); ctx.lineTo(op.x2, op.y2); ctx.stroke();
        break;
      case "circleFilled":
        ctx.fillStyle = op.css || css(op.col);
        ctx.beginPath(); ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2); ctx.fill();
        break;
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

})();
;(function(){/*__WIDGETS__*/
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
  emit({ t: "rectFilled", x, y, w: wd, h: ht, r: st.FrameRounding, col: frameCol(ImGui.Col.Button, ImGui.Col.ButtonHovered, ImGui.Col.ButtonActive, bb.hovered, bb.held) });
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

})();
;(function(){/*__WIDGETS2__*/
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
function dis() { const c = ctx(); return (c._disabledDepth || 0) > 0; }
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
  if (c.activeId === id && c.activeKind === "vslider") {
    const t = 1 - (c.io.MousePos.y - y) / Math.max(1, ht);
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
function InputFloatN(label, values) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = InputFloat(`${label}##${i}`, values[i]);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function InputIntN(label, values) {
  const out = values.slice(); let changed = false;
  for (let i = 0; i < values.length; i++) {
    const r = InputInt(`${label}##${i}`, values[i]);
    out[i] = r.value; changed = changed || r.changed;
  }
  return { changed, values: out };
}
function InputTextWithHint(label, hint, text) {
  const shown = text === "" ? hint : text; // hint rendered by prefixing when empty
  const r = ImGui.InputText(label, text);
  if (text === "" ) {
    // overlay hint text (drawn after, slightly transparent)
    const w = cur();
    if (w && w.drawList.length) {
      const last = w.drawList[w.drawList.length - 1];
      emit({ t: "text", str: hint + " (hint)", x: last.x, y: last.y, col: [0.55, 0.55, 0.55, 0.8] });
    }
  }
  return r;
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
  const availW = Math.max(60, w.sizeFull.x - w.padding.x * 2 - (w._indent || 0));
  const S = Math.min(150, Math.max(80, availW - 18 - 60));
  const HB = 18;
  const needW = S + HB + 14, ht = S + 26;
  c.beforeItemPlacement(needW, ht);
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
  const setSV = (mx, my) => {
    s = Math.max(0, Math.min(1, (mx - x) / S)); v = Math.max(0, Math.min(1, 1 - (my - y) / S)); changed = true;
  };
  const setH = (my) => { h = Math.max(0, Math.min(0.999, (my - y) / S)); changed = true; };
  const inSV = c.hovered(x, y, S, S), inH = c.hovered(x + S + 6, y, HB, S);
  if ((inSV || inH) && c.io.MouseClicked[0] && c.activeId === 0 && !clickSuppressed()) {
    c.activeId = id; c.activeKind = "picker"; c.activePayload = { zone: inH ? "h" : "sv" };
    if (inH) setH(c.io.MousePos.y); else setSV(c.io.MousePos.x, c.io.MousePos.y);
  }
  if (c.activeId === id && c.activeKind === "picker") {
    if (c.activePayload.zone === "h") setH(c.io.MousePos.y); else setSV(c.io.MousePos.x, c.io.MousePos.y);
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
  const bw = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  c.beforeItemPlacement(bw, ht + 18);
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
  const bw = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  c.beforeItemPlacement(bw, 20);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y + 2;
  const tw = measure(label);
  emit({ t: "text", str: label, x: x + 4, y, col: st.Colors[ImGui.Col.Text] });
  emit({ t: "line", x1: x + tw + 12, y1: y + 8, x2: x + bw, y2: y + 8, col: st.Colors[ImGui.Col.Separator], th: 1 });
  c.itemSize(bw, 20);
}
function Bullet() {
  const c = ctx(), w = cur(); if (!w) return;
  c.beforeItemPlacement(12, 16);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  emit({ t: "circleFilled", x: x + 4, y: y + 8, r: 2.5, col: c.style.Colors[ImGui.Col.Text] });
  c.itemSize(12, 16);
}
function BeginListBox(label, wArg = 0, hArg = 0) {
  return ImGui.BeginChild(label + "##listbox", wArg, hArg || 110, true);
}
function EndListBox() { ImGui.EndChild(); }

Object.assign(ImGui, {
  ArrowButton, CheckboxFlags, RadioButtonInt,
  SliderFloat2, SliderFloat3, SliderFloat4, SliderIntN, SliderAngle, VSliderFloat, VSliderInt,
  DragInt, DragFloatN, DragIntN,
  InputFloat, InputInt, InputDouble, InputFloatN, InputIntN, InputTextWithHint,
  ColorButton, ColorPicker3, ColorPicker4,
  Image, ImageButton, PlotLines, PlotHistogram,
  LabelText, Value, TextDisabled, SeparatorText, Bullet,
  BeginListBox, EndListBox,
});
global.__IMGUI_WIDGETS2__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__EXTENDED__*/
/* ImGui Browser Port — Extended (ported from imgui.cpp menus/popups/tabs/tables + misc API)
 * Adds what widgets.js missed: ID stack, groups, disabled blocks, style stacks,
 * cursor/layout queries, item-state queries, mouse/key queries, tooltips, popups +
 * modals, menu bar + menus, tab bar, tables (lite), legacy columns, TreeNodeEx,
 * drag & drop (lite), .ini persistence via localStorage, style themes.
 * Requires: core + widgets (+widgets2 for demo sections, not strictly).
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");
const C = () => ImGui.GetContext();
const W = () => C().current;
const measure = (s) => (ImGui._measure ? ImGui._measure(s) : String(s).length * 7);
function emit(op) { const w = W(); if (w) w.drawList.push(op); }
function menuClickSuppressed() {
  const cc = C();
  return !!cc._suppressChrome && !(cc._popupBoxStack && cc._popupBoxStack.length);
}
function ensure() {
  const c = C();
  if (!c._extInit) {
  c._extInit = true;
  c._idExtra = 0;
  c._groupStack = [];
  c._disabledDepth = 0;
  c._styleColorStack = [];
  c._styleVarStack = [];
  c._itemWidthStack = [];
  c._tooltip = null;
  c._popupStack = [];          // open popup ids (top = last)
  c._popupPending = null;      // id requested this frame via OpenPopup
  c._popupAnchor = {};         // id -> {x,y}
  c._popupBoxStack = [];       // open popup layout boxes (stack: nesting-safe)
  c._popupRects = {};          // key -> last-frame rect (for click preemption)
  c._popupRectsPrev = {};
  c._popupRolloverFrame = -1;
  c._menuOpen = {};            // menu label -> bool
  c._menuStack = [];           // open menu labels (for cursor restore)
  c._overlayOps = [];          // popup overlay ops (drawn last, unclipped)
  c._menuBarActive = false;
  c._tabs = {};                // barId -> activeTabId
  c._table = null;             // active table ctx
  c._columns = null;           // legacy columns ctx
  c._treeNextOpen = undefined; // SetNextItemOpen payload
  c._dd = null;                // drag-drop payload {type,data,active}
  c._lastEdited = { id: 0, frame: -1 };
  c._wantTextFocus = false;
  c._iniLoaded = false;
  c._iniSaveT = 0;
  }
  // Per-frame rollover: last frame's popup rects become the preemption map.
  // Runs on every ensure() (c.frame bumps in newFrame before any widget).
  if (c._popupRolloverFrame !== c.frame) {
    c._popupRolloverFrame = c.frame;
    c._popupRectsPrev = c._popupRects || {};
    c._popupRects = {};
  }
  return c;
}
// A left click is consumed by the popup layer while any popup is open: the
// popup rects are known from the previous frame, so underlying widgets must
// not activate (either the popup handles the click, or the click dismisses).
function clickInsideOpenPopup() {
  const c = ensure();
  if (!c.io.MouseClicked[0]) return false;
  const m = c.io.MousePos;
  for (const k of c._popupStack) {
    const r = (c._popupRectsPrev || {})[k] || (c._popupRects || {})[k];
    if (r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) return true;
  }
  return false;
}
function popupConsumesClick() {
  const c = ensure();
  return c._popupStack.length > 0 && c.io.MouseClicked[0];
}
function inPopupContent() {
  const c = ensure();
  return (c._popupBoxStack && c._popupBoxStack.length > 0);
}

// ---------- lazily wrap Begin/End once (scroll + ini) ----------
let _wrapped = false;
function wrapBeginEnd() {
  if (_wrapped) return; _wrapped = true;
  const Proto = ImGui.ImGuiContext.prototype;
  const origBegin = Proto.begin, origEnd = Proto.end;
  Proto.begin = function (name, pOpen, flags) {
    const c = this;
    ensure();
    if (!c._iniLoaded) { c._iniLoaded = true; tryLoadIni(c); }
    // Consume left clicks for the popup layer BEFORE any widget or chrome
    // hit-testing runs (uses previous frame's popup rects).
    c._suppressChrome = popupConsumesClick();
    const r = origBegin.call(this, name, pOpen, flags);
    const w = this.current;
    if (w) {
      if (w.scrollY === undefined) w.scrollY = 0;
      if (w.scrollMax === undefined) w.scrollMax = 0;
      const noScroll = (w.flags & ImGui.WindowFlags.NoScrollbar) || (w.flags & ImGui.WindowFlags.NoScrollWithMouse);
      // wheel scroll when hovered (content taller than view); clipped via draw.js clip rect
      if (!noScroll && w.scrollMax > 0 && w.contentHover && !w.collapsed && this.io.MouseWheel !== 0 && this.activeId === 0) {
        w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY - this.io.MouseWheel * (this.style.FontSize * 2)));
      }
      // scrollbar grip drag
      if (!noScroll && w.scrollMax > 0 && !w.collapsed && w._scrollGrip) {
        const g = w._scrollGrip;
        if (this.activeId === g.id && this.activeKind === "scroll") {
          const m = this.io.MousePos;
          const t = (m.y - g.by - g.gripH / 2) / Math.max(1, g.bh - g.gripH);
          w.scrollY = Math.max(0, Math.min(w.scrollMax, t * w.scrollMax));
          if (!this.io.MouseDown[0]) { this.activeId = 0; this.activeKind = null; }
        }
      }
      // Apply scroll offset as coordinate transform for all later ops in this window.
      w.dc.cursorPos.y -= w.scrollY;
    }
    return r;
  };
  Proto.end = function () {
    const w = this.current;
    // compute scrollable overflow BEFORE origEnd auto-fit (only when fixed height)
    if (w && w.size && w.size.y > 0 && !w.collapsed) {
      const contentTop = w.pos.y + w.titleH + w.padding.y - (w.scrollY || 0);
      const contentH = (w.dc.cursorMaxPos.y - contentTop) + w.padding.y;
      const visibleH = w.sizeFull.y - w.titleH - w.padding.y * 2;
      w.scrollMax = Math.max(0, contentH - visibleH);
      w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
    } else if (w && w.collapsed) { w.scrollMax = 0; w.scrollY = 0; }
    // NOTE: auto-fit windows (size.y == 0) skip the zeroing above on purpose:
    // their scroll state survives into the viewport-clamp block below, which
    // fully recomputes it (zeroing would rubber-band wheel scrolling to 0).
    origEnd.call(this);
    // Tab row growth (stored by EndTabBar): applied after core End so the
    // size.x reset cannot clobber it. Consumed every frame. Never grows the
    // window past the viewport edge.
    if (w && w._tabExpandW) {
      const maxW = Math.max(80, this.io.DisplaySize.x - w.pos.x - 8);
      if (w._tabExpandW > w.sizeFull.x) w.sizeFull.x = Math.min(w._tabExpandW, maxW);
      w._tabExpandW = 0;
    }
    // Auto-fit windows (size.y == 0) grow unbounded by default. Clamp to the
    // viewport so content can never flow off-screen: the excess becomes
    // scrollable instead of overflowing past the taskbar.
    if (w && !w.collapsed && (w.size.y === 0 || (w.flags & ImGui.WindowFlags.AlwaysAutoResize))) {
      const margin = 20; // keep 20px above the browser edge/taskbar
      const maxH = Math.max(80, this.io.DisplaySize.y - w.pos.y - margin);
      if (w.sizeFull.y > maxH) {
        const contentTop = w.pos.y + w.titleH + w.padding.y - (w.scrollY || 0);
        const contentH = (w.dc.cursorMaxPos.y - contentTop) + w.padding.y;
        w.sizeFull.y = maxH;
        w.scrollMax = Math.max(0, contentH - (maxH - w.titleH - w.padding.y * 2));
        w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
      } else {
        w.scrollMax = 0; w.scrollY = 0;
      }
    }
    // draw scrollbar when needed (clipped content stays inside window via draw.js)
    if (w && w.scrollMax > 0 && !w.collapsed && !(w.flags & ImGui.WindowFlags.NoScrollbar)) {
      const st = this.style;
      const bx = w.pos.x + w.sizeFull.x - st.ScrollbarSize - 1;
      const by = w.pos.y + w.titleH, bh = w.sizeFull.y - w.titleH - 1;
      w.drawList.push({ t: "rectFilled", x: bx, y: by, w: st.ScrollbarSize, h: bh, r: 7, col: st.Colors[ImGui.Col.ScrollbarBg] });
      const gripH = Math.max(st.GrabMinSize, bh * (bh / (bh + w.scrollMax)));
      const gy = by + (bh - gripH) * (w.scrollMax > 0 ? w.scrollY / w.scrollMax : 0);
      const gid = (w.id ^ 0x5c4011) >>> 0;
      const hov = this.hovered(bx, gy, st.ScrollbarSize, gripH);
      if (hov) this.anyWindowHovered = true;
      if (hov && this.io.MouseClicked[0] && this.activeId === 0) {
        this.activeId = gid; this.activeKind = "scroll";
      }
      w._scrollGrip = { id: gid, by: by, bh: bh, gripH: gripH };
      const active = this.activeId === gid;
      w.drawList.push({ t: "rectFilled", x: bx, y: gy, w: st.ScrollbarSize, h: gripH, r: 7, col: st.Colors[active || hov ? ImGui.Col.ScrollbarGrabHovered : ImGui.Col.ScrollbarGrab] });
    } else if (w) { w._scrollGrip = null; }
    throttleSaveIni(this);
  };
  // disabled: swallow button-family clicks; popups: swallow click-through
  const origBB = Proto.buttonBehavior;
  Proto.buttonBehavior = function (id, x, y, wd, ht) {
    if ((this._disabledDepth || 0) > 0) {
      const h = this.hovered(x, y, wd, ht);
      return { hovered: false, held: false, pressed: false };
    }
    const r = origBB.call(this, id, x, y, wd, ht);
    // Underlying UI must not activate while a popup owns the click; popup
    // content itself evaluates with a non-empty box stack and stays live.
    if (r.pressed && (this._popupBoxStack || []).length === 0 && this._suppressChrome) {
      r.pressed = false;
    }
    return r;
  };
}
wrapBeginEnd();

// ---------- .ini persistence (localStorage) ----------
const INI_KEY = "[ImGui]winpos";
function tryLoadIni(c) {
  try {
    const raw = localStorage.getItem(INI_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    for (const [name, s] of Object.entries(j)) {
      const w = c.windows.get(name);
      if (w && s && typeof s.x === "number") {
        if (!(w.flags & ImGui.WindowFlags.NoSavedSettings)) {
          w.pos = { x: s.x, y: s.y };
          if (s.w) { w.size = { x: s.w, y: s.h || 0 }; w.sizeFull = { x: s.w, y: s.h || w.sizeFull.y }; }
          if (typeof s.collapsed === "boolean") w.collapsed = s.collapsed;
        }
      }
    }
    // also stash for windows created later
    c._iniStash = j;
  } catch { /* private mode */ }
}
// stash applied on creation
setIntervalSafeHook();
function setIntervalSafeHook() {
  const Proto = ImGui.ImGuiContext.prototype;
  const origFind = Proto.findOrCreate;
  Proto.findOrCreate = function (name, flags) {
    const had = this.windows.has(name);
    const w = origFind.call(this, name, flags);
    if (!had && this._iniStash && this._iniStash[name] && !(flags & ImGui.WindowFlags.NoSavedSettings)) {
      const s = this._iniStash[name];
      w.pos = { x: s.x, y: s.y };
      if (s.w) { w.size = { x: s.w, y: s.h || 0 }; w.sizeFull = { x: s.w, y: s.h || w.sizeFull.y }; }
    }
    return w;
  };
}
function throttleSaveIni(c) {
  const now = Date.now();
  if (now - (c._iniSaveT || 0) < 1500) return;
  c._iniSaveT = now;
  try {
    const j = {};
    for (const [name, w] of c.windows) {
      if (w.flags & ImGui.WindowFlags.NoSavedSettings) continue;
      j[name] = { x: Math.round(w.pos.x), y: Math.round(w.pos.y), w: Math.round(w.sizeFull.x), h: w.size.y > 0 ? Math.round(w.sizeFull.y) : 0, collapsed: !!w.collapsed };
    }
    localStorage.setItem(INI_KEY, JSON.stringify(j));
  } catch { /* ignore */ }
}
function SaveIniSettingsToMemory() {
  const c = ensure(); const j = {};
  for (const [name, w] of c.windows) j[name] = { x: w.pos.x, y: w.pos.y, w: w.sizeFull.x, h: w.sizeFull.y };
  return JSON.stringify(j);
}
function LoadIniSettingsFromMemory(s) {
  const c = ensure();
  try {
    const j = JSON.parse(s);
    for (const [name, v] of Object.entries(j)) {
      let w = c.windows.get(name);
      if (!w) { w = c.findOrCreate(name, 0); }
      w.pos = { x: v.x, y: v.y }; w.sizeFull = { x: v.w, y: v.h };
    }
  } catch (e) { console.warn("[ImGui] bad ini", e); }
}

// ---------- ID stack ----------
function PushID(id) {
  const c = ensure(), w = W(); if (!w) return;
  const top = w.idStack[w.idStack.length - 1];
  w.idStack.push(ImGui.hashStr("###push:" + String(id), top));
}
function PopID() { const w = W(); if (w && w.idStack.length > 1) w.idStack.pop(); }
function GetID(str) { const w = W(); return w ? w.getID(str) : 0; }

// ---------- groups / disabled / item width ----------
function BeginGroup() {
  const c = ensure(), w = W(); if (!w) return;
  c._groupStack.push({ cursor: { ...w.dc.cursorPos }, max: { ...w.dc.cursorMaxPos } });
}
function EndGroup() {
  const c = ensure(), w = W(); if (!w) return;
  const g = c._groupStack.pop(); if (!g) return;
  const wd = Math.max(0, w.dc.cursorMaxPos.x - g.cursor.x), ht = Math.max(0, w.dc.cursorMaxPos.y - g.cursor.y);
  w.dc.cursorPos.x = g.cursor.x; w.dc.cursorPos.y = g.cursor.y; w.dc.cursorPosPrevLine = { ...g.cursor };
  w.dc._lockFeed = true;
  c.beforeItemPlacement(wd, ht);
  c.itemSize(wd, ht);
}
function BeginDisabled(disabled = true) { const c = ensure(); if (disabled) c._disabledDepth++; c._disabledStack = c._disabledStack || []; c._disabledStack.push(!!disabled); }
function EndDisabled() { const c = ensure(); const d = (c._disabledStack || []).pop(); if (d) c._disabledDepth = Math.max(0, c._disabledDepth - 1); }
function PushItemWidth(wd) { ensure()._itemWidthStack.push(wd); }
function PopItemWidth() { ensure()._itemWidthStack.pop(); }

// ---------- style stacks + themes ----------
function PushStyleColor(col, val) { const c = ensure(); c._styleColorStack.push([col, c.style.Colors[col]]); c.style.Colors[col] = val; }
function PopStyleColor(n = 1) { const c = ensure(); for (let i = 0; i < n; i++) { const e = c._styleColorStack.pop(); if (e) c.style.Colors[e[0]] = e[1]; } }
function PushStyleVar(key, val) { const c = ensure(); c._styleVarStack.push([key, c.style[key]]); c.style[key] = val; }
function PopStyleVar(n = 1) { const c = ensure(); for (let i = 0; i < n; i++) { const e = c._styleVarStack.pop(); if (e) c.style[e[0]] = e[1]; } }
function GetStyleColorVec4(col) { return ensure().style.Colors[col]; }
function GetColorU32(col, alphaMul = 1) {
  const c = ensure().style.Colors[col] || [1, 1, 1, 1];
  const r = Math.round(c[0] * 255), g = Math.round(c[1] * 255), b = Math.round(c[2] * 255), a = Math.round(c[3] * alphaMul * 255);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function StyleColorsDark() {
  const c = ensure();
  ImGui.applyStyleDark(c.style.Colors);
}
function StyleColorsClassic() {
  const c = ensure(), C = c.style.Colors, F = (r, g, b, a) => [r, g, b, a];
  const L = ImGui.lerpCol;
  C[ImGui.Col.Text] = F(0.90, 0.90, 0.90, 1); C[ImGui.Col.TextDisabled] = F(0.60, 0.60, 0.60, 1);
  C[ImGui.Col.WindowBg] = F(0, 0, 0, 0.85); C[ImGui.Col.ChildBg] = F(0, 0, 0, 0);
  C[ImGui.Col.PopupBg] = F(0.11, 0.11, 0.14, 0.92);
  C[ImGui.Col.Border] = F(0.50, 0.50, 0.50, 0.50); C[ImGui.Col.BorderShadow] = F(0, 0, 0, 0);
  C[ImGui.Col.FrameBg] = F(0.43, 0.43, 0.43, 0.39); C[ImGui.Col.FrameBgHovered] = F(0.47, 0.47, 0.69, 0.40);
  C[ImGui.Col.FrameBgActive] = F(0.42, 0.41, 0.64, 0.69);
  C[ImGui.Col.TitleBg] = F(0.27, 0.27, 0.54, 0.83); C[ImGui.Col.TitleBgActive] = F(0.32, 0.32, 0.63, 0.87);
  C[ImGui.Col.TitleBgCollapsed] = F(0.40, 0.40, 0.80, 0.20);
  C[ImGui.Col.MenuBarBg] = F(0.40, 0.40, 0.55, 0.80);
  C[ImGui.Col.ScrollbarBg] = F(0.20, 0.25, 0.30, 0.60); C[ImGui.Col.ScrollbarGrab] = F(0.40, 0.40, 0.80, 0.30);
  C[ImGui.Col.ScrollbarGrabHovered] = F(0.40, 0.40, 0.80, 0.40); C[ImGui.Col.ScrollbarGrabActive] = F(0.41, 0.39, 0.80, 0.60);
  C[ImGui.Col.CheckMark] = F(0.90, 0.90, 0.90, 0.50);
  C[ImGui.Col.CheckboxSelectedBg] = L(C[ImGui.Col.FrameBg], C[ImGui.Col.FrameBgActive], 0.65);
  C[ImGui.Col.SliderGrab] = F(1, 1, 1, 0.30); C[ImGui.Col.SliderGrabActive] = F(0.41, 0.39, 0.80, 0.60);
  C[ImGui.Col.Button] = F(0.35, 0.40, 0.61, 0.62); C[ImGui.Col.ButtonHovered] = F(0.40, 0.48, 0.71, 0.79);
  C[ImGui.Col.ButtonActive] = F(0.46, 0.54, 0.80, 1);
  C[ImGui.Col.Header] = F(0.40, 0.40, 0.90, 0.45); C[ImGui.Col.HeaderHovered] = F(0.45, 0.45, 0.90, 0.80);
  C[ImGui.Col.HeaderActive] = F(0.53, 0.53, 0.87, 0.80);
  C[ImGui.Col.Separator] = F(0.50, 0.50, 0.50, 0.60); C[ImGui.Col.SeparatorHovered] = F(0.60, 0.60, 0.70, 1);
  C[ImGui.Col.SeparatorActive] = F(0.70, 0.70, 0.90, 1);
  C[ImGui.Col.ResizeGrip] = F(1, 1, 1, 0.10); C[ImGui.Col.ResizeGripHovered] = F(0.78, 0.82, 1, 0.60);
  C[ImGui.Col.ResizeGripActive] = F(0.78, 0.82, 1, 0.90);
  C[ImGui.Col.InputTextCursor] = [...C[ImGui.Col.Text]]; C[ImGui.Col.TabHovered] = [...C[ImGui.Col.HeaderHovered]];
  C[ImGui.Col.Tab] = L(C[ImGui.Col.Header], C[ImGui.Col.TitleBgActive], 0.80);
  C[ImGui.Col.TabSelected] = L(C[ImGui.Col.HeaderActive], C[ImGui.Col.TitleBgActive], 0.60);
  C[ImGui.Col.TabSelectedOverline] = [...C[ImGui.Col.HeaderActive]];
  C[ImGui.Col.TabDimmed] = L(C[ImGui.Col.Tab], C[ImGui.Col.TitleBg], 0.80);
  C[ImGui.Col.TabDimmedSelected] = L(C[ImGui.Col.TabSelected], C[ImGui.Col.TitleBg], 0.40);
  C[ImGui.Col.TabDimmedSelectedOverline] = F(0.53, 0.53, 0.87, 0);
  C[ImGui.Col.PlotLines] = F(1, 1, 1, 1); C[ImGui.Col.PlotLinesHovered] = F(0.90, 0.70, 0, 1);
  C[ImGui.Col.PlotHistogram] = F(0.90, 0.70, 0, 1); C[ImGui.Col.PlotHistogramHovered] = F(1, 0.60, 0, 1);
  C[ImGui.Col.TableHeaderBg] = F(0.27, 0.27, 0.38, 1); C[ImGui.Col.TableBorderStrong] = F(0.31, 0.31, 0.45, 1);
  C[ImGui.Col.TableBorderLight] = F(0.26, 0.26, 0.28, 1); C[ImGui.Col.TableRowBg] = F(0, 0, 0, 0);
  C[ImGui.Col.TableRowBgAlt] = F(1, 1, 1, 0.07); C[ImGui.Col.TextLink] = [...C[ImGui.Col.HeaderActive]];
  C[ImGui.Col.TextSelectedBg] = F(0, 0, 1, 0.35); C[ImGui.Col.TreeLines] = [...C[ImGui.Col.Border]];
  C[ImGui.Col.DragDropTarget] = F(1, 1, 0, 0.90); C[ImGui.Col.DragDropTargetBg] = F(0, 0, 0, 0);
  C[ImGui.Col.UnsavedMarker] = F(0.90, 0.90, 0.90, 1); C[ImGui.Col.NavCursor] = [...C[ImGui.Col.HeaderHovered]];
  C[ImGui.Col.NavWindowingHighlight] = F(1, 1, 1, 0.70); C[ImGui.Col.NavWindowingDimBg] = F(0.80, 0.80, 0.80, 0.20);
  C[ImGui.Col.ModalWindowDimBg] = F(0.20, 0.20, 0.20, 0.35);
}
function StyleColorsLight() {
  const c = ensure(), C = c.style.Colors, F = (r, g, b, a) => [r, g, b, a];
  const L = ImGui.lerpCol;
  C[ImGui.Col.Text] = F(0, 0, 0, 1); C[ImGui.Col.TextDisabled] = F(0.60, 0.60, 0.60, 1);
  C[ImGui.Col.WindowBg] = F(0.94, 0.94, 0.94, 1); C[ImGui.Col.ChildBg] = F(0, 0, 0, 0);
  C[ImGui.Col.PopupBg] = F(1, 1, 1, 0.98); C[ImGui.Col.Border] = F(0, 0, 0, 0.30);
  C[ImGui.Col.BorderShadow] = F(0, 0, 0, 0);
  C[ImGui.Col.FrameBg] = F(1, 1, 1, 1); C[ImGui.Col.FrameBgHovered] = F(0.26, 0.59, 0.98, 0.40);
  C[ImGui.Col.FrameBgActive] = F(0.26, 0.59, 0.98, 0.67);
  C[ImGui.Col.TitleBg] = F(0.96, 0.96, 0.96, 1); C[ImGui.Col.TitleBgActive] = F(0.82, 0.82, 0.82, 1);
  C[ImGui.Col.TitleBgCollapsed] = F(1, 1, 1, 0.51); C[ImGui.Col.MenuBarBg] = F(0.86, 0.86, 0.86, 1);
  C[ImGui.Col.ScrollbarBg] = F(0.98, 0.98, 0.98, 0.53); C[ImGui.Col.ScrollbarGrab] = F(0.69, 0.69, 0.69, 0.80);
  C[ImGui.Col.ScrollbarGrabHovered] = F(0.49, 0.49, 0.49, 0.80); C[ImGui.Col.ScrollbarGrabActive] = F(0.49, 0.49, 0.49, 1);
  C[ImGui.Col.CheckMark] = F(0.26, 0.59, 0.98, 1); C[ImGui.Col.CheckboxSelectedBg] = F(0.95, 0.97, 1, 1);
  C[ImGui.Col.SliderGrab] = F(0.26, 0.59, 0.98, 0.78); C[ImGui.Col.SliderGrabActive] = F(0.46, 0.54, 0.80, 0.60);
  C[ImGui.Col.Button] = F(0.26, 0.59, 0.98, 0.40); C[ImGui.Col.ButtonHovered] = F(0.26, 0.59, 0.98, 1);
  C[ImGui.Col.ButtonActive] = F(0.06, 0.53, 0.98, 1);
  C[ImGui.Col.Header] = F(0.26, 0.59, 0.98, 0.31); C[ImGui.Col.HeaderHovered] = F(0.26, 0.59, 0.98, 0.80);
  C[ImGui.Col.HeaderActive] = F(0.26, 0.59, 0.98, 1);
  C[ImGui.Col.Separator] = F(0.39, 0.39, 0.39, 0.62); C[ImGui.Col.SeparatorHovered] = F(0.14, 0.44, 0.80, 0.78);
  C[ImGui.Col.SeparatorActive] = F(0.14, 0.44, 0.80, 1);
  C[ImGui.Col.ResizeGrip] = F(0.35, 0.35, 0.35, 0.17); C[ImGui.Col.ResizeGripHovered] = F(0.26, 0.59, 0.98, 0.67);
  C[ImGui.Col.ResizeGripActive] = F(0.26, 0.59, 0.98, 0.95);
  C[ImGui.Col.InputTextCursor] = [...C[ImGui.Col.Text]]; C[ImGui.Col.TabHovered] = [...C[ImGui.Col.HeaderHovered]];
  C[ImGui.Col.Tab] = L(C[ImGui.Col.Header], C[ImGui.Col.TitleBgActive], 0.90);
  C[ImGui.Col.TabSelected] = L(C[ImGui.Col.HeaderActive], C[ImGui.Col.TitleBgActive], 0.60);
  C[ImGui.Col.TabSelectedOverline] = [...C[ImGui.Col.HeaderActive]];
  C[ImGui.Col.TabDimmed] = L(C[ImGui.Col.Tab], C[ImGui.Col.TitleBg], 0.80);
  C[ImGui.Col.TabDimmedSelected] = L(C[ImGui.Col.TabSelected], C[ImGui.Col.TitleBg], 0.40);
  C[ImGui.Col.TabDimmedSelectedOverline] = F(0.26, 0.59, 1, 0);
  C[ImGui.Col.PlotLines] = F(0.39, 0.39, 0.39, 1); C[ImGui.Col.PlotLinesHovered] = F(1, 0.43, 0.35, 1);
  C[ImGui.Col.PlotHistogram] = F(0.90, 0.70, 0, 1); C[ImGui.Col.PlotHistogramHovered] = F(1, 0.45, 0, 1);
  C[ImGui.Col.TableHeaderBg] = F(0.78, 0.87, 0.98, 1); C[ImGui.Col.TableBorderStrong] = F(0.57, 0.57, 0.64, 1);
  C[ImGui.Col.TableBorderLight] = F(0.68, 0.68, 0.74, 1); C[ImGui.Col.TableRowBg] = F(0, 0, 0, 0);
  C[ImGui.Col.TableRowBgAlt] = F(0.30, 0.30, 0.30, 0.09); C[ImGui.Col.TextLink] = [...C[ImGui.Col.HeaderActive]];
  C[ImGui.Col.TextSelectedBg] = F(0.26, 0.59, 0.98, 0.35); C[ImGui.Col.TreeLines] = [...C[ImGui.Col.Border]];
  C[ImGui.Col.DragDropTarget] = F(0.26, 0.59, 0.98, 0.95); C[ImGui.Col.DragDropTargetBg] = F(0, 0, 0, 0);
  C[ImGui.Col.UnsavedMarker] = F(0, 0, 0, 1); C[ImGui.Col.NavCursor] = [...C[ImGui.Col.HeaderHovered]];
  C[ImGui.Col.NavWindowingHighlight] = F(0.70, 0.70, 0.70, 0.70); C[ImGui.Col.NavWindowingDimBg] = F(0.20, 0.20, 0.20, 0.20);
  C[ImGui.Col.ModalWindowDimBg] = F(0.20, 0.20, 0.20, 0.35);
}

// ---------- cursor / layout queries ----------
function SetCursorPos(x, y) { const w = W(); if (w) { w.dc.cursorPos.x = w.pos.x + w.padding.x + x; w.dc.cursorPos.y = w.pos.y + w.titleH + w.padding.y + y - (w.scrollY || 0); w.dc._lockFeed = true; } }
function SetCursorPosX(x) { const w = W(); if (w) { w.dc.cursorPos.x = w.pos.x + w.padding.x + x; w.dc._lockFeed = true; } }
function SetCursorPosY(y) { const w = W(); if (w) { w.dc.cursorPos.y = w.pos.y + w.titleH + w.padding.y + y - (w.scrollY || 0); w.dc._lockFeed = true; } }
function GetCursorPos() { const w = W(); if (!w) return { x: 0, y: 0 }; return { x: w.dc.cursorPos.x - w.pos.x - w.padding.x, y: w.dc.cursorPos.y - (w.pos.y + w.titleH + w.padding.y) + (w.scrollY || 0) }; }
function GetCursorScreenPos() { const w = W(); return w ? { ...w.dc.cursorPos } : { x: 0, y: 0 }; }
function SetCursorScreenPos(x, y) { const w = W(); if (w) { w.dc.cursorPos.x = x; w.dc.cursorPos.y = y; w.dc._lockFeed = true; } }
function GetContentRegionAvail() {
  const w = W(); if (!w) return { x: 0, y: 0 };
  return { x: Math.max(0, w.pos.x + w.sizeFull.x - w.padding.x - w.dc.cursorPos.x), y: Math.max(0, (w.size.y > 0 ? w.pos.y + w.sizeFull.y - w.padding.y : w.dc.cursorMaxPos.y + 200) - w.dc.cursorPos.y) };
}
function CalcTextSize(text) { return { x: measure(text), y: 16 }; }
function AlignTextToFramePadding() { const w = W(); if (w) w.dc.cursorPos.y += 4; }
function GetWindowPos() { const w = W(); return w ? { ...w.pos } : { x: 0, y: 0 }; }
function GetWindowSize() { const w = W(); return w ? { ...w.sizeFull } : { x: 0, y: 0 }; }
function GetWindowWidth() { return GetWindowSize().x; }
function GetWindowHeight() { return GetWindowSize().y; }
function SetScrollHereY() { /* best-effort: keep */ }
function PushClipRect() {}
function PopClipRect() {}
function PushFont() {}
function PopFont() {}
function SetWindowFontScale() {}

// ---------- item state queries ----------
function markEdited(id) { const c = ensure(); c._lastEdited = { id, frame: c.frame }; }
function IsItemActive() { const c = ensure(); return c.activeId !== 0 && c.activeId === c.lastItem.id; }
function IsItemHovered() { const c = ensure(); const r = c.lastItem.rect; return !!r && c.hovered(r.x, r.y, r.w, r.h); }
function IsItemClicked(btn = 0) { return IsItemHovered() && ensure().io.MouseClicked[btn]; }
function IsItemEdited() { const c = ensure(); return c._lastEdited.id === c.lastItem.id && c._lastEdited.frame === c.frame; }
function IsItemDeactivated() { const c = ensure(); return c._lastDeactivatedId === c.lastItem.id && c._lastDeactivatedFrame === c.frame; }
function IsItemDeactivatedAfterEdit() { return IsItemDeactivated() && IsItemEdited(); }
function IsItemVisible() { return !!ensure().lastItem.rect; }
function IsItemToggledOpen() { return false; }
function IsWindowHovered() { const w = W(); return !!(w && w.contentHover); }
function IsWindowFocused() { const c = ensure(); return c.windowStack[c.windowStack.length - 1] === W(); }
function IsRectVisible() { return true; }
// wrap edit-reporting widgets to feed IsItemEdited/Deactivated
function wrapEditTrack() {
  if (ensure().__editWrapped) return; ensure().__editWrapped = true;
  const names = ["Checkbox", "CheckboxFlags", "RadioButtonInt", "SliderFloat", "SliderInt", "SliderFloat2", "SliderFloat3", "SliderFloat4", "DragFloat", "DragInt", "InputText", "InputFloat", "InputInt", "InputDouble", "ColorEdit4", "ColorEdit3", "Combo", "Selectable", "ListBox"];
  for (const n of names) {
    if (typeof ImGui[n] !== "function") continue;
    const orig = ImGui[n];
    ImGui[n] = function (...a) {
      const c = ensure();
      const beforeActive = c.activeId;
      const r = orig.apply(this, a);
      const id = c.lastItem.id;
      const edited = (r && typeof r === "object" && r.changed) || r === true && (n === "Selectable");
      if (edited) markEdited(id);
      if (beforeActive !== 0 && c.activeId === 0) { c._lastDeactivatedId = id; c._lastDeactivatedFrame = c.frame; }
      return r;
    };
  }
  // keyboard focus: activate text widget recorded as lastItem
  const origInput = ImGui.InputText;
  ImGui.InputText = function (label, text, flags) {
    const c = ensure();
    const r = origInput(label, text, flags);
    if (c._wantTextFocus) {
      c._wantTextFocus = false;
      const id = c.lastItem.id, rect = c.lastItem.rect;
      c.activeId = id; c.activeKind = "text"; c.activePayload = { value: r.text };
      if (ImGui._backendFocusText && rect) ImGui._backendFocusText(rect.x, rect.y, rect.w, 24, r.text, (nv) => { if (c.activePayload) c.activePayload.value = nv; });
    }
    return r;
  };
}
function SetKeyboardFocusHere() { ensure()._wantTextFocus = true; }

// ---------- mouse / keyboard queries ----------
function IsMouseClicked(btn = 0) { return ensure().io.MouseClicked[btn]; }
function IsMouseDown(btn = 0) { return ensure().io.MouseDown[btn]; }
function IsMouseReleased(btn = 0) { return ensure().io.MouseReleased[btn]; }
function IsMouseDragging(btn = 0) { const c = ensure(); return c.io.MouseDown[btn] && c.activeId !== 0; }
function GetMouseDragDelta(btn = 0) { return { x: 0, y: 0 }; }
function IsMouseHoveringRect(x, y, wd, ht) { return ensure().hovered(x, y, wd, ht); }
function IsKeyDown(code) { return !!ensure().io.KeysDown[code]; }
function GetKeyPressedAmount() { return 0; }

// ---------- tooltips ----------
function BeginTooltip() {
  const c = ensure(), m = c.io.MousePos;
  c._tooltip = { x: m.x + 14, y: m.y + 12 };
  return true;
}
function EndTooltip() { ensure()._tooltip = null; }
function SetTooltip(text) {
  if (BeginTooltip()) {
    const c = ensure();
    emit({ t: "rectFilled", x: c._tooltip.x, y: c._tooltip.y, w: measure(text) + 16, h: 24, r: 4, col: c.style.Colors[ImGui.Col.PopupBg] });
    emit({ t: "rect", x: c._tooltip.x, y: c._tooltip.y, w: measure(text) + 16, h: 24, r: 4, col: c.style.Colors[ImGui.Col.Border], th: 1 });
    emit({ t: "text", str: text, x: c._tooltip.x + 8, y: c._tooltip.y + 5, col: c.style.Colors[ImGui.Col.Text] });
    EndTooltip();
  }
}
function SetItemTooltip(text) { if (IsItemHovered()) SetTooltip(text); }

// ---------- popups / modals (overlay layer, FindBestWindowPosForPopup flip) ----------
function OpenPopup(id, ax, ay) {
  const c = ensure(), m = c.io.MousePos;
  const key = String(id);
  c._popupPending = key;
  // Explicit anchor (e.g. swatch bottom-left) wins; else mouse pos.
  c._popupAnchor[key] = (ax !== undefined && ay !== undefined) ? { x: ax, y: ay } : { x: m.x, y: m.y };
}
function OpenPopupOnItemClick(id) { if (IsItemClicked(1)) OpenPopup(id); }
function IsPopupOpen(id) { const c = ensure(); return c._popupStack.includes(String(id)); }
function CloseCurrentPopup() { const c = ensure(); c._popupStack.pop(); }
function ClosePopup(id) { const c = ensure(); c._popupStack = c._popupStack.filter((p) => p !== String(id)); }
function popupBestPos(a, bw, estH) {
  // imgui.cpp FindBestWindowPosForPopup: prefer below-left, flip on overflow.
  const c = ensure();
  const dw = c.io.DisplaySize.x, dh = c.io.DisplaySize.y;
  let bx = Math.max(4, Math.min(dw - bw - 4, a.x));
  let by = a.y;
  if (by + estH > dh - 4) by = a.y - estH - 4; // flip above
  if (by < 4) by = 4;
  return { bx, by };
}
function popupBoxBegin(id, modal) {
  const c = ensure(), w = W(); if (!w) return false;
  const key = String(id);
  if (c._popupPending === key && !c._popupStack.includes(key)) c._popupStack.push(key);
  c._popupPending = null;
  if (!c._popupStack.includes(key)) return false;
  const a = c._popupAnchor[key] || { x: w.dc.cursorPos.x, y: w.dc.cursorPos.y };
  const bw = Math.min(300, Math.max(120, w.sizeFull.x - 20));
  const { bx, by } = popupBestPos(a, bw, 260);
  if (modal) emit({ t: "rectFilled", x: w.pos.x, y: w.pos.y, w: w.sizeFull.x, h: w.sizeFull.y, r: 0, css: "rgba(0,0,0,0.45)" });
  // Save outer line state; popup content gets a fresh line context.
  // Stack (not singleton): nested popups each keep their own box + marker.
  const dc = w.dc;
  const box = {
    x: bx, y: by, w: bw, key, modal, win: w,
    savedCursor: { ...dc.cursorPos }, savedPrev: { ...dc.cursorPosPrevLine },
    savedStart: { ...dc.cursorStartPos },
    savedLine: { currH: dc.currLineHeight, used: dc._lineUsed, same: dc.isSameLine, sp: dc.sameLineSpacing, lw: dc.lastItemWidth },
  };
  c._popupBoxStack.push(box);
  c._popupBox = box; // legacy alias = top of stack
  w.drawList.push({ t: "_popupMark", key });
  dc.cursorPos.x = bx + 8; dc.cursorPos.y = by + 8; dc.cursorPosPrevLine = { x: bx + 8, y: by + 8 };
  // Popup is its own layout origin: feeds wrap inside the box, never back
  // to the parent window's left margin (that stranded Close/OK outside).
  dc.cursorStartPos = { x: bx + 8, y: by + 8 };
  dc.currLineHeight = 0; dc._lineUsed = false; dc.isSameLine = false; dc.lastItemWidth = 0;
  w.drawList.push({ t: "_popupMark", key });
  dc.cursorPos.x = bx + 8; dc.cursorPos.y = by + 8; dc.cursorPosPrevLine = { x: bx + 8, y: by + 8 };
  dc.currLineHeight = 0; dc._lineUsed = false; dc.isSameLine = false; dc.lastItemWidth = 0;
  PushID("popup:" + key);
  return true;
}
function popupBoxEnd(modal) {
  const c = ensure(), w = W(); if (!w) return;
  const stack = c._popupBoxStack || [];
  // Pop the top box belonging to THIS window (balanced Begin/End => top).
  let bi = stack.length - 1;
  while (bi >= 0 && stack[bi].win !== w) bi--;
  if (bi < 0) return;
  const b = stack[bi];
  stack.splice(bi, 1);
  c._popupBox = stack.length ? stack[stack.length - 1] : null;
  const dc = w.dc;
  const h = Math.max(30, dc.cursorPos.y - b.y + 8);
  PopID();
  // Move popup ops (mark..end) to the context overlay: drawn after ALL
  // windows, unclipped, top Z — a top-level layer within the canvas model.
  // Box frame goes first so content paints over it.
  const frame = [
    { t: "rectFilled", x: b.x, y: b.y, w: b.w, h, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.PopupBg] },
    { t: "rect", x: b.x, y: b.y, w: b.w, h, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.Border], th: 1 },
  ];
  let start = w.drawList.findIndex((op) => op.t === "_popupMark" && op.key === b.key);
  if (start < 0) start = w.drawList.length;
  const content = w.drawList.splice(start);
  const inner = content.filter((op) => op.t !== "_popupMark");
  c._overlayOps.push(...frame, ...inner);
  // Record this frame's rect for next frame's click preemption.
  c._popupRects[b.key] = { x: b.x, y: b.y, w: b.w, h };
  // Restore outer line state; continue below the popup anchor region.
  dc.cursorPos.x = b.savedCursor.x; dc.cursorPos.y = Math.max(b.savedCursor.y, b.y + h + 8);
  dc.cursorPosPrevLine = { ...dc.cursorPos };
  dc.cursorStartPos = { ...b.savedStart };
  dc.currLineHeight = 0; dc._lineUsed = false; dc.isSameLine = false; dc.lastItemWidth = 0;
  dc.cursorMaxPos.y = Math.max(dc.cursorMaxPos.y, b.y + h);
  const m = c.io.MousePos;
  const inside = m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + h;
  if (c.io.MouseClicked[0] && !inside && !modal) ClosePopup(b.key);
  if (c.io.KeysDown["Escape"]) ClosePopup(b.key);
}
function BeginPopup(id) { return popupBoxBegin(id, false); }
function EndPopup() { popupBoxEnd(false); }
function BeginPopupModal(name) { return popupBoxBegin(name, true); }
function EndPopupModal() { popupBoxEnd(true); }
function BeginPopupContextItem(id = "ctx") { if (IsItemClicked(1)) OpenPopup(id); return BeginPopup(id); }
function BeginPopupContextWindow(id = "ctxwin") { const w = W(); if (w && w.contentHover && C().io.MouseClicked[1]) OpenPopup(id); return BeginPopup(id); }

// ---------- menu bar / menus ----------
function BeginMenuBar() {
  const c = ensure(), w = W(); if (!w) return false;
  // reserve strip under title bar
  const x = w.pos.x + 2, y = w.pos.y + w.titleH + 2;
  emit({ t: "rectFilled", x, y, w: w.sizeFull.x - 4, h: 24, r: 4, col: c.style.Colors[ImGui.Col.MenuBarBg] });
  w.dc.cursorPos.x = x + 6; w.dc.cursorPos.y = y + 4; w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc._lockFeed = true; // first menu sits exactly at the strip origin
  c._menuBar = { x, y };
  // consume vertical space
  w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, y + 24);
  return true;
}
function EndMenuBar() {
  const c = ensure(), w = W(); if (!w) return;
  w.dc.cursorPos.x = w.pos.x + w.padding.x + (w._indent || 0);
  w.dc.cursorPos.y = Math.max(w.dc.cursorPos.y, (c._menuBar ? c._menuBar.y + 26 : w.dc.cursorPos.y));
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc.currLineHeight = 0; w.dc._lineUsed = false; w.dc.lastItemWidth = 0;
  c._menuBar = null;
}
function BeginMainMenuBar() {
  const c = ensure();
  let w = W();
  if (!w) { c.begin("##MainMenuBar", null, ImGui.WindowFlags.NoTitleBar | ImGui.WindowFlags.NoResize | ImGui.WindowFlags.NoMove); w = W(); }
  const bw = c.io.DisplaySize.x;
  emit({ t: "rectFilled", x: w.dc.cursorPos.x - 8, y: w.dc.cursorPos.y - 8, w: bw, h: 26, r: 0, col: c.style.Colors[ImGui.Col.MenuBarBg] });
  return true;
}
function EndMainMenuBar() {}
function BeginMenu(label) {
  const c = ensure(), w = W(); if (!w) return false;
  const shown = ImGui.findRenderedTextEnd(label);
  const tw = measure(shown) + 16;
  c.beforeItemPlacement(tw, 22);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y - 2;
  c.itemSize(tw, 22);
  const id = w.getID("menu:" + label);
  c.itemAdd(x, y, tw, 22, id);
  const h = c.hovered(x, y, tw, 22);
  if (h && ((c.io.MouseClicked[0] && !menuClickSuppressed()) || c._menuOpen[label])) { c._menuOpen[label] = !c._menuOpen[label]; c.anyWindowHovered = true; }
  else if (h) c.anyWindowHovered = true;
  const open = !!c._menuOpen[label];
  emit({ t: "rectFilled", x, y, w: tw, h: 22, r: 4, col: open || h ? c.style.Colors[ImGui.Col.HeaderHovered] : [0, 0, 0, 0] });
  emit({ t: "text", str: shown, x: x + 8, y: y + 4, col: c.style.Colors[ImGui.Col.Text] });
  w.dc.cursorPos.x += 4;
  if (open) {
    // Dropdown overlays: save the row cursor so EndMenu restores the menubar
    // row for sibling menus instead of pushing them under the dropdown.
    c._menuStack.push({
      label, outerCursor: { ...w.dc.cursorPos }, outerPrev: { ...w.dc.cursorPosPrevLine },
      outerStart: { ...w.dc.cursorStartPos },
      outerLine: { currH: w.dc.currLineHeight, used: w.dc._lineUsed, lw: w.dc.lastItemWidth },
    });
    w.dc.cursorPos.x = x; w.dc.cursorPos.y = y + 26; w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.cursorStartPos = { x, y: y + 26 }; // dropdown items wrap in-column
    w.dc.currLineHeight = 0; w.dc._lineUsed = false; w.dc.lastItemWidth = 0;
    PushID("menu:" + label);
  } else if (c._menuBar) {
    w.dc._lockFeed = true; // chain next sibling menu on the same row
  }
  return open;
}
function EndMenu() {
  const c = ensure(), w = W(); if (!w) return;
  PopID();
  const saved = c._menuStack.pop();
  if (saved) {
    // Restore the menubar row (dropdown was an overlay, not document flow).
    w.dc.cursorPos.x = saved.outerCursor.x; w.dc.cursorPos.y = saved.outerCursor.y;
    w.dc.cursorPosPrevLine = { ...saved.outerPrev };
    w.dc.cursorStartPos = { ...saved.outerStart };
    w.dc.currLineHeight = saved.outerLine.currH; w.dc._lineUsed = saved.outerLine.used;
    w.dc.lastItemWidth = saved.outerLine.lw;
    if (c._menuBar) w.dc._lockFeed = true;
  }
  const m = c.io.MousePos;
  if (c.io.MouseClicked[0] && (Math.abs(m.x - w.dc.cursorPos.x) > 160 || Math.abs(m.y - w.dc.cursorPos.y) > 200)) {
    for (const k of Object.keys(c._menuOpen)) c._menuOpen[k] = false;
  }
}
function MenuItem(label, shortcut = "", selected = false, enabled = true) {
  const c = ensure(), w = W(); if (!w) return false;
  const shown = ImGui.findRenderedTextEnd(label);
  const wd = 170, ht = 22;
  c.beforeItemPlacement(wd, ht);
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  c.itemSize(wd, ht);
  const id = w.getID("mi:" + label);
  c.itemAdd(x, y, wd, ht, id);
  const h = enabled && c.hovered(x, y, wd, ht);
  if (h) { emit({ t: "rectFilled", x, y, w: wd, h: ht, r: 4, col: c.style.Colors[ImGui.Col.HeaderHovered] }); c.anyWindowHovered = true; }
  emit({ t: "text", str: (selected ? "● " : "") + shown, x: x + 8, y: y + 3, col: enabled ? c.style.Colors[ImGui.Col.Text] : c.style.Colors[ImGui.Col.TextDisabled] });
  if (shortcut) emit({ t: "text", str: shortcut, x: x + wd - measure(shortcut) - 8, y: y + 3, col: c.style.Colors[ImGui.Col.TextDisabled] });
  return enabled && h && c.io.MouseClicked[0] && !menuClickSuppressed();
}

// ---------- tab bar (imgui_widgets.cpp BeginTabBar/BeginTabItem) ----------
// Fixed height 24; advance = width + 2; top-rounded only, flat bottom;
// active tab overlaps the baseline by 1px and masks it.
const TAB_H = 24, TAB_CONTENT_GAP = 1;
function BeginTabBar(id) {
  const c = ensure(), w = W(); if (!w) return false;
  // Reserve scrollbar width so rightmost tabs are never occluded by the track.
  const hasScrollbar = (w.scrollMax > 0) && !(w.flags & ImGui.WindowFlags.NoScrollbar);
  const scrollReserve = hasScrollbar ? (c.style.ScrollbarSize + 2) : 0;
  const bw = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0) - scrollReserve;
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  // Reserve the full bar strip so following widgets never overlap tabs.
  c.itemSize(bw, TAB_H);
  c._tabBar = { id: String(id), x, y, w: bw, n: 0, offsetX: 0, contentY: y + TAB_H + TAB_CONTENT_GAP + c.style.ItemSpacing.y, scrollReserve };
  PushID("tabbar:" + id);
  return true;
}
function BeginTabItem(label) {
  const c = ensure(), w = W(); if (!w || !c._tabBar) return false;
  const full = ImGui.findRenderedTextEnd(label);
  const t = c._tabBar;
  // Width = text + FramePadding.x * 2 + 8 (explicit row placement, never wrap).
  const textWidth = measure(full);
  const wantW = Math.max(32, textWidth + c.style.FramePadding.x * 2 + 10);
  const remain = Math.max(0, t.x + t.w - (t.x + t.offsetX));
  let tw = wantW, shown = full;
  if (wantW > remain) {
    // Shrink-to-fit with ellipsis; clamp so x + tw never crosses the bar end.
    // Minimum 40px keeps the label readable when truncation is mandatory.
    tw = Math.max(40, remain);
    tw = Math.min(tw, Math.max(40, (t.x + t.w) - (t.x + t.offsetX)));
    const maxT = Math.max(0, tw - c.style.FramePadding.x * 2 - 8 - 8);
    let s = full;
    while (s.length > 1 && measure(s + "…") > maxT) s = s.slice(0, -1);
    shown = s.length < full.length ? s + "…" : s;
  }
  const x = t.x + t.offsetX, y = t.y;
  t.offsetX += tw + 2; t.wantX = (t.wantX || 0) + wantW + 2; t.n++;
  if (c._tabs[t.id] === undefined) c._tabs[t.id] = full;
  const active = c._tabs[t.id] === full;
  const id = w.getID("tab:" + label);
  c.itemAdd(x, y, tw, TAB_H, id);
  const h = c.hovered(x, y, tw, TAB_H);
  if (h) c.anyWindowHovered = true;
  if (h && c.io.MouseClicked[0] && !menuClickSuppressed()) c._tabs[t.id] = full;
  const col = active ? c.style.Colors[ImGui.Col.TabSelected]
    : h ? c.style.Colors[ImGui.Col.TabHovered]
    : c.style.Colors[ImGui.Col.Tab];
  emit({ t: "rectTop", x, y, w: tw, h: TAB_H + 1, r: c.style.FrameRounding || 4, col });
  if (active) {
    emit({ t: "rectFilled", x, y, w: tw, h: 2, r: 1, col: c.style.Colors[ImGui.Col.TabSelectedOverline] });
    t.activeRect = { x, w: tw };
  }
  // Centered label: delta from tab edges is equal on both sides.
  // (measure the *displayed* string so truncated tabs still center).
  const tcol = active ? c.style.Colors[ImGui.Col.Text] : c.style.Colors[ImGui.Col.TextDisabled];
  const dispW = measure(shown);
  const textX = Math.round(x + (tw - dispW) / 2);
  const textY = Math.round(y + (TAB_H - c.style.FontSize) / 2);
  emit({ t: "text", str: shown, x: textX, y: textY, col: tcol });
  if (active) {
    // Snap content area immediately below the tab strip (no overlap).
    w.dc.cursorPos.x = t.x; w.dc.cursorPos.y = t.contentY; w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
    w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, t.contentY);
  }
  return active;
}
function EndTabItem() {}
function EndTabBar() {
  const c = ensure(), w = W();
  // Single source of truth: one continuous baseline for the whole row...
  if (w && c._tabBar) {
    const ly = c._tabBar.y + TAB_H + 0.5; // half-px => crisp 1px line on canvas
    emit({ t: "line", x1: c._tabBar.x, y1: ly, x2: c._tabBar.x + c._tabBar.w, y2: ly, col: c.style.Colors[ImGui.Col.Separator], th: 1 });
    // ...masked behind the active tab (2px block overlapping y + TAB_H - 1).
    const a = c._tabBar.activeRect;
    if (a) emit({ t: "rectFilled", x: a.x + 1, y: c._tabBar.y + TAB_H - 1, w: a.w - 2, h: 2, r: 0, col: c.style.Colors[ImGui.Col.TabSelected] });
  }
  PopID();
  if (w && c._tabBar) {
    // Auto-height windows (the common demo case) grow horizontally to fit the
    // tab row instead of truncating; fixed-size panels keep ellipsis.
    if (w.size.y === 0) {
      // wantX = unshrunk row width. Stored for the End() wrapper: core End
      // resets sizeFull.x from size.x, so growth applies after it instead.
      w._tabExpandW = c._tabBar.x - w.pos.x + (c._tabBar.wantX || c._tabBar.offsetX) + w.padding.x;
    }
    w.dc.cursorPos.x = w.pos.x + w.padding.x + (w._indent || 0);
    w.dc.cursorPos.y = Math.max(w.dc.cursorPos.y, c._tabBar.contentY);
    w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
  }
  c._tabBar = null;
}
function TabItemButton(label) {
  const pressed = ImGui.Button(label);
  return pressed;
}

// ---------- tables (imgui_tables.cpp: fixed distribution, cell grid) ----------
function BeginTable(id, columns, flags = 0, outerW = 0, outerH = 0) {
  const c = ensure(), w = W(); if (!w) return false;
  // outerWidth defaults to the available content width at the cursor.
  const avail = outerW > 0 ? outerW : GetContentRegionAvail().x;
  const x = w.dc.cursorPos.x;
  c.beforeItemPlacement(avail, 4);
  c.itemSize(avail, 4);
  c._table = {
    id: String(id), cols: columns, flags, x, y: w.dc.cursorPos.y, row: -1, col: -1,
    avail, colW: avail / columns, widths: null, offsets: null,
    names: [], rowH: 22, startY: w.dc.cursorPos.y,
  };
  PushID("table:" + id);
  return true;
}
function TableSetupColumn(label, widthOrWeight = 0) {
  const c = ensure();
  if (c._table) { c._table.names.push(label); c._table._widths = c._table._widths || []; c._table._widths.push(widthOrWeight); }
}
function tableLayout(t) {
  // Column pitch reserves CellPadding.x on both sides so text never clips.
  if (t.widths) return;
  const c = ensure(), pad = c.style.CellPadding.x;
  const n = t.cols;
  t.widths = new Array(n); t.offsets = new Array(n);
  const explicit = (t._widths || []).slice(0, n);
  let fixed = 0, auto = 0;
  for (let i = 0; i < n; i++) {
    const v = explicit[i] || 0;
    if (v > 0) { t.widths[i] = Math.max(v, pad * 2 + 10); fixed += t.widths[i]; } else auto++;
  }
  const rest = Math.max(0, t.avail - fixed);
  const each = auto > 0 ? Math.max(pad * 2 + 10, rest / auto) : 0;
  for (let i = 0; i < n; i++) if (!t.widths[i]) t.widths[i] = each;
  t.colW = t.avail / n;
  let acc = 0;
  for (let i = 0; i < n; i++) { t.offsets[i] = acc; acc += t.widths[i]; }
}
function tableHasInnerH(t) {
  return (t.flags & TableFlags.BordersInnerH) || (t.flags & TableFlags.BordersInner) ||
    (t.flags & TableFlags.BordersH) || (t.flags & TableFlags.Borders);
}
function TableHeadersRow() {
  const c = ensure(), w = W(); if (!w || !c._table) return;
  tableLayout(c._table);
  TableNextRow();
  for (let i = 0; i < c._table.cols; i++) {
    TableSetColumnIndex(i);
    const nm = c._table.names[i] || ("C" + i);
    const cw = c._table.widths[i];
    const hh = c.style.FontSize + c.style.FramePadding.y * 2;
    emit({ t: "rectFilled", x: w.dc.cursorPos.x - 2, y: w.dc.cursorPos.y - 2, w: cw - 2, h: hh, r: 3, col: c.style.Colors[ImGui.Col.TableHeaderBg] });
    emit({ t: "text", str: nm, x: w.dc.cursorPos.x + c.style.CellPadding.x, y: w.dc.cursorPos.y, col: c.style.Colors[ImGui.Col.Text] });
  }
  // bottom separator splitting headers from data rows
  if (tableHasInnerH(c._table)) {
    const t = c._table, yb = (t.rowY || t.startY) + t.rowH;
    emit({ t: "line", x1: t.x, y1: yb, x2: t.x + t.avail, y2: yb, col: c.style.Colors[ImGui.Col.TableBorderStrong], th: 1 });
  }
  tableInnerVerticals(c._table);
}
function tableInnerVerticals(t) {
  const c = ensure();
  const innerV = (t.flags & TableFlags.BordersInnerV) || (t.flags & TableFlags.BordersInner) || (t.flags & TableFlags.Borders);
  if (!innerV || t.row < 0) return;
  const y0 = t.rowY || t.startY, y1 = y0 + t.rowH;
  for (let i = 1; i < t.cols; i++) {
    const lx = t.x + t.offsets[i];
    emit({ t: "line", x1: lx, y1: y0, x2: lx, y2: y1, col: c.style.Colors[ImGui.Col.TableBorderLight], th: 1 });
  }
}
function TableNextRow() {
  const c = ensure(), w = W(); if (!w || !c._table) return;
  const t = c._table;
  tableLayout(t);
  t.row++; t.col = -1;
  const y = t.startY + (t.row * t.rowH);
  // row bg (accept real RowBg bit and legacy lite value 1)
  const rowBg = (t.flags & TableFlags.RowBg) || (t.flags & 1);
  if (rowBg && t.row % 2 === 1) emit({ t: "rectFilled", x: t.x, y, w: t.avail, h: t.rowH, r: 0, col: c.style.Colors[ImGui.Col.TableRowBgAlt] });
  t.rowY = y;
  w.dc.cursorPos.x = t.x; w.dc.cursorPos.y = y; w.dc.cursorPosPrevLine = { x: t.x, y };
  w.dc._cellStartX = undefined;
  w.dc._lockFeed = true;
  w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, y + t.rowH);
}
function TableSetColumnIndex(n) {
  const c = ensure(), w = W(); if (!w || !c._table) return false;
  const t = c._table;
  tableLayout(t);
  t.col = n;
  // Explicit x offset from stored widths + cell padding (never arbitrary).
  // _cellStartX lets multi-widget cells wrap in-column instead of to margin.
  w.dc.cursorPos.x = t.x + t.offsets[n] + c.style.CellPadding.x; w.dc.cursorPos.y = t.rowY || t.y;
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc._cellStartX = w.dc.cursorPos.x;
  w.dc._lockFeed = true;
  return true;
}
function TableNextColumn() { const c = ensure(); return TableSetColumnIndex((c._table ? c._table.col : -1) + 1); }
function TableHeader(label) {
  const c = ensure(); if (!c._table) return;
  const w = W();
  emit({ t: "text", str: label, x: w.dc.cursorPos.x + c.style.CellPadding.x, y: w.dc.cursorPos.y, col: c.style.Colors[ImGui.Col.Text] });
}
function TableGetColumnIndex() { const c = ensure(); return c._table ? c._table.col : 0; }
function TableGetRowIndex() { const c = ensure(); return c._table ? c._table.row : 0; }
function TableGetColumnCount() { const c = ensure(); return c._table ? c._table.cols : 0; }
function EndTable() {
  const c = ensure(), w = W(); if (!w || !c._table) return;
  const t = c._table;
  tableLayout(t);
  // Draw grid lines for body rows: verticals + horizontals when requested.
  if (t.row >= 0) {
    const innerV = (t.flags & TableFlags.BordersInnerV) || (t.flags & TableFlags.BordersInner) || (t.flags & TableFlags.Borders);
    const innerH = tableHasInnerH(t);
    for (let r = 0; r <= t.row; r++) {
      const y0 = t.startY + r * t.rowH, y1 = y0 + t.rowH;
      if (innerV) {
        for (let i = 1; i < t.cols; i++) {
          const lx = t.x + t.offsets[i];
          emit({ t: "line", x1: lx, y1: y0, x2: lx, y2: y1, col: c.style.Colors[ImGui.Col.TableBorderLight], th: 1 });
        }
      }
      if (innerH && r > 0) {
        emit({ t: "line", x1: t.x, y1: y0, x2: t.x + t.avail, y2: y0, col: c.style.Colors[ImGui.Col.TableBorderLight], th: 1 });
      }
    }
  }
  // Outer border only for BordersOuter (the Borders composite includes it).
  if ((t.flags & TableFlags.BordersOuter) || (t.flags & 2)) emit({ t: "rect", x: t.x, y: t.startY - 2, w: t.avail, h: (t.row + 1) * t.rowH + 4, r: 4, col: c.style.Colors[ImGui.Col.Border], th: 1 });
  w.dc.cursorPos.x = w.pos.x + w.padding.x + (w._indent || 0);
  w.dc.cursorPos.y = t.startY + (t.row + 1) * t.rowH + 6;
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc.currLineHeight = 0; w.dc._lineUsed = false; w.dc.lastItemWidth = 0;
  w.dc._cellStartX = undefined;
  w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, w.dc.cursorPos.y);
  PopID();
  c._table = null;
}
const TableFlags = {
  None: 0, Resizable: 1 << 0, Reorderable: 1 << 1, Hideable: 1 << 2, Sortable: 1 << 3,
  NoSavedSettings: 1 << 4, ContextMenuInBody: 1 << 5, RowBg: 1 << 6,
  BordersInnerH: 1 << 7, BordersOuterH: 1 << 8, BordersInnerV: 1 << 9, BordersOuterV: 1 << 10,
  NoBordersInBody: 1 << 11, NoBordersInBodyUntilResize: 1 << 12,
  SizingFixedFit: 1 << 13, SizingFixedSame: 2 << 13, SizingStretchProp: 3 << 13, SizingStretchSame: 4 << 13,
  get BordersH() { return this.BordersInnerH | this.BordersOuterH; },
  get BordersV() { return this.BordersInnerV | this.BordersOuterV; },
  get BordersInner() { return this.BordersInnerV | this.BordersInnerH; },
  get BordersOuter() { return this.BordersOuterV | this.BordersOuterH; },
  get Borders() { return this.BordersInner | this.BordersOuter; },
};

// ---------- legacy columns ----------
function Columns(count = 1) {
  const c = ensure(), w = W(); if (!w) return;
  if (count <= 1) { c._columns = null; return; }
  const avail = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  c._columns = { n: count, i: 0, x: w.dc.cursorPos.x, y: w.dc.cursorPos.y, w: avail / count };
  w.dc.cursorPos.x = c._columns.x; w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc._lockFeed = true;
}
function NextColumn() {
  const c = ensure(), w = W(); if (!w || !c._columns) return;
  const cc = c._columns;
  cc.i = (cc.i + 1) % cc.n;
  if (cc.i === 0) { w.dc.cursorPos.x = cc.x; w.dc.cursorPos.y = Math.max(w.dc.cursorPos.y, w.dc.cursorPosPrevLine.y + 22); }
  else { w.dc.cursorPos.x = cc.x + cc.i * cc.w; w.dc.cursorPos.y = cc.y; }
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc._lockFeed = true;
}

// ---------- tree ex ----------
function TreeNodeEx(label, flags = 0) {
  const c = ensure();
  if (c._treeNextOpen !== undefined) {
    const w = W(); const key = (w ? w.name : "") + "##" + label;
    c.headerOpen.set(key, !!c._treeNextOpen);
    c._treeNextOpen = undefined;
  }
  const open = ImGui.CollapsingHeader(label, flags);
  if (open) { ImGui.Indent(); PushID(label); }
  return open;
}
function TreePush(id) { ImGui.Indent(); PushID(id); }
function TreePop() { PopID(); ImGui.Unindent(); }
function SetNextItemOpen(open) { ensure()._treeNextOpen = !!open; }
function TreeNodeGetOpen() { return false; }

// ---------- drag & drop (lite) ----------
function BeginDragDropSource() {
  const c = ensure();
  if (IsItemHovered() && c.io.MouseDown[0] && !c._dd) {
    c._dd = { type: "", data: null, armed: true, id: c.lastItem.id };
  }
  if (c._dd && c._dd.armed && c.io.MouseDown[0]) {
    SetTooltip("dragging…");
    return true;
  }
  return false;
}
function SetDragDropPayload(type, data) { const c = ensure(); if (c._dd) { c._dd.type = String(type); c._dd.data = data; c._dd.active = true; } }
function EndDragDropSource() {
  const c = ensure();
  if (c._dd && !c.io.MouseDown[0]) { if (!c._dd.active) c._dd = null; }
}
function BeginDragDropTarget() {
  const c = ensure();
  if (c._dd && c._dd.active && IsItemHovered()) return true;
  return false;
}
function AcceptDragDropPayload(type) {
  const c = ensure();
  if (c._dd && c._dd.active && (!type || c._dd.type === type)) {
    if (c.io.MouseReleased[0]) { const p = { type: c._dd.type, data: c._dd.data }; c._dd = null; return p; }
    return { type: c._dd.type, data: c._dd.data, preview: true };
  }
  return null;
}
function EndDragDropTarget() {}

// ---------- draw-list no-op guard + renderer tweak ----------
if (ImGui.CanvasRenderer && !ImGui.CanvasRenderer.prototype.__extPatched) {
  ImGui.CanvasRenderer.prototype.__extPatched = true;
  const orig = ImGui.CanvasRenderer.prototype.drawOp;
  ImGui.CanvasRenderer.prototype.drawOp = function (ctx2, st, op) {
    if (!op || op.t === "_noop") return;
    return orig.call(this, ctx2, st, op);
  };
}

wrapEditTrack();

Object.assign(ImGui, {
  PushID, PopID, GetID, BeginGroup, EndGroup, BeginDisabled, EndDisabled,
  PushItemWidth, PopItemWidth, PushStyleColor, PopStyleColor, PushStyleVar, PopStyleVar,
  GetStyleColorVec4, GetColorU32, StyleColorsDark, StyleColorsClassic, StyleColorsLight,
  SetCursorPos, SetCursorPosX, SetCursorPosY, GetCursorPos, GetCursorScreenPos, SetCursorScreenPos,
  GetContentRegionAvail, CalcTextSize, AlignTextToFramePadding,
  GetWindowPos, GetWindowSize, GetWindowWidth, GetWindowHeight,
  SetScrollHereY, PushClipRect, PopClipRect, PushFont, PopFont, SetWindowFontScale,
  IsItemActive, IsItemClicked, IsItemEdited, IsItemDeactivated, IsItemDeactivatedAfterEdit,
  IsItemVisible, IsItemToggledOpen, IsWindowHovered, IsWindowFocused, IsRectVisible,
  SetKeyboardFocusHere, IsMouseClicked, IsMouseDown, IsMouseReleased, IsMouseDragging,
  GetMouseDragDelta, IsMouseHoveringRect, IsKeyDown, GetKeyPressedAmount,
  BeginTooltip, EndTooltip, SetTooltip, SetItemTooltip,
  OpenPopup, OpenPopupOnItemClick, IsPopupOpen, CloseCurrentPopup, ClosePopup,
  BeginPopup, EndPopup, BeginPopupModal, EndPopupModal, BeginPopupContextItem, BeginPopupContextWindow,
  BeginMenuBar, EndMenuBar, BeginMainMenuBar, EndMainMenuBar, BeginMenu, EndMenu, MenuItem,
  BeginTabBar, EndTabBar, BeginTabItem, EndTabItem, TabItemButton,
  BeginTable, EndTable, TableSetupColumn, TableHeadersRow, TableNextRow, TableNextColumn,
  TableSetColumnIndex, TableHeader, TableGetColumnIndex, TableGetRowIndex, TableGetColumnCount, TableFlags,
  Columns, NextColumn, TreeNodeEx, TreePush, TreePop, SetNextItemOpen, TreeNodeGetOpen,
  BeginDragDropSource, SetDragDropPayload, EndDragDropSource, BeginDragDropTarget, AcceptDragDropPayload, EndDragDropTarget,
  SaveIniSettingsToMemory, LoadIniSettingsFromMemory,
});
global.__IMGUI_EXTENDED__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__DEMO__*/
/* ImGui Browser Port — Demo (ported from imgui_demo.cpp structure + ShowStyleEditor)
 * ShowDemoWindow / ShowStyleEditor / ShowMetricsWindow exercising the full port.
 * Requires: core + widgets + widgets2 + extended.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__ || !global.__IMGUI_EXTENDED__) throw new Error("ImGui.core.js + ImGui.extended.js must load first");

const D = {
  demoOpen: true, which: "Widgets",
  plotVals: Array.from({ length: 60 }, (_, i) => 0.5 + 0.4 * Math.sin(i / 5)),
  tab: 0, menuFile: false,
};

function ShowStyleEditor(open) {
  if (open !== undefined && !open.value) return;
  ImGui.SetNextWindowSize(320, 0);
  const w = ImGui.Begin("Style Editor", open ? open.value : null);
  if (open) open.value = w.open !== false;
  if (w.visible) {
    ImGui.Text("Colors (click swatch to edit via picker)");
    const st = ImGui.GetStyle();
    const keys = ["Text", "WindowBg", "TitleBgActive", "FrameBg", "Button", "ButtonHovered", "Header", "ScrollbarGrab"];
    for (const k of keys) {
      const idx = ImGui.Col[k];
      if (idx === undefined) continue;
      const r = ImGui.ColorEdit4(k, st.Colors[idx]);
      if (r.changed) st.Colors[idx] = r.color;
    }
    ImGui.SeparatorText("Rounding / spacing");
    const vr = ImGui.SliderFloat("WindowRounding", st.WindowRounding, 0, 12);
    if (vr.changed) st.WindowRounding = vr.value;
    const fr = ImGui.SliderFloat("FrameRounding", st.FrameRounding, 0, 12);
    if (fr.changed) st.FrameRounding = fr.value;
    ImGui.SeparatorText("Themes");
    if (ImGui.Button("Dark")) ImGui.StyleColorsDark();
    ImGui.SameLine();
    if (ImGui.Button("Classic")) ImGui.StyleColorsClassic();
    ImGui.SameLine();
    if (ImGui.Button("Light")) ImGui.StyleColorsLight();
  }
  ImGui.End();
}

function ShowMetricsWindow() {
  const c = ImGui.GetContext();
  ImGui.SetNextWindowSize(340, 0);
  const w = ImGui.Begin("Metrics", true);
  if (w.visible) {
    ImGui.Text(`Frame ${c.frame}  dt ${(c.io.DeltaTime * 1000).toFixed(1)}ms`);
    ImGui.Text(`Windows: ${c.windows.size}  hovered: ${c.anyWindowHovered}`);
    ImGui.Text(`Active id: ${c.activeId} (${c.activeKind || "-"})`);
    ImGui.SeparatorText("Windows");
    for (const [name, win] of c.windows) {
      ImGui.BulletText(`${name} @${Math.round(win.pos.x)},${Math.round(win.pos.y)} ${Math.round(win.sizeFull.x)}x${Math.round(win.sizeFull.y)} ops=${win.drawList.length}`);
    }
    ImGui.SeparatorText("debug");
    const dbg = ImGui.Checkbox("Show item rects", !!c._debugMode);
    c._debugMode = dbg.checked;
    if (dbg.changed && typeof ImGui.SetDebugMode === "function") ImGui.SetDebugMode(dbg.checked);
    if (c._debugMode && c.lastItem.rect) {
      const r = c.lastItem.rect;
      ImGui.Text(`lastItem id=${c.lastItem.id} @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}x${Math.round(r.h)}`);
    }
    ImGui.SeparatorText("ini");
    if (ImGui.Button("Copy ini to console")) console.log(ImGui.SaveIniSettingsToMemory());
  }
  ImGui.End();
}

function ShowDemoWindow(pOpen) {
  const w0 = ImGui.Begin("Dear ImGui Demo (full port)", pOpen === undefined ? true : pOpen);
  if (pOpen !== undefined && typeof pOpen === "object") pOpen.value = w0.open !== false;
  if (!w0.visible) { ImGui.End(); return; }
  // menu bar
  if (ImGui.BeginMenuBar()) {
    if (ImGui.BeginMenu("File")) {
      if (ImGui.MenuItem("Log ini", "Ctrl+S")) console.log(ImGui.SaveIniSettingsToMemory());
      if (ImGui.MenuItem("Metrics")) ShowMetricsWindow._show = true;
      ImGui.EndMenu();
    }
    if (ImGui.BeginMenu("Edit")) {
      if (ImGui.MenuItem("Clear plot")) D.plotVals = D.plotVals.map(() => 0.5);
      ImGui.EndMenu();
    }
    ImGui.EndMenuBar();
  }
  if (ShowMetricsWindow._show) { ShowMetricsWindow(); if (ImGui.Button("Close metrics")) ShowMetricsWindow._show = false; }
  // tab bar over demo sections
  if (ImGui.BeginTabBar("demo")) {
    const tabs = ["Widgets", "Tables", "Menus+Popups", "Plots", "Misc"];
    for (const t of tabs) {
      if (ImGui.BeginTabItem(t)) { D.which = t; ImGui.EndTabItem(); }
    }
    ImGui.EndTabBar();
  }
  ImGui.Separator();
  if (D.which === "Widgets") demoWidgets();
  else if (D.which === "Tables") demoTables();
  else if (D.which === "Menus+Popups") demoPopups();
  else if (D.which === "Plots") demoPlots();
  else demoMisc();
  ImGui.End();
}

function demoWidgets() {
  if (!ImGui.CollapsingHeader("Buttons")) return;
  D._n = D._n || 0;
  if (ImGui.Button("Press: " + D._n)) D._n++;
  ImGui.SameLine(); ImGui.ArrowButton("arr", 1);
  ImGui.SameLine(); if (ImGui.ColorButton("cb", [1, 0.3, 0.2, 1])) console.log("color btn");
  D._chk = ImGui.Checkbox("check", !!D._chk).checked;
  D._cf = ImGui.CheckboxFlags("flag A", D._cf || 0, 1).value;
  const rb = ImGui.RadioButtonInt("opt1", D._radio || 0, 0); if (rb.changed) D._radio = rb.value;
  const rb2 = ImGui.RadioButtonInt("opt2", D._radio || 0, 1); if (rb2.changed) D._radio = rb2.value;
  D._f = ImGui.SliderFloat("f", D._f === undefined ? 0.5 : D._f, 0, 1).value;
  D._fv = ImGui.SliderFloat3("vec3", D._fv || [0.2, 0.5, 0.8], 0, 1).values;
  D._ang = ImGui.SliderAngle("angle", D._ang || 0).value;
  D._vs = ImGui.VSliderFloat("v", 30, 100, D._vs === undefined ? 0.5 : D._vs, 0, 1).value;
  D._d = ImGui.DragFloat("drag", D._d || 1, 0.02).value;
  D._di = ImGui.DragInt("dragi", D._di || 5, 1, 0, 20).value;
  D._fi = ImGui.InputFloat("in float", D._fi || 3.14).value;
  D._ii = ImGui.InputInt("in int", D._ii || 7).value;
  D._tx = ImGui.InputTextWithHint("user", "e.g. player1", D._tx || "").text;
  D._col = ImGui.ColorPicker4("pick", D._col || [0.2, 0.6, 1, 1]).color;
  ImGui.LabelText("label", "value pair");
  ImGui.Value("bool", true); ImGui.Value("num", 1.23456);
  ImGui.TextDisabled("disabled text");
  ImGui.SeparatorText("separator text");
  if (ImGui.BeginListBox("lb", 0, 80)) {
    for (let i = 0; i < 5; i++) if (ImGui.Selectable("item " + i, D._lb === i)) D._lb = i;
    ImGui.EndListBox();
  }
  // drag & drop pair
  ImGui.Button("drag me");
  if (ImGui.BeginDragDropSource()) { ImGui.SetDragDropPayload("demo", { n: 42 }); ImGui.EndDragDropSource(); }
  ImGui.Button("drop here");
  if (ImGui.BeginDragDropTarget()) { const p = ImGui.AcceptDragDropPayload("demo"); if (p && !p.preview) console.log("dropped", p); ImGui.EndDragDropTarget(); }
}

function demoTables() {
  if (!ImGui.CollapsingHeader("Tables")) return;
  if (ImGui.BeginTable("t1", 3, ImGui.TableFlags.Borders | ImGui.TableFlags.RowBg)) {
    ImGui.TableSetupColumn("Name"); ImGui.TableSetupColumn("HP"); ImGui.TableSetupColumn("Ping");
    ImGui.TableHeadersRow();
    const rows = [["bot_a", "100", "12"], ["bot_b", "75", "40"], ["bot_c", "50", "88"]];
    for (const r of rows) {
      ImGui.TableNextRow();
      for (let i = 0; i < 3; i++) { ImGui.TableSetColumnIndex(i); ImGui.Text(r[i]); }
    }
    ImGui.EndTable();
  }
  ImGui.SeparatorText("Legacy columns");
  ImGui.Columns(2);
  ImGui.Text("left col"); ImGui.NextColumn(); ImGui.Text("right col"); ImGui.NextColumn();
  ImGui.Columns(1);
}

function demoPopups() {
  if (!ImGui.CollapsingHeader("Popups / menus / tabs")) return;
  if (ImGui.Button("Open popup")) ImGui.OpenPopup("hello");
  if (ImGui.BeginPopup("hello")) { ImGui.Text("popup content"); if (ImGui.Button("Close")) ImGui.CloseCurrentPopup(); ImGui.EndPopup(); }
  if (ImGui.Button("Open modal")) ImGui.OpenPopup("modal1");
  if (ImGui.BeginPopupModal("modal1")) { ImGui.Text("modal dialog"); if (ImGui.Button("OK")) ImGui.CloseCurrentPopup(); ImGui.EndPopupModal(); }
  ImGui.Button("right-click me");
  if (ImGui.BeginPopupContextItem("ctx1")) { if (ImGui.MenuItem("Action A")) ImGui.CloseCurrentPopup(); ImGui.EndPopup(); }
  if (ImGui.BeginTabBar("tb2")) {
    if (ImGui.BeginTabItem("Tab A")) { ImGui.Text("content A"); ImGui.EndTabItem(); }
    if (ImGui.BeginTabItem("Tab B")) { ImGui.Text("content B"); ImGui.EndTabItem(); }
    ImGui.EndTabBar();
  }
  ImGui.SetItemTooltip("tooltip for the tab bar above");
}

function demoPlots() {
  if (!ImGui.CollapsingHeader("Plots")) return;
  D.plotVals.push(0.5 + 0.4 * Math.sin(Date.now() / 500)); D.plotVals.shift();
  ImGui.PlotLines("signal", D.plotVals, "live", 0, 1);
  ImGui.PlotHistogram("hist", [0.1, 0.5, 0.9, 0.4, 0.7, 0.3]);
  ImGui.ProgressBar((Date.now() / 2000) % 1, "cycling");
}

function demoMisc() {
  if (!ImGui.CollapsingHeader("Misc")) return;
  ImGui.BulletText("PushID demo (two same labels, distinct ids):");
  ImGui.PushID(1); if (ImGui.Button("same")) console.log("btn 1"); ImGui.PopID();
  ImGui.PushID(2); if (ImGui.Button("same")) console.log("btn 2"); ImGui.PopID();
  if (ImGui.TreeNodeEx("TreeEx node")) { ImGui.Text("child"); ImGui.TreePop(); }
  ImGui.BeginDisabled(true);
  ImGui.Button("disabled button");
  ImGui.EndDisabled();
  ImGui.PushStyleColor(ImGui.Col.Button, [0.8, 0.2, 0.2, 1]);
  if (ImGui.Button("red button")) console.log("red");
  ImGui.PopStyleColor();
  const av = ImGui.GetContentRegionAvail();
  ImGui.Text(`avail ${Math.round(av.x)}x${Math.round(av.y)}  win ${Math.round(ImGui.GetWindowWidth())}x${Math.round(ImGui.GetWindowHeight())}`);
  if (ImGui.Button("Focus next input")) ImGui.SetKeyboardFocusHere();
  D._f2 = ImGui.InputText("focused?", D._f2 || "").text;
  ImGui.Text(`mouse ${ImGui.IsMouseDown(0) ? "down" : "up"} keyA=${ImGui.IsKeyDown("KeyA")}`);
}

Object.assign(ImGui, { ShowDemoWindow, ShowStyleEditor, ShowMetricsWindow, _demoState: D });
global.__IMGUI_DEMO__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__BACKEND__*/
/* ImGui Browser Port — Backend (ported from backends/imgui_impl_win32/glfw/sdl2)
 * Browser equivalent: fixed overlay canvas + window-capture listeners + hidden
 * text input + requestAnimationFrame loop. Feeds ImGuiIO via Add*Event fns.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__ || !global.__IMGUI_DRAW__) throw new Error("ImGui.core.js + ImGui.draw.js must load first");

const Backend = {
  canvas: null, renderer: null, hiddenInput: null,
  running: false, raf: 0, lastT: 0, userFn: null,
  textCommit: null,

  init(opts = {}) {
    const c = ImGui.GetContext();
    if (this.canvas) return this;
    const canvas = document.createElement("canvas");
    canvas.id = "imgui-overlay";
    Object.assign(canvas.style, {
      position: "fixed", left: "0", top: "0", width: "100vw", height: "100vh",
      zIndex: String(opts.zIndex || 2147483646), pointerEvents: "none",
      background: "transparent",
    });
    document.documentElement.appendChild(canvas);
    this.canvas = canvas;
    this.renderer = new ImGui.CanvasRenderer(canvas);
    // hidden text input for IME/mobile (cf. win32 WM_CHAR / glfw CharCallback)
    const inp = document.createElement("input");
    inp.type = "text";
    Object.assign(inp.style, {
      position: "fixed", zIndex: "2147483647", display: "none",
      pointerEvents: "auto", font: "13px sans-serif",
    });
    document.documentElement.appendChild(inp);
    this.hiddenInput = inp;
    inp.addEventListener("input", () => { if (this.textCommit) this.textCommit(inp.value); });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Escape") { this.blurText(); }
      e.stopPropagation();
    });
    ImGui._backendFocusText = (x, y, w, h, cur, commit) => this.focusText(x, y, w, h, cur, commit);
    ImGui._backendBlurText = () => this.blurText();

    const io = c.io;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      io.DisplaySize.x = window.innerWidth;
      io.DisplaySize.y = window.innerHeight;
      io.DisplayFramebufferScale.x = dpr;
      io.DisplayFramebufferScale.y = dpr;
    };
    window.addEventListener("resize", resize);
    resize();

    // --- input (capture phase so page doesn't steal UI clicks) ---
    window.addEventListener("mousemove", (e) => io.AddMousePosEvent(e.clientX, e.clientY), true);
    document.addEventListener("mouseleave", () => io.AddMousePosEvent(-9999, -9999));
    window.addEventListener("blur", () => {
      io.AddMousePosEvent(-9999, -9999);
      for (let b = 0; b < 5; b++) io.AddMouseButtonEvent(b, false);
    });
    window.addEventListener("mousedown", (e) => {
      if (e.button >= 0 && e.button < 5) io.AddMouseButtonEvent(e.button, true);
      if (io.WantCaptureMouse && e.target !== inp) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    window.addEventListener("mouseup", (e) => {
      if (e.button >= 0 && e.button < 5) io.AddMouseButtonEvent(e.button, false);
    }, true);
    window.addEventListener("wheel", (e) => {
      if (io.WantCaptureMouse) e.preventDefault();
      io.AddMouseWheelEvent(-(e.deltaY || 0) / 100);
    }, { capture: true, passive: false });
    window.addEventListener("keydown", (e) => {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (document.activeElement === inp) return; // hidden input handles its own keys
      if (io.WantCaptureKeyboard) { e.preventDefault(); e.stopPropagation(); }
      io.KeysDown[e.code] = true;
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) io.AddInputCharactersUTF8(e.key);
      if (e.key === "Backspace" && ImGui.GetContext().activeKind === "text") {
        const p = ImGui.GetContext().activePayload;
        if (p && p.value) p.value = p.value.slice(0, -1);
      }
    }, true);
    window.addEventListener("keyup", (e) => { io.KeysDown[e.code] = false; }, true);
    return this;
  },

  focusText(x, y, w, h, cur, commit) {
    const inp = this.hiddenInput;
    this.textCommit = commit;
    inp.value = cur || "";
    inp.style.display = "block";
    inp.style.left = Math.max(0, Math.min(window.innerWidth - w - 8, x)) + "px";
    inp.style.top = Math.max(0, y) + "px";
    inp.style.width = Math.max(60, w) + "px";
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
  },
  blurText() {
    if (!this.hiddenInput) return;
    this.hiddenInput.style.display = "none";
    this.hiddenInput.blur();
    this.textCommit = null;
  },

  frame(userFn) {
    this.userFn = userFn;
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      if (document.hidden) { this.raf = requestAnimationFrame(loop); return; }
      const dt = Math.min(0.1, (t - this.lastT) / 1000 || 1 / 60);
      this.lastT = t;
      const c = ImGui.GetContext();
      c.newFrame(dt);
      try { this.userFn(c); } catch (err) { console.error("[ImGui] frame error:", err); }
      c.endFrame();
      // OS cursor follows interaction state (no canvas-drawn ghost ring).
      if (this.canvas) {
        this.canvas.style.cursor =
          (c.activeKind === "resize") ? "nwse-resize" :
          (c.activeKind === "move") ? "move" :
          (c.anyWindowHovered ? "default" : "auto");
      }
      this.renderer.renderFrame(c);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },
  stop() { this.running = false; cancelAnimationFrame(this.raf); },
};

ImGui.Backend = Backend;
global.ImGui_ImplBrowser = Backend;
global.ImGui_ImplBrowser_Init = Backend.init.bind(Backend);
global.ImGui_ImplBrowser_Frame = Backend.frame.bind(Backend);
global.__IMGUI_BACKEND__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

})();


/* ============================================================================
 * ImGui.main.js — MAIN FILE (all includes + example menu live here)
 * ----------------------------------------------------------------------------
 * HOW THE LIBS ARE INCLUDED (https:// as requested):
 *   1. Static (preferred, Violentmonkey-native): the 7x `// @require https://...`
 *      lines in the header above point at GamebP/ImGui-JS (raw.githubusercontent,
 *      with `?v=LIB_VERSION` cache-buster). On every update: bump `@version`,
 *      `LIB_VERSION`, and the `?v=` in all 7 @require lines — new URL = new
 *      cache entry, so clients drop the old cached libs. Push this Build/
 *      folder to GitHub, reinstall the script — Violentmonkey
 *      downloads each lib ONCE at install time and runs them before this file.
 *   2. Dynamic fallback (local dev, no hosting yet): CDN_BASE below. If the
 *      @require libs are missing (fresh clone, 404), this file fetches them at
 *      runtime via <script src="https://..."> in order, then boots.
 *      For local testing run:  python3 -m http.server 8000  (in Build/)
 *      and set CDN_BASE = "http://127.0.0.1:8000/" temporarily.
 * FILES:
 *   ImGui.core.js    — context, IO, style, window Begin/End, dragging/resize
 *   ImGui.draw.js    — Canvas2D renderer (draw lists -> overlay canvas)
 *   ImGui.widgets.js  — Button/Text/Checkbox/Slider/Input/Combo/... + layout
 *   ImGui.widgets2.js — Arrow/CheckboxFlags/SliderN/VSlider/Drag/InputFloat-Int/
 *                        ColorButton-Picker/Image/Plot/LabelText/SeparatorText/...
 *   ImGui.extended.js  — ID stack, groups, disabled, style stacks, cursor/scroll,
 *                        item+mouse+key queries, tooltip, popup/modal, menubar+menu,
 *                        tabbar, tables, columns, TreeNodeEx, drag&drop, ini
 *   ImGui.demo.js      — ShowDemoWindow/ShowStyleEditor/ShowMetricsWindow
 *   ImGui.backend.js  — overlay canvas, mouse/keyboard, rAF loop, text input
 *   ImGui.main.js    — THIS FILE: includes + YOUR menu code (edit MY_MENU)
 * ============================================================================
 */
(function () {
"use strict";

const CDN_BASE = "https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/";
const LIB_VERSION = "1.0.5"; // bump on every update: also bump @version + ?v= in @require lines
const LIBS = ["ImGui.core.js", "ImGui.draw.js", "ImGui.widgets.js", "ImGui.widgets2.js", "ImGui.extended.js", "ImGui.demo.js", "ImGui.backend.js"];

function libsPresent() {
  try {
    return typeof window.ImGui !== "undefined"
      && window.__IMGUI_CORE__ && window.__IMGUI_DRAW__
      && window.__IMGUI_WIDGETS__ && window.__IMGUI_WIDGETS2__
      && window.__IMGUI_EXTENDED__ && window.__IMGUI_DEMO__ && window.__IMGUI_BACKEND__;
  } catch { return false; }
}
function loadScript(url) {
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url; s.async = false;
    s.onload = res; s.onerror = () => rej(new Error("load failed: " + url));
    document.documentElement.appendChild(s);
  });
}
async function ensureLibs() {
  if (libsPresent()) return;
  // eslint-disable-next-line no-console
  console.log("[ImGui] @require libs missing, loading from " + CDN_BASE);
  for (const f of LIBS) await loadScript(CDN_BASE + f + "?v=" + LIB_VERSION);
  if (!libsPresent()) throw new Error("ImGui libs still missing after CDN load. Host Build/ and update @require URLs.");
}

/* ============================ YOUR STATE =================================
 * Everything you want to keep between frames goes here (like C++ statics).
 */
const S = {
  showDemo: true, showMine: true, showStyle: false, showFull: true,
  counter: 0, checked: true, radio: 0,
  fval: 0.5, ival: 42, drag: 1.0,
  name: "player1", hp: 100,
  color: [0.26, 0.59, 0.98, 1],
  combo: 0, comboItems: ["ak-47", "m4a1", "awp", "deagle"],
  sel: [true, false, false],
  listIdx: 1, listItems: ["aimbot", "esp", "bunnyhop", "triggerbot", "skins"],
  progress: 0.33,
  fullOpen: { value: true },
};

/* ====================== YOUR OWN MENU — EDIT THIS ===========================
 * Runs EVERY FRAME (like C++ code between NewFrame/Render).
 * Return value is ignored; read widget return values to react.
 * Copy/paste this function to make more menus.
 */
function MY_MENU() {
  const ImGui = window.ImGui;
  // Window #1 — your custom menu. Rename "My Menu" to anything.
  ImGui.SetNextWindowSize(340, 0); // width 340, height 0 = auto-fit
  const w = ImGui.Begin("My Menu ❤", S.showMine ? true : false);
  S.showMine = w.open !== false;
  if (w.visible) {
    ImGui.Text("Hello from your menu! Edit MY_MENU() in ImGui.main.js");
    ImGui.TextColored([0.4, 1, 0.4, 1], "FPS-style text: green = good");
    ImGui.Separator();

    // --- button: returns true ONLY on click ---
    if (ImGui.Button("Clicked: " + S.counter)) S.counter++;
    ImGui.SameLine();
    if (ImGui.SmallButton("Reset")) S.counter = 0;

    // --- checkbox: returns {changed, checked} ---
    const c = ImGui.Checkbox("Enable ESP", S.checked);
    S.checked = c.checked;
    if (c.changed) console.log("[menu] esp =", S.checked);

    // --- sliders ---
    S.fval = ImGui.SliderFloat("Speed", S.fval, 0, 2).value;
    S.ival = ImGui.SliderInt("Amount", S.ival, 0, 100).value;
    S.drag = ImGui.DragFloat("Multiplier", S.drag, 0.02).value;

    // --- text input (click box, type, click outside to commit) ---
    S.name = ImGui.InputText("Name", S.name).text;

    // --- color (click swatch -> native picker) ---
    const ce = ImGui.ColorEdit4("ESP color", S.color);
    // NOTE: native <input type=color> fires async; poll each frame:
    if (ce.changed) S.color = ce.color;

    // --- combo ---
    const cb = ImGui.Combo("Weapon", S.combo, S.comboItems);
    if (cb.changed) { S.combo = cb.index; console.log("[menu] weapon =", S.comboItems[S.combo]); }

    // --- collapsible section ---
    if (ImGui.CollapsingHeader("Features")) {
      for (let i = 0; i < 3; i++) {
        if (ImGui.Selectable("feature_" + i + (S.sel[i] ? " [on]" : " [off]"), S.sel[i]))
          S.sel[i] = !S.sel[i];
      }
    }
    ImGui.Separator();
    ImGui.TextWrapped("Tip: drag the title bar to move, corner grip to resize, double-click title to collapse.");
  }
  ImGui.End();
}

/* ==================== DEMO WINDOW (reference examples) ===================== */
function DEMO_WINDOW(dt) {
  const ImGui = window.ImGui;
  ImGui.SetNextWindowPos(40, 60, ImGui.Cond.FirstUseEver);
  ImGui.SetNextWindowSize(360, 0);
  const w = ImGui.Begin("Dear ImGui Demo (JS port)", S.showDemo ? true : false);
  S.showDemo = w.open !== false;
  if (w.visible) {
    ImGui.Text("Port of imgui-1.92.9b window system to Canvas2D.");
    ImGui.TextColored([0.6, 0.8, 1, 1], "v" + ImGui.VERSION);
    if (ImGui.Button("Toggle my menu")) S.showMine = !S.showMine;
    ImGui.SameLine();
    if (ImGui.Button("Style: dark")) console.log("[imgui] dark theme active");
    ImGui.Separator();
    if (ImGui.CollapsingHeader("Widgets")) {
      const t = ImGui.InputText("HP", String(S.hp)); S.hp = parseInt(t.text) || 0;
      ImGui.ProgressBar(S.progress, "progress " + Math.round(S.progress * 100) + "%");
      S.progress += dt * 0.05; if (S.progress > 1) S.progress = 0;
      const lb = ImGui.ListBox("Cheats", S.listIdx, S.listItems, 4);
      if (lb.changed) S.listIdx = lb.index;
    }
    if (ImGui.CollapsingHeader("Layout")) {
      ImGui.Text("SameLine example:");
      if (ImGui.Button("A")) console.log("A");
      ImGui.SameLine(); if (ImGui.Button("B")) console.log("B");
      ImGui.SameLine(); if (ImGui.Button("C")) console.log("C");
      ImGui.Separator();
      if (ImGui.TreeNode("Child window")) {
        if (ImGui.BeginChild("log", 0, 80, true)) {
          ImGui.TextWrapped("BeginChild/EndChild gives you a bordered sub-panel. Put logs, player lists, console output here.");
          ImGui.BulletText("line 1: hello");
          ImGui.BulletText("line 2: world");
        }
        ImGui.EndChild();
        ImGui.TreePop();
      }
    }
    if (ImGui.CollapsingHeader("Help: change the menu live")) {
      ImGui.TextWrapped("1) Open Violentmonkey dashboard -> this script -> edit MY_MENU(). 2) Save, page auto-reruns. No rebuild needed — widgets are immediate-mode.");
      ImGui.Spacing();
      if (ImGui.Button("Hide demo")) S.showDemo = false;
    }
  }
  ImGui.End();
}

/* ================================ BOOT ==================================== */
async function boot() {
  await ensureLibs();
  const ImGui = window.ImGui;
  ImGui.CreateContext();
  ImGui.Backend.init({ zIndex: 2147483646 });
  // wait a tick so DisplaySize is correct, then start frame loop
  ImGui.Backend.frame((c) => {
    const dt = c.io.DeltaTime;
    MY_MENU();      // <-- your menu
    DEMO_WINDOW(dt); // <-- reference demo (set S.showDemo=false to hide)
    if (S.showFull) ImGui.ShowDemoWindow(S.fullOpen); // <-- FULL port demo (tabs/tables/popups/plots)
    if (!S.fullOpen.value) S.showFull = false;
  });
  console.log("%c[ImGui]%c port ready — edit MY_MENU() in ImGui.main.js",
    "background:#1d4ed8;color:#fff;padding:2px 6px;border-radius:4px", "color:inherit");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot().catch(console.error));
else boot().catch(console.error);
})();
