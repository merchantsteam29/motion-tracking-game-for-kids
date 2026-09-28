// Draws the app icon and saves electron/icon.png. Run with: npx electron scripts/make-icon.js
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const DRAW = `(() => {
  const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
  x.beginPath(); x.roundRect(16, 16, 480, 480, 110);
  const g = x.createLinearGradient(0, 0, 512, 512); g.addColorStop(0, "#3b2393"); g.addColorStop(1, "#12092f");
  x.fillStyle = g; x.fill();
  const rg = x.createRadialGradient(170, 140, 10, 170, 140, 300);
  rg.addColorStop(0, "rgba(139,107,255,0.6)"); rg.addColorStop(1, "rgba(139,107,255,0)");
  x.fillStyle = rg; x.fill();
  x.fillStyle = "#fff";
  [[90,110,4],[420,90,5],[400,400,4],[110,420,3],[450,250,3],[70,280,3]].forEach(([a,b,r]) => { x.beginPath(); x.arc(a,b,r,0,7); x.fill(); });
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI/2 + i*Math.PI/5, r = i % 2 ? 30 : 70; x.lineTo(256 + Math.cos(a)*r, 150 + Math.sin(a)*r); }
  x.closePath(); x.fillStyle = "#ffd84d"; x.fill();
  x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#fff"; x.lineWidth = 34;
  const L = (...p) => { x.beginPath(); p.forEach(([a,b],i) => i ? x.lineTo(a,b) : x.moveTo(a,b)); x.stroke(); };
  L([256,285],[256,360]); L([256,295],[175,215]); L([256,295],[337,215]); L([256,360],[185,440]); L([256,360],[327,440]);
  x.fillStyle = "#fff"; x.beginPath(); x.arc(256,248,34,0,7); x.fill();
  x.fillStyle = "#7fffe0"; [[168,207],[344,207]].forEach(([a,b]) => { x.beginPath(); x.arc(a,b,24,0,7); x.fill(); });
  return c.toDataURL("image/png");
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL("about:blank");
  const url = await win.webContents.executeJavaScript(DRAW);
  const out = path.join(__dirname, "..", "electron", "icon.png");
  fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", out);
  app.quit();
});
