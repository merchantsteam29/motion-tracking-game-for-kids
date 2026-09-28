// Star ratings and personal bests, saved on this device.
const KEY = "moveplay-best";

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
const bests = load();

// 0–3 stars. Games list the scores for 1/2/3 stars per minute of play (scaled to the round's length),
// or give their own rule (Jumping Jacks uses its rep goal).
export function starsFor(mode, game, cfg) {
  if (mode.rate) return Math.max(0, Math.min(3, mode.rate(game)));
  if (!mode.stars) return 0;
  const k = cfg.time / 60;
  return mode.stars.filter((t) => game.score >= Math.round(t * k)).length;
}

export function getBest(id, level) {
  const b = bests[`${id}:${level}`];
  return b && Number.isFinite(b.score) && Number.isFinite(b.stars) ? b : null;
}

// Most stars earned on any level of a game (for the menu cards).
export function bestStars(id) {
  return Math.max(0, ...["easy", "medium", "hard"].map((l) => getBest(id, l)?.stars ?? 0));
}

// Save a finished round. Returns whether it beat the old best.
export function recordResult(id, level, score, stars) {
  const old = getBest(id, level);
  bests[`${id}:${level}`] = { score: Math.max(score, old?.score ?? 0), stars: Math.max(stars, old?.stars ?? 0) };
  try { localStorage.setItem(KEY, JSON.stringify(bests)); } catch { /* private browsing */ }
  return { isNew: score > 0 && (!old || score > old.score), previous: old?.score ?? null };
}
