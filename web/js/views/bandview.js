// The band on screen: a wrist with a band, a small black OLED that shows words, one big button
// with a hold ring, and one caption line that explains the last vibration. Controls for the demo
// (heart rate, moving, where the child is) sit underneath; packets live in "Under the hood".
import { api } from '../api.js';
import * as C from '../crypto.js';
import { h, mount } from '../ui.js';
import { tr, getLang, onLang } from '../i18n.js';
import { BY_CODE, GATEWAYS, gwName, rssiFrom, IN_RANGE, SUBJECT_HI, WHEN, WHERE } from '../content.js';
import * as M from '../model.js';

export const BUZZ = { one: 'bz_one', two: 'bz_two', ask: 'bz_ask', calm: 'bz_calm', sos_confirm: 'bz_sos', message: 'bz_msg' };
export function bandMsgText(m, lang = getLang()) {
  if (!m) return '';
  const L = lang === 'hi' ? 1 : 0;
  if (m.kind === 'call') {
    const PHRASE = { now: ['now', 'अभी'], break: ['at the next break', 'अगले ब्रेक में'], lunch: ['at lunch', 'लंच में'], after: ['after school', 'छुट्टी के बाद'] };
    const when = PHRASE[m.vars.when]?.[L] || WHEN.find((w) => w[0] === m.vars.when)?.[1][L] || ''; const where = WHERE.find((w) => w[0] === m.vars.where)?.[1][L] || '';
    return tr(m.vars.tomorrow ? 'bm_call_tmr' : 'bm_call', { who: m.vars.who, when, where });
  }
  return tr(`bm_${m.kind}`, m.vars || {});
}
const subj = (s) => (getLang() === 'hi' ? SUBJECT_HI[s] || s : s);

export function bandView(root, band, { story = false } = {}) {
  let caption = '', capT, holdRing, face, oled, cap, dialTxt, doNow, legendOpen = false;
  band.addEventListener('buzz', (e) => {
    const k = BUZZ[e.detail]; if (!k) { face?.classList.remove('bz-breath'); void face?.offsetWidth; face?.classList.add('bz-breath'); return; }
    caption = k;
    face?.classList.remove('bz-one', 'bz-two', 'bz-ask', 'bz-calm', 'bz-sos_confirm', 'bz-message'); void face?.offsetWidth; face?.classList.add(`bz-${e.detail}`);
    try { navigator.vibrate?.({ one: 120, two: [120, 120, 120], ask: [60, 80, 60, 80, 60], calm: [600, 400, 600], sos_confirm: 700, message: [300, 150, 300] }[e.detail]); } catch { /* not allowed */ }
    clearTimeout(capT); capT = setTimeout(() => { caption = ''; paint(); }, 6000); paint();
  });
  band.addEventListener('hold', (e) => {
    if (!holdRing) return; const { ms, kind } = e.detail;
    holdRing.classList.toggle('cancel', kind === 'cancel');
    if (e.detail.chooseReady) { holdRing.parentNode.classList.add('choose-ready'); return; }
    holdRing.parentNode.classList.remove('choose-ready');
    holdRing.style.transition = ms ? `stroke-dashoffset ${ms}ms linear` : 'stroke-dashoffset .2s'; holdRing.style.strokeDashoffset = ms ? '0' : '289';
  });

  function device() {
    const btn = h('button.band-btn', { 'data-demo': 'band-btn', 'aria-label': tr('band_btn_aria'),
      onpointerdown: (e) => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* synthetic */ } band.pressDown(); }, onpointerup: () => band.pressUp(), onpointercancel: () => band.pressUp(),
      onkeydown: (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); band.pressDown(); } }, onkeyup: (e) => { if (e.key === ' ' || e.key === 'Enter') band.pressUp(); } });
    oled = h('div.oled', { 'aria-live': 'polite' });
    face = h('div.band-face', { 'data-demo': 'band-face' }, oled, h('i.ring.r1'), h('i.ring.r2'));
    const ring = h('div.hold-ring', { html: '<svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/><circle class="mark" cx="50" cy="50" r="46"/><circle class="fill" cx="50" cy="50" r="46"/></svg>' });
    holdRing = ring.querySelector('.fill');
    // One device: strap, case, round screen, and the band's single button built into the case.
    return h('div.watch-wrap', {},
      doNow = h('div.do-now', { 'data-demo': 'do-now', 'aria-live': 'polite' }),
      h('div.watch', {}, h('div.wstrap.top', {}, h('i'), h('i'), h('i')),
        h('div.case', {}, face, h('div.case-btn', {}, h('div.btn-wrap', {}, ring, btn), h('span.btn-label', {}, tr('the_button')))),
        h('div.wstrap.bottom', {}, h('i'), h('i'), h('i'))),
      cap = h('div.band-caption', { 'data-demo': 'band-caption', 'aria-live': 'polite' }, ' '));
  }

  // What the OLED shows, as [top line, big line, small line, hint, extra class].
  function screen() {
    const b = band; const L = getLang();
    const top = `♥${b.hr} ${b.battery}%${b.ptActive ? ` · PT ${b.ptMinutes}m` : ''}${b.pending.length ? ' ⇡' : ''}`;
    const item = (it) => !it ? '' : it.t === 'feel' ? `${BY_CODE[it.code].e} ${L === 'hi' ? BY_CODE[it.code].hi : BY_CODE[it.code].en}` : it.t === 'talk' ? `💬 ${tr('m_talk')}` : it.t === 'pt' ? `🏃 ${tr('m_pt')}` : `🆘 ${tr('m_danger')}`;
    const mode = (b.mode === 'menu' && !b.menu) || (['talk', 'pt'].includes(b.mode) && !b.sub) || (b.mode === 'exercise' && !b.ex) || (b.mode === 'flash' && !b.flash) ? 'idle' : b.mode;
    switch (mode) {
      case 'learning': return [top, tr('o_learning'), `${Math.min(b.b.n, b.T.learnSamples)}/${b.T.learnSamples}`, '', 'learn'];
      case 'menu': {
        const m = b.menu; const it = m.items[m.i];
        return [m.asked ? tr('o_how') : tr('o_menu'), `${it.star ? '★ ' : ''}${item(it)}`, m.items.map((_, i) => (i === m.i ? '●' : '·')).join(''), tr('o_hint_menu'), it.t === 'danger' ? 'danger' : it.star ? 'star' : ''];
      }
      case 'talk': { const it = b.sub.items[b.sub.i]; return [tr('o_talk_to'), it === 'adult' ? `👩‍🏫 ${b.adult?.label || tr('m_my_adult')}` : `🧑‍⚕️ ${tr('m_counsellor')}`, `${b.sub.i + 1}/2`, tr('o_hint_menu'), '']; }
      case 'pt': return [tr('o_pt_for'), `🏃 ${b.sub.items[b.sub.i]} ${tr('u_min')}`, `${b.sub.i + 1}/3`, tr('o_hint_menu'), ''];
      case 'ptoffer': return [top, tr('o_pt_offer'), '', tr('o_hint_yesno'), ''];
      case 'nurse': return [top, tr('o_nurse'), '', tr('o_hint_yesno'), 'danger'];
      case 'exercise': { const x = b.ex; const st = x.steps[x.i]; return [x.ex.name[L === 'hi' ? 1 : 0], st[0][L === 'hi' ? 1 : 0], `${Math.max(0, x.total - x.done)}s`, tr('o_hint_ex'), `ex ph-${st[2] || 'none'}`]; }
      case 'better': return [top, tr('o_better'), '', tr('o_hint_better'), ''];
      case 'confirm_sos': return ['SOS', tr('o_sos_q'), '', tr('o_hint_sos'), 'danger'];
      case 'sos': return ['SOS', b.sos?.coming ? bandMsgText(b.sos.coming) : tr('o_sos_sent'), b.sos?.medical ? tr('o_nurse_told') : tr('o_help_told'), b.sec - (b.sos?.sec || 0) <= b.T.cancelWindow ? tr('o_hint_cancel') : '', 'danger'];
      case 'message': return [tr('o_message'), bandMsgText(b.message), '', tr('o_hint_ok'), 'msg'];
      case 'flash': return [top, tr(b.flash.key, b.flash.vars), '', '', 'flash'];
      default: {
        const p = b.period; const paused = b.ptActive || b.timetablePause || b.pauseSensing;
        return [top, b.message ? `✉ ${tr('o_message')}` : b.ptActive ? `🏃 PT · ${b.ptMinutes} ${tr('u_min')}` : '🙂', paused ? tr('o_paused') : p ? subj(p.subject) : '', tr('o_hint_idle'), 'idle'];
      }
    }
  }
  function paint() {
    const [a, big, small, hint, cls] = screen();
    oled.className = `oled ${cls || ''}`;
    mount(oled, h('div.o-top', {}, a), h('div.o-big', {}, big), h('div.o-small', {}, small), h('div.o-hint', {}, hint),
      band.mode === 'exercise' ? h('i.o-breath') : null);
    face.className = face.className.replace(/\bm-\S+/g, '').trim() + ` m-${band.mode}`;
    cap.textContent = caption ? tr(caption) : ' '; cap.classList.toggle('on', !!caption);
    const cur = band.mode === 'menu' && band.menu ? band.menu.items[band.menu.i] : null;
    const curWord = cur ? (cur.t === 'feel' ? (getLang() === 'hi' ? BY_CODE[cur.code].hi : BY_CODE[cur.code].en) : tr({ talk: 'm_talk', pt: 'm_pt', danger: 'm_danger' }[cur.t])) : '';
    const dn = { learning: 'dn_learning', idle: band.message ? 'dn_idle_msg' : 'dn_idle', menu: 'dn_menu', talk: 'dn_talk', pt: 'dn_pt', ptoffer: 'dn_yesno', nurse: 'dn_yesno', exercise: 'dn_exercise',
      better: 'dn_better', confirm_sos: 'dn_confirm', sos: 'dn_sos', message: 'dn_message' }[band.mode];
    mount(doNow, dn ? [h('span.dn-k', {}, '👉 ', tr('do_now')), ' ', tr(dn, { word: curWord })] : []);
    doNow.classList.toggle('on', !!dn);
    if (dialTxt) {
      const rise = band.learned ? band.risePct : null;
      dialTxt.className = `hr-line${rise != null && rise >= 20 ? ' high' : ''}`;
      mount(dialTxt, h('b', {}, `♥ ${band.hr} bpm`), ' · ', band.learned ? (rise >= 20 ? tr('hr_high', { n: rise }) : tr('hr_normal', { n: band.normal })) : tr('o_learning'),
        band.ptActive || band.timetablePause ? h('span.chip.soft', {}, '⏸ ', tr('noticing_paused')) : null);
    }
  }

  function controls() {
    const heart = band.move === 2 ? 'run' : band.hrTarget >= 100 ? 'tense' : 'calm';
    const set = (k) => { if (k === 'run') { band.move = 2; band.hrTarget = 130; } else { band.move = 0; band.hrTarget = k === 'tense' ? 118 : 82; } band.changed(); };
    return h('div.band-ctl', {},
      h('div.ctl-row', {}, h('span.ctl-l', {}, tr('ctl_body')), h('div.seg', {}, ...[['calm', '😌'], ['tense', '😟'], ['run', '🏃']].map(([k, e]) => h(`button${heart === k ? '.on' : ''}`, { 'data-demo': `body-${k}`, onclick: () => set(k) }, e, ' ', tr(`ctl_${k}`))))),
      h('div.ctl-row', {}, h('span.ctl-l', {}, '📍 ', tr('ctl_where')), h('select', { 'data-demo': 'where', 'aria-label': tr('ctl_where'), onchange: (e) => { band.where = e.target.value; band.changed(); } },
        ...GATEWAYS.filter((g) => g.id !== 'gw-blockb').map((g) => h('option', { value: g.id, selected: band.where === g.id || null }, gwName(g.id, getLang()))))),
      h('div.ctl-info', {}, `🕒 ${band.period ? subj(band.period.subject) : '—'}${band.timetablePause ? ` · ${tr('pt_period')}` : ''} · ${tr('q_today', { n: band.questionsToday, max: band.T.maxQuestions })}`,
        band.ptActive ? h('button.btn.xs.ghost', { onclick: () => band.endPt() }, tr('end_pt')) : null),
      h('span.chip.soft', {}, '⏩ ', tr('demo_speed')));
  }
  function legend() {
    return h('details.buzz-legend', { open: legendOpen || null, ontoggle: (e) => { legendOpen = e.target.open; } }, h('summary', {}, tr('how_band')),
      h('div.small', {}, tr('g_tap')), h('div.small', {}, tr('g_hold')), h('div.small', {}, tr('g_double')), h('div.small', {}, tr('g_sos')),
      h('div.small.muted', {}, tr('buzz_lang')), ...Object.values(BUZZ).map((k) => h('div.small', {}, tr(k))));
  }
  function hood() {
    const hexParts = (p) => { const x = C.hex(p); return h('code.pkt', {}, h('span.p-ver', {}, x.slice(0, 2)), h('span.p-rid', {}, x.slice(2, 10)), h('span.p-ctr', {}, x.slice(10, 18)), h('span.p-ct', {}, x.slice(18, 22)), h('span.p-tag', {}, x.slice(22))); };
    const sug = M.suggest(band.model, band.school, band.ctx(true)).slice(0, 3);
    return h('div.hood-body', {},
      h('h4', {}, '📡 ', tr('hood_gateways')),
      ...api.gateways.map((g) => { const rssi = rssiFrom(band.where, g.id); const inR = rssi >= IN_RANGE;
        return h('div.gw-line', {}, h('span', {}, gwName(g.id, getLang())), h(`span.rssi${inR ? '.in' : ''}`, {}, `${rssi} dBm`),
          api.mode === 'demo' ? h(`button.btn.xs.${api.engine.gwPower[g.id] ? 'ghost' : 'danger'}`, { onclick: async () => { await api.gatewayPower(g, !api.engine.gwPower[g.id]); band.changed(); } }, api.engine.gwPower[g.id] ? tr('power_on') : tr('power_off')) : null); }),
      api.canCutServer ? h('label.small', {}, h('input', { type: 'checkbox', checked: !api.engine.serverReachable || null, onchange: async (e) => { await api.setServerReachable(!e.target.checked); band.changed(); } }), ' ', tr('cut_internet')) : null,
      h('div.row.gap.wrap', {}, h('button.btn.ghost.sm', { onclick: () => band.replayLast() }, tr('replay')), h('button.btn.ghost.sm', { onclick: () => band.sendTampered() }, tr('tamper'))),
      h('h4', {}, '🫀 ', tr('baselines')),
      h('div.small', {}, ...Object.entries(band.base).map(([k, v]) => h('span.chip', {}, `${tr(`tod_${k}`)}: ${v.n ? Math.round(v.mean) : '–'} bpm`))),
      h('div.small', {}, `${tr('threshold')}: +${Math.round((0.2 + band.tune) * 100)}% · ${tr('q_today', { n: band.questionsToday, max: band.T.maxQuestions })}`),
      h('h4', {}, '✨ ', tr('model_now')),
      h('div.small', {}, ...sug.map((s, i) => h('span.chip', {}, `${i === 0 ? '★ ' : ''}${BY_CODE[s.code].e} ${BY_CODE[s.code][getLang() === 'hi' ? 'hi' : 'en']} ${Math.round(s.p * 100)}%`))),
      h('h4', {}, '🧾 ', tr('packet_log')),
      h('div.small.legend-pk', {}, h('span.p-ver', {}, 'ver'), h('span.p-rid', {}, 'id'), h('span.p-ctr', {}, 'counter'), h('span.p-ct', {}, 'type+arg'), h('span.p-tag', {}, 'tag'), ' = 19 bytes, AES-CCM'),
      h('div.log-list', {}, ...band.log.slice(0, 16).map((l) => l.dir === 'tx'
        ? h('div.lg.tx', {}, h('b', {}, `→ #${l.msg.counter} ${l.msg.label}`), hexParts(l.msg.packet))
        : h(`div.lg.rx.${(l.result.status || '').replace(/\W/g, '_')}`, {}, `← ${l.result.gateway ? gwName(l.result.gateway, 'en') : ''} ${l.result.rssi != null ? `(${l.result.rssi} dBm)` : ''}: `, h('b', {}, l.result.status), l.result.reason ? ` (${l.result.reason})` : '',
          l.result.receipt ? h('span', {}, ' · ', l.verified ? h('span.ok', {}, tr('receipt_ok')) : h('span.bad', {}, tr('receipt_bad'))) : null))));
  }

  const below = h('div.band-below');
  const hoodEl = story ? null : h('details.hood', {}, h('summary', {}, '🔧 ', tr('under_hood')), h('div.hood-holder'));
  mount(root, h(`div.bandview${story ? '.in-story' : ''}`, {}, h('div.who', {}, h('b', {}, band.student), ` · ${tr('class')} ${band.className} · ${tr('band')} ${band.bandId}`),
    device(), dialTxt = h('div.hr-line', { 'data-demo': 'band-hr' }), below, hoodEl));
  function draw() {
    paint();
    if (story) return;
    if (document.activeElement && below.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
    mount(below, controls(), legend());
    if (hoodEl.open) mount(hoodEl.querySelector('.hood-holder'), hood());
  }
  hoodEl?.addEventListener('toggle', draw);
  band.addEventListener('change', draw);
  draw();
  const offL = onLang(draw);
  return () => { offL(); band.removeEventListener('change', draw); band.destroy(); };
}
