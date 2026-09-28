// Copies the body tracker, AI models and font into vendor/ so the game works offline
// (used by the Windows app, and by the web version when available).
const fs = require("fs");
const path = require("path");
const https = require("https");

const root = path.join(__dirname, "..");
const vendor = path.join(root, "vendor");
const nm = path.join(root, "node_modules");

const MODELS = {
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} -> HTTP ${res.statusCode}`)); }
      const tmp = dest + ".part";
      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => out.close(() => { fs.renameSync(tmp, dest); resolve(); }));
      out.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  // MediaPipe tasks-vision (JS bundle + WebAssembly)
  const mp = path.join(nm, "@mediapipe", "tasks-vision");
  if (!fs.existsSync(mp)) {
    console.log("prepare-offline: @mediapipe/tasks-vision not installed yet, skipping");
    return;
  }
  copy(path.join(mp, "vision_bundle.mjs"), path.join(vendor, "tasks-vision", "vision_bundle.mjs"));
  for (const f of fs.readdirSync(path.join(mp, "wasm"))) {
    copy(path.join(mp, "wasm", f), path.join(vendor, "tasks-vision", "wasm", f));
  }

  // Font
  const font = path.join(nm, "@fontsource", "baloo-2", "files");
  for (const w of [600, 800]) {
    const f = `baloo-2-latin-${w}-normal.woff2`;
    if (fs.existsSync(path.join(font, f))) copy(path.join(font, f), path.join(vendor, "fonts", f));
  }

  // Pose models (downloaded once)
  fs.mkdirSync(path.join(vendor, "models"), { recursive: true });
  for (const [name, url] of Object.entries(MODELS)) {
    const dest = path.join(vendor, "models", name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1e6) continue;
    console.log(`prepare-offline: downloading ${name}…`);
    await download(url, dest);
  }
  console.log("prepare-offline: vendor/ is ready");
}

main().catch((err) => {
  console.error("prepare-offline failed:", err.message);
  process.exitCode = 1;
});
