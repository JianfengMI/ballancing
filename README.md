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

## Code
- `js/physics.js` - ball physics, sphere-vs-box collisions, special surfaces (boost, jump, crumble, sweepers)
- `js/track.js` - track builder (straight, ramp, corner, rails, gaps, moving platforms) and meshes
- `js/levels.js` - level definitions (including which ball each level uses, par and dev times)
- `js/daily.js` - daily challenge track generator (seeded by the date)
- `js/autopilot.js` - headless bot that drives a level; vets daily tracks and sets their par / dev times
- `js/ghost.js` - ghost recording and playback
- `js/score.js` - score and chain rules
- `js/materials.js` - ball materials: handling settings, textures and sounds
- `js/input.js` - keyboard, tilt and touch input
- `js/main.js` - scene, camera, game loop and UI
- `js/minimap.js` - top-down track map
- `js/audio.js` - synthesised sound effects
- `js/particles.js` - sparkles, dust and confetti
