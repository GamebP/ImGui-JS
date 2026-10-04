# ImGui Browser Port (Dear ImGui 1.92.9b to JavaScript and Canvas2D)

Pure JavaScript and Canvas2D port of Dear ImGui window management, widgets, and draw lists, packaged as a browser userscript (Violentmonkey, Tampermonkey). Rendering targets a fixed full viewport overlay canvas. Input is captured on window listeners in the capture phase and fed into an ImGuiIO compatible queue. No DOM controls are rendered. All widgets draw into per window draw lists and flush through CanvasRenderer.

Current release: 1.0.53. Upstream reference: Dear ImGui 1.92.9b (imgui.h, imgui.cpp, imgui_widgets.cpp, imgui_tables.cpp, imgui_draw.cpp, backends for Win32, GLFW, SDL2).

## File Map

- `ImGui.core.js`: context, IO, style, window lifecycle, layout engine
- `ImGui.animate.js`: HImGuiAnimation port (tweens, keyframes)
- `ImGui.draw.js`: CanvasRenderer rasterization
- `ImGui.widgets.js`: core controls (includes KeyBind, MultiCombo)
- `ImGui.widgets2.js`: segmented and secondary controls
- `ImGui.extended.js`: ID stack, popups, menus, tabs, tables, INI storage, themes
- `ImGui.demo.js`: ShowDemoWindow, ShowStyleEditor, ShowMetricsWindow
- `ImGui.notify.js`: ImGuiNotify toast port
- `ImGui.modal.js`: standalone modal dialogs
- `ImGui.backend.js`: overlay canvas, listeners, frame loop, menu toggle
- `ImGui.main.js`: entry script, MY_MENU, DASHBOARD_MENU, boot
- `ImGui.bundle.user.js`: concatenated one file install (regenerated from the split libs after edits)

## 1. ARCHITECTURAL OVERVIEW

Execution sequence per frame:

1. `Backend.frame(userFn)` drives `requestAnimationFrame`. Each tick computes delta time, calls `c.newFrame(dt)`, invokes `userFn(c)`, calls `c.endFrame()`, then calls `renderer.renderFrame(c)`.
2. `newFrame(dt)` advances time, derives per button `MouseClicked` and `MouseReleased` edges from `MouseDown` and previous state, resets the window stack, hover accumulator, and debug rects. `hoveredId` persists only while an item is active.
3. User code calls `Begin` and `End` pairs with widget calls between them. Widgets record draw operations into the current window draw list. No widget draws directly to the canvas.
4. `endFrame()` derives `WantCaptureMouse` (any hover or any active item) and `WantCaptureKeyboard` (text editing active), zeroes wheel and input characters, and clears click and release edges.
5. `renderFrame` clears the canvas, flushes the background draw list layer, draws each open window back to front by `z`, then flushes the overlay layer (popups, combo dropdowns, modal dimmers, foreground draw list).

### ImGui.core.js

Responsibilities:

- `ImGuiContext`: window registry (`windows` map), window stack, ID and item state (`activeId`, `activeKind`, `activePayload`, `hoveredId`, `lastItem`), per frame counters, style, IO, combo state, header open map.
- `ImGuiIO` subset: `DisplaySize`, `DisplayFramebufferScale`, `DeltaTime`, `Time`, `MousePos`, `MouseDown[5]`, `MouseClicked[5]`, `MouseReleased[5]`, `MouseWheel`, `KeysDown` (map of browser `e.code` to boolean), `InputChars`, `WantCaptureMouse`, `WantCaptureKeyboard`, `WantTextInput`. Event entry points: `AddMousePosEvent`, `AddMouseButtonEvent`, `AddMouseWheelEvent`, `AddInputCharactersUTF8`.
- Window temporary data and cursor tracking: each `ImGuiWindow` owns a `dc` block with `cursorPos` (placement cursor, absolute screen space), `cursorPosPrevLine` (line origin), `cursorStartPos` (work area origin), `cursorMaxPos` (content extents), `currLineHeight`, `prevLineHeight`, `isSameLine`, `sameLineSpacing`, `lastItemWidth`, `lastItemHeight`, `_lineUsed`, `_lockFeed`, `_cellStartX`, `_inPopup`.
- Layout engine: `beforeItemPlacement(wd, ht)` performs the implicit line feed (skipped when `_lockFeed` is set for explicit positioning, or offset when `isSameLine` is set by `SameLine`). `itemSize(wd, ht)` advances the cursor horizontally and grows content extents and line height. `itemAdd(x, y, wd, ht, id)` records the last item rect for ID bearing items. `nextLine`, `newLineBreak`, `sameLine` implement explicit breaks. Widgets call `beforeItemPlacement`, draw at the cursor, then call `itemSize`. Widgets never call line feed directly.
- Window lifecycle in `begin(name, pOpen, flags)`: find or create by name hash, apply staged `nextData` (position, size, collapse, focus, scroll, content size, background alpha), assign monotonically increasing `z`, compute `titleH` from `TitleBarHeight` (13 plus twice vertical frame padding, total 19 at default metrics) unless `NoTitleBar`, reset draw list and ID stack, push the window stack, compute `contentHover` (mouse inside window rect and no modal lock), process title bar interactions (close button, single click collapse arrow with an explicit 16px hit box, double click collapse shortcut on empty title areas, move drag, resize grip drag), continue active move and resize drags, reset the `dc` cursor to the work area origin. Returns `{ visible, open, window }`. `end()` computes content height from `cursorMaxPos`, applies auto fit height when `size.y` is 0 or `AlwaysAutoResize` is set, applies fixed sizes, clamps position to the viewport, and pops the stack.
- Hit testing in `hovered(x, y, wd, ht)`: rejects when a modal rect owns input (outside popup content), when the pointer is inside an open combo dropdown rect, menu dropdown rect, or popup rect owned by a previous frame, then translates the raw mouse position into scrolled content space for windows with `scrollY` and tests the rect.
- `buttonBehavior(id, x, y, wd, ht)`: hover assignment, press on left click when no item is active, release to click semantics returning `{ hovered, held, pressed }`. Disabled scopes short circuit to inert results. Popup layer consumption can void a press that dismissed a popup.
- Style constants: full `Col` enum (61 entries, indices 0 to 60 plus renamed aliases), `Cond` (None, Always, Once, FirstUseEver, Appearing), `Align` and `TextAlign` anchor vectors (9 positions as unit pairs), `DataType` scalar kinds (S8 through Double), `InputTextFlags` (filters, Completion, History, Always, CharFilter, Edit), `ComboFlags` (height policies, NoArrowButton, NoPreview), `ColorEditFlags` (alpha, preview, RGB, HSV, hex display), `SliderScalarFlags` (logarithmic scale), `WindowFlags` bit set, `colToCss`, `lerpCol`, `applyStyleDark` (exact dark defaults adapted to opaque window fills so page content never bleeds through), `makeStyleDark` (FontSize 13, WindowPadding 8 by 8, ItemSpacing 8 by 4, ScrollbarSize 14, `ButtonTextAlign` center, `SelectableTextAlign` left centered).
- Hashing: FNV-1a `hashStr` over label strings mixed with the ID stack seed. `findRenderedTextEnd` splits the display label at `##` (right side stays ID only).
- Focus tracking: `focusedWindow` implements click to focus semantics used by title bar coloring. First begun window starts focused. A left click inside a window (when no popup owns the click, no modal is active, and mouse inputs are allowed) moves focus. Stale references to destroyed windows fall back to the current window.

### ImGui.animate.js

Port of HImGuiAnimation:

- Keyframe sequencer with linear and bezier segment interpolation over scalar tracks.
- Immediate mode scalar tweening: `ImGui.Animation.Float(key, target, speed)` returns the current interpolated value for a stable per widget key (used by Toggle pill slide and Button color transitions).
- Immediate mode color tweening: `ImGui.Animation.Color(key, target, speed)` returns the current interpolated RGBA vector (used by Button hover and active transitions).
- Keys are caller supplied strings (conventionally widget ID prefixed). No retained scene graph. Values converge toward targets each frame at the given rate.

### ImGui.draw.js

CanvasRenderer rasterization loop:

- Device pixel ratio scaling (capped at 2). Canvas backing store is resized only when the display size product changes. Each frame starts with `setTransform(dpr, 0, 0, dpr, 0, 0)` followed by a full clear.
- Layer order: background draw list ops (viewport clipped, below all windows), windows sorted ascending by `z`, overlay ops (viewport clipped, topmost). Background and overlay queues are drained after flushing so no stale ops persist.
- `drawWindow`: drop shadow (fixed black blur), window fill with `WindowRounding`, title bar (top rounded clip, `TitleBg` or `TitleBgActive` under focus rules, label, close box, collapse arrow, separator line), border, content ops under an interior clip rect translated by negative rounded `scrollY`, resize grip triangle, unclipped chrome ops (scrollbar track and grip).
- Primitive dispatch in `drawOp`: `rectFilled`, `rect`, `rectTop` (top rounded tab shape with flat bottom), `line`, `polyline` (round joins and caps, optional close), `polygon`, `circle`, `circleFilled`, `bezierCubic`, `bezierQuad`, `rectGradient` (horizontal two stop blend of corner colors), `image` (canvas, image, video, or procedural `{w,h,draw}` painter, with optional border), `text` (with optional word wrap mode), `childClip` (nested clip group for child panels), `pushClip` and `popClip` (manual clip stack).
- Neon glow: any shape op may carry `glow: true` with `glowColor` (defaults to the op color) and `glowBlur` (default 12, aliases `shadowColor` and `shadowBlur`). The renderer applies Canvas2D shadow state around that op only, then restores. Usable for ESP boxes, neon borders, and active highlights without extra draw calls.
- Debug mode: magenta dashed item rects plus a cyan last item rect when `SetDebugMode(true)` is set.

### ImGui.widgets.js

Core controls. Every control follows one pattern: resolve display label, `beforeItemPlacement`, read cursor, `itemSize`, `getID`, `itemAdd`, `buttonBehavior` or hover plus active state machine, emit draw ops. Return values are plain data (booleans or `{changed, value}` style objects). Caller owned state in `S` persists across frames.

- Text: `Text` (with `%s`, `%d`, `%i`, `%f` substitution), `TextColored`, `TextWrapped` (word wrap at available width), `BulletText`. Table cell horizontal alignment and vertical centering handled inside text widgets.
- Buttons: `Button(label, w, h, align)` (auto width from text plus frame padding, animated hover and active colors, 9 anchor text alignment defaulting to style `ButtonTextAlign`), `SmallButton`, `InvisibleButton` (hit area only).
- `Checkbox(label, checked)` returns `{changed, checked}`. 16px box with hand drawn check strokes.
- `Toggle(label, checked)` returns `{changed, checked}`. Pill track (34 by 18) with animated knob position, off color lerped to accent color by animation value.
- `RadioButton(label, active)` returns pressed boolean. Ring plus filled dot.
- Sliders and drags: `SliderFloat` (with `%.Nf` format parsing), `SliderInt`, `SliderScalar` (generic DataType dispatch with linear or logarithmic scale; the Float and Int variants delegate to it), `DragFloat` (horizontal pixel drag with optional range clamp). Slider rows reserve label plus value space from available width.
- `InputText(label, text, flags, hint, callback)` returns `{changed, text}`. Flags select character filters and opt into Completion (Tab), History (Up and Down), Always (every live frame), CharFilter (per keystroke veto or rewrite), and Edit (every mutation) callbacks receiving an `InputTextCallbackData` (buffer accessors, cursor, selection, splice helpers). Per widget undo history answers Ctrl+Z, Ctrl+Y, and Ctrl+Shift+Z. Activation stores `{value, cursorPos, commit}` in `activePayload` and focuses the backend hidden input (strictly off screen, IME and mobile capture only). All rendering is canvas native, including the blinking caret and tail trimming to fit. Commit on outside click, Enter, or Escape. `InputTextMultiline` stacks lines with fixed line height and clips to the box height.
- Color: `ColorEdit3`, `ColorEdit4` (swatch opens a canvas picker popup anchored under the swatch, returns `{changed, color}`).
- Combo: `BeginCombo(label, preview, flags)` draws the trigger, toggles `comboOpen`, stashes the anchor rect. `EndCombo` clears the anchor. `BeginComboPreview` returns the trigger rect for custom preview drawing with `NoPreview`. `Combo(label, current, items, flags)` supports arrays, delimited strings, and getter callbacks, renders height capped dropdowns (Small 4 through Largest viewport rows) with internal wheel scrolling, a scrollbar thumb, above or below flipping, hover highlight, click to select with click consumption, and outside click dismissal. `MultiCombo(label, flagsMap)` renders one checkbox row per key in the same overlay dropdown and mutates the map in place, returning `{changed, flags}`.
- `Selectable(label, selected, flags, sizeArg, align)` with `SelectableFlags` (DontClosePopups, SpanAllColumns, AllowDoubleClick, Disabled, AllowOverlap, Highlight). Text alignment defaults to style `SelectableTextAlign` (left, vertically centered). Consumes popup dismissal rules on press.
- `ListBox(label, current, items, hItems)` renders a virtualized viewport sized to `hItems` rows (only visible rows emit draw ops) with an internal wheel offset, inside a bordered child with 20px rows. `ListBoxMulti(label, selection, items, hItems)` adds Ctrl toggle and Shift range selection over Set, Array, or boolean map inputs.
- `ListBox(label, current, items, hItems)` fits all items (fixed height children do not scroll in this port) inside a bordered child with 20px rows.
- `ProgressBar(frac, label)` clamps fraction to the unit interval.
- Vertical rhythm: `Spacing(height)` reserves a blank line defaulting to twice `ItemSpacing.y` and scaling with style overrides, `Dummy(w, h)` reserves exact pixel gaps.
- Collapsing: `CollapsingHeader` (persisted open state per window plus label key, default open), `TreeNode` (delegates to `TreeNodeEx`), `TreePop`.
- Printf style wrappers: `TextV`, `TextColoredV`, `TextWrappedV`, `BulletTextV`, `TextDisabledV`, `TreeNodeV`, plus exported `formatString`.
- Child windows: `BeginChild(id, wArg, hArg, border)` and `EndChild()`. Width defaults to available content width. Height auto fills remaining window height when `hArg` is 0 or less (negative values reserve padding, C++ style). Child scope isolates indent, line state, and cursor, clips inner ops to the child box, grows auto height boxes to fit overflow, and registers the finished box as a parent line item so `SameLine` chains horizontally (see section 5).
- `KeyBind(label, currentBind)` returns `{changed, key}`. See section 3.
- Window wrappers: `Begin`, `End`, `SetNextWindowPos`, `SetNextWindowSize`, `SetNextWindowCollapsed`, `SetNextWindowFocus`, `SetNextWindowScroll`, `SetNextWindowContentSize`, `SetNextWindowBgAlpha`, `SetWindowPos`, `SetWindowSize`, `SetWindowCollapsed`, `SetWindowFocus`, scroll getters and setters, `IsItemHovered`.

### ImGui.widgets2.js

Segmented and secondary controls:

- `ArrowButton(id, dir)` with left, right, up, down triangle glyphs (direction codes 0 to 3).
- `CheckboxFlags(label, flags, mask)` bit set helper. `RadioButtonInt(label, current, vButton)`.
- Scalar sliders: `SliderFloat2`, `SliderFloat3`, `SliderFloat4` (stacked rows), compact `SliderInt2`, `SliderInt3`, `SliderInt4` (single row partitioned track), `SliderAngle` (radian wrapper over degree slider), `VSliderFloat`, `VSliderInt`, `VSliderScalar` (vertical tracks with mouse Y mapping corrected for scroll).
- Drags: `DragInt`, `DragFloatN`, `DragIntN`, segmented single row `DragFloat4`, `DragInt4` (four independently draggable partitions with shared label), matching segmented `InputFloat4`.
- Numeric inputs: `InputScalar` (generic DataType editor with optional step buttons and Shift fast step), `InputFloat`, `InputInt`, `InputDouble` (all three delegate to `InputScalar`), `InputFloatN`, `InputIntN`, `InputFloat2`, `InputFloat3` (parse guarded, invalid input keeps the old value).
- `InputTextWithHint(label, hint, text, flags)` (hint renders dimmed inside empty boxes).
- `ColorButton` (static swatch button), `ColorPicker3`, `ColorPicker4` (16 by 16 cell SV square plus hue strip, optional alpha bar with checkerboard and gradient, split preview swatch, RGB numeric rows, bidirectional hex field, drag interaction with markers, position clamped inside the window clip).
- `Image`, `ImageButton` (canvas backed, hover outline on buttons).
- `PlotLines`, `PlotHistogram` (legacy array form plus getter form with count, ring buffer offset, and user data; explicit `PlotLinesEx` and `PlotHistogramEx` aliases; auto range with optional explicit scale, bar and polyline modes).
- `LabelText`, `Value` (boolean, integer, float, string dispatch), `TextDisabled`, `SeparatorText` (left aligned label after a 24px rule prefix with a trailing rule, 6px vertical padding each side), `Bullet`, `BeginListBox`, `EndListBox` (child backed, `hArg <= 0` auto fills instead of the legacy fixed 110px default).

### ImGui.extended.js

- ID stack: `PushID`, `PopID`, `GetID`, `GetItemRect`.
- Scopes: `BeginGroup`, `EndGroup` (bounding box item), `BeginDisabled`, `EndDisabled` (depth counter swallowing button family clicks), item width stack (`PushItemWidth`, `PopItemWidth`, `SetNextItemWidth`, `CalcItemWidth`).
- Style stacks: `PushStyleColor`, `PopStyleColor`, `PushStyleVar`, `PushStyleVarX`, `PushStyleVarY`, `PopStyleVar`, plus `StyleVar` index map (includes `ButtonTextAlign` 33 and `SelectableTextAlign` 34), `GetStyleColorVec4`, `GetColorU32`.
- Layout queries: cursor position getters and setters (window local and screen), `GetContentRegionAvail`, `GetContentRegionMax`, `CalcTextSize`, `AlignTextToFramePadding`, font and frame metrics, window position and size getters, collapse and appearing queries, clip rect push and pop, no op font hooks.
- Item state queries: active, clicked, edited, deactivated, deactivated after edit, visible, toggled open, window hovered and focused, rect visibility, any active, hovered, or focused. Edit tracking wraps value widgets and records commit frames.
- Mouse and keyboard queries: `IsMouseClicked`, `IsMouseDown`, `IsMouseReleased`, `IsMouseDragging`, `GetMouseDragDelta`, `IsMouseHoveringRect`, `IsKeyDown` (browser `e.code`), `GetKeyPressedAmount`.
- Tooltips: immediate tooltip box at cursor offset, `SetTooltip`, `SetItemTooltip`, printf variant.
- Popups and modals: `OpenPopup` (explicit, mouse, or viewport center anchors), `OpenPopupOnItemClick`, `IsPopupOpen`, `CloseCurrentPopup`, `ClosePopup`, `BeginPopup`, `EndPopup`, `BeginPopupModal`, `EndPopupModal`, context variants for item, window, and void. Popup content renders in absolute overlay coordinates with per frame rect registration driving next frame click preemption and the modal input lock. Begin and End save and restore the full parent layout state including `cursorMaxPos`, so overlay coords never inflate the host window. Menus share the overlay treatment.
- Menu bars and menus: `BeginMenuBar`, `EndMenuBar`, `BeginMainMenuBar`, `EndMainMenuBar`, `BeginMenu` (single open top level menu with dropdown overlay box and cursor restore), `EndMenu`, `MenuItem` (label, shortcut, selected check, enabled dimming, click closes the chain).
- Tab bars: `BeginTabBar`, `BeginTabItem` (shrink to fit with ellipsis, centered labels, active overline and baseline masking), `EndTabItem`, `EndTabBar` (auto height window horizontal growth), `TabItemButton`.
- Data tables: `BeginTable`, `TableSetupColumn` (width, weight, fixed and stretch sizing policies, alignment flags), `TableHeadersRow` (sortable arrows, resizable column drag with persistence, reorder mapping), `TableNextRow` (row background banding), `TableSetColumnIndex`, `TableNextColumn`, `TableHeader`, index and count getters, `EndTable` (grid lines, outer border, cursor advance). `TableFlags` and `TableColumnFlags` bit sets. `TableSetBgColor` with `TableBgTarget`. Sort specs accessors and column order setters backed by storage.
- Legacy columns: `Columns(count)` and `NextColumn()` with tallest cell row baselines.
- Tree extensions: `TreeNodeEx` (with `SetNextItemOpen` support), `TreePush`, `TreePop`, `TreeNodeGetOpen`.
- Drag and drop (lite): source arming on item click with payload type and data, target hover test, accept on release with preview flag.
- INI serialization: window position, size, and collapse persisted through `ImGui.StorageGet` and `ImGui.StorageSet`, which prefer userscript manager storage and fall back to `localStorage`. Table column widths, orders, and sort state persist per table key. Saves throttle to one write per 1.5 seconds plus write on window close handling.
- Theme presets: `StyleColorsDark`, `StyleColorsClassic`, `StyleColorsLight`, `StyleColorsCatppuccin` (Mocha palette, rounded 8, 5, 6), `StyleColorsCyberpunk` (neon pink borders, cyan buttons, tight rounding).
- Draw list facades: `GetWindowDrawList`, `GetBackgroundDrawList`, `GetForegroundDrawList` with line, rect, filled rect, multicolor rect, circle, filled circle, text, triangle, ngon, polyline, filled polygon, cubic and quadratic bezier primitives.
- Virtualization: `ImGuiListClipper` (uniform height rows, measure first item pass, seek and tail reservation).
- Clipboard: `SetClipboardText`, `GetClipboardText` (in memory cache bridged to the OS clipboard on copy, cut, and paste events).

### ImGui.notify.js

Port of ImGuiNotify toasts:

- `ImGui.Notify.Toast(type, durationMs, message, onClick, title)` constructs a toast. `ImGui.Notify.ToastType` provides Success, Warning, Error, Info variants with distinct colors and glyphs.
- `ImGui.Notify.InsertNotification(toast)` pushes onto the stack. `ImGui.Notify.RenderNotifications()` draws the stack each frame after user windows.
- Stacking cursor starts from the configured corner (`ImGui.Notify.Config.position`: BottomRight default, BottomLeft, TopRight, TopLeft) with fade alpha from `Config.opacity`, a render limit from `Config.renderLimit`, and per toast dismiss timing from `Config.dismiss`.
- Lifecycle phases: FadeIn, Wait, FadeOut, Expired. Expired toasts are removed. Clicking the dismiss box removes a toast. Action toasts invoke the callback on body click.
- Glyphs follow IconFontCppHeaders Font Awesome 6 codepoints, loaded once as a webfont from jsDelivr (`ImGui.Notify.loadFontAwesome(url)` overrides the source). Until the font arrives, or offline, crisp vector fallback glyphs render instead.

### ImGui.modal.js

Standalone modal dialogs (original design, notify styled card without accent bar or animation):

- `ImGui.ModalDialog.Show(config)` with `{ title, text, maxWidth (default 360), buttons: [{ label, onClick, closeOnClick (default true) }] }`. Dismissal belongs to the button row and the Escape safety key. No X box is rendered.
- `ImGui.ModalDialog.Close()` clears state and releases the modal lock (unless a popup modal is still open). `ImGui.ModalDialog.IsOpen()` reports presence.
- `ImGui.ModalDialog.Render()` draws the fullscreen dimmer (`rgba(0,0,0,0.6)`), the centered card (fill `[0.10, 0.10, 0.10, 0.95]`, border `[0.3, 0.3, 0.3, 1.0]`, rounding 6), the word wrapped body, and the right aligned button row into the overlay layer. Buttons arm on left press and fire on release over the same box. Callbacks may chain into `Show` for multi step flows (a sequence counter skips auto close when a new dialog opens inside `onClick`).
- Input beneath is blocked through the core modal lock, re-derived every frame in the style rollover plus a backend pre frame sync, with a keyboard capture gate and char feed block while open. The backend loop auto renders after `userFn` (per frame deduped, manual calls safe).

### ImGui.backend.js

- Overlay setup: creates `#imgui-overlay` fixed canvas (full viewport, configurable z index defaulting to maximum signed 32 bit range minus 2, transparent background, `pointerEvents: none`) and `#imgui-ime-capture` hidden text input (positioned off screen, used for IME and mobile keyboards only, never overlaid on widgets).
- Mouse: `mousemove` feeds position, `mouseleave` and window `blur` park the pointer off screen and release all buttons, `mousedown` and `mouseup` feed buttons 0 to 4 (left, middle, right, back, forward), `wheel` feeds a scaled delta. Capture phase listeners call `preventDefault` and `stopPropagation` only when the menu is visible and `WantCaptureMouse` is set (keyboard capture gated the same way on `WantCaptureKeyboard`), so the page receives raw events otherwise.
- Mouse button naming for binds: `e.button` index maps through `["M1", "M3", "M2", "M4", "M5"]` (left, middle, right, back, forward).
- Keyboard: `keydown` and `keyup` maintain `KeysDown` by `e.code`. Text editing routes Backspace, Enter, Escape, Tab (completion), Up and Down (history), Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z (undo and redo), and filtered printable characters into the active payload and hides them from the page. KeyBind listening intercepts all keys into the pending payload. The menu toggle key is matched before normal routing and works while hidden.
- Context menu: suppressed when the menu is visible and the pointer is captured or a KeyBind is listening, which is what makes right click (`M2`) binds usable.
- Frame driver: `frame(userFn)` runs the loop with hidden tab skipping. When the menu is toggled closed, the loop clears the canvas, resets hover and active bind state, keeps `pointerEvents: none`, skips `userFn`, and schedules the next frame. Otherwise it runs `newFrame`, `userFn` with error isolation, `endFrame`, cursor styling (resize, move, default), and `renderFrame`.
- Menu visibility toggle state machine: `Backend.menuVisible` (true on load), `Backend.menuToggleKey` (default `"Insert"`, rebindable to any `e.code` or `M1` to `M5`), `setMenuVisible`, `toggleMenu`, canvas display toggling between `block` and `none`.
- Stuck input recovery: `Backend.clearInputs()` drops all held keys, chars, and buttons. It runs on window blur, on every hidden tab frame, and from the Input Monitor clear button, which cures keys stuck by browser swallowed releases (example: Ctrl+Shift+S opening the Firefox screenshot tool).
- Live input introspection: `Backend.getHeldInputs()` returns held keyboard codes plus pressed `M1` to `M5` names for monitors. `Backend.hz` tracks the smoothed frame rate (the display refresh rate) from loop deltas.

### ImGui.main.js

Entry script and example content:

- Userscript header with `@match`, `@grant GM_getValue` and `GM_setValue`, versioned `@require` lines plus `LIB_VERSION` cache buster, and a dynamic CDN fallback loader (`ensureLibs`) for local development.
- Persistent state object `S` (demo values plus overlay state: menu key, feature keys, feature flags, theme index).
- `MY_MENU()`: example window (aligned buttons, checkbox, sliders, text input, color editor, combo, spacing and dummy rhythm, collapsible toggles, overlay toggle KeyBind row).
- `DASHBOARD_MENU()`: sidebar dashboard starter (navigation child plus content child, feature KeyBinds, held state monitor, MultiCombo flags page, GM storage save and load plus Input Monitor with Hz readout and modal confirm demo, theme selector page, background draw list ESP sample).
- `DEMO_WINDOW(dt)`: reference window exercising progress, list box, child panels, and SameLine rows.
- `boot()`: creates context, initializes backend, syncs the toggle key from state, starts the frame loop calling user menus, the full port demo window, and notification rendering.

## 2. What Is Added and What Is Missing

Upstream parity audit against Dear ImGui 1.92.9b (`imgui.h`, `imgui_internal.h`, `imstb_truetype.h`, `imgui_tables.cpp`). `[x]` is implemented in this port. `[ ]` is missing, partial, or intentionally omitted.

### Core Window and Viewport Mechanics

- [x] Begin and End window lifecycle with name identity and open flags
- [x] Title bar drag move, resize grip, single click collapse arrow with explicit hit box, double click collapse shortcut, close button
- [x] Auto fit height, fixed sizes, viewport clamping, z ordering
- [x] SetNextWindowPos, Size, Collapsed, Focus, Scroll, ContentSize, BgAlpha
- [x] SetWindowPos, Size, Collapsed, Focus
- [x] Wheel scrolling plus scrollbar track and grip drag
- [x] Modal input lock and popup click preemption
- [x] Click to focus window tracking for title active state
- [x] INI window position, size, and collapse persistence (GM storage with localStorage fallback)
- [ ] Docking: DockSpace, DockBuilder, docked window nodes, dock persistence
- [ ] Multi viewport platform windows and per viewport DPI handling
- [ ] Window appearing and focus order APIs beyond the focused window subset (partial: appearing and focused queries exist)
- [ ] Background dimming policies for popups beyond modal dim (partial: modal dim only)
- [ ] Settings handlers for custom sections (only window and table sections persist)

### Font Engine and Text Rasterization

- [x] System font text measurement and rendering through Canvas2D
- [x] Text wrapping, ellipsis truncation in tabs, tail trimming in inputs
- [x] CalcTextSize and font and frame metric queries
- [ ] ImFontAtlas construction and stb_truetype glyph baking
- [ ] Custom font loading from files or memory, glyph ranges, oversampling
- [ ] Font merging at alternate sizes (partial: notify webfont only, icons only)
- [ ] PushFont and PopFont (present as no ops), SetWindowFontScale (no op)
- [ ] Per glyph advance, kerning, and fallback character control
- [ ] Texture backed glyph cache and font texture UV queries

### Primitive Drawing and Meshing (ImDrawList)

- [x] rectFilled, rect, rectTop, line, polyline, polygon, circle, circleFilled
- [x] Cubic and quadratic beziers, multicolor rect fill, image blit, text
- [x] Clip groups (childClip, pushClip, popClip), background and foreground layers
- [x] Neon glow extension on shape ops (port addition)
- [ ] Indexed triangle mesh with frustum clipping and anti alias flags
- [ ] DrawList channels (split, merge, set current)
- [ ] Draw callbacks and user texture IDs on triangles
- [ ] Path API (PathLineTo, PathArcTo, PathBezier, PathStroke, PathFillFast, PathClear)
- [ ] Primitive reservation and indexed direct write (PrimReserve, PrimUnreserve, PrimRect, PrimVtx)
- [ ] Textured and thick polyline controls beyond round joins (partial: width only)

### Input, Navigation, and Accessibility

- [x] Mouse position, five buttons with click and release edges, wheel
- [x] Full keyboard state by browser e.code plus printable character queue
- [x] WantCaptureMouse and WantCaptureKeyboard gating with page passthrough
- [x] IME and mobile capture through a hidden off screen input
- [x] OS clipboard bridge on copy, cut, and paste
- [ ] Keyboard and gamepad navigation (NavMoveRequest, nav focus scopes, nav highlight rect)
- [ ] Arrow key and tab focus traversal between widgets
- [ ] Shortcut routing (MapShortcut, SetNextItemShortcut)
- [ ] Drag threshold, double click timing, and key repeat tuning APIs
- [ ] Mouse cursor kinds beyond move, resize, and default CSS cursors
- [ ] Touch pressure, pen, and multi touch gesture input
- [ ] ARIA roles, screen reader labels, and high contrast assist hooks

### Widget Coverage and Variations

- [x] Button, SmallButton, InvisibleButton, Checkbox, RadioButton, Toggle pill (port addition)
- [x] Button and Selectable 9 anchor text alignment via style defaults plus per call override (mirrors upstream `ButtonTextAlign` and `SelectableTextAlign`)
- [x] Spacing with optional pixel height and Dummy exact gaps (upstream rhythm helpers)
- [x] Friendly key names via `ImGui.formatKeyName` across binds and monitors (port addition)
- [x] SliderFloat, SliderInt, DragFloat, InputText, InputTextMultiline
- [x] ColorEdit3, ColorEdit4 with canvas picker popup
- [x] Combo, BeginCombo, EndCombo, Selectable, ListBox, ProgressBar
- [x] KeyBind universal key and mouse capture (port addition)
- [x] MultiCombo multi select dropdown (port addition)
- [x] ArrowButton, CheckboxFlags, RadioButtonInt
- [x] SliderFloat2, 3, 4, compact SliderInt2, 3, 4, SliderAngle, VSliderFloat, VSliderInt, VSliderScalar
- [x] DragInt, DragFloatN, DragIntN, DragFloat4, DragInt4
- [x] InputFloat, InputInt, InputDouble, InputFloatN, InputIntN, InputFloat2, 3, 4, InputTextWithHint
- [x] ColorButton, ColorPicker3, ColorPicker4, Image, ImageButton
- [x] PlotLines, PlotHistogram, LabelText, Value, TextDisabled, SeparatorText (left aligned), Bullet, BeginListBox (auto fill default), EndListBox
- [x] CollapsingHeader, TreeNode, TreeNodeEx, TreePush, TreePop, SetNextItemOpen
- [x] InputScalar and SliderScalar generic dispatch over DataType enums (S8 through Double with limits, integer rounding, and format defaults; InputFloat, InputInt, InputDouble, SliderFloat, and SliderInt delegate to them)
- [x] InputText callbacks (Completion, History, Always, CharFilter, Edit), character filters (decimal, hexadecimal, uppercase, no blank), callback data with buffer and selection editing, and per widget undo and redo history (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- [x] Combo height policies (Small 4, Regular 8, Large 20, Largest viewport rows) with internal wheel scrolling, plus custom preview scope (BeginComboPreview) and NoArrowButton and NoPreview trigger modes
- [x] ListBox clipper virtualization (only visible rows emit draw ops) with internal wheel offset, plus ListBoxMulti with Ctrl toggle and Shift range selection over Set, Array, or boolean map inputs
- [x] ColorPicker alpha bar with checkerboard and gradient, split original versus edited preview swatch, RGB numeric rows, and bidirectional hex field (NoAlpha, AlphaBar, AlphaPreview, DisplayRGB, DisplayHex flags)
- [x] Plot array plus function getter feeds with count, ring buffer offset, and user data (PlotLines, PlotHistogram, and explicit Ex forms; legacy positional calls dispatch unchanged)
- [ ] ImageButton with UV tiling and tint options (partial: full blit only)
- [ ] DragDropSource with OS payload and drag preview window (partial: lite payload plus tooltip)
- [ ] BeginComboPreview and ComboPreviewData

### Tables and Layout Containers

- [x] BeginTable, EndTable, TableSetupColumn, TableHeadersRow, TableNextRow, TableNextColumn, TableSetColumnIndex
- [x] Sizing policies (FixedFit, FixedSame, StretchProp, StretchSame), resizable columns with persistence
- [x] Sortable headers with sort specs, column order persistence, row background banding, borders
- [x] TableSetBgColor with TableBgTarget, TableGetSortSpecs, TableClearSort, TableSetColumnOrder
- [x] Legacy Columns and NextColumn, BeginChild and EndChild with SameLine chaining
- [x] ImGuiListClipper uniform row virtualization
- [ ] Scrollable tables with ScrollX and ScrollY plus frozen rows and columns
- [ ] Hideable columns with context menu, angled headers, column flags queries
- [ ] Per cell background with draw channels and spanning cells
- [ ] Table draw channel splitting for overlapping content
- [ ] Nested tables and table initiated popup context menus
- [ ] Column auto width measurement from body content (partial: header fit plus weights)

### Extensions and Non Vanilla Additions

- [x] HImGuiAnimation tween and keyframe layer (ImGui.Animation.Float, ImGui.Animation.Color)
- [x] ImGuiNotify toast system with lifecycle phases and action buttons
- [x] KeyBind universal capture widget with mouse button support
- [x] MultiCombo multi select dropdown widget
- [x] Toggle pill switch widget
- [x] Runtime menu toggle engine with rebindable hotkey and zero cost hidden mode
- [x] GM storage persistence with localStorage fallback (ImGui.StorageGet, ImGui.StorageSet)
- [x] StyleColorsCatppuccin and StyleColorsCyberpunk theme presets
- [x] Glow rendering extension on draw ops
- [x] Sidebar dashboard starter layout (DASHBOARD_MENU)
- [x] Standalone ModalDialog system with chaining, dimmer, and modal lock (port addition)
- [x] Input Monitor inputs: live held key and button snapshot, display Hz readout, stuck key auto clear on blur and hidden tabs (port addition)

## 3. UNIVERSAL KEY AND MOUSE BINDING (ImGui.KeyBind)

`ImGui.KeyBind(label, currentBind)` captures any keyboard key or mouse button into a string bind. Keyboard binds store browser `e.code` values (`KeyA` to `KeyZ`, `Digit0` to `Digit9`, `Numpad0` to `Numpad9`, `F1` to `F12`, `ShiftLeft`, `ShiftRight`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight`, `MetaLeft`, `MetaRight`, `Space`, `Enter`, `Tab`, `Backspace`, arrow keys, `Insert`, `Delete`, and all other codes the browser reports). Mouse binds store `M1` (left), `M2` (right), `M3` (middle), `M4` (browser back or side button 1), `M5` (browser forward or side button 2). The unbound sentinel is the string `"None"`.

Display names render through `ImGui.formatKeyName(code)`: modifier sides collapse to `LCtrl`, `RCtrl`, `LShift`, `RShift`, `LAlt`, `RAlt`, `LWin`, `RWin`; `Key` and `Digit` prefixes strip to the bare character; `NumpadX` renders as `Num X`; mouse codes render as `Mouse 1` through `Mouse 5`.

Listening state machine:

1. The widget draws a fixed 90 by 20 box plus an optional right side label. Clicking the box (standard press Hoyland's law through `buttonBehavior`) sets `c.activeId` to the widget ID, `c.activeKind` to `"keybind"`, and `c.activePayload` to `{ justActivated: true, done: false, result: currentBind }`.
2. The backend `keydown` capture listener checks `activeKind === "keybind"` before normal routing. Any key completes the payload with `result` equal to `e.code`, except `Escape` which completes with `"None"`. The event is fully consumed so the page never sees it.
3. The backend `mousedown` capture listener maps `e.button` through `["M1", "M3", "M2", "M4", "M5"]` (browser order is left 0, middle 1, right 2, back 3, forward 4). The first evaluation after activation carries `justActivated: true`, and that single event is ignored rather than bound. This prevents the click that opened the listener from registering as an immediate `M1` bind when event and frame interleave sub frame. The widget clears `justActivated` on its next evaluation, so the following genuine click binds normally.
4. On the next widget evaluation with `done === true`, the widget returns `{ changed: newBind !== currentBind, key: result }` and releases the active ID. While listening the box fills with the active button color and shows `Press Key/M...` in yellow.

Right click handling: the backend registers a `contextmenu` capture listener that calls `preventDefault` and `stopPropagation` whenever the menu is visible and the pointer is captured or a KeyBind is listening. Binding `M2` therefore never opens the browser menu.

Live queries use `ImGui.Backend.isKeyOrMouseActive(bindName, isDownOnly)`:

- Mouse binds resolve through `{ M1: 0, M2: 2, M3: 1, M4: 3, M5: 4 }`. With `isDownOnly === true` the call returns the held level (`MouseDown`). With `false` it returns the per frame click edge (`MouseClicked`).
- Keyboard binds return the held level from `KeysDown` when `isDownOnly === true`, and `false` otherwise (keys have no click edge in this IO subset, so edge detection is the caller polling held state across frames).
- `"None"`, empty, and unknown binds return `false`.

```js
const ak = ImGui.KeyBind("Aimbot key", S.aimbotKey);
if (ak.changed) S.aimbotKey = ak.key;

const held = ImGui.Backend.isKeyOrMouseActive(S.aimbotKey, true);
ImGui.TextColored(
  held ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
  "Aimbot [" + S.aimbotKey + "]: " + (held ? "ACTIVE (HELD)" : "INACTIVE")
);
```

## 4. RUNTIME MENU TOGGLE ENGINE (OPEN/CLOSE HOTKEY)

State lives on the backend singleton:

- `Backend.menuVisible`: boolean, `true` on page load, so the menu is visible by default.
- `Backend.menuToggleKey`: string, default `"Insert"`. Accepts any keyboard `e.code` or any mouse bind name `M1` to `M5` (side buttons are popular choices for games).
- `Backend.setMenuVisible(v)`: assigns visibility and syncs `canvas.style.display` between `block` and `none`.
- `Backend.toggleMenu()`: flips visibility through the setter.

Toggle paths:

- Keyboard path: the backend `keydown` capture listener compares `e.code` against `menuToggleKey` before KeyBind interception order is resolved in favor of pending binds first, then the toggle, then normal routing. A pending KeyBind therefore never leaks its keystroke into a toggle, and the toggle works even while the menu is hidden because the check runs before any visibility gating.
- Mouse path: the backend `mousedown` listener compares the mapped button name against `menuToggleKey` (after pending bind capture). Binding the toggle to `M4` or `M5` gives a side button open and close action.

Hidden mode behavior (zero cost passthrough):

- The frame loop short circuits before `newFrame`: it clears hover state, releases any active item and pending KeyBind payload, clears the canvas, pins `pointerEvents: none`, skips `userFn` entirely (no widget execution, no draw list buildup, no render), and schedules the next animation frame. Menu state objects are untouched, so toggling back on resumes exactly where the user left off.
- Input release: all capture side `preventDefault` and `stopPropagation` calls are gated behind `Backend.menuVisible`, and with `display: none` the canvas cannot be an event target. The underlying page or game therefore receives raw mouse, wheel, keyboard, and context menu events while hidden.

Live rebinding from inside the menu:

```js
const mk = ImGui.KeyBind("Menu Open/Close Key", S.menuKey);
if (mk.changed) {
  S.menuKey = mk.key;
  ImGui.Backend.menuToggleKey = mk.key;
}
ImGui.TextDisabled("Press Escape while binding to set to None.");
```

Setting the toggle bind to `"None"` disables the hotkey until rebound. Boot code assigns `ImGui.Backend.menuToggleKey = S.menuKey` once at startup so persisted choices apply on load.

## 5. CHILD WINDOWS, SAME-LINE CHAINING, AND DASHBOARD LAYOUTS

Child panels are layout items, not separate windows. `BeginChild(id, wArg, hArg, border)` measures available width from the cursor (`wArg > 0` overrides), paints the background fill (window color when child background alpha is zero) plus an optional border, pushes an isolated scope (cursor, line state, indent, clip mark, background and border op indices), and resets the cursor to the box interior origin. Inner draw ops are wrapped in a `childClip` group on `EndChild` so overflow never paints over siblings.

Auto height rule: when `hArg` is 0 or negative, the box fills remaining window height instead of using a constant. The exact formula is:

```js
availH = (w.sizeFull.y > 0) ? Math.max(40, (w.pos.y + w.sizeFull.y - w.padding.y) - w.dc.cursorPos.y) : 240
ht = hArg > 0 ? hArg : (hArg < 0 ? Math.max(40, availH + hArg) : availH)
```

Rationale: a sidebar with `hArg = 0` must stretch from the current cursor to the window bottom edge regardless of window size, so fixed size dashboard windows get full height columns and auto fit windows still converge (content overflow grows the box through the `contentH` path, which patches the background, border, and clip heights in place).

SameLine chaining rule: `SameLine()` sets `isSameLine = true` and restores `cursorPos` to `cursorPosPrevLine`, and the next `beforeItemPlacement` then offsets `x` by item spacing while keeping that `y`. For this to place a second child beside the first, `EndChild` must leave the parent cursor at the finished box top right with the line marked used. The exact required epilogue is:

```js
w.dc.cursorPos.x = b.x + b.w;
w.dc.cursorPos.y = b.y;
w.dc.cursorPosPrevLine = { x: b.x, y: b.y };
w.dc.lastItemWidth = b.w;
w.dc.lastItemHeight = boxH;
w.dc.currLineHeight = Math.max(st.currLineHeight || 0, boxH);
w.dc._lineUsed = true;
```

Rationale per field: `cursorPos` positions the next box origin, `cursorPosPrevLine` anchors `SameLine` to the box top row, `lastItemWidth` and `lastItemHeight` describe the box as an item, `currLineHeight` carries at least the full box height so a later line feed without `SameLine` lands below the taller column, `_lineUsed` forces that feed instead of overlapping. Without this epilogue (cursor reset below the box with a cleared line), `SameLine` keeps the below the box `y` and the second panel stacks vertically with an empty top right gap.

Complete dashboard snippet:

```js
const tabs = ["Aimbot", "Visuals", "Misc", "Settings"];
const S = { tab: 0 };

function Dashboard() {
  const ImGui = window.ImGui;
  ImGui.SetNextWindowSize(540, 360, ImGui.Cond.FirstUseEver);
  const w = ImGui.Begin("Tool Dashboard", null, ImGui.WindowFlags.NoCollapse | ImGui.WindowFlags.NoScrollbar | ImGui.WindowFlags.NoScrollWithMouse);
  if (!w.visible) { ImGui.End(); return; }

  if (ImGui.BeginChild("##sidebar", 120, 0, true)) {
    for (let i = 0; i < tabs.length; i++) {
      if (ImGui.Selectable(tabs[i], S.tab === i, 0, [110, 28], ImGui.Align.CenterLeft)) S.tab = i;
    }
  }
  ImGui.EndChild();

  ImGui.SameLine();

  if (ImGui.BeginChild("##content", 0, 0, true)) {
    if (S.tab === 0) {
      ImGui.SeparatorText("Aimbot Configuration");
      ImGui.Text("Aimbot options go here.");
    } else if (S.tab === 1) {
      ImGui.SeparatorText("ESP and Visuals");
      ImGui.Text("ESP options go here.");
    } else if (S.tab === 2) {
      ImGui.SeparatorText("Misc");
      ImGui.Text("Utility options go here.");
    } else {
      ImGui.SeparatorText("Menu Settings");
      ImGui.Text("Toggle key and theme go here.");
    }
  }
  ImGui.EndChild();

  ImGui.End();
}
```

Verified geometry for a 520 by 340 window at (50, 50): sidebar box at x 58, y 77, width 110, height 305 (exact interior fill, zero growth overshoot); content box at x 176, y 77 (tops aligned, x past the sidebar right edge plus spacing), filling remaining width and full remaining height with `scrollMax` 0 and no scrollbar chrome. A widget placed after the row without `SameLine` feeds directly below both columns. The `NoScrollbar` and `NoScrollWithMouse` flags pin the outer frame (the scroll math additionally discounts trailing padding with a 2px epsilon, so exact fits never phantom scroll).

## 6. TITLE BAR FOCUS AND COLOR LEAK PREVENTION

Defect: moving the mouse anywhere inside a window body switched its title bar to `Col.TitleBgActive` (bright blue). Root cause is the title fill condition in `drawWindow()`:

```js
const active = (c.windowStack[c.windowStack.length - 1] === w) || w.contentHover;
```

Two faults compound here. First, `contentHover` is true for every window under the cursor (it is a hover test, set in `begin()` for all windows containing the pointer), so it can never discriminate the focused window. Second, the window stack is empty at render time (every `End()` pops), so the stack comparison is dead code during rasterization and hover alone decides the color.

Corrected logic decouples the title color from hover entirely. The title uses the active color only for the explicitly focused window or while that window is being dragged:

```js
const isDragging = (c.activeKind === "move" && c.activePayload && c.activePayload.win === w);
const focused = (c.focusedWindow === w) || isDragging;
ctx.fillStyle = css(st.Colors[w.collapsed ? ImGui.Col.TitleBgCollapsed : (focused ? ImGui.Col.TitleBgActive : ImGui.Col.TitleBg)]);
```

Focus is tracked in `begin()` with click to focus semantics: the first begun window starts focused, and a left click inside a window moves `c.focusedWindow` there, provided no popup owns the click, no modal is active, and the window allows mouse inputs. Stale references to destroyed windows fall back to the current window. Hovering a window therefore leaves its title dark, clicking it lights the title, and exactly one window counts active at a time.

Optional hard lock: to keep titles dark under all circumstances (including focus and drag), assign the active title color from the base title color after any theme call:

```js
const C = ImGui.GetStyle().Colors;
C[ImGui.Col.TitleBgActive] = [...C[ImGui.Col.TitleBg]];
```

## 7. COMPLETE USAGE AND API EXAMPLES

All examples assume one persistent state object kept outside the frame function, widgets called strictly between `Begin` and `End`, and return values read every frame (immediate mode: there are no retained widget objects).

### Basic window (buttons, sliders, text input, checkbox)

```js
const S = { counter: 0, checked: true, speed: 0.5, name: "player1" };

function BasicMenu() {
  const ImGui = window.ImGui;
  ImGui.SetNextWindowSize(340, 0, ImGui.Cond.FirstUseEver);
  const w = ImGui.Begin("My Menu", null, 0);
  if (!w.visible) { ImGui.End(); return; }

  if (ImGui.Button("Clicked: " + S.counter)) S.counter++;
  ImGui.SameLine();
  if (ImGui.SmallButton("Reset")) S.counter = 0;

  const c = ImGui.Checkbox("Enable ESP", S.checked);
  S.checked = c.checked;

  S.speed = ImGui.SliderFloat("Speed", S.speed, 0, 2).value;
  S.name = ImGui.InputText("Name", S.name).text;

  ImGui.End();
}
```

### KeyBind integration (aimbot and triggerbot keys)

```js
const S = {
  menuKey: "Insert",
  aimbotKey: "M2",
  triggerKey: "M4",
  aimbotEnabled: false,
  triggerEnabled: true,
};

function BindsMenu() {
  const ImGui = window.ImGui;
  const w = ImGui.Begin("Combat", null, 0);
  if (!w.visible) { ImGui.End(); return; }

  const mk = ImGui.KeyBind("Menu Open/Close Key", S.menuKey);
  if (mk.changed) {
    S.menuKey = mk.key;
    ImGui.Backend.menuToggleKey = mk.key;
  }

  S.aimbotEnabled = ImGui.Checkbox("Enable Aimbot", S.aimbotEnabled).checked;
  ImGui.SameLine();
  const ak = ImGui.KeyBind("##AimbotKey", S.aimbotKey);
  if (ak.changed) S.aimbotKey = ak.key;

  S.triggerEnabled = ImGui.Checkbox("Enable Triggerbot", S.triggerEnabled).checked;
  ImGui.SameLine();
  const tk = ImGui.KeyBind("##TriggerKey", S.triggerKey);
  if (tk.changed) S.triggerKey = tk.key;

  const held = ImGui.Backend.isKeyOrMouseActive(S.aimbotKey, true);
  ImGui.TextColored(
    held ? [0, 1, 0, 1] : [0.6, 0.6, 0.6, 1],
    "Aimbot [" + S.aimbotKey + "]: " + (held ? "ACTIVE (HELD)" : "INACTIVE")
  );

  ImGui.End();
}
```

### Multi select dropdown combo

```js
const S = { flags: { Wallhack: true, Chams: false, Skeletons: true, Snaplines: false } };

function VisualsMenu() {
  const ImGui = window.ImGui;
  const w = ImGui.Begin("Visuals", null, 0);
  if (!w.visible) { ImGui.End(); return; }

  const mc = ImGui.MultiCombo("ESP Flags", S.flags);
  if (mc.changed) console.log("flags:", JSON.stringify(S.flags));

  ImGui.End();
}
```

The preview line joins enabled keys with commas and shows `(None)` when empty. Each label key must be unique per call site (append `##id` suffixes for duplicate visible labels).

### Toast notifications

```js
function fireExamples() {
  const ImGui = window.ImGui;
  const N = ImGui.Notify;
  N.InsertNotification(N.Toast(N.ToastType.Success, 3000, "Settings saved."));
  N.InsertNotification(N.Toast(
    N.ToastType.Error, 5000, "Connection lost. Click to retry.",
    () => reconnect(), "Network"
  ));
}

function Frame() {
  const ImGui = window.ImGui;
  // ... windows ...
  ImGui.Notify.RenderNotifications();
}
```

Toast kinds: Success (green check), Warning (yellow triangle), Error (red mark), Info (blue mark). Corner default is BottomRight via `ImGui.Notify.Config.position`. Dismiss timing, opacity, and render limit are configurable on the same object.

### Background draw list (crosshair, ESP box, snapline)

```js
function EspOverlay(targets) {
  const ImGui = window.ImGui;
  const io = ImGui.GetIO();
  const bg = ImGui.GetBackgroundDrawList();
  const cx = io.DisplaySize.x / 2;
  const cy = io.DisplaySize.y / 2;

  bg.AddLine({ x: cx - 12, y: cy }, { x: cx + 12, y: cy }, [0, 1, 0, 1], 1.5);
  bg.AddLine({ x: cx, y: cy - 12 }, { x: cx, y: cy + 12 }, [0, 1, 0, 1], 1.5);

  for (const t of targets) {
    bg.AddLine({ x: cx, y: io.DisplaySize.y }, { x: t.x, y: t.y }, [1, 0, 0, 1], 1.5);
    bg.AddRect({ x: t.x1, y: t.y1 }, { x: t.x2, y: t.y2 }, [0, 1, 0, 1], 2, 1.5);
  }
}
```

Background ops render below all windows across the full viewport. Foreground equivalents come from `GetForegroundDrawList` (above windows, same call shapes). Any shape op accepts `glow: true` with optional `glowColor` and `glowBlur` for a neon stroke.

### Persistent configuration (GM storage)

```js
function saveConfig(S) {
  const ImGui = window.ImGui;
  ImGui.StorageSet("[MyScript]config", {
    menuKey: S.menuKey,
    aimbotKey: S.aimbotKey,
    flags: S.flags,
    theme: S.theme,
  });
}

function loadConfig(S) {
  const ImGui = window.ImGui;
  const saved = ImGui.StorageGet("[MyScript]config", null);
  if (!saved) return;
  Object.assign(S, saved);
  ImGui.Backend.menuToggleKey = S.menuKey;
}
```

`StorageGet` prefers synchronous `GM_getValue` and falls back to `localStorage` JSON parsing when the grant is absent. `StorageSet` prefers `GM_setValue` with the same fallback. Requires `// @grant GM_getValue` and `// @grant GM_setValue` in the userscript header for cross subdomain persistence that survives origin storage clears. Window geometry and table state persist through the same layer automatically.
