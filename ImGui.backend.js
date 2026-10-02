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
