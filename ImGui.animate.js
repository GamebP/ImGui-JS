/* ImGui Browser Port — Animation Driver
 * Ported from Half-People/HImGuiAnimation (Apache-2.0) — HAnimationSystem:
 * keyframe sequencer (keys/frames, linear + bezier interpolation, Play/Stop,
 * loop, delta-time manager update). Deviations from upstream are marked SAFE:
 * pointer handles become JS objects, out-of-range key lookups clamp instead of
 * reading out of bounds.
 * Adds an immediate-mode tween layer (Ease + ID-keyed Float/Color) used for
 * widget hover/active transitions. Requires: ImGui.core.js.
 * License of this port: MIT. Upstream HImGuiAnimation is Apache-2.0 by HalfPeople.
 */
(function (global) {
"use strict";
const ImGui = global.ImGui;
if (!global.__IMGUI_CORE__) throw new Error("ImGui.core.js must load first");

// ---------- easing (JS-side helper for micro-transitions) ----------
const Ease = {
  Linear: (t) => t,
  InQuad: (t) => t * t,
  OutQuad: (t) => t * (2 - t),
  InOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  InCubic: (t) => t * t * t,
  OutCubic: (t) => { t--; return t * t * t + 1; },
  InOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  OutBack: (t) => { const s = 1.70158; t--; return t * t * ((s + 1) * t + s) + 1; },
};

// ---------- PlayerCallBack (ported 1:1 from HImGuiAnimation.h/.cpp) ----------
function GetInterpolationInfoFromKeys(keys, frame) {
  // upper_bound(keys, frame): first index with keys[i] > frame.
  let lo = 0, hi = keys.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= frame) lo = mid + 1; else hi = mid; }
  let lastOneKey = lo, previousKey = lo - 1;
  let alpha = 0;
  // SAFE: upstream indexes values out of range here; clamp instead.
  if (lastOneKey >= keys.length) { lastOneKey = keys.length - 1; previousKey = keys.length - 1; alpha = 1; }
  else if (previousKey < 0) { previousKey = 0; alpha = 0; }
  else {
    const mx = keys[lastOneKey], mn = keys[previousKey];
    if (mx !== mn) alpha = (frame - mn) / (mx - mn);
  }
  return { PreviousKey: previousKey, LastOneKey: lastOneKey, alpha };
}
function LinearInterpolation(a, b, alpha) { return a + (b - a) * alpha; }
function SimpleBezierInterpolation(a, b, alpha) {
  const u = 1.0 - alpha, tt = alpha * alpha, uu = u * u;
  return (uu * u) * a + (tt * alpha) * b;
}
function CubicBezierInterpolation(a, control_point_a, control_point_b, b, alpha) {
  const offset = a + (b - a);
  const ca = offset * control_point_a, cb = offset * control_point_b;
  const u = 1.0 - alpha, tt = alpha * alpha, uu = u * u;
  const uuu = uu * u, ttt = tt * alpha;
  return uuu * a + 3.0 * uu * alpha * ca + 3.0 * u * tt * cb + ttt * b;
}
function StringInterpolation(fullString, alpha) {
  return fullString.substr(0, Math.floor(fullString.length * alpha));
}

// ---------- AnimationSequence + manager (ported from HImGuiAnimation.cpp) ----------
const Sequences = [];
function seqUpdata(seq, delta_time) {
  if (!seq.Playing) return;
  const buff = delta_time * (seq.info.speed * 100);
  seq.info.CurrentFrame += buff;
  if (seq.info.CurrentFrame >= seq.info.MaxFrame) {
    if (seq.info.IsLoop) seq.info.CurrentFrame = 0;
    else { seq.Stop(); return; }
  }
  seq.info.callback(seq.info.CurrentFrame, seq.info.data);
}
function makeSequence(fps, data, speed, maxFrame, isLoop, callback) {
  const seq = {
    Playing: true,
    info: {
      callback, data, speed, MaxFrame: maxFrame, IsLoop: !!isLoop,
      CurrentFrame: 0, FPS_delta_time: fps > 0 ? 1.0 / fps : 0,
      _buf: 0,
    },
    Stop() {
      const i = Sequences.indexOf(seq);
      if (i >= 0) Sequences.splice(i, 1);
      seq.Playing = false;
    },
    Pause() { seq.Playing = false; },
    Play() { seq.Playing = true; },
    IsPlaying() { return seq.Playing; },
  };
  return seq;
}
function Play(callback, maxFrame, data = null, opts = {}) {
  const speed = opts.speed !== undefined ? opts.speed : 1;
  for (const s of Sequences) {
    if (s.info.callback === callback && s.info.data === data) return s; // dedup (upstream)
  }
  const fps = opts.fps !== undefined ? opts.fps : 60;
  const seq = makeSequence(fps, data, speed, maxFrame, !!opts.loop, callback);
  Sequences.push(seq);
  return seq;
}
let _updataBuf = 0;
function updata(delta_time, maxFPS) {
  if (maxFPS !== undefined) {
    // Manager FPS gate (upstream updata(dt, MaxFPS)).
    if (_updataBuf > 1.0 / maxFPS) {
      for (const s of Sequences.slice()) seqUpdata(s, delta_time);
      _updataBuf = 0;
    } else _updataBuf += delta_time;
    return;
  }
  for (const s of Sequences.slice()) {
    if (s.info.FPS_delta_time) {
      s.info._buf += delta_time;
      if (s.info._buf > s.info.FPS_delta_time) {
        seqUpdata(s, s.info._buf);
        s.info._buf = 0;
      }
    } else seqUpdata(s, delta_time);
  }
}

// ---------- immediate-mode tween layer (ID-keyed, for widget transitions) ----------
const _tweens = new Map(); // id -> { current, start, target, t }
function animateFloat(id, targetValue, speed = 0.15, easeFn = Ease.OutQuad) {
  const dt = (ImGui.GetIO() && ImGui.GetIO().DeltaTime) || (1 / 60);
  let s = _tweens.get(id);
  if (!s) {
    s = { current: targetValue, start: targetValue, target: targetValue, t: 1.0 };
    _tweens.set(id, s);
    return targetValue;
  }
  if (s.target !== targetValue) { s.start = s.current; s.target = targetValue; s.t = 0.0; }
  if (s.t < 1.0) {
    s.t = Math.min(1.0, s.t + dt / Math.max(0.001, speed));
    s.current = s.start + (s.target - s.start) * easeFn(s.t);
  } else s.current = s.target;
  return s.current;
}
function animateColor(id, targetCol, speed = 0.15, easeFn) {
  const e = easeFn || Ease.OutQuad;
  return [
    animateFloat(id + "##_r", targetCol[0], speed, e),
    animateFloat(id + "##_g", targetCol[1], speed, e),
    animateFloat(id + "##_b", targetCol[2], speed, e),
    animateFloat(id + "##_a", targetCol[3] !== undefined ? targetCol[3] : 1.0, speed, e),
  ];
}

ImGui.Animation = {
  Ease,
  PlayerCallBack: {
    GetInterpolationInfoFromKeys,
    LinearInterpolation,
    SimpleBezierInterpolation,
    CubicBezierInterpolation,
    StringInterpolation,
  },
  Play,
  updata,
  Sequences,
  Float: (id, target, speed, ease) => animateFloat(id, target, speed, ease),
  Color: (id, target, speed, ease) => animateColor(id, target, speed, ease),
};

global.__IMGUI_ANIMATE__ = true;
})(typeof globalThis !== "undefined" ? globalThis : this);
