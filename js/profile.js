// Body profile from the player's height (Settings → Height).
// Kids' body proportions change as they grow, so from the height we estimate the typical
// age-group proportions and size targets, squats, knee lifts and jumps to fit the player.
// With no height set, everything stays at 1 (no change).
import { settings } from "./settings.js";
import { MOBILE } from "./tracker.js";

// Average height in cm by age (boys and girls combined, rounded), used to estimate proportions.
const HEIGHT = { 3: 96, 4: 103, 5: 110, 6: 116, 7: 122, 8: 128, 9: 133, 10: 139, 11: 144, 12: 150, 13: 157, 14: 163, 15: 167, 16: 170 };

// The age group whose average height is closest to this height.
function groupFor(cm) {
  let best = 16, bestD = Infinity;
  for (const [age, h] of Object.entries(HEIGHT)) {
    const d = Math.abs(h - cm);
    if (d < bestD) { bestD = d; best = Number(age); }
  }
  return best;
}

// Leg length as a share of height: little kids have shorter legs for their size.
const legShare = (a) => (a <= 3 ? 0.4 : a <= 5 ? 0.43 : a <= 7 ? 0.45 : a <= 9 ? 0.46 : a <= 11 ? 0.47 : 0.48);

const band = (young, mid, kid, teen) => {
  if (!settings.height) return 1;
  const a = groupFor(settings.height);
  return a <= 5 ? young : a <= 8 ? mid : a <= 12 ? kid : teen;
};

export const body = {
  get known() { return settings.height > 0; },
  get heightCm() { return this.known ? settings.height : null; },
  // Leg moves (squats, knee lifts, jumping-jack feet) need less travel with shorter legs.
  get legs() { return this.known ? legShare(groupFor(settings.height)) / 0.48 : 1; },
  // How far away targets can go: from the camera calibration if done (games assume about
  // 2.1 shoulder-widths up and 1.9 out), otherwise a guess from the height.
  get reach() {
    if (settings.calibUp && settings.calibSide) {
      return Math.min(1.25, Math.max(0.7, Math.min(settings.calibSide / 1.9, settings.calibUp / 2.1)));
    }
    return band(0.85, 0.92, 1, 1.05);
  },
  get calibrated() { return !!(settings.calibUp && settings.calibSide); },
  // Smaller kids wobble more when trying to stand still.
  get wobble() { return band(1.4, 1.2, 1, 0.9); },
  // How fast a swipe must be to slice fruit.
  get swipe() { return band(0.7, 0.85, 1, 1); },
  // Suggested level for this size.
  get level() {
    if (!this.known) return null;
    const a = groupFor(settings.height);
    return a <= 6 ? "easy" : a <= 10 ? "medium" : "hard";
  },
  // How far from the camera to stand so the whole body fits (phones/tablets have wider cameras).
  get standM() { return this.known ? (settings.height / 100) * (MOBILE ? 1.3 : 1.8) : null; },
};

// "4 ft 2 in" or "127 cm", depending on the chosen unit.
export function heightLabel(cm = settings.height, unit = settings.heightUnit) {
  if (!cm) return "Not set";
  if (unit === "cm") return `${Math.round(cm)} cm`;
  const inches = Math.round(cm / 2.54);
  return `${Math.floor(inches / 12)} ft ${inches % 12} in`;
}

export function formatDistance(m, unit = settings.heightUnit) {
  const ft = Math.round(m * 3.281 * 2) / 2;
  return unit === "cm" ? `${m.toFixed(1)} m` : `${ft} ft`;
}
