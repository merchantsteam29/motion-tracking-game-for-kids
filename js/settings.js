// Player settings, saved on this device only.
const KEY = "moveplay-settings";

export const DEFAULTS = {
  sound: true,          // sound effects + music
  voice: true,          // spoken counts and tips
  volume: 0.8,          // 0..1
  hands: "normal",      // hand circle smoothing: steady | normal | quick
  cameraId: "",         // "" = default front camera
  mirror: true,         // show the camera like a mirror
  showCamera: true,     // camera picture behind the game (off = space background)
  gameLength: "normal", // short | normal | long
  calm: false,          // no screen shake, fewer sparkles
  noCamera: false,      // play with touch/mouse instead of the camera
  debug: false,         // show tracking info
};

export const GAME_LENGTH = { short: 0.6, normal: 1, long: 1.5 };

const CHOICES = { hands: ["steady", "normal", "quick"], gameLength: Object.keys(GAME_LENGTH) };

// Only keep saved values that still make sense (right type, allowed choice, in range).
function clean(saved) {
  const out = {};
  for (const [k, def] of Object.entries(DEFAULTS)) {
    const v = saved[k];
    if (typeof v !== typeof def) continue;
    if (CHOICES[k] && !CHOICES[k].includes(v)) continue;
    if (k === "volume" && !(v >= 0 && v <= 1)) continue;
    out[k] = v;
  }
  return out;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") return clean(saved);
    const oldHands = localStorage.getItem("hands"); // from before the settings screen existed
    return oldHands ? clean({ hands: oldHands }) : {};
  } catch {
    return {};
  }
}

export const settings = { ...DEFAULTS, ...load() };

const listeners = new Set();
export function onSettingsChange(fn) { listeners.add(fn); }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* private browsing */ }
}

export function setSetting(key, value) {
  if (!(key in DEFAULTS)) return;
  const next = clean({ [key]: value });
  if (!(key in next)) return;
  settings[key] = next[key];
  save();
  listeners.forEach((fn) => fn(key, settings[key]));
}

export function resetSettings() {
  Object.assign(settings, DEFAULTS);
  save();
  listeners.forEach((fn) => fn(null));
}
