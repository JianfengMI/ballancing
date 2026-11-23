import * as THREE from 'three';

export const BALL_R = 0.4;

const GRAVITY = 22;
const ACCEL = 8;         // input acceleration while touching ground
const AIR_ACCEL = 3;     // a little steering while airborne
const ROLL_DAMP = 1.3;   // rolling resistance (per second, horizontal only)
const MAX_SPEED = 7;
const BOUNCE = 0.25;
const BOUNCE_MIN = 4;    // impacts slower than this don't bounce (keeps resting contact stable)

const _tmp = new THREE.Vector3();
const _lp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _n = new THREE.Vector3();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** An oriented box the ball can roll on. Optionally oscillates along an axis. */
export class Solid {
  constructor({ center, size, yaw = 0, pitch = 0, kind = 'beam', motion = null }) {
    this.base = center.clone();
    this.center = center.clone();
    this.half = size.clone().multiplyScalar(0.5);
    this.quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this.inv = this.quat.clone().invert();
    this.radius = this.half.length();
    this.kind = kind;
    this.motion = motion;   // { axis: Vector3, amp, period, phase }
    this.delta = new THREE.Vector3();
    this.mesh = null;
  }

  update(t) {
    if (!this.motion) return;
    const { axis, amp, period, phase = 0 } = this.motion;
    _tmp.copy(this.center);
    this.center.copy(this.base).addScaledVector(axis, amp * Math.sin((2 * Math.PI * t) / period + phase));
    this.delta.subVectors(this.center, _tmp);
    if (this.mesh) this.mesh.position.copy(this.center);
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
  }

  reset(p) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.ground = null;
  }

  /** input: world-space {x, z}, length <= 1 */
  step(dt, input, solids) {
    const v = this.vel;
    v.y -= GRAVITY * dt;
    const a = this.grounded ? ACCEL : AIR_ACCEL;
    v.x += input.x * a * dt;
    v.z += input.z * a * dt;
    if (this.grounded) {
      const k = Math.max(0, 1 - ROLL_DAMP * dt);
      v.x *= k;
      v.z *= k;
    }
    const hs = Math.hypot(v.x, v.z);
    if (hs > MAX_SPEED) {
      v.x *= MAX_SPEED / hs;
      v.z *= MAX_SPEED / hs;
    }

    this.pos.addScaledVector(v, dt);

    this.grounded = false;
    this.ground = null;
    let bestUp = 0;
    for (const s of solids) {
      const pen = s.collide(this.pos, BALL_R, _n);
      if (pen <= 0) continue;
      this.pos.addScaledVector(_n, pen);
      const vn = v.dot(_n);
      if (vn < 0) {
        const e = vn < -BOUNCE_MIN ? BOUNCE : 0;
        v.addScaledVector(_n, -(1 + e) * vn);
      }
      if (_n.y > 0.55) {
        this.grounded = true;
        if (_n.y > bestUp) { bestUp = _n.y; this.ground = s; }
      }
    }
  }
}
