import * as THREE from 'three';
import { BALL_R, MAX_SPEED } from './physics.js';

/**
 * A blue band on the track ahead of the ball (like a car's planned-path view): it
 * predicts where the ball goes over the next moment from its speed plus your tilt,
 * so it bends toward the tilt, grows with speed and brightens with tilt strength.
 * Each row across the band has three vertices: deep-blue edges and a bright centre,
 * so it stands out against the blue beams.
 */

const N = 28;          // segments along the band
const HORIZON = 0.9;   // seconds of prediction
const WIDTH = 0.7;
const LIFT = 0.03;     // above the ball's contact point, to sit on the surface
const EDGE = new THREE.Color(0x0ea5e9);
const CORE_DIM = new THREE.Color(0x7dd3fc);
const CORE_BRIGHT = new THREE.Color(0xbae6fd);

export class PathGuide {
  constructor(scene) {
    this.pos = new Float32Array((N + 1) * 3 * 3);
    this.col = new Float32Array((N + 1) * 3 * 4);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 3, b = a + 3;
      // left half (edge-left, centre) and right half (centre, edge-right)
      idx.push(a, a + 1, b, a + 1, b + 1, b);
      idx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.fade = 0;   // eases in/out instead of popping
    this._core = new THREE.Color();
    scene.add(this.mesh);
  }

  hide() { this.mesh.visible = false; this.fade = 0; }

  /**
   * ball: Ball (pos, vel, grounded); input: world-space {x, z} (length <= 1);
   * accel: the ball material's tilt acceleration.
   */
  update(dt, ball, input, accel, enabled) {
    const ix = input.x, iz = input.z;
    const strength = Math.min(1, Math.hypot(ix, iz));
    const vx = ball.vel.x, vz = ball.vel.z;
    const speed = Math.hypot(vx, vz);
    const want = enabled && ball.grounded && (speed > 0.3 || strength > 0.08) ? 1 : 0;
    this.fade += (want - this.fade) * Math.min(1, dt * 10);
    if (this.fade < 0.02) { this.mesh.visible = false; return; }
    this.mesh.visible = true;

    // predicted path: constant tilt acceleration on top of the current velocity (speed-capped)
    const ax = ix * accel, az = iz * accel;
    const y = ball.pos.y - BALL_R + LIFT;
    const pts = [[ball.pos.x, ball.pos.z]];
    let px = ball.pos.x, pz = ball.pos.z, cx = vx, cz = vz;
    const dtp = HORIZON / N;
    for (let i = 1; i <= N; i++) {
      cx += ax * dtp; cz += az * dtp;
      const s = Math.hypot(cx, cz);
      if (s > MAX_SPEED) { cx *= MAX_SPEED / s; cz *= MAX_SPEED / s; }
      px += cx * dtp; pz += cz * dtp;
      pts.push([px, pz]);
    }
    let total = 0;
    for (let i = 1; i <= N; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);

    const core = this._core.copy(CORE_DIM).lerp(CORE_BRIGHT, strength);
    const baseAlpha = (0.38 + 0.22 * Math.max(strength, Math.min(1, speed / MAX_SPEED))) * this.fade;
    let travelled = 0;
    for (let i = 0; i <= N; i++) {
      const p = pts[i];
      if (i) travelled += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const q = pts[Math.min(N, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const t = total > 1e-4 ? travelled / total : 0;
      const w = (WIDTH / 2) * (1 - 0.45 * t);   // tapers toward the tip
      // appear just past the ball's edge, fade toward the tip
      const nearBall = Math.min(1, Math.max(0, (travelled - BALL_R * 0.5) / 0.3));
      const a = Math.min(1, baseAlpha * nearBall * (1 - t ** 2.5));
      for (let j = 0; j < 3; j++) {
        const k = i * 3 + j;
        const off = (j - 1) * w;   // -w, 0, +w
        this.pos[k * 3] = p[0] - dz * off;
        this.pos[k * 3 + 1] = y;
        this.pos[k * 3 + 2] = p[1] + dx * off;
        const c = j === 1 ? core : EDGE;
        this.col[k * 4] = c.r; this.col[k * 4 + 1] = c.g; this.col[k * 4 + 2] = c.b;
        this.col[k * 4 + 3] = j === 1 ? a : a * 0.9;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
