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
| 🪢 **Jump Rope** | Jump each time the swinging rope reaches your feet; keep the streak going |
| 🌙 **Moon Squats** | Every squat fuels a rocket: Clouds → Space → the Moon → Mars → Jupiter → the Stars |
| ⛷️ **Ski Slalom** | Step left and right to ski between the flags and miss the trees |
| 🧽 **Window Wash** | Wipe the muddy window with big arm circles to reveal the picture |
| 🥊 **Boxing Pads** | Punch the pads fast as they pop up (slow touches don't count) |

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

### Settings (⚙️ on the menu)
Saved on each device:
- **🧒 Age**: uses average height and body proportions for that age, so targets, squats, knee lifts
  and jumping-jack feet fit the player; shows how far back to stand and recommends a level
- **👆 Finger mode**: play every game by touching the screen, no camera (two fingers = two hands)
- Game length, calm mode, sound effects, talking voice, volume, hand circles (Steady / Normal / Quick),
  camera choice, mirror picture, show camera picture, tracking info (**D** also toggles it)

### Results
Each round earns 1–3 ⭐ and saves a personal best per game and level ("🏆 New record!").
Pause any time with ⏸ (or **P** / **Esc**); switching apps pauses automatically.

### Code layout
- `js/main.js` – menu, round flow (ready → countdown → play → results), HUD
- `js/tracker.js` – camera + pose tracking; One Euro filter + deadband + glide for steady hands (3 presets)
- `electron/` – Windows app wrapper and icon; `scripts/` – offline file prep and icon generator
- `js/fx.js` – drawing, sounds, voice, particles
- `js/settings.js` / `js/settings-ui.js` – saved settings and the Settings screen
- `js/profile.js` – age → average height, body proportions, stand distance
- `js/progress.js` – star ratings and personal bests
- `js/games/*.js` – one file per game; add a new game by copying one and listing it in `main.js`
