// Shared drawing, sound and effects helpers.
export const view = { W: 0, H: 0 };
export let ctx = null;
export function setCtx(c) { ctx = c; }

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Sound ----------
let audio = null;
let muted = false;
export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  if (m && "speechSynthesis" in window) speechSynthesis.cancel();
}

export function tone(freq, dur = 0.12, type = "sine", vol = 0.2, slide = 0) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch { /* audio is optional */ }
}

export const sfx = {
  star: () => { tone(880, 0.1, "triangle"); setTimeout(() => tone(1320, 0.15, "triangle"), 70); },
  pop: (pitch = 1) => tone(500 * pitch, 0.09, "sine", 0.25, 600 * pitch),
  bonk: () => tone(220, 0.3, "square", 0.15, -140),
  tick: () => tone(600, 0.06, "sine", 0.08),
  yay: () => { tone(520, 0.1, "triangle"); setTimeout(() => tone(780, 0.18, "triangle"), 90); },
  nope: () => { tone(330, 0.15, "triangle"); setTimeout(() => tone(250, 0.25, "triangle"), 120); },
  warn: () => tone(440, 0.2, "sawtooth", 0.1),
  beep: () => tone(660, 0.15, "sine", 0.2),
  go: () => tone(990, 0.35, "sine", 0.25),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, "triangle"), i * 130)),
};

export function say(text) {
  if (muted || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.1;
  u.pitch = 1.4;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- Drawing ----------
const EMOJI_FONT = `"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;

export function drawEmoji(emoji, x, y, size, angle = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

export function bigText(text, x, y, size, color = "#fff") {
  ctx.font = `800 ${size}px "Baloo 2", ${EMOJI_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(4, size / 7);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20, 8, 60, 0.9)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function circle(x, y, r, fill, stroke, lw = 4) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export function progressBar(x, y, w, h, frac, color) {
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp(frac, 0, 1)), h, h / 2); ctx.fill();
  }
}

// Glowing hand circles + helmet ring around the head.
export function drawPlayer(p, now, { hurt = false, showHead = true } = {}) {
  if (!p.visible) return;
  const s = p.scale;
  for (const h of p.hands) {
    if (!h.ok) continue;
    ctx.globalAlpha = h.alpha;
    circle(h.x, h.y, s * 0.3, "rgba(120, 255, 220, 0.3)", "#7fffe0", 4);
    circle(h.x, h.y, s * 0.07, "#7fffe0");
  }
  ctx.globalAlpha = 1;
  if (showHead && !(hurt && Math.floor(now / 100) % 2 === 0)) {
    circle(p.head.x, p.head.y, s * 0.42, null, hurt ? "#ff8fa3" : "#ffffff", 6);
  }
}

// ---------- Particles & popups ----------
const particles = [];
const popups = [];

export function popup(text, x, y, color = "#fff", size = 42) {
  popups.push({ text, x, y, color, size, t: 0 });
}
export function burst(x, y, color, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(120, 380);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, color });
  }
}
export function clearEffects() { particles.length = 0; popups.length = 0; }

export function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    popups[i].t += dt;
    popups[i].y -= 60 * dt;
    if (popups[i].t > 1.1) popups.splice(i, 1);
  }
}

export function drawEffects() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.7);
    circle(p.x, p.y, 5, p.color);
  }
  for (const p of popups) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / 1.1);
    bigText(p.text, p.x, p.y, p.size, p.color);
  }
  ctx.globalAlpha = 1;
}
