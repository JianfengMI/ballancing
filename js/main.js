import * as THREE from 'three';
import { Ball, BALL_R } from './physics.js';
import { TrackBuilder, buildMeshes } from './track.js';
import { LEVELS } from './levels.js';
import { Input } from './input.js';
import { Minimap } from './minimap.js';

const STEP = 1 / 240;
// The camera always looks "north" (-Z) and never rotates, so screen-up / tilt-away
// always means the same direction. Placed fairly high so sideways sections stay readable.
const CAM_DIST = 5.4;
const CAM_HEIGHT = 6.4;
const LOOK_AHEAD = 2.8;

const $ = (id) => document.getElementById(id);
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------- persistence ----------
const SAVE_KEY = 'beamroller.v1';
function loadSave() {
  try { return Object.assign({ unlocked: 1, best: {}, control: 'tilt' }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); }
  catch { return { unlocked: 1, best: {}, control: 'tilt' }; }
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage unavailable */ } }

// ---------- renderer / scene ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const BG = new THREE.Color(0x0b1020);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 28, 80);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1530, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// sky dome with a vertical gradient
{
  const geo = new THREE.SphereGeometry(200, 32, 16);
  const colors = [];
  const top = new THREE.Color(0x1b1f4a), bottom = new THREE.Color(0x05060f), mid = new THREE.Color(0x3a1d52);
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 200;
    if (t > 0) c.copy(mid).lerp(top, t); else c.copy(mid).lerp(bottom, -t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  scene.userData.sky = sky;

  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(150 + Math.random() * 40);
    pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(stars);
  scene.userData.stars = stars;
}

// ball with a pattern so rolling is visible
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#f4f4f8' : '#ff4d6d';
      g.fillRect(x * 32, y * 32, 32, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 32, 24),
  new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.35, metalness: 0.05 })
);
ballMesh.castShadow = true;
scene.add(ballMesh);

// ---------- game state ----------
const ball = new Ball();
const input = new Input(canvas, $('joystick'), $('joy-knob'));
const minimap = new Minimap($('minimap'));

let state = 'menu'; // menu | playing | falling | paused | won
let levelIndex = 0;
let level = null;   // { track, group, checkpointMarkers, goalMarker, minY, movers }
let cpIndex = -1;
let simTime = 0;
let accum = 0;
let runTime = 0;
let falls = 0;
let fallTimer = 0;
let menuAngle = 0;
let wakeLock = null;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

function loadLevel(i) {
  if (level) {
    scene.remove(level.group);
    level.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  levelIndex = i;
  const track = new TrackBuilder();
  LEVELS[i].build(track);
  const { group, checkpointMarkers, goalMarker } = buildMeshes(track);
  scene.add(group);
  let minY = Infinity;
  for (const s of track.solids) minY = Math.min(minY, s.center.y - s.half.y);
  level = { track, group, checkpointMarkers, goalMarker, minY, movers: track.solids.filter((s) => s.motion) };
  minimap.setLevel(track);
  resetRun();
}

function resetRun() {
  cpIndex = -1;
  simTime = 0;
  accum = 0;
  runTime = 0;
  falls = 0;
  for (const s of level.movers) { s.update(0); s.delta.set(0, 0, 0); }
  for (const m of level.checkpointMarkers) { m.material.color.set(0x40e0d0); m.material.emissive.set(0x1a8a80); }
  respawn(true);
  updateHud();
}

function respawn(snapCamera) {
  const sp = cpIndex >= 0 ? level.track.checkpoints[cpIndex] : level.track.spawn;
  ball.reset(sp.pos.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
  ballMesh.position.copy(ball.pos);
  if (snapCamera) placeCamera(1);
}

// ---------- camera ----------
function placeCamera(t) {
  const follow = ball.pos.clone();
  follow.y = Math.max(follow.y, level.minY - 2);
  const want = follow.clone();
  want.z += CAM_DIST;
  want.y += CAM_HEIGHT;
  const look = follow.clone();
  look.z -= LOOK_AHEAD;
  camPos.lerp(want, t);
  camLook.lerp(look, t);
  if (t >= 1) { camPos.copy(want); camLook.copy(look); }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function updateCamera(dt) {
  if (state === 'menu') {
    menuAngle += dt * 0.15;
    const c = level.track.spawn.pos;
    camera.position.set(c.x + Math.sin(menuAngle) * 14, c.y + 9, c.z + Math.cos(menuAngle) * 14);
    camera.lookAt(c.x, c.y, c.z - 4);
    camPos.copy(camera.position);
    return;
  }
  placeCamera(1 - Math.exp(-dt * 7));
}

// ---------- simulation ----------
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

function update(dt) {
  simTime += dt;
  for (const s of level.movers) s.update(simTime);
  if (ball.ground && ball.ground.motion) ball.pos.add(ball.ground.delta);

  const inp = state === 'playing' ? input.get(dt) : { x: 0, y: 0 };
  // Screen-fixed controls: right = +X, forward (up the screen) = -Z.
  const world = { x: inp.x, z: -inp.y };

  accum += dt;
  while (accum >= STEP) {
    ball.step(STEP, world, level.track.solids);
    accum -= STEP;
  }

  // visual rolling
  if (ball.grounded) {
    const v = ball.vel;
    const speed = Math.hypot(v.x, v.z);
    if (speed > 1e-3) {
      _axis.set(v.z, 0, -v.x).normalize();
      ballMesh.quaternion.premultiply(_q.setFromAxisAngle(_axis, (speed * dt) / BALL_R));
    }
  }
  ballMesh.position.copy(ball.pos);

  if (state === 'playing') {
    runTime += dt;
    // checkpoints
    const cps = level.track.checkpoints;
    for (let i = cpIndex + 1; i < cps.length; i++) {
      const p = cps[i].pos;
      if (Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z) < 1.4 && Math.abs(ball.pos.y - p.y) < 1.5) {
        cpIndex = i;
        const ring = level.checkpointMarkers[i];
        ring.material.color.set(0xffd166);
        ring.material.emissive.set(0x7a5a00);
        toast('Checkpoint!');
      }
    }
    if (ball.ground && ball.ground.kind === 'goal') win();
    else if (ball.pos.y < level.minY - 6) {
      state = 'falling';
      falls++;
      fallTimer = 0.9;
      toast('Oops!');
    }
    updateHud();
  } else if (state === 'falling') {
    fallTimer -= dt;
    if (fallTimer <= 0) {
      respawn(false);
      state = 'playing';
    }
  }
}

// ---------- UI ----------
let toastTimer = 0;
function toast(text, ms = 1100) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function fmt(t) { return `${t.toFixed(1)}s`; }

function updateHud() {
  $('hud-level').textContent = `${levelIndex + 1}. ${LEVELS[levelIndex].name}`;
  $('hud-time').textContent = fmt(runTime);
  $('hud-falls').textContent = falls;
}

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function renderMenu() {
  const list = $('level-list');
  list.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const locked = i + 1 > save.unlocked;
    b.className = 'level-btn' + (locked ? ' locked' : '');
    b.disabled = locked;
    const best = save.best[i];
    b.innerHTML = `<span class="num">${i + 1}</span><span class="name">${lv.name}</span><span class="best">${locked ? '🔒' : best ? fmt(best) : ''}</span>`;
    b.addEventListener('click', () => startLevel(i));
    list.appendChild(b);
  });

  if (isTouch) {
    show('control-row', true);
    $('ctl-tilt').classList.toggle('on', save.control === 'tilt');
    $('ctl-touch').classList.toggle('on', save.control === 'touch');
  }
  $('menu-hint').textContent = !isTouch
    ? 'Arrow keys or WASD to roll. Don’t fall off!'
    : save.control === 'tilt'
      ? 'Hold your phone comfortably — that angle becomes “level”. Tilt to roll.'
      : 'Drag anywhere on the screen to roll.';
}

function setControl(mode) {
  save.control = mode;
  persist();
  renderMenu();
}
$('ctl-tilt').addEventListener('click', () => setControl('tilt'));
$('ctl-touch').addEventListener('click', () => setControl('touch'));

function configureControls() {
  // Called synchronously from a tap/click so the iOS motion permission prompt is allowed.
  input.useTilt = false;
  input.useTouch = false;
  if (!isTouch) return;
  if (save.control === 'touch') { input.useTouch = true; return; }

  if (!window.isSecureContext) {
    input.useTouch = true;
    toast('Tilt needs HTTPS — using touch drag', 2500);
    return;
  }
  input.requestTilt().then((ok) => {
    if (!ok) {
      input.useTouch = true;
      toast('Motion access denied — using touch drag', 2500);
      return;
    }
    input.useTilt = true;
    input.calibrate();
    input.waitForTilt(1500).then((seen) => {
      if (!seen) {
        input.useTilt = false;
        input.useTouch = true;
        toast('No tilt sensor — using touch drag', 2500);
      }
    });
  });
}

async function enterImmersive() {
  if (!isTouch) return;
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
    await screen.orientation?.lock?.('portrait');
  } catch { /* not supported (e.g. iPhone Safari) */ }
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); }
  catch { /* ignore */ }
}

function startLevel(i) {
  configureControls();
  enterImmersive();
  keepAwake();
  loadLevel(i);
  input.reset();
  input.enabled = true;
  show('menu', false);
  show('win', false);
  show('pause', false);
  show('hud', true);
  show('btn-calib', input.useTilt || (isTouch && save.control === 'tilt'));
  state = 'playing';
  if (input.useTilt || (isTouch && save.control === 'tilt' && window.isSecureContext)) toast('Tilt to roll', 1300);
}

function win() {
  state = 'won';
  input.enabled = false;
  input.reset();
  const prev = save.best[levelIndex];
  const isBest = !prev || runTime < prev;
  if (isBest) save.best[levelIndex] = runTime;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  persist();
  const last = levelIndex === LEVELS.length - 1;
  $('win-title').textContent = last ? 'You beat every level!' : 'Level complete!';
  $('win-stats').innerHTML = `Time <b>${fmt(runTime)}</b>${isBest ? ' ★ best' : ` (best ${fmt(prev)})`}<br>Falls <b>${falls}</b>`;
  show('btn-next', !last);
  show('hud', false);
  show('win', true);
}

function pause() {
  if (state !== 'playing' && state !== 'falling') return;
  state = 'paused';
  input.enabled = false;
  input.reset();
  show('pause', true);
}
function resume() {
  show('pause', false);
  input.enabled = true;
  state = 'playing';
}
function toMenu() {
  state = 'menu';
  input.enabled = false;
  input.reset();
  show('pause', false);
  show('win', false);
  show('hud', false);
  show('menu', true);
  renderMenu();
  respawn(true);
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { show('pause', false); resetRun(); input.enabled = true; state = 'playing'; });
$('btn-menu').addEventListener('click', toMenu);
$('btn-next').addEventListener('click', () => startLevel(levelIndex + 1));
$('btn-retry').addEventListener('click', () => startLevel(levelIndex));
$('btn-win-menu').addEventListener('click', toMenu);
$('btn-calib').addEventListener('click', () => { input.calibrate(); toast('Recalibrated'); });
$('btn-pause-calib').addEventListener('click', () => { input.calibrate(); toast('Recalibrated'); });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'paused') resume(); else pause();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (state !== 'menu') keepAwake();
});
const landscapeMobile = window.matchMedia('(orientation: landscape) and (pointer: coarse) and (max-height: 520px)');
landscapeMobile.addEventListener?.('change', (e) => { if (e.matches) pause(); });

// ---------- main loop ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // keep a usable horizontal view on tall portrait screens
  camera.fov = w / h < 0.75 ? 70 : 62;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  if (state === 'playing' || state === 'falling') update(dt);
  else if (state === 'menu') {
    simTime += dt;
    for (const s of level.movers) s.update(simTime);
  }
  updateCamera(dt);

  for (const m of level.checkpointMarkers) m.rotation.y += dt * 1.2;
  if (level.goalMarker) level.goalMarker.rotation.y += dt * 0.8;
  if (state !== 'menu') minimap.draw(ball.pos, cpIndex);
  scene.userData.sky.position.copy(camera.position);
  scene.userData.stars.position.copy(camera.position);

  sun.position.copy(ball.pos).add(new THREE.Vector3(6, 14, 5));
  sun.target.position.copy(ball.pos);

  renderer.render(scene, camera);
}

loadLevel(Math.min(save.unlocked, LEVELS.length) - 1);
renderMenu();
requestAnimationFrame(frame);
