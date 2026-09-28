// High Knees Race: run in place, lifting your knees high, to race an animal to the finish.
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

export default {
  id: "knees",
  title: "High Knees Race",
  emoji: "🏃",
  color: "#4dabff",
  blurb: "Run in place to race!",
  how: [
    ["🦵", "Lift your knees up high"],
    ["🔁", "Left, right, left, right!"],
    ["🏁", "Beat the animal to the finish"],
  ],
  finger: [
    ["👈", "Tap the left side"],
    ["👉", "Then the right side"],
    ["🏁", "Faster taps = faster runner"],
  ],
  fingerTip: "👆 Tap left, right, left, right!",
  stars: [40, 80, 120], // scores for 1, 2, 3 stars per minute of play
  legs: true, // needs the camera to see legs
  mouse: "head", // each click lifts the next knee
  levels: {
    // lift = how high the knee must come up (shoulder-widths), rival = rival speed (steps per second)
    easy:   { time: 60, lift: 0.18, track: 24, rival: 1.0, rivalEmoji: "🐢" },
    medium: { time: 75, lift: 0.26, track: 32, rival: 1.5, rivalEmoji: "🐶" },
    hard:   { time: 90, lift: 0.36, track: 42, rival: 2.1, rivalEmoji: "🐆" },
  },
  create: (cfg) => new HighKnees({ ...cfg, lift: cfg.lift * body.legs }),
};

class HighKnees {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.steps = 0; this.wins = 0; this.races = 0; this.topSpeed = 0;
    this.t = 0;
    this.stand = [null, null];    // learned standing knee depth below the hip, per leg
    this.up = [false, false];
    this.lastLeg = -1; this.lastStepT = -9;
    this.stepTimes = [];
    this.me = 0; this.rival = 0; this.rivalSpeed = cfg.rival;
    this.pause = 1.0;             // short break before each race
    this.legsSeen = false;
    this.bounce = 0;
  }

  // How high each knee is lifted, in shoulder-widths above its standing height.
  lifts() {
    const s = player.scale;
    return [0, 1].map((i) => {
      const k = player.knees[i];
      if (!k.ok) return null;
      const hip = player.hips[i].ok ? player.hips[i].y : player.shY + s * 1.3;
      const depth = (k.y - hip) / s;
      let st = this.stand[i];
      // Follow a deeper (straighter) leg quickly, a shallower one very slowly.
      st = st === null ? depth : st + (depth - st) * (depth > st ? 0.3 : 0.004);
      this.stand[i] = st;
      return st - depth;
    });
  }

  update(dt) {
    this.t += dt;
    this.bounce = Math.max(0, this.bounce - dt * 4);
    const lifts = this.lifts();
    this.legsSeen = lifts.every((v) => v !== null);

    lifts.forEach((lift, i) => {
      if (lift === null) return;
      if (!this.up[i] && lift > this.cfg.lift) {
        this.up[i] = true;
        // Count it if it's the other leg (or a fresh start) — alternating steps.
        if (this.lastLeg !== i || this.t - this.lastStepT > 0.6) this.step(i);
      } else if (this.up[i] && lift < this.cfg.lift * 0.4) {
        this.up[i] = false;
      }
    });

    while (this.stepTimes.length && this.t - this.stepTimes[0] > 2) this.stepTimes.shift();
    const speed = this.stepTimes.length / 2;
    this.topSpeed = Math.max(this.topSpeed, speed);

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) { this.me = 0; this.rival = 0; this.races++; say(`Race ${this.races}. Go!`); sfx.go(); }
      return;
    }
    this.rival += this.rivalSpeed * dt;
    const track = this.cfg.track;
    if (this.me >= track || this.rival >= track) {
      if (this.me >= this.rival) {
        this.wins++;
        this.score += 10;
        this.rivalSpeed *= 1.1;
        sfx.fanfare();
        say("You win!");
        popup("🏆 You win! +10", view.W / 2, view.H * 0.35, "#ffe066", 64);
        burst(view.W / 2, view.H * 0.35, "#ffe066", 30);
      } else {
        sfx.nope();
        say("So close! Run faster!");
        popup("So close! 💪", view.W / 2, view.H * 0.35, "#ffb3c1", 56);
      }
      this.pause = 2.2;
    }
  }

  step(i) {
    this.steps++;
    this.score++;
    this.lastLeg = i;
    this.lastStepT = this.t;
    this.stepTimes.push(this.t);
    this.bounce = 1;
    if (this.pause <= 0) this.me++;
    tone(i ? 520 : 440, 0.06, "triangle", 0.12);
  }

  draw(now) {
    const { W, H } = view;
    drawPlayer(player, now);

    const cue = player.finger && this.pause <= 0 ? ["👆 Tap left, right, left, right!", "#ffe066"]
      : !this.legsSeen ? ["🦵 Step back so I can see your knees!", "#ffb3c1"]
      : this.pause > 0 ? [this.races ? "Get ready…" : "Run in place to race!", "#fff"]
      : ["🦵 High knees! Go go go!", "#ffe066"];
    bigText(cue[0], W / 2, 110, Math.min(52, W / 14), cue[1]);

    // Knee lights
    ["Left", "Right"].forEach((label, i) => {
      const x = W / 2 + (i ? 90 : -90), y = 175;
      ctx.fillStyle = this.up[i] ? "rgba(47, 207, 138, 0.9)" : "rgba(20, 12, 56, 0.75)";
      ctx.beginPath(); ctx.roundRect(x - 70, y - 22, 140, 44, 22); ctx.fill();
      bigText(`🦵 ${label}`, x, y + 2, 22);
    });

    // Race track
    const x0 = 70, x1 = W - 90, laneH = 56, y0 = H - 150;
    ctx.fillStyle = "rgba(20, 12, 56, 0.7)";
    ctx.beginPath(); ctx.roundRect(x0 - 50, y0 - 40, x1 - x0 + 110, laneH * 2 + 30, 24); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath(); ctx.moveTo(x0, y0 + laneH / 2 - 8); ctx.lineTo(x1, y0 + laneH / 2 - 8); ctx.stroke();
    ctx.setLineDash([]);
    drawEmoji("🏁", x1 + 20, y0 + 10, 44);
    const pos = (v) => x0 + (x1 - x0) * Math.min(1, v / this.cfg.track);
    const hop = Math.sin(this.bounce * Math.PI) * 14;
    mirrored(() => drawEmoji("🏃", 0, 0, 46), pos(this.me), y0 - 4 - hop);
    mirrored(() => drawEmoji(this.cfg.rivalEmoji, 0, 0, 44), pos(this.rival), y0 + laneH - 4 - (this.pause > 0 ? 0 : Math.abs(Math.sin(now / 120)) * 8));

    const speed = this.stepTimes.length / 2;
    bigText(`⚡ ${speed.toFixed(1)} steps/sec`, W / 2, H - 22, 20, "#d9d2ff");
  }

  results() {
    return [
      { emoji: "🦵", value: this.steps, label: "high knees" },
      { emoji: "🏆", value: this.wins, label: "races won" },
      { emoji: "⚡", value: this.topSpeed.toFixed(1), label: "top steps/sec" },
    ];
  }
}

// Emoji runners face left, so flip them to run toward the finish on the right.
function mirrored(drawFn, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(-1, 1);
  drawFn();
  ctx.restore();
}
