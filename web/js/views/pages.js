// Start, "Try it yourself" (the band + one phone with a role switcher) and "Under the hood".
import { api } from '../api.js';
import { loadBands, makeBand } from '../band.js';
import * as C from '../crypto.js';
import { h, mount, toast, attempt, clock, schoolDay, avatar, helplines, t } from '../ui.js';
import { tr, getLang } from '../i18n.js';
import { gwName, rssiFrom, GATEWAYS, BY_CODE } from '../content.js';
import { bandView } from './bandview.js';
import { adultApp } from './apps.js';

export function homeView(root) {
  mount(root, h('div.home', {},
    h('section.hero', {},
      h('div.hero-text', {},
        h('div.eyebrow', {}, 'Prerana Pulse'),
        h('h1', {}, tr('hero_1'), h('br'), h('span.grad', {}, tr('hero_2'))),
        h('p.lead', {}, tr('hero_lead')),
        h('div.row.gap.wrap', {}, h('a.btn.primary.huge', { href: '#story' }, '▶ ', tr('watch_story')), h('a.btn.light.huge', { href: '#try' }, '👆 ', tr('try_it')))),
      h('div.hero-band', { 'aria-hidden': 'true' }, h('div.watch-wrap.hero-watch', {},
        h('div.watch', {}, h('div.wstrap.top', {}, h('i')),
          h('div.case', {}, h('div.band-face', {}, h('div.oled.star', {}, h('div.o-top', {}, tr('o_how')), h('div.o-big', {}, '★ 😟 ', tr('f_worried')), h('div.o-small', {}, '●······'), h('div.o-hint', {}, tr('o_hint_menu'))), h('i.ring.r1'), h('i.ring.r2')),
            h('div.case-btn', {}, h('div.btn-wrap', {}, h('div.band-btn')), h('span.btn-label', {}, tr('the_button')))),
          h('div.wstrap.bottom', {}, h('i'))),
        h('div.hero-cap', {}, tr('hero_cap'))))),
    h('section.values', {},
      ...[['🤫', 'v1', 'v1s'], ['💬', 'v2', 'v2s'], ['🆘', 'v3', 'v3s'], ['⏱', 'v4', 'v4s'], ['🏃', 'v5', 'v5s'], ['🔒', 'v6', 'v6s']].map(([e, a, b]) => h('div.value', {}, h('span.v-e', {}, e), h('b', {}, tr(a)), h('span', {}, tr(b))))),
    h('section.howto', {}, h('h2', {}, tr('band_how')),
      h('div.taps', {}, ...[['👆', 'g_tap'], ['✊ 1s', 'g_hold'], ['👆👆', 'g_double'], ['✊ 5s', 'g_sos']].map(([e, k]) => h('div.tap', {}, h('span.tap-e', {}, e), h('span', {}, tr(k)))))),
    h('section.flows', {}, h('h2', {}, tr('how_title')), h('p.muted', {}, tr('how_sub')),
      h('div.flow-grid', {}, ...[['img/flow-band.png', 'fc1'], ['img/flow-loop.png', 'fc2']].map(([src, k]) => h('div.flow-card', {}, h('b', {}, tr(k)),
        h('a', { href: src, target: '_blank', rel: 'noopener', title: tr('open_full') }, h('img', { src, alt: tr(k), loading: 'lazy' })), h('a.small', { href: src, target: '_blank', rel: 'noopener' }, '🔍 ', tr('open_full')))))),
    h('section.who', {}, h('h2', {}, tr('who_connected')),
      h('div.who-grid', {}, ...[['⌚', 'who_child', 'who_child_s'], ['👩‍🏫', 'who_teacher', 'who_teacher_s'], ['🧑‍⚕️', 'who_counsellor', 'who_counsellor_s'], ['🏫', 'who_principal', 'who_principal_s'], ['👪', 'who_parent', 'who_parent_s']]
        .map(([e, a, b]) => h('div.who-card', {}, h('span.v-e', {}, e), h('b', {}, tr(a)), h('span.small', {}, tr(b)))))),
    h('p.small.muted.disclaimer', {}, tr('disclaimer'))));
}

// Free play: any band on the left, any adult on the right, a clock you can move forward.
const ROLES = [['teacher', 'Ms Anjali Mehta'], ['counsellor', 'Ms Farah Khan'], ['principal', 'Mr Suresh Iyer'], ['parent', 'Mrs Sunita Sharma']];
let tryState = { band: 'Riya Sharma', role: 'teacher', done: new Set() };
const TASKS = [
  ['feel', (b) => b.log.some((l) => l.dir === 'tx' && l.msg.label.startsWith('Feeling:'))], ['ask', (b) => b.questions.n > 0],
  ['pt', (b) => b.log.some((l) => l.dir === 'tx' && /^PT mode \d/.test(l.msg.label))], ['talk', (b) => b.log.some((l) => l.dir === 'tx' && l.msg.label.startsWith('Talk to'))],
  ['call', (b) => b.log.some((l) => l.dir === 'tx' && l.msg.label.startsWith('Okay: message seen'))], ['sos', (b) => b.log.some((l) => l.dir === 'tx' && /^SOS($|:)/.test(l.msg.label))],
];
export async function tryView(root) {
  const bands = await loadBands(); const users = await api.get('/auth/demo-users');
  let bandClean = null, appClean = null, curBand = null; const tasksBox = h('div');
  function drawTasks() {
    if (curBand) for (const [k, f] of TASKS) if (f(curBand)) tryState.done.add(k);
    mount(tasksBox, h('div.tasks', { 'data-demo': 'tasks' }, h('div.tasks-h', {}, h('span', {}, '🎯 ', tr('try_tasks')), h('span.small.muted', {}, tr('tasks_done', { n: tryState.done.size, m: TASKS.length }))),
      h('div.task-grid', {}, ...TASKS.map(([k], i) => h(`div.task${tryState.done.has(k) ? '.done' : ''}`, {}, h('span.tn', {}, tryState.done.has(k) ? '✓' : i + 1), h('div', {}, h('b', {}, tr(`tk_${k}`)), h('span.small', {}, tr(`tk_${k}_s`))))))));
  }
  const bandBox = h('div.frame-scroll'); const phoneBox = h('div.frame-scroll');
  const clockEl = h('span.clock-chip');
  const tick = () => mount(clockEl, '🕒 ', schoolDay());
  async function mountBand() { bandClean?.(); const info = (await loadBands()).find((b) => b.student === tryState.band) || bands[0]; const b = await makeBand(info); b.learnNow(80, 3); bandClean = bandView(bandBox, b); curBand = b; let last = ''; b.addEventListener('change', () => { const k = TASKS.filter(([, f]) => f(b)).length + ':' + tryState.done.size; if (k !== last) { last = k; drawTasks(); } }); drawTasks(); }
  async function mountApp() { appClean?.cleanup?.(); const u = users.find((x) => x.name === ROLES.find((r) => r[0] === tryState.role)[1]); const s = await api.post('/auth/login', { user_id: u.id }); appClean = adultApp(phoneBox, s); }
  async function moveClock(body) { await attempt(() => api.post('/demo/clock', body)); await clock.sync(); tick(); }
  const bar = () => h('div.try-bar', {},
    h('div.try-group', {}, h('span.small.muted', {}, '⌚ ', tr('try_band')), h('div.seg.sm', {}, ...[['Riya Sharma', 'Riya · 7B'], ['Dev Malhotra', 'Dev · 4A (junior)'], ['Meera Joshi', 'Meera · 7B'], ['Aarav Gupta', 'Aarav · 7B']]
      .map(([n, l]) => h(`button${tryState.band === n ? '.on' : ''}`, { onclick: async () => { tryState.band = n; mount(barBox, bar()); await mountBand(); } }, l)))),
    h('div.try-group', {}, h('span.small.muted', {}, '📱 ', tr('try_phone')), h('div.seg.sm', {}, ...ROLES.map(([r]) => h(`button${tryState.role === r ? '.on' : ''}`, { onclick: async () => { tryState.role = r; mount(barBox, bar()); await mountApp(); } }, tr(`role_${r}`))))),
    h('div.try-group', {}, clockEl, h('button.btn.xs.ghost', { onclick: () => moveClock({ advance_minutes: 15 }) }, '+15 min'), h('button.btn.xs.ghost', { onclick: () => moveClock({ advance_minutes: 11 }) }, '+10 min'),
      h('button.btn.xs.ghost', { onclick: () => moveClock({ set_local: '15:31' }).catch(() => {}) }, '⏩ 3:31 pm'),
      h('button.btn.xs.light', { onclick: async () => { tryState.done = new Set(); await attempt(() => api.post('/demo/reset'), tr('reset_ok')); await clock.sync(); tick(); await mountBand(); await mountApp(); } }, '⟲ ', tr('reset'))));
  const barBox = h('div', {}, bar());
  mount(root, h('div.try-page', {}, h('div.try-head', {}, h('h1.page-h', {}, '👆 ', tr('try_it')), h('p.muted', {}, tr('try_sub'))), barBox, tasksBox,
    h('div.stage.duo.try', {}, h('section.frame.k-band', {}, h('div.device.band', {}, h('div.frame-screen', {}, bandBox))), h('section.frame.k-phone', {}, h('div.device.phone', {}, h('div.frame-screen', {}, phoneBox))))));
  tick(); const tt = setInterval(tick, 5000);
  await mountBand(); await mountApp();
  return () => { clearInterval(tt); bandClean?.(); appClean?.cleanup?.(); };
}

export async function techView(root) {
  const card = await api.get('/model/card');
  const row = (a, b, c) => h('tr', {}, h('td', {}, a), h('td', {}, h(`span.st-tag.${b}`, {}, tr(`real_${b}`))), h('td', {}, c));
  const box = (t1, t2) => h('div.arch-box', {}, h('b', {}, t1), h('span.small', {}, t2));
  const out = h('div.tool-out');
  async function exactlyOnce() {
    const key = await C.demoBandKey(1003); const ep = (await api.get('/gw/time')).epoch; const counter = 5000 + Math.floor(Math.random() * 9000);
    const p = C.hex(await C.buildPacket(key, counter, ep, C.T.FEELING, C.packFeeling(1)));
    const [a, b] = await Promise.all([api.air({ id: 'gw-7b' }, p, -55), api.air({ id: 'gw-stairs' }, p, -71)]);
    const replay = await api.air({ id: 'gw-7b' }, p, -55);
    const bad = C.unhex(p); bad[12] ^= 1; const tampered = await api.air({ id: 'gw-7b' }, C.hex(bad), -55);
    mount(out, h('ul', {}, h('li', {}, tr('eo_two', { a: a.status, b: b.status })), h('li', {}, tr('eo_same', { ok: a.receipt === b.receipt ? '✓' : '✗' })), h('li', {}, tr('eo_replay', { s: replay.status })), h('li', {}, tr('eo_tamper', { s: tampered.status, r: tampered.reason || '' }))));
  }
  mount(root, h('div.page.tech', {}, h('h1.page-h', {}, '🔧 ', tr('under_hood')), h('p.muted', {}, tr('tech_sub')),
    h('section.card', {}, h('h3', {}, tr('arch')), h('div.arch', {}, box('⌚ Pulse Band', 'ESP32-C3 · OLED · 19 encrypted bytes'), h('span.arrow', {}, '→'), box('📡 Gateways', tr('arch_gw')), h('span.arrow', {}, '→'),
      box('🖥 Prerana Pulse service', tr('arch_srv')), h('span.arrow', {}, '→'), box('📱 Adult apps', tr('arch_apps')))),
    h('section.card.model-card', {}, h('h3', {}, '✨ ', tr('model_card')), h('p', {}, card.model), h('div.kpis', {},
      h('div.kpi.brand', {}, h('div.kpi-v', {}, `${card.top1}%`), h('div.kpi-l', {}, tr('mc_top1', { b: card.baseline_top1 }))),
      h('div.kpi.brand', {}, h('div.kpi-v', {}, `${card.top3}%`), h('div.kpi-l', {}, tr('mc_top3', { b: card.baseline_top3 }))),
      h('div.kpi.grey', {}, h('div.kpi-v', {}, `${card.difficult_top3}%`), h('div.kpi-l', {}, tr('mc_hard', { b: card.baseline_difficult_top3 })))),
      h('p.small', {}, tr('mc_data', { n: card.children, d: card.days, e: card.events_scored, w: card.warmup_choices }), ' ', h('b', {}, tr('mc_features')), ' ', card.features.join(', '), '.'),
      h('p.small.muted', {}, card.data, ' ', tr('mc_honest'))),
    h('section.card', {}, h('h3', {}, '🧪 ', tr('eo_title')), h('p.small.muted', {}, tr('eo_sub')), h('button.btn.light', { onclick: () => exactlyOnce().catch((e) => toast(e.message, 'bad')) }, '▶ ', tr('eo_run')), out),
    h('section.card', {}, h('h3', {}, '📍 ', tr('rssi_title')), h('p.small.muted', {}, tr('rssi_sub')),
      h('table.tbl', {}, h('thead', {}, h('tr', {}, h('th', {}, tr('rssi_child_near')), ...GATEWAYS.slice(0, 6).map((g) => h('th', {}, gwName(g.id, getLang()).replace(/ \(.*\)/, ''))))),
        h('tbody', {}, ...['gw-stairs', 'gw-library', 'gw-playground'].map((near) => h('tr', {}, h('td', {}, gwName(near, getLang())), ...GATEWAYS.slice(0, 6).map((g) => { const v = rssiFrom(near, g.id); return h(`td${g.id === near ? '.best' : v < -86 ? '.far' : ''}`, {}, v < -86 ? '—' : `${v}`); })))))),
    h('section.card', {}, h('h3', {}, tr('what_real')), h('table.tbl', {}, h('tbody', {},
      row(tr('wr_engine'), 'built', tr('wr_engine_s')), row(tr('wr_protocol'), 'built', tr('wr_protocol_s')), row(tr('wr_band'), 'built', tr('wr_band_s')), row(tr('wr_model'), 'built', tr('wr_model_s')),
      row(tr('wr_apps'), 'built', tr('wr_apps_s')), row(tr('wr_backend'), 'partial', tr('wr_backend_s')), row(tr('wr_rssi'), 'sim', tr('wr_rssi_s')), row(tr('wr_sms'), 'sim', tr('wr_sms_s')),
      row(tr('wr_erp'), 'sim', tr('wr_erp_s')), row(tr('wr_act'), 'sim', tr('wr_act_s')), row(tr('wr_fw'), 'untested', tr('wr_fw_s'))))),
    h('section.card', {}, h('h3', {}, '✅ ', tr('tests_title')), h('p.small', {}, tr('tests_body'))),
    helplines()));
}
