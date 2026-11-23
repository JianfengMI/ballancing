// Each level is a short script for the TrackBuilder. Positive corner angle = turn left.
export const LEVELS = [
  {
    name: 'First Roll',
    build: (b) => b
      .start(4)
      .straight(10, 2.6)
      .corner(3, -90)
      .straight(8, 2.2)
      .checkpoint(3.5)
      .straight(6, 2)
      .corner(3, 90)
      .straight(8, 1.8)
      .goal(4),
  },
  {
    name: 'Narrow Path',
    build: (b) => b
      .start(4)
      .straight(6, 2)
      .straight(6, 1.4)
      .corner(2.5, 90)
      .straight(7, 1.1)
      .checkpoint(3)
      .straight(5, 0.9)
      .corner(2.2, -90)
      .straight(4, 1.2)
      .corner(2.2, -90)
      .straight(8, 0.8)
      .checkpoint(3)
      .ramp(6, 1.5, 1.2)
      .straight(4, 1)
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
      .rails(8)
      .corner(2.5, 90)
      .rails(10)
      .checkpoint(3)
      .ramp(6, -2, 1.2)
      .rails(6)
      .corner(2.5, -90)
      .rails(12)
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
      .corner(2.5, 90)
      .straight(5, 1.1)
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
      .slider(5, 1.6, 1.6, 3.2)
      .straight(3, 1.4)
      .checkpoint(3)
      .lift(4, 2.4, 2, 4)
      .straight(5, 1.0)
      .corner(2.5, -90)
      .slider(4, 1.2, 1.2, 2.6)
      .slider(4, 1.2, 1.2, 2.6, Math.PI)
      .checkpoint(3)
      .rails(6)
      .ramp(5, 1.5, 1)
      .straight(3, 0.8)
      .goal(4),
  },
];
