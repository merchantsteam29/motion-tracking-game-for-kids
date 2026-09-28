// Yoga Stretch: calm, balancing stretches. Hold each pose while the circle fills up.
import { view, ctx, sfx, say, tone, popup, burst, bigText, drawPlayer, circle, pick } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";
import { UP, both, drawFigure, poseContext } from "../poses.js";

const PLANE = [[1.1, 0], [1.8, 0]];
const armsUp = (P) => both(P, (h) => h.y < P.shY - 0.3 * P.s);
const armsWide = (P) => both(P, (h) => Math.abs(h.y - P.shY) < 0.7 * P.s && Math.abs(h.x - P.cx) > 1.1 * P.s);
// One knee lifted (balance). If the camera can't see the knees, easier levels skip the leg part.
const kneeUp = (P, cfg) => {
  const [a, b] = P.knees;
  if (!a.ok || !b.ok) return cfg.legsOptional;
  return Math.abs(a.y - b.y) > cfg.knee * P.s;
};
// Side bend: head leans left/right of the hips (or of where you started).
const lean = (P, g) => {
  const [l, r] = P.hips;
  const mid = l.ok && r.ok ? (l.x + r.x) / 2 : g.startX ?? P.cx;
  return (P.head.x - mid) / P.s;
};

const YOGA = [
  { id: "tree", name: "Tree pose", emoji: "🌳", arm: UP, legs: "tree", check: (P, c) => kneeUp(P, c) && armsUp(P) },
  { id: "star", name: "Star pose", emoji: "⭐", arm: [[0.95, -0.6], [1.5, -1.3]], legs: "wide", check: (P) => both(P, (h) => h.y < P.shY - 0.2 * P.s && Math.abs(h.x - P.cx) > 1.0 * P.s) },
  { id: "plane", name: "Airplane", emoji: "✈️", arm: PLANE, check: (P) => armsWide(P) },
  { id: "bendL", name: "Side bend (lean one way)", emoji: "🌙", arm: UP, lean: -1, check: (P, c, g) => armsUp(P) && lean(P, g) < -c.bend },
  { id: "bendR", name: "Side bend (lean the other way)", emoji: "🌙", arm: UP, lean: 1, check: (P, c, g) => armsUp(P) && lean(P, g) > c.bend },
  { id: "reach", name: "Reach for the sky", emoji: "🙌", arm: UP, check: (P) => both(P, (h) => h.y < P.head.y - 0.3 * P.s) },
  { id: "chair", name: "Chair pose", emoji: "🪑", arm: UP, squat: true, check: (P, c) => armsUp(P) && P.head.y > P.baseY + c.chair * P.s },
  { id: "flamingo", name: "Flamingo", emoji: "🦩", arm: PLANE, legs: "tree", check: (P, c) => kneeUp(P, c) && armsWide(P) },
];

export default {
  id: "yoga",
  title: "Yoga Stretch",
  emoji: "🧘",
  color: "#9b5de5",
  blurb: "Stretch and balance!",
  how: [
    ["👀", "Copy the picture"],
    ["⏳", "Hold still while the circle fills"],
    ["🌬️", "Breathe slowly in between"],
  ],
  finger: [
    ["👀", "Look at the pose"],
    ["👆", "Press and hold the screen"],
    ["⏳", "Keep holding while the circle fills"],
  ],
  fingerTip: "👆 Press and hold to hold the pose",
  rate: (g) => {
    const expected = g.cfg.time / (g.cfg.hold + 5);
    const f = g.done / Math.max(1, expected);
    return f >= 0.8 ? 3 : f >= 0.55 ? 2 : f >= 0.3 ? 1 : 0;
  },
  mouse: "head",
  levels: {
    // hold = seconds to hold each pose, knee = how high a knee must lift, bend = how far to lean
    easy:   { time: 75, hold: 3, knee: 0.2,  bend: 0.25, chair: 0.25, legsOptional: true,  keep: true },
    medium: { time: 90, hold: 5, knee: 0.3,  bend: 0.35, chair: 0.35, legsOptional: true,  keep: false },
    hard:   { time: 90, hold: 7, knee: 0.4,  bend: 0.45, chair: 0.45, legsOptional: false, keep: false },
  },
  create: (cfg) => new Yoga({ ...cfg, knee: cfg.knee * body.legs, chair: cfg.chair * body.legs }),
};

class Yoga {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.done = 0; this.tries = 0;
    this.pose = null; this.last = null;
    this.hold = 0; this.rest = 1.5; this.t = 0; this.chime = 0;
    this.startX = null;
  }

  get holdBaseline() { return this.pose?.id === "chair"; }

  next() {
    let p;
    do p = pick(YOGA); while (p === this.last);
    this.last = this.pose = p;
    this.hold = 0; this.tries++;
    this.startX = player.cx;
    say(p.name);
  }

  update(dt) {
    this.t += dt;
    // Calm background notes.
    this.chime -= dt;
    if (this.chime <= 0) { this.chime = 2.4; tone(pick([262, 330, 392, 440]), 1.2, "sine", 0.04); }
    if (!this.pose) {
      this.rest -= dt;
      if (this.rest <= 0) this.next();
      return;
    }
    const ok = player.finger ? player.pointerDown : this.pose.check(poseContext(), this.cfg, this);
    this.matching = ok;
    if (ok) this.hold += dt;
    else if (!this.cfg.keep) this.hold = Math.max(0, this.hold - dt * 0.5); // Easy keeps your progress
    if (this.hold >= this.cfg.hold) {
      this.done++;
      this.score += 10;
      sfx.fanfare();
      say(pick(["Beautiful!", "Great balance!", "Wonderful stretch!"]));
      popup("Beautiful! 🌟 +10", view.W / 2, view.H * 0.35, "#e0c3fc", 52);
      burst(view.W / 2, view.H * 0.45, "#e0c3fc", 24);
      this.pose = null;
      this.rest = 3;
    }
  }

  draw(now) {
    const { W, H } = view;
    if (!player.finger) drawPlayer(player, now);
    if (!this.pose) {
      const breathIn = Math.sin(now / 800) > 0;
      bigText(breathIn ? "🌬️ Breathe in…" : "😌 Breathe out…", W / 2, H * 0.2, Math.min(52, W / 14), "#e0c3fc");
      return;
    }
    // Pose card with a hold ring around it.
    const cw = Math.min(230, W * 0.34), ch = cw * 1.3, x0 = 14, y0 = 78;
    ctx.fillStyle = this.matching ? "rgba(224, 195, 252, 0.95)" : "rgba(255,255,255,0.92)";
    ctx.beginPath(); ctx.roundRect(x0, y0, cw, ch, 22); ctx.fill();
    drawFigure(x0 + cw / 2, y0 + ch * 0.38, cw * 0.17, this.pose);
    const f = Math.min(1, this.hold / this.cfg.hold), r = Math.min(70, W * 0.08), cx = W - r - 24, cy = y0 + r + 10;
    circle(cx, cy, r, "rgba(15,10,42,0.6)");
    ctx.strokeStyle = "#e0c3fc"; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    bigText(`${Math.ceil(Math.max(0, this.cfg.hold - this.hold))}`, cx, cy + 2, r * 0.8);
    bigText(`${this.pose.emoji} ${this.pose.name}`, W / 2, H - 50, Math.min(44, W / 16), this.matching ? "#e0c3fc" : "#fff");
  }

  results() {
    return [
      { emoji: "🧘", value: this.done, label: "poses held" },
      { emoji: "🌬️", value: this.tries, label: "poses tried" },
      { emoji: "⏳", value: `${this.cfg.hold}s`, label: "hold time" },
    ];
  }
}
