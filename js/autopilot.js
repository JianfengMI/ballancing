import * as THREE from 'three';
import { Ball, BALL_R, MAX_SPEED, surfaceEffects } from './physics.js';
import { TrackBuilder } from './track.js';
import { MATERIALS } from './materials.js';

/**
 * Headless run of a level by a simple driver that follows the track's centre-line
 * (detouring through the gems). It uses the same physics and frame loop as the game,
 * so it tells us whether a track can be finished and roughly how fast. Used to vet
 * generated daily tracks and to set their par / dev times.
 */

const FRAME = 1 / 60;
const STEP = 1 / 240;
const GEM_RADIUS = 0.7;

function buildRoute(track) {
  // centre-line, then gems slotted in by how far along the line they sit
  const pts = [];
  for (const p of track.path) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-3) pts.push({ x: p.x, z: p.z });
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const project = (x, z) => {
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < best.d) best = { d, s: cum[i] + t * Math.sqrt(L2) };
    }
    return best.s;
  };
  const items = pts.map((p, i) => ({ ...p, s: cum[i] }));
  for (const g of track.gems) items.push({ x: g.x, z: g.z, s: project(g.x, g.z) + 1e-4, gem: true });
  items.sort((a, b) => a.s - b.s);
  // re-measure along the detoured route
  const route = [items[0]];
  route[0].r = 0;
  for (let i = 1; i < items.length; i++) {
    const p = items[i], q = route[route.length - 1];
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < 1e-3) continue;
    route.push({ ...p, r: q.r + d });
  }
  return route;
}

class Route {
  constructor(pts) { this.p = pts; this.k = 0; this.s = 0; this.len = pts[pts.length - 1].r; }
  at(r) {
    const p = this.p;
    r = Math.max(0, Math.min(this.len, r));
    let i = this.k;
    while (i > 0 && p[i].r > r) i--;
    while (i < p.length - 2 && p[i + 1].r < r) i++;
    const a = p[i], b = p[i + 1];
    const t = (r - a.r) / (b.r - a.r || 1);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  /** Track progress near the current segment (never jumps far back or ahead). */
  follow(x, z) {
    const p = this.p;
    let best = Infinity;
    for (let i = Math.max(0, this.k - 1); i < Math.min(p.length - 1, this.k + 5); i++) {
      const a = p[i], b = p[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < best) { best = d; this.k = i; this.s = a.r + t * (b.r - a.r); }
    }
  }
  reset(x, z) {
    let best = Infinity, k = 0;
    for (let i = 0; i < this.p.length - 1; i++) {
      const d = Math.hypot(this.p[i].x - x, this.p[i].z - z);
      if (d < best) { best = d; k = i; }
    }
    this.k = k;
    this.follow(x, z);
  }
}

const angle = (a, b) => {
  const d = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  return Math.abs(d);
};

/**
 * Runs `def` (a level definition with build + ball) and returns
 * { finished, time, falls, gems, totalGems }.
 */
export function autopilot(def, { maxTime = 120, maxFalls = 6, cautious = 1, style = 'pursuit', log = null } = {}) {
  const track = new TrackBuilder();
  def.build(track);
  const mat = MATERIALS[def.ball] || MATERIALS.wood;
  const ball = new Ball();
  ball.setMaterial(mat);
  const solids = track.solids;
  const movers = solids.filter((s) => s.motion || s.spin);
  const crumbles = solids.filter((s) => s.kind === 'crumble');
  let minY = Infinity;
  for (const s of solids) minY = Math.min(minY, s.center.y - s.half.y);
  const route = new Route(buildRoute(track));
  const gems = track.gems.map((p) => ({ p, taken: false }));

  let cp = -1, simTime = 0, runTime = 0, falls = 0, accum = 0;
  const respawn = () => {
    const sp = cp >= 0 ? track.checkpoints[cp] : track.spawn;
    ball.reset(sp.pos.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
    for (const s of crumbles) s.resetCrumble();
    route.reset(ball.pos.x, ball.pos.z);
  };
  for (const s of movers) s.update(0);
  respawn();

  const world = { x: 0, z: 0 };
  while (runTime < maxTime) {
    simTime += FRAME;
    runTime += FRAME;
    for (const s of movers) s.update(simTime);
    if (ball.ground && ball.ground.motion) ball.pos.add(ball.ground.delta);

    // --- driver ---
    route.follow(ball.pos.x, ball.pos.z);
    const sp = Math.hypot(ball.vel.x, ball.vel.z);
    const s = route.s;
    // slow for turns ahead, braking early enough for this ball (heavy balls stop slowly)
    let want = MAX_SPEED;
    for (let d = 0; d <= 12; d += 0.5) {
      const p0 = route.at(s + d - 1), p1 = route.at(s + d + 1), p2 = route.at(s + d + 3.5);
      const turn = angle({ x: p1.x - p0.x, z: p1.z - p0.z }, { x: p2.x - p1.x, z: p2.z - p1.z });
      const vTurn = MAX_SPEED - Math.min(1, turn / (Math.PI / 2)) * 5.5;
      want = Math.min(want, Math.sqrt(vTurn * vTurn + 2 * mat.accel * 0.6 * d));
    }
    want /= cautious;
    let ix, iz;
    if (style === 'line') {
      // follow the line: head along it, plus a pull back toward it
      const here = route.at(s), ahead = route.at(s + 0.4 + 0.08 * sp), back = route.at(s - 0.4);
      let tx = ahead.x - back.x, tz = ahead.z - back.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      ix = tx * want + (here.x - ball.pos.x) * 4 - ball.vel.x;
      iz = tz * want + (here.z - ball.pos.z) * 4 - ball.vel.z;
    } else {
      // pursuit: head for a point a little way ahead on the line
      const tgt = route.at(s + 1.1 + 0.16 * sp);
      const dx = tgt.x - ball.pos.x, dz = tgt.z - ball.pos.z, dl = Math.hypot(dx, dz) || 1;
      ix = (dx / dl) * want - ball.vel.x;
      iz = (dz / dl) * want - ball.vel.z;
    }
    const il = Math.hypot(ix, iz) * 0.9;
    if (il > 1) { ix /= il; iz /= il; } else { ix *= 0.9; iz *= 0.9; }
    world.x = ix; world.z = iz;

    accum += FRAME;
    while (accum >= STEP) { ball.step(STEP, world, solids); accum -= STEP; }
    surfaceEffects(ball, solids, FRAME);

    for (const g of gems) if (!g.taken && g.p.distanceTo(ball.pos) <= GEM_RADIUS) g.taken = true;
    for (let i = cp + 1; i < track.checkpoints.length; i++) {
      const p = track.checkpoints[i].pos;
      if (Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z) < 1.4 && Math.abs(ball.pos.y - p.y) < 1.5) cp = i;
    }
    if (ball.ground && ball.ground.kind === 'goal') {
      return { finished: true, time: runTime, falls, gems: gems.filter((g) => g.taken).length, totalGems: gems.length };
    }
    if (ball.pos.y < minY - 6) {
      if (log) log(`fall at ${route.s.toFixed(1)}/${route.len.toFixed(1)} on ${ball.prevGroundKind} after cp ${cp}`);
      if (++falls > maxFalls) break;
      simTime += 0.9;
      for (const s2 of movers) s2.update(simTime);
      respawn();
    }
  }
  return { finished: false, time: runTime, falls, gems: gems.filter((g) => g.taken).length, totalGems: gems.length };
}

const STYLES = [
  { style: 'pursuit', cautious: 1 }, { style: 'line', cautious: 1 },
  { style: 'pursuit', cautious: 1.3 }, { style: 'line', cautious: 1.3 },
  { style: 'pursuit', cautious: 1.7 }, { style: 'line', cautious: 1.7 },
];

/**
 * Tries a few driving styles; returns the best run (finished beats not, then fewest
 * falls, then fastest). Stops early once a clean, all-gems run is found.
 */
export function bestRun(def, opts = {}) {
  let best = null;
  for (const st of STYLES) {
    const r = autopilot(def, { ...opts, ...st });
    const key = (x) => [x.finished ? 0 : 1, x.falls, x.totalGems - x.gems, x.time];
    if (!best || cmp(key(r), key(best)) < 0) best = r;
    if (r.finished && r.falls === 0 && r.gems === r.totalGems) break;
  }
  return best;
}
function cmp(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; }
