// Each level is a short script for the TrackBuilder. Positive corner angle = turn left.
// The camera never rotates, so every level keeps heading "up the screen":
// the running heading always stays within -90..+90 degrees (no doubling back).
// `par` is the target time (seconds) for the third star.
const PI = Math.PI;

export const LEVELS = [
  {
    id: 'first-roll',
    name: 'First Roll',
    par: 17,
    build: (b) => b
      .start(4)
      .straight(9, 2.6, { gems: 3, zig: 0.7 })
      .corner(3, -45, { gem: true })
      .straight(6, 2.4, { gems: 2, lane: 0.9 })
      .corner(3, 45)
      .straight(6, 2.2, { gems: 2 })
      .checkpoint(3.5)
      .straight(4, 2)
      .corner(3, 45, { gem: true })
      .straight(6, 2, { gems: 2, lane: -0.7 })
      .corner(3, -45)
      .straight(6, 1.8, { gems: 3, zig: 0.5 })
      .goal(4),
  },
  {
    id: 'narrow-path',
    name: 'Narrow Path',
    par: 22,
    build: (b) => b
      .start(4)
      .straight(6, 1.8, { gems: 2 })
      .straight(5, 1.3, { gems: 2, zig: 0.35 })
      .corner(2.5, 90, { gem: true })
      .straight(5, 1.1, { gems: 2 })
      .corner(2.5, -90)
      .straight(6, 1, { gems: 3 })
      .checkpoint(3)
      .straight(4, 0.9, { gems: 2 })
      .corner(2.2, -45)
      .straight(5, 0.9, { gems: 2 })
      .corner(2.2, 45, { gem: true })
      .straight(6, 0.8, { gems: 3 })
      .checkpoint(3)
      .ramp(6, 1.5, 1.1, { gems: 3 })
      .straight(4, 0.9)
      .goal(4),
  },
  {
    id: 'launch-pad',
    name: 'Launch Pad',
    par: 26,
    build: (b) => b
      .start(4)
      .straight(6, 2.2, { gems: 2 })
      .boost(4, 2.2)
      .straight(10, 2.2, { gems: 4, zig: 0.6 })
      .corner(3.5, 45)
      .straight(5, 2)
      .jump(2, 2, { gem: true })
      .gap(1.5)
      .straight(6, 2.4, { gems: 2 })
      .checkpoint(3.5)
      .boost(3, 1.8)
      .ramp(6, 2, 1.8, { gems: 3 })
      .straight(3, 1.8)
      .jump(2, 1.8, { gem: true })
      .gap(1.8, 0.6)
      .straight(6, 2.2)
      .corner(3, -45, { gem: true })
      .boost(3, 2)
      .straight(10, 1.8, { gems: 3 })
      .goal(4),
  },
  {
    id: 'on-the-rails',
    name: 'On the Rails',
    par: 24,
    build: (b) => b
      .start(4)
      .straight(4, 1.8, { gems: 2 })
      .rails(8, { gems: 3 })
      .checkpoint(3)
      .ramp(5, 1.2, 1.4, { gems: 2 })
      .corner(2.5, 45, { gem: true })
      .rails(8, { gems: 3 })
      .corner(2.5, -45)
      .rails(8, { gems: 2 })
      .checkpoint(3)
      .ramp(6, -2, 1.2, { gems: 2 })
      .corner(2.5, -90, { gem: true })
      .rails(6, { gems: 2 })
      .corner(2.5, 90)
      .rails(10, { gems: 4 })
      .goal(4),
  },
  {
    id: 'crumble-bridge',
    name: 'Crumble Bridge',
    par: 20,
    build: (b) => b
      .start(4)
      .straight(5, 2, { gems: 2 })
      .crumble(6, 1.8, 4, { gems: 2 })
      .straight(3, 1.8)
      .corner(3, 45, { gem: true })
      .crumble(8, 1.4, 5, { gems: 3, zig: 0.35 })
      .checkpoint(3)
      .straight(4, 1.4)
      .crumble(6, 1.2, 4)
      .corner(2.5, -90, { gem: true })
      .crumble(5, 1.2, 3, { gems: 2 })
      .corner(2.5, 90)
      .checkpoint(3)
      .boost(2, 1.6)
      .crumble(10, 1.6, 6, { gems: 4 })
      .goal(4),
  },
  {
    id: 'leap-of-faith',
    name: 'Leap of Faith',
    par: 25,
    build: (b) => b
      .start(4)
      .straight(7, 1.8, { gems: 2 })
      .gap(0.9, 1.2, { gem: true })
      .straight(5, 1.8, { gems: 2 })
      .gap(1.1, 1.2, { gem: true })
      .straight(4, 1.6)
      .checkpoint(3)
      .ramp(5, 1.5, 1.4, { gems: 2 })
      .gap(1.2, 2.2, { gem: true })
      .straight(5, 1.4)
      .corner(2.5, 45, { gem: true })
      .straight(4, 1.1, { gems: 2 })
      .corner(2.5, -45)
      .straight(3, 1.1)
      .gap(1.0, 1.0)
      .straight(4, 1.1)
      .checkpoint(3)
      .jump(2, 1.4, { gem: true })
      .gap(1.5)
      .straight(4, 1.4, { gems: 2 })
      .rails(6, { gems: 2 })
      .gap(1.0, 1.4, { gem: true })
      .straight(5, 1.2)
      .goal(4),
  },
  {
    id: 'sweepers',
    name: 'Sweepers',
    par: 24,
    build: (b) => b
      .start(4)
      .straight(5, 2.2, { gems: 2 })
      .sweeper(5, 2.4, { spin: 1.2, gems: 2, zig: 0.8 })
      .straight(3, 2)
      .checkpoint(3)
      .sweeper(5, 2.4, { spin: -1.4 })
      .straight(3, 1.6, { gems: 1 })
      .sweeper(5, 2.4, { spin: 1.6, phase: 1 })
      .corner(3, 45, { gem: true })
      .straight(5, 1.4, { gems: 3 })
      .checkpoint(3)
      .sweeper(6, 2.6, { spin: 1.8, gems: 2, zig: 0.9 })
      .boost(3, 2)
      .straight(8, 2, { gems: 3 })
      .goal(4),
  },
  {
    id: 'moving-parts',
    name: 'Moving Parts',
    par: 37,
    build: (b) => b
      .start(4)
      .straight(5, 1.4, { gems: 2 })
      .slider(5, 1.6, 1.3, 4.2)
      .straight(3, 2, { gems: 1 })
      .checkpoint(3)
      .lift(4, 2.4, 2, 4)
      .straight(5, 1.0, { gems: 3 })
      .corner(2.5, -45, { gem: true })
      .slider(4, 1.2, 1.0, 3.4)
      .straight(2.5, 1.6, { gems: 1 })
      .slider(4, 1.2, 1.0, 3.4, PI)
      .corner(2.5, 45)
      .checkpoint(3)
      .rails(6, { gems: 2 })
      .ramp(5, 1.5, 1, { gems: 2 })
      .straight(3, 0.8)
      .goal(4),
  },
  {
    id: 'grand-tour',
    name: 'Grand Tour',
    par: 40,
    build: (b) => b
      .start(4)
      .straight(4, 2, { gems: 2 })
      .boost(3, 2)
      .straight(8, 2, { gems: 3, zig: 0.6 })
      .jump(2, 2, { gem: true })
      .gap(1.5)
      .straight(4, 2)
      .checkpoint(3)
      .crumble(6, 1.6, 4, { gems: 2 })
      .corner(3, -45, { gem: true })
      .sweeper(5, 2.4, { spin: 1.5 })
      .straight(3, 1.6)
      .checkpoint(3)
      .rails(6, { gems: 2 })
      .slider(4, 1.6, 1.2, 3.6)
      .straight(3, 2)
      .corner(3, 45, { gem: true })
      .lift(4, 2.4, 2, 4)
      .straight(4, 1.2, { gems: 2 })
      .checkpoint(3)
      .crumble(6, 1.4, 4, { gems: 2 })
      .jump(2, 1.6, { gem: true })
      .gap(1.5, 1)
      .straight(5, 1.4, { gems: 2 })
      .goal(4),
  },
];
