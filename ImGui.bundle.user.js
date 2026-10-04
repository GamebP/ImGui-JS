// ==UserScript==
// @name         ImGui Browser Port — Bundle (one-click install)
// @namespace    https://github.com/GamebP/ImGui-JS
// @version      1.0.42
// @description  Dear ImGui 1.92.9b window system ported to Violentmonkey — single-file bundle, no hosting needed. Drag windows, edit MY_MENU to build your own menu.
// @match        *://example.com/*
// @noframes
// @grant        none
// @run-at       document-idle
// @downloadURL   https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.bundle.user.js
// @updateURL     https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.bundle.user.js
// ==/UserScript==
/* BUNDLE: ImGui.core.js + animate + draw + widgets + widgets2 + extended + demo + notify + backend + main.js body.
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

const IMGUI_VERSION = "1.92.9b-js-port-1.0.42";

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
  // Canvas overlays sit above arbitrary webpage content; fully opaque window
  // fills prevent high-contrast page text from bleeding through the demo UI.
  C[Col.WindowBg] = colF(0.06, 0.06, 0.06, 1);
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
globalThis.__IMGUI_WINSEQ__ = 1;
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
    this._scrollY = 0; this._scrollMaxX = 0; this._scrollMaxY = 0;
    this._nextBgAlpha = 1;
    this._nextScroll = null; this._nextContentSize = null;
    this.z = ++__winSeq; globalThis.__IMGUI_WINSEQ__ = __winSeq;
    this._userResizedX = false;
    this._userResizedY = false;
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
    this._frameEnded = true;
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
    this._frameEnded = false;
    this._nextItemWidth = undefined; // a width set on a no-item frame must not leak
    this.windowStack.length = 0;
    this.current = null;
    this.anyWindowHovered = false;
    this._debugRects.length = 0;
    this.hoveredId = this.activeId !== 0 ? this.hoveredId : 0;
    io.WantTextInput = (this.activeKind === "text" || this.activeKind === "segtext");
  }
  endFrame() {
    const io = this.io;
    io.WantCaptureMouse = this.anyWindowHovered || this.activeId !== 0;
    // Modal popups own the ENTIRE screen and open popups own their rect:
    // the page behind the (pointer-events:none) canvas must never receive
    // those clicks, or it selects text / follows links "through" the modal
    // dimmer even though no canvas widget reacts.
    if (this._activeModalRect) {
      io.WantCaptureMouse = true;
    } else if (this._popupStack && this._popupStack.length && this._popupRectsPrev) {
      for (const k of this._popupStack) {
        const r = this._popupRectsPrev[k];
        if (r && io.MousePos.x >= r.x && io.MousePos.x <= r.x + r.w && io.MousePos.y >= r.y && io.MousePos.y <= r.y + r.h) { io.WantCaptureMouse = true; break; }
      }
    }
    // Safety: kill ghost drag payloads if the release happened off-window.
    if (this._dd && !io.MouseDown[0]) this._dd = null;
    io.WantCaptureKeyboard = (this.activeKind === "text" || this.activeKind === "segtext");
    io.MouseWheel = 0;
    io.InputChars = "";
    for (let b = 0; b < 5; b++) { io.MouseClicked[b] = false; io.MouseReleased[b] = false; }
    this._frameEnded = true;
  }
  findOrCreate(name, flags) {
    let w = this.windows.get(name);
    if (!w) { w = new ImGuiWindow(name, flags); this.windows.set(name, w); this.applyNext(w, true); }
    return w;
  }
  applyNext(w, first) {
    const n = this.nextData;
    if (!n) return;
    w._nextApplied = w._nextApplied || { pos: false, size: false, collapsed: false };
    const applies = (cond, field) => cond === Cond.Always ||
      (cond === Cond.Once && !w._nextApplied[field]) ||
      (cond === Cond.FirstUseEver && first) ||
      (cond === Cond.Appearing && w.appearing);
    if (n.pos && applies(n.posCond, "pos")) {
      w.pos = { ...n.pos };
      if (n.posCond === Cond.Once) w._nextApplied.pos = true;
    }
    // Auto (0) dims keep the live sizeFull: copying a 0 height/width into
    // sizeFull collapses the window for the rest of the frame (dead hover,
    // dead wheel scroll, 0-height hit area) until End() recomputes it.
    if (n.size && applies(n.sizeCond, "size")) {
      w.size = { ...n.size };
      w.sizeFull = {
        x: n.size.x > 0 ? n.size.x : w.sizeFull.x,
        y: n.size.y > 0 ? n.size.y : w.sizeFull.y,
      };
      if (n.sizeCond === Cond.Once) w._nextApplied.size = true;
    }
    if (n.collapsed !== undefined && applies(n.collapsedCond, "collapsed")) {
      w.collapsed = n.collapsed;
      if (n.collapsedCond === Cond.Once) w._nextApplied.collapsed = true;
    }
    if (n.focus === true) { w.z = ++__winSeq; globalThis.__IMGUI_WINSEQ__ = __winSeq; } // raise window below capture
    if (n.scroll && n.scroll.y !== undefined) w.scrollY = Math.max(0, n.scroll.y);
    if (n.contentSize) { w._nextContentSize = n.contentSize; }
    if (n.bgAlpha !== undefined) w._bgAlpha = n.bgAlpha;
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
  setNextWindowFocus(name = '') {
    this.nextData = this.nextData || {};
    this.nextData.focus = true;
  }
  setNextWindowScroll(x, y) {
    this.nextData = this.nextData || {};
    this.nextData.scroll = { x, y };
  }
  setNextWindowContentSize(w, h) {
    this.nextData = this.nextData || {};
    this.nextData.contentSize = { x: w, y: h };
  }
  setNextWindowBgAlpha(a) {
    this.nextData = this.nextData || {};
    this.nextData.bgAlpha = a;
  }
  // -- Begin/End (cf. imgui.cpp:7527-8387, simplified) --
  begin(name, pOpen = null, flags = 0) {
    const io = this.io, st = this.style;
    const w = this.findOrCreate(name, flags);
    if (pOpen !== null && pOpen !== undefined) w.open = !!pOpen;
    this.applyNext(w, false);
    this.nextData = null;
    w.flags = flags;
    w.z = ++__winSeq; globalThis.__IMGUI_WINSEQ__ = __winSeq;
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
    w.contentHover = inWin && !this._activeModalRect; // modal locks wheel/right-click below it
    // title-bar interactions: drag-move, double-click collapse, close btn
    const barH = w.titleH;
    const inTitle = barH > 0 && m.x >= w.pos.x && m.x <= w.pos.x + w.sizeFull.x &&
                    m.y >= w.pos.y && m.y <= w.pos.y + barH;
    const moveId = (w.id ^ 0x9e3779b9) >>> 0;
    const closeId = (w.id ^ 0xc0ffee) >>> 0;
    const collapseId = (w.id ^ 0xc011a9) >>> 0;
    if (!(flags & WindowFlags.NoMouseInputs)) {
      // close button zone (right side of title)
      if (!this._activeModalRect && w.open !== null && w.open !== undefined && inTitle) {
        const cs = 16, cx = w.pos.x + w.sizeFull.x - 8 - cs, cy = w.pos.y + (barH - cs) / 2;
        if (m.x >= cx && m.x <= cx + cs && m.y >= cy && m.y <= cy + cs) {
          this.hoveredId = closeId;
          if (io.MouseClicked[0]) { w.open = false; io.MouseDown[0] = false; io._prevDown[0] = false; }
        }
      }
      // collapse on double-click title (approx: two clicks within 400ms)
      if (!this._activeModalRect && inTitle && !(flags & WindowFlags.NoCollapse)) {
        if (io.MouseClicked[0]) {
          const now = performance.now();
          if (now - (w._lastTitleClick || 0) < 400) w.collapsed = !w.collapsed;
          w._lastTitleClick = now;
        }
      }
      // move drag (suppressed while a popup owns the click)
      if (inTitle && !(flags & WindowFlags.NoMove) && io.MouseClicked[0] && this.activeId === 0 && !this._suppressChrome && !this._activeModalRect) {
        // ignore clicks on close box
        const cs = 16, cx = w.pos.x + w.sizeFull.x - 8 - cs;
        if (w.open === null || w.open === undefined || m.x < cx) {
          this.activeId = moveId; this.activeKind = "move";
          this.activePayload = { win: w, dx: m.x - w.pos.x, dy: m.y - w.pos.y };
        }
      }
      // resize drag (bottom-right grip 18px; suppressed while popup owns click)
      if (!(flags & WindowFlags.NoResize) && !w.collapsed && this.activeId === 0 && !this._suppressChrome && !this._activeModalRect) {
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
        const maxW = Math.max(st.WindowMinSize.x, this.io.DisplaySize.x - w.pos.x);
        const maxH = Math.max(80, this.io.DisplaySize.y - w.pos.y);
        w.sizeFull.x = Math.max(st.WindowMinSize.x, Math.min(maxW, m.x - w.pos.x));
        w.sizeFull.y = Math.max(80, Math.min(maxH, m.y - w.pos.y));
        // A user resize turns an auto-fit dimension into a fixed live size;
        // otherwise End() immediately restores the content height each frame.
        w.size.x = w.sizeFull.x;
        w.size.y = w.sizeFull.y;
        w._userResizedX = true;
        w._userResizedY = true;
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
    // Layout runs in window-local content space (0..contentH); scrolling is a
    // pure render/input translation, never a cursor offset (cf. imgui.cpp
    // Begin/End: DC.CursorPos = WorkRect.Min - Scroll). So content height is a
    // scroll-invariant measurement taken straight from cursorMaxPos.
    const contentTop = w.pos.y + w.titleH + w.padding.y;
    const contentH = Math.max(0, (w.dc.cursorMaxPos.y - contentTop) + w.padding.y);
    if (w.collapsed) {
      w.sizeFull.y = w.titleH + 2;
    } else if (!w._userResizedY && (w.size.y === 0 || (w.flags & WindowFlags.AlwaysAutoResize))) {
      w.sizeFull.y = Math.max(60, w.titleH + w.padding.y * 2 + contentH);
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
    // MODAL LOCK: while a modal popup is open, only items inside the popup
    // box stack (the modal's own content) may hover or claim input. Every
    // window evaluated earlier in the frame has an empty box stack, so it is
    // fully inert regardless of where the mouse points — this is the JS
    // equivalent of Dear ImGui's ItemHoverable() modal/Z-order check.
    if (this._activeModalRect && !(this._popupBoxStack && this._popupBoxStack.length > 0)) return false;
    const m = this.io.MousePos;
    const w = this.current;
    const comboRect = this._comboRect;
    if (comboRect && m.x >= comboRect.x && m.x <= comboRect.x + comboRect.w && m.y >= comboRect.y && m.y <= comboRect.y + comboRect.h) return false;
    // MENU PREEMPTION: open menu dropdowns own their rect; underlying
    // widgets must not hover/click there (except the menu's own items).
    if (this._popupRectsPrev) for (const k of Object.keys(this._popupRectsPrev)) {
      if (k.charCodeAt(0) !== 109 || k.slice(0, 5) !== "menu:") continue;
      const r = this._popupRectsPrev[k];
      if (r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) return false;
    }
    // POPUP PREEMPTION: open popups own their screen rect (known from the
    // previous frame) — widgets beneath, drawn or hit-tested outside popup
    // content, must not hover or click there (e.g. a color-picker popup
    // overlapping a combo must not highlight the combo behind it).
    if (!(this._popupBoxStack && this._popupBoxStack.length > 0) && this._popupRectsPrev && this._popupStack && this._popupStack.length) {
      for (const k of this._popupStack) {
        const r = this._popupRectsPrev[k];
        if (r && m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) return false;
      }
    }
    // Items register at natural content coordinates, but the canvas is drawn
    // translated by -scrollY. Translate the raw mouse position into that same
    // content space so hit-testing matches the scrolled visuals 1:1. The
    // adjustment is only valid when the pointer is inside the window viewport
    // (a pointer elsewhere must not hit clipped-away content).
    let mouseY = m.y;
    if (w && w.scrollY && !w.dc._inPopup) {
      const top = w.pos.y + w.titleH;
      const bot = w.pos.y + w.sizeFull.y;
      if (m.y >= top && m.y <= bot) mouseY += w.scrollY;
    }
    return m.x >= x && m.x <= x + wd && mouseY >= y && mouseY <= y + ht;
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

function GetVersion() { return IMGUI_VERSION; }
function NewFrame(dt) { GetContext().newFrame(dt); }
function EndFrame() { GetContext().endFrame(); }
function Render() {
  const c = GetContext();
  if (c._frameEnded !== true) c.endFrame();
  // Finalization marker is maintained by ImGuiContext; Render does not draw.
}
function DestroyContext() { _ctx = null; }
function destroyContext() { DestroyContext(); _ctx = null; }
function GetCurrentContext() { return _ctx; }
function SetCurrentContext(ctx) { _ctx = ctx; return _ctx; }

const ImGuiBase = {
  VERSION: IMGUI_VERSION, WindowFlags, Cond, Col,
  hashStr, findRenderedTextEnd, colToCss, lerpCol, applyStyleDark,
  CreateContext, GetContext, GetIO, GetStyle, SetDebugMode, IsDebugMode,
  GetVersion, NewFrame, EndFrame, Render, DestroyContext, GetCurrentContext, SetCurrentContext,
  destroyContext,
  ImGuiWindow, ImGuiContext,
};

global.ImGui = global.ImGui || {};
Object.assign(global.ImGui, ImGuiBase);
global.__IMGUI_CORE__ = true;

})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__ANIMATE__*/
/* ImGui Browser Port — Animation Driver
 * Ported from Half-People/HImGuiAnimation (Apache-2.0) — HAnimationSystem:
 * keyframe sequencer (keys/frames, linear + bezier interpolation, Play/Stop,
 * loop, delta-time manager update). Deviations from upstream are marked SAFE:
 * pointer handles become JS objects, out-of-range key lookups clamp instead of
 * reading out of bounds.
 * Adds an immediate-mode tween layer (Ease + ID-keyed Float/Color) used for
 * widget hover/active transitions. Requires: ImGui.core.js.
 * License of this port: MIT. Upstream HImGuiAnimation is Apache-2.0 by HalfPeople.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");

// ---------- easing (JS-side helper for micro-transitions) ----------
const Ease = {
  Linear: (t) => t,
  InQuad: (t) => t * t,
  OutQuad: (t) => t * (2 - t),
  InOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  InCubic: (t) => t * t * t,
  OutCubic: (t) => { t--; return t * t * t + 1; },
  InOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  OutBack: (t) => { const s = 1.70158; t--; return t * t * ((s + 1) * t + s) + 1; },
};

// ---------- PlayerCallBack (ported 1:1 from HImGuiAnimation.h/.cpp) ----------
function GetInterpolationInfoFromKeys(keys, frame) {
  // upper_bound(keys, frame): first index with keys[i] > frame.
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= frame) lo = mid + 1; else hi = mid; }
  let lastOneKey = lo, previousKey = lo - 1;
  let alpha = 0;
  // SAFE: upstream indexes values out of range here; clamp instead.
  if (lastOneKey >= keys.length) { lastOneKey = keys.length - 1; previousKey = keys.length - 1; alpha = 1; }
  else if (previousKey < 0) { previousKey = 0; alpha = 0; }
  else {
    const mx = keys[lastOneKey], mn = keys[previousKey];
    if (mx !== mn) alpha = (frame - mn) / (mx - mn);
  }
  return { PreviousKey: previousKey, LastOneKey: lastOneKey, alpha };
}
function LinearInterpolation(a, b, alpha) { return a + (b - a) * alpha; }
function SimpleBezierInterpolation(a, b, alpha) {
  const u = 1.0 - alpha, tt = alpha * alpha, uu = u * u;
  return (uu * u) * a + (tt * alpha) * b;
}
function CubicBezierInterpolation(a, control_point_a, control_point_b, b, alpha) {
  const offset = a + (b - a);
  const ca = offset * control_point_a, cb = offset * control_point_b;
  const u = 1.0 - alpha, tt = alpha * alpha, uu = u * u;
  const uuu = uu * u, ttt = tt * alpha;
  return uuu * a + 3.0 * uu * alpha * ca + 3.0 * u * tt * cb + ttt * b;
}
function StringInterpolation(fullString, alpha) {
  return fullString.substr(0, Math.floor(fullString.length * alpha));
}

// ---------- AnimationSequence + manager (ported from HImGuiAnimation.cpp) ----------
const Sequences = [];
function seqUpdata(seq, delta_time) {
  if (!seq.Playing) return;
  const buff = delta_time * (seq.info.speed * 100);
  seq.info.CurrentFrame += buff;
  if (seq.info.CurrentFrame >= seq.info.MaxFrame) {
    if (seq.info.IsLoop) seq.info.CurrentFrame = 0;
    else { seq.Stop(); return; }
  }
  seq.info.callback(seq.info.CurrentFrame, seq.info.data);
}
function makeSequence(fps, data, speed, maxFrame, isLoop, callback) {
  const seq = {
    Playing: true,
    info: {
      callback, data, speed, MaxFrame: maxFrame, IsLoop: !!isLoop,
      CurrentFrame: 0, FPS_delta_time: fps > 0 ? 1.0 / fps : 0,
      _buf: 0,
    },
    Stop() {
      const i = Sequences.indexOf(seq);
      if (i >= 0) Sequences.splice(i, 1);
      seq.Playing = false;
    },
    Pause() { seq.Playing = false; },
    Play() { seq.Playing = true; },
    IsPlaying() { return seq.Playing; },
  };
  return seq;
}
function Play(callback, maxFrame, data = null, opts = {}) {
  const speed = opts.speed !== undefined ? opts.speed : 1;
  for (const s of Sequences) {
    if (s.info.callback === callback && s.info.data === data) return s; // dedup (upstream)
  }
  const fps = opts.fps !== undefined ? opts.fps : 60;
  const seq = makeSequence(fps, data, speed, maxFrame, !!opts.loop, callback);
  Sequences.push(seq);
  return seq;
}
let _updataBuf = 0;
function updata(delta_time, maxFPS) {
  if (maxFPS !== undefined) {
    // Manager FPS gate (upstream updata(dt, MaxFPS)).
    if (_updataBuf > 1.0 / maxFPS) {
      for (const s of Sequences.slice()) seqUpdata(s, delta_time);
      _updataBuf = 0;
    } else _updataBuf += delta_time;
    return;
  }
  for (const s of Sequences.slice()) {
    if (s.info.FPS_delta_time) {
      s.info._buf += delta_time;
      if (s.info._buf > s.info.FPS_delta_time) {
        seqUpdata(s, s.info._buf);
        s.info._buf = 0;
      }
    } else seqUpdata(s, delta_time);
  }
}

// ---------- immediate-mode tween layer (ID-keyed, for widget transitions) ----------
const _tweens = new Map(); // id -> { current, start, target, t }
function animateFloat(id, targetValue, speed = 0.15, easeFn = Ease.OutQuad) {
  const dt = (ImGui.GetIO() && ImGui.GetIO().DeltaTime) || (1 / 60);
  let s = _tweens.get(id);
  if (!s) {
    s = { current: targetValue, start: targetValue, target: targetValue, t: 1.0 };
    _tweens.set(id, s);
    return targetValue;
  }
  if (s.target !== targetValue) { s.start = s.current; s.target = targetValue; s.t = 0.0; }
  if (s.t < 1.0) {
    s.t = Math.min(1.0, s.t + dt / Math.max(0.001, speed));
    s.current = s.start + (s.target - s.start) * easeFn(s.t);
  } else s.current = s.target;
  return s.current;
}
function animateColor(id, targetCol, speed = 0.15, easeFn) {
  const e = easeFn || Ease.OutQuad;
  return [
    animateFloat(id + "##_r", targetCol[0], speed, e),
    animateFloat(id + "##_g", targetCol[1], speed, e),
    animateFloat(id + "##_b", targetCol[2], speed, e),
    animateFloat(id + "##_a", targetCol[3] !== undefined ? targetCol[3] : 1.0, speed, e),
  ];
}

ImGui.Animation = {
  Ease,
  PlayerCallBack: {
    GetInterpolationInfoFromKeys,
    LinearInterpolation,
    SimpleBezierInterpolation,
    CubicBezierInterpolation,
    StringInterpolation,
  },
  Play,
  updata,
  Sequences,
  Float: (id, target, speed, ease) => animateFloat(id, target, speed, ease),
  Color: (id, target, speed, ease) => animateColor(id, target, speed, ease),
};

global.__IMGUI_ANIMATE__ = true;
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
      case "circle": // AddCircle: stroke-only ring (notify icons emit this)
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.beginPath(); ctx.arc(op.x, op.y, Math.max(0.1, op.r), 0, Math.PI * 2); ctx.stroke();
        break;
      case "bezierCubic":
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(op.p1.x, op.p1.y);
        ctx.bezierCurveTo(op.p2.x, op.p2.y, op.p3.x, op.p3.y, op.p4.x, op.p4.y); ctx.stroke();
        break;
      case "bezierQuad":
        ctx.strokeStyle = op.css || css(op.col); ctx.lineWidth = op.th || 1;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(op.p1.x, op.p1.y);
        ctx.quadraticCurveTo(op.p2.x, op.p2.y, op.p3.x, op.p3.y); ctx.stroke();
        break;
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
    c.activeId = id; c.activeKind = "text";
    c.activePayload = { value: String(text || ""), cursorPos: String(text || "").length, commit: false, multiline: true };
    if (ImGui._backendFocusText) ImGui._backendFocusText(c.activePayload.value, (nv) => { if (c.activePayload) c.activePayload.value = nv; });
  }
  let deactivated = false, finalVal = String(text || "");
  if (isActive && ((c.io.MouseClicked[0] && !h) || (c.activePayload && c.activePayload.commit))) {
    finalVal = c.activePayload ? c.activePayload.value : String(text || "");
    c.activeId = 0; c.activeKind = null; c.activePayload = null;
    if (ImGui._backendBlurText) ImGui._backendBlurText();
    deactivated = true;
  }
  const activeNow = isActive && !deactivated;
  let currentVal = activeNow && c.activePayload ? c.activePayload.value : String(text || "");
  if (activeNow && c.io.InputChars) { currentVal += c.io.InputChars; if (c.activePayload) c.activePayload.value = currentVal; }
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
function Combo(label, current, items, a, b) {
  // C++ overloads: items as "A\0B\0C\0\0" string, or (getter, userData, count).
  if (typeof items === "string") items = items.split("\0").filter((s) => s.length > 0);
  else if (typeof items === "function") {
    const getter = items, userData = a, count = b | 0;
    const arr = [];
    for (let i = 0; i < count; i++) arr.push(String(getter(userData, i)));
    items = arr;
  }
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
function Selectable(label, selected = false, flags = 0, sizeArg) {
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
  emit({ t: "text", str: ImGui.findRenderedTextEnd(label), x: x + 8, y: y + 3, col: st.Colors[disabled ? ImGui.Col.TextDisabled : ImGui.Col.Text] });
  if (bb.pressed && !(flags & ((F.DontClosePopups || 0) | (F.NoAutoClosePopups || 0)))) {
    if (c._popupBoxStack && c._popupBoxStack.length && ImGui.CloseCurrentPopup) ImGui.CloseCurrentPopup();
    else if (c.comboOpen) c.comboOpen = 0;
  }
  return bb.pressed && !disabled;
}
const SelectableFlags = { DontClosePopups: 1 << 0, NoAutoClosePopups: 1 << 0, SpanAllColumns: 1 << 1, AllowDoubleClick: 1 << 2, Disabled: 1 << 3, AllowOverlap: 1 << 4, Highlight: 1 << 5 };
function ListBox(label, current, items, hItems = 4) {
  Text(label);
  let idx = current, changed = false;
  // Exact metrics: child inner top pad 6 + rows of 20px Selectables joined by
  // 4px ItemSpacing + 6px bottom pad. Always fit ALL items: fixed-height
  // children clip (no child scrolling yet), so honoring hItems by shrinking
  // would strand items unreachable. hItems stays for API compatibility.
  const c = ctx();
  const rowH = 20, gapY = c.style.ItemSpacing.y, padY = 12;
  const targetH = padY + items.length * rowH + Math.max(0, items.length - 1) * gapY;
  if (BeginChild(label + "##box", 0, targetH, true)) {
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
  const b = st ? st.bounds : undefined;
  // If the content overflowed the requested box (items leak above the border),
  // grow the box + border to fit before wrapping the inner ops — otherwise
  // the overflow would clip silently and the parent cursor wouldn't advance.
  let boxH = st ? st.bounds.h : 0;
  if (st && !st.fixedH) {
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
    const boxH = st.bounds.h;
    // Snap: the parent continues exactly below the child's OUTER box.
    // Never Math.max with the live cursor — clipped child content (or a
    // clipper tail reservation at ~200000px) must not leak into the parent.
    w.dc.cursorPos.x = b.x;
    w.dc.cursorPos.y = b.y + boxH + c.style.ItemSpacing.y;
    w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.lastItemWidth = 0; w.dc.lastItemHeight = 0;
    w.dc.cursorMaxPos.y = Math.max(st.parentMaxPosY || 0, b.y + boxH);
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
  BeginCombo, EndCombo, Combo, Selectable, SelectableFlags, ListBox, ProgressBar,
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
  c.beforeItemPlacement(0, 16);
  const bw = contentAvail();
  const x = w.dc.cursorPos.x, y = w.dc.cursorPos.y;
  const tw = measure(label);
  // Centered section header: label mid-width, separator lines on both sides.
  const tx = Math.round(x + (bw - tw) / 2);
  const lineY = Math.round(y + 16 / 2);
  emit({ t: "text", str: label, x: tx, y: y + 1, col: st.Colors[ImGui.Col.Text] });
  if (tx - x > 10) emit({ t: "line", x1: x, y1: lineY, x2: tx - 6, y2: lineY, col: st.Colors[ImGui.Col.Separator], th: 1 });
  emit({ t: "line", x1: tx + tw + 6, y1: lineY, x2: x + bw, y2: lineY, col: st.Colors[ImGui.Col.Separator], th: 1 });
  c.itemSize(bw, 16);
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
  // Chrome (window close/move/resize) and menu-bar toggles, tabs and menu
  // items stay interactive — the suppression is only for *content* widgets.
  return false;
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
  c._clipboardText = '';
  c._childStack = []; // ImGuiChildStack (shared by widgets.js + widgets2.js)
  }
  // Per-frame rollover: last frame's popup rects become the preemption map.
  // Runs on every ensure() (c.frame bumps in newFrame before any widget).
  if (c._popupRolloverFrame !== c.frame) {
    c._popupRolloverFrame = c.frame;
    c._popupRectsPrev = c._popupRects || {};
    c._popupRects = {};
    // Reset overlay ops at frame start so no stale modal dim/popup frames
    // persist after the popup closes (ghost dim artifact).
    c._overlayOps = [];
    // MODAL LOCK — authoritative recompute at frame start, before ANY window
    // evaluates. A modal that was open last frame re-registers its screen
    // rect, so windows earlier in the frame loop than the modal's host are
    // already locked out. Closed modal => null (input flows again).
    c._activeModalRect = null;
    for (let i = c._popupStack.length - 1; i >= 0; i--) {
      const r = c._popupRectsPrev[c._popupStack[i]];
      if (r && r.modal) { c._activeModalRect = { x: r.x, y: r.y, w: r.w, h: r.h }; break; }
    }
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
    c._suppressChrome = popupConsumesClick() || Object.values(c._menuOpen || {}).some(Boolean);
    const r = origBegin.call(this, name, pOpen, flags);
    const w = this.current;
    if (w) {
      if (w.scrollY === undefined) w.scrollY = 0;
      if (w.scrollMax === undefined) w.scrollMax = 0;
      const noScroll = (w.flags & ImGui.WindowFlags.NoScrollbar) || (w.flags & ImGui.WindowFlags.NoScrollWithMouse);
      // wheel scroll when hovered (content taller than view); content renders
      // translated by -scrollY in draw.js and is clipped to the viewport.
      if (!noScroll && w.scrollMax > 0 && w.contentHover && !w.collapsed && this.io.MouseWheel !== 0 && (this.activeKind !== "slider" && this.activeKind !== "drag" && this.activeKind !== "scroll" && this.activeKind !== "move" && this.activeKind !== "resize")) {
        w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY - this.io.MouseWheel * (this.style.FontSize * 2)));
      }
      // scrollbar grip drag (uses raw viewport coordinates)
      if (!noScroll && w.scrollMax > 0 && !w.collapsed && w._scrollGrip) {
        const g = w._scrollGrip;
        if (this.activeId === g.id && this.activeKind === "scroll") {
          const m = this.io.MousePos;
          const deltaY = m.y - (this.activePayload && this.activePayload.startMouseY || m.y);
          const scrollDelta = deltaY * (w.scrollMax / Math.max(1, g.bh - g.gripH));
          const startScrollY = this.activePayload ? this.activePayload.startScrollY : w.scrollY;
          w.scrollY = Math.max(0, Math.min(w.scrollMax, startScrollY + scrollDelta));
          if (!this.io.MouseDown[0]) { this.activeId = 0; this.activeKind = null; this.activePayload = null; }
        }
      }
      return r;
    }
    return r;
  };
  Proto.end = function () {
    const w = this.current;
    // Chrome ops (scrollbar) draw unclipped after content; reset per frame.
    if (w) w._chromeOps = [];
    origEnd.call(this);
    // Tab row growth (stored by EndTabBar): applied after core End so the
    // size.x reset cannot clobber it. Consumed every frame. Never grows the
    // window past the viewport edge.
    if (w && w._tabExpandW) {
      const maxW = Math.max(80, this.io.DisplaySize.x - w.pos.x - 8);
      if (w._tabExpandW > w.sizeFull.x) w.sizeFull.x = Math.min(w._tabExpandW, maxW);
      w._tabExpandW = 0;
    }
    if (w && w.collapsed) { w.scrollMax = 0; w.scrollY = 0; }
    // Fixed-height windows: overflow becomes a scrollable range (pure
    // content-space measurement, no scroll offset involved).
    if (w && !w.collapsed && w.size.y > 0 && !(w.flags & ImGui.WindowFlags.AlwaysAutoResize)) {
      const contentTop = w.pos.y + w.titleH + w.padding.y;
      const contentH = Math.max(0, (w.dc.cursorMaxPos.y - contentTop) + w.padding.y);
      const visibleH = Math.max(0, w.sizeFull.y - w.titleH - w.padding.y * 2);
      w.scrollMax = Math.max(0, contentH - visibleH);
      w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
    }
    // Auto-fit windows (size.y == 0) grow unbounded by default. Clamp to the
    // viewport so content can never flow off-screen: the excess becomes
    // scrollable instead of overflowing past the taskbar.
    if (w && !w.collapsed && (w.size.y === 0 || (w.flags & ImGui.WindowFlags.AlwaysAutoResize))) {
      const margin = 20; // keep 20px above the browser edge/taskbar
      const maxH = Math.max(80, this.io.DisplaySize.y - w.pos.y - margin);
      if (w.sizeFull.y > maxH) {
        const contentTop = w.pos.y + w.titleH + w.padding.y;
        const contentH = Math.max(0, (w.dc.cursorMaxPos.y - contentTop) + w.padding.y);
        w.sizeFull.y = maxH;
        w.scrollMax = Math.max(0, contentH - (maxH - w.titleH - w.padding.y * 2));
        w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
      } else {
        w.scrollMax = 0; w.scrollY = 0;
      }
    }
    // draw scrollbar when needed (unclipped chrome, drawn after content)
    if (w && w.scrollMax > 0 && !w.collapsed && !(w.flags & ImGui.WindowFlags.NoScrollbar)) {
      const st = this.style;
      const bx = w.pos.x + w.sizeFull.x - st.ScrollbarSize - 1;
      const by = w.pos.y + w.titleH, bh = w.sizeFull.y - w.titleH - 1;
      (w._chromeOps = w._chromeOps || []).push({ t: "rectFilled", x: bx, y: by, w: st.ScrollbarSize, h: bh, r: 7, col: st.Colors[ImGui.Col.ScrollbarBg] });
      const gripH = Math.max(st.GrabMinSize, bh * (bh / (bh + w.scrollMax)));
      const gy = by + (bh - gripH) * (w.scrollMax > 0 ? w.scrollY / w.scrollMax : 0);
      const gid = (w.id ^ 0x5c4011) >>> 0;
      // Grip lives in raw viewport space (never scrolled), and this.current is
      // already the parent window here, so hit-test against raw mouse coords.
      const mm = this.io.MousePos;
      const hov = !this._activeModalRect && mm.x >= bx && mm.x <= bx + st.ScrollbarSize && mm.y >= gy && mm.y <= gy + gripH;
      if (hov) this.anyWindowHovered = true;
      if (hov && this.io.MouseClicked[0] && this.activeId === 0) {
        this.activeId = gid; this.activeKind = "scroll";
        this.activePayload = { startMouseY: this.io.MousePos.y, startScrollY: w.scrollY };
      }
      w._scrollGrip = { id: gid, by: by, bh: bh, gripH: gripH };
      const active = this.activeId === gid;
      w._chromeOps.push({ t: "rectFilled", x: bx, y: gy, w: st.ScrollbarSize, h: gripH, r: 7, col: st.Colors[active || hov ? ImGui.Col.ScrollbarGrabHovered : ImGui.Col.ScrollbarGrab] });
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
    if (r.pressed && (this._popupBoxStack || []).length === 0) {
      if (this._swallowNextPress === this.frame) { r.pressed = false; this._swallowNextPress = 0; } // click that dismissed a popup is consumed
      else if (this._suppressChrome) r.pressed = false;
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
function SetClipboardText(text) {
  const c = ensure();
  c._clipboardText = String(text == null ? "" : text);
  if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
    try { navigator.clipboard.writeText(c._clipboardText).catch(() => {}); } catch { /* ignore */ }
  }
}
function GetClipboardText() {
  const c = ensure();
  return c._clipboardText;
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
function GetItemRect() { const r = ensure().lastItem.rect; return r ? { ...r } : null; }

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
const StyleVar = { Alpha: 0, DisabledAlpha: 1, WindowPadding: 2, WindowRounding: 3, WindowBorderSize: 4, WindowMinSize: 5, WindowTitleAlign: 6, ChildRounding: 7, ChildBorderSize: 8, PopupRounding: 9, PopupBorderSize: 10, FramePadding: 11, FrameRounding: 12, FrameBorderSize: 13, ItemSpacing: 14, ItemInnerSpacing: 15, IndentSpacing: 16, CellPadding: 17, ScrollbarSize: 18, ScrollbarRounding: 19, GrabMinSize: 20, GrabRounding: 21, TabRounding: 22, TabBorderSize: 23, TabBarBorderSize: 24, TabBarOverlineSize: 25, TableAngledHeadersAngle: 26, TableAngledHeadersTextAlign: 27, TreeLinesSize: 28, TreeLinesRounding: 29, SeparatorTextBorderSize: 30, SeparatorTextAlign: 31, SeparatorTextPadding: 32, COUNT: 33 };
const _StyleVarNames = ["Alpha", "DisabledAlpha", "WindowPadding", "WindowRounding", "WindowBorderSize", "WindowMinSize", "WindowTitleAlign", "ChildRounding", "ChildBorderSize", "PopupRounding", "PopupBorderSize", "FramePadding", "FrameRounding", "FrameBorderSize", "ItemSpacing", "ItemInnerSpacing", "IndentSpacing", "CellPadding", "ScrollbarSize", "ScrollbarRounding", "GrabMinSize", "GrabRounding", "TabRounding", "TabBorderSize", "TabBarBorderSize", "TabBarOverlineSize", "TableAngledHeadersAngle", "TableAngledHeadersTextAlign", "TreeLinesSize", "TreeLinesRounding", "SeparatorTextBorderSize", "SeparatorTextAlign", "SeparatorTextPadding"];
function _styleVarKey(idx) { return (typeof idx === "number") ? (_StyleVarNames[idx] || ("_var" + idx)) : idx; }
function _cloneVar(v) {
  if (Array.isArray(v)) return { x: Number(v[0]) || 0, y: Number(v[1]) || 0 };
  if (v && typeof v === "object") return { x: Number(v.x) || 0, y: Number(v.y) || 0 };
  return v;
}
function PushStyleVar(idx, val) { const c = ensure(); const key = _styleVarKey(idx); c._styleVarStack.push([key, _cloneVar(c.style[key])]); c.style[key] = _cloneVar(val); }
function PushStyleVarX(idx, x) { const c = ensure(); const key = _styleVarKey(idx); const cur = c.style[key] || { x: 0, y: 0 }; c._styleVarStack.push([key, _cloneVar(cur)]); c.style[key] = { x, y: cur.y }; }
function PushStyleVarY(idx, y) { const c = ensure(); const key = _styleVarKey(idx); const cur = c.style[key] || { x: 0, y: 0 }; c._styleVarStack.push([key, _cloneVar(cur)]); c.style[key] = { x: cur.x, y }; }
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
// Layout is window-local content space; scroll is a render/input translation,
// so these take/return content coordinates with no scroll offset baked in.
function SetCursorPos(x, y) { const w = W(); if (w) { w.dc.cursorPos.x = w.pos.x + w.padding.x + x; w.dc.cursorPos.y = w.pos.y + w.titleH + w.padding.y + y; w.dc._lockFeed = true; } }
function SetCursorPosX(x) { const w = W(); if (w) { w.dc.cursorPos.x = w.pos.x + w.padding.x + x; w.dc._lockFeed = true; } }
function SetCursorPosY(y) { const w = W(); if (w) { w.dc.cursorPos.y = w.pos.y + w.titleH + w.padding.y + y; w.dc._lockFeed = true; } }
function GetCursorPos() { const w = W(); if (!w) return { x: 0, y: 0 }; return { x: w.dc.cursorPos.x - w.pos.x - w.padding.x, y: w.dc.cursorPos.y - (w.pos.y + w.titleH + w.padding.y) }; }
function GetCursorScreenPos() { const w = W(); return w ? { ...w.dc.cursorPos } : { x: 0, y: 0 }; }
function SetCursorScreenPos(x, y) { const w = W(); if (w) { w.dc.cursorPos.x = x; w.dc.cursorPos.y = y; w.dc._lockFeed = true; } }
function GetContentRegionAvail() {
  const w = W(); if (!w) return { x: 0, y: 0 };
  const c = ensure();
  const hasScrollbar = (w.scrollMax > 0) && !(w.flags & ImGui.WindowFlags.NoScrollbar);
  const scrollbarReserve = hasScrollbar ? (c.style.ScrollbarSize + 2) : 0;
  return { x: Math.max(0, w.pos.x + w.sizeFull.x - w.padding.x - scrollbarReserve - w.dc.cursorPos.x), y: Math.max(0, (w.size.y > 0 ? w.pos.y + w.sizeFull.y - w.padding.y : w.dc.cursorMaxPos.y + 200) - w.dc.cursorPos.y) };
}
function GetContentRegionMax() {
  const w = W(); if (!w) return { x: 0, y: 0 };
  return { x: w.sizeFull.x - w.padding.x * 2, y: w.sizeFull.y - w.titleH - w.padding.y * 2 };
}
function CalcTextSize(text) { return { x: measure(text), y: 16 }; }
function AlignTextToFramePadding() { const w = W(); if (w) w.dc.cursorPos.y += 4; }
// ---------- layout metrics (imgui.cpp:11834-11858; imgui_widgets.cpp:7311) ----------
function GetFontSize() { return ensure().style.FontSize; }
function GetTextLineHeight() { return ensure().style.FontSize; }
function GetTextLineHeightWithSpacing() { const st = ensure().style; return st.FontSize + st.ItemSpacing.y; }
function GetFrameHeight() { const st = ensure().style; return st.FontSize + st.FramePadding.y * 2; }
function GetFrameHeightWithSpacing() { const st = ensure().style; return st.FontSize + st.FramePadding.y * 2 + st.ItemSpacing.y; }
function GetTreeNodeToLabelSpacing() { const st = ensure().style; return st.FontSize + st.FramePadding.x * 2; }
function GetCursorStartPos() {
  const w = W(); if (!w) return { x: 0, y: 0 };
  const s = w.dc.cursorStartPos;
  return { x: s.x - w.pos.x - w.padding.x, y: s.y - (w.pos.y + w.titleH + w.padding.y) };
}
function GetItemRectMin() { const r = ensure().lastItem.rect; return r ? { x: r.x, y: r.y } : { x: 0, y: 0 }; }
function GetItemRectMax() { const r = ensure().lastItem.rect; return r ? { x: r.x + r.w, y: r.y + r.h } : { x: 0, y: 0 }; }
function GetItemRectSize() { const r = ensure().lastItem.rect; return r ? { x: r.w, y: r.h } : { x: 0, y: 0 }; }
function SetNextItemWidth(wd) { ensure()._nextItemWidth = wd; }
function CalcItemWidth() {
  const c = ensure();
  let w = (c._nextItemWidth !== undefined && c._nextItemWidth !== null) ? c._nextItemWidth : 0;
  if (!w && c._itemWidthStack.length) w = c._itemWidthStack[c._itemWidthStack.length - 1];
  if (!w) w = GetContentRegionAvail().x;
  if (w < 0) w = Math.max(1, GetContentRegionAvail().x + w);
  return Math.trunc(w);
}
function GetWindowContentRegionMin() { const w = W(); if (!w) return { x: 0, y: 0 }; return { x: w.dc.cursorStartPos.x - w.pos.x, y: w.dc.cursorStartPos.y - w.pos.y }; }
function GetWindowContentRegionMax() {
  const w = W(); if (!w) return { x: 0, y: 0 };
  const c = ensure();
  const sb = (w.scrollMax > 0 && !(w.flags & ImGui.WindowFlags.NoScrollbar)) ? (c.style.ScrollbarSize + 2) : 0;
  return { x: w.sizeFull.x - w.padding.x - sb, y: w.sizeFull.y - w.padding.y };
}
function GetWindowPos() { const w = W(); return w ? { ...w.pos } : { x: 0, y: 0 }; }
function GetWindowSize() { const w = W(); return w ? { ...w.sizeFull } : { x: 0, y: 0 }; }
function GetWindowWidth() { return GetWindowSize().x; }
function GetWindowHeight() { return GetWindowSize().y; }
function IsWindowCollapsed() { const w = W(); return w ? !!w.collapsed : false; }
function IsWindowAppearing() { const w = W(); return w ? !!w.appearing : false; }
function SetScrollHereYExtended() { /* widgets.js impl wins; keep alias for compat */ }
function PushClipRect(x, y, w, h) { const win = W(); if (win) win.drawList.push({ t: "pushClip", x, y, w, h }); }
function PopClipRect() { const win = W(); if (win) win.drawList.push({ t: "popClip" }); }
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
function IsAnyItemActive() { return ensure().activeId !== 0; }
function IsAnyItemHovered() { return ensure().hoveredId !== 0; }
function IsAnyItemFocused() { const k = ensure().activeKind; return k === 'text' || k === 'segtext'; }
// wrap edit-reporting widgets to feed IsItemEdited/Deactivated
function wrapEditTrack() {
  if (ensure().__editWrapped) return; ensure().__editWrapped = true;
  const names = ["Checkbox", "Toggle", "CheckboxFlags", "RadioButtonInt", "SliderFloat", "SliderInt", "SliderFloat2", "SliderFloat3", "SliderFloat4", "DragFloat", "DragInt", "DragFloat4", "DragInt4", "InputFloat4", "InputText", "InputFloat", "InputInt", "InputDouble", "ColorEdit4", "ColorEdit3", "Combo", "Selectable", "ListBox"];
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
  ImGui.InputText = function (label, text, flags, hint) {
    const c = ensure();
    const r = origInput(label, text, flags, hint); // forward hint (InputTextWithHint delegation)
    if (c._wantTextFocus && c.lastItem.id) {
      c._wantTextFocus = false;
      c.activeId = c.lastItem.id; c.activeKind = "text";
      c.activePayload = { value: String(r.text || ""), cursorPos: String(r.text || "").length, commit: false };
      // No coordinates: the DOM capture input is strictly off-screen now.
      if (ImGui._backendFocusText) ImGui._backendFocusText(c.activePayload.value, (nv) => { if (c.activePayload) c.activePayload.value = nv; });
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
    const tw = measure(text) + 16;   // 8px horizontal padding each side
    const th = 16 + 8;               // real text height + 4px vertical padding
    emit({ t: "rectFilled", x: c._tooltip.x, y: c._tooltip.y, w: tw, h: th, r: 4, col: c.style.Colors[ImGui.Col.PopupBg] });
    emit({ t: "rect", x: c._tooltip.x, y: c._tooltip.y, w: tw, h: th, r: 4, col: c.style.Colors[ImGui.Col.Border], th: 1 });
    emit({ t: "text", str: text, x: c._tooltip.x + 8, y: c._tooltip.y + (th - 16) / 2, col: c.style.Colors[ImGui.Col.Text] });
    EndTooltip();
  }
}
function SetItemTooltip(text) { if (IsItemHovered()) SetTooltip(text); }
function SetTooltipV(fmt, args) { SetTooltip(ImGui.formatString(fmt, args)); }

// ---------- popups / modals (overlay layer, FindBestWindowPosForPopup flip) ----------
function OpenPopup(id, ax, ay) {
  const c = ensure(), m = c.io.MousePos;
  const key = String(id);
  c._popupPending = key;
  // "center" (or ("center","center")) pins the popup to the viewport center;
  // explicit (x, y) wins; otherwise the mouse pos is the anchor.
  if (ax === "center" || ay === "center") c._popupAnchor[key] = { center: true };
  else c._popupAnchor[key] = (ax !== undefined && ay !== undefined) ? { x: ax, y: ay } : { x: m.x, y: m.y };
}
function OpenPopupOnItemClick(id, button = 1) { if (IsItemClicked(button)) OpenPopup(id); }

// ---------- draw-list facade (GetWindowDrawList / fg / bg) ----------
function _dlEmit(target, op) { if (target) target.push(op); }
function _ngonPts(cx, cy, r, n) {
  const pts = []; n = n || 3;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); }
  return pts;
}
function GetWindowDrawList() {
  const w = W(); if (!w) return null;
  const dl = w.drawList;
  return {
    AddLine(p1, p2, col, th)      { _dlEmit(dl, { t: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, col, th: th || 1 }); },
    AddRect(p1, p2, col, r, th)   { _dlEmit(dl, { t: "rect", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col, th: th || 1 }); },
    AddRectFilled(p1, p2, col, r) { _dlEmit(dl, { t: "rectFilled", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col }); },
    AddRectFilledMultiColor(p1, p2, tl, tr, br, bl) { _dlEmit(dl, { t: "rectGradient", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, tl, tr, br, bl }); },
    AddCircle(cx, cy, r, col, th) { _dlEmit(dl, { t: "circle", x: cx, y: cy, r, col, th: th || 1 }); },
    AddCircleFilled(cx, cy, r, col) { _dlEmit(dl, { t: "circleFilled", x: cx, y: cy, r, col }); },
    AddTriangle(p1, p2, p3, col, th)    { _dlEmit(dl, { t: "polyline", pts: [p1, p2, p3], col, th: th || 1, closed: true }); },
    AddTriangleFilled(p1, p2, p3, col)  { _dlEmit(dl, { t: "polygon", pts: [p1, p2, p3], col }); },
    AddNgon(cx, cy, r, col, n, th)      { _dlEmit(dl, { t: "polyline", pts: _ngonPts(cx, cy, r, n), col, th: th || 1, closed: true }); },
    AddNgonFilled(cx, cy, r, col, n)    { _dlEmit(dl, { t: "polygon", pts: _ngonPts(cx, cy, r, n), col }); },
    AddBezierCubic(p1, p2, p3, p4, col, th) { _dlEmit(dl, { t: "bezierCubic", p1, p2, p3, p4, col, th: th || 1 }); },
    AddBezierQuadratic(p1, p2, p3, col, th) { _dlEmit(dl, { t: "bezierQuad", p1, p2, p3, col, th: th || 1 }); },
    AddText(x, y, col, str)             { _dlEmit(dl, { t: "text", str, x, y, col }); },
    AddPolyline(pts, col, th, closed)   { _dlEmit(dl, { t: "polyline", pts: pts.slice(), col, th: th || 1, closed: !!closed }); },
    AddConvexPolyFilled(pts, col)       { _dlEmit(dl, { t: "polygon", pts: pts.slice(), col }); },
  };
}
function GetBackgroundDrawList() {
  const c = ensure(); c._bgOps = c._bgOps || []; const a = c._bgOps;
  return {
    AddRectFilled(p1, p2, col, r) { a.push({ t: "rectFilled", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col }); },
    AddText(x, y, col, str) { a.push({ t: "text", str, x, y, col }); },
    AddLine(p1, p2, col, th) { a.push({ t: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, col, th: th || 1 }); },
  };
}
function GetForegroundDrawList() {
  const c = ensure(); c._overlayOps = c._overlayOps || []; const a = c._overlayOps;
  return {
    AddRectFilled(p1, p2, col, r) { a.push({ t: "rectFilled", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col }); },
    AddText(x, y, col, str) { a.push({ t: "text", str, x, y, col }); },
    AddLine(p1, p2, col, th) { a.push({ t: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, col, th: th || 1 }); },
  };
}
// ---------- ImGuiListClipper (uniform-height virtualization) ----------
function __clipViewportH() {
  const c = ensure(), w = W(); if (!w) return 400;
  const h = (c._childStack && c._childStack.length)
    ? c._childStack[c._childStack.length - 1].bounds.h - 12
    : w.sizeFull.y - (w.titleH || 0) - (w.padding ? w.padding.y * 2 : 16);
  return Math.max(40, h || 400);
}
class ImGuiListClipper {
  constructor() { this.DisplayStart = 0; this.DisplayEnd = 0; this.ItemsCount = -1; this.ItemsHeight = -1; this._step = -1; this._startY = 0; this._baseMax = 0; this._h = 20; this._baseScroll = 0; }
  Begin(count, items_height = -1) {
    const c = ensure(), w = W();
    this.ItemsCount = count | 0; this.ItemsHeight = items_height;
    this._step = 0;
    this._startY = w ? w.dc.cursorPos.y : 0;
    this._baseMax = w ? w.dc.cursorMaxPos.y : 0;
    this._baseScroll = (w && w.scrollY) || 0;
    this._h = items_height > 0 ? items_height : (c.style.FontSize + c.style.ItemSpacing.y) || 20;
    this.DisplayStart = 0; this.DisplayEnd = Math.min(1, this.ItemsCount);
    return this;
  }
  SeekCursorForItem(idx) {
    const w = W(); if (!w) return;
    idx = Math.max(0, Math.min(this.ItemsCount, idx));
    const y = this._startY + idx * this._h;
    w.dc.cursorPos.y = y; w.dc.cursorPosPrevLine = { x: w.dc.cursorPos.x, y };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, y);
  }
  _reserveTail() {
    const w = W(); if (!w) return;
    const endY = this._startY + this.ItemsCount * this._h;
    w.dc.cursorPos.y = Math.max(w.dc.cursorPos.y, endY);
    w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
    w.dc.currLineHeight = 0; w.dc._lineUsed = false;
    w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, endY);
  }
  Step() {
    const w = W();
    if (!w || this._step < 0 || this.ItemsCount <= 0) { this._step = -1; return false; }
    if (this._step === 0) {
      // First pass: caller submits DisplayStart..DisplayEnd (item 0).
      // Measuring happens on the NEXT step, after item 0 advanced cursorMaxPos.
      this._step = 1;
      return true;
    }
    if (this._step === 1) {
      // Measure per-item height from what item 0 actually consumed
      // (cursorMaxPos tracks bottom extent even without a line feed).
      if (this.ItemsHeight <= 0) {
        const grew = w.dc.cursorMaxPos.y - Math.max(this._startY, this._baseMax);
        const n = Math.max(1, this.DisplayEnd - this.DisplayStart);
        const measured = grew / Math.max(1, n);
        if (measured > 1 && measured < 500) this._h = measured;
      }
      if (this.ItemsCount <= 1) { this._step = -1; return false; }
      const vh = __clipViewportH();
      const off = (w.scrollY || 0) - this._baseScroll;
      let first = Math.floor((off - 4) / this._h);
      let last = Math.ceil((off + vh + 4) / this._h);
      first = Math.max(0, Math.min(this.ItemsCount, first));
      last = Math.max(first + 1, Math.min(this.ItemsCount, last));
      if (first === 0) {
        // Item 0 was already submitted in step 0 — continue after it.
        this.DisplayStart = 1; this.DisplayEnd = last;
      } else {
        this.DisplayStart = first; this.DisplayEnd = last;
        this.SeekCursorForItem(first);
      }
      this._step = 2;
      return true;
    }
    this._reserveTail();
    this._step = -1;
    return false;
  }
  End() { if (this._step >= 0) this._reserveTail(); this._step = -1; }
}
// ---------- TableSetBgColor (CellBg + row band) ----------
function __tblCss(col) {
  if (col == null) return "rgba(0,0,0,0)";
  if (typeof col === "string") return col;
  if (Array.isArray(col)) {
    const f = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
    return `rgba(${f(col[0])},${f(col[1])},${f(col[2])},${col.length > 3 ? col[3] : 1})`;
  }
  if (typeof col === "number") {
    const r = col & 255, g = (col >> 8) & 255, b = (col >> 16) & 255, a = ((col >>> 24) & 255) / 255;
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }
  return "rgba(0,0,0,0)";
}
function TableSetBgColor(target, color, column_n = -1) {
  const c = ensure(), w = W(); if (!w || !c._table) return;
  const t = c._table;
  const css = __tblCss(color);
  const rowY = (t.rowY !== undefined) ? t.rowY : t.startY;
  const h = t.rowH || 22;
  if (target === 0) {
    const cur = (t._orderMap && t.col >= 0 && t._orderMap[t.col] !== undefined) ? t._orderMap[t.col] : t.col;
    const col = column_n < 0 ? cur : column_n;
    const x = t.x + (t.offsets ? t.offsets[col] || 0 : col * (t.avail / t.cols));
    const cw = t.widths ? t.widths[col] : t.avail / t.cols;
    emit({ t: "rectFilled", x, y: rowY, w: cw, h, r: 0, css });
  } else {
    emit({ t: "rectFilled", x: t.x, y: rowY, w: t.avail, h, r: 0, css });
  }
}
const TableBgTarget = { None: 0, RowBg0: 1, RowBg1: 2, CellBg: 0, RowBg: 1, ColumnBg: 2 };
// ---------- draw-list facade PLACEHOLDER ----------
function IsPopupOpen(id) { const c = ensure(); return c._popupStack.includes(String(id)); }
function _anyModalOpen(c) {
  return c._popupStack.some((k) => {
    const r = (c._popupRects && c._popupRects[k]) || (c._popupRectsPrev && c._popupRectsPrev[k]);
    return !!(r && r.modal);
  });
}
function CloseCurrentPopup() {
  const c = ensure();
  const top = c._popupStack[c._popupStack.length - 1];
  const topRect = top && ((c._popupRects && c._popupRects[top]) || (c._popupRectsPrev && c._popupRectsPrev[top]));
  const wasModal = !!(topRect && topRect.modal);
  c._popupStack.pop();
  if (wasModal && !_anyModalOpen(c)) c._activeModalRect = null;
}
function ClosePopup(id) {
  const c = ensure();
  c._popupStack = c._popupStack.filter((p) => p !== String(id));
  // Only drop the modal input lock when NO modal remains open — closing a
  // sibling non-modal popup must never un-lock an active modal.
  if (!_anyModalOpen(c)) c._activeModalRect = null;
}
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
  const dw = c.io.DisplaySize.x, dh = c.io.DisplaySize.y;
  let bw, bx, by;
  if (modal) {
    // Modals always center on the viewport (Dear ImGui centers modal popups).
    bw = Math.min(320, dw - 40);
    const estH = 140;
    bx = Math.round((dw - bw) / 2);
    by = Math.round((dh - estH) / 2);
    // Register the lock immediately: windows evaluated AFTER this point in
    // the same frame must already see the modal (popupBoxEnd refines it).
    c._activeModalRect = { x: bx, y: by, w: bw, h: estH };
  } else if (a && a.center) {
    // Explicit center anchor: OpenPopup(id, "center").
    bw = Math.min(300, Math.max(120, w.sizeFull.x - 20));
    const estH = 140;
    bx = Math.round((dw - bw) / 2);
    by = Math.round((dh - estH) / 2);
  } else {
    bw = Math.min(300, Math.max(120, w.sizeFull.x - 20));
    const best = popupBestPos(a, bw, 260);
    bx = best.bx; by = best.by;
  }
  // NOTE: modal dim is drawn fullscreen into the overlay at End (top Z),
  // not here — an in-window emit would be clipped to the parent window.
  // Save outer line state; popup content gets a fresh line context.
  // Stack (not singleton): nested popups each keep their own box + marker.
  const dc = w.dc;
  const box = {
    x: bx, y: by, w: bw, key, modal, win: w,
    savedCursor: { ...dc.cursorPos }, savedPrev: { ...dc.cursorPosPrevLine },
    savedStart: { ...dc.cursorStartPos },
    savedLine: { currH: dc.currLineHeight, used: dc._lineUsed, same: dc.isSameLine, sp: dc.sameLineSpacing, lw: dc.lastItemWidth, cellX: dc._cellStartX },
    savedInPopup: dc._inPopup,
  };
  c._popupBoxStack.push(box);
  c._popupBox = box; // legacy alias = top of stack
  // Popup content lives in ABSOLUTE overlay coords (unclipped, not scrolled
  // with the host window): mark it so hovered()/screen-space translations
  // skip the host's scrollY while this box is current.
  dc._inPopup = true;
  w.drawList.push({ t: "_popupMark", key });
  dc.cursorPos.x = bx + 8; dc.cursorPos.y = by + 8; dc.cursorPosPrevLine = { x: bx + 8, y: by + 8 };
  // Popup is its own layout origin: feeds wrap inside the box, never back
  // to the parent window's left margin (that stranded Close/OK outside).
  dc.cursorStartPos = { x: bx + 8, y: by + 8 };
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
  // Height spans all placed lines: cursor top + current line height.
  const h = Math.max(30, dc.cursorPos.y + dc.currLineHeight - b.y + 8);
  PopID();
  // Move popup ops (mark..end) to the context overlay: drawn after ALL
  // windows, unclipped, top Z — a top-level layer within the canvas model.
  let start = w.drawList.findIndex((op) => op.t === "_popupMark" && op.key === b.key);
  if (start < 0) start = w.drawList.length;
  const content = w.drawList.splice(start);
  const inner = content.filter((op) => op.t !== "_popupMark");
  // Auto-fit width to the content (like height); frame hugs the widgets.
  let maxR = b.x + 120;
  for (const op of inner) {
    if (op.t === "rectFilled" || op.t === "rect" || op.t === "image") maxR = Math.max(maxR, op.x + op.w);
    else if (op.t === "text") maxR = Math.max(maxR, op.x + measure(op.str || ""));
    else if (op.t === "line") maxR = Math.max(maxR, op.x1, op.x2);
    else if (op.t === "circleFilled") maxR = Math.max(maxR, op.x + op.r);
    else if ((op.t === "polyline" || op.t === "polygon") && op.pts) for (const p of op.pts) maxR = Math.max(maxR, p.x);
  }
  const boxW = Math.max(120, Math.min(b.w, maxR - b.x + 8));
  // Box frame goes first so content paints over it. Modal dim covers the
  // whole viewport underneath everything (fullscreen overlay layer).
  if (modal) c._overlayOps.push({ t: "rectFilled", x: 0, y: 0, w: c.io.DisplaySize.x, h: c.io.DisplaySize.y, r: 0, css: "rgba(0,0,0,0.55)" });
  const frame = [
    { t: "rectFilled", x: b.x, y: b.y, w: boxW, h, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.PopupBg] },
    { t: "rect", x: b.x, y: b.y, w: boxW, h, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.Border], th: 1 },
  ];
  c._overlayOps.push(...frame, ...inner);
  // Record this frame's rect for next frame's click preemption. The modal
  // flag lets next frame's ensure() re-derive the input lock from it.
  c._popupRects[b.key] = { x: b.x, y: b.y, w: boxW, h, modal: !!b.modal };
  // Restore the EXACT pre-popup layout state. The popup is an overlay layer:
  // it contributes no document flow, so the parent cursor, line state and
  // extents must be byte-identical to the moment before BeginPopup ran.
  // (Advancing past the popup here created the black void + accordion
  // resizing + stair-stepped siblings: parent maxPos absorbed popup coords.)
  dc.cursorPos.x = b.savedCursor.x; dc.cursorPos.y = b.savedCursor.y;
  dc.cursorPosPrevLine = { ...b.savedPrev };
  dc.cursorStartPos = { ...b.savedStart };
  dc.currLineHeight = b.savedLine.currH; dc._lineUsed = b.savedLine.used;
  dc.isSameLine = b.savedLine.same; dc.sameLineSpacing = b.savedLine.sp;
  dc.lastItemWidth = b.savedLine.lw;
  if (b.savedLine.cellX !== undefined) dc._cellStartX = b.savedLine.cellX;
  else delete dc._cellStartX;
  dc._inPopup = b.savedInPopup;
  const m = c.io.MousePos;
  const inside = m.x >= b.x && m.x <= b.x + boxW && m.y >= b.y && m.y <= b.y + h;
  if (c.io.MouseClicked[0] && !inside && !modal) { c._swallowNextPress = c.frame + 1; ClosePopup(b.key); }
  if (c.io.KeysDown["Escape"] && !modal) ClosePopup(b.key);
  // Refresh the lock with the exact frame rect (or clear it right away if
  // this modal was just closed — ClosePopup/CloseCurrentPopup also clear).
  if (modal) c._activeModalRect = c._popupStack.includes(b.key) ? { x: b.x, y: b.y, w: boxW, h } : null;
}
function BeginPopup(id) { return popupBoxBegin(id, false); }
function EndPopup() { popupBoxEnd(false); }
function BeginPopupModal(name) { return popupBoxBegin(name, true); }
function EndPopupModal() { popupBoxEnd(true); }
function BeginPopupContextItem(id = "ctx") { if (IsItemClicked(1)) OpenPopup(id); return BeginPopup(id); }
function BeginPopupContextWindow(id = "ctxwin") { const w = W(); if (w && w.contentHover && C().io.MouseClicked[1]) OpenPopup(id); return BeginPopup(id); }
function BeginPopupContextVoid(id = 0) { const c = ensure(); if (c.io.MouseClicked[1] && !c.hoveredId) OpenPopup(id); return BeginPopup(id); }

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
  if (h && c.io.MouseClicked[0]) {
    const wasOpen = !!c._menuOpen[label];
    for (const k of Object.keys(c._menuOpen)) c._menuOpen[k] = false; // one top menu at a time
    c._menuOpen[label] = !wasOpen;
    c.anyWindowHovered = true;
  } else if (h) c.anyWindowHovered = true;
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
      drawStart: w.drawList.length, ddX: x, ddY: y + 26,
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
    // Wrap the dropdown's items in a framed popup box so the menu reads as
    // one surface (Dear ImGui menus draw PopupBg+border behind MenuItems).
    if (typeof saved.drawStart === "number" && saved.drawStart < w.drawList.length) {
      const inner = w.drawList.splice(saved.drawStart);
      let minY = Infinity, maxR = saved.ddX + 170, maxY = saved.ddY;
      for (const op of inner) {
        if (op.t === "rectFilled" || op.t === "rect" || op.t === "image") { minY = Math.min(minY, op.y); maxR = Math.max(maxR, op.x + op.w); maxY = Math.max(maxY, op.y + op.h); }
        else if (op.t === "text") { minY = Math.min(minY, op.y); maxR = Math.max(maxR, op.x + measure(op.str || "")); maxY = Math.max(maxY, op.y + 16); }
        else if (op.t === "line") { maxR = Math.max(maxR, op.x1, op.x2); maxY = Math.max(maxY, op.y1, op.y2); }
      }
      if (minY === Infinity) minY = saved.ddY;
      const bx = saved.ddX, by = minY - 4, bw = Math.max(120, maxR - bx + 8), bh = Math.max(24, maxY - by + 4);
      w.drawList.splice(saved.drawStart, 0,
        { t: "rectFilled", x: bx, y: by, w: bw, h: bh, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.PopupBg] },
        { t: "rect", x: bx, y: by, w: bw, h: bh, r: c.style.PopupRounding, col: c.style.Colors[ImGui.Col.Border], th: 1 },
        ...inner);
      // Record the rect so the popup/click-preemption maps can shield the
      // widgets behind the open menu from activating on the same click.
      c._popupRects = c._popupRects || {};
      c._popupRects["menu:" + saved.label] = { x: bx, y: by, w: bw, h: bh };
    }
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
  if (selected) {
    const bx = x + 4, by = y + 4;
    emit({ t: "rectFilled", x: bx, y: by, w: 14, h: 14, r: 4, col: c.style.Colors[ImGui.Col.FrameBg] });
    emit({ t: "rect", x: bx, y: by, w: 14, h: 14, r: 4, col: c.style.Colors[ImGui.Col.Border], th: 1 });
    emit({ t: "line", x1: bx + 3, y1: by + 7, x2: bx + 6, y2: by + 10, col: c.style.Colors[ImGui.Col.CheckMark], th: 2.5 });
    emit({ t: "line", x1: bx + 6, y1: by + 10, x2: bx + 11, y2: by + 3, col: c.style.Colors[ImGui.Col.CheckMark], th: 2.5 });
  }
  emit({ t: "text", str: shown, x: selected ? x + 26 : x + 8, y: y + 3, col: enabled ? c.style.Colors[ImGui.Col.Text] : c.style.Colors[ImGui.Col.TextDisabled] });
  if (shortcut) emit({ t: "text", str: shortcut, x: x + wd - measure(shortcut) - 8, y: y + 3, col: c.style.Colors[ImGui.Col.TextDisabled] });
  const clicked = enabled && h && c.io.MouseClicked[0] && !menuClickSuppressed();
  if (clicked) { // selecting an item closes the whole menu chain
    for (const k of Object.keys(c._menuOpen)) c._menuOpen[k] = false;
  }
  return clicked;
}

// ---------- tab bar (imgui_widgets.cpp BeginTabBar/BeginTabItem) ----------
// Fixed height 24; advance = width + 2; top-rounded only, flat bottom;
// active tab overlaps the baseline by 1px and masks it.
const TAB_H = 24, TAB_CONTENT_GAP = 1;
function BeginTabBar(id) {
  const c = ensure(), w = W(); if (!w) return false;
  // Block widget: break to a fresh line FIRST, otherwise the bar would start
  // mid-line right after the previous widget (tabs glued to a button).
  c.beforeItemPlacement(0, TAB_H);
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
  // Block widget: break to a fresh line FIRST, otherwise avail/origin would
  // be measured from the previous widget's line-end (mid-line cursor).
  c.beforeItemPlacement(0, 4);
  // outerWidth defaults to the available content width at the cursor.
  const avail = outerW > 0 ? outerW : GetContentRegionAvail().x;
  const x = w.dc.cursorPos.x;
  c.itemSize(avail, 4);
  c._table = {
    id: String(id), cols: columns, flags, x, y: w.dc.cursorPos.y, row: -1, col: -1,
    avail, colW: avail / columns, widths: null, offsets: null,
    names: [], rowH: 22, startY: w.dc.cursorPos.y,
    _widths: [], _customWidths: tableStateGet({ id: String(id) }, "widths"),
    order: tableStateGet({ id: String(id) }, "order"), sort: tableStateGet({ id: String(id) }, "sort"),
  };
  if (c._table._customWidths && !Array.isArray(c._table._customWidths)) c._table._customWidths = null;
  if (c._table.order && !Array.isArray(c._table.order)) c._table.order = null;
  PushID("table:" + id);
  return true;
}
function TableSetColumnOrder(indices) {
  const c = ensure(); if (!c._table) return;
  c._table.order = [...indices]; tableStateSet(c._table, "order", c._table.order);
}
function TableGetSortSpecs() {
  const c = ensure(); if (!c._table || !c._table.sort) return { Specs: [], SpecsCount: 0, Dirty: false };
  const s = c._table.sort;
  return { Specs: [{ ColumnIndex: s.col, SortOrder: 0, SortDirection: s.dir === "desc" ? 2 : 1 }], SpecsCount: 1, Dirty: false };
}
function TableClearSort() { const c = ensure(); if (c._table) { c._table.sort = null; tableStateSet(c._table, "sort", null); } }
const TableColumnFlags = {
  None: 0,
  Disabled: 1 << 0, DefaultHide: 1 << 1, DefaultSort: 1 << 2,
  WidthStretch: 1 << 3, WidthFixed: 1 << 4,
  NoResize: 1 << 5, NoReorder: 1 << 6, NoHide: 1 << 7, NoClip: 1 << 8, NoSort: 1 << 9,
  AlignLeft: 1 << 16, AlignCenter: 2 << 16, AlignRight: 3 << 16,
  AlignMaskX: (1 << 16) | (2 << 16) | (3 << 16),
  AlignTop: 1 << 20, AlignMiddle: 2 << 20, AlignBottom: 3 << 20,
  AlignMaskY: (1 << 20) | (2 << 20) | (3 << 20),
};
function TableSetupColumn(label, widthOrWeight = 0, flags = 0) {
  const c = ensure();
  if (c._table) { c._table.names.push(label); c._table._widths = c._table._widths || []; c._table._widths.push(widthOrWeight); c._table._colFlags = c._table._colFlags || []; c._table._colFlags.push(flags || 0); }
}
function tablePersistKey(t, kind) { return "imgui_table_" + t.id + "_" + kind; }
function tableStateGet(t, kind) {
  try { return JSON.parse(localStorage.getItem(tablePersistKey(t, kind)) || "null"); } catch (e) { return null; }
}
function tableStateSet(t, kind, val) {
  try { localStorage.setItem(tablePersistKey(t, kind), JSON.stringify(val)); return true; } catch (e) { return false; }
}
function tableLayout(t) {
  // Column pitch reserves CellPadding.x on both sides so text never clips.
  // Recompute every frame so columns track window width; a column the user
  // dragged (Resizable) keeps its explicit width via t._customWidths.
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
  // User-resized columns (Resizable drag) override the auto widths and stay
  // fixed; the remaining space is still distributed to the auto columns.
  if (t._customWidths) {
    let cf = 0;
    for (let i = 0; i < n; i++) if (typeof t._customWidths[i] === "number") cf += t._customWidths[i];
    const rest2 = Math.max(0, t.avail - cf);
    for (let i = 0; i < n; i++) {
      if (typeof t._customWidths[i] === "number") t.widths[i] = t._customWidths[i];
      else if (t.widths[i] && cf > 0) t.widths[i] = Math.max(40, rest2 / Math.max(1, n - Object.keys(t._customWidths).length));
    }
  }
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
  // Column order (visual -> canonical) may be persisted/remembered; widths
  // used here are the *canonical* widths mapped through t.offsets via order.
  const order = c._table.order && c._table.order.length === c._table.cols ? c._table.order : c._table.names.map((_, i) => i);
  c._table._orderMap = order;
  for (let i = 0; i < c._table.cols; i++) {
    const canon = order[i];
    TableSetColumnIndex(i);
    const nm = c._table.names[canon] || ("C" + canon);
    const cw = c._table.widths[canon];
    // Full-height banner cell: meets the bottom divider with no gap, and the
    // vertical grid lines (drawn by tableInnerVerticals below) run through it.
    const sortDir = (c._table.sort && c._table.sort.col === canon) ? c._table.sort.dir : null;
    const hy = c._table.rowY, hh = c._table.rowH;
    const h = c.io.MousePos.x >= w.dc.cursorPos.x - c.style.CellPadding.x && c.io.MousePos.x <= w.dc.cursorPos.x - c.style.CellPadding.x + cw && c.io.MousePos.y >= hy && c.io.MousePos.y <= hy + hh;
    emit({ t: "rectFilled", x: w.dc.cursorPos.x - c.style.CellPadding.x, y: hy, w: cw, h: hh, r: 0, col: c.style.Colors[ImGui.Col.TableHeaderBg] });
    const arrow = sortDir === "asc" ? " ▲" : sortDir === "desc" ? " ▼" : "";
    // Header text: horizontal per-column flag, always vertically centered.
    const hflags = (c._table._colFlags && c._table._colFlags[canon]) || 0;
    const hax = hflags & ((1 << 16) | (2 << 16) | (3 << 16));
    const hlabel = nm + arrow;
    const htw = measure(hlabel);
    const usableW = Math.max(0, cw - c.style.CellPadding.x * 2);
    let htx = w.dc.cursorPos.x;
    if (hax === (2 << 16)) htx += Math.max(0, (usableW - htw) / 2);
    else if (hax === (3 << 16)) htx += Math.max(0, usableW - htw);
    const hty = hy + Math.round((hh - c.style.FontSize) / 2);
    emit({ t: "text", str: hlabel, x: htx, y: hty, col: c.style.Colors[ImGui.Col.Text] });
    if (h && c.io.MouseClicked[0] && (c._table.flags & TableFlags.Sortable)) {
      const cur = c._table.sort && c._table.sort.col === canon ? c._table.sort.dir : null;
      c._table.sort = cur === "asc" ? { col: canon, dir: "desc" } : cur === "desc" ? null : { col: canon, dir: "asc" };
      tableStateSet(c._table, "sort", c._table.sort);
      c._table._widths = c._table._widths || [];
    }
  }
  // bottom separator splitting headers from data rows
  if (tableHasInnerH(c._table)) {
    const t = c._table, yb = (t.rowY || t.startY) + t.rowH;
    emit({ t: "line", x1: t.x, y1: yb, x2: t.x + t.avail, y2: yb, col: c.style.Colors[ImGui.Col.TableBorderStrong], th: 1 });
  }
  tableInnerVerticals(c._table);
  // Resizable columns: drag a header/cell boundary to retune widths.
  if ((c._table.flags & TableFlags.Resizable) && c._table.offsets) {
    const t = c._table;
    for (let i = 1; i < t.cols; i++) {
      const lx = t.x + t.offsets[i];
      const m = c.io.MousePos;
      const onLine = Math.abs(m.x - lx) <= 3 && m.y >= t.startY - 2 && m.y <= t.startY + t.rowH + 4;
      if (onLine && c.io.MouseClicked[0]) {
        c.activeId = (t.id.length * 131 + i) | 0; c.activeKind = "tablecol";
        c.activePayload = { table: t, col: i, startX: m.x, origW: (t._customWidths && t._customWidths[i - 1]) || t.widths[i - 1] };
      }
      if (c.activeKind === "tablecol" && c.activePayload && c.activePayload.table === t && c.activePayload.col === i) {
        const dx = m.x - c.activePayload.startX;
        t._customWidths = t._customWidths || {};
        t._customWidths[i - 1] = Math.max(40, c.activePayload.origW + dx);
        if (!c.io.MouseDown[0]) {
          tableStateSet(t, "widths", t._customWidths);
          c.activeId = 0; c.activeKind = null; c.activePayload = null;
        }
      }
    }
  }
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
function TableNextRow(row_flags = 0, min_row_height = 0) {
  const c = ensure(), w = W(); if (!w || !c._table) return;
  const t = c._table;
  tableLayout(t);
  t.row++; t.col = -1;
  t.rowH = Math.max(22, min_row_height || 0);
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
  // Visual index n may map through a (hidden) reordered column table; the
  // canonical column supplies the width/offset used by every cell getter.
  const canon = (t._orderMap && t._orderMap[n] !== undefined) ? t._orderMap[n] : n;
  const cflags = (t._colFlags && t._colFlags[canon]) || 0;
  t._cell = {
    x0: t.x + t.offsets[canon], w: t.widths[canon],
    ax: cflags & ((1 << 16) | (2 << 16) | (3 << 16)),
    ay: cflags & ((1 << 20) | (2 << 20) | (3 << 20)),
  };
  w.dc.cursorPos.x = t.x + t.offsets[canon] + c.style.CellPadding.x;
  w.dc.cursorPos.y = (t.rowY || t.y) + (c.style.CellPadding.y || 0);
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
  if (count <= 1) {
    if (c._columns) {
      const cc = c._columns;
      // Finish a partially filled row. A caller that used NextColumn() after
      // the final cell is already positioned at the next row and adds none.
      cc.rowHeight = Math.max(cc.rowHeight, w.dc.currLineHeight);
      if (cc.i !== 0 || w.dc._lineUsed) cc.rowY += cc.rowHeight + C().style.ItemSpacing.y;
      w.dc.cursorPos.x = cc.x; w.dc.cursorPos.y = cc.rowY;
      w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
      w.dc.cursorStartPos = { ...cc.startPos };
      w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, cc.rowY + cc.rowHeight);
      delete w.dc._cellStartX;
      w.dc.currLineHeight = 0; w.dc._lineUsed = false; w.dc._lockFeed = true;
      c._columns = null;
    }
    return;
  }
  // Break to a fresh row BELOW the current item (SeparatorText left the
  // cursor mid-line), otherwise the first rowpaint overlaps the separator.
  c.beforeItemPlacement(0, 0);
  const startPos = { ...w.dc.cursorStartPos };
  const avail = w.sizeFull.x - w.padding.x * 2 - (w._indent || 0);
  const startX = w.pos.x + w.padding.x + (w._indent || 0);
  const startY = w.dc.cursorPos.y;
  c._columns = { n: count, i: 0, x: startX, rowY: startY, rowHeight: 0, w: avail / count, startPos };
  w.dc.cursorPos.x = startX + C().style.CellPadding.x;
  w.dc.cursorPos.y = startY;
  w.dc.cursorStartPos = { ...w.dc.cursorPos };
  w.dc._cellStartX = w.dc.cursorPos.x;
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc._lockFeed = true;
}
function NextColumn() {
  const c = ensure(), w = W(); if (!w || !c._columns) return;
  const cc = c._columns;
  // Finish this cell before moving the cursor. The next row starts below the
  // tallest cell in the current row, so every column keeps the same baseline.
  cc.rowHeight = Math.max(cc.rowHeight, w.dc.currLineHeight, 18);
  w.dc.currLineHeight = 0;
  w.dc._lineUsed = false;
  cc.i = (cc.i + 1) % cc.n;
  if (cc.i === 0) {
    cc.rowY += cc.rowHeight + C().style.ItemSpacing.y;
    cc.rowHeight = 0;
    w.dc.cursorPos.x = cc.x + C().style.CellPadding.x;
    w.dc.cursorPos.y = cc.rowY;
  } else { w.dc.cursorPos.x = cc.x + cc.i * cc.w + C().style.CellPadding.x; w.dc.cursorPos.y = cc.rowY; }
  w.dc.cursorStartPos = { ...w.dc.cursorPos };
  w.dc._cellStartX = w.dc.cursorPos.x;
  w.dc.cursorPosPrevLine = { ...w.dc.cursorPos };
  w.dc.cursorMaxPos.y = Math.max(w.dc.cursorMaxPos.y, cc.rowY + 20);
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
  // 1. Only initiate if the mouse was clicked directly on THIS widget
  if (IsItemHovered() && c.io.MouseClicked[0] && !c._dd) {
    c._dd = { type: "", data: null, armed: true, id: c.lastItem.id, active: false };
  }
  // 2. Only continue if the drag belongs to THIS item and the mouse is still held
  if (c._dd && c._dd.id === c.lastItem.id && c.io.MouseDown[0]) {
    c._dd.active = true;
    SetTooltip("dragging…");
    return true;
  }
  return false;
}
function SetDragDropPayload(type, data) { const c = ensure(); if (c._dd) { c._dd.type = String(type); c._dd.data = data; c._dd.active = true; } }
function EndDragDropSource() {
  const c = ensure();
  // 3. Mouse released anywhere → always destroy the drag object (no ghosts)
  if (c._dd && !c.io.MouseDown[0]) { c._dd = null; }
}
function BeginDragDropTarget() {
  const c = ensure();
  return !!(c._dd && c._dd.active && IsItemHovered());
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
  PushID, PopID, GetID, GetItemRect, BeginGroup, EndGroup, BeginDisabled, EndDisabled,
  PushItemWidth, PopItemWidth, PushStyleColor, PopStyleColor, PushStyleVar, PopStyleVar, PushStyleVarX, PushStyleVarY, StyleVar,
  GetStyleColorVec4, GetColorU32, StyleColorsDark, StyleColorsClassic, StyleColorsLight,
  SetCursorPos, SetCursorPosX, SetCursorPosY, GetCursorPos, GetCursorScreenPos, SetCursorScreenPos,
  GetContentRegionAvail, GetContentRegionMax, CalcTextSize, AlignTextToFramePadding,
  GetFontSize, GetTextLineHeight, GetTextLineHeightWithSpacing,
  GetFrameHeight, GetFrameHeightWithSpacing, GetTreeNodeToLabelSpacing,
  GetCursorStartPos, GetItemRectMin, GetItemRectMax, GetItemRectSize,
  SetNextItemWidth, CalcItemWidth,
  GetWindowContentRegionMin, GetWindowContentRegionMax,
  GetWindowDrawList, GetBackgroundDrawList, GetForegroundDrawList,
  ImGuiListClipper,
  GetWindowPos, GetWindowSize, GetWindowWidth, GetWindowHeight, IsWindowCollapsed, IsWindowAppearing,
  PushClipRect, PopClipRect, PushFont, PopFont, SetWindowFontScale,
  IsItemActive, IsItemClicked, IsItemEdited, IsItemDeactivated, IsItemDeactivatedAfterEdit,
  IsItemVisible, IsItemToggledOpen, IsWindowHovered, IsWindowFocused, IsRectVisible,
  IsAnyItemActive, IsAnyItemHovered, IsAnyItemFocused,
  SetKeyboardFocusHere, IsMouseClicked, IsMouseDown, IsMouseReleased, IsMouseDragging,
  GetMouseDragDelta, IsMouseHoveringRect, IsKeyDown, GetKeyPressedAmount,
  BeginTooltip, EndTooltip, SetTooltip, SetItemTooltip, SetTooltipV,
  OpenPopup, OpenPopupOnItemClick, IsPopupOpen, CloseCurrentPopup, ClosePopup,
  BeginPopup, EndPopup, BeginPopupModal, EndPopupModal, BeginPopupContextItem, BeginPopupContextWindow, BeginPopupContextVoid,
  BeginMenuBar, EndMenuBar, BeginMainMenuBar, EndMainMenuBar, BeginMenu, EndMenu, MenuItem,
  BeginTabBar, EndTabBar, BeginTabItem, EndTabItem, TabItemButton,
  BeginTable, EndTable, TableSetupColumn, TableHeadersRow, TableNextRow, TableNextColumn,
  TableSetColumnIndex, TableHeader, TableGetColumnIndex, TableGetRowIndex, TableGetColumnCount, TableFlags,
  TableColumnFlags, TableSetBgColor, TableBgTarget,
  TableGetSortSpecs, TableClearSort, TableSetColumnOrder,
  Columns, NextColumn, TreeNodeEx, TreePush, TreePop, SetNextItemOpen, TreeNodeGetOpen,
  BeginDragDropSource, SetDragDropPayload, EndDragDropSource, BeginDragDropTarget, AcceptDragDropPayload, EndDragDropTarget,
  SaveIniSettingsToMemory, LoadIniSettingsFromMemory,
  SetClipboardText, GetClipboardText,
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
  // menu bar (File/Edit) — disabled by request; code kept for easy restore
  // if (ImGui.BeginMenuBar()) {
  //   if (ImGui.BeginMenu("File")) {
  //     if (ImGui.MenuItem("Log ini", "Ctrl+S")) console.log(ImGui.SaveIniSettingsToMemory());
  //     if (ImGui.MenuItem("Metrics")) ShowMetricsWindow._show = true;
  //     ImGui.EndMenu();
  //   }
  //   if (ImGui.BeginMenu("Edit")) {
  //     if (ImGui.MenuItem("Clear plot")) D.plotVals = D.plotVals.map(() => 0.5);
  //     ImGui.EndMenu();
  //   }
  //   ImGui.EndMenuBar();
  // }
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
  if (ImGui.BeginListBox("lb", 0, 0)) {
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
  if (ImGui.BeginTable("t1", 3, ImGui.TableFlags.Borders | ImGui.TableFlags.RowBg | ImGui.TableFlags.Sortable | ImGui.TableFlags.Resizable)) {
    ImGui.TableSetupColumn("Name"); ImGui.TableSetupColumn("HP"); ImGui.TableSetupColumn("Ping");
    ImGui.TableHeadersRow();
    const rows = [
      ["bot_a", "100", "12"],
      ["bot_b", "75", "40"],
      ["bot_c", "50", "88"]
    ];
    const sortSpecs = ImGui.TableGetSortSpecs();
    if (sortSpecs && sortSpecs.SpecsCount > 0) {
      const spec = sortSpecs.Specs[0];
      const colIdx = spec.ColumnIndex;
      const isAsc = spec.SortDirection === 1;
      rows.sort((a, b) => {
        const valA = a[colIdx], valB = b[colIdx];
        const numA = parseFloat(valA), numB = parseFloat(valB);
        if (!isNaN(numA) && !isNaN(numB)) return isAsc ? numA - numB : numB - numA;
        return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    }
    for (const r of rows) {
      ImGui.TableNextRow();
      for (let i = 0; i < 3; i++) { ImGui.TableSetColumnIndex(i); ImGui.Text(r[i]); }
    }
    ImGui.EndTable();
  }
  ImGui.SeparatorText("Advanced table (flag toggles)");
  D._tblFlags = D._tblFlags || { Borders: true, RowBg: true, Resizable: true, Sortable: true, Reorderable: false };
  D._tblFlags.Borders = ImGui.Checkbox("Borders", D._tblFlags.Borders).checked;
  D._tblFlags.RowBg = ImGui.Checkbox("RowBg", D._tblFlags.RowBg).checked;
  D._tblFlags.Resizable = ImGui.Checkbox("Resizable", D._tblFlags.Resizable).checked;
  D._tblFlags.Sortable = ImGui.Checkbox("Sortable", D._tblFlags.Sortable).checked;
  D._tblFlags.Reorderable = ImGui.Checkbox("Reorderable", D._tblFlags.Reorderable).checked;
  let flags = ImGui.TableFlags.None;
  if (D._tblFlags.Borders) flags |= ImGui.TableFlags.Borders;
  if (D._tblFlags.RowBg) flags |= ImGui.TableFlags.RowBg;
  if (D._tblFlags.Resizable) flags |= ImGui.TableFlags.Resizable;
  if (D._tblFlags.Sortable) flags |= ImGui.TableFlags.Sortable;
  if (D._tblFlags.Reorderable) flags |= ImGui.TableFlags.Reorderable;
  if (!D._advRows) {
    const names = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    const actions = ["launch", "scan", "purge", "backup", "deploy", "rotate", "sync", "archive", "notify", "repair"];
    const statuses = ["ok", "warn", "idle", "busy", "error"];
    D._advRows = names.map((n, i) => ({ id: i + 1, name: n, action: actions[i], value: (i * 37) % 101, status: statuses[i % statuses.length] }));
  }
  if (ImGui.BeginTable('advanced_table', 5, flags)) {
    const CF = ImGui.TableColumnFlags;
    ImGui.TableSetupColumn("ID", 0, CF.AlignCenter); ImGui.TableSetupColumn("Name", 0, CF.AlignLeft); ImGui.TableSetupColumn("Action", 0, CF.AlignCenter);
    ImGui.TableSetupColumn("Value", 0, CF.AlignRight); ImGui.TableSetupColumn("Status", 0, CF.AlignCenter);
    ImGui.TableHeadersRow();
    const rows = D._advRows.slice();
    const specs = ImGui.TableGetSortSpecs();
    if (specs && specs.SpecsCount > 0) {
      const spec = specs.Specs[0];
      const keys = ["id", "name", "action", "value", "status"];
      const key = keys[spec.ColumnIndex] || "id";
      const isAsc = spec.SortDirection === 1;
      rows.sort((a, b) => {
        const va = a[key], vb = b[key];
        const na = parseFloat(va), nb = parseFloat(vb);
        if (!isNaN(na) && !isNaN(nb)) return isAsc ? na - nb : nb - na;
        const sa = String(va), sb = String(vb);
        return isAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }
    for (const r of rows) {
      ImGui.TableNextRow();
      ImGui.TableSetColumnIndex(0); ImGui.Text(String(r.id));
      ImGui.TableSetColumnIndex(1); ImGui.Text(r.name);
      ImGui.TableSetColumnIndex(2); ImGui.Text(r.action);
      ImGui.TableSetColumnIndex(3); ImGui.Text(String(r.value));
      ImGui.TableSetColumnIndex(4); ImGui.Text(r.status);
    }
    ImGui.EndTable();
  }
  ImGui.SeparatorText("Legacy columns");
  ImGui.Columns(2);
  for (let r = 0; r < 3; r++) {
    ImGui.Text("left " + r); ImGui.NextColumn();
    ImGui.Text("right " + r); ImGui.NextColumn();
  }
  ImGui.Columns(1);
}

function demoPopups() {
  if (!ImGui.CollapsingHeader("Popups / menus / tabs")) return;
  const notificationButtons = [
    ["Open popup (warning)", ImGui.Notify && ImGui.Notify.ToastType.Warning, "Warning"],
    ["Open popup (success)", ImGui.Notify && ImGui.Notify.ToastType.Success, "Success"],
    ["Open popup (info)", ImGui.Notify && ImGui.Notify.ToastType.Info, "Info"],
    ["Open popup (error)", ImGui.Notify && ImGui.Notify.ToastType.Error, "Error"],
  ];
  for (const [label, type, title] of notificationButtons) {
    if (ImGui.Button(label) && ImGui.Notify && type !== undefined) {
      const toast = ImGui.Notify.Toast(type, 4000, "Dismiss", null, `${title} popup notification`);
      toast.setTitle(title);
      ImGui.InsertNotification(toast);
    }
  }
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
  ImGui.SeparatorText("Input monitor (real-time)");
  const io = ImGui.GetIO();
  ImGui.Text(`MousePos: x=${Math.round(io.MousePos.x)} y=${Math.round(io.MousePos.y)}`);
  ImGui.Text(`MouseWheel: ${io.MouseWheel}`);
  ImGui.Text(`WantCaptureMouse: ${io.WantCaptureMouse}`);
  ImGui.Text(`WantCaptureKeyboard: ${io.WantCaptureKeyboard}`);
  const activeKeys = Object.keys(io.KeysDown).filter((k) => io.KeysDown[k]);
  ImGui.Text(`KeysDown: ${activeKeys.length ? activeKeys.map((k) => `[${k}]`).join(" ") : "(none)"}`);
}

function LogToClipboard() {
  const c = ImGui.GetContext();
  c._logMode = "clipboard";
  c._logBuffer = "";
}

function LogToTTY() {
  const c = ImGui.GetContext();
  c._logMode = "tty";
  c._logBuffer = "";
}

function LogText(str) {
  const c = ImGui.GetContext();
  if (c._logMode) c._logBuffer += String(str);
}

function LogFinish() {
  const c = ImGui.GetContext();
  if (c._logMode === "clipboard") ImGui.SetClipboardText(c._logBuffer);
  else if (c._logMode === "tty") console.log(c._logBuffer);
  c._logMode = null;
  c._logBuffer = "";
}

function ShowAboutWindow(pOpen) {
  ImGui.SetNextWindowSize(420, 280, ImGui.Cond.FirstUseEver);
  const w = ImGui.Begin("About Dear ImGui", pOpen === undefined ? true : pOpen);
  if (pOpen !== undefined && typeof pOpen === "object") pOpen.value = w.open !== false;
  if (w.visible) {
    ImGui.Text("Dear ImGui Browser Port");
    ImGui.TextColored([0.6, 0.8, 1, 1], "Version " + ImGui.VERSION);
    ImGui.Separator();
    ImGui.TextWrapped("Dear ImGui is a bloat-free graphical user interface library for C++ with minimal dependencies. This is a JavaScript/Canvas2D browser port of the original work by Omar Cornut (ocornut) and all ImGui contributors, bundled with a demo, style editor, and metrics windows.");
    ImGui.Spacing();
    if (ImGui.Button("Copy Version Information")) ImGui.SetClipboardText("Dear ImGui " + ImGui.VERSION);
    ImGui.Separator();
    ImGui.TextDisabled("License: MIT");
  }
  ImGui.End();
}

Object.assign(ImGui, { ShowDemoWindow, ShowStyleEditor, ShowMetricsWindow, ShowAboutWindow, LogToClipboard, LogToTTY, LogText, LogFinish, _demoState: D });
global.__IMGUI_DEMO__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);

})();
;(function(){/*__NOTIFY__*/
/* ImGui Browser Port — Toast Notifications (ported from TyomaVader/ImGuiNotify Dev, MIT)
 * ImGuiToast lifecycle, phases, fade, bottom-corner stacking, dismiss/action
 * buttons, render limit — adapted to the Canvas2D overlay layer (unclipped,
 * top Z, above all windows; no multi-viewport needed in the browser).
 * Icons: Font Awesome 6 solid codepoints (from juliettef/IconFontCppHeaders).
 * The FA webfont is loaded at runtime via FontFace when available; otherwise
 * crisp vector fallback glyphs are drawn (zero dependencies, works offline).
 * Requires: ImGui.core.js (+ draw ops renderer). Optional: ImGui.animate.js.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");
const ctx = () => ImGui.GetContext();
const measure = (s) => (ImGui._measure ? ImGui._measure(s) : String(s).length * 7);

// ---------- config (mirrors NOTIFY_* defines) ----------
const Config = {
  maxMsgLength: 4096,
  paddingX: 20,          // screen corner X padding
  paddingY: 20,          // screen corner Y padding
  paddingMessageY: 10,   // padding between stacked toasts
  fadeInOutTime: 250,    // slide+fade ms
  defaultDismiss: 3000,  // auto dismiss ms
  opacity: 0.8,          // peak toast opacity
  useSeparator: false,   // separator between title and content
  useDismissButton: true,// X button top-right
  renderLimit: 5,        // max simultaneous toasts (0 = unlimited)
  position: "BottomRight", // BottomRight | BottomLeft | TopRight | TopLeft
  maxWidth: 320,         // wrap width
  animate: true,         // set false to spawn toasts with zero displacement animation
};

// ---------- enums (ImGuiToastType / Phase / Pos) ----------
const ToastType = { None: 0, Success: 1, Warning: 2, Error: 3, Info: 4, COUNT: 5 };
const ToastPhase = { FadeIn: 0, Wait: 1, FadeOut: 2, Expired: 3, COUNT: 4 };
const ToastPos = {
  TopLeft: 0, TopCenter: 1, TopRight: 2,
  BottomLeft: 3, BottomCenter: 4, BottomRight: 5, Center: 6, COUNT: 7,
};

// ---------- per-type data (colors normalized 0-1; upstream uses 0-255) ----------
const TYPE_INFO = {
  0: { title: null, color: [1, 1, 1, 1], fa: null, vector: null },
  1: { title: "Success", color: [0, 1, 0, 1], fa: "", vector: "check" },
  2: { title: "Warning", color: [1, 1, 0, 1], fa: "", vector: "warn" },
  3: { title: "Error", color: [1, 0, 0, 1], fa: "", vector: "error" },
  4: { title: "Info", color: [0, 0.616, 1, 1], fa: "", vector: "info" },
};
const FA_XMARK = "";
const FA_FONT = "FA6SolidNotify";

// ---------- Font Awesome webfont (runtime, optional) ----------
let _faState = "idle"; // idle | loading | ready | failed
function loadFontAwesome(url) {
  url = url || "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/webfonts/fa-solid-900.woff2";
  if (_faState === "ready") return Promise.resolve(true);
  if (typeof FontFace === "undefined" || typeof document === "undefined") { _faState = "failed"; return Promise.resolve(false); }
  if ([...document.fonts].some((f) => f.family === FA_FONT && f.status === "loaded")) { _faState = "ready"; return Promise.resolve(true); }
  if (_faState === "loading") return Promise.resolve(false);
  _faState = "loading";
  try {
    const face = new FontFace(FA_FONT, "url(" + url + ")", { style: "normal", weight: "900" });
    document.fonts.add(face);
    return face.load().then(() => { _faState = "ready"; return true; })
      .catch(() => { _faState = "failed"; return false; });
  } catch (e) { _faState = "failed"; return Promise.resolve(false); }
}
function faReady() { return _faState === "ready"; }

// ---------- toast object ----------
let _seq = 1;
function Toast(type, dismissTime, content, buttonLabel, onButtonPress) {
  // Flexible args like the C++ ctors: (type, content) / (type, ms, content)
  // / (type, ms, buttonLabel, onPress, content).
  let t = {
    _nid: _seq++,
    type: type || ToastType.None,
    title: "", content: "",
    dismissTime: Config.defaultDismiss,
    buttonLabel: "", onButtonPress: null,
    createdAt: 0, // stamped on first visible frame (queued toasts must not tick early)
  };
  const args = Array.prototype.slice.call(arguments, 1);
  if (args.length === 1 && typeof args[0] === "string") { t.content = args[0]; }
  else if (args.length >= 1) {
    if (typeof args[0] === "number") t.dismissTime = args[0];
    if (typeof args[1] === "string" && typeof args[2] === "function") {
      t.buttonLabel = args[1]; t.onButtonPress = args[2]; t.content = args[3] || "";
    } else if (typeof args[1] === "string") t.content = args[1];
  }
  t.setTitle = function (s) { t.title = String(s).slice(0, Config.maxMsgLength); return t; };
  t.setContent = function (s) { t.content = String(s).slice(0, Config.maxMsgLength); return t; };
  t.setType = function (ty) { t.type = ty; return t; };
  t.setOnButtonPress = function (fn) { t.onButtonPress = fn; return t; };
  t.setButtonLabel = function (s) { t.buttonLabel = String(s); return t; };
  return t;
}
function nowMs() { return (typeof performance !== "undefined" ? performance.now() : Date.now()); }
function elapsedMs(t) { if (!t.createdAt) return 0; return nowMs() - t.createdAt; }
function easeOutQuad(t) { return t * (2 - t); }
function easeInQuad(t) { return t * t; }

function getPhase(t) {
  const e = elapsedMs(t), f = Config.fadeInOutTime;
  if (!Config.animate || f <= 0) return e > t.dismissTime ? ToastPhase.Expired : ToastPhase.Wait;
  if (e > f + t.dismissTime + f) return ToastPhase.Expired;
  if (e > f + t.dismissTime) return ToastPhase.FadeOut;
  if (e > f) return ToastPhase.Wait;
  return ToastPhase.FadeIn;
}
function getFadePercent(t) {
  const ph = getPhase(t), e = elapsedMs(t), f = Config.fadeInOutTime;
  if (!Config.animate || f <= 0) return Config.opacity;
  if (ph === ToastPhase.FadeIn) return (e / f) * Config.opacity;
  if (ph === ToastPhase.FadeOut) return Math.max(0, (1 - (e - f - t.dismissTime) / f)) * Config.opacity;
  return Config.opacity;
}
function getSlideOffset(t, boxW) {
  const ph = getPhase(t), e = elapsedMs(t), f = Config.fadeInOutTime;
  if (!Config.animate || f <= 0) return 0;
  const travelDist = boxW + Config.paddingX + 10;
  if (ph === ToastPhase.FadeIn) {
    const progress = Math.min(1, Math.max(0, e / f));
    return (1 - easeOutQuad(progress)) * travelDist;
  }
  if (ph === ToastPhase.FadeOut) {
    const progress = Math.min(1, Math.max(0, (e - f - t.dismissTime) / f));
    return easeInQuad(progress) * travelDist;
  }
  return 0;
}

// ---------- queue ----------
const _queue = [];
function InsertNotification(toast) { _queue.push(toast); return toast; }
function RemoveNotification(i) { _queue.splice(i, 1); }
function ClearNotifications() { _queue.length = 0; }
function GetNotifications() { return _queue; }

// ---------- layout helpers ----------
function wrapLines(str, maxW) {
  const words = String(str).split(/\s+/).filter((x) => x.length);
  const lines = [];
  let line = "";
  for (const wd of words) {
    const t = line ? line + " " + wd : wd;
    if (measure(t) > maxW && line) { lines.push(line); line = wd; }
    else line = t;
  }
  if (line) lines.push(line);
  // hard-clip overlong single words
  return lines.map((l) => {
    let s = l;
    while (measure(s) > maxW && s.length > 1) s = s.slice(0, -1);
    return s;
  });
}
function withAlpha(col, a) { return [col[0], col[1], col[2], Math.max(0, Math.min(1, a))]; }

// Vector fallback icons (always available, no font needed).
function emitVectorIcon(kind, x, y, s, col) {
  if (kind === "warn") {
    return [
      { t: "polygon", pts: [{ x: x + s / 2, y }, { x: x + s, y: s }, { x, y: s }], col },
      { t: "text", str: "!", x: x + s / 2 - 3, y: y + s * 0.28, col: [0, 0, 0, col[3]] },
    ];
  }
  if (kind === "check") {
    return [
      { t: "circle", x: x + s / 2, y: y + s / 2, r: s / 2 - 1, col, th: 2 },
      { t: "line", x1: x + s * 0.28, y1: y + s * 0.53, x2: x + s * 0.45, y2: y + s * 0.68, col, th: 2 },
      { t: "line", x1: x + s * 0.45, y1: y + s * 0.68, x2: x + s * 0.74, y2: y + s * 0.3, col, th: 2 },
    ];
  }
  if (kind === "error" || kind === "info") {
    return [
      { t: "circle", x: x + s / 2, y: y + s / 2, r: s / 2 - 1, col, th: 2 },
      { t: "text", str: kind === "error" ? "!" : "i", x: x + s / 2 - 2.5, y: y + s * 0.2, col },
    ];
  }
  return [];
}

// ---------- render ----------
let _rects = []; // prev-frame hit rects {kind, toast, x,y,w,h}
let _rectsPrev = [];
let _xId = 1;

function RenderNotifications() {
  const c = ctx();
  // fire-and-forget FA load attempt (once); vectors cover the gap
  if (_faState === "idle") loadFontAwesome();
  c._overlayOps = c._overlayOps || [];
  _rectsPrev = _rects; _rects = [];
  const io = c.io, dw = io.DisplaySize.x, dh = io.DisplaySize.y;
  const pos = Config.position;
  const bottom = pos === "BottomRight" || pos === "BottomLeft";
  const right = pos === "BottomRight" || pos === "TopRight";

  // Expire backwards (upstream forward-erase skips entries — fixed here).
  for (let i = _queue.length - 1; i >= 0; i--) {
    if (getPhase(_queue[i]) === ToastPhase.Expired) _queue.splice(i, 1);
  }
  const limit = Config.renderLimit > 0 ? Config.renderLimit : _queue.length;
  const list = _queue.slice(0, limit);
  const ops = [];
  const push = (op) => ops.push(op);

  // Stacking cursor from the chosen corner.
  let cursor = bottom ? dh - Config.paddingY : Config.paddingY;
  const dir = bottom ? -1 : 1;

  // Click handling uses PREVIOUS frame rects (same preemption model as popups).
  const m = io.MousePos;
  if (io.MouseClicked[0]) {
    for (let i = _rectsPrev.length - 1; i >= 0; i--) {
      const r = _rectsPrev[i];
      if (m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h) {
        if (r.kind === "dismiss") {
          if (Config.animate && Config.fadeInOutTime > 0) {
            r.toast.createdAt = nowMs() - (Config.fadeInOutTime + r.toast.dismissTime);
          } else {
            RemoveNotification(_queue.indexOf(r.toast));
          }
        }
        else if (r.kind === "action" && r.toast.onButtonPress) { try { r.toast.onButtonPress(); } catch (e) { console.error("[Notify]", e); } }
        io.MouseClicked[0] = false; // consume: nothing beneath fires
        break;
      }
    }
  }

  for (const t of list) {
    if (!t.createdAt) t.createdAt = nowMs(); // start lifecycle on first visible frame
    const info = TYPE_INFO[t.type] || TYPE_INFO[0];
    const alpha = getFadePercent(t);
    const title = t.title || info.title || "";
    const content = (t.content || "").slice(0, Config.maxMsgLength);
    const tcol = withAlpha(info.color, alpha);
    const txtCol = [1, 1, 1, alpha];
    const dimTxt = [0.7, 0.7, 0.7, alpha];
    const maxW = Config.maxWidth;
    const pad = 10, iconS = 20, gap = 8;
    const titleH = title ? 18 : 0;
    const clines = content ? wrapLines(content, maxW - pad * 2 - (title ? 0 : 0)) : [];
    const sepH = (Config.useSeparator && title && content) ? 9 : 0;
    const btnH = t.onButtonPress ? 26 : 0;
    const boxH = pad + titleH + (title && content ? 5 : 0) + sepH + clines.length * 16 + btnH + (btnH ? 6 : 0) + pad;
    const boxW = maxW;
    const targetX = right ? dw - Config.paddingX - boxW : Config.paddingX;
    const slideOffset = getSlideOffset(t, boxW);
    const bx = right ? targetX + slideOffset : targetX - slideOffset;
    const by = bottom ? cursor - boxH : cursor;
    // dismiss hit-test uses these coords
    const bg = withAlpha([0.10, 0.10, 0.10, 1], Math.min(1, alpha + 0.2));
    push({ t: "rectFilled", x: bx, y: by, w: boxW, h: boxH, r: 6, col: bg });
    push({ t: "rect", x: bx, y: by, w: boxW, h: boxH, r: 6, col: withAlpha([0.3, 0.3, 0.3, 1], alpha), th: 1 });
    // accent bar in type color
    push({ t: "rectFilled", x: bx, y: by, w: 4, h: boxH, r: 2, col: tcol });
    let cy = by + pad;
    // icon + title row
    if (info.fa || info.vector) {
      const ix = bx + pad + 2, iy = cy - 2;
      if (faReady() && info.fa) {
        push({ t: "text", str: info.fa, x: ix, y: iy, col: tcol, font: "900 15px " + FA_FONT + ", sans-serif" });
      } else if (info.vector) {
        for (const op of emitVectorIcon(info.vector, ix, iy + 1, 15, tcol)) push(op);
      }
    }
    if (title) {
      push({ t: "text", str: title, x: bx + pad + 2 + iconS + gap, y: cy, col: txtCol });
      cy += 18;
    }
    // dismiss X top-right (FA xmark or vector cross)
    if (Config.useDismissButton) {
      const dx = bx + boxW - 22, dy = by + 6;
      if (faReady()) push({ t: "text", str: FA_XMARK, x: dx + 3, y: dy, col: dimTxt, font: "900 12px " + FA_FONT + ", sans-serif" });
      else {
        push({ t: "line", x1: dx + 3, y1: dy + 3, x2: dx + 13, y2: dy + 13, col: dimTxt, th: 2 });
        push({ t: "line", x1: dx + 13, y1: dy + 3, x2: dx + 3, y2: dy + 13, col: dimTxt, th: 2 });
      }
      _rects.push({ kind: "dismiss", toast: t, x: dx, y: dy, w: 16, h: 16 });
    }
    if (title && content) cy += 5;
    if (Config.useSeparator && title && content) {
      push({ t: "line", x1: bx + pad, y1: cy + 2, x2: bx + boxW - pad, y2: cy + 2, col: withAlpha([0.4, 0.4, 0.4, 1], alpha), th: 1 });
      cy += 9;
    }
    for (const ln of clines) { push({ t: "text", str: ln, x: bx + pad, y: cy, col: txtCol }); cy += 16; }
    if (t.onButtonPress) {
      cy += 6;
      const bw2 = Math.min(boxW - pad * 2, measure(t.buttonLabel || "OK") + 24), bh2 = 22;
      const bxx = bx + pad;
      push({ t: "rectFilled", x: bxx, y: cy, w: bw2, h: bh2, r: 4, col: withAlpha([0.26, 0.59, 0.98, 0.6], alpha) });
      push({ t: "text", str: t.buttonLabel || "OK", x: bxx + 12, y: cy + 4, col: txtCol });
      _rects.push({ kind: "action", toast: t, x: bxx, y: cy, w: bw2, h: bh2 });
      cy += bh2;
    }
    // hover captures mouse so the page behind doesn't get events
    if (m.x >= bx && m.x <= bx + boxW && m.y >= by && m.y <= by + boxH) c.anyWindowHovered = true;
    cursor = bottom ? by - Config.paddingMessageY : by + boxH + Config.paddingMessageY;
  }
  // draw above everything, unclipped (own layer, like popup overlay)
  for (const op of ops) {
    if (op.t === "circle") {
      // renderer lacks circle-stroke: emulate with 8 lines? use polyline approx
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push({ x: op.x + Math.cos(a) * op.r, y: op.y + Math.sin(a) * op.r });
      }
      c._overlayOps.push({ t: "polyline", pts, col: op.col, th: op.th || 1.5, closed: true });
    } else c._overlayOps.push(op);
  }
  return _queue.length;
}

const Notify = {
  Config, ToastType, ToastPhase, ToastPos,
  Toast, InsertNotification, RemoveNotification, ClearNotifications, GetNotifications,
  RenderNotifications, loadFontAwesome,
  getPhase, getFadePercent,
};
ImGui.Notify = Notify;
ImGui.InsertNotification = InsertNotification;
ImGui.RenderNotifications = RenderNotifications;

global.__IMGUI_NOTIFY__ = true;
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
    // hidden text input — STRICTLY off-screen (cf. win32 WM_CHAR / glfw
    // CharCallback): it exists only so IME/mobile software keyboards can
    // appear. Desktop keystrokes are routed by the window keydown handler
    // below and rendered 100% in Canvas2D; this element is never positioned
    // over the canvas.
    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = "imgui-ime-capture";
    Object.assign(inp.style, {
      position: "fixed", zIndex: "-1", display: "block",
      top: "-9999px", left: "-9999px", width: "1px", height: "1px",
      opacity: "0", pointerEvents: "none", font: "13px sans-serif",
    });
    document.documentElement.appendChild(inp);
    this.hiddenInput = inp;
    inp.addEventListener("input", () => { if (this.textCommit) this.textCommit(inp.value); });
    inp.addEventListener("keydown", (e) => {
      const cc = ImGui.GetContext();
      if (e.key === "Enter" && cc.activePayload && cc.activePayload.multiline) {
        e.preventDefault();
        cc.activePayload.value += "\n";
        cc.activePayload.cursorPos = cc.activePayload.value.length;
        try { inp.value = cc.activePayload.value; } catch { /* ignore */ }
      } else if (e.key === "Enter" || e.key === "Escape") { this.blurText(); }
      e.stopPropagation();
    });
    // New contract: no coordinates — the DOM box is never shown or moved.
    ImGui._backendFocusText = (cur, commit) => {
      this.textCommit = commit;
      inp.value = cur || "";
      inp.focus();
    };
    ImGui._backendBlurText = () => {
      inp.blur();
      this.textCommit = null;
    };

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
      io.KeysDown[e.code] = true;
      const cc = ImGui.GetContext();
      // Pure canvas text editing: route editing keys straight into the
      // active widget's payload (no DOM element involved).
      if ((cc.activeKind === "text" || cc.activeKind === "segtext") && cc.activePayload) {
        if (e.key === "Backspace") {
          e.preventDefault();
          cc.activePayload.value = cc.activePayload.value.slice(0, -1);
          cc.activePayload.cursorPos = Math.max(0, (cc.activePayload.cursorPos || cc.activePayload.value.length) - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (cc.activePayload.multiline) {
            cc.activePayload.value += "\n";
            cc.activePayload.cursorPos = cc.activePayload.value.length;
          } else {
            cc.activePayload.commit = true;
            this.blurText();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          cc.activePayload.commit = true;
          this.blurText();
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          cc.activePayload.value += e.key;
          cc.activePayload.cursorPos = cc.activePayload.value.length;
        }
        e.stopPropagation(); // the page must never see keys typed into the UI
        return;
      }
      if (io.WantCaptureKeyboard) { e.preventDefault(); e.stopPropagation(); }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey) io.AddInputCharactersUTF8(e.key);
    }, true);
    window.addEventListener("keyup", (e) => { io.KeysDown[e.code] = false; }, true);

    // --- clipboard bridge: keep ImGui's cache in sync with the OS clipboard ---
    const onCopyCut = () => {
      const cc = ImGui.GetContext();
      const sel = global.getSelection ? String(global.getSelection()) : "";
      if (sel) cc._clipboardText = sel;
      const txt = cc._clipboardText || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { navigator.clipboard.writeText(txt).catch(() => {}); } catch { /* ignore */ }
      }
    };
    window.addEventListener("copy", onCopyCut);
    window.addEventListener("cut", onCopyCut);
    window.addEventListener("paste", (e) => {
      const cc = ImGui.GetContext();
      try { cc._clipboardText = (e.clipboardData && e.clipboardData.getData("text")) || ""; } catch { /* ignore */ }
    });
    return this;
  },

  blurText() {
    if (!this.hiddenInput) return;
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
 *   1. Static (preferred, Violentmonkey-native): the 9x `// @require https://...`
 *      lines in the header above point at GamebP/ImGui-JS (raw.githubusercontent,
 *      with `?v=LIB_VERSION` cache-buster). On every update: bump `@version`,
 *      `LIB_VERSION`, and the `?v=` in all 9 @require lines — new URL = new
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
  *   ImGui.animate.js — HImGuiAnimation port: tweens, keyframe sequencer
 *   ImGui.draw.js    — Canvas2D renderer (draw lists -> overlay canvas)
 *   ImGui.widgets.js  — Button/Text/Checkbox/Slider/Input/Combo/... + layout
 *   ImGui.widgets2.js — Arrow/CheckboxFlags/SliderN/VSlider/Drag/InputFloat-Int/
 *                        ColorButton-Picker/Image/Plot/LabelText/SeparatorText/...
 *   ImGui.extended.js  — ID stack, groups, disabled, style stacks, cursor/scroll,
 *                        item+mouse+key queries, tooltip, popup/modal, menubar+menu,
 *                        tabbar, tables, columns, TreeNodeEx, drag&drop, ini
 *   ImGui.demo.js      — ShowDemoWindow/ShowStyleEditor/ShowMetricsWindow
  *   ImGui.notify.js  — toast notifications (ImGuiNotify port, bottom-corner stack)
 *   ImGui.backend.js  — overlay canvas, mouse/keyboard, rAF loop, text input
 *   ImGui.main.js    — THIS FILE: includes + YOUR menu code (edit MY_MENU)
 * ============================================================================
 */
(function () {
"use strict";

const CDN_BASE = "https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/";
const LIB_VERSION = "1.0.42"; // bump on every update: also bump @version + ?v= in @require lines
const LIBS = ["ImGui.core.js", "ImGui.animate.js", "ImGui.draw.js", "ImGui.widgets.js", "ImGui.widgets2.js", "ImGui.extended.js", "ImGui.demo.js", "ImGui.notify.js", "ImGui.backend.js"];

function libsPresent() {
  try {
    return typeof window.ImGui !== "undefined"
      && window.__IMGUI_CORE__ && window.__IMGUI_DRAW__
      && window.__IMGUI_ANIMATE__ && window.__IMGUI_WIDGETS__ && window.__IMGUI_WIDGETS2__
      && window.__IMGUI_EXTENDED__ && window.__IMGUI_DEMO__ && window.__IMGUI_NOTIFY__ && window.__IMGUI_BACKEND__;
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
  ImGui.SetNextWindowSize(340, 0, ImGui.Cond.FirstUseEver); // width 340, height 0 = auto-fit (once; lets user resize after)
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

    // --- collapsible section with real switches ---
    if (ImGui.CollapsingHeader("Features")) {
      for (let i = 0; i < 3; i++) {
        const sw = ImGui.Toggle("feature_" + i, S.sel[i]);
        if (sw.changed) {
          S.sel[i] = sw.checked;
          console.log(`[menu] feature_${i} =`, S.sel[i]);
        }
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
      // A collapsing header has no tree indentation, so the child panel and
      // the following Help section stay aligned when this section is toggled.
      if (ImGui.CollapsingHeader("Child window")) {
        if (ImGui.BeginChild("log", 0, 80, true)) {
          ImGui.TextWrapped("BeginChild/EndChild gives you a bordered sub-panel. Put logs, player lists, console output here.");
          ImGui.BulletText("line 1: hello");
          ImGui.BulletText("line 2: world");
        }
        ImGui.EndChild();
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
    // Render toast notifications on top of all windows
    if (typeof ImGui.RenderNotifications === "function") {
      ImGui.RenderNotifications();
    }
  });
  console.log("%c[ImGui]%c port ready — edit MY_MENU() in ImGui.main.js",
    "background:#1d4ed8;color:#fff;padding:2px 6px;border-radius:4px", "color:inherit");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot().catch(console.error));
else boot().catch(console.error);
})();
