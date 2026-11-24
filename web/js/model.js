// "Prerana AI on the band": a per-child Naive Bayes model that puts the most likely feeling for
// this child, right now, first in the band's menu (marked ★). The child always confirms.
// It is tiny (a few hundred counts per child), learns online from every confirmed choice, and
// borrows a school-wide prior so new children get sensible suggestions on day one.

export const CODES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const FEATURES = {
  tod: ['morning', 'mid', 'afternoon'],
  dow: ['1', '2', '3', '4', '5', '6'],
  period: ['Assembly', 'English', 'Hindi', 'Science', 'Maths', 'PT', 'Lunch', 'Social Studies', 'Computer', 'Art', 'Library', 'Games', 'none'],
  rise: ['self', 'r20', 'r30', 'r45'],
  move: ['still', 'light', 'active'],
  last: ['none', ...CODES.map(String)],
};
const W = 16; // the school prior counts as 16 observations of this child (tuned on simulated children)
const ALPHA = 1; // Laplace smoothing
const PW = 0.5; // feature weight: softens Naive Bayes over-confidence with few examples
export const USED = ['period', 'rise', 'move', 'tod', 'dow']; // 'last' is stored but did not help

export const newModel = () => ({ n: 0, f: {}, x: {} });
export function riseBucket(pct) { return pct == null ? 'self' : pct >= 45 ? 'r45' : pct >= 30 ? 'r30' : 'r20'; }
export function todOf(hh, mm) { const m = hh * 60 + mm; return m < 630 ? 'morning' : m < 780 ? 'mid' : 'afternoon'; }
export function cleanCtx(ctx) {
  const out = {};
  for (const [k, vals] of Object.entries(FEATURES)) { const v = String(ctx[k] ?? ''); out[k] = vals.includes(v) ? v : vals[vals.length - 1] === 'none' ? 'none' : vals[0]; }
  return out;
}
export function update(m, ctx, code) {
  const c = cleanCtx(ctx);
  m.n++; m.f[code] = (m.f[code] || 0) + 1;
  for (const [k, v] of Object.entries(c)) { const xk = (m.x[k] ||= {}); const xv = (xk[v] ||= {}); xv[code] = (xv[code] || 0) + 1; }
}
// Probabilities for every feeling, best first.
export function suggest(child, school, ctx, codes = CODES) {
  const c = cleanCtx(ctx); const F = codes.length;
  const ps = (code) => ((school?.f?.[code] || 0) + ALPHA) / ((school?.n || 0) + ALPHA * F);
  const scores = codes.map((code) => {
    const nf = child?.f?.[code] || 0; const prior = ps(code);
    let s = Math.log((nf + W * prior + 0.01) / ((child?.n || 0) + W + 0.01 * F));
    for (const k of USED) {
      const v = c[k]; const V = FEATURES[k].length;
      const sch = ((school?.x?.[k]?.[v]?.[code] || 0) + ALPHA) / ((school?.f?.[code] || 0) + ALPHA * V);
      const mine = child?.x?.[k]?.[v]?.[code] || 0;
      s += PW * Math.log((mine + W * sch) / (nf + W));
    }
    return { code, s };
  });
  const max = Math.max(...scores.map((x) => x.s));
  const z = scores.reduce((t, x) => t + Math.exp(x.s - max), 0);
  return scores.map((x) => ({ code: x.code, p: Math.exp(x.s - max) / z })).sort((a, b) => b.p - a.p);
}

// ------------------------------------------------------------------ simulated children
// Children with known habits, used to (1) give the school a prior and (2) measure the model
// honestly: every choice is predicted BEFORE the model sees it (online evaluation).
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const HABITS = [
  { when: (x) => x.period === 'Maths', code: 2, p: 0.55 }, // worried in Maths
  { when: (x) => x.period === 'Science' && x.dow === '5', code: 6, p: 0.6 }, // stressed before Friday tests
  { when: (x) => x.tod === 'afternoon', code: 3, p: 0.35 }, // sad in the afternoon
  { when: (x) => x.period === 'Lunch', code: 8, p: 0.5 }, // left out at lunch
  { when: (x) => x.move === 'active' || x.period === 'PT' || x.period === 'Games', code: 10, p: 0.75 }, // just active
  { when: (x) => x.dow === '1', code: 6, p: 0.4 }, // stressed on Mondays
  { when: (x) => x.period === 'English' && x.rise === 'r45', code: 5, p: 0.5 }, // scared before reading aloud
  { when: (x) => x.tod === 'mid' && x.period === 'Hindi', code: 4, p: 0.4 }, // angry after a quarrel at break
  { when: (x) => x.period === 'Art', code: 7, p: 0.35 },
];
const BASE = [[1, 0.5], [2, 0.1], [3, 0.08], [4, 0.06], [5, 0.04], [6, 0.08], [7, 0.03], [8, 0.05], [9, 0.03], [10, 0.03]];
const SLOTS = [['08:30', 'English'], ['09:10', 'Hindi'], ['09:50', 'Science'], ['10:45', 'Maths'], ['11:30', 'PT'], ['12:15', 'Lunch'], ['12:55', 'Social Studies'], ['13:35', 'Computer'], ['14:15', 'Art'], ['15:00', 'Library']];
function pick(r, pairs) { let u = r(), acc = 0; for (const [v, p] of pairs) { acc += p; if (u < acc) return v; } return pairs[pairs.length - 1][0]; }

// The feeling comes first (from the child's habits and the moment), then the body: a bigger
// heart-rate rise goes with scared, angry or just-active; movement goes with PT and games.
const RISE = { 1: [0.6, 0.3, 0.1], 2: [0.35, 0.45, 0.2], 3: [0.5, 0.35, 0.15], 4: [0.15, 0.4, 0.45], 5: [0.1, 0.35, 0.55], 6: [0.3, 0.45, 0.25], 7: [0.45, 0.4, 0.15], 8: [0.5, 0.35, 0.15], 9: [0.3, 0.4, 0.3], 10: [0.05, 0.25, 0.7] };
export function simulateChild(seed, days = 30, habits = null) {
  const r = rng(seed);
  const mine = habits || [...HABITS].sort(() => r() - 0.5).slice(0, 2 + Math.floor(r() * 2));
  const events = []; let last = 'none';
  for (let d = 0; d < days; d++) {
    const dow = String(1 + (d % 6));
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const [hm, period] = SLOTS[Math.floor(r() * SLOTS.length)];
      const [hh, mm] = hm.split(':').map(Number);
      const asked = r() < 0.75;
      const pe = period === 'PT' || period === 'Games';
      const ctx = { tod: todOf(hh, mm), dow, period, last };
      let code = null;
      for (const h of mine) if (h.when({ ...ctx, move: pe ? 'active' : 'still' }) && r() < h.p) { code = h.code; break; }
      if (code == null) code = pick(r, BASE);
      if (code === 10 && !pe && r() < 0.6) code = 1;
      ctx.rise = asked ? pick(r, ['r20', 'r30', 'r45'].map((v, i) => [v, RISE[code][i]])) : 'self';
      ctx.move = code === 10 ? (r() < 0.7 ? 'active' : 'light') : r() < 0.12 ? 'light' : 'still';
      events.push({ day: d, ctx, code }); last = String(code);
    }
  }
  return { habits: mine, events };
}

// Online evaluation over many simulated children, against "most common feeling so far".
// Seed 11 was used for tuning; the default seed 23 is a held-out set of children.
export function evaluate({ children = 60, days = 30, seed = 23, warmup = 8 } = {}) {
  const kids = Array.from({ length: children }, (_, i) => simulateChild(seed * 1000 + i, days));
  const school = newModel(); const models = kids.map(() => newModel()); const global = {};
  let n = 0, top1 = 0, top3 = 0, b1 = 0, b3 = 0, nd = 0, d3 = 0, bd3 = 0;
  const HARD = new Set([2, 3, 4, 5, 6, 7, 8]);
  for (let d = 0; d < days; d++) {
    kids.forEach((kid, i) => {
      for (const ev of kid.events.filter((e) => e.day === d)) {
        if (models[i].n >= warmup) {
          const ranked = suggest(models[i], school, ev.ctx).map((x) => x.code);
          const common = CODES.slice().sort((a, b) => (global[b] || 0) - (global[a] || 0));
          n++; if (ranked[0] === ev.code) top1++; if (ranked.slice(0, 3).includes(ev.code)) top3++;
          if (common[0] === ev.code) b1++; if (common.slice(0, 3).includes(ev.code)) b3++;
          if (HARD.has(ev.code)) { nd++; if (ranked.slice(0, 3).includes(ev.code)) d3++; if (common.slice(0, 3).includes(ev.code)) bd3++; }
        }
        update(models[i], ev.ctx, ev.code); update(school, ev.ctx, ev.code); global[ev.code] = (global[ev.code] || 0) + 1;
      }
    });
  }
  const pct = (x, of = n) => Math.round((x / Math.max(1, of)) * 1000) / 10;
  return { model: 'Per-child Naive Bayes (Laplace smoothing, school-wide prior worth 16 observations, feature weight 0.5, online updates)',
    features: USED, children, days, events_scored: n, warmup_choices: warmup,
    top1: pct(top1), top3: pct(top3), baseline: 'Most common feeling so far (whole school)', baseline_top1: pct(b1), baseline_top3: pct(b3),
    difficult_scored: nd, difficult_top3: pct(d3, nd), baseline_difficult_top3: pct(bd3, nd),
    data: 'Simulated children with known habits (no real children). Real accuracy can only come from a pilot.', school };
}
export { HABITS };
