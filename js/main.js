// Menu, round flow (ready → countdown → play → results), HUD and main loop.
import { view, setCtx, ctx, sfx, say, tone, setMuted, isMuted, clearEffects, updateEffects, drawEffects, bigText, circle, pick, unlockAudio } from "./fx.js";
import { registerServiceWorker } from "./config.js";
import { player, initTracking, updateTracking, updateFromMouse, hasCamera, drawCamera, restartCamera, stats } from "./tracker.js";
import { settings, onSettingsChange, GAME_LENGTH } from "./settings.js";
import { buildSettings, refreshCameras } from "./settings-ui.js";
import { body, formatDistance, heightLabel } from "./profile.js";
import { starsFor, getBest, bestStars, recordResult } from "./progress.js";
import dodge from "./games/dodge.js";
import bubbles from "./games/bubbles.js";
import jacks from "./games/jacks.js";
import simon from "./games/simon.js";
import fruit from "./games/fruit.js";
import freeze from "./games/freeze.js";
import moles from "./games/moles.js";
import goalie from "./games/goalie.js";
import balloon from "./games/balloon.js";
import knees from "./games/knees.js";
import jumprope from "./games/jumprope.js";
import rocket from "./games/rocket.js";
import ski from "./games/ski.js";
import wash from "./games/wash.js";
import boxing from "./games/boxing.js";

const MODES = [fruit, dodge, bubbles, goalie, moles, boxing, balloon, wash, ski, freeze, jumprope, rocket, jacks, knees, simon];
const LEVELS = ["easy", "medium", "hard"];
const LEVEL_NAMES = { easy: "Easy", medium: "Medium", hard: "Hard" };
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
const screens = { menu: $("menu"), setup: $("setup"), settings: $("settings"), loading: $("loading"), end: $("end") };

let mode = MODES[0];
let levelName = "easy";
let lastCfg = null;
let game = null;       // the running mini-game
let session = null;    // shared round state
let mouseMode = settings.noCamera; // finger/mouse instead of camera
let debug = false;     // press D in game to show raw tracker points (same as the Settings switch)
let current = "menu";  // which screen is showing
let beforeSettings = "menu";
let confetti = [];
// Pointer state for finger mode: every finger currently touching the screen.
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, leg: 1, touch: false, pointers: new Map() };

// ---------- Layout ----------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1); // phones can be 3x; 2x is sharp enough and much faster
  view.W = innerWidth;
  view.H = innerHeight;
  canvas.width = Math.round(view.W * dpr);
  canvas.height = Math.round(view.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resize);
resize();

function show(name) {
  current = name;
  for (const [k, el] of Object.entries(screens)) el.classList.toggle("hidden", k !== name);
  $("hud").classList.toggle("hidden", name !== null);
  $("settingsBtn").classList.toggle("hidden", name !== "menu" && name !== "setup");
  $("pause").classList.add("hidden"); // any screen change (including starting over) closes the pause menu
  if (name === "menu") refreshMenuStars();
  if (name === "setup") refreshSetup();
}

function openSettings() {
  beforeSettings = current === "setup" ? "setup" : "menu";
  show("settings");
  refreshCameras();
}

// ---------- Menu ----------
const starRow = (n) => [0, 1, 2].map((i) => `<i class="${i < n ? "on" : ""}">★</i>`).join("");

function buildMenu() {
  $("gameList").innerHTML = MODES.map((m, i) =>
    `<button class="game-tile" data-game="${m.id}" style="--c:${m.color}; --i:${i}">
      <span>${m.emoji}</span>${m.title}<small class="tile-stars" aria-hidden="true"></small>
    </button>`
  ).join("");
  $("gameList").querySelectorAll(".game-tile").forEach((btn) =>
    btn.addEventListener("click", () => openSetup(MODES.find((m) => m.id === btn.dataset.game)))
  );
}

function refreshMenuStars() {
  $("gameList").querySelectorAll(".game-tile").forEach((btn) => {
    const n = bestStars(btn.dataset.game);
    btn.querySelector(".tile-stars").innerHTML = n ? starRow(n) : "";
    btn.setAttribute("aria-label", `${btn.textContent.trim()}${n ? `, best ${n} stars` : ""}`);
  });
}

function openSetup(m) {
  mode = m;
  show("setup");
}

function refreshSetup() {
  const m = mode, finger = settings.noCamera;
  $("setupEmoji").textContent = m.emoji;
  $("setupTitle").textContent = m.title;
  $("setupHow").innerHTML = (finger ? m.finger : m.how).map(([e, t]) => `<div><span>${e}</span>${t}</div>`).join("");
  $("setupInfo").textContent = finger
    ? "👆 Finger mode is on: no camera needed"
    : body.known
      ? `📏 ${heightLabel()} tall · stand about ${formatDistance(body.standM)} from the camera`
      : "📏 Set your height in ⚙️ Settings so the game fits your size";
  const bests = LEVELS.map((l) => [l, getBest(m.id, l)]).filter(([, b]) => b);
  $("setupBest").innerHTML = bests.length
    ? "🏆 Best: " + bests.map(([l, b]) => `${LEVEL_NAMES[l]} ${b.score} <span class="mini-stars">${starRow(b.stars)}</span>`).join(" · ")
    : "";
  document.querySelectorAll(".level[data-level]").forEach((b) => b.classList.toggle("recommended", b.dataset.level === body.level));
}

// ---------- Round flow ----------
async function start() {
  if (settings.noCamera) mouseMode = true;
  if (!mouseMode && !hasCamera()) {
    $("camError").classList.add("hidden");
    document.querySelector(".spinner").classList.remove("hidden");
    show("loading");
  }
  if (!mouseMode) {
    const res = await initTracking((msg) => ($("loadingText").textContent = msg));
    if (!res.ok) { showCamError(res.error); return; }
  }
  const base = mode.levels[levelName];
  lastCfg = { ...base, time: Math.round(base.time * (GAME_LENGTH[settings.gameLength] ?? 1)) };
  clearEffects();
  confetti = [];
  player.baseY = null;
  game = mode.create(lastCfg);
  session = { phase: "ready", countdown: 0, timeLeft: lastCfg.time, total: lastCfg.time, samples: [], paused: false, go: 0, playT: 0 };
  show(null);
  keepAwake(true);
  say(mouseMode ? "Get ready!" : "Stand where I can see you!");
}

// Keep phones and tablets from dimming the screen mid-game.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => {
  const active = session && session.phase !== "over";
  if (document.visibilityState === "hidden" && active) pauseGame(); // switching apps pauses the game
  if (document.visibilityState === "visible" && active) keepAwake(true);
});

function showCamError(detail) {
  $("loadingText").textContent = "";
  document.querySelector(".spinner").classList.add("hidden");
  $("camErrorDetail").textContent = detail;
  $("camError").classList.remove("hidden");
}

// ---------- Pause ----------
function pauseGame() {
  if (!session || session.phase === "over" || session.paused) return;
  session.paused = true;
  $("pause").classList.remove("hidden");
  $("resumeBtn").focus();
}
function resumeGame() {
  if (!session) return;
  session.paused = false;
  $("pause").classList.add("hidden");
}

// ---------- Results ----------
function endGame() {
  session.phase = "over";
  session.paused = false;
  keepAwake(false);
  const stars = starsFor(mode, game, lastCfg);
  const { isNew, previous } = recordResult(mode.id, levelName, game.score, stars);

  $("endTitle").textContent = `${mode.emoji} ${mode.title} · ${LEVEL_NAMES[levelName]}`;
  $("endScore").textContent = game.score;
  $("endStats").innerHTML = game.results().map((r) =>
    `<div><span>${r.emoji}</span><b>${r.value}</b><small>${r.label}</small></div>`
  ).join("");
  $("endStars").innerHTML = [0, 1, 2].map((i) =>
    `<span class="star ${i < stars ? "on" : ""}" style="--d:${0.25 + i * 0.35}s">★</span>`).join("");
  $("endStars").setAttribute("aria-label", `${stars} out of 3 stars`);
  $("endRecord").className = "record" + (isNew ? " new" : "");
  $("endRecord").textContent = isNew
    ? (previous === null ? "🏆 First score saved!" : `🏆 New record! (old best ${previous})`)
    : `Best: ${getBest(mode.id, levelName)?.score ?? game.score}`;
  $("endCheer").textContent = stars === 3 ? "Perfect! Three stars! 🌟" : pick(CHEERS);
  show("end");

  sfx.fanfare();
  for (let i = 0; i < stars; i++) setTimeout(() => tone(660 + i * 220, 0.18, "triangle", 0.2), 250 + i * 350);
  say(isNew && previous !== null ? "New record!" : stars === 3 ? "Three stars! Amazing!" : "Great workout!");
  launchConfetti(isNew ? 220 : 60 + stars * 50);
}

function launchConfetti(n) {
  if (settings.calm) n = Math.round(n / 4);
  const colors = ["#ffd84d", "#ff5c7a", "#4dabff", "#2fcf8a", "#c77dff", "#ff9f1c"];
  for (let i = 0; i < n; i++) {
    confetti.push({
      x: Math.random() * view.W, y: -20 - Math.random() * view.H * 0.5,
      vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 160,
      a: Math.random() * 6, va: (Math.random() - 0.5) * 10,
      w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, c: pick(colors),
    });
  }
}

// ---------- Update ----------
function update(dt) {
  // Confetti keeps falling on the results screen.
  for (const p of confetti) { p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; p.vx += Math.sin(p.y / 40) * 4; }
  confetti = confetti.filter((p) => p.y < view.H + 30);

  if (!session || session.phase === "over" || session.paused) return;

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
      session.go = 0.8;
      sfx.go();
      say("Go!");
    }
    return;
  }

  session.go = Math.max(0, session.go - dt);
  session.playT += dt;
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
const bgStars = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 2.2 + 0.4, p: Math.random() * 6 }));

function drawBackground(now) {
  const { W, H } = view;
  if (hasCamera() && !mouseMode && settings.showCamera && session && session.phase !== "over") { drawCamera(ctx); return; }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0f0a2a");
  g.addColorStop(1, "#2a1757");
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, W + 40, H + 40);
  // Slowly drifting, twinkling stars.
  ctx.fillStyle = "#fff";
  for (const s of bgStars) {
    const x = ((s.x + now / 400000 * s.s) % 1) * W;
    ctx.globalAlpha = 0.35 + 0.45 * Math.sin(now / 700 + s.p);
    ctx.fillRect(x, s.y * H, s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function draw(now) {
  const { W, H } = view;
  ctx.save();
  if (game?.shake > 0 && !settings.calm && !session?.paused) {
    const m = game.shake * 30;
    ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
  }
  drawBackground(now);

  if (session && session.phase !== "over") {
    if (session.phase === "play") game.draw(now);
    drawEffects();

    if (session.phase === "ready" || (!player.visible && !mouseMode)) drawGetReady(now);
    else if (session.phase === "countdown") drawCountdown();
    else if (session.go > 0) {
      const k = session.go / 0.8;
      ctx.globalAlpha = Math.min(1, k * 2);
      bigText("GO! 🚀", W / 2, H / 2, Math.min(140, W / 5) * (1.4 - k * 0.4), "#9dffb0");
      ctx.globalAlpha = 1;
    }
    if (session.phase === "play" && mouseMode && session.playT < 5 && mode.fingerTip) {
      ctx.globalAlpha = Math.min(1, (5 - session.playT) / 0.8);
      bigText(mode.fingerTip, W / 2, H - 40, Math.min(30, W / 20), "#ffe066");
      ctx.globalAlpha = 1;
    }
    if (session.paused) { ctx.fillStyle = "rgba(15, 10, 42, 0.55)"; ctx.fillRect(0, 0, W, H); }

    if (debug || settings.debug) drawDebug();
    updateHud();
  }

  // Results confetti
  for (const p of confetti) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = p.c;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 1.3)) + 2);
    ctx.restore();
  }
  ctx.restore();
}

function updateHud() {
  const left = Math.max(0, session.timeLeft);
  $("hudScore").textContent = game.score;
  $("hudTime").textContent = Math.ceil(session.phase === "play" ? left : session.total);
  $("hudTimeBar").style.transform = `scaleX(${session.phase === "play" ? left / session.total : 1})`;
  $("hudTimeChip").classList.toggle("low", session.phase === "play" && left <= 10);
}

// "Get in position" screen: a body outline to line up with and a live checklist.
function drawGetReady(now) {
  const { W, H } = view;
  ctx.fillStyle = "rgba(15, 10, 42, 0.6)";
  ctx.fillRect(0, 0, W, H);

  if (mouseMode) {
    bigText("👆 Get your finger ready!", W / 2, H / 2, Math.min(56, W / 13));
    return;
  }

  // Outline of where to stand
  const u = Math.min(W, H) * 0.09, cx = W / 2, top = H * 0.2;
  ctx.save();
  ctx.setLineDash([12, 10]);
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.strokeStyle = player.visible ? "rgba(157, 255, 176, 0.9)" : "rgba(255, 255, 255, 0.55)";
  ctx.beginPath(); ctx.arc(cx, top + u, u * 0.8, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - u * 1.6, top + u * 2.4); ctx.lineTo(cx + u * 1.6, top + u * 2.4);
  ctx.moveTo(cx - u * 1.6, top + u * 2.4); ctx.lineTo(cx - u * 2.4, top + u * 1.2);
  ctx.moveTo(cx + u * 1.6, top + u * 2.4); ctx.lineTo(cx + u * 2.4, top + u * 1.2);
  ctx.moveTo(cx, top + u * 2.4); ctx.lineTo(cx, top + u * 4.8);
  ctx.stroke();
  ctx.restore();

  const msg = player.visible ? "Great! Hold still…" : "🧍 Step into the picture!";
  bigText(msg, W / 2, Math.max(70, top - 20), Math.min(52, W / 13));

  // Live checklist
  const items = [
    ["🙂 Head", player.head.ok],
    ["💪 Shoulders", player.shoulders[0].ok && player.shoulders[1].ok],
    ["✋ Hands", player.hands[0].ok || player.hands[1].ok],
  ];
  if (mode.legs) items.push(["🦵 Legs", player.knees[0].ok && player.knees[1].ok]);
  const cw = Math.min(150, (W - 40) / items.length - 10), y = top + u * 5.6;
  items.forEach(([label, ok], i) => {
    const x = W / 2 + (i - (items.length - 1) / 2) * (cw + 10);
    ctx.fillStyle = ok ? "rgba(47, 207, 138, 0.9)" : "rgba(20, 12, 56, 0.8)";
    ctx.beginPath(); ctx.roundRect(x - cw / 2, y - 22, cw, 44, 22); ctx.fill();
    bigText(`${label}${ok ? " ✓" : ""}`, x, y + 2, Math.min(20, cw / 7));
  });

  // Hold-still progress ring
  if (player.visible) {
    const f = Math.min(1, player.seenFor / 1.2);
    ctx.strokeStyle = "#9dffb0";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, top + u, u * 1.05, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  }
  const tip = body.known ? `Stand about ${formatDistance(body.standM)} from the camera` : "Stand back so the camera can see you";
  bigText(tip, W / 2, Math.min(H - 30, y + 60), Math.min(24, W / 26), "#d9d2ff");
}

function drawCountdown() {
  const { W, H } = view;
  const n = Math.ceil(session.countdown), f = session.countdown % 1 || 1;
  bigText(`${mode.emoji} ${mode.title}`, W / 2, H / 2 - Math.min(170, H * 0.3), Math.min(52, W / 14), "#d9d2ff");
  const r = Math.min(W, H) * 0.16;
  circle(W / 2, H / 2, r, "rgba(15, 10, 42, 0.55)");
  ctx.strokeStyle = "#ffe066";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
  bigText(String(n), W / 2, H / 2 + 4, r * (1.1 + (1 - f) * 0.2), "#ffe066");
}

function drawDebug() {
  for (const r of stats.raw) if (r) { ctx.fillStyle = "#ff3355"; ctx.beginPath(); ctx.arc(r.x, r.y, 5, 0, 7); ctx.fill(); }
  const precise = (stats.precise || []).map((p) => (p ? "✓" : "·")).join(" ");
  const lines = [
    `camera ${stats.fps.toFixed(0)} fps`,
    `body tracker ${stats.detectMs.toFixed(0)} ms (${stats.model || "—"})`,
    `hand tracker ${stats.handMs ? stats.handMs.toFixed(0) + " ms" : "off"}  exact: ${precise}`,
    "red dots = what the camera sees",
  ];
  ctx.font = "600 16px monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(10, view.H - 102, 330, 92);
  ctx.fillStyle = "#fff"; lines.forEach((l, i) => ctx.fillText(l, 18, view.H - 96 + i * 21));
}

// ---------- Main loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  player.finger = mouseMode;
  if (mouseMode) updateFromMouse(mouse, mode.mouse, dt);
  else updateTracking(dt);
  update(dt);
  draw(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- UI wiring ----------
document.querySelectorAll(".level[data-level]").forEach((btn) =>
  btn.addEventListener("click", () => { unlockAudio(); levelName = btn.dataset.level; start(); })
);
const leaveGame = () => { game = null; session = null; confetti = []; keepAwake(false); };
const toMenu = () => { leaveGame(); show("menu"); };
const toSetup = () => { leaveGame(); show("setup"); };
$("setupBack").addEventListener("click", toMenu);
$("againBtn").addEventListener("click", () => { unlockAudio(); start(); });
$("menuBtn").addEventListener("click", toMenu);
$("backBtn").addEventListener("click", toSetup);
$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("restartBtn").addEventListener("click", () => { unlockAudio(); start(); });
$("quitBtn").addEventListener("click", () => { if (session && session.phase !== "over") endGame(); });
$("mouseModeBtn").addEventListener("click", () => { unlockAudio(); mouseMode = true; start(); });

addEventListener("keydown", (e) => {
  const inGame = current === null && session && session.phase !== "over";
  if (e.key === "Escape" || e.key === "p" || e.key === "P") {
    if (inGame) { session.paused ? resumeGame() : pauseGame(); return; }
    if (e.key !== "Escape") return;
    if (current === "settings") show(beforeSettings);
    else if (current === "setup") toMenu();
  }
  if ((e.key === "d" || e.key === "D") && e.target === document.body) debug = !debug;
});

// Settings
buildSettings($("settingsBody"));
$("settingsBtn").addEventListener("click", openSettings);
$("settingsBack").addEventListener("click", () => show(beforeSettings));
$("settingsDone").addEventListener("click", () => show(beforeSettings));
const applyCalm = () => document.body.classList.toggle("calm", settings.calm);
applyCalm();
onSettingsChange((key) => {
  if (key === "cameraId") restartCamera();
  if (key === "noCamera" || key === null) mouseMode = settings.noCamera;
  if (key === "calm" || key === null) applyCalm();
});

// Fullscreen (great on tablets and TVs)
if (!document.fullscreenEnabled) $("fullBtn").hidden = true;
$("fullBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
});
$("muteBtn").addEventListener("click", () => {
  setMuted(!isMuted());
  $("muteBtn").textContent = isMuted() ? "🔇" : "🔊";
});

// A soft click for every button tap.
document.addEventListener("click", (e) => { if (e.target.closest("button, a.btn")) sfx.tap(); });

// Pointer input: mouse, or one or more fingers in finger mode.
const trackPointer = (e) => {
  if (e.pointerType === "mouse") mouse.touch = false; // a touchscreen laptop can switch back to the mouse
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (mouse.pointers.has(e.pointerId)) mouse.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
};
addEventListener("pointermove", trackPointer);
canvas.addEventListener("pointerdown", (e) => {
  mouse.touch = e.pointerType !== "mouse";
  mouse.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  trackPointer(e);
  mouse.down = true;
  mouse.leg = e.clientX < innerWidth / 2 ? 0 : 1; // High Knees: left side = left knee
  if (session?.phase === "play" && !session.paused) game.onTap?.(e.clientX, e.clientY);
});
const releasePointer = (e) => {
  mouse.pointers.delete(e.pointerId);
  mouse.down = mouse.pointers.size > 0;
};
addEventListener("pointerup", releasePointer);
addEventListener("pointercancel", releasePointer);

buildMenu();
show("menu");
registerServiceWorker();
