import { bestRun } from './autopilot.js';

/**
 * Daily challenge: one generated track per calendar day, the same for everyone
 * (it is built from a seed made from the date). Each candidate track is driven by the
 * autopilot first; only tracks it can finish cleanly are used, and its time sets par.
 */

const FIRST_DAY = Date.UTC(2026, 10, 27);   // daily #1
const BALLS = ['wood', 'rock', 'iron', 'paper', 'wood', 'rock', 'iron'];   // by weekday, Sunday first

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayNumber(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - FIRST_DAY) / 86400000) + 1;
}

/** Whole days from key a to key b. */
export function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds the plan (a list of builder calls) for one seed; `easy` drops the timing pieces. */
function plan(rand, easy) {
  const r = (lo, hi) => lo + rand() * (hi - lo);
  const ri = (lo, hi) => Math.floor(r(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const q = (x) => Math.round(x * 10) / 10;
  const w = () => q(r(1.2, 2.2));

  const steps = [['start', 4]];
  let heading = 0;   // degrees, kept within -90..90 so the track keeps heading up the screen
  const pieces = {
    straight: () => [['straight', ri(5, 9), w(), { gems: ri(1, 3), zig: rand() < 0.4 ? 0.4 : 0 }]],
    turn: () => {
      const opts = [];
      for (const d of [-90, -45, 45, 90]) {
        const h = heading + d;
        if (Math.abs(h) <= 90 && !(Math.abs(d) === 90 && heading !== 0)) opts.push(d);
      }
      const d = pick(opts);
      heading += d;
      const size = q(r(2.5, 3.2));
      return [['corner', size, d, { gem: rand() < 0.5 }], ['straight', ri(4, 6), w(), { gems: ri(1, 2) }]];
    },
    boost: () => { const ww = w(); return [['boost', 3, ww], ['straight', ri(8, 10), ww, { gems: ri(2, 4), zig: 0.5 }]]; },
    jump: () => [['straight', 3, 1.8], ['jump', 2, 1.8, { gem: true }], ['gap', 1.5, pick([0, 0.6])], ['straight', 6, 2.2, { gems: 2 }]],
    rampUp: () => { const ww = w(); return [['ramp', ri(5, 6), q(r(1, 1.5)), ww, { gems: 2 }], ['straight', 3, ww]]; },
    rampDown: () => { const ww = w(); return [['ramp', 6, q(-r(1.5, 2)), ww, { gems: 2 }], ['straight', 4, ww]]; },
    crumble: () => [['crumble', ri(6, 8), q(r(1.4, 1.8)), ri(4, 5), { gems: 2 }], ['straight', 3, 1.8]],
    rails: () => [['straight', 2, 1.6], ['rails', ri(6, 8), { gems: 2 }], ['straight', 3, 1.6]],
    drop: () => [['straight', 4, 1.8], ['gap', 1.0, q(r(1, 1.2)), { gem: true }], ['straight', 5, 1.8, { gems: 1 }]],
    sweeper: () => [['sweeper', 5, 2.4, { spin: pick([-1, 1]) * q(r(1.2, 1.6)), gems: 2, zig: 0.8 }], ['straight', 3, 2]],
    slider: () => [['slider', 4, 1.6, q(r(1, 1.2)), q(r(3.4, 4.2))], ['straight', 3, 2, { gems: 1 }]],
  };
  const pool = ['straight', 'turn', 'turn', 'turn', 'boost', 'jump', 'rampUp', 'rampDown', 'crumble', 'rails', 'drop'];
  if (!easy) pool.push('sweeper', 'slider');

  const count = ri(9, 12);
  let last = null;
  steps.push(...pieces.straight());
  for (let i = 0; i < count; i++) {
    let k;
    do k = pick(pool); while (k === last && k !== 'turn');
    last = k;
    steps.push(...pieces[k]());
    if (i % 4 === 3 && i < count - 1) steps.push(['checkpoint', 3]);
  }
  steps.push(['straight', 4, 2], ['goal', 4]);
  return steps;
}

const cache = new Map();

/** The level definition for a date key ('2026-11-27'), with par and dev times set by the autopilot. */
export function dailyLevel(key = todayKey()) {
  if (cache.has(key)) return cache.get(key);
  const day = new Date(`${key}T12:00:00`).getDay();
  const ball = BALLS[day];
  const seed = hash(`beam-roller/${key}`);
  let def = null;
  for (let attempt = 0; attempt < 30 && !def; attempt++) {
    const steps = plan(mulberry32(seed + attempt * 7919), attempt >= 20);
    const cand = {
      id: `daily-${key}`,
      name: `Daily #${dayNumber(key)}`,
      ball,
      daily: true,
      build: (b) => { for (const [fn, ...args] of steps) b[fn](...args); return b; },
    };
    const run = bestRun(cand, { maxTime: 90, maxFalls: 0 });
    if (run.finished && run.falls === 0 && run.gems === run.totalGems) {
      cand.par = Math.max(10, Math.round(run.time * 1.8));
      cand.dev = Math.ceil(run.time * 1.25 * 2) / 2;
      def = cand;
    }
  }
  cache.set(key, def);
  return def;
}
