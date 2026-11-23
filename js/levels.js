// Each level is a short script for the TrackBuilder. Positive corner angle = turn left.
// The camera never rotates, so every level keeps heading "up the screen":
// the running heading always stays within -90..+90 degrees (no doubling back).
export const LEVELS = [
  {
    name: 'First Roll',
    build: (b) => b
      .start(4)
      .straight(9, 2.6)
      .corner(3, -45)
      .straight(6, 2.4)
      .corner(3, 45)
      .straight(6, 2.2)
      .checkpoint(3.5)
      .straight(4, 2)
      .corner(3, 45)
      .straight(6, 2)
      .corner(3, -45)
      .straight(6, 1.8)
      .goal(4),
  },
  {
    name: 'Narrow Path',
    build: (b) => b
      .start(4)
      .straight(6, 1.8)
      .straight(5, 1.3)
      .corner(2.5, 90)
      .straight(5, 1.1)
      .corner(2.5, -90)
      .straight(6, 1)
      .checkpoint(3)
      .straight(4, 0.9)
      .corner(2.2, -45)
      .straight(5, 0.9)
      .corner(2.2, 45)
      .straight(6, 0.8)
      .checkpoint(3)
      .ramp(6, 1.5, 1.1)
      .straight(4, 0.9)
      .goal(4),
  },
  {
    name: 'On the Rails',
    build: (b) => b
      .start(4)
      .straight(4, 1.8)
      .rails(8)
      .checkpoint(3)
      .ramp(5, 1.2, 1.4)
      .corner(2.5, 45)
      .rails(8)
      .corner(2.5, -45)
      .rails(8)
      .checkpoint(3)
      .ramp(6, -2, 1.2)
      .corner(2.5, -90)
      .rails(6)
      .corner(2.5, 90)
      .rails(10)
      .goal(4),
  },
  {
    name: 'Leap of Faith',
    build: (b) => b
      .start(4)
      .straight(7, 1.8)
      .gap(0.9, 1.2)
      .straight(5, 1.8)
      .gap(1.1, 1.2)
      .straight(4, 1.6)
      .checkpoint(3)
      .ramp(5, 1.5, 1.4)
      .gap(1.2, 2.2)
      .straight(5, 1.4)
      .corner(2.5, 45)
      .straight(4, 1.1)
      .corner(2.5, -45)
      .straight(3, 1.1)
      .gap(1.0, 1.0)
      .straight(4, 1.1)
      .checkpoint(3)
      .rails(6)
      .gap(1.0, 1.4)
      .straight(5, 1.2)
      .goal(4),
  },
  {
    name: 'Moving Parts',
    build: (b) => b
      .start(4)
      .straight(5, 1.4)
      .slider(5, 1.6, 1.3, 4.2)
      .straight(3, 2)
      .checkpoint(3)
      .lift(4, 2.4, 2, 4)
      .straight(5, 1.0)
      .corner(2.5, -45)
      .slider(4, 1.2, 1.0, 3.4)
      .straight(2.5, 1.6)
      .slider(4, 1.2, 1.0, 3.4, Math.PI)
      .corner(2.5, 45)
      .checkpoint(3)
      .rails(6)
      .ramp(5, 1.5, 1)
      .straight(3, 0.8)
      .goal(4),
  },
];
