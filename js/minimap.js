import * as THREE from 'three';

// Top-down map. World -Z is "up" on the map, matching the (never-rotating) camera.
const COLORS = {
  start: '#7d88b8', pad: '#7d88b8', beam: '#7f8cff', rail: '#e3e8f2',
  checkpoint: '#2ad4c4', goal: '#3ee07f', moving: '#ffa94d',
};
const PAD = 8;
const _v = new THREE.Vector3();

function footprint(s, center = s.center) {
  const pts = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    _v.set(sx * s.half.x, 0, sz * s.half.z).applyQuaternion(s.quat).add(center);
    pts.push([_v.x, _v.z]);
  }
  return pts;
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.track = null;
  }

  setLevel(track) {
    this.track = track;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = this.canvas.clientWidth || 92, cssH = this.canvas.clientHeight || 140;
    this.canvas.width = this.bg.width = Math.round(cssW * dpr);
    this.canvas.height = this.bg.height = Math.round(cssH * dpr);
    this.dpr = dpr;

    // bounds, including the full travel of moving pieces
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const grow = (pts) => { for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); } };
    for (const s of track.solids) {
      if (s.motion) {
        for (const k of [-1, 1]) grow(footprint(s, s.base.clone().addScaledVector(s.motion.axis, k * s.motion.amp)));
      } else grow(footprint(s));
    }
    const W = this.canvas.width, H = this.canvas.height, p = PAD * dpr;
    this.scale = Math.min((W - 2 * p) / (maxX - minX), (H - 2 * p) / (maxZ - minZ));
    this.ox = W / 2 - ((minX + maxX) / 2) * this.scale;
    this.oz = H / 2 - ((minZ + maxZ) / 2) * this.scale;

    const g = this.bg.getContext('2d');
    g.clearRect(0, 0, W, H);
    for (const s of track.solids) if (!s.motion) this._poly(g, footprint(s), COLORS[s.kind] || COLORS.beam);
  }

  _pt(x, z) { return [this.ox + x * this.scale, this.oz + z * this.scale]; }

  _poly(g, pts, color) {
    g.fillStyle = color;
    g.beginPath();
    pts.forEach(([x, z], i) => { const [px, py] = this._pt(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath();
    g.fill();
  }

  _dot(x, z, r, fill, stroke) {
    const g = this.ctx;
    const [px, py] = this._pt(x, z);
    g.beginPath();
    g.arc(px, py, r * this.dpr, 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    if (stroke) { g.lineWidth = 1.5 * this.dpr; g.strokeStyle = stroke; g.stroke(); }
  }

  draw(ballPos, cpIndex) {
    if (!this.track) return;
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.bg, 0, 0);
    for (const s of this.track.solids) if (s.motion) this._poly(g, footprint(s), COLORS.moving);
    this.track.checkpoints.forEach((cp, i) => this._dot(cp.pos.x, cp.pos.z, 3, i <= cpIndex ? '#ffd166' : '#40e0d0'));
    this._dot(ballPos.x, ballPos.z, 4, '#ff4d6d', '#ffffff');
  }
}
