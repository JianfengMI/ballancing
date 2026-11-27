import * as THREE from 'three';
import { Solid, BALL_R } from './physics.js';

const UP = new THREE.Vector3(0, 1, 0);
const THICK = 0.5;
const RAIL = 0.14;       // rail cross-section
const RAIL_GAP = 0.5;    // rail centre-to-centre distance
// Lift the rails a little so the ball's height on rails roughly matches flat beams
// (it sits lower between two rails), halving the bump at each transition.
const INNER = (RAIL_GAP - RAIL) / 2;
const RAIL_LIFT = (BALL_R - Math.sqrt(BALL_R * BALL_R - INNER * INNER)) / 2;
const GUARD_T = 0.14;    // corner guard wall thickness
const GUARD_H = 0.45;    // ...and height above the pad
const GEM_H = BALL_R + 0.05;   // gems float at ball-centre height
const G = 22;

/**
 * "Turtle" style builder: a cursor (position on the top surface + heading) walks
 * forward, laying down track pieces. yaw = 0 faces -Z; positive yaw turns left.
 *
 * Most pieces accept `opts` for gems: { gems: count, lane: sideways offset, zig: alternate ±zig }.
 */
export class TrackBuilder {
  constructor() {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.solids = [];
    this.checkpoints = [];
    this.markers = [];
    this.gems = [];
    this.spawn = null;
    this.guardCorners = false;
    this._guards = [];
  }

  /** From here on, corners get low walls on their outer side so the ball can't overshoot. */
  guarded(on = true) { this.guardCorners = on; return this; }

  get fwd() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  _advance(d) { this.pos.addScaledVector(this.fwd, d); }

  _flat(len, w, kind, { h = THICK, lateral = 0, lift = 0, motion = null, extra = {} } = {}) {
    const c = this.pos.clone().addScaledVector(this.fwd, len / 2).addScaledVector(this.right, lateral);
    c.y += lift - h / 2;
    const s = new Solid({ center: c, size: new THREE.Vector3(w, h, len), yaw: this.yaw, kind, motion, ...extra });
    this.solids.push(s);
    return s;
  }

  /** Gems spread evenly along the next `len` of track (call before advancing). */
  _gemsAlong(len, opts = {}, rise = 0) {
    const { gems = 0, lane = 0, zig = 0 } = opts;
    for (let i = 0; i < gems; i++) {
      const t = (i + 0.5) / gems;
      const side = lane + (zig ? (i % 2 ? -zig : zig) : 0);
      this.gem(len * t, side, rise * t);
    }
  }

  /** A single gem relative to the cursor. */
  gem(forward = 0, lateral = 0, up = 0) {
    this.gems.push(this.pos.clone().addScaledVector(this.fwd, forward).addScaledVector(this.right, lateral).add(new THREE.Vector3(0, GEM_H + up, 0)));
    return this;
  }

  start(size = 4) {
    this._flat(size, size, 'start');
    this._advance(size / 2);
    this.spawn = { pos: this.pos.clone(), yaw: this.yaw };
    this._advance(size / 2);
    return this;
  }

  straight(len, w = 1.6, opts) {
    this._gemsAlong(len, opts);
    this._flat(len, w, 'beam');
    this._advance(len);
    return this;
  }

  /** Sloped beam; negative rise goes downhill. */
  ramp(len, rise, w = 1.6, opts) {
    this._gemsAlong(len, opts, rise);
    const L = Math.hypot(len, rise);
    const pitch = Math.atan2(rise, len);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, this.yaw, 0, 'YXZ'));
    const localUp = UP.clone().applyQuaternion(q);
    const c = this.pos.clone().addScaledVector(this.fwd, len / 2);
    c.y += rise / 2;
    c.addScaledVector(localUp, -THICK / 2);
    this.solids.push(new Solid({ center: c, size: new THREE.Vector3(w, THICK, L), yaw: this.yaw, pitch, kind: 'beam' }));
    this._advance(len);
    this.pos.y += rise;
    return this;
  }

  /** Empty space; `drop` lowers the next piece. opts.gem puts a gem in the gap. */
  gap(len, drop = 0, opts = {}) {
    if (opts.gem) this.gem(len / 2, 0, -0.1 - drop * 0.15);
    this._advance(len);
    this.pos.y -= drop;
    return this;
  }

  /** Square pad, then turn by `deg` (positive = left). opts.gem puts a gem in the middle. */
  corner(size, deg, opts = {}) {
    const center = this.pos.clone().addScaledVector(this.fwd, size / 2);
    this._flat(size, size, 'pad');
    const guard = opts.guard ?? this.guardCorners;
    if (guard && deg) this._guards.push({ center, size, deg, yawIn: this.yaw, next: this.solids.length });
    this._advance(size / 2);
    if (opts.gem) this.gem();
    this.yaw += (deg * Math.PI) / 180;
    this._advance(size / 2);
    return this;
  }

  checkpoint(size = 3) {
    this._flat(size, size, 'checkpoint');
    this._advance(size / 2);
    const cp = { pos: this.pos.clone(), yaw: this.yaw };
    this.checkpoints.push(cp);
    this.markers.push({ type: 'checkpoint', pos: cp.pos, yaw: this.yaw, index: this.checkpoints.length - 1 });
    this._advance(size / 2);
    return this;
  }

  goal(size = 4) {
    this._buildGuards();
    this._flat(size, size, 'goal');
    this._advance(size / 2);
    this.markers.push({ type: 'goal', pos: this.pos.clone(), yaw: this.yaw });
    this._advance(size / 2);
    return this;
  }

  /**
   * Guard walls for corners, built once the piece after each corner is known (so the
   * walls leave its whole width open). Walls: the pad's outer side, its far edge up to
   * the exit path, and for angled turns a short rail along the exit's outer edge.
   */
  _buildGuards() {
    for (const g of this._guards) {
      const exit = this.solids[g.next];
      if (!exit) continue;
      // keep at least a ball's width (plus a margin) clear, even on narrow exits and rails
      const w = Math.max(exit.kind === 'rail' ? RAIL_GAP + RAIL : exit.half.x * 2, 2 * BALL_R + 0.3);
      const s = g.size, half = s / 2, T = GUARD_T;
      const o = Math.sign(g.deg);                     // left turn -> outer side is to the right
      const yawOut = g.yawIn + (g.deg * Math.PI) / 180;
      const f = new THREE.Vector3(-Math.sin(g.yawIn), 0, -Math.cos(g.yawIn));
      const side = new THREE.Vector3(Math.cos(g.yawIn), 0, -Math.sin(g.yawIn)).multiplyScalar(o);
      const d = new THREE.Vector3(-Math.sin(yawOut), 0, -Math.cos(yawOut));
      const sideOut = new THREE.Vector3(Math.cos(yawOut), 0, -Math.sin(yawOut)).multiplyScalar(o);
      const y = g.center.y + GUARD_H / 2;
      const wall = (c, len, yaw) => {
        c.y = y;
        this.solids.push(new Solid({ center: c, size: new THREE.Vector3(T, GUARD_H, len), yaw, kind: 'guard' }));
      };

      // outer side edge, full length
      wall(g.center.clone().addScaledVector(side, half - T / 2), s, g.yawIn);

      // far edge, from the outer corner to where the exit path's outer edge crosses it
      const db = d.dot(f), da = d.dot(side);
      let a0 = -half, t1 = null;
      if (Math.abs(db) > 1e-3) {
        t1 = (half - T - (w / 2) * sideOut.dot(f)) / db;
        a0 = Math.max(-half, t1 * da + (w / 2) * sideOut.dot(side) + 0.05);
      }
      if (half - a0 > 0.2) {
        wall(g.center.clone().addScaledVector(f, half - T / 2).addScaledVector(side, (a0 + half) / 2), half - a0, g.yawIn + Math.PI / 2);
      }

      // angled turns: carry the guard a little way along the exit's outer edge
      if (t1 !== null && !exit.dynamic) {
        const t2 = half + Math.min(1.2, exit.half.z * 2);
        if (t2 - t1 > 0.2) {
          wall(g.center.clone().addScaledVector(d, (t1 + t2) / 2).addScaledVector(sideOut, w / 2 + T / 2), t2 - t1, yawOut);
        }
      }
    }
    this._guards.length = 0;
  }

  /** Two thin parallel rails the ball rides between. */
  rails(len, opts) {
    this._gemsAlong(len, opts);
    for (const side of [-1, 1]) {
      this._flat(len, RAIL, 'rail', { h: RAIL, lateral: (side * RAIL_GAP) / 2, lift: RAIL_LIFT });
    }
    this._advance(len);
    return this;
  }

  /** Beam sliding side to side; you have to time it. */
  slider(len, w, amp, period, phase = 0) {
    this._flat(len, w, 'moving', { motion: { axis: this.right, amp, period, phase } });
    this._advance(len);
    return this;
  }

  /** Elevator platform that carries the ball up by `rise`. */
  lift(len, w, rise, period, phase = -Math.PI / 2) {
    this._flat(len, w, 'moving', { lift: rise / 2, motion: { axis: UP.clone(), amp: rise / 2, period, phase } });
    this._advance(len);
    this.pos.y += rise;
    return this;
  }

  /** Speed strip: pushes the ball forward fast. */
  boost(len, w = 1.6, opts) {
    this._gemsAlong(len, opts);
    this._flat(len, w, 'boost');
    this._advance(len);
    return this;
  }

  /**
   * Jump pad: launches the ball forward at `launch` speed with upward speed `power`.
   * Flight covers about 2*power/22*launch (~4.6 with defaults), so follow it with gap(<=2).
   * opts.gem puts a gem at the top of the arc.
   */
  jump(len = 2, w = 1.6, opts = {}) {
    const { power = 8.5, launch = 6, gem = false } = opts;
    this._flat(len, w, 'jump', { extra: { jump: { power, launch } } });
    if (gem) {
      const tUp = power / G;
      this.gem(0.3 + launch * tUp, 0, (power * power) / (2 * G));
    }
    this._advance(len);
    return this;
  }

  /** A run of tiles that drop shortly after the ball touches them. Don't stop! */
  crumble(len, w = 1.6, tiles = 4, opts) {
    this._gemsAlong(len, opts);
    const tl = len / tiles;
    for (let i = 0; i < tiles; i++) {
      this._flat(tl, w, 'crumble');
      this._advance(tl);
    }
    return this;
  }

  /** Beam with a rotating arm that knocks the ball away. Negative spin = clockwise. */
  sweeper(len, w = 2.4, opts = {}) {
    const { spin = 1.6, phase = 0 } = opts;
    this._gemsAlong(len, opts);
    this._flat(len, w, 'beam');
    const mid = this.pos.clone().addScaledVector(this.fwd, len / 2);
    // One arm, like a turnstile, pivoting on a central post: time your run past it.
    const armLen = Math.min(w, len) / 2 + 0.25;
    const pivot = mid.clone().add(new THREE.Vector3(0, 0.32, 0));
    const arm = new Solid({
      center: pivot.clone(), size: new THREE.Vector3(armLen, 0.3, 0.24),
      yaw: this.yaw, kind: 'sweeper', spin, phase, pivot, armOffset: armLen / 2 + 0.1,
    });
    arm.update(0);
    this.solids.push(arm);
    this.solids.push(new Solid({
      center: mid.clone().add(new THREE.Vector3(0, 0.45, 0)),
      size: new THREE.Vector3(0.3, 0.9, 0.3),
      yaw: this.yaw, kind: 'post',
    }));
    this._advance(len);
    return this;
  }
}

// ---------- meshes ----------

const MATS = {
  start: { color: 0x56618a, roughness: 0.7 },
  pad: { color: 0x56618a, roughness: 0.7 },
  beam: { color: 0x5b6cff, roughness: 0.45, metalness: 0.1 },
  rail: { color: 0xd4dae6, roughness: 0.25, metalness: 0.85 },
  guard: { color: 0xffc94d, roughness: 0.3, metalness: 0.6, emissive: 0x3a2800 },
  checkpoint: { color: 0x17b3a6, roughness: 0.5, emissive: 0x0a3d39 },
  goal: { color: 0x2ecc71, roughness: 0.4, emissive: 0x0f4d2a },
  moving: { color: 0xff9f43, roughness: 0.5, emissive: 0x3d1f00 },
  boost: { color: 0x22d3ee, roughness: 0.4, emissive: 0x0b4f5c },
  jump: { color: 0xff4fd8, roughness: 0.4, emissive: 0x5c0f4c },
  crumble: { color: 0xc8a27a, roughness: 0.95 },
  sweeper: { color: 0xff3b5c, roughness: 0.35, emissive: 0x4a0010 },
  post: { color: 0xe8e8f0, roughness: 0.4, metalness: 0.6 },
};
const EDGE_COLORS = {
  start: 0x9aa6d6, pad: 0x9aa6d6, beam: 0xaab4ff, rail: 0xffffff, guard: 0xfff0b3,
  checkpoint: 0x7ff5ea, goal: 0xa8ffcb, moving: 0xffd2a3,
  boost: 0xa5f3fc, jump: 0xffb3f0, crumble: 0x6b4f33, sweeper: 0xffc2cc, post: 0xffffff,
};

const materialCache = {};
function mat(kind) {
  if (!materialCache[kind]) materialCache[kind] = new THREE.MeshStandardMaterial(MATS[kind] || MATS.beam);
  return materialCache[kind];
}
const edgeMatCache = {};
function edgeMat(kind) {
  if (!edgeMatCache[kind]) {
    edgeMatCache[kind] = new THREE.LineBasicMaterial({ color: EDGE_COLORS[kind] || 0xffffff, transparent: true, opacity: 0.55 });
  }
  return edgeMatCache[kind];
}

/** Chevron texture for boost strips; arrows point toward texture v=1 (the piece's forward end). */
function chevronTexture(color, bg) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = color;
  g.lineWidth = 9;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(12, 44); g.lineTo(32, 22); g.lineTo(52, 44);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export const animatedTextures = [];

function boostMaterials(s) {
  const tex = chevronTexture('#e0fbff', '#0e7490');
  tex.repeat.set(1, Math.max(1, Math.round((s.half.z * 2) / (s.half.x * 2) * 1.5)));
  animatedTextures.push(tex);
  const top = new THREE.MeshStandardMaterial({ map: tex, emissive: 0x0b4f5c, emissiveMap: tex, roughness: 0.4 });
  const side = mat('boost');
  return [side, side, top, side, side, side];
}

/** Builds a THREE.Group for the level. */
export function buildMeshes(track) {
  animatedTextures.length = 0;
  const group = new THREE.Group();
  for (const s of track.solids) {
    const geo = new THREE.BoxGeometry(s.half.x * 2, s.half.y * 2, s.half.z * 2);
    const mesh = new THREE.Mesh(geo, s.kind === 'boost' ? boostMaterials(s) : mat(s.kind));
    mesh.position.copy(s.center);
    // Diagonal beams overlap corner pads; sink pads a hair (visual only) to avoid z-fighting.
    if (s.kind === 'pad') mesh.position.y -= 0.004;
    mesh.quaternion.copy(s.quat);
    mesh.receiveShadow = true;
    mesh.castShadow = s.kind !== 'rail';
    if (s.kind !== 'rail' && s.kind !== 'boost') mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(s.kind)));
    if (s.kind === 'jump') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(Math.min(s.half.x, s.half.z) * 0.6, 0.06, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffb3f0 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = s.half.y + 0.02;
      mesh.add(ring);
    }
    s.mesh = mesh;
    group.add(mesh);
  }

  const checkpointMarkers = [];
  let goalMarker = null;
  for (const m of track.markers) {
    if (m.type === 'checkpoint') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.1, 0.07, 10, 40),
        new THREE.MeshStandardMaterial({ color: 0x40e0d0, emissive: 0x1a8a80, roughness: 0.3 })
      );
      ring.position.copy(m.pos).add(new THREE.Vector3(0, 1.15, 0));
      ring.rotation.y = m.yaw;
      group.add(ring);
      checkpointMarkers.push(ring);
    } else if (m.type === 'goal') {
      const g = new THREE.Group();
      g.position.copy(m.pos);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.4, 14, 32, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x5dff9e, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
      );
      beam.position.y = 7;
      g.add(beam);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.4, 0.08, 10, 48),
        new THREE.MeshBasicMaterial({ color: 0x8dffbd })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);
      group.add(g);
      goalMarker = g;
    }
  }

  const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
  const gemMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0x8a5a00, roughness: 0.2, metalness: 0.4, flatShading: true });
  const gems = track.gems.map((p, i) => {
    const mesh = new THREE.Mesh(gemGeo, gemMat);
    mesh.position.copy(p);
    mesh.castShadow = true;
    group.add(mesh);
    return { pos: p, mesh, taken: false, phase: i * 0.7 };
  });

  return { group, checkpointMarkers, goalMarker, gems };
}
