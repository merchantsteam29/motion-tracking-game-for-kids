// Bubble Pop: pop floating bubbles with your hands. Golden bubbles appear up high for bonus points.
import { view, ctx, sfx, popup, burst, drawEmoji, drawPlayer, circle, rand, clamp } from "../fx.js";
import { player } from "../tracker.js";

export default {
  id: "bubbles",
  title: "Bubble Pop",
  emoji: "🫧",
  blurb: "Pop bubbles with your hands!",
  how: [
    ["✋", "Pop the bubbles with your <b>hands</b>"],
    ["🌟", "Reach up high for <b>golden bubbles</b> (3 points!)"],
    ["⚡", "Pop fast for a <b>combo</b> and double points"],
  ],
  mouse: "hand",
  levels: {
    easy:   { time: 60, every: 0.65, speed: 0.12, size: 0.075, gold: 0.12, spread: 3.5 },
    medium: { time: 60, every: 0.5,  speed: 0.18, size: 0.062, gold: 0.14, spread: 4.2 },
    hard:   { time: 75, every: 0.38, speed: 0.25, size: 0.052, gold: 0.16, spread: 5.0 },
  },
  create: (cfg) => new Bubbles(cfg),
};

class Bubbles {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.popped = 0; this.golden = 0; this.streak = 0; this.best = 0;
    this.t = 0; this.lastPop = -9; this.spawn = 0.2;
    this.list = [];
  }

  update(dt) {
    const { W, H } = view, cfg = this.cfg, s = player.scale, unit = Math.min(W, H);
    this.t += dt;

    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = cfg.every * rand(0.7, 1.3);
      const gold = Math.random() < cfg.gold;
      const r = unit * cfg.size * rand(0.8, 1.3) * (gold ? 0.85 : 1);
      const x = clamp(player.head.x + rand(-0.5, 0.5) * s * cfg.spread, r, W - r);
      this.list.push(gold
        ? { x, y: clamp(player.head.y - s * rand(0.6, 1.5), r + 80, H * 0.6), r, vy: 0, gold, hue: 48, age: 0, life: 3.5, ph: rand(0, 6) }
        : { x, y: H + r, r, vy: -H * cfg.speed * rand(0.8, 1.2), gold, hue: rand(160, 330), age: 0, life: 99, ph: rand(0, 6) });
    }

    const hands = player.hands.filter((h) => h.ok);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.age += dt;
      b.y += b.vy * dt;
      b.x += Math.sin(this.t * 2 + b.ph) * 25 * dt;
      if (hands.some((h) => Math.hypot(h.x - b.x, h.y - b.y) < b.r + s * 0.3)) {
        this.pop(b);
        this.list.splice(i, 1);
      } else if (b.y < -b.r || b.age > b.life) {
        this.list.splice(i, 1);
      }
    }
  }

  pop(b) {
    this.streak = this.t - this.lastPop < 1.2 ? this.streak + 1 : 1;
    this.lastPop = this.t;
    this.best = Math.max(this.best, this.streak);
    const pts = (b.gold ? 3 : 1) * (this.streak >= 5 ? 2 : 1);
    this.score += pts;
    this.popped++;
    if (b.gold) { this.golden++; sfx.star(); } else sfx.pop(rand(0.8, 1.4));
    burst(b.x, b.y, b.gold ? "#ffe066" : `hsl(${b.hue}, 90%, 80%)`, b.gold ? 20 : 10);
    popup(`+${pts}`, b.x, b.y, b.gold ? "#ffe066" : "#fff", 36);
    if (this.streak % 5 === 0) popup(`Combo x${this.streak}! ⚡`, view.W / 2, view.H * 0.25, "#9dffb0", 54);
  }

  draw(now) {
    for (const b of this.list) {
      const fade = b.gold ? Math.min(1, (b.life - b.age) * 2) : 1;
      ctx.globalAlpha = Math.max(0, fade);
      if (b.gold) circle(b.x, b.y, b.r * (1.3 + 0.1 * Math.sin(now / 120)), "rgba(255, 224, 102, 0.3)");
      const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, b.x, b.y, b.r);
      g.addColorStop(0, "rgba(255,255,255,0.75)");
      g.addColorStop(0.45, `hsla(${b.hue}, 90%, 75%, 0.2)`);
      g.addColorStop(1, `hsla(${b.hue}, 90%, 65%, 0.6)`);
      circle(b.x, b.y, b.r, g, "rgba(255,255,255,0.85)", 3);
      circle(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.15, "rgba(255,255,255,0.9)");
      if (b.gold) drawEmoji("⭐", b.x, b.y, b.r);
      ctx.globalAlpha = 1;
    }
    drawPlayer(player, now, { showHead: false });
  }

  results() {
    return [
      { emoji: "🫧", value: this.popped, label: "bubbles popped" },
      { emoji: "🌟", value: this.golden, label: "golden bubbles" },
      { emoji: "⚡", value: this.best, label: "best combo" },
    ];
  }
}
