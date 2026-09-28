// Drum Beat: hit the drum pads in time — strike each pad as its ring closes in.
import { view, ctx, tone, popup, burst, drawEmoji, bigText, drawPlayer, circle, rand, pick, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// Pads around the body (shoulder-widths from the chest) and their sounds.
const PADS = [
  { dx: -1.5, dy: -0.9, color: "#ff5c7a", freq: 220, emoji: "🥁" },
  { dx: 1.5, dy: -0.9, color: "#4dabff", freq: 330, emoji: "🥁" },
  { dx: -1.3, dy: 0.6, color: "#ffd84d", freq: 150, emoji: "🪘" },
  { dx: 1.3, dy: 0.6, color: "#2fcf8a", freq: 440, emoji: "🪘" },
];
const LEAD = 1.4; // seconds a ring takes to close in

export default {
  id: "drums",
  title: "Drum Beat",
  emoji: "🥁",
  color: "#ff9f1c",
  blurb: "Hit the beat!",
  how: [
    ["⭕", "Watch the ring shrink onto a drum"],
    ["🥁", "Hit that drum when the ring lands"],
    ["🔥", "Stay on the beat for combos"],
  ],
  finger: [
    ["⭕", "Watch the ring shrink onto a drum"],
    ["👆", "Tap the drum when it lands"],
    ["🔥", "Stay on the beat for combos"],
  ],
  fingerTip: "👆 Tap the drums on the beat!",
  rate: (g) => {
    const n = g.hits + g.misses;
    if (n < 8) return 0;
    const f = g.hits / n;
    return f >= 0.85 ? 3 : f >= 0.65 ? 2 : f >= 0.45 ? 1 : 0;
  },
  mouse: "hand",
  levels: {
    // bpm = beats per minute, window = seconds early/late that still counts, density = share of beats with a note
    easy:   { time: 60, bpm: 66,  window: 0.4,  density: 0.5, reach: 1.0 },
    medium: { time: 75, bpm: 84,  window: 0.3,  density: 0.65, reach: 1.05 },
    hard:   { time: 90, bpm: 100, window: 0.22, density: 0.85, reach: 1.1 },
  },
  create: (cfg) => new Drums({ ...cfg, reach: cfg.reach * body.reach }),
};

class Drums {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.hits = 0; this.perfect = 0; this.misses = 0; this.combo = 0; this.best = 0;
    this.t = 0;
    this.beat = 60 / cfg.bpm;
    this.nextBeat = 1.5;   // time of the next beat to schedule
    this.tickAt = 1.5;
    this.notes = [];
    this.flash = PADS.map(() => 0);
    this.inside = [PADS.map(() => false), PADS.map(() => false)];
    this.anchor = null;
    this.lastPad = -1;
  }

  padPos(i) {
    const a = this.anchor, s = a.s * this.cfg.reach, p = PADS[i];
    return { x: clamp(a.x + p.dx * s, 60, view.W - 60), y: clamp(a.y + p.dy * s, 110, view.H - 60), r: Math.max(34, a.s * 0.42) };
  }

  strike(i) {
    this.flash[i] = 0.25;
    tone(PADS[i].freq, 0.14, "triangle", 0.25, -PADS[i].freq * 0.4);
    // The note for this pad closest to now, if it's within the timing window.
    let best = null;
    for (const n of this.notes) if (!n.done && n.pad === i && Math.abs(n.at - this.t) <= this.cfg.window && (!best || Math.abs(n.at - this.t) < Math.abs(best.at - this.t))) best = n;
    if (!best) return;
    best.done = true;
    const off = Math.abs(best.at - this.t), pos = this.padPos(i);
    this.hits++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    if (off <= this.cfg.window * 0.4) { this.perfect++; this.score += 3; popup("Perfect!", pos.x, pos.y - pos.r - 10, "#ffe066", 32); }
    else { this.score += 2; popup("Good!", pos.x, pos.y - pos.r - 10, "#9dffb0", 28); }
    if (this.combo % 10 === 0) { this.score += 5; popup(`🔥 ${this.combo} combo! +5`, view.W / 2, view.H * 0.25, "#ff9f1c", 48); }
    burst(pos.x, pos.y, PADS[i].color, 12);
  }

  onTap(x, y) {
    if (!player.finger || !this.anchor) return;
    PADS.forEach((_, i) => { const p = this.padPos(i); if (Math.hypot(x - p.x, y - p.y) < p.r * 1.3) this.strike(i); });
  }

  update(dt) {
    const target = { x: player.cx, y: player.shY, s: player.scale };
    if (!this.anchor) this.anchor = { ...target };
    const k = Math.min(1, dt * 2);
    for (const key of ["x", "y", "s"]) this.anchor[key] += (target[key] - this.anchor[key]) * k;
    this.t += dt;

    // Schedule notes LEAD seconds ahead, on the beat.
    while (this.nextBeat < this.t + LEAD) {
      if (Math.random() < this.cfg.density) {
        let pad; do pad = Math.floor(Math.random() * PADS.length); while (pad === this.lastPad && Math.random() < 0.7);
        this.lastPad = pad;
        this.notes.push({ pad, at: this.nextBeat, done: false });
      }
      this.nextBeat += this.beat;
    }
    // Soft metronome click on every beat.
    if (this.t >= this.tickAt) { tone(1200, 0.03, "sine", 0.05); this.tickAt += this.beat; }

    // Hands hitting pads: a hit is a hand arriving on a pad (not just resting there).
    if (!player.finger) {
      player.hands.forEach((h, hi) => {
        PADS.forEach((_, i) => {
          const p = this.padPos(i), inside = h.ok && Math.hypot(h.x - p.x, h.y - p.y) < p.r * 1.25;
          if (inside && !this.inside[hi][i]) this.strike(i);
          this.inside[hi][i] = inside;
        });
      });
    }
    for (const n of this.notes) {
      if (!n.done && this.t > n.at + this.cfg.window) { n.done = true; n.missed = true; this.misses++; this.combo = 0; }
    }
    this.notes = this.notes.filter((n) => !n.done || this.t - n.at < 0.3);
    this.flash = this.flash.map((f) => Math.max(0, f - dt));
  }

  draw(now) {
    if (!this.anchor) return;
    PADS.forEach((pad, i) => {
      const p = this.padPos(i);
      circle(p.x, p.y, p.r * (1 + this.flash[i]), this.flash[i] > 0 ? "rgba(255,255,255,0.85)" : pad.color, "#fff", 4);
      drawEmoji(pad.emoji, p.x, p.y, p.r * 1.1);
    });
    // Rings close in on their pad and land exactly on the beat.
    for (const n of this.notes) {
      if (n.done) continue;
      const p = this.padPos(n.pad), left = n.at - this.t;
      if (left > LEAD) continue;
      const r = p.r * (1 + 2.2 * Math.max(0, left / LEAD));
      ctx.strokeStyle = Math.abs(left) <= this.cfg.window ? "#ffe066" : PADS[n.pad].color;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    drawPlayer(player, now, { showHead: false });
    if (this.combo >= 3) bigText(`🔥 ${this.combo}`, view.W / 2, 110, 44, "#ff9f1c");
  }

  results() {
    return [
      { emoji: "🥁", value: this.hits, label: "beats hit" },
      { emoji: "⭐", value: this.perfect, label: "perfect" },
      { emoji: "🔥", value: this.best, label: "best combo" },
    ];
  }
}
