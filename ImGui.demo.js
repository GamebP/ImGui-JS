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
    const rows = [["bot_a", "100", "12"], ["bot_b", "75", "40"], ["bot_c", "50", "88"]];
    for (const r of rows) {
      ImGui.TableNextRow();
      for (let i = 0; i < 3; i++) { ImGui.TableSetColumnIndex(i); ImGui.Text(r[i]); }
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
  if (ImGui.Button("Open modal")) ImGui.OpenPopup("modal1");
  if (ImGui.BeginPopupModal("modal1")) { ImGui.Text("modal dialog"); if (ImGui.Button("OK")) ImGui.CloseCurrentPopup(); ImGui.EndPopupModal(); }
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
}

Object.assign(ImGui, { ShowDemoWindow, ShowStyleEditor, ShowMetricsWindow, _demoState: D });
global.__IMGUI_DEMO__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
