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
  hand: { local: `${LOCAL}models/hand_landmarker.task`,
    cdn: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
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
  steady: { minCutoff: 0.6, beta: 5, deadband: 0.045, renderTau: 0.025 },
  normal: { minCutoff: 0.8, beta: 9, deadband: 0.03, renderTau: 0.012 },
  quick:  { minCutoff: 1.2, beta: 16, deadband: 0.018, renderTau: 0.008 },
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
    this.jitter = 0;            // how much the raw signal wobbles while the hand is still (px)
    this.mx = null; this.my = null;
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
      if (Math.hypot(m.x - this.tx, m.y - this.ty) > scale * (2.5 + this.lost * 8) && this.suspect < 2) {
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
      this.mx = null;
    }
    this.suspect = 0;
    this.ok = true;
    this.lost = 0;

    const T = this.tune;
    const fx = this.fx.filter(m.x / scale, dt, T.minCutoff, T.beta) * scale;
    const fy = this.fy.filter(m.y / scale, dt, T.minCutoff, T.beta) * scale;
    // Measure the signal's wobble while the point is (nearly) still, so a shaky signal
    // gets a bigger deadband and a clean one stays quick.
    if (this.mx !== null) {
      const step = Math.hypot(m.x - this.mx, m.y - this.my);
      const moving = Math.hypot(fx - this.tx, fy - this.ty) / dt / scale > 1.2; // body-widths per second
      if (!moving) this.jitter += (step - this.jitter) * 0.1;
    }
    this.mx = m.x; this.my = m.y;
    // Soft deadband: tiny wiggles don't move the target at all.
    const db = Math.min(scale * 0.1, Math.max(T.deadband * scale, this.jitter * 0.9));
    const dx = fx - this.tx, dy = fy - this.ty, d = Math.hypot(dx, dy);
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
let handLandmarker = null;  // precise hand finder, run on a zoomed-in crop around each hand
let handMs = 0;             // running average time per hand crop
let handTurn = 0;           // which hand to refine next
let handFrame = 0;          // frame counter for spacing out hand refinement on slower computers
let frameGapMs = 33;        // time between camera frames, from the camera's own frame rate
const CROP = 224;
const crop = document.createElement("canvas");
crop.width = crop.height = CROP;
const cropCtx = crop.getContext("2d");
// Per hand: offset from the rough body-tracker hand to the precise hand-tracker hand.
const handFix = [{ dx: 0, dy: 0, seen: false, miss: 0 }, { dx: 0, dy: 0, seen: false, miss: 0 }];

// Live numbers for the debug overlay (press D in game).
export const stats = { fps: 0, detectMs: 0, model: "", raw: [null, null], handMs: 0, precise: [false, false], handFix, brightness: null };
// Switches that tests can flip to compare before/after.
export const tuning = { lowLightBoost: true };

// How bright the camera picture is (0 = black, 1 = white), checked a few times a second.
const lumaCanvas = document.createElement("canvas");
lumaCanvas.width = 32; lumaCanvas.height = 18;
const lumaCtx = lumaCanvas.getContext("2d", { willReadFrequently: true });
let lumaFrame = 0;
function measureBrightness() {
  if (lumaFrame++ % 10 !== 0) return;
  try {
    lumaCtx.drawImage(video, 0, 0, 32, 18);
    const d = lumaCtx.getImageData(0, 0, 32, 18).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const b = sum / (d.length / 4) / 255;
    stats.brightness = stats.brightness == null ? b : stats.brightness * 0.7 + b * 0.3;
  } catch { /* camera not ready */ }
}

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

async function createHandLandmarker(delegate) {
  return vision.mod.HandLandmarker.createFromOptions(vision.fileset, {
    baseOptions: { ...(await modelOptions("hand")), delegate },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
  });
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
      // Budget tracking work against the camera's real frame rate (not how fast we happen to keep up,
      // which would make a slow computer take on even more work).
      const fps = stream.getVideoTracks()[0]?.getSettings?.().frameRate;
      frameGapMs = fps > 0 ? 1000 / fps : 33;
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
  if (!handLandmarker) {
    onStatus("Loading hand tracker… ✋");
    try {
      handLandmarker = await createHandLandmarker("GPU");
    } catch {
      try { handLandmarker = await createHandLandmarker("CPU"); } catch (err) { console.warn("Hand tracker unavailable", err); }
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
  // Drop a hand's finger shape if it hasn't been seen for a moment (e.g. the camera paused).
  player.hands.forEach((h, i) => { if (h.shape && performance.now() - (handFix[i].shapeAt ?? 0) > 400) h.shape = null; });
  refreshVisibility(dt);
}

// Zoom in on each rough hand spot and let the hand tracker find the real hand.
// The difference is remembered, so frames where the hand tracker misses stay put instead of jumping.
function refineHands(rough, lm) {
  if (!handLandmarker) { stats.precise = [false, false]; return; }
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;
  const sl = lm[L_SHOULDER], sr = lm[R_SHOULDER];
  const shoulderPx = Math.hypot((sl.x - sr.x) * vw, (sl.y - sr.y) * vh) || vw * 0.2;
  const size = clamp(shoulderPx * 2.5, 112, Math.min(vw, vh)); // tested: finds the hand even when the rough guess is well off
  // Use the time left over between camera frames: fast computers refine both hands every frame,
  // slower ones one hand every few frames. (The correction is remembered, so circles stay accurate.)
  const spare = Math.max(4, frameGapMs - detectMs - 4);
  const every = Math.max(1, Math.min(8, Math.ceil(handMs / spare)));
  const which = handMs * 2 <= spare ? [0, 1] : handFrame++ % every === 0 ? [handTurn++ % 2] : [];
  rough.forEach((p, i) => {
    const fix = handFix[i];
    fix.now = null;
    if (!p || p.visibility < 0.3) {
      // Hand hidden: after a while, forget the old correction.
      if (++fix.miss > 8) { fix.dx *= 0.85; fix.dy *= 0.85; fix.seen = false; }
      stats.precise[i] = false;
      return;
    }
    if (!which.includes(i)) return; // skipped this frame to save time; keep the last correction
    // Centre the zoom box on our best guess (rough spot + last correction), so fast hands stay inside it.
    // The box only moves when the hand drifts well away from its centre; moving it every frame would
    // feed back into the result and make the circle wander.
    const gx = p.x + (fix.seen ? fix.dx : 0), gy = p.y + (fix.seen ? fix.dy : 0);
    const off = fix.box ? Math.hypot((gx - fix.box.x) * vw, (gy - fix.box.y) * vh) : Infinity;
    if (!fix.seen || off > size * 0.18) fix.box = { x: gx, y: gy };
    const sx = clamp(fix.box.x * vw - size / 2, 0, vw - size), sy = clamp(fix.box.y * vh - size / 2, 0, vh - size);
    const started = performance.now();
    cropCtx.drawImage(video, sx, sy, size, size, 0, 0, CROP, CROP);
    let res = null;
    try { res = handLandmarker.detect(crop); } catch { res = null; }
    // Dim room and no hand found: try again with a brightened picture. (Only as a second try:
    // brightening a picture that was fine can make things worse.)
    if (!res?.landmarks?.length && tuning.lowLightBoost && stats.brightness != null && stats.brightness < 0.35) {
      cropCtx.filter = `brightness(${clamp(0.45 / Math.max(stats.brightness, 0.05), 1.3, 2.6).toFixed(2)}) contrast(1.15)`;
      cropCtx.drawImage(video, sx, sy, size, size, 0, 0, CROP, CROP);
      cropCtx.filter = "none";
      try { res = handLandmarker.detect(crop); } catch { res = null; }
    }
    handMs = handMs * 0.9 + (performance.now() - started) * 0.1;
    stats.handMs = handMs;
    // Of the hands found in the crop, take the one nearest the rough spot.
    const found = pickHand(res, (gx * vw - sx) / size, (gy * vh - sy) / size, 0.5);
    if (found) {
      const nx = (sx + found.x * size) / vw, ny = (sy + found.y * size) / vh;
      const k = fix.seen ? 0.35 : 1; // first sighting snaps; after that blend gently so it doesn't twitch
      fix.dx += (nx - p.x - fix.dx) * k;
      fix.dy += (ny - p.y - fix.dy) * k;
      fix.seen = true;
      fix.miss = 0;
      fix.now = { x: nx, y: ny }; // exact spot this frame
      fix.last = fix.now; fix.lastAt = performance.now();
      fix.shape = found.lm.map((q) => ({ x: (sx + q.x * size) / vw, y: (sy + q.y * size) / vh }));
      fix.shapeAt = performance.now();
      p.visibility = Math.max(p.visibility, 0.9); // the hand tracker is sure it's there
    } else if (++fix.miss > 3) {
      // The hand tracker keeps missing: ease back to the body tracker's guess.
      fix.dx *= 0.85; fix.dy *= 0.85;
      fix.seen = false;
    }
    stats.precise[i] = fix.seen && fix.miss === 0;
  });

  // Never let both circles sit on the same real hand (hands together, clapping, crossing):
  // the one whose body-tracker guess is further away gives it up.
  const [f0, f1] = handFix;
  if (f0.now && f1.now && Math.hypot((f0.now.x - f1.now.x) * vw, (f0.now.y - f1.now.y) * vh) < shoulderPx * 0.3) {
    const dist = (f, p) => (p ? Math.hypot(f.now.x - p.x, f.now.y - p.y) : Infinity);
    const loser = dist(f0, rough[0]) <= dist(f1, rough[1]) ? f1 : f0;
    loser.now = null; loser.shape = null; loser.seen = false; loser.miss++;
  }
}

// Palm centre (wrist + four knuckles) of the detected hand closest to (cx, cy), in crop coords.
export function pickHand(res, cx, cy, maxDist = 0.45) {
  let best = null, bestD = maxDist;
  for (const h of res?.landmarks ?? []) {
    const c = [0, 5, 9, 13, 17].reduce((acc, k) => ({ x: acc.x + h[k].x / 5, y: acc.y + h[k].y / 5 }), { x: 0, y: 0 });
    const dd = Math.hypot(c.x - cx, c.y - cy);
    if (dd < bestD) { bestD = dd; best = { x: c.x, y: c.y, lm: h }; }
  }
  return best;
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

  measureBrightness();
  const t = nowMs / 1000;
  const r = videoRect();
  const mx = settings.mirror ? (x) => 1 - x : (x) => x;
  const at = (p) => ({ x: r.x + mx(p.x) * r.w, y: r.y + p.y * r.h, vis: p.visibility ?? 1 });
  const pt = (i) => (lm ? at(lm[i]) : null);
  // Rough hand centre from the body tracker: wrist blended toward the knuckles (normalized video coords).
  const palmN = (w, p, i) => {
    if (!lm) return null;
    const a = lm[w], b = lm[p], c = lm[i];
    return {
      x: a.x * 0.5 + b.x * 0.25 + c.x * 0.25,
      y: a.y * 0.5 + b.y * 0.25 + c.y * 0.25,
      visibility: (a.visibility ?? 1) * 0.6 + Math.max(b.visibility ?? 1, c.visibility ?? 1) * 0.4,
    };
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

  // Hands: start from the body tracker, then zoom in with the hand tracker for the exact spot.
  const rough = [palmN(L_WRIST, L_PINKY, L_INDEX), palmN(R_WRIST, R_PINKY, R_INDEX)];
  if (lm) refineHands(rough, lm);
  // Use the hand tracker's exact spot when it ran this frame; otherwise the rough spot plus the last correction.
  const fixed = rough.map((p, i) => {
    const f = handFix[i];
    if (f.now) return { x: f.now.x, y: f.now.y, visibility: p ? p.visibility : 0.9 };
    if (p) return { x: p.x + f.dx, y: p.y + f.dy, visibility: p.visibility };
    // The body tracker lost the arm but the hand was seen a moment ago: keep it briefly.
    if (f.seen && f.last && performance.now() - f.lastAt < 300) return { x: f.last.x, y: f.last.y, visibility: 0.6 };
    return null;
  });
  let hA = fixed[0] ? at(fixed[0]) : null;
  let hB = fixed[1] ? at(fixed[1]) : null;
  const [t0, t1] = player.hands;
  const p0 = t0.predict(t), p1 = t1.predict(t);
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // If both guesses sit on the same spot and one of them is unsure, that hand is hidden:
  // keep only the confident one (on whichever circle is closer). Real claps keep both.
  if (hA && hB && d(hA, hB) < s * 0.3 && Math.min(hA.vis, hB.vis) < 0.5) {
    const keep = hA.vis >= hB.vis ? hA : hB;
    const to0 = t0.ok && (!t1.ok || d(p0, keep) <= d(p1, keep));
    hA = to0 || !t1.ok ? keep : null;
    hB = hA ? null : keep;
  }
  stats.raw = [hA, hB];
  t0.update(hA, t, s);
  t1.update(hB, t, s);
  // Real hand shape (fingers) for drawing, as offsets from the palm centre in screen px.
  [t0, t1].forEach((tp, i) => {
    const f = handFix[i];
    if (!f.shape || performance.now() - f.shapeAt > 400) { tp.shape = null; return; }
    const pts = f.shape.map(at);
    const c = [0, 5, 9, 13, 17].reduce((acc, k) => ({ x: acc.x + pts[k].x / 5, y: acc.y + pts[k].y / 5 }), { x: 0, y: 0 });
    tp.shape = pts.map((q) => ({ x: q.x - c.x, y: q.y - c.y }));
    tp.handSize = Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y); // wrist to middle knuckle
  });
}

// ---------- Finger mode / mouse ("head" = pointer moves you, "hand" = each finger is a hand) ----------
export function updateFromMouse(m, style, dt) {
  const s = Math.min(view.W, view.H) * 0.18;
  player.scale = s;
  const [h0, h1] = player.hands;
  if (style === "hand") {
    player.head.set(view.W / 2, view.H * 0.55);
    if (m.touch) {
      // Touch: up to two fingers, and a hand only exists while its finger is down.
      const pts = [...m.pointers.values()];
      if (pts[0]) h1.set(pts[0].x, pts[0].y); else h1.ok = false;
      if (pts[1]) h0.set(pts[1].x, pts[1].y); else h0.ok = false;
    } else {
      h1.set(m.x, m.y);
      h0.ok = false;
    }
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
