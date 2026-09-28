// Jump Rope: the rope swings around you — jump each time it passes under your feet.
import { view, ctx, sfx, say, tone, popup, bigText, drawPlayer, progressBar } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

export default {
  id: "jumprope",
  title: "Jump Rope",
  emoji: "🪢",
  color: "#ff9f1c",
  blurb: "Jump over the rope!",
  how: [
    ["👀", "Watch the rope swing"],
    ["🦘", "JUMP when it reaches your feet"],
    ["🔥", "Keep your streak going!"],
  ],
  finger: [
    ["👀", "Watch the rope swing"],
    ["👆", "Tap when it reaches the bottom"],
    ["🔥", "Keep your streak going!"],
  ],
  fingerTip: "👆 Tap when the rope hits the bottom!",
  // Stars from how many swings you cleared.
  rate: (g) => {
    const n = g.cleared + g.tripped;
    if (n < 5) return 0;
    const f = g.cleared / n;
    return f >= 0.9 ? 3 : f >= 0.75 ? 2 : f >= 0.5 ? 1 : 0;
  },
  mouse: "head",
  levels: {
    // period = seconds per swing, jump = how high the head must rise (shoulder-widths)
    easy:   { time: 45, period: 1.7,  jump: 0.18 },
    medium: { time: 60, period: 1.25, jump: 0.24 },
    hard:   { time: 60, period: 0.95, jump: 0.3 },
  },
  create: (cfg) => new JumpRope({ ...cfg, jump: cfg.jump * body.legs }),
};

class JumpRope {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.cleared = 0; this.tripped = 0; this.streak = 0; this.best = 0;
    this.phase = 0.1;       // 0 = rope above head, 0.5 = under the feet
    this.air = 0;           // seconds since the player was last in the air
    this.checked = false;   // this swing's bottom has been judged
    this.lastTap = -9;
    this.t = 0;
  }

  // Hold the standing height steady: jumping shouldn't move the baseline.
  get holdBaseline() { return true; }

  onTap() { this.lastTap = this.t; }

  inAir() {
    if (player.finger) return this.t - this.lastTap < 0.35;
    return player.head.y < player.baseY - this.cfg.jump * player.scale;
  }

  update(dt) {
    this.t += dt;
    this.air = this.inAir() ? 0 : this.air + dt;
    const before = this.phase;
    this.phase = (this.phase + dt / this.cfg.period) % 1;

    // Tick at the top of each swing so kids can feel the rhythm.
    if (before > this.phase) { tone(520, 0.05, "sine", 0.08); this.checked = false; }

    // Judge the swing just after the rope passes the feet (allow a jump a moment early).
    if (!this.checked && this.phase >= 0.55) {
      this.checked = true;
      if (this.air < 0.25) {
        this.cleared++;
        this.streak++;
        this.best = Math.max(this.best, this.streak);
        this.score += 1 + Math.floor(this.streak / 10);
        tone(700 + Math.min(this.streak, 20) * 20, 0.08, "triangle", 0.15);
        if (this.streak % 10 === 0) { sfx.fanfare(); say(`${this.streak} in a row!`); popup(`🔥 ${this.streak} in a row!`, view.W / 2, view.H * 0.3, "#ffd84d", 54); }
      } else {
        this.tripped++;
        this.streak = 0;
        sfx.bonk();
        popup("Oops! 🪢", view.W / 2, view.H * 0.35, "#ffb3c1", 48);
      }
    }
  }

  draw(now) {
    const { W, H } = view, s = player.scale;
    const cx = player.finger ? W / 2 : player.cx;
    const handY = player.finger ? H * 0.45 : player.shY + s * 0.9;
    const left = cx - s * 1.9, right = cx + s * 1.9;
    // The rope's middle goes over the head (phase 0) and under the feet (phase 0.5).
    const topY = (player.finger ? H * 0.12 : player.head.y - s * 1.2);
    const bottomY = H - 20;
    const c = Math.cos(this.phase * Math.PI * 2);
    const midY = handY + (c > 0 ? (topY - handY) * c : (handY - bottomY) * c);
    const behind = this.phase < 0.25 || this.phase > 0.75; // rope is behind you while it's up high

    const drawRope = () => {
      ctx.strokeStyle = "#ff9f1c";
      ctx.lineWidth = behind ? 5 : 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(left, handY);
      ctx.quadraticCurveTo(cx, midY * 2 - handY, right, handY);
      ctx.stroke();
    };
    if (behind) drawRope();
    if (!player.finger) drawPlayer(player, now);
    if (!behind) drawRope();

    // Jump cue as the rope comes down.
    if (this.phase > 0.35 && this.phase < 0.55) {
      bigText(player.finger ? "TAP!" : "JUMP!", W / 2, H * 0.22, Math.min(90, W / 8), "#ffe066");
    }
    if (this.streak >= 3) bigText(`🔥 ${this.streak}`, W / 2, 110, 44, "#ffd84d");
    const bw = Math.min(300, W * 0.6), n = this.cleared + this.tripped;
    progressBar(W / 2 - bw / 2, H - 16, bw, 8, n ? this.cleared / n : 0, "#2fcf8a");
  }

  results() {
    return [
      { emoji: "🪢", value: this.cleared, label: "jumps" },
      { emoji: "🔥", value: this.best, label: "best streak" },
      { emoji: "😅", value: this.tripped, label: "trips" },
    ];
  }
}
