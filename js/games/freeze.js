// Freeze Dance: dance while the music plays, freeze like a statue when it stops.
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, progressBar, rand } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

// A cheerful little loop (C major pentatonic) played with the built-in synth.
const MELODY = [523, 659, 784, 659, 880, 784, 659, 587, 523, 587, 659, 784, 880, 1047, 880, 784];
const BASS = [131, 165, 175, 196];
const DANCERS = ["💃", "🕺", "🪩", "🎵"];

export default {
  id: "freeze",
  title: "Freeze Dance",
  emoji: "🪩",
  color: "#c77dff",
  blurb: "Dance, then freeze!",
  how: [
    ["💃", "Dance while the music plays"],
    ["🧊", "FREEZE when it stops!"],
    ["⭐", "Stay still for bonus stars"],
  ],
  finger: [
    ["👆", "Wiggle your finger to dance"],
    ["✋", "Lift it off to FREEZE"],
    ["⭐", "Stay still for bonus stars"],
  ],
  fingerTip: "👆 Wiggle to dance, lift off to freeze",
  stars: [40, 80, 120], // scores for 1, 2, 3 stars per minute of play
  mouse: "head",
  levels: {
    // still = how little you may move while frozen (body-widths per second)
    easy:   { time: 60, dance: [5, 8], freeze: 3,   still: 1.0 },
    medium: { time: 75, dance: [4, 7], freeze: 3.5, still: 0.7 },
    hard:   { time: 90, dance: [3, 6], freeze: 4,   still: 0.5 },
  },
  create: (cfg) => new FreezeDance({ ...cfg, still: cfg.still * body.wobble }),
};

class FreezeDance {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.phase = "dance";
    this.left = rand(...cfg.dance);
    this.beat = 0; this.beatT = 0;
    this.move = 0;          // smoothed body movement, body-widths per second
    this.prev = null;
    this.danced = 0;        // dance points (fractional)
    this.freezes = 0; this.wiggles = 0; this.moved = false; this.grace = 0;
    this.t = 0;
    say("Dance!");
  }

  // How much the head and hands moved since last frame.
  measure(dt) {
    const pts = [player.head, ...player.hands].map((p) => (p.ok ? { x: p.x, y: p.y } : null));
    if (this.prev && dt > 0) {
      let sum = 0, n = 0;
      pts.forEach((p, i) => { const q = this.prev[i]; if (p && q) { sum += Math.hypot(p.x - q.x, p.y - q.y); n++; } });
      const speed = n ? Math.min(4, sum / n / dt / player.scale) : 0;
      this.move += (speed - this.move) * Math.min(1, dt * 6);
    }
    this.prev = pts;
  }

  update(dt) {
    this.t += dt;
    this.left -= dt;
    this.measure(dt);

    if (this.phase === "dance") {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 0.22;
        tone(MELODY[this.beat % MELODY.length], 0.18, "triangle", 0.09);
        if (this.beat % 2 === 0) tone(BASS[Math.floor(this.beat / 4) % BASS.length], 0.3, "sine", 0.12);
        this.beat++;
      }
      const before = Math.floor(this.danced);
      this.danced += Math.min(this.move, 4) * dt;
      if (Math.floor(this.danced) > before) this.score++;
      if (this.left <= 0) {
        this.phase = "freeze";
        this.left = this.cfg.freeze;
        this.grace = 0.8; // a moment to stop moving
        this.moved = false;
        tone(300, 0.35, "sawtooth", 0.1, -220);
        say("Freeze!");
      }
    } else {
      this.grace -= dt;
      if (this.grace <= 0 && !this.moved && this.move > this.cfg.still) {
        this.moved = true;
        this.wiggles++;
        sfx.nope();
        popup("You moved! 😄", player.head.x, player.head.y - player.scale, "#ffb3c1", 46);
      }
      if (this.left <= 0) {
        if (!this.moved) {
          this.freezes++;
          this.score += 10;
          sfx.fanfare();
          popup("Perfect freeze! ⭐ +10", view.W / 2, view.H * 0.4, "#9dffb0", 54);
          burst(player.head.x, player.head.y, "#7fdcff", 24);
        }
        this.phase = "dance";
        this.left = rand(...this.cfg.dance);
        say("Dance!");
      }
    }
  }

  draw(now) {
    const { W, H } = view;
    if (this.phase === "freeze") {
      ctx.fillStyle = "rgba(150, 220, 255, 0.18)";
      ctx.fillRect(0, 0, W, H);
    } else {
      // Bouncing dancers in the corners.
      DANCERS.forEach((e, i) => {
        const x = i % 2 ? W - 70 : 70, y = i < 2 ? H * 0.3 : H * 0.62;
        drawEmoji(e, x, y - Math.abs(Math.sin(now / 180 + i)) * 25, 56);
      });
    }
    drawPlayer(player, now);

    if (this.phase === "dance") {
      const hue = (now / 8) % 360;
      bigText("💃 DANCE! 🕺", W / 2, 110, Math.min(72, W / 10), `hsl(${hue}, 95%, 72%)`);
      const bw = Math.min(360, W * 0.7);
      bigText("Dance power", W / 2, H - 80, 24);
      progressBar(W / 2 - bw / 2, H - 58, bw, 22, this.move / 2.5, `hsl(${hue}, 90%, 65%)`);
    } else {
      bigText("🧊 FREEZE! 🧊", W / 2, 110, Math.min(80, W / 9), "#bfefff");
      bigText(this.moved ? "Oops! Try again next time" : "Stay still like a statue…", W / 2, 175, Math.min(30, W / 22), "#fff");
      const bw = Math.min(360, W * 0.7);
      progressBar(W / 2 - bw / 2, H - 58, bw, 22, this.left / this.cfg.freeze, this.moved ? "#ff8fa3" : "#7fdcff");
    }
  }

  results() {
    return [
      { emoji: "🧊", value: this.freezes, label: "perfect freezes" },
      { emoji: "💃", value: Math.floor(this.danced), label: "dance points" },
      { emoji: "😄", value: this.wiggles, label: "wiggles" },
    ];
  }
}
