import * as THREE from 'three';

export const BALL_R = 0.4;

const GRAVITY = 22;
const ACCEL = 10;        // input acceleration while touching ground
const AIR_ACCEL = 3;      // a little steering while airborne
const ROLL_DAMP = 1.1;   // rolling resistance (per second, horizontal only)
const OVER_DAMP = 1.6;    // extra drag while faster than MAX_SPEED (after a boost)
export const MAX_SPEED = 8.5; // fastest you can go by tilting alone
const HARD_MAX = 16;
const BOUNCE = 0.25;
const BOUNCE_MIN = 4;     // impacts slower than this don't bounce (keeps resting contact stable)

const BOOST_ACC = 34;
const BOOST_MAX = 13;
const CRUMBLE_DELAY = 0.7;   // seconds after first touch before a crumble tile drops
const SWEEP_BOUNCE = 0.6;
const SWEEP_KICK = 2;

const _tmp = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e = new THREE.Euler();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * An oriented box the ball can roll on.
 * Optional behaviours: `motion` (oscillate along an axis), `spin` (rotate about Y),
 * kind 'crumble' (drops shortly after being touched), 'boost', 'jump'.
 */
export class Solid {
  constructor({ center, size, yaw = 0, pitch = 0, kind = 'beam', motion = null, spin = 0, phase = 0, pivot = null, armOffset = 0, jump = null }) {
    this.base = center.clone();
    this.center = center.clone();
    this.half = size.clone().multiplyScalar(0.5);
    this.yaw = yaw;
    this.pitch = pitch;
    this.quat = new THREE.Quaternion().setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
    this.inv = this.quat.clone().invert();
    this.fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    this.radius = this.half.length();
    this.kind = kind;
    this.motion = motion;   // { axis: Vector3, amp, period, phase }
    this.spin = spin;       // rad/s about Y
    this.phase = phase;
    this.pivot = pivot;         // spinning arms rotate around this point...
    this.armOffset = armOffset; // ...with the box centre this far out along its local X
    this.jump = jump;       // { power, launch }
    this.delta = new THREE.Vector3();
    this.disabled = false;
    this.crumbleT = null;
    this.fallV = 0;
    this.mesh = null;
  }

  get dynamic() { return !!(this.motion || this.spin || this.kind === 'crumble'); }

  update(t) {
    if (this.motion) {
      const { axis, amp, period, phase = 0 } = this.motion;
      _tmp.copy(this.center);
      this.center.copy(this.base).addScaledVector(axis, amp * Math.sin((2 * Math.PI * t) / period + phase));
      this.delta.subVectors(this.center, _tmp);
      if (this.mesh) this.mesh.position.copy(this.center);
    }
    if (this.spin) {
      const a = this.yaw + this.spin * t + this.phase;
      this.quat.setFromEuler(_e.set(this.pitch, a, 0, 'YXZ'));
      this.inv.copy(this.quat).invert();
      if (this.pivot) this.center.set(this.pivot.x + Math.cos(a) * this.armOffset, this.pivot.y, this.pivot.z - Math.sin(a) * this.armOffset);
      if (this.mesh) { this.mesh.quaternion.copy(this.quat); this.mesh.position.copy(this.center); }
    }
  }

  resetCrumble() {
    this.crumbleT = null;
    this.disabled = false;
    this.fallV = 0;
    this.center.copy(this.base);
  }

  /** Sphere vs box. Returns penetration depth (>0 on contact) and writes the push-out normal to `out`. */
  collide(p, r, out) {
    const reach = this.radius + r;
    if (p.distanceToSquared(this.center) > reach * reach) return 0;

    _lp.copy(p).sub(this.center).applyQuaternion(this.inv);
    const h = this.half;
    _cp.set(clamp(_lp.x, -h.x, h.x), clamp(_lp.y, -h.y, h.y), clamp(_lp.z, -h.z, h.z));
    out.subVectors(_lp, _cp);
    const dist = out.length();
    let pen;
    if (dist > 1e-6) {
      if (dist >= r) return 0;
      out.divideScalar(dist);
      pen = r - dist;
    } else {
      // Centre is inside the box: push out through the nearest face.
      const dx = h.x - Math.abs(_lp.x);
      const dy = h.y - Math.abs(_lp.y);
      const dz = h.z - Math.abs(_lp.z);
      if (dy <= dx && dy <= dz) { out.set(0, Math.sign(_lp.y) || 1, 0); pen = dy + r; }
      else if (dx <= dz) { out.set(Math.sign(_lp.x) || 1, 0, 0); pen = dx + r; }
      else { out.set(0, 0, Math.sign(_lp.z) || 1); pen = dz + r; }
    }
    out.applyQuaternion(this.quat);
    return pen;
  }
}

export class Ball {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.grounded = false;
    this.ground = null;
    this.jumpCooldown = 0;
    this.prevGroundKind = null;
    this.impact = 0;   // strongest landing speed since last read (for sound / shake)
    this.hit = 0;      // strongest sweeper hit since last read
  }

  reset(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.ground = null;
    this.jumpCooldown = 0;
    this.prevGroundKind = null;
    this.impact = 0;
    this.hit = 0;
  }

  /** input: world-space {x, z}, length <= 1 */
  step(dt, input, solids) {
    const v = this.vel;
    v.y -= GRAVITY * dt;

    // Tilting can only accelerate you up to MAX_SPEED; faster (boosted) speed bleeds off.
    const hs0 = Math.hypot(v.x, v.z);
    const a = this.grounded ? ACCEL : AIR_ACCEL;
    v.x += input.x * a * dt;
    v.z += input.z * a * dt;
    let hs = Math.hypot(v.x, v.z);
    const cap = Math.min(HARD_MAX, Math.max(MAX_SPEED, hs0));
    if (hs > cap) { v.x *= cap / hs; v.z *= cap / hs; hs = cap; }
    if (this.grounded) {
      const k = Math.max(0, 1 - (ROLL_DAMP + (hs > MAX_SPEED ? OVER_DAMP : 0)) * dt);
      v.x *= k;
      v.z *= k;
    }

    this.pos.addScaledVector(v, dt);

    this.grounded = false;
    this.ground = null;
    let bestUp = 0;
    for (const s of solids) {
      if (s.disabled) continue;
      const pen = s.collide(this.pos, BALL_R, _n);
      if (pen <= 0) continue;
      this.pos.addScaledVector(_n, pen);

      if (s.spin) {
        // Contact point velocity on a spinning arm: omega x r, omega = (0, spin, 0).
        const pc = s.pivot || s.center;
        const rx = this.pos.x - _n.x * BALL_R - pc.x;
        const rz = this.pos.z - _n.z * BALL_R - pc.z;
        const vpx = s.spin * rz, vpz = -s.spin * rx;
        const rel = (v.x - vpx) * _n.x + v.y * _n.y + (v.z - vpz) * _n.z;
        if (rel < 0) {
          v.addScaledVector(_n, -(1 + SWEEP_BOUNCE) * rel + SWEEP_KICK);
          this.hit = Math.max(this.hit, -rel + SWEEP_KICK);
        }
        continue;
      }

      const vn = v.dot(_n);
      if (vn < 0) {
        const e = vn < -BOUNCE_MIN ? BOUNCE : 0;
        v.addScaledVector(_n, -(1 + e) * vn);
      }
      if (_n.y > 0.55) {
        if (vn < 0) this.impact = Math.max(this.impact, -vn);
        this.grounded = true;
        if (_n.y > bestUp) { bestUp = _n.y; this.ground = s; }
      }
    }
  }
}

/**
 * Per-frame effects of special surfaces. Returns a list of event names
 * ('boost', 'jump', 'crack', 'crumble') for sound/visual feedback.
 */
export function surfaceEffects(ball, solids, dt) {
  const events = [];
  ball.jumpCooldown = Math.max(0, ball.jumpCooldown - dt);
  const g = ball.ground;
  const kind = g ? g.kind : null;

  if (kind === 'boost') {
    if (ball.prevGroundKind !== 'boost') events.push('boost');
    ball.vel.addScaledVector(g.fwd, BOOST_ACC * dt);
    const hs = Math.hypot(ball.vel.x, ball.vel.z);
    if (hs > BOOST_MAX) { ball.vel.x *= BOOST_MAX / hs; ball.vel.z *= BOOST_MAX / hs; }
  } else if (kind === 'jump' && ball.jumpCooldown <= 0) {
    // Deterministic launch: fixed forward speed and upward kick, sideways drift halved.
    const f = g.fwd;
    const along = ball.vel.x * f.x + ball.vel.z * f.z;
    const sx = ball.vel.x - f.x * along, sz = ball.vel.z - f.z * along;
    ball.vel.set(f.x * g.jump.launch + sx * 0.5, g.jump.power, f.z * g.jump.launch + sz * 0.5);
    ball.jumpCooldown = 0.4;
    ball.grounded = false;
    ball.ground = null;
    events.push('jump');
  }
  ball.prevGroundKind = kind;

  for (const s of solids) {
    if (s.kind !== 'crumble') continue;
    if (s.crumbleT === null) {
      if (ball.ground === s) { s.crumbleT = 0; events.push('crack'); }
      continue;
    }
    s.crumbleT += dt;
    if (!s.disabled && s.crumbleT > CRUMBLE_DELAY) { s.disabled = true; events.push('crumble'); }
    if (s.disabled) { s.fallV += GRAVITY * dt; s.center.y -= s.fallV * dt; }
  }
  return events;
}

export const CRUMBLE_WARN = CRUMBLE_DELAY;
