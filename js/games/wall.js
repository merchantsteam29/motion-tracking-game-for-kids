// Hole in the Wall: a wall rushes toward you with a body-shaped hole. Make the shape to fit through!
import { view, ctx, sfx, say, popup, burst, bigText, drawPlayer, pick } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";
import { POSES, drawFigure, poseContext } from "../poses.js";

export default {
  id: "wall",
  title: "Hole in the Wall",
  emoji: "🧱",
  color: "#e76f51",
  blurb: "Fit through the wall!",
  how: [
    ["🧱", "A wall is coming with a shape cut out"],
    ["🙆", "Make that shape with your body"],
    ["🎉", "Hold it to fit through!"],
  ],
  finger: [
    ["🧱", "A wall is coming"],
    ["👆", "Tap the matching pose"],
    ["⏱️", "Before it reaches you!"],
  ],
  fingerTip: "👆 Tap the pose that fits the hole!",
  rate: (g) => {
    const n = g.passed + g.bonks;
    if (n < 3) return 0;
    const f = g.passed / n;
    return f >= 0.85 ? 3 : f >= 0.6 ? 2 : f >= 0.35 ? 1 : 0;
  },
  mouse: "head",
  levels: {
    // approach = seconds until the wall arrives, hold = how long the pose must be held as it hits
    easy:   { time: 60, approach: 5.5, hold: 0.3,  depth: 0.4, flex: false },
    medium: { time: 75, approach: 4.3, hold: 0.35, depth: 0.5, flex: false },
    hard:   { time: 90, approach: 3.3, hold: 0.45, depth: 0.7, flex: true },
  },
  create: (cfg) => new HoleInTheWall({ ...cfg, depth: cfg.depth * body.legs }),
};

class HoleInTheWall {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.passed = 0; this.bonks = 0;
    this.poses = POSES.filter((p) => cfg.flex || !p.hard);
    this.wall = null;
    this.rest = 1.2;
    this.last = null;
    this.shake = 0;
  }

  get holdBaseline() { return this.wall?.pose.squat; }

  next() {
    let pose;
    do pose = pick(this.poses); while (pose === this.last);
    this.last = pose;
    const others = this.poses.filter((p) => p !== pose).sort(() => Math.random() - 0.5).slice(0, 2);
    this.wall = { pose, t: 0, hold: 0, matching: false, tapped: null, choices: [pose, ...others].sort(() => Math.random() - 0.5) };
    say(pose.name.replace("!", ""));
  }

  choiceRects() {
    const { W, H } = view, n = this.wall.choices.length;
    const bw = Math.min(150, (W - 60) / n), bh = bw * 1.2, gap = 12;
    const x0 = W / 2 - (n * bw + (n - 1) * gap) / 2, y = H - bh - 20;
    return this.wall.choices.map((pose, i) => ({ pose, x: x0 + i * (bw + gap), y, w: bw, h: bh }));
  }

  onTap(x, y) {
    if (!player.finger || !this.wall) return;
    const hit = this.choiceRects().find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (hit) this.wall.tapped = hit.pose;
  }

  update(dt) {
    this.shake = Math.max(0, this.shake - dt);
    if (!this.wall) {
      this.rest -= dt;
      if (this.rest <= 0) this.next();
      return;
    }
    const w = this.wall;
    w.t += dt;
    w.matching = player.finger ? w.tapped === w.pose : w.pose.check(poseContext(this.cfg.depth));
    w.hold = w.matching ? w.hold + dt : Math.max(0, w.hold - dt * 1.5);
    if (w.t >= this.cfg.approach) {
      const fit = player.finger ? w.tapped === w.pose : w.hold >= this.cfg.hold;
      if (fit) {
        this.passed++;
        this.score += 10;
        sfx.yay();
        popup("You fit! 🎉 +10", view.W / 2, view.H * 0.35, "#9dffb0", 56);
        burst(view.W / 2, view.H / 2, "#ffe066", 26);
      } else {
        this.bonks++;
        this.shake = 0.4;
        sfx.bonk();
        popup("Bonk! 🧱", view.W / 2, view.H * 0.35, "#ffb3c1", 56);
        burst(view.W / 2, view.H / 2, "#e76f51", 30);
      }
      this.wall = null;
      this.rest = 1.4;
    }
  }

  draw(now) {
    const { W, H } = view;
    const w = this.wall;
    if (w) {
      // The wall grows as it comes closer.
      const p = Math.min(1, w.t / this.cfg.approach), k = 0.15 + 0.85 * Math.pow(p, 1.6);
      const ww = W * 0.92 * k, wh = H * 0.86 * k, x = W / 2 - ww / 2, y = H * 0.55 - wh / 2;
      ctx.globalAlpha = 0.35 + 0.5 * p;
      ctx.fillStyle = "#c2552d";
      ctx.fillRect(x, y, ww, wh);
      ctx.strokeStyle = "rgba(90, 30, 15, 0.6)";
      ctx.lineWidth = Math.max(1, 3 * k);
      const bh = 40 * k, bw = 90 * k;
      for (let yy = y, row = 0; yy < y + wh; yy += bh, row++) {
        ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + ww, yy); ctx.stroke();
        for (let xx = x + (row % 2 ? bw / 2 : 0); xx < x + ww; xx += bw) { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Math.min(yy + bh, y + wh)); ctx.stroke(); }
      }
      // The hole: a window in the pose's shape, glowing green while your pose matches.
      const hw = ww * 0.38, hh = wh * 0.8, hx = W / 2 - hw / 2, hy = y + wh * 0.1;
      ctx.globalAlpha = 1;
      ctx.fillStyle = w.matching ? "rgba(157, 255, 176, 0.95)" : "rgba(220, 235, 255, 0.92)";
      ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 18 * k); ctx.fill();
      drawFigure(W / 2, hy + hh * 0.36, hh * 0.13, w.pose);
      const left = Math.ceil(this.cfg.approach - w.t);
      bigText(`${w.pose.emoji} ${w.pose.name}`, W / 2, 105, Math.min(48, W / 14), w.matching ? "#9dffb0" : "#fff");
      if (left <= 3) bigText(String(left), W - 70, 110, 64, "#ffe066");
    }
    if (!player.finger) drawPlayer(player, now);
    if (player.finger && w) {
      for (const r of this.choiceRects()) {
        ctx.fillStyle = w.tapped === r.pose ? "rgba(157,255,176,0.95)" : "rgba(255,255,255,0.92)";
        ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 18); ctx.fill();
        drawFigure(r.x + r.w / 2, r.y + r.h * 0.4, r.w * 0.15, r.pose);
      }
    }
  }

  results() {
    const n = this.passed + this.bonks;
    return [
      { emoji: "🎉", value: this.passed, label: "walls passed" },
      { emoji: "🧱", value: this.bonks, label: "bonks" },
      { emoji: "📊", value: n ? `${Math.round((this.passed / n) * 100)}%` : "—", label: "fit through" },
    ];
  }
}
