// Camera + body tracking (Google MediaPipe Pose Landmarker, free and runs locally).
// Produces a `player` object in screen pixels with filtered, stable points.
import { view } from "./fx.js";
import { settings } from "./settings.js";

// Prefer the copies bundled with the app (offline); fall back to the CDN for the plain web version.
const LOCAL = new URL("../vendor/", import.meta.url).href;
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODEL_CDN = "https://storage.googleapis.com/mediapipe-models/pose_landmarker";
const MODELS = {
  full: { local: `${LOCAL}models/pose_landmarker_full.task`, cdn: `${MODEL_CDN}/pose_landmarker_full/float16/1/pose_landmarker_full.task` },
  lite: { local: `${LOCAL}models/pose_landmarker_lite.task`, cdn: `${MODEL_CDN}/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` },
};

// BlazePose landmark indices
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16,
  L_PINKY = 17, R_PINKY = 18, L_INDEX = 19, R_INDEX = 20, L_HIP = 23, R_HIP = 24,
  L_KNEE = 25, R_KNEE = 26, L_ANKLE = 27, R_ANKLE = 28;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Phones and tablets (including iPads that report as a Mac) get the lighter, faster model.
export const MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));

// ---------- One Euro filter: smooth when still, responsive when moving ----------
const lpAlpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);

class OneEuro {
  constructor() { this.reset(); }
  reset() { this.prev = null; this.dPrev = 0; }
  filter(v, dt, minCutoff, beta) {
    if (this.prev === null) { this.prev = v; return v; }
    const d = (v - this.prev) / dt;
    this.dPrev += lpAlpha(1, dt) * (d - this.dPrev);
    const cutoff = minCutoff + beta * Math.abs(this.dPrev);
    this.prev += lpAlpha(cutoff, dt) * (v - this.prev);
    return this.prev;
  }
}

// Hand smoothing presets (picked on the game setup screen). Units are body-widths, so they
// work the same whether the child stands near or far. deadband = tiny wiggles are ignored,
// renderTau = how softly the circle glides between camera frames.
export const STEADINESS = {
  steady: { minCutoff: 0.5, beta: 4, deadband: 0.075, renderTau: 0.03 },
  normal: { minCutoff: 0.5, beta: 7, deadband: 0.065, renderTau: 0.012 },
  quick:  { minCutoff: 0.5, beta: 14, deadband: 0.05, renderTau: 0.012 },
};
// The hand preset comes from Settings; tests can override it with setSteadiness().
let override = null;
export function setSteadiness(name) { override = STEADINESS[name] ?? null; }
const handTuning = () => override ?? STEADINESS[settings.hands] ?? STEADINESS.normal;

// A tracked body point: visibility hysteresis, short hold-on-loss, glitch rejection,
// One Euro smoothing + deadband, then a gentle glide at screen refresh rate.
// It never predicts ahead, so it can't overshoot or amplify tracker noise.
class TrackedPoint {
  constructor({ hand = false, minCutoff = 1.0, beta = 0.6, deadband = 0.015, renderTau = 0.035,
    acquire = 0.5, lose = 0.3, hold = 0.25, need = 1 } = {}) {
    Object.assign(this, { hand, own: { minCutoff, beta, deadband, renderTau }, acquire, lose, hold, need });
    this.fx = new OneEuro();
    this.fy = new OneEuro();
    this.x = 0; this.y = 0;     // displayed position
    this.vx = 0; this.vy = 0;   // displayed velocity (px/s)
    this.tx = 0; this.ty = 0;   // filtered target
    this.t = 0;
    this.ok = false; this.fresh = true; this.lost = 0; this.good = 0; this.suspect = 0;
  }

  get tune() { return this.hand ? handTuning() : this.own; }
  predict() { return { x: this.tx, y: this.ty }; }

  // m = {x, y, vis} in px, t = frame time in seconds, scale = body size in px
  update(m, t, scale) {
    const dt = clamp(t - this.t, 1 / 240, 0.25);
    this.t = t;
    const threshold = this.ok ? this.lose : this.acquire;
    if (!m || m.vis < threshold) {
      this.good = 0;
      if (this.ok) { this.lost += dt; if (this.lost > this.hold) this.ok = false; }
      if (!this.ok) this.fresh = true;
      return;
    }
    if (this.ok) {
      // A sudden huge jump is usually a tracking glitch: ignore it unless it sticks around.
      if (Math.hypot(m.x - this.tx, m.y - this.ty) > scale * 2.5 && this.suspect < 2) {
        this.suspect++;
        return;
      }
    } else if (++this.good < this.need) {
      return; // need a few good frames before showing the point again
    }
    if (this.fresh || this.suspect >= 2) {
      this.fx.reset(); this.fy.reset();
      this.tx = m.x; this.ty = m.y;
      this.fresh = true;
    }
    this.suspect = 0;
    this.ok = true;
    this.lost = 0;

    const T = this.tune;
    const fx = this.fx.filter(m.x / scale, dt, T.minCutoff, T.beta) * scale;
    const fy = this.fy.filter(m.y / scale, dt, T.minCutoff, T.beta) * scale;
    // Soft deadband: tiny wiggles don't move the target at all.
    const dx = fx - this.tx, dy = fy - this.ty, d = Math.hypot(dx, dy), db = T.deadband * scale;
    if (d > db) { const k = (d - db) / d; this.tx += dx * k; this.ty += dy * k; }
  }

  // Called every animation frame: glide toward the target so motion is smooth between camera frames.
  render(now) {
    if (!this.ok) return;
    const dt = clamp(now - (this.rt ?? now), 0, 0.1);
    this.rt = now;
    if (this.fresh) {
      this.x = this.tx; this.y = this.ty; this.fresh = false;
      this.vx = this.vy = 0; this.vt = null;
    } else {
      const k = 1 - Math.exp(-dt / this.tune.renderTau);
      this.x += (this.tx - this.x) * k;
      this.y += (this.ty - this.y) * k;
    }
    this.trackVelocity(now);
  }

  // Smoothed on-screen speed in px/s (used for bouncing balloons, blocking balls, etc.).
  trackVelocity(now) {
    if (this.vt != null && now > this.vt) {
      const dt = now - this.vt, k = Math.min(1, dt / 0.06);
      this.vx += ((this.x - this.px) / dt - this.vx) * k;
      this.vy += ((this.y - this.py) / dt - this.vy) * k;
    }
    this.px = this.x; this.py = this.y; this.vt = now;
  }

  set(x, y) {
    this.x = this.tx = x; this.y = this.ty = y; this.ok = true; this.lost = 0;
    this.trackVelocity(performance.now() / 1000);
  }
  get alpha() { return this.ok ? Math.max(0.35, 1 - this.lost / this.hold) : 0; }
}

const handOpts = { hand: true, acquire: 0.6, lose: 0.25, hold: 0.35, need: 2 };

export const player = {
  visible: false,
  seenFor: 0,
  missingFor: 0,
  head: new TrackedPoint({ minCutoff: 0.8, deadband: 0.012 }),
  shoulders: [new TrackedPoint({ minCutoff: 0.8, deadband: 0.012 }), new TrackedPoint({ minCutoff: 0.8, deadband: 0.012 })],
  hips: [new TrackedPoint({ acquire: 0.6 }), new TrackedPoint({ acquire: 0.6 })],
  knees: [new TrackedPoint({ acquire: 0.6 }), new TrackedPoint({ acquire: 0.6 })],
  ankles: [new TrackedPoint({ acquire: 0.6 }), new TrackedPoint({ acquire: 0.6 })],
  hands: [new TrackedPoint(handOpts), new TrackedPoint(handOpts)],
  scale: 120,   // body size in px (≈ shoulder width)
  baseY: null,  // standing head height, set during countdown
  get cx() { return (this.shoulders[0].x + this.shoulders[1].x) / 2; },
  get shY() { return (this.shoulders[0].y + this.shoulders[1].y) / 2; },
};
const allPoints = () => [player.head, ...player.shoulders, ...player.hips, ...player.knees, ...player.ankles, ...player.hands];

// ---------- Camera + model ----------
export const video = document.getElementById("cam");
let vision = null;       // MediaPipe module + fileset
let landmarker = null;
let modelName = "full";
let camReady = false;
let lastVideoTime = -1;
let detectMs = 0;        // running average of detection time
let detectCount = 0;
let switching = false;
let lastDetectAt = 0;

// Live numbers for the debug overlay (press D in game).
export const stats = { fps: 0, detectMs: 0, model: "", raw: [null, null] };

let frameLoopStarted = false;

export const hasCamera = () => camReady;

// Cameras on this device (names show up after the camera has been allowed once).
export async function listCameras() {
  try {
    // Before permission is granted, browsers hide camera IDs (""), and those can't be picked.
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId);
  } catch {
    return [];
  }
}

// Stop the current camera so the next game opens the one picked in Settings.
export function restartCamera() {
  video.srcObject?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  camReady = false;
}

async function loadVision() {
  let mod, base;
  try {
    base = `${LOCAL}tasks-vision`;
    mod = await import(`${base}/vision_bundle.mjs`);
  } catch {
    base = CDN;
    mod = await import(CDN);
  }
  const fileset = await mod.FilesetResolver.forVisionTasks(`${base}/wasm`);
  return { mod, fileset };
}

const modelCache = {};
async function modelOptions(name) {
  const m = MODELS[name];
  if (!modelCache[name]) {
    try {
      const res = await fetch(m.local);
      if (!res.ok) throw new Error(res.status);
      modelCache[name] = { modelAssetBuffer: new Uint8Array(await res.arrayBuffer()) };
    } catch {
      modelCache[name] = { modelAssetPath: m.cdn };
    }
  }
  return modelCache[name];
}

async function createLandmarker(name, delegate) {
  return vision.mod.PoseLandmarker.createFromOptions(vision.fileset, {
    baseOptions: { ...(await modelOptions(name)), delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function initTracking(onStatus) {
  if (!camReady) {
    onStatus("Waking up the camera…");
    try {
      // Smaller frames at a higher frame rate = fresher, smoother tracking.
      const size = MOBILE
        ? { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
        : { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 60 } };
      const which = settings.cameraId ? { deviceId: { exact: settings.cameraId } } : { facingMode: "user" };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { ...which, ...size }, audio: false });
      } catch (err) {
        if (!settings.cameraId || err?.name === "NotAllowedError") throw err;
        // The saved camera is unplugged: fall back to the default one.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", ...size }, audio: false });
      }
      video.srcObject = stream;
      await video.play();
      camReady = true;
      startFrameLoop();
    } catch (err) {
      return {
        ok: false,
        error: err?.name === "NotAllowedError"
          ? "Camera permission was blocked. Click the camera icon in the address bar and choose Allow, then try again."
          : !window.isSecureContext
            ? "The camera only works on a secure (https://) link. Open the game from its shared web link instead."
            : "No camera was found, or another app is using it.",
      };
    }
  }
  if (!landmarker) {
    onStatus("Loading body tracker… 🤖");
    try {
      vision ??= await loadVision();
      try {
        modelName = MOBILE ? "lite" : "full";
        landmarker = await createLandmarker(modelName, "GPU");
      } catch {
        // No GPU: the lite model keeps things fast on the CPU.
        landmarker = await createLandmarker("lite", "CPU");
        modelName = "lite";
      }
    } catch (err) {
      console.error(err);
      return { ok: false, error: "The body tracker couldn't load. Check your internet connection and try again." };
    }
  }
  return { ok: true };
}

// Run detection once per new camera frame (not once per screen refresh).
function startFrameLoop() {
  if (frameLoopStarted) return;
  frameLoopStarted = true;
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    const onFrame = (now) => { detect(now); video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  } else {
    const poll = (now) => {
      if (video.currentTime !== lastVideoTime) { lastVideoTime = video.currentTime; detect(now); }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }
}

// If the accurate model is too slow on this computer, switch to the lighter one.
async function maybeDowngrade() {
  if (switching || modelName !== "full" || detectCount < 45 || detectMs < 30) return;
  switching = true;
  try {
    const lite = await createLandmarker("lite", "GPU");
    landmarker.close();
    landmarker = lite;
    modelName = "lite";
    console.info("Tracker: switched to lite model for speed");
  } catch { /* keep the full model */ }
}

// Video is drawn "cover"-fit and mirrored; these map landmarks to screen px.
function videoRect() {
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s = Math.max(view.W / vw, view.H / vh);
  const w = vw * s, h = vh * s;
  return { x: (view.W - w) / 2, y: (view.H - h) / 2, w, h };
}

export function drawCamera(ctx) {
  const r = videoRect();
  ctx.save();
  if (settings.mirror) { ctx.translate(r.x + r.w, r.y); ctx.scale(-1, 1); } else ctx.translate(r.x, r.y);
  ctx.drawImage(video, 0, 0, r.w, r.h);
  ctx.restore();
  ctx.fillStyle = "rgba(20, 12, 60, 0.35)";
  ctx.fillRect(-20, -20, view.W + 40, view.H + 40);
}

// ---------- Per-frame update ----------
function refreshVisibility(dt) {
  const ok = player.head.ok && player.shoulders[0].ok && player.shoulders[1].ok;
  if (ok) { player.visible = true; player.seenFor += dt; player.missingFor = 0; }
  else { player.missingFor += dt; player.seenFor = 0; if (player.missingFor > 0.3) player.visible = false; }
}

// Called every animation frame.
export function updateTracking(dt) {
  const now = performance.now() / 1000;
  for (const p of allPoints()) p.render(now);
  refreshVisibility(dt);
}

function detect(nowMs) {
  if (!landmarker || video.readyState < 2) return;
  const start = performance.now();
  let lm;
  try {
    lm = landmarker.detectForVideo(video, nowMs).landmarks?.[0];
  } catch (err) {
    console.warn(err);
    return;
  }
  const took = performance.now() - start;
  detectMs = detectCount++ ? detectMs * 0.95 + took * 0.05 : took;
  if (lastDetectAt) stats.fps = stats.fps * 0.9 + (1000 / Math.max(1, nowMs - lastDetectAt)) * 0.1;
  lastDetectAt = nowMs;
  stats.detectMs = detectMs;
  stats.model = modelName;
  maybeDowngrade();

  const t = nowMs / 1000;
  const r = videoRect();
  const mx = settings.mirror ? (x) => 1 - x : (x) => x;
  const at = (p) => ({ x: r.x + mx(p.x) * r.w, y: r.y + p.y * r.h, vis: p.visibility ?? 1 });
  const pt = (i) => (lm ? at(lm[i]) : null);
  // Hand centre ≈ wrist blended toward the knuckles (more natural than the bare wrist).
  const palm = (w, p, i) => {
    if (!lm) return null;
    const a = lm[w], b = lm[p], c = lm[i];
    return at({
      x: a.x * 0.5 + b.x * 0.25 + c.x * 0.25,
      y: a.y * 0.5 + b.y * 0.25 + c.y * 0.25,
      visibility: (a.visibility ?? 1) * 0.6 + Math.max(b.visibility ?? 1, c.visibility ?? 1) * 0.4,
    });
  };

  const s = player.scale;
  player.head.update(pt(NOSE), t, s);
  player.shoulders[0].update(pt(L_SHOULDER), t, s);
  player.shoulders[1].update(pt(R_SHOULDER), t, s);
  player.hips[0].update(pt(L_HIP), t, s);
  player.hips[1].update(pt(R_HIP), t, s);
  player.knees[0].update(pt(L_KNEE), t, s);
  player.knees[1].update(pt(R_KNEE), t, s);
  player.ankles[0].update(pt(L_ANKLE), t, s);
  player.ankles[1].update(pt(R_ANKLE), t, s);

  // Body scale from shoulder width (or torso length when turned sideways), changing slowly.
  const [ls, rs] = player.shoulders;
  if (ls.ok && rs.ok) {
    const a = ls.predict(t), b = rs.predict(t);
    let raw = Math.hypot(a.x - b.x, a.y - b.y);
    const [lh, rh] = player.hips;
    if (lh.ok && rh.ok) {
      const c = lh.predict(t), d = rh.predict(t);
      raw = Math.max(raw, 0.75 * Math.hypot((a.x + b.x - c.x - d.x) / 2, (a.y + b.y - c.y - d.y) / 2));
    }
    raw = Math.max(50, raw);
    player.scale = player.visible ? s + (raw - s) * 0.05 : raw;
  }

  let hA = palm(L_WRIST, L_PINKY, L_INDEX);
  let hB = palm(R_WRIST, R_PINKY, R_INDEX);
  const [t0, t1] = player.hands;
  const p0 = t0.predict(t), p1 = t1.predict(t);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  if (hA && hB && d(hA, hB) < s * 0.35) {
    // Both guesses landed on the same hand (the other is hidden): give it to the nearer track only.
    const keep = hA.vis >= hB.vis ? hA : hB;
    const to0 = t0.ok && (!t1.ok || d(p0, keep) <= d(p1, keep));
    hA = to0 || !t1.ok ? keep : null;
    hB = hA ? null : keep;
  } else if (hA && hB && t0.ok && t1.ok && d(p0, hB) + d(p1, hA) < 0.6 * (d(p0, hA) + d(p1, hB))) {
    // Tracker swapped left/right for a frame: keep each circle on its own hand.
    [hA, hB] = [hB, hA];
  }
  stats.raw = [hA, hB];
  t0.update(hA, t, s);
  t1.update(hB, t, s);
}

// ---------- Mouse fallback ("head" = mouse moves you, "hand" = mouse is your hand) ----------
export function updateFromMouse(m, style, dt) {
  const s = Math.min(view.W, view.H) * 0.18;
  player.scale = s;
  const [h0, h1] = player.hands;
  if (style === "hand") {
    player.head.set(view.W / 2, view.H * 0.55);
    h1.set(m.x, m.y);
    h0.ok = false;
  } else {
    player.head.set(m.x, m.y);
    if (m.down) { h0.set(m.x - s * 0.45, m.y - s); h1.set(m.x + s * 0.45, m.y - s); }
    else { h0.set(m.x - s * 0.8, m.y + s * 1.4); h1.set(m.x + s * 0.8, m.y + s * 1.4); }
  }
  const hy = player.head.y, hx = player.head.x;
  player.shoulders[0].set(hx - s / 2, hy + s * 0.7);
  player.shoulders[1].set(hx + s / 2, hy + s * 0.7);
  const spread = m.down ? 1.0 : 0.25;
  // Each click lifts the next knee (left, right, left…) for testing High Knees with a mouse.
  const lift = (i) => (m.down && m.leg === i ? s * 1.0 : 0);
  player.hips[0].set(hx - s * 0.35, hy + s * 1.9);
  player.hips[1].set(hx + s * 0.35, hy + s * 1.9);
  player.knees[0].set(hx - s * spread * 0.7, hy + s * 2.8 - lift(0));
  player.knees[1].set(hx + s * spread * 0.7, hy + s * 2.8 - lift(1));
  player.ankles[0].set(hx - s * spread, hy + s * 3.4);
  player.ankles[1].set(hx + s * spread, hy + s * 3.4);
  refreshVisibility(dt);
}
