# motion-tracking-game
for kids and exersizing kids

## Move & Play 🏃🤸
Webcam workout games for kids. Easy / Medium / Hard levels for mixed ages. Nothing is saved, and the camera picture never leaves the device.

| Game | How to play |
|---|---|
| 🍉 **Fruit Slice** | Swipe your hands to slice flying fruit; slice glowing power-ups (❄️ freeze, ⭐ double points, 🌈 fruit frenzy, 🔥 mega blades); skip the bombs |
| 🚀 **Dodge & Duck** | Step side to side to dodge space rocks, squat under the rainbow when it says DUCK!, reach up for stars |
| 🫧 **Bubble Pop** | Pop bubbles with your hands; golden bubbles up high are worth 3; pop fast for combos |
| ⭐ **Jumping Jacks** | A rep counts only when arms go up AND feet jump apart, then back together; stand back so your feet show |
| 🙋 **Simon Says** | Copy the pose in the picture and hold it; on Medium/Hard, don't move unless "Simon says"! |
| ⚽ **Goalie Save** | Soccer balls fly at you: put a hand on the target ring to save; far shots are super saves |
| 🐹 **Whack-a-Mole** | Moles pop out of holes all around you; bop them with your hands (not the bunny!) |
| 🎈 **Balloon Bop** | Tap balloons up and keep them from touching the ground |
| 🪩 **Freeze Dance** | Dance while the music plays, freeze like a statue when it stops |
| 🏃 **High Knees Race** | Run in place with high knees (alternate legs) to race an animal to the finish |

Body tracking uses [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (free, runs in the browser).

### Windows app (download)
Build the installer once, then share the files in `dist/`:

```
npm install
npm run dist
```

- `dist/Move-and-Play-Setup-1.2.0.exe`: installer with Start menu and desktop shortcuts
- `dist/Move-and-Play-Portable-1.2.0.exe`: runs without installing (good for a USB stick)

The app works fully offline (tracker, AI models and font are bundled). Press **F11** for fullscreen.
The .exe isn't code-signed, so Windows SmartScreen may say "Windows protected your PC": click **More info → Run anyway**.

### Browser version (phones, tablets, computers)
The website is published automatically to GitHub Pages by `.github/workflows/pages.yml` whenever `main` is pushed:
**https://merchantsteam29.github.io/motion-tracking-game-for-kids/**

- Works on iPhone/iPad (Safari), Android (Chrome), and any computer with Chrome, Edge or Safari
- Can be installed like an app (Add to Home Screen / Install app) and opens offline after the first visit
- `share.html` is the share page: QR code plus copy/share link buttons
- If your GitHub name differs, edit `js/config.js`

**One-time setup:** publish the repo in GitHub Desktop (public), then on github.com open
**Settings → Pages → Source: GitHub Actions**.

### Web version (local testing)
1. `npm install` (downloads the tracker files so it also works offline)
2. `node server.js`
3. Open **http://localhost:8080** in Chrome or Edge and click **Allow** for the camera.

Opening `index.html` by double-clicking won't work, because browsers only allow the camera on `localhost` or `https` pages.

### Hand tracking feels off?
On each game's setup screen, pick **✋ Hands: 🐢 Steady / 🙂 Normal / ⚡ Quick**. Steady = calmest circles, Quick = least delay. The choice is remembered.
During a game, press **D** to show the debug overlay (raw tracker points in red, camera fps, tracker speed).

### Code layout
- `js/main.js` – menu, round flow (ready → countdown → play → results), HUD
- `js/tracker.js` – camera + pose tracking; One Euro filter + deadband + glide for steady hands (3 presets)
- `electron/` – Windows app wrapper and icon; `scripts/` – offline file prep and icon generator
- `js/fx.js` – drawing, sounds, voice, particles
- `js/games/*.js` – one file per game; add a new game by copying one and listing it in `main.js`
