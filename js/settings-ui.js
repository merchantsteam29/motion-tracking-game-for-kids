// Builds the Settings screen from a simple list and keeps it in sync with the saved settings.
import { settings, setSetting, resetSettings, onSettingsChange } from "./settings.js";
import { listCameras } from "./tracker.js";
import { body, formatHeight, formatDistance, ageLabel } from "./profile.js";

const SCHEMA = [
  { group: "🧒 Player", items: [
    { key: "age", label: "Age", hint: "", type: "age" },
  ] },
  { group: "🎮 Play", items: [
    { key: "noCamera", label: "👆 Finger mode", hint: "Play by touching the screen, no camera needed", type: "switch" },
    { key: "gameLength", label: "Game length", type: "choice",
      options: [["short", "Short"], ["normal", "Normal"], ["long", "Long"]] },
    { key: "calm", label: "Calm mode", hint: "No screen shaking, fewer sparkles and animations", type: "switch" },
  ] },
  { group: "🔊 Sound", items: [
    { key: "sound", label: "Sound effects & music", type: "switch" },
    { key: "voice", label: "Talking voice", hint: "Counts and tips out loud", type: "switch" },
    { key: "volume", label: "Volume", type: "range" },
  ] },
  { group: "📷 Camera & hands", items: [
    { key: "hands", label: "Hand circles", hint: "Steady = calmer · Quick = less delay", type: "choice",
      options: [["steady", "🐢 Steady"], ["normal", "🙂 Normal"], ["quick", "⚡ Quick"]] },
    { key: "cameraId", label: "Camera", hint: "Pick which camera to use", type: "camera" },
    { key: "mirror", label: "Mirror picture", hint: "Move right, and you move right on screen", type: "switch" },
    { key: "showCamera", label: "Show camera picture", hint: "Off = space background instead", type: "switch" },
  ] },
  { group: "🛠️ Help", items: [
    { key: "debug", label: "Show tracking info", hint: "Red dots show what the camera sees", type: "switch" },
  ] },
];

let root = null;

function control(item) {
  const id = `set-${item.key}`;
  switch (item.type) {
    case "switch":
      return `<button class="switch" id="${id}" role="switch" data-key="${item.key}" aria-labelledby="${id}-label"><span></span></button>`;
    case "range":
      return `<input type="range" id="${id}" data-key="${item.key}" min="0" max="1" step="0.1" aria-labelledby="${id}-label" />`;
    case "choice":
      return `<div class="seg" role="radiogroup" aria-labelledby="${id}-label">${item.options.map(([v, t]) =>
        `<button role="radio" data-key="${item.key}" data-value="${v}">${t}</button>`).join("")}</div>`;
    case "age":
      return `<div class="stepper" role="group" aria-labelledby="${id}-label">
        <button data-step="-1" aria-label="Younger">−</button>
        <output id="ageValue" aria-live="polite"></output>
        <button data-step="1" aria-label="Older">+</button>
      </div>`;
    case "camera":
      return `<select id="${id}" data-key="${item.key}" aria-labelledby="${id}-label"><option value="">Default camera</option></select>`;
  }
  return "";
}

export function buildSettings(container) {
  root = container;
  root.innerHTML = SCHEMA.map((g) => `
    <section class="set-group">
      <h3>${g.group}</h3>
      ${g.items.map((it) => `
        <div class="set-row">
          <div class="set-text">
            <span class="set-label" id="set-${it.key}-label">${it.label}</span>
            ${it.type === "age" ? `<span class="set-hint" id="ageHint"></span>` : it.hint ? `<span class="set-hint">${it.hint}</span>` : ""}
          </div>
          ${control(it)}
        </div>`).join("")}
    </section>`).join("") + `
    <div class="set-actions">
      <button class="btn ghost" id="resetSettings">↺ Reset to default</button>
    </div>
    <p class="footnote">Settings are saved on this device.</p>`;

  root.querySelectorAll(".switch").forEach((b) =>
    b.addEventListener("click", () => setSetting(b.dataset.key, !settings[b.dataset.key])));
  root.querySelectorAll("input[type=range]").forEach((r) =>
    r.addEventListener("input", () => setSetting(r.dataset.key, Number(r.value))));
  root.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => setSetting(b.dataset.key, b.dataset.value)));
  root.querySelectorAll("select").forEach((s) =>
    s.addEventListener("change", () => setSetting(s.dataset.key, s.value)));
  root.querySelectorAll(".stepper button").forEach((b) => b.addEventListener("click", () => {
    const step = Number(b.dataset.step), age = settings.age;
    // From "Not set", + picks 6 and − does nothing; going below 3 clears it again.
    if (age === 0 && step < 0) return;
    const next = age === 0 ? 6 : age === 3 && step < 0 ? 0 : Math.min(16, Math.max(3, age + step));
    setSetting("age", next);
  }));
  root.querySelector("#resetSettings").addEventListener("click", resetSettings);

  onSettingsChange(sync);
  sync();
}

// Reflect the current settings in every control.
function sync() {
  if (!root) return;
  root.querySelectorAll(".switch").forEach((b) => b.setAttribute("aria-checked", String(!!settings[b.dataset.key])));
  root.querySelectorAll("input[type=range]").forEach((r) => (r.value = settings[r.dataset.key]));
  root.querySelectorAll(".seg button").forEach((b) =>
    b.setAttribute("aria-checked", String(settings[b.dataset.key] === b.dataset.value)));
  root.querySelectorAll("select").forEach((s) => (s.value = settings[s.dataset.key]));
  const ageValue = root.querySelector("#ageValue");
  if (ageValue) {
    ageValue.textContent = ageLabel();
    root.querySelector("#ageHint").textContent = body.known
      ? `Average height ${formatHeight(body.heightCm)} · stand about ${formatDistance(body.standM)} back`
      : "Set it so the games fit your size better";
  }
}

// Fill the camera list (names appear once the camera has been allowed at least once).
export async function refreshCameras() {
  const sel = root?.querySelector("#set-cameraId");
  if (!sel) return;
  const cams = await listCameras();
  sel.innerHTML = `<option value="">Default camera</option>` + cams.map((c, i) =>
    `<option value="${escapeHtml(c.deviceId)}">${escapeHtml(c.label || `Camera ${i + 1}`)}</option>`).join("");
  if (settings.cameraId && !cams.some((c) => c.deviceId === settings.cameraId)) {
    sel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(settings.cameraId)}">Saved camera (not found)</option>`);
  }
  sel.value = settings.cameraId;
  sel.closest(".set-row").hidden = cams.length < 2 && !settings.cameraId;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
