// The adult apps: teacher, counsellor, principal, parent. One simple phone app, 2 to 4 bottom tabs,
// plain words, at most 3 action cards per screen. SOS always shows as a red banner at the top for
// its recipients, with the place and an "I'm going" button.
import { api } from '../api.js';
import { h, mount, toast, attempt, t, ago, ic, sheet, avatar, clock, left } from '../ui.js';
import { tr, getLang, setLang, onLang } from '../i18n.js';
import { BY_CODE, feelWord, gwName, timetableFor, SUBJECT_HI, ACTIVITY_HI, WEEK_FEELING, WHEN, WHERE } from '../content.js';
import { schoolMap } from './map.js';
import { bandMsgText } from './bandview.js';

export const TABS = {
  teacher: ['today', 'class', 'alerts'], counsellor: ['urgent', 'requests', 'patterns', 'alerts'], principal: ['overview', 'sos', 'report', 'devices'], parent: ['home', 'settings'],
  nurse: ['urgent', 'alerts'], pocso: ['urgent', 'requests', 'alerts'], management: ['overview', 'report'], admin: ['devices', 'alerts'],
};
const TAB_ICON = { today: '☀️', class: '🌦', alerts: '🔔', urgent: '🚨', requests: '💬', patterns: '🌱', overview: '📊', sos: '🆘', report: '🧾', devices: '📡', home: '🏠', settings: '⚙️' };
const L = () => (getLang() === 'hi' ? 1 : 0);
const subj = (s) => (getLang() === 'hi' ? SUBJECT_HI[s] || s : s);
const first = (p) => (p?.name || '').split(' ')[0];
const isSos = (c) => c.kind === 'sos' || c.kind === 'medical_sos';
export function noteText(n) {
  const v = { ...(n.vars || {}) }; if (v.gw !== undefined) v.place = v.gw ? gwName(v.gw, getLang()) : tr('place_unknown'); if (v.code) v.feeling = feelWord(v.code, getLang());
  const k = `nt_${n.kind}`;
  return tr(`${k}_t`, v) !== `${k}_t` ? { title: tr(`${k}_t`, v), body: tr(`${k}_b`, v) } : { title: n.title, body: n.body };
}
function countdown(c) {
  if (!c.deadline || !['open', 'acknowledged'].includes(c.status)) return null;
  const msLeft = Date.parse(c.deadline) - clock.now(); const total = Math.max(1, Date.parse(c.deadline) - Date.parse(c.created_at));
  const tone = isSos(c) ? 'help' : msLeft < 0 ? 'late' : msLeft / total < 0.2 ? 'warn' : 'ok';
  return h(`span.cd.${tone}`, { 'data-demo': 'countdown' }, '⏱ ', tr(isSos(c) ? 'cd_going' : 'cd_respond', { time: t(c.deadline) }), h('b', {}, ` · ${left(c.deadline)}`));
}

export function adultApp(root, session, opts = {}) {
  const tok = session.token, role = session.user.role, me = session.user;
  const tabs = TABS[role] || ['alerts'];
  let tab = opts.tab || tabs[0], queue = [], sos = [], notes = [], meInfo = null, extra = {}, child = null, view = null;
  const frame = () => root.closest('.frame-screen') || root;

  // The job title as the person's own language, not the ERP's English title.
  function roleLabel() {
    if (role === 'parent' && meInfo?.child) return tr('parent_of', { name: first(meInfo.child) });
    if (role === 'teacher' && meInfo?.class) return tr('role_class_teacher', { c: meInfo.class.name });
    return tr(`role_${role}`);
  }

  async function load() {
    const jobs = [api.get('/me', tok).then((x) => { meInfo = x; })];
    if (role !== 'parent') {
      jobs.push(api.get('/notifications', tok).then((n) => { notes = n; }));
      if (!['admin'].includes(role)) jobs.push(api.get('/queue', tok).then((q) => { queue = q; }).catch(() => { queue = []; }));
      jobs.push(api.get('/sos/active', tok).then((x) => { sos = x; }).catch(() => { sos = []; }));
    }
    await Promise.all(jobs);
    const more = [];
    if (tab === 'class' && meInfo.class) more.push(api.get(`/class/${meInfo.class.id}/mood`, tok).then((x) => { extra.mood = x; }), api.get(`/class/${meInfo.class.id}/timetable`, tok).then((x) => { extra.tt = x; }));
    if (['overview', 'report'].includes(tab)) more.push(api.get('/reports/response', tok).then((x) => { extra.report = x; }));
    if (tab === 'devices') more.push(api.get('/gateways', tok).then((x) => { extra.devices = x; }));
    if (tab === 'patterns') more.push(api.get('/patterns', tok).then((x) => { extra.patterns = x; }));
    if (tab === 'sos' || (tab === 'alerts' && role === 'teacher')) more.push(api.get('/sos/history', tok).then((x) => { extra.sosHistory = x; }));
    if (tab === 'home' || tab === 'settings') more.push(api.get('/parent/home', tok).then((x) => { extra.home = x; }));
    if (view?.type === 'child') more.push(api.get(`/students/${view.id}`, tok).then((x) => { child = x; }).catch(() => { view = null; }));
    await Promise.all(more);
    render();
  }

  // ---------------------------------------------------------------- sheets
  function presetsFor(c) { const n = first(c.student); return c.level > 1 ? [tr('r_moved'), tr('r_assigned')] : c.mine && c.route === 'adult' ? [tr('r_chose', { name: n }), tr('r_assigned')] : [tr('r_assigned'), tr('r_chose', { name: n })]; }
  function callSheet(c, studentId = null) {
    const name = first(c?.student || child?.student);
    let when = 'lunch', where = 'counselling'; const reasons = c ? presetsFor(c) : [tr('r_pattern'), tr('r_checkin')]; let reason = reasons[0];
    const after = new Date(clock.now() + 330 * 60000).toISOString().slice(11, 16) >= '15:30'; // after school: the talk is tomorrow
    const preview = h('div.mini-oled', { 'data-demo': 'call-preview' });
    const upd = () => mount(preview, h('div.o-top', {}, tr('o_message')), h('div.o-big', {}, bandMsgText({ kind: 'call', vars: { who: label(me), when, where, tomorrow: after } })));
    const chips = (list, get, setv, demo) => { const box = h('div.chips'); list.forEach(([k, lab], i) => box.append(h(`button.chip-btn${get() === k ? '.on' : ''}`, { 'data-demo': `${demo}-${k}`, onclick: (e) => { setv(k); box.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); upd(); } }, lab))); return box; };
    upd();
    sheet(frame(), tr('call_title', { name }), h('div', {},
      h('div.small.muted', {}, tr('why_open')), chips(reasons.map((r) => [r, r]), () => reason, (v) => { reason = v; }, 'reason'),
      h('div.small.muted', {}, tr('when')), chips(WHEN.map(([k, l]) => [k, l[L()]]), () => when, (v) => { when = v; }, 'when'),
      h('div.small.muted', {}, tr('where')), chips(WHERE.map(([k, l]) => [k, l[L()]]), () => where, (v) => { where = v; }, 'where'),
      h('div.small.muted', {}, tr('band_will_show', { name })), preview,
      h('div.note-box.small', {}, '🔒 ', tr('reason_logged'))), [
      { label: tr('cancel') },
      { label: tr('send_band', { name }), kind: 'primary', demo: 'call-send', run: async () => {
        if (c) { await attempt(() => api.post(`/cases/${c.id}/open`, { reason }, tok)); await attempt(() => api.post(`/cases/${c.id}/call`, { when, where }, tok)); }
        else await attempt(() => api.post(`/students/${studentId}/call`, { when, where, reason }, tok));
        toast(tr('sent_band', { name }), 'good'); load();
      } }]);
  }
  function openChild(student) {
    if (!student?.id) return;
    const reasons = [tr('r_pattern'), tr('r_checkin'), tr('r_sos')]; let reason = reasons[0];
    const box = h('div.chips', {}, ...reasons.map((r, i) => h(`button.chip-btn${i === 0 ? '.on' : ''}`, { 'data-demo': `creason-${i}`, onclick: (e) => { reason = r; box.querySelectorAll('.chip-btn').forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, r)));
    sheet(frame(), tr('why_open_child', { name: first(student) }), h('div', {}, box, h('div.note-box.small', {}, '🔒 ', tr('reason_logged'))), [
      { label: tr('cancel') }, { label: tr('open_btn'), kind: 'primary', demo: 'child-open', run: async () => { await attempt(() => api.post(`/students/${student.id}/open`, { reason }, tok)); view = { type: 'child', id: student.id }; await load(); root.scrollTop = 0; } }]);
  }
  function informSheet(student) {
    const presets = [tr('ip_1', { name: first(student) }), tr('ip_2', { name: first(student) })];
    const ta = h('textarea', { rows: 3, 'data-demo': 'inform-text' }); ta.value = presets[0];
    sheet(frame(), tr('inform_parent'), h('div', {}, h('div.chips', {}, ...presets.map((p, i) => h('button.chip-btn', { 'data-demo': `ip-${i}`, onclick: () => { ta.value = p; } }, p.slice(0, 40) + '…'))), ta,
      h('div.note-box.small', {}, '👪 ', tr('inform_note'))), [
      { label: tr('cancel') }, { label: tr('share_parent'), kind: 'primary', demo: 'inform-send', run: async () => { await attempt(() => api.post(`/students/${student.id}/inform-parent`, { text: ta.value }, tok), tr('shared_parent')); load(); } }]);
  }
  const label = (u) => { const p = (u.name || '').split(' '); return ['Ms', 'Mr', 'Mrs', 'Dr', 'Nurse'].includes(p[0]) ? `${p[0]} ${p[p.length - 1]}` : u.name; };

  // ---------------------------------------------------------------- SOS
  function sosBanner() {
    if (!sos.length || ['urgent', 'sos'].includes(tab) && !view) return null;
    const c = sos[0];
    return h('button.sos-banner', { 'data-demo': 'sos-banner', onclick: () => { tab = tabs.includes('urgent') ? 'urgent' : tabs.includes('sos') ? 'sos' : tab; view = null; load(); } },
      h('span.sos-dot'), h('div.grow', {}, h('b', {}, `${c.kind === 'medical_sos' ? tr('medical_sos') : 'SOS'} · ${c.student?.name} (${c.student?.class})`),
        h('div.small', {}, `📍 ${c.location ? gwName(c.location.gw, getLang()) : tr('place_unknown')}${c.location?.at ? ` · ${ago(c.location.at)}` : ''}${c.going_by ? ` · ${tr('is_going', { name: c.going_by.label })}` : ''}`)),
      c.going_by ? h('span.chip.good', {}, '✓') : h('span.chip.white', {}, tr('im_going')));
  }
  function sosCard(c, demo = true) {
    const going = c.going_by; const mineGoing = going?.id === me.id;
    return h(`div.sos-card${going ? '.going' : ''}`, { 'data-demo': demo ? 'sos-card' : null },
      h('div.req-top', {}, avatar(c.student?.name), h('div.grow', {}, h('b', {}, c.student?.name), h('div.small', {}, `${tr('class')} ${c.student?.class} · ${c.kind === 'medical_sos' ? tr('medical_sos_long') : tr('sos_long')} · ${t(c.created_at)}`))),
      schoolMap({ pin: c.location?.gw, trail: c.trail, compact: true, demo: demo ? 'sos-pin' : null }),
      h('div.place', { 'data-demo': demo ? 'sos-place' : null }, '📍 ', h('b', {}, c.location ? gwName(c.location.gw, getLang()) : tr('place_unknown')), c.location?.at ? h('span.muted', {}, ` · ${ago(c.location.at)}`) : null),
      c.health_note ? h('div.note-box.small', {}, '🩺 ', tr('nurse_added')) : null,
      going ? h('div.done-line', {}, '🏃 ', tr('is_going', { name: mineGoing ? tr('you') : going.label })) : countdown(c),
      h('div.row.gap', {},
        !going ? h('button.btn.danger.big.grow', { 'data-demo': demo ? 'sos-going' : null, onclick: async () => { await attempt(() => api.post(`/cases/${c.id}/ack`, {}, tok)); load(); } }, '🏃 ', tr('im_going')) : null,
        mineGoing ? h('button.btn.primary.big.grow', { 'data-demo': demo ? 'sos-reached' : null, onclick: async () => { await attempt(() => api.post(`/cases/${c.id}/reached`, { note: '' }, tok), tr('reached_ok')); load(); } }, '✓ ', tr('reached')) : null));
  }

  // ---------------------------------------------------------------- talk request cards
  function reqCard(c, demo) {
    const name = c.student?.name; const movedOn = !c.mine && role === 'teacher' && c.status === 'open';
    const responded = c.status === 'responded';
    return h(`div.req${movedOn ? '.moved' : ''}${responded ? '.done' : ''}`, { 'data-demo': demo ? 'req-card' : null, 'data-ref': c.ref },
      h('div.req-top', {}, avatar(name), h('div.grow', {}, h('b', {}, `${name} · ${c.student?.class}`), h('div.small.muted', {}, tr(c.route === 'counsellor' ? 'asked_counsellor' : 'asked_band', { time: t(c.created_at) })))),
      movedOn ? h('div.moved-line', { 'data-demo': demo ? 'moved-line' : null }, '↗ ', tr('moved_to', { name: c.recipients.map((r) => r.label).join(', ') || tr('mgmt') })) : null,
      responded ? h('div.done-line', { 'data-demo': demo ? 'sent-line' : null }, `✓ ${tr('sent_ok')}`, c.message?.seen ? h('span', { 'data-demo': 'seen' }, ` · ${tr('saw_it', { name: first(c.student) })} ✓`) : h('span.muted', {}, ` · ${tr('not_seen_yet')}`),
        h('div.small.muted', {}, bandMsgText(c.message))) : null,
      !movedOn && !responded ? countdown(c) : null,
      c.level > 1 && c.mine && !responded ? h('div.small.muted', {}, '↗ ', tr('moved_because')) : null,
      h('div.row.gap.wrap', {},
        !movedOn && !responded ? h('button.btn.primary.big.grow', { 'data-act': 'call', 'data-demo': demo ? 'call-btn' : null, onclick: () => callSheet(c) }, '📣 ', tr('call_to_talk')) : null,
        responded ? h('button.btn.light.grow', { 'data-act': 'talked', onclick: async () => { await attempt(() => api.post(`/cases/${c.id}/talked`, { note: '' }, tok), tr('talked_ok')); load(); } }, '✓ ', tr('talked')) : null,
        responded && role === 'teacher' ? h('button.btn.ghost.grow', { onclick: async () => { await attempt(() => api.post(`/cases/${c.id}/handover`, { to: 'counsellor' }, tok), tr('handed_ok')); load(); } }, tr('needs_counsellor')) : null,
        responded && role === 'counsellor' ? h('button.btn.ghost.grow', { onclick: async () => { await attempt(() => api.post(`/cases/${c.id}/handover`, { to: 'staff' }, tok), tr('handed_ok')); load(); } }, tr('about_staff')) : null));
  }

  // ---------------------------------------------------------------- teacher
  function today() {
    const talks = queue.filter((c) => c.kind === 'talk' && ['open', 'responded'].includes(c.status));
    const waiting = talks.filter((c) => c.mine && c.status === 'open');
    return h('div.tab-body', {},
      h('h2.headline', { 'data-demo': 'headline' }, waiting.length ? tr(waiting.length === 1 ? 'want_talk_1' : 'want_talk_n', { n: waiting.length }) : tr('nobody_waiting')),
      ...talks.slice(0, 3).map((c, i) => reqCard(c, i === 0)),
      meInfo?.chosen_by?.length ? h('div.soft-note', { 'data-demo': 'chosen-by' }, h('span', {}, '🤝'), h('div', {}, h('b', {}, tr('chosen_by_t')), h('div.small', {}, meInfo.chosen_by.map((p) => first(p)).join(', '), ' · ', tr('chosen_by_b')))) : null,
      ...sos.map((c) => sosCard(c)));
  }
  function classTab() {
    const m = extra.mood, tt = extra.tt; if (!m || !tt) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const row = m.row; const w = row.weather; const act = row.activity; const ahi = act && ACTIVITY_HI[act.title];
    const wf = BY_CODE[WEEK_FEELING.code];
    return h('div.tab-body', {},
      h(`div.weather-card.w-${w}`, { 'data-demo': 'class-weather' }, h('span.w-e', {}, { sun: '☀️', mixed: '⛅', rain: '🌧️', storm: '⛈️', none: '❔' }[w]),
        h('div', {}, h('div.small', {}, `${tr('class')} ${row.class} · ${tr('this_week')}`), h('h2', {}, row.flag ? tr('w_storm_class', { c: row.class }) : tr(`w_${w}`)))),
      row.top.length ? h('div', {}, h('div.small.muted', {}, tr('top_feelings')), h('div.chips', {}, ...row.top.map((code) => h('span.feel-chip', { style: { background: BY_CODE[code].c } }, BY_CODE[code].e, ' ', feelWord(code, getLang()))))) : null,
      h('div.tt', { 'data-demo': 'timetable' }, h('div.small.muted', {}, '🗓 ', tr('today_tt')),
        h('div.tt-strip', {}, ...tt.periods.filter((p) => !['Assembly'].includes(p.subject)).map((p) => h(`div.tt-p${p.pauses ? '.pause' : ''}${tt.now.subject === p.subject ? '.now' : ''}`, { title: `${p.start}–${p.end}` }, h('b', {}, subj(p.subject)), h('span', {}, p.start)))),
        tt.periods.filter((p) => p.pauses).map((p) => h('div.small.pt-note', { 'data-demo': 'pt-note' }, '⏸ ', tr('pt_paused', { c: tt.class, s: subj(p.subject), a: p.start, b: p.end }))),
        tt.pt_bands ? h('div.small.muted', {}, tr('pt_bands', { n: tt.pt_bands })) : null),
      act ? h(`div.activity${row.activity_done ? '.done' : ''}`, { 'data-demo': 'activity' },
        h('div.small.muted', {}, '✨ ', tr('activity_from')), h('h3', {}, (L() && ahi ? ahi.title : act.title), ` · ${act.minutes} ${tr('u_min')}`), h('p.small', {}, L() && ahi ? ahi.goal : act.goal),
        h('ol', {}, ...(L() && ahi ? ahi.steps : act.steps).map((s) => h('li', {}, s))),
        row.activity_done ? h('div.done-line', {}, '✓ ', tr('done_class_ok')) : h('button.btn.primary.big', { 'data-demo': 'activity-done', onclick: async () => { await attempt(() => api.post(`/activities/${row.class_id}/done`, { code: act.code }, tok), tr('done_class_ok')); load(); } }, '✓ ', tr('done_class')),
        h('div.small.muted', {}, tr('activity_note'), h('span.sim', {}, tr('simulated')))) : null,
      h('details.week-card', {}, h('summary', {}, `${wf.e} `, tr('feeling_week'), ': ', h('b', {}, feelWord(wf.code, getLang()))), h('ol.small', {}, ...WEEK_FEELING.script.map((s) => h('li', {}, s[L()])))),
      h('div.privacy', {}, '🔒 ', tr('no_names')));
  }
  function alertsTab() {
    const hist = (extra.sosHistory || []).filter((c) => c.status !== 'open' && c.status !== 'acknowledged').slice(0, 3);
    return h('div.tab-body', {}, h('h2.headline', {}, notes.length ? tr('tab_alerts') : tr('nothing_new')),
      ...notes.slice(0, 10).map((n) => { const x = noteText(n);
        return h(`div.feed-row${n.read ? '.read' : ''}${n.kind?.startsWith('sos') ? '.sos' : ''}`, { 'data-kind': n.kind }, h('span', {}, { quiet: '🤫', silent: '🔋', pattern: '🌱', talk_new: '💬', talk_moved_on: '↗', talk_moved_you: '↘', remind: '⏰', sos: '🆘', sos_sms: '📱', sos_call: '📞' }[n.kind] || '🔔'),
          h('div.grow', {}, h('b', {}, x.title), h('div.small', {}, x.body)), ['sms', 'call_task'].includes(n.channel) ? h('span.sim', {}, tr('simulated')) : null, h('span.small.muted', {}, ago(n.at))); }),
      hist.length ? h('div', {}, h('h3', {}, tr('sos_history')), ...hist.map((c) => h('div.feed-row', {}, h('span', {}, '🆘'), h('div.grow', {}, h('b', {}, c.student?.name), h('div.small', {}, `${t(c.created_at)} · ${c.going_by ? tr('is_going', { name: c.going_by.label }) : tr(`st_${c.status}`)}`))))) : null);
  }

  // ---------------------------------------------------------------- counsellor
  function urgent() {
    const talks = queue.filter((c) => c.kind === 'talk' && c.status === 'open' && c.mine).slice(0, 2);
    return h('div.tab-body', {}, h('h2.headline', {}, sos.length ? tr('sos_now', { n: sos.length }) : tr('no_sos')),
      ...sos.map((c, i) => sosCard(c, i === 0)),
      talks.length ? h('div.group-h', {}, h('span.gdot.amber'), tr('due_soon')) : null, ...talks.map((c, i) => reqCard(c, !sos.length && i === 0)),
      !sos.length && role === 'counsellor' ? h('div.glance', {}, h('div.small.muted', {}, tr('at_glance')),
        h('button', { onclick: () => { tab = 'requests'; load(); } }, h('span', {}, '💬 ', tr('tab_requests')), h('b.n', {}, queue.filter((c) => c.kind === 'talk' && c.status === 'open').length)),
        h('button', { onclick: () => { tab = 'patterns'; load(); } }, h('span', {}, '🌱 ', tr('tab_patterns')), h('b.n', {}, '›'))) : null);
  }
  function requests() {
    const talks = queue.filter((c) => c.kind === 'talk' && ['open', 'responded'].includes(c.status));
    const mine = talks.filter((c) => c.mine || c.status === 'responded'); const others = talks.filter((c) => !mine.includes(c));
    return h('div.tab-body', {}, h('h2.headline', {}, mine.filter((c) => c.status === 'open').length ? tr('want_talk_n', { n: mine.filter((c) => c.status === 'open').length }) : tr('nobody_waiting')),
      ...mine.slice(0, 3).map((c, i) => reqCard(c, i === 0)),
      others.length ? h('details.hist', {}, h('summary', {}, tr('with_others', { n: others.length })), ...others.map((c) => h('div.small', {}, `${c.student?.name} · ${tr('with_name', { name: c.recipients.map((r) => r.label).join(', ') })} · ${t(c.deadline)}`))) : null);
  }
  function patterns() {
    const ps = extra.patterns || [];
    return h('div.tab-body', {}, h('h2.headline', {}, ps.length ? tr('patterns_head') : tr('no_patterns')),
      ...ps.slice(0, 3).map((p, i) => h('button.pattern-card', { 'data-demo': i === 0 ? 'pattern' : null, onclick: () => openChild(p.student) },
        avatar(p.student.name), h('div.grow', {}, h('b', {}, p.student.name, ` · ${p.student.class}`), h('div', {}, BY_CODE[p.code].e, ' ', tr('pattern_line', { feeling: feelWord(p.code, getLang()), n: p.days })), h('div.small.muted', {}, tr('consider_checkin'))), h('span.chev', {}, '›'))),
      h('div.small.muted', {}, '🔒 ', tr('patterns_rule')));
  }
  function childPage() {
    if (!child) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const st = child.student;
    return h('div.tab-body', {},
      h('button.back-btn', { 'data-demo': 'back', onclick: () => { view = null; child = null; load(); } }, ic('back'), tr('back')),
      h('div.case-head', {}, avatar(st.name, 'lg'), h('div', {}, h('h2', {}, st.name), h('div.muted', {}, `${tr('class')} ${st.class}${child.adult ? ` · ${tr('chose_name', { name: child.adult.label })}` : ''}`))),
      child.visible ? h('div.timeline', { 'data-demo': 'timeline' }, h('div.small.muted', {}, tr('feel_14')),
        h('div.tl-row', {}, ...child.timeline.map((d) => h(`span.tl${d.code && BY_CODE[d.code]?.difficult ? '.heavy' : ''}`, { title: `${d.date}: ${d.all.map((c) => feelWord(c, getLang())).join(', ') || '—'}` }, d.code ? BY_CODE[d.code].e : '·'))),
        h('div.small', {}, child.timeline.filter((d) => d.code).slice(-4).map((d) => `${d.date.slice(5)} ${feelWord(d.code, getLang())}`).join(' · '))) : h('div.note-box', {}, tr('no_consent')),
      h('div.row.gap.wrap', {},
        h('button.btn.primary.big.grow', { 'data-demo': 'child-call', onclick: () => callSheet(null, st.id) }, '📣 ', tr('call_to_talk')),
        h('button.btn.light.big.grow', { 'data-demo': 'inform-parent', onclick: () => informSheet(st) }, '👪 ', tr('inform_parent'))),
      child.parent_messages.length ? h('div.small.muted', {}, '👪 ', tr('parent_told', { n: child.parent_messages.length })) : null,
      h('details.hist', {}, h('summary', {}, '👀 ', tr('who_opened'), ` (${child.opened_by.length})`), h('ul', {}, ...child.opened_by.map((o) => h('li', {}, `${o.who.label} · ${t(o.at)} · “${o.reason}”`)))),
      h('div.small.muted', {}, '✅ ', tr('consent_line', { s: child.consent.sensing ? tr('on') : tr('off'), f: child.consent.feelings_to_counsellor ? tr('on') : tr('off') })));
  }

  // ---------------------------------------------------------------- principal
  function overview() {
    const r = extra.report; if (!r) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const ontime = r.on_time_share != null ? Math.round(r.on_time_share * 100) : null;
    const kpi = (v, key, tone, demo) => h(`div.kpi.${tone}`, { 'data-demo': demo }, h('div.kpi-v', {}, v ?? '–'), h('div.kpi-l', {}, tr(key)));
    return h('div.tab-body', {}, h('h2.headline', {}, tr('does_school_answer')),
      h('div.kpis', {}, kpi(ontime != null ? `${ontime}%` : null, 'k_ontime', ontime >= 90 ? 'good' : ontime >= 70 ? 'warn' : 'bad', 'kpi-ontime'),
        kpi(r.median_response_minutes != null ? `${r.median_response_minutes} ${tr('u_min')}` : null, 'k_median', 'brand'), kpi(r.open_sos, 'k_open_sos', r.open_sos ? 'bad' : 'good')),
      r.unanswered ? h('div.alert-card.bad', {}, '⚠ ', tr('unanswered_n', { n: r.unanswered })) : h('div.alert-card.good', {}, '✓ ', tr('unanswered_0')),
      h('div.small.muted', {}, tr('last_30', { n: r.cases })));
  }
  function sosTab() {
    const hist = (extra.sosHistory || []).filter((c) => !['open', 'acknowledged'].includes(c.status)).slice(0, 4);
    return h('div.tab-body', {}, h('h2.headline', {}, sos.length ? tr('sos_now', { n: sos.length }) : tr('no_sos')), ...sos.map((c, i) => sosCard(c, i === 0)),
      hist.length ? h('div', {}, h('h3', {}, tr('sos_history')), ...hist.map((c) => h('div.feed-row', {}, h('span', {}, c.kind === 'medical_sos' ? '🩺' : '🆘'), h('div.grow', {}, h('b', {}, `${c.student?.name} · ${t(c.created_at)}`),
        h('div.small', {}, `${c.going_by ? tr('who_went', { name: c.going_by.label }) : tr(`st_${c.status}`)}${c.minutes_to_reach != null ? ` · ${tr('mins_to_ack', { n: c.minutes_to_reach })}` : ''}${c.location ? ` · ${gwName(c.location.gw, getLang())}` : ''}`))))) : null);
  }
  function report() {
    const r = extra.report; if (!r) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const bars = (obj, keyOf) => { const m = Math.max(1, ...Object.values(obj)); return h('div.bars', {}, ...Object.entries(obj).map(([k, v]) => h('div.bar-row', {}, h('span', {}, tr(keyOf(k))), h('i', {}, h('em', { style: { width: `${(v / m) * 100}%` } })), h('b', {}, v)))); };
    return h('div.tab-body.report', {}, h('h2.headline', {}, tr('report_title')), h('div.small.muted', {}, tr('last_30', { n: r.cases })),
      h('div.kpis.sm', {}, h('div.kpi.brand', {}, h('div.kpi-v', {}, r.on_time_share != null ? `${Math.round(r.on_time_share * 100)}%` : '–'), h('div.kpi-l', {}, tr('k_ontime'))),
        h('div.kpi.grey', {}, h('div.kpi-v', {}, r.moved_up), h('div.kpi-l', {}, tr('k_moved'))), h('div.kpi.grey', {}, h('div.kpi-v', {}, r.median_sos_ack_minutes ?? '–'), h('div.kpi-l', {}, tr('k_sos_ack')))),
      h('h3', {}, tr('by_type')), bars(r.by_kind, (k) => `kind_${k}`), h('h3', {}, tr('by_route')), bars(r.by_route, (k) => `route_${k}`),
      h('div.note-box', {}, '⚖ ', tr('basis'), h('br'), h('b', {}, tr('counts_only'))),
      ['principal', 'management'].includes(role) ? h('div.row.gap.wrap', {},
        h('button.btn.light', { onclick: async () => { const csv = await api.get('/reports/response.csv', tok); const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'prerana-pulse-response-report.csv' }); document.body.append(a); a.click(); a.remove(); } }, '⬇ ', tr('export_csv')),
        h('button.btn.light', { onclick: () => window.print() }, '🖨 ', tr('print_pdf'))) : null);
  }
  function devices() {
    const d = extra.devices; if (!d) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const status = Object.fromEntries(d.gateways.map((g) => [g.id, g.ok])); const down = d.gateways.filter((g) => !g.ok);
    const low = d.bands.filter((b) => b.low_battery);
    return h('div.tab-body', {}, h('h2.headline', {}, down.length ? tr('devices_down', { n: down.length }) : tr('devices_ok')),
      schoolMap({ status }),
      ...down.map((g) => h('div.alert-card.warn', {}, '🟠 ', gwName(g.id, getLang()), ': ', tr('no_gw_since', { time: t(g.last_heartbeat) }))),
      h('h3', {}, '🔋 ', tr('charge_tonight')),
      low.length ? h('div.chips', {}, ...low.map((b) => h('span.chip.warn', {}, `${b.student || b.id} · ${b.battery}%`))) : h('div.small.muted', {}, tr('all_charged')));
  }

  // ---------------------------------------------------------------- parent
  function home() {
    const x = extra.home; if (!x) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const b = x.band;
    return h('div.tab-body', {}, h('h2.headline', {}, tr('parent_hi', { name: first(x.child) })),
      b ? h('div.band-status', { 'data-demo': 'band-status' }, h('span.bs-e', {}, '⌚'), h('div', {}, h('b', {}, tr('child_band', { name: first(x.child) })),
        h('div', {}, b.worn_today ? `✓ ${tr('worn_today')}` : tr('not_worn'), ` · 🔋 ${b.battery}%`, b.charge_tonight ? ` · ${tr('charge_tonight_1')}` : ''))) : null,
      h('h3', {}, '💬 ', tr('pa_msgs')),
      x.messages.length ? x.messages.slice(0, 3).map((m, i) => h('div.parent-msg', { 'data-demo': i === 0 ? 'parent-msg' : null }, h('div.small.muted', {}, `${m.from?.label} · ${t(m.at)}`), m.text)) : h('div.soft-note', {}, h('span', {}, '📭'), h('div', {}, tr('pa_none'))),
      h('details.hist', {}, h('summary', {}, tr('pa_never')), h('ul.never', {}, h('li', {}, tr('pa_n1')), h('li', {}, tr('pa_n2')), h('li', {}, tr('pa_n3')))));
  }
  function settings() {
    const x = extra.home; if (!x) return h('div.tab-body', {}, h('div.muted', {}, '…'));
    const sw = (key, on, title, sub) => h('div.setting', {}, h('div.grow', {}, h('b', {}, title), h('div.small.muted', {}, sub)),
      h(`button.switch${on ? '.on' : ''}`, { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': title, onclick: async () => { await attempt(() => api.post('/parent/consent', { [key]: !on }, tok), tr('saved')); load(); } }, h('i')));
    const ta = h('textarea', { rows: 2 }); ta.value = x.health_note || '';
    return h('div.tab-body', {}, h('h2.headline', {}, tr('settings_head')),
      sw('sensing', x.consent.sensing, tr('pa_sensing'), x.consent.sensing ? tr('pa_on') : tr('pa_off')),
      sw('feelings_to_counsellor', x.consent.feelings_to_counsellor, tr('pa_feel'), tr('pa_feel_sub')),
      h('div.setting.col', {}, h('b', {}, '🩺 ', tr('pa_health')), h('div.small.muted', {}, tr('pa_health_sub')), ta, h('button.btn.light.sm', { onclick: async () => { await attempt(() => api.post('/parent/consent', { health_note: ta.value }, tok), tr('saved')); } }, tr('save'))),
      h('div.setting', {}, h('b.grow', {}, '🌐 ', tr('language')), h('div.seg.sm', {}, h(`button${getLang() === 'en' ? '.on' : ''}`, { onclick: () => { setLang('en'); api.post('/parent/consent', { language: 'en' }, tok); } }, 'English'), h(`button${getLang() === 'hi' ? '.on' : ''}`, { onclick: () => { setLang('hi'); api.post('/parent/consent', { language: 'hi' }, tok); } }, 'हिन्दी'))),
      h('div.small.muted', {}, tr('dpdp_note')));
  }

  function render() {
    const unread = notes.filter((n) => !n.read && !n.panel).length;
    const body = view?.type === 'child' ? childPage() : { today, class: classTab, alerts: alertsTab, urgent, requests, patterns, overview, sos: sosTab, report, devices, home, settings }[tab]();
    mount(root, h(`div.app.r-${role}`, {},
      h('div.staff-head', {}, avatar(me.name), h('div.grow', {}, h('b', {}, me.name), h('div.small.muted', {}, roleLabel()))),
      sosBanner(), body,
      tabs.length > 1 ? h('nav.bottom-tabs', {}, ...tabs.map((x) => h(`button.btab${tab === x && !view ? '.on' : ''}`, { 'data-demo': `tab-${x}`, onclick: () => { tab = x; view = null; child = null; load(); root.scrollTop = 0; } },
        h('span.bt-i', {}, TAB_ICON[x]), h('span.bt-l', {}, tr(`tab_${x}`)), x === 'alerts' && unread ? h('i.badge-dot', {}, unread) : x === 'urgent' && sos.length ? h('i.badge-dot.red', {}, sos.length) : null))) : null));
  }

  load();
  let deb; const off = api.subscribe(tok, () => { clearTimeout(deb); deb = setTimeout(load, 180); });
  const tickT = setInterval(() => { if (document.activeElement?.tagName !== 'TEXTAREA' || !root.contains(document.activeElement)) render(); }, 15000);
  const offL = onLang(render);
  return { cleanup: () => { off(); offL(); clearInterval(tickT); }, setTab: (x) => { tab = x; view = null; return load(); }, reload: load };
}
