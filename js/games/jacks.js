// Jumping Jacks: a rep only counts when the arms go up AND the feet jump apart,
// then both come back (arms down, feet together). Arm waving alone doesn't count.
import { view, ctx, sfx, say, popup, burst, drawEmoji, bigText, drawPlayer, circle, progressBar } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

export default {
  id: "jacks",
  title: "Jumping Jacks",
  emoji: "⭐",
  color: "#ffd84d",
  blurb: "Count your jumping jacks!",
  how: [
    ["🦘", "Jump feet out + arms up"],
    ["👇", "Jump feet in + arms down"],
    ["🦶", "Stand back so your feet show"],
  ],
  finger: [
    ["👆", "Tap for each jumping jack"],
    ["⏱️", "Tap fast to hit your goal"],
    ["🦘", "Even better: do real ones!"],
  ],
  fingerTip: "👆 Tap for each jumping jack!",
  legs: true, // needs the camera to see legs
  // Stars come from the rep goal instead of the score.
  rate: (g) => (g.reps >= g.cfg.goal ? 3 : g.reps >= g.cfg.goal * 0.7 ? 2 : g.reps >= g.cfg.goal * 0.4 ? 1 : 0),
  mouse: "head", // mouse button = arms up + feet apart
  levels: {
    // spread = how much wider (in shoulder-widths) the feet must go than when standing
    easy:   { time: 45, goal: 10, upAtHead: false, downBelow: 0.25, spread: 0.35 },
    medium: { time: 60, goal: 25, upAtHead: true,  downBelow: 0.45, spread: 0.5 },
    hard:   { time: 60, goal: 40, upAtHead: true,  downBelow: 0.6,  spread: 0.65 },
  },
  create: (cfg) => new Jacks({ ...cfg, spread: cfg.spread * body.legs }),
};

// Knees move apart less than ankles during a jack, so they need a smaller change.
const KNEE_FACTOR = 0.55;

class Jacks {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.reps = 0;
    this.state = "down";
    this.t = 0; this.lastRep = -9;
    this.rest = { ankles: null, knees: null }; // learned "feet together" width per body part
    this.status = { arms: "down", legs: "closed", legsSeen: false, handsSeen: false };
    this.nag = 0;
    this.armsOnly = 0; // seconds spent with arms up but feet together
  }

  armLines() {
    const s = player.scale;
    return {
      upY: this.cfg.upAtHead ? player.head.y - s * 0.1 : player.shY - s * 0.35,
      downY: player.shY + s * this.cfg.downBelow,
    };
  }

  // Leg spread in shoulder-widths, from ankles if visible, otherwise knees.
  legSpread() {
    const s = player.scale;
    const [la, ra] = player.ankles, [lk, rk] = player.knees;
    if (la.ok && ra.ok) return { src: "ankles", v: Math.abs(la.x - ra.x) / s, need: this.cfg.spread };
    if (lk.ok && rk.ok) return { src: "knees", v: Math.abs(lk.x - rk.x) / s, need: this.cfg.spread * KNEE_FACTOR };
    return null;
  }

  update(dt) {
    this.t += dt;
    this.nag = Math.max(0, this.nag - dt);
    const [a, b] = player.hands;
    const st = this.status;
    st.handsSeen = a.ok && b.ok;

    const { upY, downY } = this.armLines();
    st.arms = !st.handsSeen ? "?" : a.y < upY && b.y < upY ? "up" : a.y > downY && b.y > downY ? "down" : "mid";

    const leg = this.legSpread();
    st.legsSeen = !!leg;
    if (leg) {
      // Learn the resting width: follow narrow stances quickly, wide ones very slowly.
      let rest = this.rest[leg.src];
      if (rest === null) rest = leg.v;
      else if (st.arms === "down" || leg.v < rest) rest += (leg.v - rest) * (leg.v < rest ? 0.3 : 0.01);
      this.rest[leg.src] = rest;
      st.legs = leg.v > rest + leg.need ? "open" : leg.v < rest + leg.need * 0.4 ? "closed" : "mid";
    } else {
      st.legs = "?";
    }

    if (this.state === "down" && st.arms === "up" && st.legs === "open") {
      this.state = "up";
      if (this.t - this.lastRep > 0.3) this.rep(a, b);
    } else if (this.state === "up" && st.arms === "down" && st.legs === "closed") {
      this.state = "down";
    }

    // Gentle spoken hint if they keep waving only their arms.
    const waving = this.state === "down" && st.arms === "up" && st.legs === "closed";
    this.armsOnly = waving ? this.armsOnly + dt : 0;
    if (this.armsOnly > 0.8 && this.nag === 0) {
      say("Jump your feet out!");
      this.nag = 4;
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

  cue() {
    const st = this.status;
    if (player.finger) return this.state === "down" ? ["👆 Tap for a jumping jack!", "#ffe066"] : ["⬇️ Now let go!", "#9dffb0"];
    if (!st.legsSeen) return ["🦶 Step back so I can see your feet!", "#ffb3c1"];
    if (!st.handsSeen) return ["✋ Show both hands!", "#ffb3c1"];
    if (this.state === "down") {
      if (st.arms === "up" && st.legs !== "open") return ["🦘 Jump your feet out too!", "#ffe066"];
      if (st.legs === "open" && st.arms !== "up") return ["🙌 Arms up too!", "#ffe066"];
      return ["⬆️ Jump out, arms UP!", "#ffe066"];
    }
    return ["⬇️ Jump in, arms DOWN!", "#9dffb0"];
  }

  draw(now) {
    const { W, H } = view, s = player.scale, st = this.status;
    if (player.visible) {
      // Target stars to touch at the top of each jack.
      const { upY } = this.armLines();
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

    const [text, color] = this.cue();
    bigText(text, W / 2, 110, Math.min(56, W / 13), color);

    // Arms / legs checklist so kids can see what's missing.
    const want = this.state === "down" ? { arms: "up", legs: "open" } : { arms: "down", legs: "closed" };
    [["🙌", "Arms", st.arms === want.arms], ["🦵", "Legs", st.legs === want.legs]].forEach(([e, label, ok], i) => {
      const x = W / 2 + (i ? 90 : -90), y = H - 205;
      ctx.fillStyle = ok ? "rgba(47, 207, 138, 0.9)" : "rgba(20, 12, 56, 0.75)";
      ctx.beginPath(); ctx.roundRect(x - 75, y - 24, 150, 48, 24); ctx.fill();
      bigText(`${e} ${label} ${ok ? "✓" : ""}`, x, y + 2, 24);
    });

    bigText(String(this.reps), W / 2, H - 120, 110, "#fff");
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
