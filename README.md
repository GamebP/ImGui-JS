# ImGui Browser Port (from `imgui-1.92.9b`) → Violentmonkey

## How the ImGui window is made (what was ported)
- `Begin(name, open, flags)` / `End()` — cf. `imgui.h:437-438`, `imgui.cpp:7527-8387`.
  Every frame `Begin` looks up `windows.get(name)` or creates it (`CreateNewWindow`),
  applies staged `SetNextWindowPos/Size` (`NextWindowData`, `imgui.cpp:8756-8805`),
  handles title-bar drag-move (`StartMouseMovingWindow`), bottom-right resize grip,
  double-click collapse, `[x]` close, then sets `cursor` for widgets. `End` auto-fits
  height (`size.y==0`), clamps to screen, pops the window stack. Fixed-height windows
  get wheel scrolling + scrollbar (`ImGui.extended.js` wrapper).
- Widgets follow one pattern (cf. `imgui_widgets.cpp` + `imgui.cpp:11455 ItemAdd`,
  `:5018 ItemHoverable`, `widgets.cpp:545 ButtonBehavior`):
  `getID(label)` → layout box → `itemSize` → `itemAdd` → `buttonBehavior`
  (hover/active/pressed via `hoveredId/activeId`) → push draw ops → `nextLine`.
- Rendering (`imgui_draw.cpp` `ImDrawList`) is adapted: instead of triangle meshes
  we record ops (`rectFilled/rect/line/circle/polyline/polygon/image/text`) per window
  and flush them on a fixed overlay `<canvas>` back-to-front by `window.z`.
- Input (`backends/imgui_impl_win32/glfw/sdl2` + `ImGuiIO Add*Event`, `imgui.h:2556+`):
  `mousemove/mousedown/mouseup/wheel/keydown` on `window` (capture phase) feed
  `io.AddMousePosEvent/AddMouseButtonEvent/AddMouseWheelEvent/AddInputCharactersUTF8`.
  `WantCaptureMouse` = mouse over any window or dragging; when true we
  `preventDefault/stopPropagation` so the page doesn't get the click.
- Style defaults copied from `imgui.cpp:1507-1592` + `StyleColorsDark`
  (`imgui_draw.cpp:187-253`); Classic/Light themes approximated.
- `.ini` window persistence via GM storage (`GM_getValue`/`GM_setValue`) with
  `localStorage` fallback (respects `NoSavedSettings`).

## Files (this folder = `C:\Users\SkyD\Downloads\ImGui\Build`)
| File | What |
|---|---|
| `ImGui.core.js` | Context, IO, style, `Begin/End`, move/resize/collapse, ID hash, layout |
| `ImGui.animate.js` | HImGuiAnimation port: keyframe sequencer, tweens (`ImGui.Animation`) |
| `ImGui.draw.js` | `ImGui.CanvasRenderer` — windows + widgets + polyline/polygon/image on canvas |
| `ImGui.widgets.js` | Base: Text/Button/Checkbox/Slider/Drag/Input/Color/Combo/MultiCombo/KeyBind/Selectable/... |
| `ImGui.widgets2.js` | Arrow/CheckboxFlags/RadioInt/SliderN-Angle-VSlider/DragN/InputFloat-Int-Double/Hint/ColorButton-Picker/Image/Plot/LabelText/Value/SeparatorText/... |
| `ImGui.extended.js` | ID stack, groups, disabled, style stacks, cursor/scroll/ini (GM storage + localStorage fallback), item+mouse+key queries, tooltip, popup/modal, menubar+menu, tabbar, tables, columns, TreeNodeEx, drag&drop, Dark/Classic/Light/Catppuccin/Cyberpunk themes |
| `ImGui.demo.js` | `ShowDemoWindow/ShowStyleEditor/ShowMetricsWindow` (tabbed, exercises all APIs) |
| `ImGui.notify.js` | Toast notifications (ImGuiNotify port: bottom-corner stack, fade, dismiss/action buttons) |
| `ImGui.backend.js` | Overlay canvas, listeners, hidden text input, rAF loop |
| `ImGui.main.js` | **MAIN**: `// @require https://…` ×7 includes + `MY_MENU()` example (edit this) |
| `ImGui.bundle.user.js` | One-click install (all files concatenated, no hosting needed) |
| `build_bundle.py` | Rebuilds the bundle after editing split files (`ORDER` respected) |

## Run it now (no hosting)
1. Open Violentmonkey Dashboard → `+` → New userscript.
2. Paste the entire `ImGui.bundle.user.js`, Save. Reload any `https://` page.
3. Three windows appear: **My Menu ❤** + **Demo** + **full-port Demo** (tabs for
   Widgets / Tables / Menus+Popups / Plots / Misc). Drag titles, resize via corner.

## Use the split `ImGui.main.js` with `https://` includes
1. Pushed to `GamebP/ImGui-JS` — `@require` ×7 + `CDN_BASE` already point at
   `https://raw.githubusercontent.com/GamebP/ImGui-JS/refs/heads/main/`
   with `?v=<version>` cache-buster (currently `?v=1.0.44`) (files live at repo root, no `Build/` prefix).
2. Next update: bump `@version`, `LIB_VERSION`, and the `?v=` in all 7 `@require`
   lines (e.g. `?v=1.0.44` → `?v=1.0.44`). New URL = cache miss, old cached libs are dropped.
3. New userscript ← paste `ImGui.main.js` only. Violentmonkey fetches the 7 libs
   via `https://raw.githubusercontent.com/...` at install. If a lib 404s, the runtime
   fallback in `ensureLibs()` loads them from `CDN_BASE` + `?v=` via `<script src>`.
4. Local dev without pushing: `cd Build && python3 -m http.server 8000`,
   set `CDN_BASE="http://127.0.0.1:8000/"` temporarily.

## Add your own buttons / text / stuff (in `ImGui.main.js` → `MY_MENU()`)
```js
ImGui.Text("hello");
ImGui.TextColored([1,0.3,0.3,1], "red text");
if (ImGui.Button("Clicked: "+S.counter)) S.counter++;
const c = ImGui.Checkbox("Enable ESP", S.checked); S.checked = c.checked;
S.fval = ImGui.SliderFloat("Speed", S.fval, 0, 2).value;
S.name = ImGui.InputText("Name", S.name).text;
const ce = ImGui.ColorEdit4("Color", S.color); if (ce.changed) S.color = ce.color;
const cb = ImGui.Combo("Weapon", S.combo, S.comboItems); if (cb.changed) S.combo = cb.index;
// NEW: full-port APIs all available here too:
ImGui.ArrowButton("arr", 1);
S.fi = ImGui.InputFloat("HP", S.fi || 100).value;
S.pk = ImGui.ColorPicker4("Pick", S.pk || [0.2,0.6,1,1]).color;
ImGui.PlotLines("sig", [0.1,0.5,0.9]);
if (ImGui.BeginMenuBar()) { if (ImGui.BeginMenu("File")) { if (ImGui.MenuItem("Save","Ctrl+S")) save(); ImGui.EndMenu(); } ImGui.EndMenuBar(); }
if (ImGui.BeginTabBar("tb")) { if (ImGui.BeginTabItem("A")) { ImGui.Text("a"); ImGui.EndTabItem(); } ImGui.EndTabBar(); }
if (ImGui.BeginTable("t", 2, ImGui.TableFlags.Borders)) { /* TableSetupColumn/HeadersRow/NextRow/SetColumnIndex */ ImGui.EndTable(); }
if (ImGui.Button("Popup")) ImGui.OpenPopup("p"); if (ImGui.BeginPopup("p")) { ImGui.Text("hi"); ImGui.EndPopup(); }
ImGui.PushID("k"); /* duplicate labels ok */ ImGui.PopID();
ImGui.BeginDisabled(!enabled); ImGui.Button("ghost"); ImGui.EndDisabled();
ImGui.SeparatorText("section"); ImGui.ProgressBar(0.5, "half");
```
Rules: call widgets only between `Begin`/`End`, every frame; keep values in `S`.
`##` hides label text but keeps ID unique: `Button("Save##slot1")`.
Full API tour: open the **full-port Demo** window → each tab shows copy-pasteable usage.

## Overlay QoL: toggle hotkey, KeyBind, MultiCombo, themes, ESP
```js
// Menu starts open; Insert hides it (canvas display:none, zero input capture).
// Rebind live: ImGui.Backend.menuToggleKey = "F2"; // or "M4"/"M5" side buttons
const mk = ImGui.KeyBind("Menu toggle key", S.menuKey); // any key or M1..M5, Esc clears
if (mk.changed) { S.menuKey = mk.key; ImGui.Backend.menuToggleKey = mk.key; }
// Held-or-clicked queries for feature keys:
if (ImGui.Backend.isKeyOrMouseActive(S.aimbotKey, true)) { /* firing */ }
// Multi-select dropdown:
ImGui.MultiCombo("ESP Flags", S.flags); // {Wallhack:true, Chams:false, ...}
// Themes: ImGui.StyleColorsDark/Classic/Light/Catppuccin/Cyberpunk();
// ESP overlays (behind windows) + glow on any shape op ({glow:true, glowBlur:14}):
const bg = ImGui.GetBackgroundDrawList();
bg.AddLine({x: 640, y: 800}, {x: tx, y: ty}, [1,0,0,1], 1.5);
bg.AddRect({x: x1, y: y1}, {x: x2, y: y2}, [0,1,0,1], 2, 1.5);
// Persistent settings: ImGui.StorageGet/StorageSet -> GM_getValue/GM_setValue
// with localStorage fallback (grants: GM_getValue + GM_setValue).
```
See `DASHBOARD_MENU()` in `ImGui.main.js` for a sidebar-layout starter (nav +
content child panels) wiring all of the above.

## Rebuild after edits
`cd Build && python3 build_bundle.py` (regenerates `ImGui.bundle.user.js`).
Verified: `node --check` on all 8 files + headless test calling every new API
(379 draw ops on one fully-exercised frame, boot creates all 3 windows).

## Honest gaps (deliberately NOT ported)
- Docking + multi-viewport platform windows (`DockSpace`, `Viewports`): browser has one page; use multiple `Begin` windows instead.
- TrueType font atlas (`stb_truetype`, `ImFontAtlas` glyph baking): canvas uses system fonts; `PushFont` is a no-op.
- Keyboard/gamepad navigation (`NavMove`, `NavInputs`): mouse + Tab-into-text-input only.
- Complex table features (sorting, resizing, reordering, persistence, frozen rows, clipper): `BeginTable` is an equal-width grid with headers/row-bg/borders.
- Multi-select + `ImGuiSelectionBasicStorage`, text filter `ImGuiTextFilter` (use plain JS arrays).
- Canvas-clipped popups: popups/menus render inside the parent window's clip rect (may cut near edges); fine for menus, not pixel-perfect vs C++.

## Release a new version
`python3 bump_version.py 1.0.3` — bumps `@version`, all 7 `?v=`, `LIB_VERSION`, and rebuilds the bundle in one step.

## Toast notifications (ImGuiNotify port)
```js
ImGui.Notify.InsertNotification(ImGui.Notify.Toast(ImGui.Notify.ToastType.Success, 3000, "Saved!"));
ImGui.Notify.InsertNotification(ImGui.Notify.Toast(ImGui.Notify.ToastType.Error, 5000, "Click me!", () => retry(), "Failed to save"));
// every frame, after your windows (call FIRST if you want clicks consumed before other UI):
ImGui.Notify.RenderNotifications();
```
Types: `Success` (green check), `Warning` (yellow triangle), `Error` (red `!`), `Info` (blue `i`).
Config: `ImGui.Notify.Config` (`dismiss` ms, `opacity`, `renderLimit`, `position`:
`BottomRight` default, also `BottomLeft`/`TopRight`/`TopLeft`).
Icons follow [IconFontCppHeaders](https://github.com/juliettef/IconFontCppHeaders)
(Font Awesome 6 codepoints `f058/f071/f06a/f05a/f00d`, merged at 2/3 size per
their ImGui example). `RenderNotifications()` auto-loads the FA6 solid webfont
from jsDelivr once (`ImGui.Notify.loadFontAwesome(url)` to override); until it
arrives — or offline — crisp vector fallback glyphs are drawn instead.
