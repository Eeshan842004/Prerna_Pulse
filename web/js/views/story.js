// Story Mode (v2): Riya's band on the left, ONE adult phone on the right (the name tag changes:
// Ms Mehta, Ms Khan, Mr Iyer, Mrs Sharma). Press Play once and it runs slowly on its own: a cursor
// moves to each button, every click flashes in colour, a pointer arrow names what is happening,
// the steps and a "What just happened" log sit at the bottom right. Everything runs through the
// same engine and virtual band as "Try it yourself", so what you see is the real behaviour.
import { api } from '../api.js';
import { loadBands, makeBand } from '../band.js';
import { h, mount, clock, schoolDay, ic, sleep as raw, helplines, avatar } from '../ui.js';
import { tr, onLang } from '../i18n.js';
import { BY_CODE } from '../content.js';
import { bandView } from './bandview.js';
import { adultApp } from './apps.js';

const CANCEL = Symbol('cancel');
const COLORS = ['#6C4CF1', '#0F9D6B', '#E8590C', '#D6336C', '#1C7ED6', '#B45309'];
const SPEED = { slow: { gap: 3200, move: 1000, tap: 650, point: 2800, scroll: 700 }, normal: { gap: 1500, move: 600, tap: 420, point: 1500, scroll: 420 } };
const PHONES = [
  { id: 'mehta', name: 'Ms Anjali Mehta', tag: 'tag_mehta' }, { id: 'khan', name: 'Ms Farah Khan', tag: 'tag_khan' },
  { id: 'iyer', name: 'Mr Suresh Iyer', tag: 'tag_iyer' }, { id: 'parent', name: 'Mrs Sunita Sharma', tag: 'tag_parent' },
];

export async function storyView(root) {
  let token = 0, playing = false, stepOnce = false, fast = false, idx = 0, speed = 'slow', colorI = 0, finished = false, errorKey = null;
  let pointState = null, rafId = 0, clockT = 0, phone = 'mehta', logLines = [];
  const S = { band: null, apps: {}, cleanups: [] };
  const sp = () => SPEED[speed];
  const active = () => playing || stepOnce || fast;
  const nextColor = () => COLORS[colorI++ % COLORS.length];
  const B = () => S.band;
  const itemIndex = (pred) => B().menu.items.findIndex(pred);

  // ------------------------------------------------------------------ chapters
  const CH = [
    { key: 'ch1', steps: [
      { f: 'band', k: 's1_1', log: 'l1_1', run: async (x) => { x.point('band', 'band-face', 'p_band');
        for (let n = 0; n <= 20; n++) { for (const v of Object.values(B().base)) Object.assign(v, { n, mean: 80, m2: 9 * Math.max(0, n - 1) }); B().changed(); await x.sleep(140); }
        B().learnNow(80, 3); B().pauseSensing = false; await x.sleep(sp().point * 0.6); } },
      { f: 'mehta', k: 's1_2', log: 'l1_2', run: async (x) => { await x.wait('mehta', 'chosen-by'); x.point('mehta', 'chosen-by', 'p_chosen'); await x.sleep(sp().point); } },
    ] },
    { key: 'ch2', steps: [
      { f: 'band', k: 's2_1', log: 'l2_1', run: async (x) => { B().move = 0; B().hrTarget = 112; B().changed(); await x.sleep(1200); x.point('band', 'band-hr', 'p_hr'); await x.sleep(sp().point); } },
      { f: 'band', k: 's2_2', log: 'l2_2', run: async (x) => { B().ask(false); await x.sleep(900); x.point('band', 'band-face', B().menu?.star === 2 ? 'p_star_worried' : 'p_star'); await x.sleep(sp().point + 800); } },
      { f: 'band', k: 's2_3', log: 'l2_3', run: async (x) => { await x.goTo((it) => it.t === 'feel' && it.code === 2); await x.holdChoose(); await x.sleep(1200); x.point('band', 'band-face', 'p_exercise'); await x.sleep(sp().point + 2500); } },
      { f: 'band', k: 's2_4', log: 'l2_4', run: async (x) => { if (B().mode === 'exercise') B().endExercise(); await x.sleep(700); x.point('band', 'band-face', 'p_better'); await x.sleep(sp().point * 0.6); await x.tapBand(1); B().hrTarget = 82; await x.sleep(900); } },
      { f: 'mehta', k: 's2_5', log: 'l2_5', run: async (x) => { x.point('mehta', 'headline', 'p_private'); await x.sleep(sp().point); } },
    ] },
    { key: 'ch3', steps: [
      { f: 'band', k: 's3_1', log: 'l3_1', run: async (x) => { await x.tapBand(2, true); await x.sleep(600); await x.goTo((it) => it.t === 'pt'); await x.holdChoose(); await x.sleep(700); await x.holdChoose(); await x.sleep(900); x.point('band', 'band-face', 'p_pt_on'); await x.sleep(sp().point * 0.8); } },
      { f: 'band', k: 's3_2', log: 'l3_2', run: async (x) => { B().move = 2; B().hrTarget = 132; B().changed(); await x.sleep(1600); x.point('band', 'band-hr', 'p_pt_noask'); await x.sleep(sp().point + 500); } },
      { f: 'mehta', k: 's3_3', log: 'l3_3', run: async (x) => { await x.click('mehta', 'tab-class'); await x.wait('mehta', 'pt-note'); x.point('mehta', 'pt-note', 'p_tt_pt'); await x.sleep(sp().point); B().endPt(); B().move = 0; B().hrTarget = 82; B().changed(); } },
    ] },
    { key: 'ch4', steps: [
      { f: 'clock', k: 's4_1', log: 'l4_1', run: async (x) => { x.point('top', 'clock', 'p_later'); await x.sleep(sp().point * 0.5); await x.clockJump({ set_local: '13:30' }, '1:30 pm'); } },
      { f: 'band', k: 's4_2', log: 'l4_2', run: async (x) => { await x.tapBand(2, true); await x.sleep(600); await x.goTo((it) => it.t === 'feel' && it.code === 3); x.point('band', 'band-face', 'p_pick_sad'); await x.sleep(sp().point * 0.7); await x.holdChoose(); await x.sleep(1500); } },
      { f: 'band', k: 's4_3', log: 'l4_3', run: async (x) => { await x.sleep(2500); if (B().mode === 'exercise') B().endExercise(); await x.sleep(600); await x.tapBand(1); await x.sleep(700); } },
      { f: 'khan', k: 's4_4', log: 'l4_4', run: async (x) => { await x.click('khan', 'tab-patterns'); await x.wait('khan', 'pattern'); x.point('khan', 'pattern', 'p_pattern'); await x.sleep(sp().point + 500); } },
      { f: 'khan', k: 's4_5', log: 'l4_5', run: async (x) => { await x.click('khan', 'pattern'); await x.click('khan', 'child-open'); await x.wait('khan', 'timeline'); x.point('khan', 'timeline', 'p_timeline'); await x.sleep(sp().point + 500); } },
      { f: 'khan', k: 's4_6', log: null, run: async (x) => { await x.click('khan', 'back'); await x.sleep(400); } },
    ] },
    { key: 'ch5', steps: [
      { f: 'band', k: 's5_1', log: 'l5_1', run: async (x) => { await x.tapBand(2, true); await x.sleep(600); await x.goTo((it) => it.t === 'talk'); await x.holdChoose(); await x.sleep(800); x.point('band', 'band-face', 'p_talk_menu'); await x.sleep(sp().point * 0.6); await x.holdChoose(); await x.sleep(1500); x.point('band', 'band-caption', 'p_onebuzz'); await x.sleep(sp().point); } },
      { f: 'mehta', k: 's5_2', log: 'l5_2', run: async (x) => { await x.click('mehta', 'tab-today'); await x.wait('mehta', 'req-card'); x.point('mehta', 'countdown', 'p_newreq'); await x.sleep(sp().point + 500); } },
      { f: 'clock', k: 's5_3', log: 'l5_3', run: async (x) => { const from = x.el('mehta', 'req-card'); x.point('top', 'clock', 'p_clock'); await x.sleep(sp().point * 0.5);
        await x.clockJump({ set_local: '15:31' }, '3:31 pm'); await x.sleep(400); x.point('mehta', 'moved-line', 'p_moved_on'); await x.sleep(sp().point * 0.8); await x.fly(from, 'khan'); } },
      { f: 'khan', k: 's5_4', log: 'l5_4', run: async (x) => { await x.click('khan', 'tab-requests'); await x.wait('khan', 'req-card'); x.point('khan', 'req-card', 'p_khan_has'); await x.sleep(sp().point); } },
      { f: 'khan', k: 's5_5', log: 'l5_5', run: async (x) => { await x.click('khan', 'call-btn'); await x.wait('khan', 'call-send'); await x.click('khan', 'when-lunch'); await x.click('khan', 'where-counselling'); x.point('khan', 'call-preview', 'p_preview'); await x.sleep(sp().point); await x.click('khan', 'call-send'); await x.sleep(800); } },
      { f: 'band', k: 's5_6', log: 'l5_6', run: async (x) => { await B().fetchInbox(); await x.waitFor(() => B().message?.kind === 'call', 6000); if (B().mode !== 'message') B().setMode('message'); await x.sleep(600); x.point('band', 'band-face', 'p_band_msg'); await x.sleep(sp().point + 500); await x.holdChoose(); await x.sleep(1200); } },
      { f: 'khan', k: 's5_7', log: 'l5_7', run: async (x) => { await x.wait('khan', 'seen'); x.point('khan', 'sent-line', 'p_seen'); await x.sleep(sp().point); } },
    ] },
    { key: 'ch6', steps: [
      { f: 'band', k: 's6_1', log: 'l6_1', run: async (x) => { B().where = 'gw-stairs'; await x.holdSos(); x.point('band', 'band-face', 'p_sos_confirm'); await x.sleep(sp().point * 0.6); } },
      { f: 'band', k: 's6_2', log: 'l6_2', run: async (x) => { await x.tapBand(1); await x.sleep(1200); x.point('band', 'band-face', 'p_sos_sent'); await x.sleep(sp().point * 0.6); } },
      { f: 'iyer', k: 's6_3', log: 'l6_3', run: async (x) => { await x.wait('iyer', 'sos-banner'); x.point('iyer', 'sos-banner', 'p_sos_principal'); await x.sleep(sp().point); } },
      { f: 'mehta', k: 's6_4', log: null, run: async (x) => { await x.wait('mehta', 'sos-banner'); x.point('mehta', 'sos-banner', 'p_sos_teacher'); await x.sleep(sp().point * 0.8); } },
      { f: 'khan', k: 's6_5', log: 'l6_5', run: async (x) => { await x.click('khan', 'tab-urgent'); await x.wait('khan', 'sos-place'); x.point('khan', 'sos-pin', 'p_sos_place'); await x.sleep(sp().point + 500); } },
      { f: 'band', k: 's6_6', log: 'l6_6', run: async (x) => { B().where = 'gw-library'; B().beacon(); await x.sleep(900); B().beacon(); await x.sleep(600); x.point('khan', 'sos-pin', 'p_sos_moved'); await x.sleep(sp().point + 500); } },
      { f: 'khan', k: 's6_7', log: 'l6_7', run: async (x) => { await x.click('khan', 'sos-going'); await x.sleep(600); } },
      { f: 'band', k: 's6_8', log: 'l6_8', run: async (x) => { await B().fetchInbox(); await x.waitFor(() => B().sos?.coming, 6000); B().setMode('sos'); await x.sleep(500); x.point('band', 'band-face', 'p_coming'); await x.sleep(sp().point + 500); } },
    ] },
    { key: 'ch7', steps: [
      { f: 'mehta', k: 's7_1', log: 'l7_1', run: async (x) => { await x.click('mehta', 'tab-class'); await x.wait('mehta', 'class-weather'); x.point('mehta', 'class-weather', 'p_weather'); await x.sleep(sp().point); x.point('mehta', 'activity', 'p_activity'); await x.sleep(sp().point * 0.8); await x.click('mehta', 'activity-done'); await x.sleep(500); } },
      { f: 'iyer', k: 's7_2', log: 'l7_2', run: async (x) => { await x.click('iyer', 'tab-overview'); await x.wait('iyer', 'kpi-ontime'); x.point('iyer', 'kpi-ontime', 'p_report'); await x.sleep(sp().point); } },
      { f: 'khan', k: 's7_3', log: 'l7_3', run: async (x) => { await x.click('khan', 'tab-patterns'); await x.click('khan', 'pattern'); await x.click('khan', 'child-open'); await x.click('khan', 'inform-parent'); await x.wait('khan', 'inform-send'); x.point('khan', 'inform-text', 'p_inform'); await x.sleep(sp().point * 0.8); await x.click('khan', 'inform-send'); await x.sleep(600); } },
      { f: 'parent', k: 's7_4', log: 'l7_4', run: async (x) => { await x.wait('parent', 'parent-msg'); x.point('parent', 'parent-msg', 'p_parent_msg'); await x.sleep(sp().point); x.point('parent', 'band-status', 'p_parent_band'); await x.sleep(sp().point * 0.8); } },
    ] },
  ];
  const STEPS = CH.flatMap((c, ci) => c.steps.map((s, si) => ({ ...s, ci, si })));

  // ------------------------------------------------------------------ layout
  const clockEl = h('button.clock-chip', { 'data-demo': 'clock' });
  const timeline = h('nav.chapters'); const controls = h('div.controls'); const narr = h('div.narration', { 'aria-live': 'polite' });
  const panel = h('aside.steps-panel', { 'aria-live': 'polite' });
  const top = h('div.story-top', {}, h('div.story-title', {}, h('h1.story-h1', {}, tr('story_title')), clockEl), timeline, controls);
  const bandScroll = h('div.frame-scroll'); const bandFrame = h('section.frame.k-band', { 'data-frame': 'band' },
    h('div.frame-label', {}, h('span.fl-e', {}, '⌚'), h('div', {}, h('b', {}, tr('f_band')), h('span.small', {}, tr('f_band_sub')))), h('div.device.band', {}, h('div.frame-screen', {}, bandScroll)));
  const panes = {}; const tagEl = h('div.frame-label.phone-tag');
  const phoneScreen = h('div.frame-screen.phone-stack');
  for (const p of PHONES) { panes[p.id] = h('div.frame-scroll.pane', { 'data-who': p.id }); phoneScreen.append(panes[p.id]); }
  const phoneFrame = h('section.frame.k-phone', { 'data-frame': 'phone' }, tagEl, h('div.device.phone', {}, phoneScreen));
  const stage = h('div.stage.duo', {}, bandFrame, phoneFrame);
  const cursor = h('div.demo-cursor', { 'aria-hidden': 'true', html: '<svg viewBox="0 0 32 32"><path d="M6 3l20 12-9 2-4 9z" fill="#fff" stroke="#0F172A" stroke-width="2" stroke-linejoin="round"/></svg>' });
  const ring = h('div.point-ring', { 'aria-hidden': 'true' }); const label = h('div.point-label'); const overlay = h('div.story-overlay');
  mount(root, h('div.story-mode', {}, top, h('div.story-main', {}, stage, h('div.story-bottom', {}, narr)), h('div.story-side', {}, panel), overlay));
  document.body.append(cursor, ring, label);

  function showPhone(id) {
    if (phone === id && panes[id].classList.contains('on')) return;
    phone = id;
    for (const p of PHONES) panes[p.id].classList.toggle('on', p.id === id);
    panes[id].classList.remove('enter'); void panes[id].offsetWidth; panes[id].classList.add('enter');
    const p = PHONES.find((x) => x.id === id);
    mount(tagEl, avatar(p.name), h('div', {}, h('b', {}, tr(p.tag)), h('span.small', {}, tr(`${p.tag}_sub`))));
  }

  // ------------------------------------------------------------------ chrome
  function renderChrome() {
    const cur = STEPS[Math.min(idx, STEPS.length - 1)]; const ci = finished ? CH.length : cur.ci;
    mount(timeline, ...CH.map((c, i) => h(`button.chap${i === ci ? '.on' : i < ci ? '.done' : ''}`, { onclick: () => jumpTo(STEPS.findIndex((s) => s.ci === i)), title: tr(c.key) }, h('span.cn', {}, i < ci ? '✓' : i + 1), h('span.ct', {}, tr(c.key)))));
    mount(controls,
      h('button.ctl', { onclick: () => restart(), title: `${tr('restart')} (R)` }, ic('restart')),
      h('button.ctl', { onclick: () => jumpTo(STEPS.findIndex((s) => s.ci === Math.max(0, ci - (cur.si === 0 || finished ? 1 : 0)))), title: `${tr('prev_ch')} (←)` }, ic('prev')),
      h(`button.ctl.play${playing ? '.on' : ''}`, { 'data-demo': 'play', onclick: togglePlay, title: `${playing ? tr('pause') : tr('play')} (P)` }, ic(playing ? 'pause' : 'play'), h('span', {}, playing ? tr('pause') : idx === 0 ? tr('play_story') : tr('play'))),
      h('button.ctl.doit', { onclick: nextStep, title: `${tr('do_it')} (Space)`, disabled: playing || finished || null }, '👆', h('span', {}, tr('do_it'))),
      h('button.ctl', { onclick: () => jumpTo(STEPS.findIndex((s) => s.ci === Math.min(CH.length - 1, ci + 1))), title: `${tr('next_ch')} (→)`, disabled: finished || ci >= CH.length - 1 || null }, ic('next')),
      h('div.seg.sm', {}, h(`button${speed === 'slow' ? '.on' : ''}`, { onclick: () => { speed = 'slow'; renderChrome(); } }, '🐢 ', tr('slow')), h(`button${speed === 'normal' ? '.on' : ''}`, { onclick: () => { speed = 'normal'; renderChrome(); } }, '🐇 ', tr('normal'))));
    const chap = CH[Math.min(ci, CH.length - 1)];
    mount(narr, finished ? h('div', {}, h('b', {}, tr('end_1'))) : h('div', {}, h('div.n-ch', {}, tr('chapter_n', { a: ci + 1, b: CH.length }), ' · ', h('b', {}, tr(chap.key))), h('div.n-say', {}, tr(`${chap.key}_say`)), errorKey ? h('div.n-err', {}, tr(errorKey)) : null));
    mount(panel, h('div.sp-head', {}, h('span', {}, '🧭 ', tr('steps')), h('span.small', {}, `${Math.min(idx, STEPS.length)}/${STEPS.length}`)),
      h('div.sp-bar', {}, h('i', { style: { width: `${(Math.min(idx, STEPS.length) / STEPS.length) * 100}%` } })),
      h('div.sp-body', {}, h('div.sp-ch', {}, `${Math.min(ci + 1, CH.length)}. ${tr(chap.key)}`),
        h('ol.sp-list', {}, ...chap.steps.map((s, si) => { const gi = STEPS.findIndex((y) => y.ci === CH.indexOf(chap) && y.si === si); const st = finished || gi < idx ? 'done' : gi === idx ? 'now' : 'next';
          return h(`li.${st}`, {}, h('span.sp-i', {}, st === 'done' ? '✓' : st === 'now' ? '▶' : si + 1), h('span.sp-f', {}, { band: '⌚', clock: '🕒', mehta: '👩‍🏫', khan: '🧑‍⚕️', iyer: '🏫', parent: '👪' }[s.f]), h('span', {}, tr(s.k))); })),
        logLines.length ? h('div.rail', {}, h('div.rail-h', {}, '📝 ', tr('what_happened')), ...logLines.slice(0, 4).map((l, i) => h(`div.rail-row${i === 0 ? '.fresh' : ''}`, {}, h('span.rail-t', {}, l.time), tr(l.key)))) : null));
    const phoneStep = PHONES.some((p) => p.id === cur.f);
    if (phoneStep && !finished) showPhone(cur.f);
    bandFrame.classList.toggle('active', !finished && cur.f === 'band'); phoneFrame.classList.toggle('active', !finished && phoneStep);
    stage.classList.toggle('focus', !finished && cur.f !== 'clock');
  }
  const tickClock = () => mount(clockEl, '🕒 ', schoolDay());

  // ------------------------------------------------------------------ pointer, cursor, ripples
  function resolve(frame, sel) {
    const base = frame === 'top' ? top : frame === 'band' ? bandFrame : panes[frame] ? phoneScreen : null;
    if (!base) return null;
    const scope = panes[frame] ? phoneScreen : base;
    if (!sel) return base;
    const q = /^[.[#]/.test(sel) ? sel : `[data-demo="${sel}"]`;
    if (panes[frame]) return panes[frame].querySelector(q) || scope.querySelector(`:scope > .sheet-back ${q}`);
    return base.querySelector(q);
  }
  function setPoint(frame, sel, key) { pointState = { frame, sel, key, color: nextColor() }; label.textContent = tr(key); label.style.setProperty('--pc', pointState.color); ring.style.setProperty('--pc', pointState.color); scrollTo(resolve(frame, sel)); }
  function clearPoint() { pointState = null; ring.classList.remove('on'); label.classList.remove('on'); }
  function drawPoint() {
    rafId = requestAnimationFrame(drawPoint);
    if (!pointState) return;
    const el = resolve(pointState.frame, pointState.sel);
    if (!el || !el.getClientRects().length) { ring.classList.remove('on'); label.classList.remove('on'); return; }
    const r = el.getBoundingClientRect(); const pad = 6;
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    ring.classList.add('on'); label.classList.add('on');
    const lw = label.offsetWidth, lh = label.offsetHeight;
    const cx = Math.max(12 + lw / 2, Math.min(window.innerWidth - 12 - lw / 2, r.left + r.width / 2));
    // On the watch, put the label beside it so it never covers the "What to do" box.
    if (pointState.frame === 'band' && r.right + lw + 40 < window.innerWidth) {
      label.classList.remove('below'); label.classList.add('side');
      label.style.left = `${r.right + 26}px`; label.style.top = `${Math.max(70, r.top + r.height / 2 - lh / 2)}px`;
      return;
    }
    label.classList.remove('side');
    const above = r.top - lh - 26 > 70; label.classList.toggle('below', !above);
    label.style.left = `${cx - lw / 2}px`; label.style.top = `${above ? r.top - lh - 22 : r.bottom + 22}px`;
    label.style.setProperty('--ax', `${Math.max(16, Math.min(lw - 16, r.left + r.width / 2 - (cx - lw / 2)))}px`);
  }
  function scrollTo(el) {
    if (!el) return;
    const sc = el.closest('.frame-scroll');
    if (sc) { sc.scrollLeft = 0; const r = el.getBoundingClientRect(), s = sc.getBoundingClientRect(); if (r.top < s.top + 10 || r.bottom > s.bottom - 10) sc.scrollTo({ top: sc.scrollTop + (r.top - s.top) - s.height / 3, behavior: fast ? 'auto' : 'smooth' }); }
    const fr = el.closest('.frame'); if (fr && window.innerWidth < 900) fr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function moveCursor(x, y) { cursor.classList.add('on'); cursor.style.transitionDuration = `${sp().move}ms`; cursor.style.left = `${x}px`; cursor.style.top = `${y}px`; }
  function ripple(x, y, color, text) { const r = h('div.ripple', { style: { left: `${x}px`, top: `${y}px`, '--rc': color } }, text ? h('b', {}, text) : null); document.body.append(r); setTimeout(() => r.remove(), 1100); }

  function makeCtx(gen) {
    const chk = () => { if (gen !== token) throw CANCEL; };
    const bandBtn = () => resolve('band', 'band-btn');
    const x = {
      async sleep(ms) { let left = fast ? Math.min(ms * 0.02, 40) : ms; while (left > 0) { chk(); await raw(50); if (active()) left -= 50; } chk(); },
      el: (frame, sel) => resolve(frame, sel),
      async wait(frame, sel, ms = 9000) { const end = Date.now() + ms; for (;;) { chk(); const e = resolve(frame, sel); if (e) return e; if (Date.now() > end) throw Object.assign(new Error(`not found: ${sel}`), { notFound: true }); await raw(100); } },
      async waitFor(fn, ms = 6000) { const end = Date.now() + ms; while (!fn()) { chk(); if (Date.now() > end) throw new Error('timeout'); await raw(120); } },
      point(frame, sel, key) { chk(); if (!fast) setPoint(frame, sel, key); },
      async tap(el, n = 1, quick = false) {
        chk(); if (fast || !el) return;
        clearPoint(); scrollTo(el); await raw(200);
        const color = nextColor(); let r = el.getBoundingClientRect(); moveCursor(r.left + r.width / 2, r.top + r.height / 2); await x.sleep(sp().move + 150);
        for (let i = 0; i < n; i++) {
          r = el.getBoundingClientRect(); cursor.classList.add('press'); ripple(r.left + r.width / 2, r.top + r.height / 2, color, n > 1 ? String(i + 1) : null);
          el.classList.add('demo-hit'); el.style.setProperty('--hc', color);
          if (quick) { await raw(90); cursor.classList.remove('press'); await raw(90); } else { await x.sleep(sp().tap / 2); cursor.classList.remove('press'); await x.sleep(sp().tap / 2); }
        }
        setTimeout(() => el.classList.remove('demo-hit'), 900);
      },
      async click(frame, sel) { const e = await x.wait(frame, sel); await x.tap(e); chk(); (resolve(frame, sel) || e).click(); await x.sleep(500); },
      // the band's button: taps, double tap, hold 1 s to choose, hold 5 s for SOS
      async tapBand(n = 1, double = false) {
        if (fast) { if (double) { B().tap(); B().tap(); } else for (let i = 0; i < n; i++) B().tap(); return; }
        const el = bandBtn(); const r0 = el.getBoundingClientRect(); clearPoint(); moveCursor(r0.left + r0.width / 2, r0.top + r0.height / 2); await x.sleep(sp().move + 150);
        const color = nextColor();
        for (let i = 0; i < n; i++) { const r = el.getBoundingClientRect(); cursor.classList.add('press'); el.classList.add('demo-hit'); el.style.setProperty('--hc', color); ripple(r.left + r.width / 2, r.top + r.height / 2, color, n > 1 ? String(i + 1) : null); B().tap(); await raw(double ? 120 : 160); cursor.classList.remove('press'); el.classList.remove('demo-hit'); if (!double && i < n - 1) await x.sleep(sp().tap); }
        await x.sleep(450);
      },
      async goTo(pred) {
        await x.waitFor(() => B().menu, 3000); const target = itemIndex(pred); if (target < 0) throw new Error('no such item');
        const steps = (target - B().menu.i + B().menu.items.length) % B().menu.items.length;
        if (fast) { B().menu.i = target; B().changed(); return; }
        const el = bandBtn(); const r = el.getBoundingClientRect(); clearPoint(); moveCursor(r.left + r.width / 2, r.top + r.height / 2); await x.sleep(sp().move);
        const color = nextColor();
        for (let i = 0; i < steps; i++) { cursor.classList.add('press'); el.classList.add('demo-hit'); el.style.setProperty('--hc', color); ripple(r.left + r.width / 2, r.top + r.height / 2, color, '▸'); B().tap(); await raw(140); cursor.classList.remove('press'); el.classList.remove('demo-hit'); await x.sleep(sp().scroll); }
      },
      async holdChoose() {
        if (fast) { B().hold(); return; }
        const el = bandBtn(); const r = el.getBoundingClientRect(); moveCursor(r.left + r.width / 2, r.top + r.height / 2); await x.sleep(sp().move * 0.6);
        cursor.classList.add('press', 'holding'); el.classList.add('demo-hold-soft'); ripple(r.left + r.width / 2, r.top + r.height / 2, '#0F9D6B', '●');
        B().pressDown(); await raw(1150); chk(); B().pressUp(); cursor.classList.remove('press', 'holding'); el.classList.remove('demo-hold-soft');
      },
      async holdSos() {
        if (fast) { B().confirmSos(); return; }
        const el = bandBtn(); const r = el.getBoundingClientRect(); clearPoint(); moveCursor(r.left + r.width / 2, r.top + r.height / 2); await x.sleep(sp().move + 150);
        cursor.classList.add('press', 'holding'); el.classList.add('demo-hold'); B().pressDown();
        for (let s = 5; s > 0; s--) { ripple(r.left + r.width / 2, r.top + r.height / 2, '#DC2626', `${s}`); await raw(1000); chk(); }
        await x.waitFor(() => B().mode === 'confirm_sos', 3000);
        cursor.classList.remove('press', 'holding'); el.classList.remove('demo-hold'); B().pressUp();
      },
      async clockJump(body, text) {
        chk();
        if (!fast) {
          const ff = h('div.ff', {}, h('div.ff-box', {}, h('span.ff-i', {}, '⏩'), h('b', {}, text), h('span.small', {}, tr('ff_note'))));
          overlay.append(ff); clockEl.classList.add('spin'); await x.sleep(1500);
          await api.post('/demo/clock', body); await clock.sync(); tickClock(); await x.sleep(900); ff.remove(); clockEl.classList.remove('spin');
        } else { await api.post('/demo/clock', body); await clock.sync(); tickClock(); }
        await Promise.all(Object.values(S.apps).map((a) => a.reload()));
      },
      async fly(fromEl, toPhone) {
        chk();
        if (fast || !fromEl) { showPhone(toPhone); return; }
        const a = fromEl.getBoundingClientRect(); const clone = fromEl.cloneNode(true); clone.classList.add('flying');
        Object.assign(clone.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px` }); document.body.append(clone);
        await clone.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(0,-60px) scale(1.06) rotate(-3deg)' }], { duration: 600, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
        showPhone(toPhone); await raw(350);
        const target = phoneScreen.getBoundingClientRect();
        await clone.animate([{ transform: 'translate(0,-60px) scale(1.06) rotate(-3deg)', opacity: 1 }, { transform: `translate(${target.left + 12 - a.left}px, ${target.top + 140 - a.top}px) scale(.96)`, opacity: 0.15 }], { duration: speed === 'slow' ? 1200 : 700, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
        clone.remove();
      },
    };
    return x;
  }

  // ------------------------------------------------------------------ running
  async function setup() {
    teardown();
    await api.post('/demo/reset'); await clock.sync(); tickClock();
    const users = await api.get('/auth/demo-users'); const find = (n) => users.find((u) => u.name === n);
    const info = (await loadBands()).find((b) => b.student === 'Riya Sharma');
    const band = await makeBand(info);
    band.T = { ...band.T, noticeSeconds: 1e9, askWindow: 600, exerciseScale: 0.25, confirmWindow: 60, inboxPoll: 4 };
    band.base = { morning: { n: 0, mean: 80, m2: 0 }, mid: { n: 0, mean: 80, m2: 0 }, afternoon: { n: 0, mean: 80, m2: 0 } }; band.pauseSensing = true;
    S.band = band; S.cleanups.push(bandView(bandScroll, band, { story: true }));
    for (const p of PHONES) { const s = await api.post('/auth/login', { user_id: find(p.name).id }); const a = adultApp(panes[p.id], s); S.apps[p.id] = a; S.cleanups.push(a.cleanup); panes[p.id].scrollTop = 0; }
    phone = null; showPhone('mehta');
  }
  function teardown() { S.cleanups.forEach((f) => { try { f(); } catch { /* gone */ } }); S.cleanups = []; S.apps = {}; phoneScreen.querySelectorAll(':scope > .sheet-back').forEach((x) => x.remove()); }

  async function driver(gen) {
    const x = makeCtx(gen);
    try {
      while (idx < STEPS.length) {
        while (!active()) { if (gen !== token) return; await raw(80); }
        errorKey = null; renderChrome();
        const step = STEPS[idx];
        try { await step.run(x); } catch (e) { if (e === CANCEL) throw e; console.warn('story step', step.k, e); errorKey = 'story_err'; playing = false; stepOnce = false; renderChrome(); continue; }
        if (gen !== token) return;
        if (step.log) logLines.unshift({ key: step.log, time: schoolDay().split(' ').slice(1).join(' ') });
        idx++; clearPoint(); cursor.classList.remove('on'); if (stepOnce) stepOnce = false;
        renderChrome();
        if (idx < STEPS.length && STEPS[idx].ci !== STEPS[idx - 1].ci) await x.sleep(sp().gap * 0.6);
        await x.sleep(sp().gap * 0.4);
      }
      finished = true; playing = false; renderChrome(); showEnd();
    } catch (e) { if (e !== CANCEL) console.error(e); }
  }
  function togglePlay() { if (finished) return restart(true); playing = !playing; if (!playing) clearPoint(); renderChrome(); }
  function nextStep() { if (playing || finished) return; stepOnce = true; renderChrome(); }
  async function restart(autoplay = false) { await jumpTo(0); if (autoplay === true) { playing = true; renderChrome(); } }
  async function jumpTo(i) {
    const gen = ++token; playing = false; stepOnce = false; finished = false; errorKey = null; logLines = [];
    clearPoint(); cursor.classList.remove('on'); overlay.replaceChildren(); idx = 0; renderChrome();
    root.classList.add('busy'); await setup(); if (gen !== token) return;
    if (i > 0) {
      fast = true; const x = makeCtx(gen);
      try { for (; idx < i; idx++) { await STEPS[idx].run(x); if (STEPS[idx].log) logLines.unshift({ key: STEPS[idx].log, time: schoolDay().split(' ').slice(1).join(' ') }); } } catch (e) { if (e === CANCEL) return; console.warn(e); }
      fast = false; await raw(300);
    }
    root.classList.remove('busy'); if (gen !== token) return;
    renderChrome(); driver(gen);
  }
  function showEnd() {
    overlay.replaceChildren(h('div.end-card', {}, h('div.end-e', {}, '💜'), h('h2', {}, tr('end_1')), h('p.lead', {}, tr('end_2')),
      h('div.row.gap.wrap.center', {}, h('a.btn.primary.big', { href: '#try' }, tr('try_it')), h('a.btn.light.big', { href: '#tech' }, tr('under_hood')), h('button.btn.light.big', { onclick: () => restart(true) }, '⟲ ', tr('restart_story'))), helplines()));
  }

  const onKey = (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const ci = STEPS[Math.min(idx, STEPS.length - 1)].ci;
    if (e.key === ' ') { e.preventDefault(); nextStep(); } else if (e.key === 'p' || e.key === 'P') togglePlay();
    else if (e.key === 'ArrowRight') jumpTo(STEPS.findIndex((s) => s.ci === Math.min(CH.length - 1, ci + 1)));
    else if (e.key === 'ArrowLeft') jumpTo(STEPS.findIndex((s) => s.ci === Math.max(0, ci - 1)));
    else if (e.key === 'r' || e.key === 'R') restart();
  };
  window.addEventListener('keydown', onKey);
  const offLang = onLang(() => {
    mount(bandFrame.querySelector('.frame-label div'), h('b', {}, tr('f_band')), h('span.small', {}, tr('f_band_sub')));
    mount(top.querySelector('.story-title'), h('h1.story-h1', {}, tr('story_title')), clockEl);
    const p = PHONES.find((y) => y.id === phone); if (p) mount(tagEl, avatar(p.name), h('div', {}, h('b', {}, tr(p.tag)), h('span.small', {}, tr(`${p.tag}_sub`))));
    if (pointState) label.textContent = tr(pointState.key);
    renderChrome(); tickClock(); if (finished) showEnd();
  });
  drawPoint(); clockT = setInterval(tickClock, 1000);
  await jumpTo(0);
  return () => { token++; teardown(); cancelAnimationFrame(rafId); clearInterval(clockT); window.removeEventListener('keydown', onKey); offLang(); cursor.remove(); ring.remove(); label.remove(); document.querySelectorAll('.ripple,.flying').forEach((e) => e.remove()); };
}
