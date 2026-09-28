// Builds the Settings screen from a simple list and keeps it in sync with the saved settings.
import { settings, setSetting, resetSettings, onSettingsChange } from "./settings.js";
import { listCameras } from "./tracker.js";

const SCHEMA = [
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
  { group: "🎮 Games", items: [
    { key: "gameLength", label: "Game length", type: "choice",
      options: [["short", "Short"], ["normal", "Normal"], ["long", "Long"]] },
    { key: "calm", label: "Calm mode", hint: "No screen shaking, fewer sparkles", type: "switch" },
    { key: "noCamera", label: "Play without camera", hint: "Use touch or the mouse instead", type: "switch" },
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
            ${it.hint ? `<span class="set-hint">${it.hint}</span>` : ""}
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
