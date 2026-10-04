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
