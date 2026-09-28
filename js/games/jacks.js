// Jumping Jacks: counts reps by watching both arms go up over the head and back down.
import { view, sfx, say, popup, burst, drawEmoji, bigText, drawPlayer, circle, progressBar } from "../fx.js";
import { player } from "../tracker.js";

export default {
  id: "jacks",
  title: "Jumping Jacks",
  emoji: "⭐",
  blurb: "Count your jumping jacks!",
  how: [
    ["🙌", "Swing both arms <b>up</b> to touch the stars"],
    ["👇", "Bring them back <b>down</b> to your sides"],
    ["🦘", "Jump your feet out and in, too!"],
  ],
  mouse: "head", // mouse button = arms up
  levels: {
    easy:   { time: 45, goal: 10, upAtHead: false, downBelow: 0.25 },
    medium: { time: 60, goal: 25, upAtHead: true,  downBelow: 0.45 },
    hard:   { time: 60, goal: 40, upAtHead: true,  downBelow: 0.6 },
  },
  create: (cfg) => new Jacks(cfg),
};

class Jacks {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.reps = 0;
    this.state = "down";
    this.t = 0; this.lastRep = -9;
    this.handsMissing = false;
  }

  lines() {
    const s = player.scale;
    return {
      upY: this.cfg.upAtHead ? player.head.y - s * 0.1 : player.shY - s * 0.35,
      downY: player.shY + s * this.cfg.downBelow,
    };
  }

  update(dt) {
    this.t += dt;
    const [a, b] = player.hands;
    this.handsMissing = !(a.ok && b.ok);
    if (this.handsMissing) return;
    const { upY, downY } = this.lines();
    if (this.state === "down" && a.y < upY && b.y < upY) {
      this.state = "up";
      if (this.t - this.lastRep > 0.3) this.rep(a, b);
    } else if (this.state === "up" && a.y > downY && b.y > downY) {
      this.state = "down";
    }
  }

  rep(a, b) {
    this.reps++;
    this.lastRep = this.t;
    this.score += 2;
    burst(a.x, a.y, "#ffe066", 8);
    burst(b.x, b.y, "#ffe066", 8);
    if (this.reps === this.cfg.goal) {
      this.score += 10;
      sfx.fanfare();
      say(`${this.reps}! You reached your goal!`);
      popup("🏆 GOAL! 🏆", view.W / 2, view.H * 0.35, "#ffe066", 72);
    } else {
      sfx.star();
      say(String(this.reps));
      if (this.reps % 5 === 0) popup(["Keep going! 💪", "Super! 🌟", "Wow! 🔥"][(this.reps / 5) % 3], view.W / 2, view.H * 0.35, "#9dffb0", 56);
    }
  }

  draw(now) {
    const { W, H } = view, s = player.scale;
    if (player.visible) {
      // Target stars to touch at the top of each jack.
      const { upY } = this.lines();
      const [a, b] = player.hands;
      for (const [side, hand] of [[-1, a], [1, b]]) {
        const x = player.cx + side * s * 0.9, y = upY - s * 0.25;
        const lit = hand.ok && hand.y < upY;
        const pulse = 1 + 0.1 * Math.sin(now / 150);
        circle(x, y, s * 0.45 * pulse, lit ? "rgba(255, 224, 102, 0.55)" : "rgba(255, 255, 255, 0.15)");
        drawEmoji("⭐", x, y, s * 0.55 * pulse);
      }
    }
    drawPlayer(player, now);

    const cue = this.handsMissing ? "✋ Show both hands!" : this.state === "down" ? "⬆️ Arms UP!" : "⬇️ Arms DOWN!";
    bigText(cue, W / 2, 110, Math.min(64, W / 11), this.state === "down" ? "#ffe066" : "#9dffb0");

    bigText(String(this.reps), W / 2, H - 120, 120, "#fff");
    const bw = Math.min(360, W * 0.7);
    progressBar(W / 2 - bw / 2, H - 50, bw, 20, this.reps / this.cfg.goal, "#3ecf8e");
    bigText(this.reps >= this.cfg.goal ? "Goal reached! 🏆" : `Goal: ${this.cfg.goal}`, W / 2, H - 70, 24);
  }

  results() {
    return [
      { emoji: "⭐", value: this.reps, label: "jumping jacks" },
      { emoji: "🎯", value: this.cfg.goal, label: "goal" },
      { emoji: this.reps >= this.cfg.goal ? "🏆" : "💪", value: this.reps >= this.cfg.goal ? "Yes!" : "Next time!", label: "goal reached" },
    ];
  }
}
