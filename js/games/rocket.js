// Moon Squats: every squat fuels a rocket. Squat enough to fly to the Moon — and beyond!
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, progressBar, circle } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// Places the rocket reaches, every few squats.
const STOPS = [
  { name: "Clouds", emoji: "☁️", sky: ["#4dabff", "#9fd3ff"] },
  { name: "Space", emoji: "🛰️", sky: ["#0b0630", "#2a1757"] },
  { name: "the Moon", emoji: "🌕", sky: ["#0b0630", "#1b1147"] },
  { name: "Mars", emoji: "🔴", sky: ["#2a0b0b", "#5a1f1f"] },
  { name: "Jupiter", emoji: "🪐", sky: ["#1a0f05", "#4a2a10"] },
  { name: "the Stars", emoji: "✨", sky: ["#000010", "#140a3a"] },
];

export default {
  id: "rocket",
  title: "Moon Squats",
  emoji: "🌙",
  color: "#7fdcff",
  blurb: "Squat to fly to the Moon!",
  how: [
    ["⬇️", "Squat down low"],
    ["⬆️", "Stand back up = 1 squat"],
    ["🚀", "Every squat fuels the rocket"],
  ],
  finger: [
    ["👆", "Tap to do a squat"],
    ["🚀", "Every tap fuels the rocket"],
    ["🌕", "Reach the Moon!"],
  ],
  fingerTip: "👆 Tap for each squat!",
  rate: (g) => (g.squats >= g.cfg.goal ? 3 : g.squats >= g.cfg.goal * 0.7 ? 2 : g.squats >= g.cfg.goal * 0.4 ? 1 : 0),
  mouse: "head",
  levels: {
    // depth = how far the head drops (shoulder-widths), goal = squats to reach the Moon, per = squats per stop
    easy:   { time: 45, depth: 0.35, goal: 9,  per: 3 },
    medium: { time: 60, depth: 0.5,  goal: 12, per: 4 },
    hard:   { time: 60, depth: 0.7,  goal: 18, per: 6 },
  },
  create: (cfg) => new MoonSquats({ ...cfg, depth: cfg.depth * body.legs }),
};

class MoonSquats {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.squats = 0;
    this.down = false;
    this.alt = 0;       // shown altitude (eases toward squats)
    this.flame = 0;
    this.t = 0;
  }

  get holdBaseline() { return this.down; }

  onTap() { if (player.finger) this.squat(); }

  squat() {
    this.squats++;
    this.score += 2;
    this.flame = 1;
    tone(200, 0.35, "sawtooth", 0.08, 400);
    const stop = this.squats / this.cfg.per;
    if (Number.isInteger(stop) && stop <= STOPS.length) {
      const s = STOPS[stop - 1];
      this.score += 5;
      sfx.fanfare();
      say(`Welcome to ${s.name}!`);
      popup(`${s.emoji} ${s.name}!`, view.W / 2, view.H * 0.3, "#ffe066", 60);
    } else {
      say(String(this.squats));
    }
    if (this.squats === this.cfg.goal) burst(view.W * 0.75, view.H * 0.4, "#ffe066", 30);
  }

  update(dt) {
    this.t += dt;
    this.flame = Math.max(0, this.flame - dt * 1.5);
    this.alt += (this.squats - this.alt) * Math.min(1, dt * 3);
    if (player.finger) return;
    const drop = (player.head.y - player.baseY) / player.scale;
    if (!this.down && drop > this.cfg.depth) {
      this.down = true;
      tone(300, 0.1, "sine", 0.1);
    } else if (this.down && drop < this.cfg.depth * 0.3) {
      this.down = false;
      this.squat();
    }
  }

  draw(now) {
    const { W, H } = view, s = player.scale;
    const stopIdx = Math.min(STOPS.length - 1, Math.floor(this.alt / this.cfg.per));
    const sky = STOPS[stopIdx].sky;

    // Sky panel on the right with the rocket climbing.
    const px = W * 0.62, pw = W * 0.36, py = 70, ph = H - 110;
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 24); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 24); ctx.clip();
    // Stars and places scroll down as the rocket climbs.
    for (let i = 0; i < 18; i++) {
      const y = py + ((i * 97 + this.alt * 60) % ph);
      circle(px + ((i * 53) % pw), y, 1.5, "rgba(255,255,255,0.7)");
    }
    STOPS.forEach((st, i) => {
      const y = py + ph * 0.25 + (this.alt - (i + 1) * this.cfg.per) * (ph * 0.22);
      if (y > py - 40 && y < py + ph + 40) drawEmoji(st.emoji, px + pw * 0.75, y, 44);
    });
    const ry = py + ph * 0.62 + Math.sin(now / 120) * (this.flame * 4);
    if (this.flame > 0 || this.down) drawEmoji("🔥", px + pw * 0.4, ry + 52, 36 + this.flame * 20, Math.PI);
    drawEmoji("🚀", px + pw * 0.4, ry, 64, -Math.PI / 4);
    ctx.restore();

    if (!player.finger) drawPlayer(player, now);

    // Squat line: get your head below it.
    if (!player.finger && player.baseY != null) {
      const y = player.baseY + this.cfg.depth * s;
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = this.down ? "#2fcf8a" : "rgba(255, 216, 77, 0.8)";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(player.cx - s * 1.5, y); ctx.lineTo(player.cx + s * 1.5, y); ctx.stroke();
      ctx.setLineDash([]);
    }
    const cue = player.finger ? "👆 Tap to squat!" : this.down ? "⬆️ Stand up!" : "⬇️ Squat below the line!";
    bigText(cue, W * 0.31, 110, Math.min(46, W / 16), this.down ? "#9dffb0" : "#ffe066");

    const bw = Math.min(320, W * 0.5);
    bigText(`${this.squats}`, W * 0.31, H - 110, 100);
    progressBar(W * 0.31 - bw / 2, H - 50, bw, 20, this.squats / this.cfg.goal, "#7fdcff");
    bigText(this.squats >= this.cfg.goal ? "🌕 You reached the Moon!" : `Moon: ${this.cfg.goal} squats`, W * 0.31, H - 70, 22);
  }

  results() {
    const reached = STOPS[Math.min(STOPS.length, Math.floor(this.squats / this.cfg.per)) - 1];
    return [
      { emoji: "⬇️", value: this.squats, label: "squats" },
      { emoji: reached ? reached.emoji : "🌍", value: reached ? reached.name.replace("the ", "") : "Earth", label: "farthest place" },
      { emoji: "🎯", value: this.cfg.goal, label: "Moon goal" },
    ];
  }
}
