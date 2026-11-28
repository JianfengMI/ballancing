# Beam Roller

A 3D ball-balancing game in the browser (Three.js). Roll the ball along floating beams and rails to the goal without falling off.

**Play:** https://jianfengmi.github.io/ballancing/

## Gameplay
- 9 levels. Each awards up to 3 stars: finish, collect every gem, and beat the target time.
- **Dev medal** 🏅: collect every gem *and* beat a much tighter dev time.
- **Ghost:** your fastest run is replayed as a see-through ball to race against (can be turned off in the menu).
- **Splits:** each checkpoint shows how far ahead (green) or behind (red) your best run you are.
- **Score:** gems, boosts, jumps and checkpoints score points; doing them in quick succession builds a chain multiplier (up to x5). Falls cost points. Finishing adds time, no-fall and all-gem bonuses.
- **Daily challenge:** a new generated track every day, the same for everyone. Your first finish is your official result (with how many tries it took); later runs are practice. Keep a daily streak going and share your result with friends.
- Easy levels (1-4) have guard walls on the outside of corners.
- **Path guide:** a blue band ahead of the ball shows where your tilt and speed are taking it (can be turned off in the menu).
- The ball changes material as the levels get harder, and each one handles differently:
  - **Wood** (levels 1-2): steady and easy to steer.
  - **Rock** (3-4): heavy, slower to get going and keeps rolling when you let go.
  - **Iron** (5-6): very heavy, hard to stop, barely moved by sweepers, makes crumbling tiles fall sooner.
  - **Paper** (7-9): light and twitchy, bouncy, knocked far by sweepers, drifts in the breeze.
- Track pieces: beams, rails, ramps, gaps, boost strips, jump pads, crumbling tiles, rotating sweeper arms, sliding platforms and lifts.
- Sound effects (synthesised, no audio files), particles, camera shake and vibration (Android).

## Controls
- **Desktop:** arrow keys or WASD. `Esc`/`P` pauses, `R` restarts, `Enter` goes to the next level after a win.
- **Phone (portrait):** tilt the phone. The angle you hold it at when a level starts is treated as level; use the recalibrate button (top right) to reset it. You can switch to touch-drag in the menu.

Tilt controls require HTTPS (GitHub Pages provides it). On iPhone, allow motion access when asked.

## Run locally
Serve the folder with any static server, e.g. `npx http-server -c-1`, then open http://localhost:8080.

## Android app
The Android app wraps the same web files with [Capacitor](https://capacitorjs.com) (project in `android/`, portrait only; the back button pauses, resumes, or exits from the menu).
1. Install [Android Studio](https://developer.android.com/studio) (it includes the JDK and Android SDK).
2. `npm install`, then `npm run sync` after every change to the game. It copies `index.html`, `style.css`, `js/` and `vendor/` into `www/` and from there into the Android project.
3. `npm run open:android` opens the project in Android Studio; run it on a phone or emulator from there.

## Roadmap
**First Google Play release** (Android app only; the web version stays ad-free)
- Google Play Games leaderboards: per-level best time and high score, daily challenge.
- AdMob with consent (UMP). Rewarded ads are always the player's choice and never improve a leaderboard result:
  - **Streak saver:** watch an ad to keep your daily streak after missing a day.
  - **Watch a pro run:** the autopilot shows a clean run of the level (or races you as a gold ghost).
  - **Cosmetic trails:** unlock ball trails and finish effects. They change looks only, never handling.
- An occasional interstitial between levels; no banners.

**First update: track editor**
- Build your own track piece by piece (straight, corners, ramp, gap, boost, ...) in the same step format the daily challenge uses.
- Play it yourself or send it to friends as a share code with a "beat my time" challenge.
- Tracks must be finished by their creator (or vetted by the autopilot) before they can be shared.
- The editor and playing shared tracks are free; rewarded ads unlock extras (advanced pieces, more save slots, ball material choice, your trail on your ghost).

**Later**
- Links that open shared tracks directly in the app (Android app links).
- Featured community tracks (needs a server).
- More campaign levels.

## Code
- `js/physics.js` - ball physics, sphere-vs-box collisions, special surfaces (boost, jump, crumble, sweepers)
- `js/track.js` - track builder (straight, ramp, corner, rails, gaps, moving platforms) and meshes
- `js/levels.js` - level definitions (including which ball each level uses, par and dev times)
- `js/daily.js` - daily challenge track generator (seeded by the date)
- `js/autopilot.js` - headless bot that drives a level; vets daily tracks and sets their par / dev times
- `js/ghost.js` - ghost recording and playback
- `js/score.js` - score and chain rules
- `js/pathguide.js` - blue path guide showing where tilt and speed are taking the ball
- `js/materials.js` - ball materials: handling settings, textures and sounds
- `js/input.js` - keyboard, tilt and touch input
- `js/main.js` - scene, camera, game loop and UI
- `js/minimap.js` - top-down track map
- `js/audio.js` - synthesised sound effects
- `js/particles.js` - sparkles, dust and confetti
