// Boxing Pads: punch the pads as they pop up around you. Slow touches don't count — punch fast!
import { view, ctx, sfx, tone, popup, burst, drawEmoji, bigText, drawPlayer, circle, rand, pick, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// Pad spots at arm's length, in shoulder-widths from the chest.
const SPOTS = [[-1.4, -0.6], [1.4, -0.6], [-1.6, 0.3], [1.6, 0.3], [-0.8, -1.5], [0.8, -1.5], [0, -1.9]];
const WORDS = ["POW!", "BAM!", "WHAM!", "BOOM!", "ZAP!"];

export default {
  id: "boxing",
  title: "Boxing Pads",
  emoji: "🥊",
  color: "#ff3b3b",
  blurb: "Punch the pads fast!",
  how: [
    ["🥊", "Punch the pads fast"],
    ["💨", "Slow touches don't count"],
    ["⭐", "Gold pads = 2 points"],
  ],
  finger: [
    ["👆", "Tap the pads"],
    ["⏱️", "Before they disappear"],
    ["⭐", "Gold pads = 2 points"],
  ],
  fingerTip: "👆 Tap the pads!",
  stars: [15, 30, 45],
  mouse: "hand",
  levels: {
    // punch = hand speed needed (shoulder-widths per second), life = seconds a pad stays
    easy:   { time: 60, every: 1.1,  life: 2.4, punch: 1.2, max: 1, reach: 1.0 },
    medium: { time: 60, every: 0.8,  life: 1.8, punch: 1.8, max: 2, reach: 1.05 },
    hard:   { time: 75, every: 0.6,  life: 1.3, punch: 2.4, max: 3, reach: 1.1 },
  },
  create: (cfg) => new Boxing({ ...cfg, punch: cfg.punch * body.swipe, reach: cfg.reach * body.reach }),
};

class Boxing {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.hits = 0; this.misses = 0; this.combo = 0; this.best = 0;
    this.pads = [];
    this.spawn = 0.8;
    this.anchor = null;
    this.lastSpot = -1;
  }

  padPos(p) {
    const a = this.anchor, s = a.s * this.cfg.reach;
    return { x: clamp(a.x + p.dx * s, 50, view.W - 50), y: clamp(a.y + p.dy * s, 100, view.H - 50) };
  }

  hit(p, pos) {
    p.done = true;
    const pts = p.gold ? 2 : 1;
    this.hits++;
    this.combo++;
    this.best = Math.max(this.best, this.combo);
    this.score += pts + (this.combo % 5 === 0 ? 3 : 0);
    tone(rand(140, 200), 0.12, "square", 0.18, -60);
    burst(pos.x, pos.y, p.gold ? "#ffe066" : "#ff5c7a", 14);
    popup(pick(WORDS), pos.x, pos.y - 40, p.gold ? "#ffe066" : "#fff", 44);
    if (this.combo % 5 === 0) { sfx.yay(); popup(`${this.combo} combo! +3`, view.W / 2, view.H * 0.25, "#9dffb0", 50); }
  }

  onTap(x, y) {
    if (!player.finger || !this.anchor) return;
    const s = this.anchor.s;
    for (const p of this.pads) {
      if (p.done) continue;
      const pos = this.padPos(p);
      if (Math.hypot(x - pos.x, y - pos.y) < s * 0.55) { this.hit(p, pos); return; }
    }
  }

  update(dt) {
    const target = { x: player.cx, y: player.shY, s: player.scale };
    if (!this.anchor) this.anchor = { ...target };
    const k = Math.min(1, dt * 2);
    for (const key of ["x", "y", "s"]) this.anchor[key] += (target[key] - this.anchor[key]) * k;

    this.spawn -= dt;
    if (this.spawn <= 0 && this.pads.length < this.cfg.max) {
      this.spawn = this.cfg.every * rand(0.8, 1.2);
      let i;
      do i = Math.floor(Math.random() * SPOTS.length); while (i === this.lastSpot);
      this.lastSpot = i;
      this.pads.push({ dx: SPOTS[i][0], dy: SPOTS[i][1], t: 0, gold: Math.random() < 0.12, done: false, slowShown: false });
    }

    const s = player.scale;
    for (const p of this.pads) {
      if (p.done) continue;
      p.t += dt;
      const pos = this.padPos(p);
      if (!player.finger) {
        for (const h of player.hands) {
          if (!h.ok || Math.hypot(h.x - pos.x, h.y - pos.y) > s * 0.5) continue;
          const speed = Math.hypot(h.vx, h.vy) / s;
          if (speed >= this.cfg.punch) { this.hit(p, pos); break; }
          if (!p.slowShown) { p.slowShown = true; popup("Punch faster! 💨", pos.x, pos.y - 50, "#ffb3c1", 30); }
        }
      }
      if (!p.done && p.t > this.cfg.life) {
        p.done = true;
        this.misses++;
        this.combo = 0;
      }
    }
    this.pads = this.pads.filter((p) => !p.done);
  }

  draw(now) {
    if (!this.anchor) return;
    const s = this.anchor.s;
    for (const p of this.pads) {
      const pos = this.padPos(p), r = s * 0.42, left = 1 - p.t / this.cfg.life;
      const pop = Math.min(1, p.t / 0.12);
      circle(pos.x, pos.y, r * pop, p.gold ? "rgba(255, 216, 77, 0.9)" : "rgba(255, 70, 90, 0.9)", "#fff", 5);
      circle(pos.x, pos.y, r * 0.6 * pop, null, "rgba(255,255,255,0.8)", 4);
      // Ring shows how long the pad stays.
      ctx.strokeStyle = left < 0.3 ? "#ffb3c1" : "#ffffff";
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, r + 8, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2); ctx.stroke();
      drawEmoji(p.gold ? "⭐" : "🥊", pos.x, pos.y, r * pop);
    }
    // Gloves instead of plain hand circles.
    for (const h of player.hands) if (h.ok && !player.finger) drawEmoji("🥊", h.x, h.y, s * 0.55);
    drawPlayer(player, now, { showHead: !player.finger });
    if (this.combo >= 3) bigText(`🥊 ${this.combo} combo`, view.W / 2, 110, 42, "#ff9f1c");
  }

  results() {
    return [
      { emoji: "🥊", value: this.hits, label: "punches" },
      { emoji: "🔥", value: this.best, label: "best combo" },
      { emoji: "💨", value: this.misses, label: "missed pads" },
    ];
  }
}
