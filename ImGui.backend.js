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
        if (e.key === "Backspace") {
          e.preventDefault();
          cc2.activePayload.value = cc2.activePayload.value.slice(0, -1);
          cc2.activePayload.cursorPos = Math.max(0, (cc2.activePayload.cursorPos || cc2.activePayload.value.length) - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (cc2.activePayload.multiline) {
            cc2.activePayload.value += "\n";
            cc2.activePayload.cursorPos = cc2.activePayload.value.length;
          } else {
            cc2.activePayload.commit = true;
            this.blurText();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          cc2.activePayload.commit = true;
          this.blurText();
        } else if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          cc2.activePayload.value += e.key;
          cc2.activePayload.cursorPos = cc2.activePayload.value.length;
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
