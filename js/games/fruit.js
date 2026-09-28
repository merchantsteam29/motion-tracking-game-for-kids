// Fruit Slice: swipe your hands through flying fruit. Slice glowing power-ups, avoid bombs.
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, circle, progressBar, rand, pick, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

const FRUITS = [
  { e: "🍉", c: "#ff4d6d" }, { e: "🍎", c: "#ff3b3b" }, { e: "🍊", c: "#ff9f1c" }, { e: "🍋", c: "#ffe066" },
  { e: "🍓", c: "#ff2e63" }, { e: "🍍", c: "#ffd23f" }, { e: "🥝", c: "#8ac926" }, { e: "🍑", c: "#ffad7a" },
  { e: "🍌", c: "#ffe066" }, { e: "🍇", c: "#9b5de5" },
];

const POWERS = {
  freeze: { e: "❄️", c: "#7fdcff", name: "Freeze!", time: 5, say: "Freeze!" },
  double: { e: "⭐", c: "#ffd84d", name: "Double points!", time: 8, say: "Double points!" },
  frenzy: { e: "🌈", c: "#ff7ad9", name: "Fruit frenzy!", time: 4, say: "Fruit frenzy!" },
  mega:   { e: "🔥", c: "#ff8a3d", name: "Mega blades!", time: 8, say: "Mega blades!" },
};

export default {
  id: "fruit",
  title: "Fruit Slice",
  emoji: "🍉",
  color: "#ff5c7a",
  blurb: "Slice the flying fruit!",
  how: [
    ["✋", "Swipe fast to slice fruit"],
    ["⚡", "Slice glowing power-ups"],
    ["💣", "Skip the bombs (Medium & Hard)"],
  ],
  finger: [
    ["👆", "Swipe your finger to slice"],
    ["✌️", "Two fingers = two blades"],
    ["⚡", "Slice power-ups too!"],
  ],
  fingerTip: "👆 Swipe to slice!",
  stars: [15, 30, 45], // scores for 1, 2, 3 stars per minute of play
  mouse: "hand",
  levels: {
    easy:   { time: 60, every: 1.3,  gravity: 0.6, size: 0.07,  bombs: 0,    power: 0.12, minSpeed: 0.8, burst: [1, 2] },
    medium: { time: 60, every: 1.0,  gravity: 0.8, size: 0.06,  bombs: 0.08, power: 0.1,  minSpeed: 1.4, burst: [1, 3] },
    hard:   { time: 75, every: 0.8,  gravity: 1.0, size: 0.055, bombs: 0.15, power: 0.09, minSpeed: 2.0, burst: [2, 4] },
  },
  create: (cfg) => new FruitSlice({ ...cfg, minSpeed: cfg.minSpeed * body.swipe }),
};

class FruitSlice {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.sliced = 0; this.bestCombo = 0; this.powersUsed = 0;
    this.items = []; this.halves = [];
    this.spawn = 0.8;
    this.active = {};            // power name -> seconds left
    this.trails = [[], []];      // recent hand positions for the blade trail
    this.prev = [null, null];
    this.combo = 0; this.comboTimer = 0;
    this.shake = 0;
    this.t = 0;
  }

  on(name) { return (this.active[name] ?? 0) > 0; }

  spawnOne(noBombs = false) {
    const { W, H } = view, cfg = this.cfg, s = player.scale;
    const unit = Math.min(W, H);
    const g = H * cfg.gravity;
    const x = clamp(player.cx + rand(-2.2, 2.2) * s, W * 0.08, W * 0.92);
    const apexY = clamp(player.head.y + rand(-1.4, 1.0) * s, H * 0.12, H * 0.6);
    const vy = -Math.sqrt(2 * g * (H - apexY));
    const flight = (2 * -vy) / g;
    const tx = clamp(player.cx + rand(-1.8, 1.8) * s, W * 0.1, W * 0.9);
    const roll = Math.random();
    let kind = "fruit", look = pick(FRUITS), power = null;
    if (!noBombs && roll < cfg.bombs) {
      kind = "bomb"; look = { e: "💣", c: "#666" };
    } else if (roll < cfg.bombs + cfg.power) {
      const free = Object.keys(POWERS).filter((p) => !this.on(p));
      if (free.length) { kind = "power"; power = pick(free); look = { e: POWERS[power].e, c: POWERS[power].c }; }
    }
    this.items.push({
      kind, power, e: look.e, c: look.c,
      x, y: H + unit * 0.08, vx: (tx - x) / flight, vy,
      r: unit * cfg.size * (kind === "power" ? 1.1 : rand(0.9, 1.15)),
      a: rand(0, 6), spin: rand(-3, 3),
    });
  }

  activate(name, x, y) {
    const p = POWERS[name];
    this.active[name] = p.time;
    this.powersUsed++;
    sfx.fanfare();
    say(p.say);
    popup(`${p.e} ${p.name}`, view.W / 2, view.H * 0.3, p.c, 56);
    burst(x, y, p.c, 26);
  }

  slice(it, angle) {
    const { W, H } = view;
    if (it.kind === "bomb") {
      sfx.bonk();
      this.shake = 0.4;
      this.score = Math.max(0, this.score - 5);
      this.combo = 0;
      burst(it.x, it.y, "#9a9a9a", 24);
      burst(it.x, it.y, "#ffb020", 12);
      popup("Boom! 💥 -5", it.x, it.y, "#ffb3c1", 48);
      return;
    }
    const pts = this.on("double") ? 2 : 1;
    this.score += pts;
    this.sliced++;
    this.combo++;
    this.comboTimer = 0.35;
    tone(rand(500, 800), 0.08, "triangle", 0.18, 500);
    burst(it.x, it.y, it.c, 16);
    popup(`+${pts}`, it.x, it.y - it.r, pts > 1 ? "#ffd84d" : "#fff", 34);
    // Two halves fly apart, perpendicular to the cut.
    const nx = -Math.sin(angle), ny = Math.cos(angle), push = Math.min(W, H) * 0.25;
    for (const side of [-1, 1]) {
      this.halves.push({ e: it.e, x: it.x, y: it.y, r: it.r, a: it.a, cut: angle, side,
        vx: it.vx + nx * push * side, vy: Math.min(it.vy, 0) * 0.3 + ny * push * side, spin: it.spin + side * 2, t: 0 });
    }
    if (it.kind === "power") this.activate(it.power, it.x, it.y);
  }

  update(dt) {
    const { W, H } = view, cfg = this.cfg, s = player.scale;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt);
    for (const k of Object.keys(this.active)) this.active[k] = Math.max(0, this.active[k] - dt);
    const ts = this.on("freeze") ? 0.35 : 1; // slow motion
    const g = H * cfg.gravity;

    // Spawning
    this.spawn -= dt * ts;
    if (this.on("frenzy")) {
      if (this.spawn > 0.18) this.spawn = 0.18;
      if (this.spawn <= 0) { this.spawn = 0.18; this.spawnOne(true); }
    } else if (this.spawn <= 0) {
      this.spawn = cfg.every * rand(0.8, 1.2);
      const n = Math.round(rand(cfg.burst[0], cfg.burst[1]));
      for (let i = 0; i < n; i++) this.spawnOne();
    }

    // Physics
    for (const it of this.items) {
      it.vy += g * dt * ts;
      it.x += it.vx * dt * ts;
      it.y += it.vy * dt * ts;
      it.a += it.spin * dt * ts;
    }
    this.items = this.items.filter((it) => !(it.vy > 0 && it.y - it.r > H));
    for (const h of this.halves) {
      h.t += dt;
      h.vy += g * dt;
      h.x += h.vx * dt; h.y += h.vy * dt; h.a += h.spin * dt;
    }
    this.halves = this.halves.filter((h) => h.t < 1.2 && h.y - h.r < H);

    // Blades: each hand's movement since last frame is a cutting segment.
    const mega = this.on("mega");
    const bladeR = s * (mega ? 0.45 : 0.15);
    const minSpeed = mega ? 0 : cfg.minSpeed;
    player.hands.forEach((hand, i) => {
      const trail = this.trails[i];
      if (!hand.ok || !player.visible) { this.prev[i] = null; trail.length = 0; return; }
      const cur = { x: hand.x, y: hand.y, t: this.t };
      trail.push(cur);
      while (trail.length && this.t - trail[0].t > 0.16) trail.shift();
      const p = this.prev[i];
      this.prev[i] = cur;
      if (!p) return;
      const dist = Math.hypot(cur.x - p.x, cur.y - p.y);
      const speed = dist / Math.max(dt, 1e-3) / s; // body-widths per second
      if (speed < minSpeed && !(mega && dist < 1)) return;
      const angle = Math.atan2(cur.y - p.y, cur.x - p.x);
      for (let k = this.items.length - 1; k >= 0; k--) {
        const it = this.items[k];
        if (segDist(p, cur, it) < it.r + bladeR) {
          this.items.splice(k, 1);
          this.slice(it, angle);
        }
      }
    });

    // Combos: several slices in one quick swipe.
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        if (this.combo >= 3) {
          this.score += this.combo;
          popup(`Combo x${this.combo}! +${this.combo}`, W / 2, H * 0.4, "#9dffb0", 58);
          sfx.yay();
        }
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.combo = 0;
      }
    }
  }

  draw(now) {
    const { W } = view, s = player.scale;
    const freeze = this.on("freeze");
    if (freeze) { ctx.fillStyle = "rgba(127, 220, 255, 0.12)"; ctx.fillRect(0, 0, view.W, view.H); }

    for (const it of this.items) {
      if (it.kind === "power") {
        const pulse = 1 + 0.12 * Math.sin(now / 110);
        circle(it.x, it.y, it.r * 1.45 * pulse, hexA(it.c, 0.35), it.c, 4);
      }
      drawEmoji(it.e, it.x, it.y, it.r * 2, it.a);
    }
    for (const h of this.halves) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - h.t / 1.2);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.cut);
      ctx.beginPath();
      ctx.rect(-h.r * 1.5, h.side < 0 ? -h.r * 1.5 : 0, h.r * 3, h.r * 1.5);
      ctx.clip();
      ctx.rotate(h.a - h.cut);
      drawEmojiAt(h.e, h.r * 2);
      ctx.restore();
    }

    // Blade trails
    const mega = this.on("mega");
    for (const trail of this.trails) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i], f = i / trail.length;
        ctx.strokeStyle = mega ? `rgba(255, 150, 60, ${f})` : `rgba(200, 255, 245, ${f})`;
        ctx.lineWidth = (mega ? s * 0.35 : s * 0.12) * f + 2;
        ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    drawPlayer(player, now, { showHead: false });

    // Active power-ups
    const act = Object.entries(this.active).filter(([, v]) => v > 0);
    act.forEach(([name, left], i) => {
      const p = POWERS[name], x = W / 2 - (act.length - 1) * 95 + i * 190, y = 100;
      bigText(`${p.e} ${p.name.replace("!", "")}`, x, y, 24, p.c);
      progressBar(x - 70, y + 18, 140, 10, left / p.time, p.c);
    });
  }

  results() {
    return [
      { emoji: "🍉", value: this.sliced, label: "fruit sliced" },
      { emoji: "⚡", value: this.powersUsed, label: "power-ups" },
      { emoji: "🔪", value: Math.max(this.bestCombo, this.combo), label: "best combo" },
    ];
  }
}

// Distance from point c to segment a-b.
function segDist(a, b, c) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / len2, 0, 1) : 0;
  return Math.hypot(c.x - (a.x + dx * t), c.y - (a.y + dy * t));
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function drawEmojiAt(e, size) {
  ctx.font = `${size}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, 0, 0);
}
