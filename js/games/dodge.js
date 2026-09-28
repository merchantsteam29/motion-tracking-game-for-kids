// Dodge & Duck: step side to side to dodge rocks, squat under rainbow waves, reach for stars.
import { view, ctx, sfx, say, tone, popup, burst, drawEmoji, bigText, drawPlayer, circle, rand, pick, clamp } from "../fx.js";
import { player } from "../tracker.js";
import { body } from "../profile.js";

const ROCKS = ["☄️", "🪨", "☄️", "🌑"];

export default {
  id: "dodge",
  title: "Dodge & Duck",
  emoji: "🚀",
  color: "#ff7a59",
  blurb: "Dodge space rocks!",
  how: [
    ["↔️", "Dodge the space rocks"],
    ["⬇️", "Squat when it says DUCK!"],
    ["🙌", "Grab the stars"],
  ],
  finger: [
    ["👆", "Drag left and right to dodge"],
    ["⬇️", "Drag down low to duck"],
    ["⭐", "Touch stars to grab them"],
  ],
  fingerTip: "👆 Drag to move, drag down to duck",
  stars: [30, 60, 100], // scores for 1, 2, 3 stars per minute of play
  mouse: "head",
  levels: {
    easy:   { time: 60, rockEvery: 1.7,  rockSpeed: 0.20, rockSize: 0.050, aim: 0.35, starEvery: 2.0, duckEvery: 10, duckWarn: 2.2, duckDepth: 0.50 },
    medium: { time: 75, rockEvery: 1.1,  rockSpeed: 0.30, rockSize: 0.055, aim: 0.50, starEvery: 2.4, duckEvery: 7,  duckWarn: 1.7, duckDepth: 0.75 },
    hard:   { time: 90, rockEvery: 0.75, rockSpeed: 0.42, rockSize: 0.060, aim: 0.65, starEvery: 2.8, duckEvery: 5,  duckWarn: 1.3, duckDepth: 1.00 },
  },
  create: (cfg) => new Dodge({ ...cfg, duckDepth: cfg.duckDepth * body.legs }),
};

class Dodge {
  constructor(cfg) {
    this.cfg = cfg;
    this.score = 0;
    this.stars = 0; this.dodges = 0; this.ducks = 0;
    this.rocks = []; this.starList = [];
    this.bar = null;
    this.rockTimer = 1.5; this.starTimer = 1; this.duckTimer = cfg.duckEvery;
    this.invincible = 0; this.shake = 0;
  }

  get holdBaseline() { return !!this.bar; }

  bodyCircles() {
    const s = player.scale;
    const out = [{ x: player.head.x, y: player.head.y, r: s * 0.42 }];
    for (const sh of player.shoulders) if (sh.ok) out.push({ x: sh.x, y: sh.y, r: s * 0.22 });
    return out;
  }

  bonk() {
    if (this.invincible > 0) return;
    this.invincible = 1.2;
    this.shake = 0.35;
    sfx.bonk();
    popup("Oops! 🙈", player.head.x, player.head.y - player.scale, "#ff8fa3");
  }

  update(dt) {
    const { W, H } = view, cfg = this.cfg, s = player.scale, unit = Math.min(W, H);
    this.invincible = Math.max(0, this.invincible - dt);
    this.shake = Math.max(0, this.shake - dt);

    // Rocks (fewer while a duck wave is coming).
    this.rockTimer -= dt * (this.bar ? 0.4 : 1);
    if (this.rockTimer <= 0) {
      this.rockTimer = cfg.rockEvery * rand(0.75, 1.25);
      const r = unit * cfg.rockSize * rand(0.8, 1.3);
      const x = Math.random() < cfg.aim ? player.head.x + rand(-0.5, 0.5) * s : rand(r, W - r);
      this.rocks.push({ x: clamp(x, r, W - r), y: -r, r, vy: H * cfg.rockSpeed * rand(0.85, 1.15), spin: rand(-2, 2), a: 0, emoji: pick(ROCKS) });
    }

    // Stars in reachable spots, often above the head.
    this.starTimer -= dt;
    if (this.starTimer <= 0) {
      this.starTimer = cfg.starEvery * rand(0.8, 1.2);
      this.starList.push({
        x: clamp(player.head.x + rand(-2.2, 2.2) * s * body.reach, 40, W - 40),
        y: clamp(player.head.y - s * rand(0.3, 1.4) * body.reach, 90, H - 60),
        r: unit * 0.045, life: 4.5, t: 0,
      });
    }

    // Duck waves.
    this.duckTimer -= dt;
    if (!this.bar && this.duckTimer <= 0) {
      this.bar = { phase: "warn", t: 0, lineY: Math.min(H - 40, player.baseY + s * cfg.duckDepth), fromLeft: Math.random() < 0.5, x: -W, hitIt: false };
      sfx.warn();
      say("Duck!");
    }
    if (this.bar) this.updateBar(dt);

    const hitCircles = this.bodyCircles();
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      rock.y += rock.vy * dt;
      rock.a += rock.spin * dt;
      if (hitCircles.some((c) => Math.hypot(c.x - rock.x, c.y - rock.y) < c.r + rock.r * 0.8)) {
        this.bonk();
        burst(rock.x, rock.y, "#ffb3c1", 10);
        this.rocks.splice(i, 1);
      } else if (rock.y - rock.r > H) {
        this.dodges++;
        this.score += 1;
        sfx.tick();
        this.rocks.splice(i, 1);
      }
    }

    const catchers = player.hands.filter((h) => h.ok).map((h) => ({ x: h.x, y: h.y, r: s * 0.35 }));
    catchers.push({ x: player.head.x, y: player.head.y, r: s * 0.4 });
    for (let i = this.starList.length - 1; i >= 0; i--) {
      const st = this.starList[i];
      st.t += dt;
      if (catchers.some((c) => Math.hypot(c.x - st.x, c.y - st.y) < c.r + st.r)) {
        this.stars++;
        this.score += 5;
        sfx.star();
        burst(st.x, st.y, "#ffe066", 18);
        popup("+5 ⭐", st.x, st.y, "#ffe066");
        this.starList.splice(i, 1);
      } else if (st.t > st.life) {
        this.starList.splice(i, 1);
      }
    }
  }

  updateBar(dt) {
    const bar = this.bar, { W } = view;
    bar.t += dt;
    if (bar.phase === "warn" && bar.t >= this.cfg.duckWarn) {
      bar.phase = "sweep";
      bar.t = 0;
      tone(300, 0.6, "sine", 0.12, 300);
    }
    if (bar.phase !== "sweep") return;
    const waveW = W * 0.3, p = bar.t / 0.9;
    const lead = -waveW + p * (W + 2 * waveW);
    bar.x = bar.fromLeft ? lead : W - lead - waveW;
    if (!bar.hitIt && player.head.x > bar.x && player.head.x < bar.x + waveW && player.head.y < bar.lineY) {
      bar.hitIt = true;
      this.bonk();
    }
    if (p >= 1) {
      if (!bar.hitIt) {
        this.ducks++;
        this.score += 3;
        sfx.yay();
        popup("Great duck! 🦆", player.head.x, player.head.y - player.scale, "#9dffb0", 46);
      }
      this.bar = null;
      this.duckTimer = this.cfg.duckEvery * rand(0.8, 1.2);
    }
  }

  draw(now) {
    if (this.bar) this.drawBar(now);
    for (const st of this.starList) {
      const fade = Math.min(1, st.life - st.t), pulse = 1 + 0.12 * Math.sin(now / 150);
      ctx.globalAlpha = Math.max(0, fade);
      circle(st.x, st.y, st.r * 1.4 * pulse, "rgba(255, 224, 102, 0.35)");
      drawEmoji("⭐", st.x, st.y, st.r * 2 * pulse);
      ctx.globalAlpha = 1;
    }
    for (const rock of this.rocks) drawEmoji(rock.emoji, rock.x, rock.y, rock.r * 2, rock.a);
    drawPlayer(player, now, { hurt: this.invincible > 0 });
  }

  drawBar(now) {
    const bar = this.bar, { W } = view, y = bar.lineY;
    if (bar.phase === "warn") {
      ctx.fillStyle = `rgba(255, 70, 110, ${0.18 + 0.12 * Math.sin(now / 90)})`;
      ctx.fillRect(0, 0, W, y);
      ctx.setLineDash([22, 14]);
      ctx.strokeStyle = "#ff5c7a";
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.setLineDash([]);
      bigText("⬇️ DUCK! ⬇️", W / 2, Math.max(120, y - 70), Math.min(96, W / 8), "#ffe3ea");
      bigText(`Get below the line  •  ${Math.max(0, this.cfg.duckWarn - bar.t).toFixed(1)}`, W / 2, Math.max(180, y - 20), 28);
    } else {
      const waveW = W * 0.3;
      const g = ctx.createLinearGradient(0, 0, 0, y);
      ["#ff5c7a", "#ffb020", "#ffe066", "#3ecf8e", "#4dabff", "#7b5cff"].forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c));
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(bar.x, -20, waveW, y + 20, [0, 0, 40, 40]); ctx.fill();
      ctx.globalAlpha = 1;
      drawEmoji("🌈", bar.x + waveW / 2, y - 50, 70);
    }
  }

  results() {
    return [
      { emoji: "⭐", value: this.stars, label: "stars caught" },
      { emoji: "↔️", value: this.dodges, label: "rocks dodged" },
      { emoji: "🦆", value: this.ducks, label: "squats" },
    ];
  }
}
