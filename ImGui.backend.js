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
