// Body profile from the player's age (Settings → Age).
// Uses average heights and body proportions for kids so targets, squats and leg moves
// fit the player better. With no age set, everything stays at 1 (no change).
import { settings } from "./settings.js";
import { MOBILE } from "./tracker.js";

// Average height in cm by age (boys and girls combined, rounded).
const HEIGHT = { 3: 96, 4: 103, 5: 110, 6: 116, 7: 122, 8: 128, 9: 133, 10: 139, 11: 144, 12: 150, 13: 157, 14: 163, 15: 167, 16: 170 };

// Leg length as a share of height: little kids have shorter legs for their size.
const legShare = (a) => (a <= 3 ? 0.4 : a <= 5 ? 0.43 : a <= 7 ? 0.45 : a <= 9 ? 0.46 : a <= 11 ? 0.47 : 0.48);

const band = (young, mid, kid, teen) => {
  const a = settings.age;
  return !a ? 1 : a <= 5 ? young : a <= 8 ? mid : a <= 12 ? kid : teen;
};

export const body = {
  get known() { return settings.age > 0; },
  get age() { return settings.age; },
  get heightCm() { return this.known ? HEIGHT[settings.age] : null; },
  // Leg moves (squats, knee lifts, jumping-jack feet) need less travel with shorter legs.
  get legs() { return this.known ? legShare(settings.age) / 0.48 : 1; },
  // Bring targets a little closer for smaller arms and younger reach.
  get reach() { return band(0.85, 0.92, 1, 1.05); },
  // Younger kids wobble more when trying to stand still.
  get wobble() { return band(1.4, 1.2, 1, 0.9); },
  // How fast a swipe must be to slice fruit.
  get swipe() { return band(0.7, 0.85, 1, 1); },
  // Suggested level for this age.
  get level() { const a = settings.age; return !a ? null : a <= 6 ? "easy" : a <= 10 ? "medium" : "hard"; },
  // How far from the camera to stand so the whole body fits (phones/tablets have wider cameras).
  get standM() { return this.known ? (this.heightCm / 100) * (MOBILE ? 1.3 : 1.8) : null; },
};

export function formatHeight(cm) {
  const inches = Math.round(cm / 2.54);
  return `${cm} cm (${Math.floor(inches / 12)} ft ${inches % 12} in)`;
}

export function formatDistance(m) {
  const ft = Math.round(m * 3.281 * 2) / 2;
  return `${m.toFixed(1)} m (${ft} ft)`;
}

export function ageLabel(age = settings.age) {
  return !age ? "Not set" : age >= 16 ? "16+" : String(age);
}
