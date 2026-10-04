// ==UserScript==
// @name         ImGui Browser Port — Bundle (one-click install)
// @namespace    https://github.com/GamebP/ImGui-JS
// @version      1.0.58
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

const IMGUI_VERSION = "1.92.9b-js-port-1.0.58";

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
// Text alignment anchors for Button/Selectable (normalized 2D vectors:
// 0.0 is start, 0.5 is center, 1.0 is end on each axis).
const Align = {
  Center: [0.5, 0.5],
  Left: [0.0, 0.5], CenterLeft: [0.0, 0.5],
  Right: [1.0, 0.5], CenterRight: [1.0, 0.5],
  Top: [0.5, 0.0], CenterTop: [0.5, 0.0],
  Bottom: [0.5, 1.0], CenterBottom: [0.5, 1.0],
  TopLeft: [0.0, 0.0], TopRight: [1.0, 0.0],
  BottomLeft: [0.0, 1.0], BottomRight: [1.0, 1.0],
};
const TextAlign = Align;
// Scalar data types for InputScalar and SliderScalar dispatch.
const DataType = {
  S8: 0, U8: 1, S16: 2, U16: 3, S32: 4, U32: 5, S64: 6, U64: 7, Float: 8, Double: 9,
};
// InputText behavior flags: character filters, callbacks, history.
const InputTextFlags = {
  None: 0,
  CharsDecimal: 1 << 0,
  CharsHexadecimal: 1 << 1,
  CharsUppercase: 1 << 2,
  CharsNoBlank: 1 << 3,
  CallbackCompletion: 1 << 4,
  CallbackHistory: 1 << 5,
  CallbackAlways: 1 << 6,
  CallbackCharFilter: 1 << 7,
  CallbackEdit: 1 << 8,
};
// Combo dropdown policies.
const ComboFlags = {
  None: 0,
  PopupAlignLeft: 1 << 0,
  HeightSmall: 1 << 1,
  HeightRegular: 1 << 2,
  HeightLarge: 1 << 3,
  HeightLargest: 1 << 4,
  NoArrowButton: 1 << 5,
  NoPreview: 1 << 6,
};
// Color editor display and alpha policies.
const ColorEditFlags = {
  None: 0,
  NoAlpha: 1 << 0,
  AlphaBar: 1 << 1,
  AlphaPreview: 1 << 2,
  AlphaPreviewHalf: 1 << 3,
  DisplayRGB: 1 << 4,
  DisplayHSV: 1 << 5,
  DisplayHex: 1 << 6,
};
// Scalar slider scale policies.
const SliderScalarFlags = {
  None: 0,
  Logarithmic: 1 << 0,
};
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
    ButtonTextAlign: { x: 0.5, y: 0.5 },
    SelectableTextAlign: { x: 0.0, y: 0.5 },
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
    // Click-to-focus (cf. imgui.cpp FocusWindow): the title-bar active color
    // follows FOCUS, not hover — hovering a window must never light its title.
    // First begun window starts focused; a left click inside a window (that no
    // popup/modal consumes) moves focus there.
    if (this.focusedWindow === undefined || (this.focusedWindow && ![...this.windows.values()].includes(this.focusedWindow))) this.focusedWindow = w;
    if (inWin && io.MouseClicked[0] && !this._suppressChrome && !this._activeModalRect && !(flags & WindowFlags.NoMouseInputs)) this.focusedWindow = w;
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
      // collapse arrow: explicit single-click target drawn by drawWindow.
      // Placed before the double-click check so arrow clicks are consumed
      // here and never fall through to it or start a title bar move drag.
      if (!this._activeModalRect && inTitle && !(flags & WindowFlags.NoCollapse)) {
        const arrowSize = 16;
        const hasClose = w.open !== null && w.open !== undefined;
        const arrowX = w.pos.x + w.sizeFull.x - (hasClose ? 36 : 14) - 8;
        const arrowY = w.pos.y + (barH - arrowSize) / 2;
        if (m.x >= arrowX && m.x <= arrowX + arrowSize && m.y >= arrowY && m.y <= arrowY + arrowSize) {
          this.hoveredId = collapseId;
          if (io.MouseClicked[0]) {
            w.collapsed = !w.collapsed;
            io.MouseClicked[0] = false; io.MouseDown[0] = false; io._prevDown[0] = false;
          }
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
    // Scrolled child panels translate their content up by their scroll
    // offset (see childClip sy); hit testing follows the same translation
    // for every enclosing child so clicks land on visible rows 1:1.
    const cstack = this._childStack;
    if (cstack && cstack.length && w) {
      const top = w.pos.y + w.titleH;
      const bot = w.pos.y + w.sizeFull.y;
      if (m.y >= top && m.y <= bot) {
        for (const fr of cstack) if (fr.scroll) mouseY += fr.scroll;
      }
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
  VERSION: IMGUI_VERSION, WindowFlags, Cond, Col, Align, TextAlign,
  DataType, InputTextFlags, ComboFlags, ColorEditFlags, SliderScalarFlags,
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
      // TitleBgActive follows FOCUS (click-to-focus, or the window being
      // dragged) — never hover. contentHover is true for every window under
      // the cursor, so using it here flashed all hovered titles bright blue.
      const isDragging = (c.activeKind === "move" && c.activePayload && c.activePayload.win === w);
      const focused = (c.focusedWindow === w) || isDragging;
      const active = focused;
      const r = st.WindowRounding;
      ctx.save();
      // Clip strictly to the window rounded silhouette first: the old square
      // clip plus oversized fill let square blue corners poke past the border
      // and bleed below the separator into the body.
      ctx.beginPath();
      roundRectPath(ctx, x, y, ww, hh, r);
      ctx.clip();
      // Fill exactly the title strip, edge to edge with the inner border.
      ctx.beginPath();
      ctx.rect(x, y, ww, w.titleH);
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
        // overflowing the border leaks into the parent window's layout. A
        // scrolled child (op.sy) translates content up under the same clip.
        ctx.save();
        ctx.beginPath();
        ctx.rect(op.x, op.y, op.w, op.h);
        ctx.clip();
        if (op.sy) ctx.translate(0, -op.sy);
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

})();
;(function(){/*__EXTENDED__*/
/* ImGui Browser Port — Extended (ported from imgui.cpp menus/popups/tabs/tables + misc API)
 * Adds what widgets.js missed: ID stack, groups, disabled blocks, style stacks,
 * cursor/layout queries, item-state queries, mouse/key queries, tooltips, popups +
 * modals, menu bar + menus, tab bar, tables (lite), legacy columns, TreeNodeEx,
 * drag & drop (lite), .ini persistence (GM storage + localStorage fallback), style themes.
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
    // Wheel trap rollover: overlay lists (combo dropdowns, list boxes) own
    // the wheel for one frame after rendering, so the parent window beneath
    // never scrolls while an inner list does.
    c._wheelTrapPrev = c._wheelTrap || [];
    c._wheelTrap = [];
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
    // Standalone ModalDialog owns the whole viewport while open (dimmer
    // covers everything). Re-derived here because this rollover runs inside
    // the first Begin, after the backend pre frame sync, and would otherwise
    // wipe a lock set before userFn ran.
    if (c._modalConfig) {
      c._activeModalRect = { x: 0, y: 0, w: c.io.DisplaySize.x, h: c.io.DisplaySize.y };
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
// Wheel ownership: an overlay list rendered last frame traps the wheel when
// the pointer sits inside its rect, so the parent window skips its own step.
function wheelTrapped(cc) {
  const rects = cc._wheelTrapPrev || [];
  const m = cc.io.MousePos;
  for (const t of rects) {
    if (t && m.x >= t.x && m.x <= t.x + t.w && m.y >= t.y && m.y <= t.y + t.h) return true;
  }
  return false;
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
      // Skipped inside a wheel trapped overlay list (combo dropdowns and
      // virtualized list boxes own the wheel there).
      if (!noScroll && w.scrollMax > 0 && w.contentHover && !w.collapsed && this.io.MouseWheel !== 0 && !wheelTrapped(this) && (this.activeKind !== "slider" && this.activeKind !== "drag" && this.activeKind !== "scroll" && this.activeKind !== "move" && this.activeKind !== "resize")) {
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
    // content-space measurement, no scroll offset involved). Scroll is driven
    // by the true content extent: the trailing bottom padding inside contentH
    // is empty space and must not count toward overflow, or an exactly fitting
    // fill height child would phantom scroll by that padding. A 2px epsilon
    // absorbs fractional rounding, and NoScrollbar and NoScrollWithMouse force
    // a zero scroll state (outer window never scrolls; child panels own any
    // clipping).
    if (w && !w.collapsed && w.size.y > 0 && !(w.flags & ImGui.WindowFlags.AlwaysAutoResize)) {
      const noScroll = (w.flags & ImGui.WindowFlags.NoScrollbar) || (w.flags & ImGui.WindowFlags.NoScrollWithMouse);
      const contentTop = w.pos.y + w.titleH + w.padding.y;
      const contentH = Math.max(0, (w.dc.cursorMaxPos.y - contentTop) + w.padding.y);
      const visibleH = Math.max(0, w.sizeFull.y - w.titleH - w.padding.y * 2);
      const overflow = (contentH - w.padding.y) - visibleH;
      w.scrollMax = (!noScroll && overflow > 2) ? overflow : 0;
      w.scrollY = w.scrollMax === 0 ? 0 : Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
    }
    // Auto-fit windows (size.y == 0) grow unbounded by default. Clamp to the
    // viewport so content can never flow off-screen: the excess becomes
    // scrollable instead of overflowing past the taskbar.
    if (w && !w.collapsed && (w.size.y === 0 || (w.flags & ImGui.WindowFlags.AlwaysAutoResize))) {
      const margin = 20; // keep 20px above the browser edge/taskbar
      const maxH = Math.max(80, this.io.DisplaySize.y - w.pos.y - margin);
      if (w.sizeFull.y > maxH) {
        const noScroll = (w.flags & ImGui.WindowFlags.NoScrollbar) || (w.flags & ImGui.WindowFlags.NoScrollWithMouse);
        const contentTop = w.pos.y + w.titleH + w.padding.y;
        const contentH = Math.max(0, (w.dc.cursorMaxPos.y - contentTop) + w.padding.y);
        w.sizeFull.y = maxH;
        const overflow = (contentH - w.padding.y) - (maxH - w.titleH - w.padding.y * 2);
        w.scrollMax = (!noScroll && overflow > 2) ? overflow : 0;
        w.scrollY = w.scrollMax === 0 ? 0 : Math.max(0, Math.min(w.scrollMax, w.scrollY || 0));
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

// ---------- .ini persistence (GM storage with localStorage fallback) ----------
// Violentmonkey/Tampermonkey persistent storage survives origin clears, CSP
// sandboxing and subdomain isolation that routinely wipe localStorage.
// Requires `// @grant GM_getValue` + `// @grant GM_setValue`; without the
// grants (or outside a userscript manager) it falls back to localStorage.
function storageGet(key, def) {
  try {
    if (typeof GM_getValue !== "undefined") {
      const v = GM_getValue(key, undefined);
      return v === undefined ? def : v;
    }
  } catch { /* GM bridge unavailable */ }
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) return def;
    try { return JSON.parse(raw); } catch { return raw; }
  } catch { return def; }
}
function storageSet(key, val) {
  try {
    if (typeof GM_setValue !== "undefined") { GM_setValue(key, val); return; }
  } catch { /* fall through to localStorage */ }
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ }
}
function storageDel(key) {
  try {
    if (typeof GM_deleteValue !== "undefined") { GM_deleteValue(key); return; }
  } catch { /* fall through */ }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
const INI_KEY = "[ImGui]winpos";
function tryLoadIni(c) {
  try {
    const j = storageGet(INI_KEY, null);
    if (!j || typeof j !== "object") return;
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
}// stash applied on creation
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
    storageSet(INI_KEY, j);
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
const StyleVar = { Alpha: 0, DisabledAlpha: 1, WindowPadding: 2, WindowRounding: 3, WindowBorderSize: 4, WindowMinSize: 5, WindowTitleAlign: 6, ChildRounding: 7, ChildBorderSize: 8, PopupRounding: 9, PopupBorderSize: 10, FramePadding: 11, FrameRounding: 12, FrameBorderSize: 13, ItemSpacing: 14, ItemInnerSpacing: 15, IndentSpacing: 16, CellPadding: 17, ScrollbarSize: 18, ScrollbarRounding: 19, GrabMinSize: 20, GrabRounding: 21, TabRounding: 22, TabBorderSize: 23, TabBarBorderSize: 24, TabBarOverlineSize: 25, TableAngledHeadersAngle: 26, TableAngledHeadersTextAlign: 27, TreeLinesSize: 28, TreeLinesRounding: 29, SeparatorTextBorderSize: 30, SeparatorTextAlign: 31, SeparatorTextPadding: 32, ButtonTextAlign: 33, SelectableTextAlign: 34, COUNT: 35 };
const _StyleVarNames = ["Alpha", "DisabledAlpha", "WindowPadding", "WindowRounding", "WindowBorderSize", "WindowMinSize", "WindowTitleAlign", "ChildRounding", "ChildBorderSize", "PopupRounding", "PopupBorderSize", "FramePadding", "FrameRounding", "FrameBorderSize", "ItemSpacing", "ItemInnerSpacing", "IndentSpacing", "CellPadding", "ScrollbarSize", "ScrollbarRounding", "GrabMinSize", "GrabRounding", "TabRounding", "TabBorderSize", "TabBarBorderSize", "TabBarOverlineSize", "TableAngledHeadersAngle", "TableAngledHeadersTextAlign", "TreeLinesSize", "TreeLinesRounding", "SeparatorTextBorderSize", "SeparatorTextAlign", "SeparatorTextPadding", "ButtonTextAlign", "SelectableTextAlign"];
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
function StyleColorsCatppuccin() {
  // Catppuccin Mocha (https://catppuccin.com/palette): Base/Mantle/Crust
  // surfaces, Sapphire accents, Mauve grabs, Green checkmarks.
  const c = ensure(), C = c.style.Colors;
  const F = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
  C[ImGui.Col.Text] = F(205, 214, 244, 1);
  C[ImGui.Col.TextDisabled] = F(127, 132, 156, 1);
  C[ImGui.Col.WindowBg] = F(30, 30, 46, 0.96);
  C[ImGui.Col.ChildBg] = F(24, 24, 37, 1);
  C[ImGui.Col.PopupBg] = F(24, 24, 37, 0.98);
  C[ImGui.Col.Border] = F(69, 71, 90, 0.8);
  C[ImGui.Col.FrameBg] = F(49, 50, 68, 0.8);
  C[ImGui.Col.FrameBgHovered] = F(69, 71, 90, 1);
  C[ImGui.Col.FrameBgActive] = F(88, 91, 112, 1);
  C[ImGui.Col.TitleBg] = F(24, 24, 37, 1);
  C[ImGui.Col.TitleBgActive] = F(17, 17, 27, 1);
  C[ImGui.Col.TitleBgCollapsed] = F(17, 17, 27, 0.6);
  C[ImGui.Col.MenuBarBg] = F(24, 24, 37, 1);
  C[ImGui.Col.ScrollbarBg] = F(24, 24, 37, 0.6);
  C[ImGui.Col.ScrollbarGrab] = F(69, 71, 90, 1);
  C[ImGui.Col.ScrollbarGrabHovered] = F(88, 91, 112, 1);
  C[ImGui.Col.ScrollbarGrabActive] = F(108, 112, 134, 1);
  C[ImGui.Col.CheckMark] = F(166, 227, 161, 1);
  C[ImGui.Col.SliderGrab] = F(203, 166, 247, 1);
  C[ImGui.Col.SliderGrabActive] = F(203, 166, 247, 0.8);
  C[ImGui.Col.Button] = F(137, 180, 250, 0.4);
  C[ImGui.Col.ButtonHovered] = F(137, 180, 250, 0.8);
  C[ImGui.Col.ButtonActive] = F(137, 180, 250, 1);
  C[ImGui.Col.Header] = F(137, 180, 250, 0.3);
  C[ImGui.Col.HeaderHovered] = F(137, 180, 250, 0.7);
  C[ImGui.Col.HeaderActive] = F(137, 180, 250, 1);
  C[ImGui.Col.Separator] = F(69, 71, 90, 0.8);
  C[ImGui.Col.Tab] = F(49, 50, 68, 1);
  C[ImGui.Col.TabSelected] = F(137, 180, 250, 0.4);
  C[ImGui.Col.TabHovered] = F(137, 180, 250, 0.7);
  C[ImGui.Col.PlotLines] = F(137, 180, 250, 1);
  C[ImGui.Col.PlotHistogram] = F(250, 179, 135, 1);
  C[ImGui.Col.TableHeaderBg] = F(24, 24, 37, 1);
  C[ImGui.Col.TableBorderStrong] = F(69, 71, 90, 1);
  C[ImGui.Col.TableBorderLight] = F(49, 50, 68, 1);
  C[ImGui.Col.TableRowBgAlt] = F(205, 214, 244, 0.06);
  C[ImGui.Col.TextSelectedBg] = F(137, 180, 250, 0.35);
  c.style.WindowRounding = 8;
  c.style.FrameRounding = 5;
  c.style.PopupRounding = 6;
}
function StyleColorsCyberpunk() {
  // Cyberpunk / neon: near-black violet shell, neon-pink borders + title,
  // cyan buttons, yellow checkmarks.
  const c = ensure(), C = c.style.Colors;
  const F = (r, g, b, a = 1) => [r / 255, g / 255, b / 255, a];
  C[ImGui.Col.Text] = F(240, 240, 240, 1);
  C[ImGui.Col.TextDisabled] = F(120, 120, 140, 1);
  C[ImGui.Col.WindowBg] = F(10, 10, 18, 0.96);
  C[ImGui.Col.ChildBg] = F(14, 14, 26, 1);
  C[ImGui.Col.PopupBg] = F(14, 14, 26, 0.98);
  C[ImGui.Col.Border] = F(255, 0, 128, 0.7);
  C[ImGui.Col.FrameBg] = F(20, 20, 35, 1);
  C[ImGui.Col.FrameBgHovered] = F(40, 40, 70, 1);
  C[ImGui.Col.FrameBgActive] = F(60, 60, 100, 1);
  C[ImGui.Col.TitleBg] = F(20, 20, 35, 1);
  C[ImGui.Col.TitleBgActive] = F(255, 0, 128, 0.9);
  C[ImGui.Col.TitleBgCollapsed] = F(255, 0, 128, 0.4);
  C[ImGui.Col.MenuBarBg] = F(14, 14, 26, 1);
  C[ImGui.Col.ScrollbarBg] = F(10, 10, 18, 0.6);
  C[ImGui.Col.ScrollbarGrab] = F(255, 0, 128, 0.6);
  C[ImGui.Col.ScrollbarGrabHovered] = F(255, 0, 128, 0.85);
  C[ImGui.Col.ScrollbarGrabActive] = F(0, 240, 255, 1);
  C[ImGui.Col.CheckMark] = F(255, 230, 0, 1);
  C[ImGui.Col.SliderGrab] = F(255, 0, 128, 1);
  C[ImGui.Col.SliderGrabActive] = F(0, 240, 255, 1);
  C[ImGui.Col.Button] = F(0, 240, 255, 0.35);
  C[ImGui.Col.ButtonHovered] = F(0, 240, 255, 0.8);
  C[ImGui.Col.ButtonActive] = F(0, 240, 255, 1);
  C[ImGui.Col.Header] = F(255, 0, 128, 0.3);
  C[ImGui.Col.HeaderHovered] = F(255, 0, 128, 0.7);
  C[ImGui.Col.HeaderActive] = F(255, 0, 128, 1);
  C[ImGui.Col.Separator] = F(255, 0, 128, 0.5);
  C[ImGui.Col.Tab] = F(20, 20, 35, 1);
  C[ImGui.Col.TabSelected] = F(255, 0, 128, 0.5);
  C[ImGui.Col.TabHovered] = F(0, 240, 255, 0.5);
  C[ImGui.Col.PlotLines] = F(0, 240, 255, 1);
  C[ImGui.Col.PlotHistogram] = F(255, 0, 128, 1);
  C[ImGui.Col.TableHeaderBg] = F(20, 20, 35, 1);
  C[ImGui.Col.TableBorderStrong] = F(255, 0, 128, 0.7);
  C[ImGui.Col.TableBorderLight] = F(60, 60, 100, 1);
  C[ImGui.Col.TableRowBgAlt] = F(0, 240, 255, 0.06);
  C[ImGui.Col.TextSelectedBg] = F(255, 0, 128, 0.35);
  c.style.WindowRounding = 4;
  c.style.FrameRounding = 2;
  c.style.PopupRounding = 4;
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
  const names = ["Checkbox", "Toggle", "CheckboxFlags", "RadioButtonInt", "SliderFloat", "SliderInt", "SliderScalar", "SliderFloat2", "SliderFloat3", "SliderFloat4", "DragFloat", "DragInt", "DragFloat4", "DragInt4", "InputFloat4", "InputText", "InputFloat", "InputInt", "InputDouble", "InputScalar", "ColorEdit4", "ColorEdit3", "ColorPicker4", "Combo", "Selectable", "ListBox", "ListBoxMulti"];
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
    AddLine(p1, p2, col, th) { a.push({ t: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, col, th: th || 1 }); },
    AddRect(p1, p2, col, r, th) { a.push({ t: "rect", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col, th: th || 1 }); },
    AddRectFilled(p1, p2, col, r) { a.push({ t: "rectFilled", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col }); },
    AddRectFilledMultiColor(p1, p2, tl, tr, br, bl) { a.push({ t: "rectGradient", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, tl, tr, br, bl }); },
    AddCircle(cx, cy, r, col, th) { a.push({ t: "circle", x: cx, y: cy, r, col, th: th || 1 }); },
    AddCircleFilled(cx, cy, r, col) { a.push({ t: "circleFilled", x: cx, y: cy, r, col }); },
    AddText(x, y, col, str) { a.push({ t: "text", str, x, y, col }); },
    AddTriangle(p1, p2, p3, col, th) { a.push({ t: "polyline", pts: [p1, p2, p3], col, th: th || 1, closed: true }); },
    AddTriangleFilled(p1, p2, p3, col) { a.push({ t: "polygon", pts: [p1, p2, p3], col }); },
    AddNgon(cx, cy, r, col, n, th) { a.push({ t: "polyline", pts: _ngonPts(cx, cy, r, n), col, th: th || 1, closed: true }); },
    AddNgonFilled(cx, cy, r, col, n) { a.push({ t: "polygon", pts: _ngonPts(cx, cy, r, n), col }); },
    AddPolyline(pts, col, th, closed) { a.push({ t: "polyline", pts: pts.slice(), col, th: th || 1, closed: !!closed }); },
    AddConvexPolyFilled(pts, col) { a.push({ t: "polygon", pts: pts.slice(), col }); },
    AddBezierCubic(p1, p2, p3, p4, col, th) { a.push({ t: "bezierCubic", p1, p2, p3, p4, col, th: th || 1 }); },
    AddBezierQuadratic(p1, p2, p3, col, th) { a.push({ t: "bezierQuad", p1, p2, p3, col, th: th || 1 }); },
  };
}
function GetForegroundDrawList() {
  const c = ensure(); c._overlayOps = c._overlayOps || []; const a = c._overlayOps;
  return {
    AddLine(p1, p2, col, th) { a.push({ t: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, col, th: th || 1 }); },
    AddRect(p1, p2, col, r, th) { a.push({ t: "rect", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col, th: th || 1 }); },
    AddRectFilled(p1, p2, col, r) { a.push({ t: "rectFilled", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, r: r || 0, col }); },
    AddRectFilledMultiColor(p1, p2, tl, tr, br, bl) { a.push({ t: "rectGradient", x: p1.x, y: p1.y, w: p2.x - p1.x, h: p2.y - p1.y, tl, tr, br, bl }); },
    AddCircle(cx, cy, r, col, th) { a.push({ t: "circle", x: cx, y: cy, r, col, th: th || 1 }); },
    AddCircleFilled(cx, cy, r, col) { a.push({ t: "circleFilled", x: cx, y: cy, r, col }); },
    AddText(x, y, col, str) { a.push({ t: "text", str, x, y, col }); },
    AddTriangle(p1, p2, p3, col, th) { a.push({ t: "polyline", pts: [p1, p2, p3], col, th: th || 1, closed: true }); },
    AddTriangleFilled(p1, p2, p3, col) { a.push({ t: "polygon", pts: [p1, p2, p3], col }); },
    AddNgon(cx, cy, r, col, n, th) { a.push({ t: "polyline", pts: _ngonPts(cx, cy, r, n), col, th: th || 1, closed: true }); },
    AddNgonFilled(cx, cy, r, col, n) { a.push({ t: "polygon", pts: _ngonPts(cx, cy, r, n), col }); },
    AddPolyline(pts, col, th, closed) { a.push({ t: "polyline", pts: pts.slice(), col, th: th || 1, closed: !!closed }); },
    AddConvexPolyFilled(pts, col) { a.push({ t: "polygon", pts: pts.slice(), col }); },
    AddBezierCubic(p1, p2, p3, p4, col, th) { a.push({ t: "bezierCubic", p1, p2, p3, p4, col, th: th || 1 }); },
    AddBezierQuadratic(p1, p2, p3, col, th) { a.push({ t: "bezierQuad", p1, p2, p3, col, th: th || 1 }); },
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
    savedMax: { ...dc.cursorMaxPos },
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
  // Popup widgets live at overlay screen coords (viewport center for modals),
  // so their itemSize extents must never leak into the parent: restore the
  // exact pre popup max or the next End() auto fit stretches the host window
  // down to the popup position.
  if (b.savedMax) {
    dc.cursorMaxPos.x = b.savedMax.x;
    dc.cursorMaxPos.y = b.savedMax.y;
  }
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
  // All tabs stay top rounded: the old square overline bar ran full width
  // and filled the active tab corner arcs, leaving 4 sharp corners while
  // inactive tabs kept their rounding. The active tab now reads through its
  // selected background plus the masked baseline alone.
  const r = c.style.TabRounding !== undefined ? c.style.TabRounding : (c.style.FrameRounding || 4);
  emit({ t: "rectTop", x, y, w: tw, h: TAB_H + 1, r, col });
  if (active) {
    t.activeRect = { x, w: tw };
  }
  // Centered label: delta from tab edges is equal on both sides.
  // (measure the *displayed* string so truncated tabs still center).
  // High contrast text: full bright text on active and hover, crisp light
  // text on inactive (TextDisabled grey on slate blue was unreadable).
  const tcol = (active || h)
    ? c.style.Colors[ImGui.Col.Text]
    : [0.85, 0.88, 0.92, 1.0];
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
  try { return storageGet(tablePersistKey(t, kind), null); } catch (e) { return null; }
}
function tableStateSet(t, kind, val) {
  try { storageSet(tablePersistKey(t, kind), val); return true; } catch (e) { return false; }
}
function tableLayout(t) {
  // Column pitch reserves CellPadding.x on both sides so text never clips.
  // Recompute every frame so columns track window width; a column the user
  // dragged (Resizable) keeps its explicit width via t._customWidths.
  const c = ensure(), pad = c.style.CellPadding.x;
  const n = t.cols;
  t.widths = new Array(n); t.offsets = new Array(n);
  const explicit = (t._widths || []).slice(0, n);
  const colFlags = (t._colFlags || []);
  // Sizing policy (imgui.h:2080): 0 = default (StretchSame when ScrollX off),
  // 1 = FixedFit, 2 = FixedSame, 3 = StretchProp, 4 = StretchSame.
  const sizing = ((t.flags >> 13) & 7) || 0;
  const minW = pad * 2 + 10;
  if (sizing === 2) {
    // SizingFixedSame: every column gets the same width, explicit widths ignored.
    for (let i = 0; i < n; i++) t.widths[i] = Math.max(minW, t.avail / n);
  } else if (sizing === 3) {
    // SizingStretchProp: explicit values are weights, unspecified weight 1.
    // Per-column WidthFixed forces pixel interpretation instead.
    let total = 0; const wt = new Array(n);
    for (let i = 0; i < n; i++) {
      const f = colFlags[i] || 0;
      if (f & (1 << 4)) { wt[i] = -Math.max(minW, explicit[i] || minW); }
      else { wt[i] = explicit[i] > 0 ? explicit[i] : 1; total += wt[i]; }
    }
    let fixedPx = 0;
    for (let i = 0; i < n; i++) if (wt[i] < 0) fixedPx += -wt[i];
    const restW = Math.max(0, t.avail - fixedPx);
    for (let i = 0; i < n; i++) t.widths[i] = wt[i] < 0 ? -wt[i] : Math.max(minW, restW * (total > 0 ? wt[i] / total : 1 / n));
  } else if (sizing === 1) {
    // SizingFixedFit: fixed columns keep pixels, auto columns fit header
    // content; leftover space stays empty (no stretching).
    for (let i = 0; i < n; i++) {
      const v = explicit[i] || 0;
      if (v > 0) t.widths[i] = Math.max(minW, v);
      else {
        const nm = (t.names && t.names[i]) || "";
        t.widths[i] = Math.max(minW, measure(nm) + pad * 2 + 8);
      }
    }
  } else {
    // Default / SizingStretchSame: explicit widths are pixels, auto columns
    // split the remainder equally (previous behavior, unchanged).
    let fixed = 0, auto = 0;
    for (let i = 0; i < n; i++) {
      const v = explicit[i] || 0;
      if (v > 0) { t.widths[i] = Math.max(v, minW); fixed += t.widths[i]; } else auto++;
    }
    const rest = Math.max(0, t.avail - fixed);
    const each = auto > 0 ? Math.max(minW, rest / auto) : 0;
    for (let i = 0; i < n; i++) if (!t.widths[i]) t.widths[i] = each;
  }
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
  StyleColorsCatppuccin, StyleColorsCyberpunk,
  StorageGet: storageGet, StorageSet: storageSet,
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
  // Notify styled modal demo (chained confirm with exit site action).
  const showStep1 = () => {
    ImGui.ModalDialog.Show({
      title: "Action Required",
      text: "This is a centered modal dialog styled like ImGuiNotify, with no animation ramps and no accent bars. It completely blocks background clicks.",
      buttons: [
        { label: "Next Step", closeOnClick: false, onClick: showStep2 },
        {
          label: "Close Site",
          onClick: () => {
            try {
              window.open("", "_self", "");
              window.close();
              location.href = "about:blank";
            } catch (e) {
              location.href = "about:blank";
            }
          },
        },
        { label: "Cancel" },
      ],
    });
  };
  const showStep2 = () => {
    ImGui.ModalDialog.Show({
      title: "Step 2: Confirm Action",
      text: "Chained multi step prompts open cleanly without distorting the underlying UI.",
      buttons: [
        {
          label: "Close Tab",
          onClick: () => {
            try {
              window.open("", "_self", "");
              window.close();
              location.href = "about:blank";
            } catch (e) {
              location.href = "about:blank";
            }
          },
        },
        { label: "Back", closeOnClick: false, onClick: showStep1 },
        { label: "Done" },
      ],
    });
  };
  if (ImGui.Button("Open modal")) {
    if (ImGui.ModalDialog) showStep1();
    else ImGui.OpenPopup("modal1");
  }

  // Legacy fallback only when the modal module is absent.
  if (!ImGui.ModalDialog && ImGui.BeginPopupModal("modal1")) { ImGui.Text("modal dialog"); if (ImGui.Button("OK")) ImGui.CloseCurrentPopup(); ImGui.EndPopupModal(); }
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
;(function(){/*__MODAL__*/
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
  // Show(config): { title, text, maxWidth (default 360),
  // buttons: [{ label, onClick, closeOnClick (default true) }] }
  // Dismissal belongs strictly to the button row and the Escape safety key:
  // the card renders no X box.
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

    // Escape is a safety hatch: always dismisses alongside button actions.
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
  hz: 60, // smoothed display refresh rate from rAF deltas (approx monitor Hz)
  // Menu visibility toggle (cheat-overlay QoL): the menu starts open; the
  // user can hide it with a hotkey so the page runs at full native speed.
  // Rebindable at runtime via `Backend.menuToggleKey` (e.g. from a KeyBind
  // widget inside the menu itself).
  menuVisible: true,
  menuToggleKey: "Insert", // e.code for keys ("Insert","Delete","F2",...) or "M1".."M5" for mouse buttons
  // Friendly helper: is a KeyBind-style bind currently active?
  // bindName: e.code ("KeyX","ShiftLeft","Insert",...) or "M1".."M5".
  // isDownOnly=true -> held state; false -> clicked-this-frame edge.
  isKeyOrMouseActive(bindName, isDownOnly = false) {
    if (!bindName || bindName === "None") return false;
    const io = ImGui.GetIO();
    const mouseMap = { M1: 0, M2: 2, M3: 1, M4: 3, M5: 4 };
    if (mouseMap[bindName] !== undefined) {
      const btn = mouseMap[bindName];
      return isDownOnly ? !!io.MouseDown[btn] : !!io.MouseClicked[btn];
    }
    return isDownOnly ? !!io.KeysDown[bindName] : false;
  },
  setMenuVisible(v) {
    this.menuVisible = !!v;
    if (this.canvas) this.canvas.style.display = this.menuVisible ? "block" : "none";
  },
  toggleMenu() { this.setMenuVisible(!this.menuVisible); },
  // Release every held input. Browser reserved combos (Ctrl+Shift+S opens the
  // Firefox screenshot tool, OS shortcuts, focus loss) can swallow keyup and
  // mouseup events, which would otherwise stick in KeysDown and MouseDown and
  // keep the monitor reporting them as held. Called on window blur, while the
  // tab is hidden, and on demand from the Input Monitor clear button.
  clearInputs() {
    const io = ImGui.GetIO();
    io.KeysDown = {};
    io.InputChars = "";
    for (let b = 0; b < 5; b++) io.AddMouseButtonEvent(b, false);
  },
  // Live snapshot for input monitors: currently held keyboard codes plus
  // pressed mouse button names (M1..M5, same naming as KeyBind).
  getHeldInputs() {
    const io = ImGui.GetIO();
    const names = ["M1", "M3", "M2", "M4", "M5"];
    const keys = Object.keys(io.KeysDown).filter((k) => io.KeysDown[k]);
    const buttons = [];
    for (let b = 0; b < 5; b++) if (io.MouseDown[b]) buttons.push(names[b]);
    return { keys, buttons };
  },

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
    // Mouse button index -> KeyBind name (e.button order: left/middle/right/back/forward).
    const mouseNames = ["M1", "M3", "M2", "M4", "M5"];
    window.addEventListener("mousemove", (e) => io.AddMousePosEvent(e.clientX, e.clientY), true);
    document.addEventListener("mouseleave", () => io.AddMousePosEvent(-9999, -9999));
    window.addEventListener("blur", () => {
      io.AddMousePosEvent(-9999, -9999);
      for (let b = 0; b < 5; b++) io.AddMouseButtonEvent(b, false);
      this.clearInputs(); // releases keys stuck by swallowed keyup events
    });
    // Right-clicks inside the UI (or while rebinding) must not open the
    // browser context menu — this is what makes M2 binds usable.
    window.addEventListener("contextmenu", (e) => {
      const cc = ImGui.GetContext();
      if (Backend.menuVisible && (io.WantCaptureMouse || cc.activeKind === "keybind")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    window.addEventListener("mousedown", (e) => {
      const cc = ImGui.GetContext();
      const btn = e.button;
      // 1. KeyBind capture: any mouse button M1..M5 can be bound. The click
      // that opened the listener predates activation, so justActivated guards
      // the (sub-frame) race where the OS repeats the event.
      if (cc.activeKind === "keybind" && cc.activePayload) {
        if (!cc.activePayload.justActivated) {
          cc.activePayload.result = mouseNames[btn] || ("Mouse" + btn);
          cc.activePayload.done = true;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      // 2. Menu toggle bound to a mouse button (e.g. M4/M5 side buttons).
      if (mouseNames[btn] === Backend.menuToggleKey) {
        Backend.toggleMenu();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (btn >= 0 && btn < 5) io.AddMouseButtonEvent(btn, true);
      if (Backend.menuVisible && io.WantCaptureMouse && e.target !== inp) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    window.addEventListener("mouseup", (e) => {
      if (e.button >= 0 && e.button < 5) io.AddMouseButtonEvent(e.button, false);
    }, true);
    window.addEventListener("wheel", (e) => {
      if (Backend.menuVisible && io.WantCaptureMouse) e.preventDefault();
      io.AddMouseWheelEvent(-(e.deltaY || 0) / 100);
    }, { capture: true, passive: false });
    window.addEventListener("keydown", (e) => {
      const cc = ImGui.GetContext();
      // 1. KeyBind capture: any keyboard code can be bound; Escape clears.
      if (cc.activeKind === "keybind" && cc.activePayload) {
        e.preventDefault();
        e.stopPropagation();
        cc.activePayload.result = (e.code === "Escape") ? "None" : (e.code || "None");
        cc.activePayload.done = true;
        return;
      }
      // 2. Menu open/close hotkey — works even while hidden.
      if (e.code === Backend.menuToggleKey) {
        Backend.toggleMenu();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      io.KeysDown[e.code] = true;
      const cc2 = ImGui.GetContext();
      // Pure canvas text editing: route editing keys straight into the
      // active widget's payload (no DOM element involved).
      if ((cc2.activeKind === "text" || cc2.activeKind === "segtext") && cc2.activePayload) {
        const P = cc2.activePayload;
        const TF = ImGui.InputTextFlags || {};
        const fl = P.inputFlags || 0;
        const TE = ImGui._textEdit || null;
        const fireEdit = () => {
          if (TE && P.inputCallback && (fl & (TF.CallbackEdit || 0)) && ImGui.InputTextCallbackData) {
            try { P.inputCallback(new ImGui.InputTextCallbackData(P, TF.CallbackEdit)); }
            catch (err) { console.error("[ImGui] input callback error:", err); }
          }
        };
        const fireKey = (flag, code) => {
          if (P.inputCallback && (fl & flag) && ImGui.InputTextCallbackData) {
            try {
              const d = new ImGui.InputTextCallbackData(P, flag);
              d.EventKey = code || "";
              P.inputCallback(d);
            } catch (err) { console.error("[ImGui] input callback error:", err); }
          }
        };
        const key = e.key || "";
        // Undo and redo history (per widget payload stack, seeded at focus).
        if ((e.ctrlKey || e.metaKey) && !e.altKey && TE && P.history &&
            (key === "z" || key === "Z" || key === "y" || key === "Y")) {
          const redo = (key === "y" || key === "Y") || (e.shiftKey && (key === "z" || key === "Z"));
          e.preventDefault();
          e.stopPropagation();
          if (redo ? TE.redo(P) : TE.undo(P)) fireEdit();
          return;
        }
        // Completion (Tab) and history (Up/Down) callbacks. Tab never moves
        // browser focus while a completion callback owns it.
        if (key === "Tab" && (fl & (TF.CallbackCompletion || 0))) {
          e.preventDefault();
          e.stopPropagation();
          fireKey(TF.CallbackCompletion, e.code || "Tab");
          return;
        }
        if ((key === "ArrowUp" || key === "ArrowDown") && (fl & (TF.CallbackHistory || 0))) {
          e.preventDefault();
          e.stopPropagation();
          fireKey(TF.CallbackHistory, e.code || key);
          return;
        }
        if (key === "Backspace") {
          e.preventDefault();
          P.value = P.value.slice(0, -1);
          P.cursorPos = Math.max(0, (P.cursorPos || P.value.length) - 1);
          fireEdit();
        } else if (key === "Enter") {
          e.preventDefault();
          if (P.multiline) {
            P.value += "\n";
            P.cursorPos = P.value.length;
            fireEdit();
          } else {
            P.commit = true;
            this.blurText();
          }
        } else if (key === "Escape") {
          e.preventDefault();
          P.commit = true;
          this.blurText();
        } else if (key && key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          if (TE ? TE.insert(P, key) : (P.value += key, P.cursorPos = P.value.length, true)) fireEdit();
        }
        e.stopPropagation(); // the page must never see keys typed into the UI
        return;
      }
      if (Backend.menuVisible && (io.WantCaptureKeyboard || (ImGui.ModalDialog && ImGui.ModalDialog.IsOpen()))) { e.preventDefault(); e.stopPropagation(); }
      if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !(ImGui.ModalDialog && ImGui.ModalDialog.IsOpen())) io.AddInputCharactersUTF8(e.key);
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
      // While hidden, keyup and mouseup events are lost, so drop all held
      // state instead of letting keys stick until the next press.
      if (document.hidden) { this.clearInputs(); this.raf = requestAnimationFrame(loop); return; }
      const dt = Math.min(0.1, (t - this.lastT) / 1000 || 1 / 60);
      this.lastT = t;
      // Smoothed frame rate tracks the display refresh (60, 120, 144, 240 Hz).
      const rawHz = 1 / Math.max(1e-3, dt);
      this.hz = this.hz + (rawHz - this.hz) * 0.06;
      const c = ImGui.GetContext();
      // Menu toggled closed: halt UI work and release the page. State is kept
      // (nothing is destroyed) — rendering simply resumes on the next toggle.
      if (!this.menuVisible) {
        c.anyWindowHovered = false;
        c.activeId = 0;
        if (c.activeKind === "keybind") { c.activeKind = null; c.activePayload = null; }
        this.renderer.ctx.clearRect(0, 0, c.io.DisplaySize.x, c.io.DisplaySize.y);
        if (this.canvas) this.canvas.style.pointerEvents = "none";
        this.raf = requestAnimationFrame(loop);
        return;
      }
      c.newFrame(dt);
      // Modal lock first: windows in this frame evaluate under the dialog
      // lock (guarded: split installs without the modal lib skip this).
      if (ImGui.ModalDialog && ImGui.ModalDialog._syncLock) ImGui.ModalDialog._syncLock();
      try { this.userFn(c); } catch (err) { console.error("[ImGui] frame error:", err); }
      // Modal on top: dimmer plus card flush into the overlay layer after all
      // windows and popups. Render dedupes per frame, so manual calls from
      // user menus are safe. Runs before endFrame so hover feeds capture.
      if (ImGui.ModalDialog) ImGui.ModalDialog.Render();
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
 *   1. Static (preferred, Violentmonkey-native): the 10x `// @require https://...`
 *      lines in the header above point at GamebP/ImGui-JS (raw.githubusercontent,
 *      with `?v=LIB_VERSION` cache-buster). On every update: bump `@version`,
 *      `LIB_VERSION`, and the `?v=` in all 10 @require lines — new URL = new
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
 *   ImGui.modal.js   — standalone modal dialogs (notify-styled card, no animation)
 *   ImGui.backend.js  — overlay canvas, mouse/keyboard, rAF loop, text input
 *   ImGui.main.js    — THIS FILE: includes + YOUR menu code (edit MY_MENU)
 * ============================================================================
 */
(function () {
"use strict";

const CDN_BASE = "https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/";
const LIB_VERSION = "1.0.58"; // bump on every update: also bump @version + ?v= in @require lines
const LIBS = ["ImGui.core.js", "ImGui.animate.js", "ImGui.draw.js", "ImGui.widgets.js", "ImGui.widgets2.js", "ImGui.extended.js", "ImGui.demo.js", "ImGui.notify.js", "ImGui.modal.js", "ImGui.backend.js"];

function libsPresent() {
  try {
    return typeof window.ImGui !== "undefined"
      && window.__IMGUI_CORE__ && window.__IMGUI_DRAW__
      && window.__IMGUI_ANIMATE__ && window.__IMGUI_WIDGETS__ && window.__IMGUI_WIDGETS2__
      && window.__IMGUI_EXTENDED__ && window.__IMGUI_DEMO__ && window.__IMGUI_NOTIFY__ && window.__IMGUI_MODAL__ && window.__IMGUI_BACKEND__;
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
  showDash: true, dashTab: 0,
  counter: 0, checked: true, radio: 0,
  fval: 0.5, ival: 42, drag: 1.0,
  name: "player1", hp: 100,
  color: [0.26, 0.59, 0.98, 1],
  combo: 0, comboItems: ["ak-47", "m4a1", "awp", "deagle"],
  sel: [true, false, false],
  listIdx: 1, listItems: ["aimbot", "esp", "bunnyhop", "triggerbot", "skins"],
  progress: 0.33,
  fullOpen: { value: true },
  // --- cheat-overlay QoL state ---
  menuKey: "Insert",          // menu open/close hotkey (rebindable in-menu)
  aimbotKey: "M2",            // right mouse button
  triggerKey: "M4",           // side mouse button
  aimbotEnabled: false,
  triggerEnabled: true,
  flags: { Wallhack: true, Chams: false, Skeletons: true, Snaplines: false },
  theme: 0, themeItems: ["Dark", "Classic", "Light", "Catppuccin", "Cyberpunk"],
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

    // --- text alignment: 9 anchors via ImGui.Align (or {x, y}, or style) ---
    if (ImGui.Button("Left", 90, 0, ImGui.Align.CenterLeft)) S.counter++;
    ImGui.SameLine();
    if (ImGui.Button("Center", 90, 0, ImGui.Align.Center)) S.counter++;
    ImGui.SameLine();
    if (ImGui.Button("Right", 90, 0, ImGui.Align.CenterRight)) S.counter++;
    ImGui.PushStyleVar(ImGui.StyleVar.ButtonTextAlign, [0, 0.5]);
    if (ImGui.Button("Styled left (PushStyleVar)")) S.counter++;
    ImGui.PopStyleVar();

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

    // --- Cheats Combo (compact dropdown, no window scrollbar) ---
    const cb = ImGui.Combo("Cheats", S.listIdx, S.listItems);
    if (cb.changed) S.listIdx = cb.index;

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

    ImGui.SeparatorText("Overlay");
    // Rebindable menu toggle: updates the backend hotkey live.
    const mk = ImGui.KeyBind("Menu toggle key", S.menuKey);
    if (mk.changed) {
      S.menuKey = mk.key;
      ImGui.Backend.menuToggleKey = mk.key;
      console.log("[menu] new toggle key:", S.menuKey);
    }
    ImGui.TextDisabled("Hide the overlay with the toggle key; the page runs natively while hidden.");
  }
  ImGui.End();
}

/* ============ SIDEBAR DASHBOARD — sidebar layout example (EDIT ME) ============
 * Modern vertical-sidebar tool UI: left nav, right content page. Copy this
 * function as a starting point for game-tool / utility / automation overlays.
 */
const DASHBOARD_TABS = ["Aimbot", "Visuals", "Misc", "Settings"];
function DASHBOARD_MENU() {
  const ImGui = window.ImGui;
  ImGui.SetNextWindowSize(540, 360, ImGui.Cond.FirstUseEver);
  const w = ImGui.Begin("Tool Dashboard", S.showDash ? true : false,
    ImGui.WindowFlags.NoCollapse | ImGui.WindowFlags.NoScrollbar | ImGui.WindowFlags.NoScrollWithMouse);
  S.showDash = w.open !== false;
  if (!w.visible) { ImGui.End(); return; }

  // Left column: navigation sidebar
  if (ImGui.BeginChild("##sidebar", 120, 0, true)) {
    DASHBOARD_TABS.forEach((tab, idx) => {
      if (ImGui.Selectable(tab, S.dashTab === idx, 0, [110, 28], ImGui.Align.CenterLeft)) S.dashTab = idx;
    });
  }
  ImGui.EndChild();
  ImGui.SameLine();

  // Right column: active page content
  if (ImGui.BeginChild("##content", 0, 0, true)) {
    if (S.dashTab === 0) {
      ImGui.SeparatorText("Aimbot Configuration");
      S.aimbotEnabled = ImGui.Checkbox("Enable Aimbot", S.aimbotEnabled).checked;
      ImGui.SameLine();
      const ak = ImGui.KeyBind("##AimbotKey", S.aimbotKey);
      if (ak.changed) S.aimbotKey = ak.key;
      S.triggerEnabled = ImGui.Checkbox("Enable Triggerbot", S.triggerEnabled).checked;
      ImGui.SameLine();
      const tk = ImGui.KeyBind("##TriggerKey", S.triggerKey);
      if (tk.changed) S.triggerKey = tk.key;
      ImGui.SeparatorText("Status Monitor");
      const heldA = ImGui.Backend.isKeyOrMouseActive(S.aimbotKey, true);
      ImGui.TextColored(heldA ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
        "Aimbot [" + ImGui.formatKeyName(S.aimbotKey) + "]: " + (heldA ? "ACTIVE (HELD)" : "INACTIVE"));
      const heldT = ImGui.Backend.isKeyOrMouseActive(S.triggerKey, true);
      ImGui.TextColored(heldT ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
        "Trigger [" + ImGui.formatKeyName(S.triggerKey) + "]: " + (heldT ? "ACTIVE (HELD)" : "INACTIVE"));
    } else if (S.dashTab === 1) {
      ImGui.SeparatorText("ESP & Visuals");
      const mc = ImGui.MultiCombo("ESP Flags", S.flags);
      if (mc.changed) console.log("[menu] esp flags =", JSON.stringify(S.flags));
      // Background draw-list ESP: snapline + box drawn under the windows.
      const bg = ImGui.GetBackgroundDrawList();
      const io = ImGui.GetIO();
      const cx = io.DisplaySize.x / 2, bottom = io.DisplaySize.y;
      if (S.flags.Snaplines) bg.AddLine({ x: cx, y: bottom }, { x: cx + 120, y: 200 }, [1, 0, 0, 1], 1.5);
      if (S.flags.Wallhack) bg.AddRect({ x: cx + 80, y: 160 }, { x: cx + 160, y: 260 }, [0, 1, 0, 1], 2, 1.5);
    } else if (S.dashTab === 2) {
      ImGui.SeparatorText("Misc");
      ImGui.TextWrapped("Persisted settings use GM storage (Violentmonkey) with a localStorage fallback, so subdomains and CSPs can't wipe them.");
      if (ImGui.Button("Save flags")) ImGui.StorageSet("[ImGui]demo-flags", { ...S.flags });
      ImGui.SameLine();
      if (ImGui.Button("Load flags")) {
        const saved = ImGui.StorageGet("[ImGui]demo-flags", null);
        if (saved) S.flags = { ...S.flags, ...saved };
      }
      if (ImGui.Button("Reset all (confirm...)")) {
        ImGui.ModalDialog.Show({
          title: "Reset settings",
          text: "This clears all dashboard flags. This cannot be undone. Continue?",
          buttons: [
            {
              label: "Continue", closeOnClick: false,
              onClick: () => {
                for (const k of Object.keys(S.flags)) S.flags[k] = false;
                ImGui.ModalDialog.Show({
                  title: "Done",
                  text: "All flags were cleared.",
                  buttons: [{ label: "OK" }],
                });
              },
            },
            { label: "Cancel" },
          ],
        });
      }
      ImGui.SeparatorText("Input Monitor");
      ImGui.Text("Monitor: " + (ImGui.Backend.hz || 60).toFixed(0) + " Hz");
      const held = ImGui.Backend.getHeldInputs();
      const fmtKeys = held.keys.map((k) => ImGui.formatKeyName(k));
      const fmtBtns = held.buttons.map((b) => ImGui.formatKeyName(b));
      ImGui.TextColored(held.keys.length ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
        "Keys: " + (fmtKeys.length ? fmtKeys.join(" + ") : "(none)"));
      ImGui.TextColored(held.buttons.length ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
        "Mouse: " + (fmtBtns.length ? fmtBtns.join(" + ") : "(none)"));
      if (ImGui.SmallButton("Clear stuck keys")) ImGui.Backend.clearInputs();
      ImGui.TextDisabled("Reserved browser combos can swallow key release. Focus loss auto clears.");
    } else {
      ImGui.SeparatorText("Menu Settings");
      const mk2 = ImGui.KeyBind("Menu Open/Close Key", S.menuKey);
      if (mk2.changed) { S.menuKey = mk2.key; ImGui.Backend.menuToggleKey = mk2.key; }
      ImGui.TextDisabled("Press Escape while binding to set to None.");
      const th = ImGui.Combo("Theme", S.theme, S.themeItems);
      if (th.changed) {
        S.theme = th.index;
        if (S.theme === 1) ImGui.StyleColorsClassic();
        else if (S.theme === 2) ImGui.StyleColorsLight();
        else if (S.theme === 3) ImGui.StyleColorsCatppuccin();
        else if (S.theme === 4) ImGui.StyleColorsCyberpunk();
        else ImGui.StyleColorsDark();
      }
    }
  }
  ImGui.EndChild();

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
      ImGui.Spacing(); // standard dynamic gap before the cheat selector
      // --- Cheats ListBox (hItems = 0 fits all items statically, no scrollwheel) ---
      const lb = ImGui.ListBox("Cheats", S.listIdx, S.listItems, 0);
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
  ImGui.Backend.menuToggleKey = S.menuKey;
  // wait a tick so DisplaySize is correct, then start frame loop
  ImGui.Backend.frame((c) => {
    const dt = c.io.DeltaTime;
    MY_MENU();      // <-- your menu
    DASHBOARD_MENU(); // <-- sidebar dashboard example (KeyBind/MultiCombo/themes/ESP)
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
