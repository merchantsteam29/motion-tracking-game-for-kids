// Simon Says: copy the pose — but only when Simon says so!
import { view, ctx, sfx, say, popup, bigText, drawPlayer, progressBar, pick } from "../fx.js";
import { player } from "../tracker.js";

// Arm shapes for the picture: [elbow, hand] for the screen-right arm, in body units
// (shoulder half-width = 0.5). The screen-left arm mirrors it unless `left` is given.
const UP = [[0.6, -0.9], [0.5, -1.75]];
const DOWN = [[0.6, 0.6], [0.65, 1.2]];

// Checks use screen pixels. P = { head, a, b, s, cx, shY, baseY, depth }
const both = (P, fn) => P.a.ok && P.b.ok && fn(P.a) && fn(P.b);
const POSES = [
  {
    id: "up", name: "Hands up!", emoji: "🙌", arm: UP,
    check: (P) => both(P, (h) => h.y < P.head.y - 0.2 * P.s && Math.abs(h.x - P.cx) < 1.4 * P.s),
  },
  {
    id: "plane", name: "Airplane arms!", emoji: "✈️", arm: [[1.1, 0], [1.8, 0]],
    check: (P) => both(P, (h) => Math.abs(h.y - P.shY) < 0.6 * P.s && Math.abs(h.x - P.cx) > 1.2 * P.s),
  },
  {
    id: "head", name: "Hands on your head!", emoji: "🙆", arm: [[1.0, -0.55], [0.3, -0.95]],
    check: (P) => both(P, (h) => Math.hypot(h.x - P.head.x, h.y - P.head.y) < 0.9 * P.s && h.y < P.shY),
  },
  {
    id: "star", name: "Big star!", emoji: "🌟", arm: [[0.95, -0.6], [1.5, -1.3]],
    check: (P) => both(P, (h) => h.y < P.shY - 0.4 * P.s && Math.abs(h.x - P.cx) > 1.1 * P.s),
  },
  {
    id: "one", name: "One hand up!", emoji: "☝️", arm: UP, left: DOWN,
    check: (P) => {
      const hs = [P.a, P.b].filter((h) => h.ok);
      const ups = hs.filter((h) => h.y < P.head.y - 0.2 * P.s).length;
      const downs = hs.filter((h) => h.y > P.shY).length;
      return ups === 1 && (hs.length === 1 || downs === 1);
    },
  },
  {
    id: "squat", name: "Squat down!", emoji: "⬇️", arm: [[0.6, 0.5], [1.1, 0.6]], squat: true,
    check: (P) => P.head.y > P.baseY + P.depth * P.s,
  },
  {
    id: "flex", name: "Superhero muscles!", emoji: "💪", arm: [[1.1, 0], [1.05, -0.75]], hard: true,
    check: (P) => both(P, (h) => h.y < P.shY - 0.1 * P.s && h.y > P.head.y - 0.7 * P.s && Math.abs(h.x - P.cx) > 0.7 * P.s && Math.abs(h.x - P.cx) < 1.9 * P.s),
  },
];

export default {
  id: "simon",
  title: "Simon Says",
  emoji: "🗣️",
  blurb: "Copy the poses!",
  how: [
    ["👀", "Look at the picture and <b>copy the pose</b>"],
    ["⏳", "Hold it until the bar fills up"],
    ["🙊", "Only move if it says <b>Simon says</b>! (Medium & Hard)"],
  ],
  mouse: "head", // mouse button = hands up, move mouse low = squat
  levels: {
    easy:   { time: 60, window: 6.0, hold: 0.6, trick: 0,    depth: 0.5, flex: false },
    medium: { time: 75, window: 4.5, hold: 0.6, trick: 0.2,  depth: 0.7, flex: true },
    hard:   { time: 90, window: 3.2, hold: 0.7, trick: 0.3,  depth: 0.9, flex: true },
  },
  create: (cfg) => new Simon(cfg),
};

class Simon {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.matched = 0; this.listened = 0; this.total = 0;
    this.poses = POSES.filter((p) => cfg.flex || !p.hard);
    this.cmd = null;
    this.rest = 1.0;
    this.restText = "Get ready…";
    this.last = null;
  }

  get holdBaseline() { return this.cmd?.pose.squat; }

  next() {
    let pose;
    do pose = pick(this.poses); while (pose === this.last);
    this.last = pose;
    const says = Math.random() >= this.cfg.trick;
    this.cmd = { pose, says, t: 0, hold: 0 };
    this.total++;
    const words = pose.name.replace("!", "");
    say(says ? `Simon says, ${words}!` : `${words}!`);
  }

  finish(text, good) {
    (good ? sfx.yay : sfx.nope)();
    popup(text, view.W / 2, view.H * 0.45, good ? "#9dffb0" : "#ffb3c1", 52);
    this.cmd = null;
    this.rest = 1.4;
    this.restText = "Stand normal 🧍";
  }

  update(dt) {
    if (!this.cmd) {
      this.rest -= dt;
      if (this.rest <= 0) this.next();
      return;
    }
    const c = this.cmd;
    c.t += dt;
    const P = {
      head: player.head, a: player.hands[0], b: player.hands[1], s: player.scale,
      cx: player.cx, shY: player.shY, baseY: player.baseY, depth: this.cfg.depth,
    };
    c.hold = c.pose.check(P) ? c.hold + dt : Math.max(0, c.hold - dt * 2);

    if (c.hold >= this.cfg.hold) {
      if (c.says) { this.matched++; this.score += 10; this.finish("Yes! ✅ +10", true); }
      else this.finish("Simon didn't say! 🙊", false);
    } else if (c.t >= this.cfg.window) {
      if (c.says) this.finish("Next one! ⏩", false);
      else { this.listened++; this.score += 5; this.finish("Good listening! 👂 +5", true); }
    }
  }

  draw(now) {
    const { W, H } = view;
    drawPlayer(player, now);

    if (!this.cmd) {
      bigText(this.restText, W / 2, H - 70, Math.min(48, W / 14));
      return;
    }
    const c = this.cmd;

    // Picture card (top-left, under the HUD).
    const cw = Math.min(240, W * 0.36), ch = cw * 1.35, x0 = 12, y0 = 76;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.roundRect(x0, y0, cw, ch, 22); ctx.fill();
    drawFigure(x0 + cw / 2, y0 + ch * 0.4, cw * 0.2, c.pose);

    // Command text.
    const size = Math.min(56, W / 13);
    if (c.says) bigText("Simon says:", W / 2, H - 150, size * 0.75, "#9dffb0");
    bigText(`${c.pose.emoji} ${c.pose.name}`, W / 2, H - 95, size, "#fff");

    const bw = Math.min(420, W * 0.8);
    progressBar(W / 2 - bw / 2, H - 50, bw, 22, c.hold / this.cfg.hold, "#ffe066");
    progressBar(W / 2 - bw / 2, H - 22, bw, 8, 1 - c.t / this.cfg.window, "#ff8fa3");
  }

  results() {
    return [
      { emoji: "✅", value: this.matched, label: "poses copied" },
      { emoji: "👂", value: this.listened, label: "tricks spotted" },
      { emoji: "🗣️", value: this.total, label: "commands" },
    ];
  }
}

// A friendly stick figure showing the pose.
function drawFigure(cx, cy, u, pose) {
  const dy = pose.squat ? 0.7 : 0;
  const P = (x, y) => [cx + x * u, cy + (y + dy) * u];
  const line = (...pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2a1b5c";
  ctx.lineWidth = u * 0.28;

  // Legs
  const knee = pose.squat ? 0.85 : 0.35, kneeY = pose.squat ? 1.75 : 1.9;
  for (const sd of [-1, 1]) {
    line(P(sd * 0.3, 1.2), [cx + sd * knee * u, cy + kneeY * u], [cx + sd * 0.45 * u, cy + 2.6 * u]);
  }
  // Body
  line(P(0, 0), P(0, 1.2));
  line(P(-0.5, 0), P(0.5, 0));
  // Arms
  for (const sd of [-1, 1]) {
    const [e, h] = sd === -1 && pose.left ? pose.left : pose.arm;
    ctx.strokeStyle = "#7b5cff";
    line(P(sd * 0.5, 0), P(sd * e[0], e[1]), P(sd * h[0], h[1]));
  }
  // Head
  const [hx, hy] = P(0, -0.6);
  ctx.fillStyle = "#ffcf9e";
  ctx.strokeStyle = "#2a1b5c";
  ctx.lineWidth = u * 0.12;
  ctx.beginPath(); ctx.arc(hx, hy, u * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}
