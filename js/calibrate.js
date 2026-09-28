// Camera calibration: checks light, camera speed, distance and hands, then measures how far
// the player can reach (up high and out wide) so games put targets where they can reach them.
import { view, ctx, sfx, say, tone, bigText, drawPlayer, circle, progressBar } from "./fx.js";
import { player, stats, initTracking } from "./tracker.js";
import { settings, setSetting } from "./settings.js";

const $ = (id) => document.getElementById(id);

export function createCalibration({ onExit }) {
  let step = "loading"; // loading → check → up → side → done (or error / finger)
  let t = 0, good = 0, best = 0, reachUp = 0, reachSide = 0;
  let checks = [];

  const setText = (title, tip) => { $("calibTitle").textContent = title; $("calibTip").textContent = tip; };

  function renderButtons() {
    const b = $("calibButtons");
    if (step === "check") b.innerHTML = `<button class="btn ghost" id="calibSkip">Skip check ⏭</button>`;
    else if (step === "done") b.innerHTML = `<button class="btn" id="calibDone">✓ Done</button><button class="btn ghost" id="calibRedo">🔁 Do it again</button>`;
    else if (step === "error" || step === "finger") b.innerHTML = `<button class="btn" id="calibDone">⬅ Back to Settings</button>`;
    else b.innerHTML = "";
    $("calibSkip")?.addEventListener("click", () => go("up"));
    $("calibDone")?.addEventListener("click", onExit);
    $("calibRedo")?.addEventListener("click", () => go("check"));
  }

  function renderChecks() {
    $("calibChecks").innerHTML = checks.map((c) =>
      `<li class="${c.ok ? "ok" : ""}"><span>${c.ok ? "✅" : c.icon}</span><b>${c.label}</b><small>${c.msg}</small></li>`).join("");
  }

  function go(next) {
    step = next; t = 0; good = 0; best = 0;
    if (next === "check") { setText("📷 Camera check", "Stand where you'll play. Fix anything that isn't ✅ yet."); say("Let's check your camera. Stand where you will play."); }
    if (next === "up") { setText("🙌 Reach up high!", "Stretch both hands as high as you can and hold it."); say("Reach up as high as you can!"); checks = []; renderChecks(); }
    if (next === "side") { setText("✈️ Arms out wide!", "Stretch your arms out to the sides like an airplane."); say("Now stretch your arms out wide, like an airplane!"); }
    if (next === "done") finish();
    renderButtons();
  }

  function finish() {
    const up = +reachUp.toFixed(2), side = +reachSide.toFixed(2);
    // Only save a real stretch; a half-hearted one would make every game too small.
    const measured = up >= 1 && side >= 1;
    if (measured) { setSetting("calibUp", Math.min(4, up)); setSetting("calibSide", Math.min(4, side)); }
    sfx.fanfare();
    if (measured) {
      say("All set! Your camera is ready.");
      setText("🎉 All set!", "Your games will now put targets where you can reach them.");
    } else {
      say("Camera checked! Let's try the stretch again, really reach!");
      setText("📷 Camera checked", "We couldn't measure a full stretch, so your reach wasn't changed. Tap “Do it again” and stretch as far as you can!");
    }
    const light = stats.brightness ?? 0;
    checks = [
      { icon: "💡", label: "Light", ok: light >= 0.25, msg: light >= 0.25 ? "Bright enough" : "A bit dark: more light helps the hand tracker" },
      { icon: "⏱️", label: "Camera speed", ok: stats.fps >= 20, msg: `${Math.round(stats.fps)} frames per second` },
      { icon: "🙌", label: "Reach up", ok: up >= 1, msg: up >= 1 ? `${up} shoulder-widths above your shoulders` : "Stretch higher next time" },
      { icon: "✈️", label: "Reach wide", ok: side >= 1, msg: side >= 1 ? `${side} shoulder-widths to each side` : "Stretch wider next time" },
    ];
    renderChecks();
  }

  return {
    async start() {
      $("calibChecks").innerHTML = "";
      if (settings.noCamera) {
        step = "finger";
        setText("👆 Finger mode is on", "Turn off Finger mode in Settings to calibrate the camera.");
        renderButtons();
        return;
      }
      step = "loading";
      setText("📷 Starting the camera…", "");
      renderButtons();
      const res = await initTracking((msg) => setText(msg, ""));
      if (!res.ok) { step = "error"; setText("😕 We couldn't use the camera", res.error); renderButtons(); return; }
      go("check");
    },

    update(dt) {
      t += dt;
      const s = player.scale, W = view.W;
      if (step === "check") {
        const light = stats.brightness ?? 0;
        const legs = player.knees[0].ok && player.knees[1].ok;
        const hands = player.hands[0].ok && player.hands[1].ok;
        const tooFar = player.visible && s < W * 0.06;
        checks = [
          { icon: "💡", label: "Light", ok: light >= 0.25, msg: light >= 0.25 ? "Good light" : "Too dark: turn on a light or face a window" },
          { icon: "⏱️", label: "Camera speed", ok: stats.fps >= 20, msg: stats.fps >= 20 ? `${Math.round(stats.fps)} fps` : "Slow: close other apps or tabs" },
          { icon: "🧍", label: "Distance", ok: player.visible && legs && !tooFar,
            msg: !player.visible ? "Step into the picture" : !legs ? "Step back until your knees show" : tooFar ? "Come a little closer" : "Great spot!" },
          { icon: "✋", label: "Hands", ok: hands, msg: hands ? "Both hands seen" : "Show both hands" },
        ];
        renderChecks();
        good = checks.every((c) => c.ok) ? good + dt : 0;
        if (good > 1.5) { tone(880, 0.12, "triangle"); go("up"); }
      } else if (step === "up" || step === "side") {
        if (!player.visible) return;
        const hs = player.hands.filter((h) => h.ok);
        if (step === "up") {
          const top = Math.min(...hs.map((h) => h.y));
          if (hs.length) best = Math.max(best, (player.shY - top) / s);
        } else {
          const wide = hs.map((h) => Math.abs(h.x - player.cx) / s);
          if (wide.length) best = Math.max(best, Math.min(...(wide.length === 2 ? wide : [wide[0]])));
        }
        // Done after ~3.5 s of stretching (or 6 s max).
        if ((t > 3.5 && best > 0.8) || t > 6) {
          if (step === "up") { reachUp = best; tone(700, 0.1, "triangle"); go("side"); }
          else { reachSide = best; go("done"); }
        }
      }
    },

    draw(now) {
      const { W, H } = view, s = player.scale;
      drawPlayer(player, now);
      if (step === "up" || step === "side") {
        // Show the stretch being measured as a line, plus a timer ring.
        if (player.visible && best > 0) {
          ctx.strokeStyle = "#ffe066";
          ctx.lineWidth = 5;
          ctx.setLineDash([12, 10]);
          ctx.beginPath();
          if (step === "up") { const y = player.shY - best * s; ctx.moveTo(player.cx - s * 1.5, y); ctx.lineTo(player.cx + s * 1.5, y); }
          else { for (const d of [-1, 1]) { const x = player.cx + d * best * s; ctx.moveTo(x, player.shY - s); ctx.lineTo(x, player.shY + s); } }
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const bw = Math.min(360, W * 0.7);
        progressBar(W / 2 - bw / 2, H - 40, bw, 16, Math.min(1, t / 3.5), "#ffe066");
        bigText(best > 0 ? `${best.toFixed(1)} shoulder-widths` : "Stretch!", W / 2, H - 70, 26);
      }
      if (step === "check" && !player.visible) circle(W / 2, H * 0.4, Math.min(W, H) * 0.12, null, "rgba(255,255,255,0.5)", 4);
    },
  };
}
