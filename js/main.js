// Menu, round flow (ready → countdown → play → results), HUD and main loop.
import { view, setCtx, ctx, sfx, say, setMuted, isMuted, clearEffects, updateEffects, drawEffects, bigText, pick } from "./fx.js";
import { player, initTracking, updateTracking, updateFromMouse, hasCamera, drawCamera } from "./tracker.js";
import dodge from "./games/dodge.js";
import bubbles from "./games/bubbles.js";
import jacks from "./games/jacks.js";
import simon from "./games/simon.js";

const MODES = [dodge, bubbles, jacks, simon];
const CHEERS = [
  "You're a super mover! 💪",
  "Wow, what a champion! 🏆",
  "Your muscles say thank you! 🦵",
  "Awesome job, superstar! 🚀",
  "High five! ✋ You rock!",
];

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
setCtx(canvas.getContext("2d"));
const screens = { menu: $("menu"), loading: $("loading"), end: $("end") };

let mode = MODES[0];
let levelName = "easy";
let game = null;     // the running mini-game
let session = null;  // shared round state
let mouseMode = false;
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };

// ---------- Layout ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  view.W = innerWidth;
  view.H = innerHeight;
  canvas.width = Math.round(view.W * dpr);
  canvas.height = Math.round(view.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle("hidden", k !== name);
  $("hud").classList.toggle("hidden", name !== null);
}

// ---------- Menu ----------
function buildMenu() {
  $("gameList").innerHTML = MODES.map((m) =>
    `<button class="game-tile" data-game="${m.id}"><span>${m.emoji}</span><b>${m.title}</b><small>${m.blurb}</small></button>`
  ).join("");
  $("gameList").querySelectorAll(".game-tile").forEach((btn) =>
    btn.addEventListener("click", () => selectMode(MODES.find((m) => m.id === btn.dataset.game)))
  );
  selectMode(mode);
}

function selectMode(m) {
  mode = m;
  document.querySelectorAll(".game-tile").forEach((b) => b.classList.toggle("selected", b.dataset.game === m.id));
  $("gameHow").innerHTML = m.how.map(([e, t]) => `<li><span class="big">${e}</span> ${t}</li>`).join("");
}

// ---------- Round flow ----------
async function start() {
  if (!mouseMode && !hasCamera()) {
    $("camError").classList.add("hidden");
    document.querySelector(".spinner").classList.remove("hidden");
    show("loading");
  }
  if (!mouseMode) {
    const res = await initTracking((msg) => ($("loadingText").textContent = msg));
    if (!res.ok) { showCamError(res.error); return; }
  }
  const cfg = mode.levels[levelName];
  clearEffects();
  player.baseY = null;
  game = mode.create(cfg);
  session = { phase: "ready", countdown: 0, timeLeft: cfg.time, samples: [] };
  show(null);
  say("Stand where I can see you!");
}

function showCamError(detail) {
  $("loadingText").textContent = "";
  document.querySelector(".spinner").classList.add("hidden");
  $("camErrorDetail").textContent = detail;
  $("camError").classList.remove("hidden");
}

function endGame() {
  session.phase = "over";
  sfx.fanfare();
  $("endTitle").textContent = `🎉 ${mode.title} done! 🎉`;
  $("endScore").textContent = game.score;
  $("endStats").innerHTML = game.results().map((r) =>
    `<div><span>${r.emoji}</span><b>${r.value}</b><small>${r.label}</small></div>`
  ).join("");
  $("endCheer").textContent = pick(CHEERS);
  say("Great workout!");
  show("end");
}

function update(dt) {
  if (!session || session.phase === "over") return;

  if (session.phase === "ready") {
    if (player.visible && player.seenFor > 1.2) {
      session.phase = "countdown";
      session.countdown = 3;
      sfx.beep();
      say("3");
    }
    return;
  }

  if (session.phase === "countdown") {
    const before = Math.ceil(session.countdown);
    session.countdown -= dt;
    if (player.visible) session.samples.push(player.head.y);
    const now = Math.ceil(session.countdown);
    if (now !== before && now > 0) { sfx.beep(); say(String(now)); }
    if (session.countdown <= 0) {
      const s = session.samples.sort((a, b) => a - b);
      player.baseY = s.length ? s[Math.floor(s.length / 2)] : player.head.y;
      session.phase = "play";
      sfx.go();
      say("Go!");
    }
    return;
  }

  updateEffects(dt);
  if (!player.visible) return; // pause while nobody is in view

  session.timeLeft -= dt;
  if (session.timeLeft <= 0) { endGame(); return; }

  // Slowly follow the standing head height (kids drift closer/farther), only while standing.
  if (!game.holdBaseline && player.head.y < player.baseY + player.scale * 0.3) {
    player.baseY += (player.head.y - player.baseY) * Math.min(1, dt * 0.5);
  }
  game.update(dt);
}

// ---------- Drawing ----------
const bgStars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2 + 0.5 }));

function drawBackground(now) {
  const { W, H } = view;
  if (hasCamera() && !mouseMode) { drawCamera(ctx); return; }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1b1147");
  g.addColorStop(1, "#3a1f6b");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.fillStyle = "#fff";
  for (const s of bgStars) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(now / 600 + s.x * 20);
    ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function draw(now) {
  const { W, H } = view;
  ctx.save();
  if (game?.shake > 0) {
    const m = game.shake * 30;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }
  drawBackground(now);

  if (session && session.phase !== "over") {
    if (session.phase === "play") game.draw(now);
    drawEffects();

    if (session.phase === "ready" || !player.visible) {
      ctx.fillStyle = "rgba(18, 12, 46, 0.55)";
      ctx.fillRect(0, 0, W, H);
      const msg = player.visible ? "Great! Stay right there…" : "🧍 Step into the picture!";
      bigText(msg, W / 2, H / 2 - 20, Math.min(64, W / 12));
      bigText("Show your head, shoulders & hands", W / 2, H / 2 + 45, Math.min(30, W / 22), "#d9d2ff");
    } else if (session.phase === "countdown") {
      bigText(`${mode.emoji} ${mode.title}`, W / 2, H / 2 - 130, Math.min(52, W / 14), "#d9d2ff");
      bigText(String(Math.ceil(session.countdown)), W / 2, H / 2, 160 * (1 + (session.countdown % 1) * 0.5), "#ffe066");
    }

    $("hudScore").textContent = `⭐ ${game.score}`;
    $("hudTime").textContent = `⏱ ${Math.max(0, Math.ceil(session.timeLeft))}`;
  }
  ctx.restore();
}

// ---------- Main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mouseMode) updateFromMouse(mouse, mode.mouse, dt);
  else updateTracking(dt);
  update(dt);
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- UI wiring ----------
document.querySelectorAll(".level[data-level]").forEach((btn) =>
  btn.addEventListener("click", () => { levelName = btn.dataset.level; start(); })
);
const toMenu = () => { game = null; session = null; show("menu"); };
$("againBtn").addEventListener("click", start);
$("menuBtn").addEventListener("click", toMenu);
$("backBtn").addEventListener("click", toMenu);
$("quitBtn").addEventListener("click", () => { if (session && session.phase !== "over") endGame(); });
$("mouseModeBtn").addEventListener("click", () => { mouseMode = true; start(); });
$("muteBtn").addEventListener("click", () => {
  setMuted(!isMuted());
  $("muteBtn").textContent = isMuted() ? "🔇" : "🔊";
});
addEventListener("pointermove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener("pointerdown", () => (mouse.down = true));
addEventListener("pointerup", () => (mouse.down = false));

buildMenu();
show("menu");
