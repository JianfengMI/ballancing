/**
 * Score attack: every run also earns points. Gems, boosts, jumps and checkpoints score,
 * and doing them in quick succession builds a chain that multiplies their points.
 * Falling costs points and breaks the chain. Finishing adds bonuses for time, no falls
 * and collecting every gem.
 */

export const CHAIN_WINDOW = 1.6;   // seconds allowed between scoring moves to keep a chain
const POINTS = { gem: 100, boost: 50, jump: 150, checkpoint: 250 };
const FALL = 250;

export class Score {
  constructor() { this.reset(); }

  reset() {
    this.total = 0;
    this.chain = 0;
    this.bestChain = 0;
    this.lastT = -Infinity;
  }

  get mult() { return Math.min(5, 1 + 0.5 * Math.max(0, this.chain - 1)); }

  /** A scoring move at run time t. Returns { points, chain, mult }. */
  event(kind, t) {
    this.chain = t - this.lastT <= CHAIN_WINDOW ? this.chain + 1 : 1;
    this.lastT = t;
    this.bestChain = Math.max(this.bestChain, this.chain);
    const points = Math.round(POINTS[kind] * this.mult);
    this.total += points;
    return { points, chain: this.chain, mult: this.mult };
  }

  /** Chain still alive at run time t? */
  live(t) { return this.chain > 1 && t - this.lastT <= CHAIN_WINDOW; }

  fall() {
    this.total = Math.max(0, this.total - FALL);
    this.chain = 0;
    this.lastT = -Infinity;
  }

  /** Finish bonuses; returns them as [label, points] rows (also added to the total). */
  finish({ time, par, falls, allGems }) {
    const rows = [['Finish', 1000]];
    const timeBonus = Math.round(Math.max(0, par - time) * 200);
    if (timeBonus) rows.push([`Time bonus`, timeBonus]);
    if (falls === 0) rows.push(['No falls', 500]);
    if (allGems) rows.push(['All gems', 500]);
    for (const [, p] of rows) this.total += p;
    return rows;
  }
}

export const fmtScore = (n) => n.toLocaleString('en-US');
