/**
 * Ghost replays: the ball's position is sampled against run time while you play; your
 * fastest run is kept in localStorage and replayed as a see-through ball next time.
 */

const HZ = 30;
const PREFIX = 'beamroller.ghost.';

export class GhostRecorder {
  start() { this.p = []; this.next = 0; }
  sample(t, pos) {
    while (t >= this.next) {
      this.p.push(Math.round(pos.x * 100) / 100, Math.round(pos.y * 100) / 100, Math.round(pos.z * 100) / 100);
      this.next += 1 / HZ;
    }
  }
  data(time) { return { hz: HZ, time, p: this.p }; }
}

export function loadGhost(id) {
  try {
    const g = JSON.parse(localStorage.getItem(PREFIX + id) || 'null');
    return g && g.p && g.p.length >= 6 ? g : null;
  } catch { return null; }
}

export function saveGhost(id, data) {
  try {
    // only one daily ghost is worth keeping: drop older days' ones
    if (id.startsWith('daily-')) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX + 'daily-') && k !== PREFIX + id) localStorage.removeItem(k);
      }
    }
    localStorage.setItem(PREFIX + id, JSON.stringify(data));
  } catch { /* storage full or unavailable: no ghost this time */ }
}

/** Ghost position at run time t (clamped to its last sample). */
export function ghostAt(g, t, out) {
  const n = g.p.length / 3;
  const f = Math.max(0, Math.min(n - 1, t * g.hz));
  const i = Math.min(n - 2, Math.floor(f)), k = f - i;
  const a = i * 3, b = a + 3;
  out.set(g.p[a] + (g.p[b] - g.p[a]) * k, g.p[a + 1] + (g.p[b + 1] - g.p[a + 1]) * k, g.p[a + 2] + (g.p[b + 2] - g.p[a + 2]) * k);
  return out;
}
