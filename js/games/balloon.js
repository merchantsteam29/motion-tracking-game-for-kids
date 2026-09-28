// Balloon Bop: keep the balloons up in the air — don't let them touch the ground!
import { view, ctx, tone, popup, burst, bigText, drawPlayer, rand, clamp } from "../fx.js";
import { player } from "../tracker.js";

export default {
  id: "balloon",
  title: "Balloon Bop",
  emoji: "🎈",
  color: "#ff6b9a",
  blurb: "Keep them in the air!",
  how: [
    ["✋", "Tap balloons up with your hands"],
    ["🎈", "Don't let them touch the ground"],
    ["🔥", "Keep a streak going!"],
  ],
  mouse: "hand",
  levels: {
    easy:   { time: 60, count: 1, gravity: 0.11, maxFall: 0.2,  bounce: 0.55, size: 0.08 },
    medium: { time: 75, count: 2, gravity: 0.15, maxFall: 0.26, bounce: 0.6,  size: 0.07 },
    hard:   { time: 90, count: 3, gravity: 0.19, maxFall: 0.32, bounce: 0.65, size: 0.065 },
  },
  create: (cfg) => new BalloonBop(cfg),
};

class BalloonBop {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.bops = 0; this.drops = 0; this.streak = 0; this.best = 0;
    this.balloons = [];
    this.waiting = []; // respawn timers
    for (let i = 0; i < cfg.count; i++) this.waiting.push(0.4 + i * 1.5);
  }

  add() {
    const { W, H } = view, s = player.scale;
    this.balloons.push({
      x: clamp(player.cx + rand(-1.5, 1.5) * s, 80, W - 80), y: -40,
      vx: rand(-40, 40), vy: H * 0.05,
      r: Math.min(W, H) * this.cfg.size, hue: rand(0, 360), cool: 0, wob: rand(0, 6),
    });
  }

  update(dt) {
    const { W, H } = view, s = player.scale, cfg = this.cfg;
    this.waiting = this.waiting.map((t) => t - dt);
    while (this.waiting.length && this.waiting[0] <= 0) { this.waiting.shift(); this.add(); }

    const hands = player.hands.filter((h) => h.ok);
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      b.cool -= dt;
      b.vy = Math.min(b.vy + H * cfg.gravity * dt, H * cfg.maxFall);
      b.vx *= Math.pow(0.6, dt); // air drag
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.wob += dt * 3;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
      if (b.y < b.r + 70 && b.vy < 0) b.vy = Math.abs(b.vy) * 0.3;

      const hand = b.cool <= 0 && hands.find((h) => Math.hypot(h.x - b.x, h.y - b.y) < b.r + s * 0.3);
      if (hand) {
        b.cool = 0.3;
        b.vy = -H * cfg.bounce * rand(0.9, 1.1) + Math.min(0, hand.vy) * 0.25;
        b.vx = ((b.x - hand.x) / b.r) * H * 0.12 + hand.vx * 0.2;
        this.bops++;
        this.score++;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        tone(rand(380, 520), 0.12, "sine", 0.22, 260);
        popup("+1", b.x, b.y - b.r, "#fff", 32);
        if (this.streak % 10 === 0) popup(`${this.streak} bops in a row! 🔥`, W / 2, H * 0.3, "#9dffb0", 50);
      }

      if (b.y - b.r > H - 10) {
        this.balloons.splice(i, 1);
        this.drops++;
        this.streak = 0;
        tone(160, 0.25, "triangle", 0.15, -60);
        burst(b.x, H - 20, `hsl(${b.hue}, 90%, 65%)`, 16);
        popup("Oops! 🎈", b.x, H - 80, "#ffb3c1", 40);
        this.waiting.push(1.3);
        this.waiting.sort((a, c) => a - c);
      }
    }
  }

  draw(now) {
    for (const b of this.balloons) {
      const x = b.x + Math.sin(b.wob) * 3;
      // String
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, b.y + b.r * 1.15);
      ctx.bezierCurveTo(x - 10, b.y + b.r * 1.6, x + 10, b.y + b.r * 2, x, b.y + b.r * 2.5);
      ctx.stroke();
      // Balloon
      const g = ctx.createRadialGradient(x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, x, b.y, b.r * 1.2);
      g.addColorStop(0, `hsl(${b.hue}, 100%, 85%)`);
      g.addColorStop(1, `hsl(${b.hue}, 85%, 50%)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, b.y, b.r, b.r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 6, b.y + b.r * 1.2); ctx.lineTo(x + 6, b.y + b.r * 1.2); ctx.lineTo(x, b.y + b.r * 1.08); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.ellipse(x - b.r * 0.35, b.y - b.r * 0.45, b.r * 0.15, b.r * 0.25, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    drawPlayer(player, now, { showHead: false });
    // Danger line at the bottom
    ctx.fillStyle = "rgba(255, 92, 122, 0.25)";
    ctx.fillRect(0, view.H - 10, view.W, 10);
    if (this.streak >= 3) bigText(`🔥 ${this.streak}`, view.W / 2, 110, 48, "#ffd84d");
  }

  results() {
    return [
      { emoji: "🎈", value: this.bops, label: "bops" },
      { emoji: "🔥", value: this.best, label: "best streak" },
      { emoji: "💨", value: this.drops, label: "drops" },
    ];
  }
}
