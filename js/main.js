import * as THREE from 'three';
import { Ball, BALL_R, MAX_SPEED, surfaceEffects } from './physics.js';
import { TrackBuilder, buildMeshes, animatedTextures } from './track.js';
import { LEVELS } from './levels.js';
import { Input, TILT_RANGE } from './input.js';
import { Minimap } from './minimap.js';
import { Sfx, vibrate } from './audio.js';
import { Particles } from './particles.js';
import { MATERIALS, ballLook } from './materials.js';
import { GhostRecorder, loadGhost, saveGhost, ghostAt } from './ghost.js';
import { Score, fmtScore } from './score.js';
import { dailyLevel, todayKey, dayNumber, daysBetween } from './daily.js';

const STEP = 1 / 240;
// The camera always looks "north" (-Z) and never rotates, so screen-up / tilt-away
// always means the same direction. Placed fairly high so sideways sections stay readable.
const CAM_DIST = 5.4;
const CAM_HEIGHT = 6.4;
const LOOK_AHEAD = 2.8;
const GEM_RADIUS = 0.7;
const COUNTDOWN = 1.8;

const $ = (id) => document.getElementById(id);
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------- persistence ----------
const SAVE_KEY = 'beamroller.v2';
// best[id] = { time, stars, medal, score, splits }
// daily = today's challenge: { key, tries, result (official = first finish), rec (best run today) }
// streak = { last: day key of the last official daily result, count }
const DEFAULT_SAVE = {
  unlocked: 1, best: {}, control: 'tilt', sens: 'normal', muted: false, ghost: true,
  daily: null, streak: { last: null, count: 0 },
};
function loadSave() {
  try {
    const s = Object.assign({}, DEFAULT_SAVE, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
    if (!localStorage.getItem(SAVE_KEY)) {
      // carry settings / unlocks over from the first version
      const old = JSON.parse(localStorage.getItem('beamroller.v1') || 'null');
      if (old) Object.assign(s, { unlocked: old.unlocked || 1, control: old.control || 'tilt', sens: old.sens || 'normal' });
    }
    return s;
  } catch { return { ...DEFAULT_SAVE, best: {} }; }
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

// sky dome with a vertical gradient + stars
let sky, stars;
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
  sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(150 + Math.random() * 40);
    pts.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, fog: false, transparent: true, opacity: 0.8 }));
  scene.add(stars);
}

// The ball's look (and feel) changes per level: wood, rock, iron, paper. See materials.js.
const ballMesh = new THREE.Mesh();
ballMesh.castShadow = true;
scene.add(ballMesh);

// Ghost of your best run: same shape, see-through.
const ghostMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.32, depthWrite: false })
);
ghostMesh.visible = false;
scene.add(ghostMesh);

// ---------- game state ----------
const ball = new Ball();
const input = new Input(canvas, $('joystick'), $('joy-knob'));
const minimap = new Minimap($('minimap'));
const sfx = new Sfx();
sfx.muted = !!save.muted;
const fx = new Particles(scene);

let state = 'menu'; // menu | countdown | playing | falling | paused | won
let pausedFrom = 'playing';
let levelIndex = 0;
let level = null;
let cpIndex = -1;
let simTime = 0;
let accum = 0;
let runTime = 0;
let falls = 0;
let fallTimer = 0;
let countdown = 0;
let lastCount = -1;
let gemsTaken = 0;
let shake = 0;
let def = LEVELS[0];        // the level being played (a campaign level or today's daily)
const recorder = new GhostRecorder();
const score = new Score();
let ghost = null;           // best run's ghost for this level
let splits = [];            // this run's checkpoint times
let lastDelta = null;       // last split vs best (seconds; negative = ahead)
let menuAngle = 0;
let mat = MATERIALS.wood;
let wakeLock = null;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();

// ---------- daily challenge / records ----------
function dailyState() {
  const key = todayKey();
  if (!save.daily || save.daily.key !== key) save.daily = { key, tries: 0, result: null, rec: null };
  return save.daily;
}
/** Best record for the current level (today's best for the daily). */
function record() { return def.daily ? dailyState().rec : save.best[def.id]; }
function streakCount() {
  const s = save.streak;
  return s.last && daysBetween(s.last, todayKey()) <= 1 ? s.count : 0;
}

/** Loads a level by campaign index, or a level definition (the daily). */
function loadLevel(which) {
  if (level) {
    scene.remove(level.group);
    level.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  if (typeof which === 'number') { levelIndex = which; def = LEVELS[which]; } else def = which;
  mat = MATERIALS[def.ball] || MATERIALS.wood;
  const look = ballLook(def.ball, renderer);
  ballMesh.geometry = look.geometry;
  ballMesh.material = look.material;
  ball.setMaterial(mat);
  sfx.setMaterial(mat.sound);
  ghost = save.ghost ? loadGhost(def.id) : null;
  const track = new TrackBuilder();
  def.build(track);
  const { group, checkpointMarkers, goalMarker, gems } = buildMeshes(track);
  scene.add(group);
  let minY = Infinity;
  for (const s of track.solids) minY = Math.min(minY, s.center.y - s.half.y);
  level = {
    track, group, checkpointMarkers, goalMarker, gems, minY,
    movers: track.solids.filter((s) => s.motion || s.spin),
    crumbles: track.solids.filter((s) => s.kind === 'crumble'),
  };
  minimap.setLevel(track);
  resetRun();
}

function resetRun() {
  cpIndex = -1;
  simTime = 0;
  accum = 0;
  runTime = 0;
  falls = 0;
  gemsTaken = 0;
  score.reset();
  recorder.start();
  splits = [];
  lastDelta = null;
  ghostMesh.visible = false;
  for (const s of level.movers) { s.update(0); s.delta.set(0, 0, 0); }
  for (const m of level.checkpointMarkers) { m.material.color.set(0x40e0d0); m.material.emissive.set(0x1a8a80); }
  for (const g of level.gems) { g.taken = false; g.mesh.visible = true; }
  fx.clear();
  respawn(true);
  updateHud();
}

function resetCrumbles() {
  for (const s of level.crumbles) {
    s.resetCrumble();
    s.mesh.visible = true;
    s.mesh.position.copy(s.center);
  }
}

function respawn(snapCamera) {
  const sp = cpIndex >= 0 ? level.track.checkpoints[cpIndex] : level.track.spawn;
  ball.reset(sp.pos.clone().add(new THREE.Vector3(0, BALL_R + 0.02, 0)));
  ballMesh.position.copy(ball.pos);
  resetCrumbles();
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
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
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
  shake = Math.max(0, shake - dt * 1.5);
  placeCamera(1 - Math.exp(-dt * 7));
}

// ---------- simulation ----------
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _v = new THREE.Vector3();

/** Adds points for a scoring move and shows the chain. */
function scoreEvent(kind) {
  if (state !== 'playing') return null;
  const r = score.event(kind, runTime);
  if (r.chain >= 3) toast(`Chain x${r.chain}!  +${r.points}`, 800);
  pulseScore();
  return r;
}

function handleEvent(ev) {
  switch (ev) {
    case 'boost':
      sfx.boost(); vibrate(20);
      fx.emit(ball.pos, { count: 18, color: 0x67e8f9, speed: 2.5, up: 1.5, life: 0.5 });
      scoreEvent('boost');
      break;
    case 'jump':
      sfx.jump(); vibrate(25);
      fx.emit(ball.pos, { count: 22, color: 0xff7be5, speed: 3, up: 1, life: 0.6 });
      scoreEvent('jump');
      break;
    case 'crack': sfx.crack(); break;
    case 'crumble': sfx.crumble(); break;
  }
}

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
  if (state !== 'countdown') for (const ev of surfaceEffects(ball, level.track.solids, dt)) handleEvent(ev);

  // crumble tiles: shake while about to drop, then fall away
  for (const s of level.crumbles) {
    if (s.crumbleT === null) continue;
    s.mesh.position.copy(s.center);
    if (!s.disabled) {
      const k = 0.03 + s.crumbleT * 0.06;
      s.mesh.position.x += (Math.random() - 0.5) * k;
      s.mesh.position.z += (Math.random() - 0.5) * k;
    } else if (s.center.y < level.minY - 25) s.mesh.visible = false;
  }

  // visual rolling
  const speed = Math.hypot(ball.vel.x, ball.vel.z);
  if (ball.grounded && speed > 1e-3) {
    _axis.set(ball.vel.z, 0, -ball.vel.x).normalize();
    ballMesh.quaternion.premultiply(_q.setFromAxisAngle(_axis, (speed * dt) / BALL_R));
  }
  ballMesh.position.copy(ball.pos);
  sfx.roll(speed, ball.grounded && state !== 'falling');

  // feedback: landings, sweeper hits, speed trail
  if (ball.impact > 3.5) {
    sfx.land(ball.impact);
    if (ball.impact > 6) { shake = Math.max(shake, 0.12); vibrate(15); }
    _v.copy(ball.pos); _v.y -= BALL_R;
    fx.emit(_v, { count: Math.min(20, (ball.impact * 2) | 0), color: mat.dust, speed: 2, up: 1, life: 0.4, gravity: 4 });
  }
  ball.impact = 0;
  if (ball.hit > 0) {
    sfx.hit(); vibrate(40);
    shake = Math.max(shake, 0.25);
    fx.emit(ball.pos, { count: 16, color: mat === MATERIALS.iron ? 0xffb347 : 0xff5c7a, speed: 3, up: 1.5, life: 0.4 });
    ball.hit = 0;
  }
  if (speed > MAX_SPEED + 0.5) {
    fx.emit(ball.pos, { count: 2, color: 0x67e8f9, speed: 0.3, up: 0.2, life: 0.35, gravity: 0, spread: 0.4 });
  }

  // ghost of the best run, on the same clock as this run
  if (ghost) {
    ghostAt(ghost, runTime, ghostMesh.position);
    ghostMesh.visible = runTime <= ghost.time + 0.4;
  }

  if (state === 'playing') {
    runTime += dt;
    recorder.sample(runTime, ball.pos);

    for (const g of level.gems) {
      if (g.taken || g.pos.distanceTo(ball.pos) > GEM_RADIUS) continue;
      g.taken = true;
      g.mesh.visible = false;
      gemsTaken++;
      // pitch climbs while the chain is alive
      sfx.gem(score.live(runTime) ? score.chain : 0);
      scoreEvent('gem');
      vibrate(10);
      fx.emit(g.pos, { count: 14, colors: [0xffd34d, 0xfff3b0, 0xffa94d], speed: 2.2, up: 2.5, life: 0.6 });
    }

    const cps = level.track.checkpoints;
    for (let i = cpIndex + 1; i < cps.length; i++) {
      const p = cps[i].pos;
      if (Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z) < 1.4 && Math.abs(ball.pos.y - p.y) < 1.5) {
        cpIndex = i;
        const ring = level.checkpointMarkers[i];
        ring.material.color.set(0xffd166);
        ring.material.emissive.set(0x7a5a00);
        sfx.checkpoint(); vibrate(20);
        fx.emit(ring.position, { count: 30, color: 0x40e0d0, speed: 3, up: 2, life: 0.8 });
        scoreEvent('checkpoint');
        // split vs your best run
        splits[i] = runTime;
        const bestSplit = record()?.splits?.[i];
        if (bestSplit != null) {
          lastDelta = runTime - bestSplit;
          toast(`Checkpoint  ${fmtDelta(lastDelta)}`, 1500);
        } else toast('Checkpoint!');
      }
    }
    if (ball.ground && ball.ground.kind === 'goal') win();
    else if (ball.pos.y < level.minY - 6) {
      state = 'falling';
      falls++;
      score.fall();
      fallTimer = 0.9;
      sfx.fall(); vibrate(80);
      toast('Oops!');
    }
    updateHud();
  } else if (state === 'falling') {
    fallTimer -= dt;
    if (fallTimer <= 0) {
      respawn(false);
      state = 'playing';
    }
  } else if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil((countdown / COUNTDOWN) * 3);
    if (n !== lastCount && n > 0) {
      lastCount = n;
      showCount(String(n));
      sfx.beep(false);
    }
    if (countdown <= 0) {
      if (input.useTilt) input.calibrate();
      showCount('GO!');
      sfx.beep(true);
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

let countTimer = 0;
function showCount(text) {
  const el = $('count');
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth; // restart the CSS animation
  el.classList.add('pop');
  clearTimeout(countTimer);
  countTimer = setTimeout(() => el.classList.remove('pop'), 600);
}

function fmt(t) { return `${t.toFixed(1)}s`; }
function fmtDelta(d) { return `${d <= 0 ? '−' : '+'}${Math.abs(d).toFixed(1)}s`; }
function starString(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
const MEDAL = '🏅';

function pulseScore() {
  const el = $('hud-score');
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

function updateHud() {
  $('hud-level').textContent = `${def.daily ? def.name : `${levelIndex + 1}. ${def.name}`} · ${mat.icon} ${mat.name}`;
  $('hud-time').textContent = fmt(runTime);
  $('hud-falls').textContent = falls;
  $('hud-gems').textContent = `${gemsTaken}/${level.gems.length}`;
  $('hud-score').textContent = fmtScore(score.total);
  const chain = score.live(runTime) ? `x${score.mult}` : '';
  $('hud-chain').textContent = chain;
  const d = $('hud-delta');
  d.textContent = lastDelta === null ? '' : fmtDelta(lastDelta);
  d.className = lastDelta === null ? '' : lastDelta <= 0 ? 'ahead' : 'behind';
}

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function renderMenu() {
  const list = $('level-list');
  list.innerHTML = '';
  let total = 0, medals = 0;
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    const locked = i + 1 > save.unlocked;
    const rec = save.best[lv.id];
    total += rec ? rec.stars : 0;
    medals += rec && rec.medal ? 1 : 0;
    b.className = 'level-btn' + (locked ? ' locked' : '');
    b.disabled = locked;
    const medal = rec && rec.medal ? `<span class="medal" title="Dev medal">${MEDAL}</span>` : '';
    const right = locked ? '🔒' : rec ? `${medal}<span class="stars">${starString(rec.stars)}</span>${fmt(rec.time)}` : '';
    const m = MATERIALS[lv.ball] || MATERIALS.wood;
    b.innerHTML = `<span class="num">${i + 1}</span><span class="name">${lv.name}<span class="mat" title="${m.name} ball">${m.icon} ${m.name}</span></span><span class="best">${right}</span>`;
    b.addEventListener('click', () => startLevel(i));
    list.appendChild(b);
  });
  $('total-stars').textContent = `★ ${total} / ${LEVELS.length * 3}  ·  ${MEDAL} ${medals} / ${LEVELS.length}`;
  renderDailyCard();
  $('ghost-on').classList.toggle('on', !!save.ghost);
  $('ghost-off').classList.toggle('on', !save.ghost);

  if (isTouch) {
    show('control-row', true);
    $('ctl-tilt').classList.toggle('on', save.control === 'tilt');
    $('ctl-touch').classList.toggle('on', save.control === 'touch');
    show('sens-row', save.control === 'tilt');
    document.querySelectorAll('[data-sens]').forEach((b) => b.classList.toggle('on', b.dataset.sens === save.sens));
  }
  input.tiltRange = TILT_RANGE[save.sens] || TILT_RANGE.normal;
  $('menu-hint').textContent = !isTouch
    ? 'Arrow keys or WASD to roll. Grab gems, beat the clock, don’t fall off!'
    : save.control === 'tilt'
      ? 'Hold your phone comfortably — that angle becomes “level”. Tilt to roll.'
      : 'Drag anywhere on the screen to roll.';
  updateMuteButtons();
}

function renderDailyCard() {
  const key = todayKey();
  const d = dailyState();
  const lv = dailyLevel(key);
  const m = MATERIALS[lv?.ball] || MATERIALS.wood;
  const streak = streakCount();
  let status;
  if (!lv) status = 'Not available today';
  else if (d.result) status = `✓ ${fmt(d.result.time)} · ${fmtScore(d.result.score)} pts${d.result.medal ? ` · ${MEDAL}` : ''}`;
  else status = d.tries ? `${d.tries} ${d.tries === 1 ? 'try' : 'tries'} so far · first finish counts` : 'Your first finish counts!';
  $('daily-btn').disabled = !lv;
  $('daily-btn').innerHTML =
    `<span class="daily-title">Daily challenge #${dayNumber(key)} <span class="mat">${m.icon} ${m.name}</span></span>` +
    `<span class="daily-status">${status}</span>` +
    (streak ? `<span class="daily-streak" title="Days in a row">🔥 ${streak}</span>` : '');
}

function setControl(mode) {
  save.control = mode;
  persist();
  renderMenu();
}
function setGhost(on) {
  save.ghost = on;
  persist();
  renderMenu();
}
$('ghost-on').addEventListener('click', () => setGhost(true));
$('ghost-off').addEventListener('click', () => setGhost(false));
$('daily-btn').addEventListener('click', () => startDaily());
$('ctl-tilt').addEventListener('click', () => setControl('tilt'));
$('ctl-touch').addEventListener('click', () => setControl('touch'));
document.querySelectorAll('[data-sens]').forEach((b) => b.addEventListener('click', () => {
  save.sens = b.dataset.sens;
  persist();
  renderMenu();
}));

function updateMuteButtons() {
  const icon = save.muted ? '🔇' : '🔊';
  $('btn-mute').textContent = icon;
  $('btn-menu-mute').textContent = `${icon} Sound ${save.muted ? 'off' : 'on'}`;
}
function toggleMute() {
  sfx.unlock();
  save.muted = !save.muted;
  sfx.setMuted(save.muted);
  persist();
  updateMuteButtons();
}
$('btn-mute').addEventListener('click', toggleMute);
$('btn-menu-mute').addEventListener('click', toggleMute);

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

function beginCountdown() {
  state = 'countdown';
  countdown = COUNTDOWN;
  lastCount = -1;
  input.enabled = true;
  // every daily start before the first finish counts as a try (shown when you share)
  if (def.daily) {
    const d = dailyState();
    if (!d.result) { d.tries++; persist(); }
  }
}

function enterLevel(which) {
  configureControls();
  sfx.unlock();
  enterImmersive();
  keepAwake();
  loadLevel(which);
  input.reset();
  show('menu', false);
  show('win', false);
  show('pause', false);
  show('hud', true);
  show('btn-calib', isTouch && save.control === 'tilt');
}

function startLevel(i) {
  enterLevel(i);
  // announce the ball when it changes from the previous level (or on the first level)
  const prevBall = i > 0 ? LEVELS[i - 1].ball : null;
  if (prevBall !== LEVELS[i].ball || i === 0) toast(`${mat.icon} ${mat.hint}`, 2600);
  beginCountdown();
}

function startDaily() {
  const lv = dailyLevel(todayKey());
  if (!lv) return;
  enterLevel(lv);
  const d = dailyState();
  toast(d.result ? `Practice run · ${mat.icon} ${mat.name} ball` : `${mat.icon} ${mat.hint}`, 2600);
  beginCountdown();
}

function shareText() {
  const d = dailyState();
  const r = d.result;
  const tries = r.tries === 1 ? '1st try' : `${r.tries} tries`;
  return [
    `Beam Roller Daily #${dayNumber(d.key)} ${(MATERIALS[def.ball] || MATERIALS.wood).icon}`,
    `⏱ ${fmt(r.time)} · ◆ ${r.gems}/${r.totalGems} · ${r.falls} ${r.falls === 1 ? 'fall' : 'falls'}`,
    `${starString(r.stars)}${r.medal ? ` ${MEDAL}` : ''} · ${fmtScore(r.score)} pts · ${tries}`,
  ].join('\n');
}

async function shareDaily() {
  const text = shareText();
  try {
    if (navigator.share && isTouch) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Result copied — paste it to your friends!', 2000);
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // share sheet closed
    toast('Could not copy the result', 1800);
  }
}

function win() {
  state = 'won';
  input.enabled = false;
  input.reset();
  sfx.roll(0, false);
  sfx.win();
  vibrate([30, 60, 30]);
  fx.emit(ball.pos, { count: 80, colors: [0xff4d6d, 0xffd34d, 0x5dff9e, 0x67e8f9, 0xb084ff], speed: 5, up: 6, life: 1.4, gravity: 9 });

  ghostMesh.visible = false;
  recorder.sample(runTime, ball.pos);

  const lv = def;
  const allGems = gemsTaken === level.gems.length;
  const underPar = runTime <= lv.par;
  const medal = allGems && runTime <= lv.dev;
  const stars = 1 + (allGems ? 1 : 0) + (underPar ? 1 : 0);
  const bonus = score.finish({ time: runTime, par: lv.par, falls, allGems });
  const prev = record();
  const isBest = !prev || runTime < prev.time;
  const isBestScore = !prev || score.total > (prev.score || 0);
  const rec = {
    time: isBest ? runTime : prev.time,
    splits: isBest ? splits.slice() : prev.splits,
    stars: Math.max(stars, prev ? prev.stars : 0),
    medal: medal || !!(prev && prev.medal),
    score: Math.max(score.total, prev ? prev.score || 0 : 0),
  };
  // keep the fastest run as the ghost (or this one if there is none yet)
  if (isBest || !loadGhost(lv.id)) saveGhost(lv.id, recorder.data(runTime));

  let official = false;
  if (lv.daily) {
    const d = dailyState();
    d.rec = rec;
    if (!d.result) {
      official = true;
      d.result = { time: runTime, score: score.total, stars, medal, gems: gemsTaken, totalGems: level.gems.length, falls, tries: Math.max(1, d.tries) };
      const s = save.streak;
      s.count = s.last && daysBetween(s.last, d.key) === 1 ? s.count + 1 : s.last === d.key ? s.count : 1;
      s.last = d.key;
    }
  } else {
    save.best[lv.id] = rec;
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  }
  persist();

  const last = !lv.daily && levelIndex === LEVELS.length - 1;
  $('win-title').textContent = lv.daily
    ? (official ? `${lv.name} done!` : 'Practice run done')
    : last ? 'You beat the Grand Tour!' : 'Level complete!';
  const goals = [
    ['Finish', true],
    [`All gems (${gemsTaken}/${level.gems.length})`, allGems],
    [`Under ${lv.par}s (${fmt(runTime)})`, underPar],
  ];
  $('win-goals').innerHTML =
    goals.map(([t, ok]) => `<li class="${ok ? 'ok' : ''}">${ok ? '★' : '☆'} ${t}</li>`).join('') +
    `<li class="medal-goal ${medal ? 'ok' : ''}">${medal ? MEDAL : '○'} Dev medal: all gems under ${lv.dev}s</li>`;

  const lines = [];
  if (prev && !isBest) lines.push(`Best <b>${fmt(prev.time)}</b> (${fmtDelta(runTime - prev.time)})`);
  else if (prev) lines.push(`<span class="ahead">New best time! ${fmtDelta(runTime - prev.time)}</span>`);
  lines.push(`Falls <b>${falls}</b> · Best chain <b>x${score.bestChain}</b>`);
  lines.push(`Score <b>${fmtScore(score.total)}</b>${isBestScore && prev ? ' <span class="ahead">New high score!</span>' : prev ? ` · high ${fmtScore(prev.score || 0)}` : ''}`);
  lines.push(`<span class="bonus">${bonus.map(([t, p]) => `${t} +${fmtScore(p)}`).join(' · ')}</span>`);
  if (lv.daily && !official) lines.push(`Official result: <b>${fmt(dailyState().result.time)}</b> · ${fmtScore(dailyState().result.score)} pts`);
  if (lv.daily) lines.push(`🔥 ${streakCount()} day streak`);
  $('win-stats').innerHTML = lines.join('<br>');
  const starEls = document.querySelectorAll('#win-stars .star');
  starEls.forEach((el) => el.classList.remove('lit'));
  for (let k = 0; k < stars; k++) {
    setTimeout(() => { starEls[k].classList.add('lit'); sfx.star(k); }, 450 + k * 280);
  }
  show('btn-next', !last && !lv.daily);
  show('btn-share', !!lv.daily);
  show('hud', false);
  setTimeout(() => { if (state === 'won') show('win', true); }, 350);
}

function pause() {
  if (state !== 'playing' && state !== 'falling' && state !== 'countdown') return;
  pausedFrom = state;
  state = 'paused';
  input.enabled = false;
  input.reset();
  sfx.roll(0, false);
  show('pause', true);
}
function resume() {
  show('pause', false);
  input.enabled = true;
  state = pausedFrom === 'countdown' ? 'countdown' : 'playing';
}
function toMenu() {
  state = 'menu';
  input.enabled = false;
  input.reset();
  sfx.roll(0, false);
  show('pause', false);
  show('win', false);
  show('hud', false);
  show('menu', true);
  ghostMesh.visible = false;
  // the menu shows the next campaign level behind it
  if (def.daily) loadLevel(levelIndex);
  renderMenu();
  respawn(true);
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', () => { show('pause', false); resetRun(); beginCountdown(); });
$('btn-menu').addEventListener('click', toMenu);
$('btn-next').addEventListener('click', () => startLevel(levelIndex + 1));
$('btn-retry').addEventListener('click', () => (def.daily ? startDaily() : startLevel(levelIndex)));
$('btn-share').addEventListener('click', shareDaily);
$('btn-win-menu').addEventListener('click', toMenu);
$('btn-calib').addEventListener('click', () => { input.calibrate(); toast('Recalibrated'); });
$('btn-pause-calib').addEventListener('click', () => { input.calibrate(); toast('Recalibrated'); });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'paused') resume(); else pause();
  } else if (e.code === 'KeyR' && (state === 'playing' || state === 'falling')) {
    resetRun(); beginCountdown();
  } else if ((e.code === 'Enter' || e.code === 'Space') && state === 'won' && !def.daily && levelIndex < LEVELS.length - 1) {
    startLevel(levelIndex + 1);
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
let clock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  clock += dt;

  if (state === 'playing' || state === 'falling' || state === 'countdown') update(dt);
  else if (state === 'menu' || state === 'won') {
    simTime += dt;
    for (const s of level.movers) s.update(simTime);
  }
  updateCamera(dt);
  fx.update(dt);

  for (const m of level.checkpointMarkers) m.rotation.y += dt * 1.2;
  if (level.goalMarker) level.goalMarker.rotation.y += dt * 0.8;
  for (const g of level.gems) {
    if (!g.taken) {
      g.mesh.rotation.y += dt * 2.5;
      g.mesh.position.y = g.pos.y + Math.sin(clock * 3 + g.phase) * 0.08;
    }
  }
  for (const t of animatedTextures) t.offset.y = (t.offset.y - dt * 1.6) % 1;
  if (state !== 'menu') minimap.draw(ball.pos, cpIndex);
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);

  sun.position.copy(ball.pos).add(new THREE.Vector3(6, 14, 5));
  sun.target.position.copy(ball.pos);

  renderer.render(scene, camera);
}

// Test hook (only with ?debug in the URL): lets automated checks reach the results screen.
if (new URLSearchParams(location.search).has('debug')) {
  window.__beam = { win: () => win(), collectAll: () => { for (const g of level.gems) { g.taken = true; g.mesh.visible = false; } gemsTaken = level.gems.length; } };
}

loadLevel(Math.min(save.unlocked, LEVELS.length) - 1);
renderMenu();
requestAnimationFrame(frame);
