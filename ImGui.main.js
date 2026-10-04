// ==UserScript==
// @name         ImGui Browser Port — Main Menu
// @namespace    https://github.com/GamebP/ImGui-JS
// @version      1.0.29
// @description  Dear ImGui 1.92.9b window system ported to Violentmonkey (Canvas2D). Drag the demo windows, edit MY_MENU below to build your own menu.
// @match        *://example.com/*
// @noframes
// @grant        none
// @run-at       document-idle
// @downloadURL   https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.main.js
// @updateURL     https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.main.js
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.core.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.animate.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.draw.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.widgets.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.widgets2.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.extended.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.demo.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.notify.js?v=1.0.29
// @require      https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/ImGui.backend.js?v=1.0.29
// ==/UserScript==

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
const LIB_VERSION = "1.0.29"; // bump on every update: also bump @version + ?v= in @require lines
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
