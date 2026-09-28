// Whack-a-Mole: moles pop out of holes all around you. Bop them with your hands!
import { view, ctx, sfx, tone, popup, burst, drawEmoji, drawPlayer, rand, pick, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// Hole positions around the body, in shoulder-widths from the chest.
const SPOTS = [
  [-1.9, -0.2], [1.9, -0.2], [-1.5, -1.4], [1.5, -1.4],
  [-0.7, -2.1], [0.7, -2.1], [-1.7, 1.0], [1.7, 1.0],
];

export default {
  id: "moles",
  title: "Whack-a-Mole",
  emoji: "🐹",
  color: "#b5835a",
  blurb: "Bop the moles!",
  how: [
    ["🐹", "Bop moles with your hands"],
    ["🌟", "Gold moles = 3 points"],
    ["🐰", "Don't bop the bunny! (Medium & Hard)"],
  ],
  finger: [
    ["👆", "Tap the moles"],
    ["🌟", "Gold moles = 3 points"],
    ["🐰", "Don't tap the bunny!"],
  ],
  fingerTip: "👆 Tap the moles!",
  stars: [15, 30, 45], // scores for 1, 2, 3 stars per minute of play
  mouse: "hand",
  levels: {
    easy:   { time: 60, every: 1.1, up: 2.4, spots: 6, reach: 1.0, bunny: 0,    gold: 0.12 },
    medium: { time: 60, every: 0.8, up: 1.7, spots: 8, reach: 1.05, bunny: 0.12, gold: 0.1 },
    hard:   { time: 75, every: 0.6, up: 1.2, spots: 8, reach: 1.15, bunny: 0.18, gold: 0.1 },
  },
  create: (cfg) => new Moles({ ...cfg, reach: cfg.reach * body.reach }),
};

class Moles {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.bopped = 0; this.golden = 0; this.streak = 0; this.best = 0;
    this.holes = SPOTS.slice(0, cfg.spots).map(([dx, dy]) => ({ dx, dy, mole: null }));
    this.spawn = 0.8;
    this.anchor = null; // smoothed body centre so holes don't wobble
  }

  holePos(h) {
    const a = this.anchor, s = a.s * this.cfg.reach;
    return {
      x: clamp(a.x + h.dx * s, 50, view.W - 50),
      y: clamp(a.y + h.dy * s, 110, view.H - 40),
    };
  }

  update(dt) {
    const target = { x: player.cx, y: player.shY, s: player.scale };
    if (!this.anchor) this.anchor = { ...target };
    const k = Math.min(1, dt * 2);
    for (const key of ["x", "y", "s"]) this.anchor[key] += (target[key] - this.anchor[key]) * k;

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = this.cfg.every * rand(0.8, 1.2);
      const empty = this.holes.filter((h) => !h.mole);
      if (empty.length) {
        const r = Math.random();
        const kind = r < this.cfg.bunny ? "bunny" : r < this.cfg.bunny + this.cfg.gold ? "gold" : "mole";
        pick(empty).mole = { kind, t: 0, state: "up" };
      }
    }

    const s = player.scale;
    const hands = player.hands.filter((h) => h.ok);
    for (const h of this.holes) {
      const m = h.mole;
      if (!m) continue;
      m.t += dt;
      if (m.state === "bonked") { if (m.t > 0.5) h.mole = null; continue; }
      if (m.t > this.cfg.up) {
        if (m.kind !== "bunny") this.streak = 0;
        h.mole = null;
        continue;
      }
      const p = this.holePos(h);
      if (m.t > 0.12 && hands.some((hd) => Math.hypot(hd.x - p.x, hd.y - (p.y - s * 0.25)) < s * 0.5)) {
        m.state = "bonked";
        m.t = 0;
        if (m.kind === "bunny") {
          this.score = Math.max(0, this.score - 2);
          this.streak = 0;
          sfx.nope();
          popup("Not the bunny! 🐰", p.x, p.y - s, "#ffb3c1", 40);
        } else {
          const pts = m.kind === "gold" ? 3 : 1;
          this.score += pts;
          this.bopped++;
          if (m.kind === "gold") { this.golden++; sfx.star(); } else tone(rand(300, 420), 0.12, "square", 0.12, -150);
          this.streak++;
          this.best = Math.max(this.best, this.streak);
          burst(p.x, p.y - s * 0.3, m.kind === "gold" ? "#ffe066" : "#d9a066", 12);
          popup(`+${pts}`, p.x, p.y - s * 0.8, m.kind === "gold" ? "#ffe066" : "#fff", 36);
          if (this.streak % 5 === 0) popup(`${this.streak} in a row! 🔥`, view.W / 2, view.H * 0.3, "#9dffb0", 50);
        }
      }
    }
  }

  draw(now) {
    if (!this.anchor) return;
    const s = this.anchor.s * this.cfg.reach;
    for (const h of this.holes) {
      const p = this.holePos(h);
      const hw = s * 0.42, hh = s * 0.14;
      // Hole
      ctx.fillStyle = "rgba(40, 22, 10, 0.85)";
      ctx.beginPath(); ctx.ellipse(p.x, p.y, hw, hh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(160, 110, 60, 0.9)"; ctx.lineWidth = 4; ctx.stroke();
      const m = h.mole;
      if (!m) continue;
      // Pop up / sink down animation, clipped so it comes out of the hole.
      const rise = m.state === "bonked" ? Math.max(0, 1 - m.t * 2.5) : Math.min(1, m.t / 0.15, (this.cfg.up - m.t) / 0.15);
      ctx.save();
      ctx.beginPath(); ctx.rect(p.x - s, p.y - s * 1.4, s * 2, s * 1.4); ctx.clip();
      const y = p.y - s * 0.3 * rise - s * 0.05 + (1 - rise) * s * 0.4;
      if (m.kind === "gold") { ctx.fillStyle = "rgba(255, 224, 102, 0.45)"; ctx.beginPath(); ctx.arc(p.x, y, s * 0.42, 0, 7); ctx.fill(); }
      drawEmoji(m.kind === "bunny" ? "🐰" : "🐹", p.x, y, s * 0.6);
      if (m.kind === "gold") drawEmoji("👑", p.x, y - s * 0.35, s * 0.3);
      ctx.restore();
      if (m.state === "bonked" && m.kind !== "bunny") drawEmoji("💫", p.x, p.y - s * 0.75, s * 0.35, now / 200);
    }
    drawPlayer(player, now, { showHead: false });
  }

  results() {
    return [
      { emoji: "🐹", value: this.bopped, label: "moles bopped" },
      { emoji: "🌟", value: this.golden, label: "gold moles" },
      { emoji: "🔥", value: this.best, label: "best streak" },
    ];
  }
}
