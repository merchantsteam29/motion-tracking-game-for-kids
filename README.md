# motion-tracking-game
for kids and exersizing kids

## Move & Play 🏃🤸
Webcam workout games for kids. Easy / Medium / Hard levels for mixed ages. Nothing is saved, and the camera picture never leaves the device.

| Game | How to play |
|---|---|
| 🚀 **Dodge & Duck** | Step side to side to dodge space rocks, squat under the rainbow when it says DUCK!, reach up for stars |
| 🫧 **Bubble Pop** | Pop bubbles with your hands; golden bubbles up high are worth 3; pop fast for combos |
| ⭐ **Jumping Jacks** | Counts your reps out loud as your arms go up and down; reach the goal for a trophy |
| 🗣️ **Simon Says** | Copy the pose in the picture and hold it; on Medium/Hard, don't move unless "Simon says"! |

Body tracking uses [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) (free, runs in the browser).

### Run it
1. Install [Node.js](https://nodejs.org) (free).
2. In this folder, run: `node server.js`
3. Open **http://localhost:8080** in Chrome or Edge and click **Allow** when it asks to use the camera.

Opening `index.html` by double-clicking won't work, because browsers only allow the camera on `localhost` or `https` pages.

### Code layout
- `js/main.js` – menu, round flow (ready → countdown → play → results), HUD
- `js/tracker.js` – camera + pose tracking, smoothing (One Euro filter) and hand stabilization
- `js/fx.js` – drawing, sounds, voice, particles
- `js/games/*.js` – one file per game; add a new game by copying one and listing it in `main.js`
