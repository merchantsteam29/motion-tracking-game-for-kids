// Camera + body tracking (Google MediaPipe Pose Landmarker, free and runs locally).
// Produces a `player` object in screen pixels with filtered, stable points.
import { PoseLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { view } from "./fx.js";

const MP_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_FULL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const MODEL_LITE =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// BlazePose landmark indices
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_WRIST = 15, R_WRIST = 16,
  L_PINKY = 17, R_PINKY = 18, L_INDEX = 19, R_INDEX = 20, L_HIP = 23, R_HIP = 24;

// ---------- One Euro filter: smooth when still, responsive when moving fast ----------
const lpAlpha = (cutoff, dt) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);

class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.prev = null; this.dPrev = 0; }
  filter(v, dt) {
    if (this.prev === null) { this.prev = v; return v; }
    const d = (v - this.prev) / dt;
    this.dPrev += lpAlpha(this.dCutoff, dt) * (d - this.dPrev);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dPrev);
    this.prev += lpAlpha(cutoff, dt) * (v - this.prev);
    return this.prev;
  }
}

// A single tracked body point with visibility hysteresis, short hold-on-loss and outlier rejection.
class TrackedPoint {
  constructor({ minCutoff = 1.0, beta = 0.01, acquire = 0.5, lose = 0.3, hold = 0.25, need = 1 } = {}) {
    Object.assign(this, { acquire, lose, hold, need });
    this.fx = new OneEuro(minCutoff, beta);
    this.fy = new OneEuro(minCutoff, beta);
    this.x = 0; this.y = 0;
    this.ok = false; this.lost = 0; this.good = 0; this.suspect = 0;
  }
  update(m, dt, scale) {
    const threshold = this.ok ? this.lose : this.acquire;
    if (!m || m.vis < threshold) {
      this.good = 0;
      if (this.ok) { this.lost += dt; if (this.lost > this.hold) this.ok = false; }
      return;
    }
    if (this.ok) {
      // A sudden huge jump is usually a tracking glitch: ignore it unless it sticks around.
      if (Math.hypot(m.x - this.x, m.y - this.y) > scale * 2.5 && this.suspect < 2) {
        this.suspect++;
        return;
      }
    } else if (++this.good < this.need) {
      return; // need a few good frames before showing the point again
    }
    if (!this.ok || this.suspect >= 2) { this.fx.reset(); this.fy.reset(); }
    this.suspect = 0;
    this.ok = true;
    this.lost = 0;
    this.x = this.fx.filter(m.x, dt);
    this.y = this.fy.filter(m.y, dt);
  }
  set(x, y) { this.x = x; this.y = y; this.ok = true; this.lost = 0; }
  get alpha() { return this.ok ? Math.max(0.35, 1 - this.lost / this.hold) : 0; }
}

const handOpts = { minCutoff: 1.2, beta: 0.02, acquire: 0.6, lose: 0.25, hold: 0.35, need: 2 };

export const player = {
  visible: false,
  seenFor: 0,
  missingFor: 0,
  head: new TrackedPoint(),
  shoulders: [new TrackedPoint(), new TrackedPoint()],
  hips: [new TrackedPoint({ acquire: 0.6 }), new TrackedPoint({ acquire: 0.6 })],
  hands: [new TrackedPoint(handOpts), new TrackedPoint(handOpts)],
  scale: 120,   // body size in px (≈ shoulder width)
  baseY: null,  // standing head height, set during countdown
  get cx() { return (this.shoulders[0].x + this.shoulders[1].x) / 2; },
  get shY() { return (this.shoulders[0].y + this.shoulders[1].y) / 2; },
};

// ---------- Camera ----------
export const video = document.getElementById("cam");
let landmarker = null;
let camReady = false;
let lastVideoTime = -1;
let lastDetect = 0;

export const hasCamera = () => camReady;

export async function initTracking(onStatus) {
  if (!camReady) {
    onStatus("Waking up the camera…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      camReady = true;
    } catch (err) {
      return {
        ok: false,
        error: err?.name === "NotAllowedError"
          ? "Camera permission was blocked. Open http://localhost:8080 in Chrome or Edge, then click the camera icon in the address bar and choose Allow."
          : !window.isSecureContext
            ? "Open the game from http://localhost:8080 (run: node server.js). Browsers only allow cameras on secure pages."
            : "No camera was found, or another app is using it.",
      };
    }
  }
  if (!landmarker) {
    onStatus("Loading body tracker… 🤖");
    try {
      const vision = await FilesetResolver.forVisionTasks(MP_WASM);
      const opts = (model, delegate) => ({
        baseOptions: { modelAssetPath: model, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try {
        landmarker = await PoseLandmarker.createFromOptions(vision, opts(MODEL_FULL, "GPU"));
      } catch {
        // No GPU: the lite model keeps things fast on the CPU.
        landmarker = await PoseLandmarker.createFromOptions(vision, opts(MODEL_LITE, "CPU"));
      }
    } catch (err) {
      console.error(err);
      return { ok: false, error: "The body tracker couldn't load. Check your internet connection and try again." };
    }
  }
  return { ok: true };
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
  ctx.translate(r.x + r.w, r.y);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, r.w, r.h);
  ctx.restore();
  ctx.fillStyle = "rgba(30, 14, 80, 0.35)";
  ctx.fillRect(-20, -20, view.W + 40, view.H + 40);
}

// ---------- Per-frame update ----------
function refreshVisibility(dt) {
  const ok = player.head.ok && player.shoulders[0].ok && player.shoulders[1].ok;
  if (ok) { player.visible = true; player.seenFor += dt; player.missingFor = 0; }
  else { player.missingFor += dt; player.seenFor = 0; if (player.missingFor > 0.3) player.visible = false; }
}

export function updateTracking(dt) {
  if (landmarker && camReady && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    detect();
  }
  refreshVisibility(dt);
}

function detect() {
  const now = performance.now();
  const fdt = Math.min(0.25, Math.max(1 / 120, (now - lastDetect) / 1000));
  lastDetect = now;

  const lm = landmarker.detectForVideo(video, now).landmarks?.[0];
  const r = videoRect();
  const at = (p) => ({ x: r.x + (1 - p.x) * r.w, y: r.y + p.y * r.h, vis: p.visibility ?? 1 });
  const pt = (i) => (lm ? at(lm[i]) : null);
  // Hand centre ≈ blend of wrist and knuckles (more natural than the bare wrist).
  const palm = (w, p, i) => {
    if (!lm) return null;
    const a = lm[w], b = lm[p], c = lm[i];
    return at({
      x: a.x * 0.4 + b.x * 0.3 + c.x * 0.3,
      y: a.y * 0.4 + b.y * 0.3 + c.y * 0.3,
      visibility: ((a.visibility ?? 1) + (b.visibility ?? 1) + (c.visibility ?? 1)) / 3,
    });
  };

  const s = player.scale;
  player.head.update(pt(NOSE), fdt, s);
  player.shoulders[0].update(pt(L_SHOULDER), fdt, s);
  player.shoulders[1].update(pt(R_SHOULDER), fdt, s);
  player.hips[0].update(pt(L_HIP), fdt, s);
  player.hips[1].update(pt(R_HIP), fdt, s);

  // Body scale from shoulder width (or torso length when turned sideways).
  const [ls, rs] = player.shoulders;
  if (ls.ok && rs.ok) {
    let raw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    const [lh, rh] = player.hips;
    if (lh.ok && rh.ok) raw = Math.max(raw, 0.75 * Math.hypot(player.cx - (lh.x + rh.x) / 2, player.shY - (lh.y + rh.y) / 2));
    raw = Math.max(50, raw);
    player.scale = player.visible ? s + (raw - s) * Math.min(1, fdt * 3) : raw;
  }

  let hA = palm(L_WRIST, L_PINKY, L_INDEX);
  let hB = palm(R_WRIST, R_PINKY, R_INDEX);
  const [t0, t1] = player.hands;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  if (hA && hB && d(hA, hB) < s * 0.35) {
    // Both guesses landed on the same hand (the other is hidden): give it to the nearer track only.
    const keep = hA.vis >= hB.vis ? hA : hB;
    const to0 = t0.ok && (!t1.ok || d(t0, keep) <= d(t1, keep));
    hA = to0 || !t1.ok ? keep : null;
    hB = hA ? null : keep;
  } else if (hA && hB && t0.ok && t1.ok && d(t0, hB) + d(t1, hA) < 0.6 * (d(t0, hA) + d(t1, hB))) {
    // Tracker swapped left/right for a frame: keep each circle on its own hand.
    [hA, hB] = [hB, hA];
  }
  t0.update(hA, fdt, s);
  t1.update(hB, fdt, s);
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
  refreshVisibility(dt);
}
