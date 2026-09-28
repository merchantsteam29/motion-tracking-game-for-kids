// Window Wash: wipe the muddy window clean with big arm circles to find the picture behind it.
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, progressBar, rand, pick } from "../fx.js";
import { player } from "../tracker.js";

const PICTURES = [
  { emoji: "🐶", extra: ["🦴", "🎾"], sky: ["#7fd3ff", "#c9f0ff"] },
  { emoji: "🦄", extra: ["🌈", "⭐"], sky: ["#ffb3e6", "#ffe6f5"] },
  { emoji: "🐳", extra: ["🐠", "🫧"], sky: ["#2d7dd2", "#7fdcff"] },
  { emoji: "🦖", extra: ["🌋", "🌴"], sky: ["#9be15d", "#e1f7c1"] },
  { emoji: "🐱", extra: ["🧶", "🐟"], sky: ["#ffd84d", "#fff3c4"] },
  { emoji: "🚀", extra: ["🪐", "🌟"], sky: ["#1b1147", "#4a2a9c"] },
];
const COLS = 16, ROWS = 10;

export default {
  id: "wash",
  title: "Window Wash",
  emoji: "🧽",
  color: "#8ac926",
  blurb: "Wipe the window clean!",
  how: [
    ["🙌", "Wipe with big arm circles"],
    ["🖼️", "Find the picture underneath"],
    ["✨", "Clean it all for a bonus"],
  ],
  finger: [
    ["👆", "Rub the screen to wipe"],
    ["✌️", "Two fingers wipe faster"],
    ["✨", "Clean it all for a bonus"],
  ],
  fingerTip: "👆 Rub the screen to clean it!",
  stars: [20, 40, 60],
  mouse: "hand",
  levels: {
    // brush = sponge size (shoulder-widths), done = share to clean, splat = seconds between new mud splats (0 = none)
    easy:   { time: 60, brush: 0.75, done: 0.85, splat: 0 },
    medium: { time: 75, brush: 0.6,  done: 0.9,  splat: 4 },
    hard:   { time: 90, brush: 0.5,  done: 0.93, splat: 2.5 },
  },
  create: (cfg) => new WindowWash(cfg),
};

class WindowWash {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.windows = 0; this.splats = 0;
    this.prev = [null, null];
    this.splatT = cfg.splat;
    this.pause = 0;
    this.newWindow();
  }

  newWindow() {
    const { W, H } = view;
    this.pic = pick(PICTURES);
    this.cells = new Uint8Array(COLS * ROWS);
    this.clean = 0; this.steps = 0;
    this.mud = document.createElement("canvas");
    this.mud.width = Math.max(1, Math.round(W));
    this.mud.height = Math.max(1, Math.round(H));
    this.size = [W, H];
    const m = this.mud.getContext("2d");
    m.fillStyle = "rgb(120, 88, 58)";
    m.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      m.fillStyle = `rgba(${pick(["80,55,35", "150,115,80", "95,70,45"])}, ${rand(0.3, 0.7)})`;
      m.beginPath(); m.arc(rand(0, W), rand(0, H), rand(20, 90), 0, Math.PI * 2); m.fill();
    }
    this.mctx = m;
  }

  cellAt(i) { const { W, H } = view; return { x: ((i % COLS) + 0.5) * W / COLS, y: (Math.floor(i / COLS) + 0.5) * H / ROWS }; }

  wipe(a, b, r) {
    const m = this.mctx;
    m.globalCompositeOperation = "destination-out";
    m.lineCap = "round";
    m.lineWidth = r * 2;
    m.beginPath(); m.moveTo(a.x, a.y); m.lineTo(b.x, b.y); m.stroke();
    m.globalCompositeOperation = "source-over";
    // Mark cells whose middle the sponge passed over.
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i]) continue;
      const c = this.cellAt(i);
      const t = len2 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2)) : 0;
      if (Math.hypot(c.x - (a.x + dx * t), c.y - (a.y + dy * t)) < r * 0.9) { this.cells[i] = 1; this.clean++; }
    }
  }

  splat() {
    // New mud lands on a clean spot (Medium and Hard).
    const cleanIdx = [];
    this.cells.forEach((v, i) => v && cleanIdx.push(i));
    if (!cleanIdx.length) return;
    const i = pick(cleanIdx), c = this.cellAt(i), m = this.mctx;
    m.fillStyle = "rgb(110, 80, 52)";
    m.beginPath(); m.arc(c.x, c.y, Math.min(view.W / COLS, view.H / ROWS) * 0.75, 0, Math.PI * 2); m.fill();
    this.cells[i] = 0; this.clean--; this.splats++;
    tone(140, 0.15, "square", 0.08, -40);
  }

  update(dt) {
    const { W, H } = view;
    if (this.size[0] !== W || this.size[1] !== H) this.newWindow(); // screen turned or resized
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.newWindow(); return; }

    const r = player.scale * this.cfg.brush;
    player.hands.forEach((h, i) => {
      if (!h.ok) { this.prev[i] = null; return; }
      const cur = { x: h.x, y: h.y };
      this.wipe(this.prev[i] ?? cur, cur, r);
      this.prev[i] = cur;
    });

    const pct = this.clean / this.cells.length;
    const steps = Math.floor(pct * 10);
    if (steps > this.steps) { this.score += steps - this.steps; this.steps = steps; tone(500 + steps * 40, 0.06, "sine", 0.1); }
    if (pct >= this.cfg.done) {
      this.windows++;
      this.score += 10;
      sfx.fanfare();
      say("Sparkling clean!");
      popup("✨ Sparkling clean! +10", W / 2, H * 0.4, "#ffe066", 56);
      burst(W / 2, H / 2, "#ffffff", 40);
      this.pause = 1.6;
      return;
    }
    if (this.cfg.splat) {
      this.splatT -= dt;
      if (this.splatT <= 0) { this.splatT = this.cfg.splat * rand(0.8, 1.2); this.splat(); }
    }
  }

  draw(now) {
    const { W, H } = view;
    // The picture behind the mud.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, this.pic.sky[0]); g.addColorStop(1, this.pic.sky[1]);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    drawEmoji(this.pic.emoji, W / 2, H * 0.52, Math.min(W, H) * 0.45);
    drawEmoji(this.pic.extra[0], W * 0.2, H * 0.3, Math.min(W, H) * 0.16, Math.sin(now / 600) * 0.2);
    drawEmoji(this.pic.extra[1], W * 0.8, H * 0.72, Math.min(W, H) * 0.16, Math.cos(now / 700) * 0.2);
    // The mud on top.
    if (this.pause <= 0) ctx.drawImage(this.mud, 0, 0, W, H);

    // Sponges instead of plain hand circles.
    for (const h of player.hands) if (h.ok) drawEmoji("🧽", h.x, h.y, player.scale * this.cfg.brush * 1.4);
    drawPlayer(player, now, { showHead: false });

    const pct = this.clean / this.cells.length, bw = Math.min(360, W * 0.7);
    bigText(`${Math.round(pct * 100)}% clean`, W / 2, H - 64, 28);
    progressBar(W / 2 - bw / 2, H - 42, bw, 20, pct / this.cfg.done, "#8ac926");
  }

  results() {
    return [
      { emoji: "🪟", value: this.windows, label: "windows cleaned" },
      { emoji: "🧽", value: `${Math.round((this.clean / this.cells.length) * 100)}%`, label: "last window" },
      { emoji: "🟤", value: this.splats, label: "mud splats" },
    ];
  }
}
