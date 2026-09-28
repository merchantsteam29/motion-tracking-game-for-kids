// Quiz Reach: answer the question by reaching for the right bubble. Moving + thinking!
import { view, ctx, sfx, say, popup, burst, bigText, drawPlayer, circle, progressBar, pick, clamp, rand } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// Answer bubbles around the body (shoulder-widths from the chest).
const SPOTS = [[-1.6, -0.7], [0, -1.9], [1.6, -0.7]];
const FRUIT = ["🍎", "🍌", "🍓", "🍊", "🍇", "⭐", "🐶", "🎈"];
const ri = (a, b) => Math.floor(rand(a, b + 1));

// Question makers: each returns { q, say, answer, wrong: [two others] }.
function counting() {
  const n = ri(1, 6), e = pick(FRUIT);
  return { q: `How many? ${e.repeat(n)}`, say: `How many ${e === "⭐" ? "stars" : "are there"}?`, answer: n, wrong: others(n, 1, 7) };
}
function colors() {
  const set = [["🔴", "red"], ["🟢", "green"], ["🔵", "blue"], ["🟡", "yellow"], ["🟣", "purple"]];
  const [a, b, c] = set.sort(() => Math.random() - 0.5);
  return { q: `Touch ${a[1].toUpperCase()}!`, say: `Touch ${a[1]}!`, answer: a[0], wrong: [b[0], c[0]] };
}
function animals() {
  const set = [["🐮", "moo"], ["🐶", "woof"], ["🐱", "meow"], ["🐸", "ribbit"], ["🐷", "oink"], ["🦆", "quack"]];
  const [a, b, c] = set.sort(() => Math.random() - 0.5);
  return { q: `Who says "${a[1]}"?`, say: `Who says ${a[1]}?`, answer: a[0], wrong: [b[0], c[0]] };
}
function add(max) {
  const a = ri(0, max), b = ri(0, max - a);
  return { q: `${a} + ${b} = ?`, say: `${a} plus ${b}?`, answer: a + b, wrong: others(a + b, 0, max + 2) };
}
function sub(max) {
  const a = ri(1, max), b = ri(0, a);
  return { q: `${a} − ${b} = ?`, say: `${a} minus ${b}?`, answer: a - b, wrong: others(a - b, 0, max) };
}
function times() {
  const a = ri(2, 5), b = ri(1, 10);
  return { q: `${a} × ${b} = ?`, say: `${a} times ${b}?`, answer: a * b, wrong: others(a * b, a, a * 10, a) };
}
function nextInLine() {
  const step = pick([1, 2, 5, 10]), start = ri(0, 5) * step;
  const seq = [0, 1, 2].map((i) => start + i * step);
  return { q: `${seq.join(", ")}, ?`, say: "What comes next?", answer: start + 3 * step, wrong: others(start + 3 * step, 0, start + 6 * step, step) };
}
function others(ans, lo, hi, step = 1) {
  const out = new Set();
  let guard = 0;
  while (out.size < 2 && guard++ < 50) {
    const v = ans + pick([-2, -1, 1, 2]) * step;
    if (v !== ans && v >= lo && v <= hi) out.add(v);
  }
  while (out.size < 2) out.add(ans + out.size + 1);
  return [...out];
}

export default {
  id: "quiz",
  title: "Quiz Reach",
  emoji: "🧠",
  color: "#4dc9ff",
  blurb: "Reach for the answer!",
  how: [
    ["❓", "Read (or listen to) the question"],
    ["🙋", "Reach for the right bubble"],
    ["✋", "Hold your hand on it for a moment"],
  ],
  finger: [
    ["❓", "Read (or listen to) the question"],
    ["👆", "Tap the right answer"],
    ["⭐", "Right first time = more points"],
  ],
  fingerTip: "👆 Tap the right answer!",
  stars: [20, 40, 60],
  mouse: "hand",
  levels: {
    easy:   { time: 75, makers: [counting, colors, animals, () => add(5)] },
    medium: { time: 90, makers: [() => add(10), () => sub(10), nextInLine, counting] },
    hard:   { time: 90, makers: [() => add(20), () => sub(20), times, nextInLine] },
  },
  create: (cfg) => new Quiz(cfg),
};

class Quiz {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.right = 0; this.firstTry = 0; this.asked = 0;
    this.q = null; this.rest = 0.8; this.anchor = null;
  }

  next() {
    const m = pick(this.cfg.makers)();
    const values = [m.answer, ...m.wrong].sort(() => Math.random() - 0.5);
    this.q = { ...m, bubbles: values.map((v, i) => ({ v, spot: SPOTS[i], hold: 0, wrong: false })), tries: 0 };
    this.asked++;
    say(m.say);
  }

  pos(b) {
    const a = this.anchor, s = a.s * body.reach;
    return { x: clamp(a.x + b.spot[0] * s, 70, view.W - 70), y: clamp(a.y + b.spot[1] * s, 170, view.H - 60), r: Math.max(46, a.s * 0.5) };
  }

  choose(b) {
    const q = this.q;
    if (b.wrong) return;
    if (b.v === q.answer) {
      const pts = q.tries === 0 ? 10 : 5;
      this.score += pts;
      this.right++;
      if (q.tries === 0) this.firstTry++;
      sfx.yay();
      say(pick(["Yes!", "Correct!", "Great thinking!"]));
      const p = this.pos(b);
      popup(`✅ +${pts}`, p.x, p.y - p.r, "#9dffb0", 44);
      burst(p.x, p.y, "#9dffb0", 20);
      this.q = null;
      this.rest = 1.2;
    } else {
      b.wrong = true;
      q.tries++;
      sfx.nope();
      say("Try again!");
    }
  }

  onTap(x, y) {
    if (!player.finger || !this.q || !this.anchor) return;
    for (const b of this.q.bubbles) { const p = this.pos(b); if (Math.hypot(x - p.x, y - p.y) < p.r) { this.choose(b); return; } }
  }

  update(dt) {
    const target = { x: player.cx, y: player.shY, s: player.scale };
    if (!this.anchor) this.anchor = { ...target };
    const k = Math.min(1, dt * 2);
    for (const key of ["x", "y", "s"]) this.anchor[key] += (target[key] - this.anchor[key]) * k;
    if (!this.q) { this.rest -= dt; if (this.rest <= 0) this.next(); return; }
    if (player.finger) return;
    // Hold a hand on a bubble for a moment to choose it (so passing through doesn't count).
    for (const b of this.q.bubbles) {
      const p = this.pos(b);
      const on = player.hands.some((h) => h.ok && Math.hypot(h.x - p.x, h.y - p.y) < p.r + player.scale * 0.2);
      b.hold = on ? b.hold + dt : 0;
      if (b.hold > 0.35) { b.hold = 0; this.choose(b); if (!this.q) return; }
    }
  }

  draw(now) {
    const { W } = view;
    if (!this.anchor) return;
    if (this.q) {
      // Question banner
      ctx.fillStyle = "rgba(15, 10, 42, 0.8)";
      const bw = Math.min(W - 40, 720);
      ctx.beginPath(); ctx.roundRect(W / 2 - bw / 2, 70, bw, 80, 22); ctx.fill();
      bigText(this.q.q, W / 2, 112, Math.min(46, W / 14));
      for (const b of this.q.bubbles) {
        const p = this.pos(b), wobble = Math.sin(now / 300 + b.spot[0]) * 4;
        circle(p.x, p.y + wobble, p.r, b.wrong ? "rgba(120,120,120,0.6)" : "rgba(77, 201, 255, 0.85)", "#fff", 5);
        bigText(String(b.v), p.x, p.y + wobble + 2, p.r * (String(b.v).length > 2 ? 0.55 : 0.8), b.wrong ? "#ccc" : "#fff");
        if (b.hold > 0) progressBar(p.x - p.r, p.y + p.r + 8, p.r * 2, 8, b.hold / 0.35, "#ffe066");
      }
    }
    drawPlayer(player, now, { showHead: false });
  }

  results() {
    return [
      { emoji: "✅", value: this.right, label: "right answers" },
      { emoji: "⭐", value: this.firstTry, label: "first try" },
      { emoji: "❓", value: this.asked, label: "questions" },
    ];
  }
}
