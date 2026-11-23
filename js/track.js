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

/**
 * "Turtle" style builder: a cursor (position on the top surface + heading) walks
 * forward, laying down track pieces. yaw = 0 faces -Z; positive yaw turns left.
 */
export class TrackBuilder {
  constructor() {
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.solids = [];
    this.checkpoints = [];
    this.markers = [];
    this.spawn = null;
  }

  get fwd() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get right() { return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  _advance(d) { this.pos.addScaledVector(this.fwd, d); }

  _flat(len, w, kind, { h = THICK, lateral = 0, lift = 0, motion = null } = {}) {
    const c = this.pos.clone().addScaledVector(this.fwd, len / 2).addScaledVector(this.right, lateral);
    c.y += lift - h / 2;
    const s = new Solid({ center: c, size: new THREE.Vector3(w, h, len), yaw: this.yaw, kind, motion });
    this.solids.push(s);
    return s;
  }

  start(size = 4) {
    this._flat(size, size, 'start');
    this._advance(size / 2);
    this.spawn = { pos: this.pos.clone(), yaw: this.yaw };
    this._advance(size / 2);
    return this;
  }

  straight(len, w = 1.6) {
    this._flat(len, w, 'beam');
    this._advance(len);
    return this;
  }

  /** Sloped beam; negative rise goes downhill. */
  ramp(len, rise, w = 1.6) {
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

  gap(len, drop = 0) {
    this._advance(len);
    this.pos.y -= drop;
    return this;
  }

  /** Square pad, then turn by `deg` (positive = left). */
  corner(size, deg) {
    this._flat(size, size, 'pad');
    this._advance(size / 2);
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
    this._flat(size, size, 'goal');
    this._advance(size / 2);
    this.markers.push({ type: 'goal', pos: this.pos.clone(), yaw: this.yaw });
    this._advance(size / 2);
    return this;
  }

  /** Two thin parallel rails the ball rides between. */
  rails(len) {
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
}

// ---------- meshes ----------

const MATS = {
  start: { color: 0x56618a, roughness: 0.7 },
  pad: { color: 0x56618a, roughness: 0.7 },
  beam: { color: 0x5b6cff, roughness: 0.45, metalness: 0.1 },
  rail: { color: 0xd4dae6, roughness: 0.25, metalness: 0.85 },
  checkpoint: { color: 0x17b3a6, roughness: 0.5, emissive: 0x0a3d39 },
  goal: { color: 0x2ecc71, roughness: 0.4, emissive: 0x0f4d2a },
  moving: { color: 0xff9f43, roughness: 0.5, emissive: 0x3d1f00 },
};
const EDGE_COLORS = {
  start: 0x9aa6d6, pad: 0x9aa6d6, beam: 0xaab4ff, rail: 0xffffff,
  checkpoint: 0x7ff5ea, goal: 0xa8ffcb, moving: 0xffd2a3,
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

/** Builds a THREE.Group for the level. Returns { group, checkpointMarkers, goalMarker }. */
export function buildMeshes(track) {
  const group = new THREE.Group();
  for (const s of track.solids) {
    const geo = new THREE.BoxGeometry(s.half.x * 2, s.half.y * 2, s.half.z * 2);
    const mesh = new THREE.Mesh(geo, mat(s.kind));
    mesh.position.copy(s.center);
    // Diagonal beams overlap corner pads; sink pads a hair (visual only) to avoid z-fighting.
    if (s.kind === 'pad') mesh.position.y -= 0.004;
    mesh.quaternion.copy(s.quat);
    mesh.receiveShadow = true;
    mesh.castShadow = s.kind !== 'rail';
    if (s.kind !== 'rail') mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat(s.kind)));
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
  return { group, checkpointMarkers, goalMarker };
}
