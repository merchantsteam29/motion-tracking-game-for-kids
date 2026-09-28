// Windows desktop app wrapper. Serves the game from a private app:// scheme so the camera,
// ES modules and WebAssembly all work offline, exactly like the web version.
const { app, BrowserWindow, protocol, session, shell, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.join(__dirname, "..");
const UNPACKED = ROOT.replace("app.asar", "app.asar.unpacked");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function resolveFile(urlPath) {
  const rel = decodeURIComponent(urlPath).replace(/^\/+/, "") || "index.html";
  // Large vendor files live outside the asar archive.
  const base = rel.startsWith("vendor/") ? UNPACKED : ROOT;
  const file = path.normalize(path.join(base, rel));
  return file.startsWith(base) ? file : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0f0a2a",
    title: "Move & Play",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL("app://game/index.html");

  // F11 toggles fullscreen — nice for playing on a TV.
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // Open any outside links in the normal browser, never inside the kids' app.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("app://")) e.preventDefault(); });

  if (process.env.SMOKE_TEST) smokeTest(win);
}

// Used by the build check: load the menu, confirm the offline tracker loads, save a screenshot, quit.
function smokeTest(win) {
  win.webContents.on("console-message", (_e, level, msg) => console.log(`[page:${level}] ${msg}`));
  win.webContents.once("did-finish-load", async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const mod = await import("./vendor/tasks-vision/vision_bundle.mjs");
      const fs = await mod.FilesetResolver.forVisionTasks("./vendor/tasks-vision/wasm");
      const lm = await mod.PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: "./vendor/models/pose_landmarker_full.task", delegate: "CPU" }, runningMode: "IMAGE" });
      lm.close();
      return { tiles: document.querySelectorAll(".game-tile").length, tracker: "loaded", font: document.fonts.check("800 20px 'Baloo Local'") };
    })()`).catch((e) => ({ error: String(e) }));
    console.log("SMOKE_RESULT " + JSON.stringify(result));
    const img = await win.webContents.capturePage();
    require("fs").writeFileSync(process.env.SMOKE_TEST, img.toPNG());
    app.exit(result.error ? 1 : 0);
  });
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const file = resolveFile(new URL(req.url).pathname);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // Only the camera is ever allowed.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(permission === "media" && (details.mediaTypes || []).every((t) => t === "video"));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === "media");

  createWindow();
});

app.on("window-all-closed", () => app.quit());
