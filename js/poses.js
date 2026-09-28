// Body poses shared by Simon Says, Hole in the Wall and Yoga Stretch:
// a check against the tracked body, plus a friendly stick-figure picture of each pose.
import { ctx } from "./fx.js";
import { player } from "./tracker.js";

// Arm shapes for the picture: [elbow, hand] for the screen-right arm, in body units
// (shoulder half-width = 0.5). The screen-left arm mirrors it unless `left` is given.
export const UP = [[0.6, -0.9], [0.5, -1.75]];
export const DOWN = [[0.6, 0.6], [0.65, 1.2]];

// Everything a pose check needs, in screen pixels.
export function poseContext(depth = 0.5) {
  return {
    head: player.head, a: player.hands[0], b: player.hands[1], s: player.scale,
    cx: player.cx, shY: player.shY, baseY: player.baseY, depth,
    knees: player.knees, hips: player.hips, ankles: player.ankles, shoulders: player.shoulders,
  };
}

export const both = (P, fn) => P.a.ok && P.b.ok && fn(P.a) && fn(P.b);

export const POSES = [
  {
    id: "up", name: "Hands up!", emoji: "🙌", arm: UP,
    check: (P) => both(P, (h) => h.y < P.head.y - 0.2 * P.s && Math.abs(h.x - P.cx) < 1.4 * P.s),
  },
  {
    id: "plane", name: "Airplane arms!", emoji: "✈️", arm: [[1.1, 0], [1.8, 0]],
    check: (P) => both(P, (h) => Math.abs(h.y - P.shY) < 0.6 * P.s && Math.abs(h.x - P.cx) > 1.2 * P.s),
  },
  {
    id: "head", name: "Hands on your head!", emoji: "🙆", arm: [[1.0, -0.55], [0.3, -0.95]],
    check: (P) => both(P, (h) => Math.hypot(h.x - P.head.x, h.y - P.head.y) < 0.9 * P.s && h.y < P.shY),
  },
  {
    id: "star", name: "Big star!", emoji: "🌟", arm: [[0.95, -0.6], [1.5, -1.3]],
    check: (P) => both(P, (h) => h.y < P.shY - 0.4 * P.s && Math.abs(h.x - P.cx) > 1.1 * P.s),
  },
  {
    id: "one", name: "One hand up!", emoji: "☝️", arm: UP, left: DOWN,
    check: (P) => {
      const hs = [P.a, P.b].filter((h) => h.ok);
      const ups = hs.filter((h) => h.y < P.head.y - 0.2 * P.s).length;
      const downs = hs.filter((h) => h.y > P.shY).length;
      return ups === 1 && (hs.length === 1 || downs === 1);
    },
  },
  {
    id: "squat", name: "Squat down!", emoji: "⬇️", arm: [[0.6, 0.5], [1.1, 0.6]], squat: true,
    check: (P) => P.head.y > P.baseY + P.depth * P.s,
  },
  {
    id: "flex", name: "Superhero muscles!", emoji: "💪", arm: [[1.1, 0], [1.05, -0.75]], hard: true,
    check: (P) => both(P, (h) => h.y < P.shY - 0.1 * P.s && h.y > P.head.y - 0.7 * P.s && Math.abs(h.x - P.cx) > 0.7 * P.s && Math.abs(h.x - P.cx) < 1.9 * P.s),
  },
];

// A friendly stick figure showing the pose.
// Extra picture options: squat (bent legs), legs: "wide" | "tree", lean: -1..1 (side bend).
export function drawFigure(cx, cy, u, pose) {
  const dy = pose.squat ? 0.7 : 0;
  const P = (x, y) => [cx + x * u, cy + (y + dy) * u];
  const line = (...pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#2a1b5c";
  ctx.lineWidth = u * 0.28;

  // Legs
  if (pose.legs === "tree") {
    // Standing on one leg, the other knee bent out to the side.
    line(P(-0.3, 1.2), [cx - 0.35 * u, cy + 1.9 * u], [cx - 0.35 * u, cy + 2.6 * u]);
    line(P(0.3, 1.2), [cx + 0.95 * u, cy + 1.6 * u], [cx + 0.1 * u, cy + 1.95 * u]);
  } else {
    const wide = pose.legs === "wide" ? 1.1 : pose.squat ? 0.85 : 0.35;
    const kneeY = pose.squat ? 1.75 : 1.9, footX = pose.legs === "wide" ? 1.35 : 0.45;
    for (const sd of [-1, 1]) line(P(sd * 0.3, 1.2), [cx + sd * wide * u, cy + kneeY * u], [cx + sd * footX * u, cy + 2.6 * u]);
  }
  // Upper body (tilted for a side bend)
  ctx.save();
  if (pose.lean) {
    const [px, py] = P(0, 1.2);
    ctx.translate(px, py);
    ctx.rotate(pose.lean * 0.35);
    ctx.translate(-px, -py);
  }
  line(P(0, 0), P(0, 1.2));
  line(P(-0.5, 0), P(0.5, 0));
  for (const sd of [-1, 1]) {
    const [e, h] = sd === -1 && pose.left ? pose.left : pose.arm;
    ctx.strokeStyle = "#7b5cff";
    line(P(sd * 0.5, 0), P(sd * e[0], e[1]), P(sd * h[0], h[1]));
  }
  const [hx, hy] = P(0, -0.6);
  ctx.fillStyle = "#ffcf9e";
  ctx.strokeStyle = "#2a1b5c";
  ctx.lineWidth = u * 0.12;
  ctx.beginPath(); ctx.arc(hx, hy, u * 0.38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
