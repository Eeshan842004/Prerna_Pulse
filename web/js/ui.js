// Small DOM helpers and shared UI pieces. Text always goes in as text nodes, so nothing a
// child types can run as code.
import { api } from './api.js';
import { fmtTime } from './engine.js';
import { tr, getLang } from './i18n.js';

export function h(tag, props = {}, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className += ' ' + v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v; // only ever used with constant strings (icons)
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
// Re-render without losing what someone is typing: fields marked data-keep keep their value and focus.
export function mount(el, ...kids) {
  const kept = {}; const active = document.activeElement;
  el.querySelectorAll('[data-keep]').forEach((f) => { kept[f.dataset.keep] = { v: f.value, focus: f === active, s: f.selectionStart, e: f.selectionEnd }; });
  clear(el); el.append(...kids.flat().filter(Boolean));
  el.querySelectorAll('[data-keep]').forEach((f) => { const k = kept[f.dataset.keep]; if (!k) return; f.value = k.v; if (k.focus) { f.focus({ preventScroll: true }); try { f.setSelectionRange(k.s, k.e); } catch { /* select */ } } });
  return el;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastBox;
export function toast(text, kind = '') {
  toastBox ||= document.body.appendChild(h('div.toasts', { role: 'status', 'aria-live': 'polite' }));
  const t = h(`div.toast.${kind || 'plain'}`, {}, text); toastBox.append(t);
  setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
}
export async function attempt(fn, okText) {
  try { const r = await fn(); if (okText) toast(okText, 'good'); return r; } catch (e) { toast(e.message || String(e), 'bad'); throw e; }
}

// School clock: the demo clock can be moved forward, so "now" comes from the server.
export const clock = {
  offset: 0,
  async sync() { try { const r = await api.get('/demo/clock'); this.offset = new Date(r.now).getTime() - Date.now(); } catch { this.offset = 0; } },
  now() { return Date.now() + this.offset; },
};
export const t = (isoStr, withDay = true) => (isoStr ? fmtTime(new Date(isoStr).getTime(), withDay ? clock.now() : undefined) : '');
export function schoolDay() {
  const d = new Date(clock.now() + 330 * 60000);
  return `${tr(['d_sun', 'd_mon', 'd_tue', 'd_wed', 'd_thu', 'd_fri', 'd_sat'][d.getUTCDay()])} ${t(new Date(clock.now()).toISOString(), false)}`;
}
export function left(isoStr) {
  if (!isoStr) return '';
  let m = Math.round((new Date(isoStr).getTime() - clock.now()) / 60000);
  const late = m < 0; m = Math.abs(m);
  const d = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
  const s = d ? `${d} ${tr('u_d')} ${hh} ${tr('u_h')}` : hh ? `${hh} ${tr('u_h')} ${mm} ${tr('u_min')}` : `${mm} ${tr('u_min')}`;
  return late ? tr('late', { s }) : tr('left', { s });
}
export const ago = (isoStr) => { const m = Math.round((clock.now() - new Date(isoStr).getTime()) / 60000); return m < 1 ? tr('just_now') : m < 60 ? tr('min_ago', { n: m }) : m < 1440 ? tr('h_ago', { n: Math.round(m / 60) }) : tr('d_ago', { n: Math.round(m / 1440) }); };

// A friendly countdown chip. Amber when less than a fifth of the time is left, red only for help now.
export function countdown(c, label) {
  if (!c.deadline || !['open', 'acknowledged'].includes(c.status)) return null;
  const msLeft = new Date(c.deadline).getTime() - clock.now();
  const start = new Date(c.created_at).getTime(); const total = Math.max(1, new Date(c.deadline).getTime() - start);
  const tone = c.kind === 'help_now' ? 'help' : msLeft < 0 ? 'late' : msLeft / total < 0.2 ? 'warn' : 'ok';
  return h(`span.cd.${tone}`, {}, '⏱ ', label || tr(c.kind === 'help_now' ? 'cd_ack' : 'cd_reply', { time: t(c.deadline) }), h('b', {}, ` · ${left(c.deadline)}`));
}

export function avatar(name, cls = '') {
  const initials = (name || '?').replace(/^(Ms|Mr|Mrs|Dr|Nurse)\s+/, '').split(' ').map((x) => x[0]).slice(0, 2).join('');
  const hue = [...(name || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  return h(`span.av${cls ? '.' + cls : ''}`, { style: { background: `hsl(${hue} 70% 92%)`, color: `hsl(${hue} 55% 32%)` }, 'aria-hidden': 'true' }, initials);
}

// A sheet that slides up inside a given container (so it stays inside a phone frame in the story).
export function sheet(container, title, body, actions) {
  const back = h('div.sheet-back', { onclick: (e) => { if (e.target === back) close(); } });
  const close = () => back.remove();
  const box = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('div.sheet-grab'), h('h3', {}, title), body,
    h('div.row.end.gap', {}, ...actions.map((a) => h(`button.btn.${a.kind || 'ghost'}`, { 'data-demo': a.demo || null, onclick: async () => { if ((await a.run?.()) !== false) close(); } }, a.label))));
  back.append(box); (container || document.body).append(back);
  return close;
}

export const helplines = () => h('div.helpline', {}, h('span', {}, tr('help_need')), ' ', h('b', {}, tr('hl_childline')), ' · ', h('b', {}, tr('hl_112')), ' · ', h('b', {}, tr('hl_manas')));

export function speak(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = getLang() === 'hi' ? 'hi-IN' : 'en-IN'; u.rate = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { /* no speech */ }
}
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export const icon = {
  band: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="6" width="10" height="12" rx="3"/><path d="M9 6V3h6v3M9 18v3h6v-3"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5v14l9-7zM15 5h3v14h-3z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 5v14l-9-7zM6 5h3v14H6z"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 9h3l5-4v14l-5-4H5z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
};
export const ic = (name, cls = '') => h(`span.ic${cls ? '.' + cls : ''}`, { html: icon[name], 'aria-hidden': 'true' });
