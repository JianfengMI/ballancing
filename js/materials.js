import * as THREE from 'three';
import { BALL_R } from './physics.js';

/**
 * Ball materials, from easy to hard. Each one changes how the ball feels:
 *  accel     - how hard tilting pushes it (low = heavy, slow to start and to stop)
 *  rollDamp  - rolling resistance (low = keeps gliding when you let go)
 *  overDamp  - how fast extra speed from boosts bleeds off
 *  airAccel  - steering while airborne
 *  bounce / bounceMin - restitution, and the impact speed needed to bounce at all
 *  knock     - how far sweeper arms knock it (light balls fly, heavy ones barely budge)
 *  crumble   - seconds a crumbling tile holds it (heavy balls break tiles sooner)
 *  flutter   - random sideways drift (m/s^2), paper catches the air
 *
 * accel / rollDamp stays above the 8.5 m/s speed cap for every material,
 * so all of them reach the same top speed and the par times stay fair.
 */
export const MATERIALS = {
  wood: {
    name: 'Wood', icon: '🪵', hint: 'Wood ball: steady and easy to steer',
    accel: 10, rollDamp: 1.1, overDamp: 1.6, airAccel: 3,
    bounce: 0.25, bounceMin: 4, knock: 1, crumble: 0.7, flutter: 0,
    dust: 0xc8955c,
    sound: { rollBase: 220, rollRange: 520, rollGain: 0.5, rollType: 'lowpass', landFreq: 180, landType: 'triangle', ring: 0 },
  },
  rock: {
    name: 'Rock', icon: '🪨', hint: 'Rock ball: heavy, takes longer to stop',
    accel: 7.5, rollDamp: 0.7, overDamp: 1.2, airAccel: 2.6,
    bounce: 0.1, bounceMin: 5, knock: 0.7, crumble: 0.6, flutter: 0,
    dust: 0x9a968e,
    sound: { rollBase: 120, rollRange: 380, rollGain: 0.7, rollType: 'lowpass', landFreq: 80, landType: 'sine', ring: 0 },
  },
  iron: {
    name: 'Iron', icon: '⚙️', hint: 'Iron ball: very heavy, hard to stop, breaks tiles fast',
    accel: 6, rollDamp: 0.45, overDamp: 0.9, airAccel: 2.2,
    bounce: 0.05, bounceMin: 6, knock: 0.45, crumble: 0.5, flutter: 0,
    dust: 0xffb347,
    sound: { rollBase: 160, rollRange: 700, rollGain: 0.6, rollType: 'bandpass', landFreq: 95, landType: 'sine', ring: 1 },
  },
  paper: {
    name: 'Paper', icon: '📄', hint: 'Paper ball: light, bouncy, drifts in the breeze',
    accel: 16, rollDamp: 1.8, overDamp: 2.4, airAccel: 3.6,
    bounce: 0.5, bounceMin: 2.5, knock: 1.6, crumble: 1.0, flutter: 1.6,
    dust: 0xf3efe4,
    sound: { rollBase: 1400, rollRange: 1800, rollGain: 0.35, rollType: 'bandpass', landFreq: 320, landType: 'triangle', ring: 0 },
  },
};

// ---------- visuals ----------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Small deterministic PRNG so every ball looks the same each time.
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

function woodTexture() {
  const [c, g] = canvas(512, 256);
  const r = rng(7);
  g.fillStyle = '#b97a43';
  g.fillRect(0, 0, 512, 256);
  // wavy grain lines running around the ball
  for (let i = 0; i < 46; i++) {
    const y0 = r() * 256, amp = 2 + r() * 6, freq = 0.01 + r() * 0.02, ph = r() * 6;
    g.strokeStyle = `rgba(${90 + r() * 40},${45 + r() * 20},${15 + r() * 15},${0.25 + r() * 0.45})`;
    g.lineWidth = 0.8 + r() * 2.5;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y0 + Math.sin(x * freq + ph) * amp);
    g.stroke();
  }
  // knots
  for (let k = 0; k < 4; k++) {
    const x = 60 + k * 128 + r() * 40, y = 50 + r() * 150;
    for (let ring = 12; ring > 0; ring -= 3) {
      g.strokeStyle = `rgba(80,40,15,${0.5 - ring * 0.02})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(x, y, ring * 1.6, ring, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#5a2e12';
    g.beginPath(); g.ellipse(x, y, 4, 2.5, 0, 0, Math.PI * 2); g.fill();
  }
  // a darker band so you can see it roll
  g.fillStyle = 'rgba(90,45,15,0.45)';
  g.fillRect(0, 118, 512, 20);
  g.fillRect(250, 0, 14, 256);
  return tex(c);
}

function rockTexture() {
  const [c, g] = canvas(512, 256);
  const r = rng(13);
  g.fillStyle = '#7d7a74';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    const v = 90 + r() * 70;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.45)`;
    g.beginPath();
    g.ellipse(r() * 512, r() * 256, 10 + r() * 40, 6 + r() * 25, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 4000; i++) {
    const v = r() < 0.5 ? 40 + r() * 40 : 160 + r() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * 512, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  // cracks
  g.strokeStyle = 'rgba(35,32,30,0.8)';
  for (let i = 0; i < 9; i++) {
    let x = r() * 512, y = r() * 256;
    g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 8; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  // mossy patch to show rotation
  g.fillStyle = 'rgba(95,120,70,0.55)';
  g.beginPath(); g.ellipse(130, 90, 55, 35, 0.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(390, 170, 40, 28, -0.3, 0, Math.PI * 2); g.fill();
  return tex(c);
}

function ironTexture() {
  const [c, g] = canvas(512, 256);
  const r = rng(29);
  g.fillStyle = '#8d949c';
  g.fillRect(0, 0, 512, 256);
  // brushed streaks
  for (let i = 0; i < 600; i++) {
    const v = 110 + r() * 80;
    g.strokeStyle = `rgba(${v},${v + 4},${v + 10},0.25)`;
    g.lineWidth = 1;
    const y = r() * 256, x = r() * 512;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 90, y); g.stroke();
  }
  // riveted bands, one around the equator and one pole-to-pole
  const band = (x, y, w, h, vertical) => {
    g.fillStyle = '#5b6168';
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x, y, vertical ? 3 : w, vertical ? h : 3);
    const n = vertical ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const cx = vertical ? x + w / 2 : (i + 0.5) * (w / n);
      const cy = vertical ? (i + 0.5) * (h / n) : y + h / 2;
      g.fillStyle = '#3c4148'; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c9ced4'; g.beginPath(); g.arc(cx - 1.5, cy - 1.5, 3, 0, Math.PI * 2); g.fill();
    }
  };
  band(0, 112, 512, 32, false);
  band(240, 0, 32, 256, true);
  // a bit of rust
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${140 + r() * 40},${60 + r() * 30},30,${0.15 + r() * 0.2})`;
    g.beginPath(); g.ellipse(r() * 512, r() * 256, 4 + r() * 16, 3 + r() * 10, r() * 3, 0, Math.PI * 2); g.fill();
  }
  return tex(c);
}

function paperTexture() {
  const [c, g] = canvas(512, 256);
  const r = rng(41);
  g.fillStyle = '#f6f2e7';
  g.fillRect(0, 0, 512, 256);
  // ruled notebook lines + red margin
  g.strokeStyle = 'rgba(90,140,220,0.7)';
  g.lineWidth = 2;
  for (let y = 10; y < 256; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = 'rgba(230,80,90,0.8)';
  g.beginPath(); g.moveTo(96, 0); g.lineTo(96, 256); g.stroke();
  g.beginPath(); g.moveTo(352, 0); g.lineTo(352, 256); g.stroke();
  // scribbles
  g.strokeStyle = 'rgba(40,50,90,0.65)';
  g.lineWidth = 1.6;
  for (let i = 0; i < 10; i++) {
    let x = 110 + r() * 220, y = 20 + r() * 220;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 12; s++) { x += 4 + r() * 6; y += (r() - 0.5) * 8; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}

/** A sphere with a crumpled, faceted surface (shared vertices move together so it stays closed). */
function crumpledGeometry() {
  const geo = new THREE.IcosahedronGeometry(BALL_R, 3);
  const pos = geo.attributes.position;
  const r = rng(5);
  const dirs = Array.from({ length: 7 }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(6 + r() * 8));
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let n = 0;
    for (const d of dirs) n += Math.sin(v.dot(d));
    v.multiplyScalar(BALL_R * (1 + 0.028 * n));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

let envMap = null;
/** Soft studio-style reflections so metal looks like metal (only the ball uses it). */
function getEnvMap(renderer) {
  if (envMap) return envMap;
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const cols = [];
  const top = new THREE.Color(0xd8e0ec), mid = new THREE.Color(0x5c6270), bottom = new THREE.Color(0x16171c), c = new THREE.Color();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 10;
    if (t > 0) c.copy(mid).lerp(top, t); else c.copy(mid).lerp(bottom, -t);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [x, y, z, w, h] of [[5, 7, 3, 6, 3], [-6, 5, -4, 4, 2], [0, 3, 8, 8, 1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panel);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  envMap = pm.fromScene(env, 0.04).texture;
  pm.dispose();
  return envMap;
}

const cache = {};
/** Returns { geometry, material } for a ball of the given material key. */
export function ballLook(key, renderer) {
  if (cache[key]) return cache[key];
  let look;
  switch (key) {
    case 'rock': {
      const map = rockTexture();
      look = {
        geometry: new THREE.SphereGeometry(BALL_R, 40, 28),
        material: new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2.5, roughness: 0.95, metalness: 0 }),
      };
      break;
    }
    case 'iron':
      look = {
        geometry: new THREE.SphereGeometry(BALL_R, 48, 32),
        material: new THREE.MeshStandardMaterial({ map: ironTexture(), roughness: 0.32, metalness: 0.9, envMap: getEnvMap(renderer), envMapIntensity: 1.2 }),
      };
      break;
    case 'paper':
      look = {
        geometry: crumpledGeometry(),
        material: new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 1, metalness: 0, flatShading: true }),
      };
      break;
    default: {
      const map = woodTexture();
      look = {
        geometry: new THREE.SphereGeometry(BALL_R, 40, 28),
        material: new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.6, metalness: 0 }),
      };
    }
  }
  cache[key] = look;
  return look;
}
