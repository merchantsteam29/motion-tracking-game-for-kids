// Ski Slalom: step left and right to steer through the flag gates and around the trees.
import { view, ctx, sfx, tone, popup, burst, drawEmoji, bigText, drawPlayer, rand, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

export default {
  id: "ski",
  title: "Ski Slalom",
  emoji: "⛷️",
  color: "#9fd3ff",
  blurb: "Ski through the gates!",
  how: [
    ["↔️", "Step left and right to steer"],
    ["🚩", "Ski between the flags"],
    ["🌲", "Miss the trees!"],
  ],
  finger: [
    ["👆", "Drag left and right to steer"],
    ["🚩", "Ski between the flags"],
    ["🌲", "Miss the trees!"],
  ],
  fingerTip: "👆 Drag left and right to steer",
  rate: (g) => {
    const n = g.gates + g.missed;
    if (n < 5) return 0;
    const f = g.gates / n;
    return f >= 0.9 ? 3 : f >= 0.75 ? 2 : f >= 0.5 ? 1 : 0;
  },
  mouse: "head",
  levels: {
    // speed = screen heights per second, gap = gate width (share of screen), gain = how far the skier moves per step
    easy:   { time: 60, speed: 0.22, gateEvery: 2.3, gap: 0.36, trees: 0.35, gain: 2.2 },
    medium: { time: 75, speed: 0.3,  gateEvery: 1.8, gap: 0.28, trees: 0.55, gain: 2.2 },
    hard:   { time: 90, speed: 0.4,  gateEvery: 1.4, gap: 0.22, trees: 0.75, gain: 2.2 },
  },
  create: (cfg) => new Ski({ ...cfg, gain: cfg.gain / body.reach }),
};

class Ski {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.gates = 0; this.missed = 0; this.bumps = 0; this.streak = 0;
    this.things = [];  // gates and trees scrolling up the slope
    this.trail = [];
    this.center = null;
    this.x = null; this.dir = 0;
    this.next = 1; this.t = 0; this.slow = 0;
  }

  get skierY() { return view.H * 0.3; }

  update(dt) {
    const { W, H } = view, cfg = this.cfg;
    this.t += dt;
    this.slow = Math.max(0, this.slow - dt);

    // Steering: body position (or finger) moves the skier.
    // "Straight ahead" is where you stood at the start, and it slowly follows you
    // so the skier never gets stuck to one side.
    if (this.center === null) this.center = player.cx;
    this.center += (player.cx - this.center) * Math.min(1, dt * 0.08);
    const target = player.finger ? player.head.x : W / 2 + (player.cx - this.center) * cfg.gain;
    const tx = clamp(target, 30, W - 30);
    if (this.x === null) this.x = tx;
    const prev = this.x;
    this.x += (tx - this.x) * Math.min(1, dt * 8);
    this.dir = this.x - prev;

    const speed = H * cfg.speed * (1 + this.t / 120) * (this.slow > 0 ? 0.5 : 1);

    this.next -= dt * (speed / (H * cfg.speed));
    if (this.next <= 0) {
      this.next = cfg.gateEvery * rand(0.85, 1.15);
      const gap = W * cfg.gap;
      const gx = clamp(W / 2 + rand(-0.32, 0.32) * W, gap / 2 + 20, W - gap / 2 - 20);
      this.things.push({ kind: "gate", x: gx, y: H + 40, gap, done: false });
      if (Math.random() < cfg.trees) {
        // A tree outside the gate, so there's always a way through.
        const side = Math.random() < 0.5 ? -1 : 1;
        const tx2 = clamp(gx + side * (gap / 2 + rand(40, 120)), 30, W - 30);
        this.things.push({ kind: "tree", x: tx2, y: H + 40 + rand(60, 160), r: Math.min(W, H) * 0.045, hit: false });
      }
    }

    const sy = this.skierY;
    for (const o of this.things) {
      const before = o.y;
      o.y -= speed * dt;
      if (o.kind === "gate" && !o.done && before >= sy && o.y < sy) {
        o.done = true;
        if (Math.abs(this.x - o.x) < o.gap / 2) {
          this.gates++;
          this.streak++;
          this.score += 1 + Math.floor(this.streak / 5);
          tone(660 + Math.min(this.streak, 10) * 30, 0.1, "triangle", 0.15);
          popup(this.streak % 5 === 0 ? `🔥 ${this.streak} gates!` : "Nice!", this.x, sy - 50, "#9dffb0", 36);
        } else {
          this.missed++;
          this.streak = 0;
          sfx.nope();
          popup("Missed the gate!", this.x, sy - 50, "#ffb3c1", 34);
        }
      }
      if (o.kind === "tree" && !o.hit && Math.hypot(o.x - this.x, o.y - sy) < o.r + Math.min(view.W, view.H) * 0.03) {
        o.hit = true;
        this.bumps++;
        this.streak = 0;
        this.slow = 1;
        sfx.bonk();
        burst(this.x, sy, "#ffffff", 16);
        popup("Bonk! 🌲", this.x, sy - 50, "#ffb3c1", 38);
      }
    }
    this.things = this.things.filter((o) => o.y > -80);
    this.trail.push({ x: this.x, y: sy });
    for (const p of this.trail) p.y -= speed * dt;
    this.trail = this.trail.filter((p) => p.y > -10);
  }

  draw(now) {
    const { W, H } = view;
    // Snowy slope over the camera picture.
    ctx.fillStyle = "rgba(235, 245, 255, 0.55)";
    ctx.fillRect(0, 0, W, H);
    // Ski tracks
    ctx.strokeStyle = "rgba(120, 150, 190, 0.6)";
    ctx.lineWidth = 3;
    for (const off of [-6, 6]) {
      ctx.beginPath();
      this.trail.forEach((p, i) => (i ? ctx.lineTo(p.x + off, p.y) : ctx.moveTo(p.x + off, p.y)));
      ctx.stroke();
    }
    for (const o of this.things) {
      if (o.kind === "gate") {
        const col = o.done ? "rgba(150,150,150,0.6)" : "#ff3b3b";
        ctx.strokeStyle = "rgba(255, 59, 59, 0.25)";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 8]);
        ctx.beginPath(); ctx.moveTo(o.x - o.gap / 2, o.y); ctx.lineTo(o.x + o.gap / 2, o.y); ctx.stroke();
        ctx.setLineDash([]);
        for (const sx of [-1, 1]) {
          const fx = o.x + sx * o.gap / 2;
          ctx.strokeStyle = "#333"; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(fx, o.y + 20); ctx.lineTo(fx, o.y - 30); ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(fx, o.y - 30); ctx.lineTo(fx + sx * 26, o.y - 20); ctx.lineTo(fx, o.y - 10); ctx.fill();
        }
      } else {
        drawEmoji("🌲", o.x, o.y, o.r * 2.4);
      }
    }
    // Skier leans the way they're going.
    const size = Math.max(64, Math.min(W, H) * 0.11);
    ctx.fillStyle = "rgba(40, 60, 90, 0.25)";
    ctx.beginPath(); ctx.ellipse(this.x ?? W / 2, this.skierY + size * 0.45, size * 0.45, size * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    // Blue badge so the (mostly white) skier stands out on the snow.
    ctx.fillStyle = "rgba(40, 70, 160, 0.9)";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(this.x ?? W / 2, this.skierY, size * 0.58, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.translate(this.x ?? W / 2, this.skierY);
    if (this.dir < 0) ctx.scale(-1, 1);
    drawEmoji("⛷️", 0, 0, size, clamp(this.dir * 0.03, -0.4, 0.4));
    ctx.restore();

    if (!player.finger) drawPlayer(player, now);
    if (this.streak >= 3) bigText(`🔥 ${this.streak}`, W / 2, 110, 44, "#ff9f1c");
  }

  results() {
    return [
      { emoji: "🚩", value: this.gates, label: "gates" },
      { emoji: "😬", value: this.missed, label: "missed" },
      { emoji: "🌲", value: this.bumps, label: "tree bumps" },
    ];
  }
}
