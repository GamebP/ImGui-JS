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
  c._childStack = []; // ImGuiChildStack (shared by widgets.js + widgets2.js)
  }
  // Per-frame rollover: last frame's popup rects become the preemption map.
  // Runs on every ensure() (c.frame bumps in newFrame before any widget).
  if (c._popupRolloverFrame !== c.frame) {
    c._popupRolloverFrame = c.frame;
    c._popupRectsPrev = c._popupRects || {};
    c._popupRects = {};
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
    c._suppressChrome = popupConsumesClick();
    const r = origBegin.call(this, name, pOpen, flags);
    const w = this.current;
    if (w) {
      if (w.scrollY === undefined) w.scrollY = 0;
      if (w.scrollMax === undefined) w.scrollMax = 0;
      const noScroll = (w.flags & ImGui.WindowFlags.NoScrollbar) || (w.flags & ImGui.WindowFlags.NoScrollWithMouse);
      // wheel scroll when hovered (content taller than view); content renders
      // translated by -scrollY in draw.js and is clipped to the viewport.
      if (!noScroll && w.scrollMax > 0 && w.contentHover && !w.collapsed && this.io.MouseWheel !== 0 && this.activeId === 0) {
        w.scrollY = Math.max(0, Math.min(w.scrollMax, w.scrollY - this.io.MouseWheel * (this.style.FontSize * 2)));
      }
      // scrollbar grip drag (uses raw viewport coordinates)
      if (!noScroll && w.scrollMax > 0 && !w.collapsed && w._scrollGrip) {
        const g = w._scrollGrip;
        if (this.activeId === g.id && this.activeKind === "scroll") {
          const m = this.io.MousePos;
          const deltaY = m.y - (this.activePayload && this.activePayload.startMouseY || m.y);
          const scrollDelta = deltaY * (w.scrollMax / Math.max(1, g.bh - g.gripH));
          w.scrollY = Math.max(0, Math.min(w.scrollMax, (this.activePayload && this.activePayload.startScrollY || w.scrollY) + scrollDelta));
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
  // "center" (or ("center","center")) pins the popup to the viewport center;
  // explicit (x, y) wins; otherwise the mouse pos is the anchor.
  if (ax === "center" || ay === "center") c._popupAnchor[key] = { center: true };
  else c._popupAnchor[key] = (ax !== undefined && ay !== undefined) ? { x: ax, y: ay } : { x: m.x, y: m.y };
}
function OpenPopupOnItemClick(id) { if (IsItemClicked(1)) OpenPopup(id); }
function IsPopupOpen(id) { const c = ensure(); return c._popupStack.includes(String(id)); }
function CloseCurrentPopup() { const c = ensure(); c._popupStack.pop(); c._activeModalRect = null; }
function ClosePopup(id) { const c = ensure(); c._popupStack = c._popupStack.filter((p) => p !== String(id)); c._activeModalRect = null; }
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
  if (c.io.MouseClicked[0] && !inside && !modal) ClosePopup(b.key);
  if (c.io.KeysDown["Escape"]) ClosePopup(b.key);
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
  PushID, PopID, GetID, GetItemRect, BeginGroup, EndGroup, BeginDisabled, EndDisabled,
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
