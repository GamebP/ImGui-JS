/* ImGui Browser Port — Core (ported from imgui-1.92.9b)
 * Covers: imgui.h Begin/End API, imgui.cpp Begin/End lifecycle,
 *   imgui_internal.h ImGuiWindow + NextWindowData, ImGuiIO input queue,
 *   ImGuiStyle defaults, ID stack + ItemAdd/ButtonBehavior.
 * Exposes: globalThis.ImGui (namespace, created here, extended by widgets/draw/backend)
 * License: MIT (port). Original Dear ImGui (imgui-1.92.9b) is MIT by Omar Cornut.
 */
(function (global) {
"use strict";

const IMGUI_VERSION = "1.92.9b-js-port-1.0.22";

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
