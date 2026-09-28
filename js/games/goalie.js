// Goalie Save: soccer balls fly at you — block them with your hands!
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, rand, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

export default {
  id: "goalie",
  title: "Goalie Save",
  emoji: "⚽",
  color: "#3ecf8e",
  blurb: "Block the shots!",
  how: [
    ["🎯", "Watch the target ring"],
    ["🧤", "Put your hand there to save"],
    ["🦸", "Far shots = super saves!"],
  ],
  finger: [
    ["🎯", "Watch the target ring"],
    ["👆", "Touch the ball to save it"],
    ["🦸", "Far shots = super saves"],
  ],
  fingerTip: "👆 Touch the ball to save it!",
  stars: [16, 32, 48], // scores for 1, 2, 3 stars per minute of play
  mouse: "hand",
  levels: {
    // travel = seconds for a shot to reach you, spread = how far from your body (shoulder-widths)
    easy:   { time: 60, travel: 2.3, every: 2.4, spread: 1.4, max: 1 },
    medium: { time: 75, travel: 1.7, every: 1.7, spread: 1.8, max: 2 },
    hard:   { time: 90, travel: 1.2, every: 1.2, spread: 2.2, max: 2 },
  },
  create: (cfg) => new Goalie({ ...cfg, spread: cfg.spread * body.reach }),
};

class Goalie {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.saves = 0; this.goals = 0; this.supers = 0;
    this.balls = []; this.flying = [];
    this.next = 1.2;
    this.netShake = 0;
  }

  shoot() {
    const { W, H } = view, s = player.scale, cfg = this.cfg;
    const tx = clamp(player.cx + rand(-1, 1) * cfg.spread * s, 60, W - 60);
    const ty = clamp(player.shY + rand(-1.7, 0.8) * s, 120, H - 60);
    this.balls.push({ sx: W / 2 + rand(-0.15, 0.15) * W, sy: H * 0.28, tx, ty, p: 0, x: 0, y: 0, r: 0, spin: rand(-8, 8) });
    tone(180, 0.12, "square", 0.1, 80);
  }

  update(dt) {
    const s = player.scale;
    this.netShake = Math.max(0, this.netShake - dt);
    this.next -= dt;
    if (this.next <= 0 && this.balls.length < this.cfg.max) {
      this.next = this.cfg.every * rand(0.8, 1.2);
      this.shoot();
    }

    const hands = player.hands.filter((h) => h.ok);
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.p += dt / this.cfg.travel;
      const e = Math.pow(Math.min(b.p, 1), 1.6); // speeds up as it comes closer
      b.x = b.sx + (b.tx - b.sx) * e;
      b.y = b.sy + (b.ty - b.sy) * e - Math.sin(Math.PI * Math.min(b.p, 1)) * s * 0.6;
      b.r = s * (0.08 + 0.3 * e);
      if (b.p < 0.7) continue;
      // Saved: any hand touching the ball once it's close.
      const hand = hands.find((h) => Math.hypot(h.x - b.x, h.y - b.y) < b.r + s * 0.3);
      if (hand) {
        this.balls.splice(i, 1);
        const far = Math.hypot(b.tx - player.cx, b.ty - player.shY) > 1.4 * s;
        const pts = far ? 3 : 2;
        this.score += pts;
        this.saves++;
        if (far) this.supers++;
        sfx.yay();
        burst(b.x, b.y, "#ffffff", 14);
        popup(far ? `Super save! 🦸 +${pts}` : `Save! 🧤 +${pts}`, b.x, b.y - s * 0.5, far ? "#ffe066" : "#9dffb0", far ? 46 : 40);
        const away = Math.sign(b.x - (hand.x - (hand.vx || 0) * 0.05)) || 1;
        this.flying.push({ x: b.x, y: b.y, r: b.r, vx: away * rand(300, 600) + (hand.vx || 0) * 0.3, vy: -rand(300, 600), t: 0, a: 0 });
      } else if (b.p >= 1.08) {
        this.balls.splice(i, 1);
        this.goals++;
        this.netShake = 0.4;
        sfx.nope();
        popup("Goal! 😮", b.x, b.y - s * 0.5, "#ffb3c1", 40);
        if (this.goals % 3 === 1) say("Oh no, a goal!");
      }
    }
    for (const f of this.flying) { f.t += dt; f.vy += 1200 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.a += dt * 12; }
    this.flying = this.flying.filter((f) => f.t < 1.2);
  }

  draw(now) {
    const s = player.scale, { W } = view;
    // Goal frame around the player.
    if (player.visible) {
      const shake = this.netShake > 0 ? Math.sin(now / 20) * 6 : 0;
      const gx = player.cx, top = player.head.y - s * 1.9, half = s * 2.6, bottom = view.H + 20;
      ctx.save();
      ctx.translate(shake, 0);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      for (let x = gx - half; x <= gx + half; x += s * 0.35) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
      for (let y = top; y <= bottom; y += s * 0.35) { ctx.beginPath(); ctx.moveTo(gx - half, y); ctx.lineTo(gx + half, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 10;
      ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(gx - half, bottom); ctx.lineTo(gx - half, top); ctx.lineTo(gx + half, top); ctx.lineTo(gx + half, bottom); ctx.stroke();
      ctx.restore();
    }
    // Target rings show where each shot will arrive.
    for (const b of this.balls) {
      const urgency = Math.min(1, b.p);
      ctx.strokeStyle = `rgba(255, ${Math.round(220 - 160 * urgency)}, 80, ${0.4 + 0.5 * urgency})`;
      ctx.lineWidth = 5;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(b.tx, b.ty, s * (0.7 - 0.35 * urgency), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const b of this.balls) drawEmoji("⚽", b.x, b.y, b.r * 2, now / 1000 * b.spin);
    for (const f of this.flying) { ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2); drawEmoji("⚽", f.x, f.y, f.r * 2, f.a); ctx.globalAlpha = 1; }
    drawPlayer(player, now, { showHead: false });
    const total = this.saves + this.goals;
    if (total) bigText(`🧤 ${this.saves} saves   ⚽ ${this.goals} goals`, W / 2, view.H - 40, 26);
  }

  results() {
    const total = this.saves + this.goals;
    return [
      { emoji: "🧤", value: this.saves, label: "saves" },
      { emoji: "🦸", value: this.supers, label: "super saves" },
      { emoji: "📊", value: total ? `${Math.round((this.saves / total) * 100)}%` : "—", label: "shots stopped" },
    ];
  }
}
