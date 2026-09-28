// Obstacle Run: step between 3 lanes, jump over hurdles, duck under bars and grab the coins.
import { view, ctx, sfx, tone, popup, burst, drawEmoji, bigText, clamp, rand, pick } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

const HIT_Z = 0.92; // where the player is on the road (0 = horizon, 1 = bottom of the screen)

export default {
  id: "run",
  title: "Obstacle Run",
  emoji: "🚧",
  color: "#f4a261",
  blurb: "Jump, duck and dash!",
  how: [
    ["↔️", "Step left or right to change lanes"],
    ["🦘", "Hop over hurdles 🚧"],
    ["⬇️", "Duck under bars · grab coins 🪙"],
  ],
  finger: [
    ["👆", "Drag left or right to change lanes"],
    ["⬆️", "Tap the top of the screen to jump"],
    ["⬇️", "Tap the bottom to duck"],
  ],
  fingerTip: "👆 Drag to switch lanes · tap top = jump · bottom = duck",
  rate: (g) => {
    const n = g.cleared + g.bonks;
    if (n < 4) return 0;
    const f = g.cleared / n;
    return f >= 0.85 ? 3 : f >= 0.65 ? 2 : f >= 0.4 ? 1 : 0;
  },
  mouse: "head",
  levels: {
    // speed = road per second, jump / duck = head movement needed (shoulder-widths)
    easy:   { time: 60, speed: 0.3,  every: 1.7, jump: 0.1,  duck: 0.35, kinds: ["coin", "coin", "hurdle", "rock"] },
    medium: { time: 75, speed: 0.38, every: 1.35, jump: 0.14, duck: 0.45, kinds: ["coin", "coin", "hurdle", "bar", "rock"] },
    hard:   { time: 90, speed: 0.48, every: 1.05, jump: 0.18, duck: 0.55, kinds: ["coin", "hurdle", "bar", "rock", "bar"] },
  },
  create: (cfg) => new ObstacleRun({ ...cfg, jump: cfg.jump * body.legs, duck: cfg.duck * body.legs }),
};

class ObstacleRun {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.coins = 0; this.cleared = 0; this.bonks = 0;
    this.things = [];
    this.lane = 0; this.center = null;
    this.spawn = 1.2; this.t = 0; this.shake = 0;
    this.tapJump = 0; this.tapDuck = 0;
  }

  get jumping() {
    return player.finger ? this.tapJump > 0 : player.head.y < player.baseY - this.cfg.jump * player.scale;
  }
  get ducking() {
    return player.finger ? this.tapDuck > 0 : player.head.y > player.baseY + this.cfg.duck * player.scale;
  }
  get holdBaseline() { return this.jumping || this.ducking; }

  onTap(x, y) {
    if (!player.finger) return;
    if (y < view.H * 0.4) this.tapJump = 0.6;
    else if (y > view.H * 0.7) this.tapDuck = 0.6;
  }

  update(dt) {
    const { W } = view, s = player.scale;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.tapJump = Math.max(0, this.tapJump - dt);
    this.tapDuck = Math.max(0, this.tapDuck - dt);

    // Lane from where you stand (drifting "centre" so you never get stuck), or finger position.
    if (player.finger) {
      this.lane = player.head.x < W / 3 ? -1 : player.head.x > (W * 2) / 3 ? 1 : 0;
    } else {
      if (this.center === null) this.center = player.cx;
      this.center += (player.cx - this.center) * Math.min(1, dt * 0.05);
      const off = (player.cx - this.center) / s;
      if (this.lane === 0 && Math.abs(off) > 0.55) this.lane = Math.sign(off);
      else if (this.lane !== 0 && (Math.sign(off) !== this.lane || Math.abs(off) < 0.35)) this.lane = Math.abs(off) > 0.55 ? Math.sign(off) : 0;
    }

    const speed = this.cfg.speed * (1 + this.t / 200);
    this.spawn -= dt;
    if (this.spawn <= 0) {
      this.spawn = this.cfg.every * rand(0.8, 1.2);
      const kind = pick(this.cfg.kinds);
      const lanes = kind === "coin" ? [pick([-1, 0, 1])] : [pick([-1, 0, 1])];
      for (const lane of lanes) this.things.push({ kind, lane, z: 0, done: false });
      if (kind === "coin" && Math.random() < 0.5) this.things.push({ kind: "coin", lane: lanes[0], z: -0.08, done: false });
    }

    for (const o of this.things) {
      const before = o.z;
      o.z += speed * dt;
      if (o.done || before >= HIT_Z || o.z < HIT_Z) continue;
      o.done = true;
      const same = o.lane === this.lane;
      if (o.kind === "coin") {
        if (same) { this.coins++; this.score++; tone(990, 0.07, "triangle", 0.15); }
        continue;
      }
      const dodged = !same || (o.kind === "hurdle" && this.jumping) || (o.kind === "bar" && this.ducking);
      if (dodged) {
        this.cleared++;
        this.score += 2;
        if (same) { sfx.yay(); popup(o.kind === "hurdle" ? "Great jump! 🦘" : "Nice duck! 🦆", W / 2, view.H * 0.35, "#9dffb0", 44); }
      } else {
        this.bonks++;
        this.shake = 0.35;
        sfx.bonk();
        popup("Oops! 💥", W / 2, view.H * 0.35, "#ffb3c1", 48);
      }
    }
    this.things = this.things.filter((o) => o.z < 1.15);
  }

  // Screen position of a lane at road depth z.
  at(lane, z) {
    const { W, H } = view, horizon = H * 0.3, bottom = H * 1.02;
    const t = Math.pow(clamp(z, 0, 1.15), 1.4);
    const half = W * (0.06 + 0.34 * t);
    return { x: W / 2 + lane * half * 0.67, y: horizon + (bottom - horizon) * t, k: 0.15 + 0.85 * t };
  }

  draw(now) {
    const { W, H } = view;
    // Road
    const horizon = H * 0.3;
    ctx.fillStyle = "rgba(60, 50, 90, 0.55)";
    ctx.beginPath(); ctx.moveTo(W * 0.44, horizon); ctx.lineTo(W * 0.56, horizon); ctx.lineTo(W * 0.95, H); ctx.lineTo(W * 0.05, H); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.setLineDash([18, 16]);
    ctx.lineDashOffset = -((now / 12) % 34);
    for (const d of [-0.5, 0.5]) { const a = this.at(d, 0), b = this.at(d, 1.1); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.setLineDash([]);

    for (const o of [...this.things].sort((a, b) => a.z - b.z)) {
      if (o.z < 0) continue;
      const p = this.at(o.lane, o.z), size = 90 * p.k;
      if (o.kind === "coin") drawEmoji("🪙", p.x, p.y - size * 0.5, size * 0.7, now / 200);
      else if (o.kind === "hurdle") drawEmoji("🚧", p.x, p.y - size * 0.35, size);
      else if (o.kind === "rock") drawEmoji("🪨", p.x, p.y - size * 0.45, size * 1.1);
      else {
        // A high bar to duck under.
        ctx.fillStyle = "#e63946";
        ctx.fillRect(p.x - size * 0.8, p.y - size * 1.5, size * 1.6, size * 0.28);
        ctx.fillStyle = "#333";
        ctx.fillRect(p.x - size * 0.8, p.y - size * 1.5, size * 0.1, size * 1.5);
        ctx.fillRect(p.x + size * 0.7, p.y - size * 1.5, size * 0.1, size * 1.5);
      }
    }
    // The runner: you!
    const me = this.at(this.lane, HIT_Z);
    const hop = this.jumping ? 40 : 0, squash = this.ducking ? 0.6 : 1;
    ctx.save();
    ctx.translate(me.x, me.y - 50 - hop);
    ctx.scale(-1, squash);
    drawEmoji("🏃", 0, 0, 80);
    ctx.restore();

    // Tell them what's coming in their lane.
    const next = this.things.find((o) => !o.done && o.lane === this.lane && o.kind !== "coin" && o.z > 0.45);
    if (next) bigText(next.kind === "hurdle" ? "JUMP! 🦘" : next.kind === "bar" ? "DUCK! ⬇️" : "MOVE! ↔️", W / 2, 110, Math.min(64, W / 11), "#ffe066");
    bigText(`🪙 ${this.coins}`, W - 70, H - 40, 30);
  }

  results() {
    return [
      { emoji: "🪙", value: this.coins, label: "coins" },
      { emoji: "🦘", value: this.cleared, label: "obstacles cleared" },
      { emoji: "💥", value: this.bonks, label: "bumps" },
    ];
  }
}
