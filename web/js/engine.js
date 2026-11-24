// In-browser demo server (v2, band-only). It answers the /api routes the apps use and follows the
// rules in document.md: feelings stay private, a feeling chosen on 5 of the last 10 school days
// reaches the counsellor with the name, talk requests have a reply clock that moves up on its
// own, "Call to talk" stops the clock and appears on the band, SOS carries live room-level
// location from the strongest gateway, PT mode pauses noticing, parents get no automatic alerts.
// It exists so the hosted demo link works with no install.
import * as C from './crypto.js';
import { ROSTER } from './data.js';
import { BY_CODE, DIFFICULT, GATEWAYS, GW, timetableFor, ACTIVITY_LIST, ACTIVITY_FOR, WEEK_FEELING, WHEN, WHERE } from './content.js';
import * as M from './model.js';

const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const TZ_OFF = 330 * MIN; // Asia/Kolkata, no daylight saving
const SOS_ACK_MINUTES = 10, SOS_SMS_CAP = 6, REPLAY_WINDOW = 32, MIN_CELL = 10, COOLDOWN = 14 * DAY, GW_STALE = 90000, SIGHT_WINDOW = 30000;
const SCHOOL = { id: 'school-demo', name: 'Sunrise Public School (demo)', day_end: '15:30', staff_end: '16:00', days: [1, 2, 3, 4, 5, 6], holidays: [] };
const CLASSES = ['4A', '6A', '6B', '7A', '7B', '8A', '8B', '9A'];
const CLASS_TEACHER = { '7B': 'u-T01', '4A': 'u-T03' };
const EXTRA_USERS = [{ erp_ref: 'G01', name: 'Mrs Sunita Sharma', role: 'parent', title: 'Parent of Riya Sharma', child: 'S7B01' }];
const STAFF = new Set(['teacher', 'counsellor', 'principal', 'pocso', 'nurse', 'management', 'admin']);
export const RULES = {
  persistent: { version: 2, text: 'The same difficult feeling on 5 of the last 10 school days: the counsellor, with the name' },
  goes_quiet: { version: 2, text: '3 band questions skipped in a row: a quiet note to the chosen adult' },
  band_silent: { version: 1, text: 'No contact for a whole school day: the class teacher (check battery or fit)' },
  class_tension: { version: 2, text: 'Share of difficult feelings at least 2x the school median for 3 school days: the class teacher gets an activity, no names' },
  unanswered: { version: 1, text: 'Nobody responded at any level: management and the principal' },
};

export class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ------------------------------------------------------------------ school calendar
const pad = (n) => String(n).padStart(2, '0');
const lp = (ts) => { const d = new Date(ts + TZ_OFF); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes(), dow: d.getUTCDay() || 7 }; };
export const dateKey = (ts) => { const p = lp(ts); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
const keyToTs = (key, hm = '00:00') => { const [y, m, d] = key.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi) - TZ_OFF; };
const addDays = (key, n) => dateKey(keyToTs(key, '12:00') + n * DAY);
const isoDow = (key) => (new Date(keyToTs(key, '12:00') + TZ_OFF).getUTCDay() || 7);
const hm = (ts) => { const p = lp(ts); return `${pad(p.hh)}:${pad(p.mm)}`; };
export const cal = {
  isSchoolDay: (key) => SCHOOL.days.includes(isoDow(key)) && !SCHOOL.holidays.includes(key),
  nextSchoolDay(key) { let d = addDays(key, 1); for (let i = 0; i < 60 && !this.isSchoolDay(d); i++) d = addDays(d, 1); return d; },
  endOfSchoolDay(ts) { const k = dateKey(ts); const end = keyToTs(k, SCHOOL.day_end); return this.isSchoolDay(k) && end - ts >= HOUR ? end : keyToTs(this.nextSchoolDay(k), SCHOOL.day_end); },
  nextSchoolDayAt(ts, at) { return keyToTs(this.nextSchoolDay(dateKey(ts)), at); },
  sameSchoolDayStaff(ts) { const k = dateKey(ts); const end = keyToTs(k, SCHOOL.staff_end); return this.isSchoolDay(k) && end - ts >= HOUR ? end : this.nextSchoolDayAt(ts, '12:00'); },
  daysBack(ts, n) { const out = []; let d = dateKey(ts); while (out.length < n) { if (this.isSchoolDay(d)) out.push(d); d = addDays(d, -1); } return out.reverse(); },
};
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtTime(ts, ref) {
  if (ts == null) return '';
  const p = lp(ts); const h12 = p.hh % 12 || 12;
  const t = `${h12}:${pad(p.mm)} ${p.hh < 12 ? 'am' : 'pm'}`;
  if (ref != null && dateKey(ref) !== dateKey(ts)) {
    const diff = Math.round((keyToTs(dateKey(ts), '12:00') - keyToTs(dateKey(ref), '12:00')) / DAY);
    return diff === 1 ? `${t} tomorrow` : `${t} ${WD[p.dow - 1]} ${pad(p.d)} ${MO[p.m - 1]}`;
  }
  return t;
}
export function periodAt(className, ts) {
  const t = hm(ts); const k = dateKey(ts);
  if (!cal.isSchoolDay(k)) return { subject: 'none', pauses: false };
  const p = timetableFor(className).find((x) => t >= x.start && t < x.end);
  return p ? { ...p } : { subject: t < '08:00' ? 'Before school' : 'After school', pauses: false };
}
export function ctxAt(className, ts, extra = {}) {
  const p = lp(ts);
  return { tod: M.todOf(p.hh, p.mm), dow: String(p.dow > 6 ? 6 : p.dow), period: periodAt(className, ts).subject, ...extra };
}

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const iso = (ts) => (ts == null ? null : new Date(ts).toISOString());
const enc = new TextEncoder();
export function demoDayOffset(real = Date.now()) { let k = dateKey(real); while (isoDow(k) === 7) k = addDays(k, 1); return keyToTs(k, '10:40') - real; }
let CARD = null; // the model card is measured once per page load (about half a second)
const card = () => (CARD ||= M.evaluate());

// Notification texts (English; the apps render them in English or Hindi from kind + vars).
const NT = {
  talk_new: (v) => [`${v.first} wants to talk`, `${v.who} asked on the band to talk to you. Respond by ${v.due}.`],
  talk_moved_you: (v) => ['Moved to you', `${v.who}: no one responded in time. Respond by ${v.due}.`],
  talk_moved_on: (v) => ['Moved on', `${v.who}: the deadline passed, so it moved to ${v.to}.`],
  talk_handover: (v) => ['Handed to you', `${v.who}: ${v.by} asked you to take this. Respond by ${v.due}.`],
  remind: (v) => [`Reminder: ${v.pct}% of the time used`, `${v.who}. Respond by ${v.due}.`],
  unanswered: (v) => ['Unanswered at every level', `${v.who}: nobody responded at any level.`],
  sos: (v) => [v.medical ? 'Medical SOS' : 'SOS', `${v.who} ${v.medical ? 'is unwell and needs the nurse' : 'needs help now'}. Near ${GW[v.gw]?.name[0] || 'unknown'}.`],
  sos_going: (v) => ['Someone is going', `${v.by} is going to ${v.who}.`],
  sos_sms: (v) => ['SOS not answered: SMS', `${v.who} still needs help. Near ${GW[v.gw]?.name[0] || 'unknown'}.`],
  sos_call: (v) => ['Call now', `SOS not answered: ${v.who}.`],
  sos_cancel: (v) => ['SOS cancelled by the child', `${v.who} cancelled. A quiet check-in later is a good idea.`],
  sos_reached: (v) => ['Reached the child', `${v.by} reached ${v.who}.`],
  pattern: (v) => ['Feelings pattern', `${v.who} has chosen "${BY_CODE[v.code]?.en}" on ${v.n} of the last 10 school days. Consider a check-in.`],
  quiet: (v) => ['Quiet band', `${v.who} skipped the band’s last 3 questions. Maybe say hi.`],
  silent: (v) => ['Band silent', `Band ${v.band} (${v.who}) was silent all day. Check the battery or the fit.`],
};

// ------------------------------------------------------------------ the engine
export class Engine {
  constructor() { this.listeners = new Set(); this.gwPower = {}; this.serverReachable = true; }
  now() { return Date.now() + this.offset; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { console.error(e); } } }

  async seed() {
    this.offset = demoDayOffset();
    const rnd = mulberry32(7); const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const now = this.now();
    const s = this.s = { users: [], classes: [], trusted: {}, consents: {}, health: {}, bands: {}, gateways: {}, bandEvents: {}, sightings: [], feelings: [], exercises: [],
      mood: [], cases: [], bandMessages: [], events: [], timers: [], outbox: [], notifications: [], alerts: [], access: [], activities: {}, parentMessages: [],
      settings: { pocso_on_sos: false }, silentChecked: {}, smsToday: {}, seq: { ref: 101, id: 1, msg: 1 } };
    this.key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    CLASSES.forEach((name) => s.classes.push({ id: `cl-${name}`, name }));
    for (const r of [...ROSTER, ...EXTRA_USERS]) {
      const cls = r.role === 'student' ? `cl-${r.class}` : null;
      const classOf = Object.entries(CLASS_TEACHER).find(([, t]) => t === `u-${r.erp_ref}`)?.[0] || null;
      s.users.push({ id: `u-${r.erp_ref}`, role: r.role, erp_ref: r.erp_ref, name: r.name, class_id: cls, class_name: r.role === 'student' ? r.class : null,
        title: classOf ? `Class teacher, ${classOf}` : r.title || null, teaches: classOf, age_pack: /^[345]/.test(r.class || '') ? 'junior' : 'teen', can_be_chosen: !!r.chosen,
        child_id: r.child ? `u-${r.child}` : null, language: 'en' });
    }
    for (const r of ROSTER.filter((x) => x.role === 'student')) {
      const uid = `u-${r.erp_ref}`;
      s.consents[uid] = { sensing: true, feelings_to_counsellor: r.erp_ref !== 'S8A02', given_by: 'parent (admission form)', given_at: now - 120 * DAY };
      s.health[uid] = { nurse_on_sos: !!r.nurse_on_help, pause_sensing: false, note: r.nurse_on_help ? 'Asthma: inhaler in bag' : '' };
      if (r.adult) s.trusted[uid] = `u-${r.adult}`;
      if (r.band) s.bands[r.band] = { id: r.band, student_id: uid, key: await C.demoBandKey(r.band), last_counter: 40, last_seen: now - ri(5, 50) * MIN, battery: ri(55, 96), revoked: false, pt_until: 0, model: M.newModel() };
    }
    s.bands[1001].battery = 64; s.bands[1005].last_seen = keyToTs(cal.daysBack(now - DAY, 2)[0], '14:20'); s.bands[1005].battery = 3;
    for (const g of GATEWAYS) {
      s.gateways[g.id] = { id: g.id, kind: g.kind, location: g.name[0], x: g.x, y: g.y, version: '0.4.0', last_heartbeat: g.id === 'gw-blockb' ? keyToTs(dateKey(now), '08:35') : now - 20000 };
      this.gwPower[g.id] = g.id !== 'gw-blockb';
    }
    this.serverReachable = true; this.gwQueue = {};
    this.school = JSON.parse(JSON.stringify(card().school)); // school-wide prior, from simulated children
    this._seedFeelings(rnd, ri, now);
    this._seedMood(rnd, ri, now);
    await this._seedHistory(rnd, ri, now);
    this.emit({ type: 'clock' });
    return { school_id: SCHOOL.id };
  }

  // Past band choices for the demo cast. Riya: worried in Maths, sad in the afternoons; "sad" on 4 of
  // the last 9 school days (the 5th, today, reaches the counsellor). Aarav: 2 skipped questions.
  _seedFeelings(rnd, ri, now) {
    const days = cal.daysBack(now - DAY, 24); // oldest first, ending yesterday
    const recent = days.slice(-9); const older = days.slice(0, -9);
    const add = (sid, key, at, code, asked = true, riseB = 1) => {
      const st = this.user(sid); const ctx = ctxAt(st.class_name, at, { rise: asked ? ['self', 'r20', 'r30', 'r45'][riseB] : 'self', move: code === 10 ? 'active' : 'still' });
      this.s.feelings.push({ id: this.s.seq.id++, student_id: sid, code, suggested: null, accepted: null, ctx, source: asked ? 'band-ask' : 'band-self', at });
      const band = Object.values(this.s.bands).find((b) => b.student_id === sid); if (band) M.update(band.model, ctx, code);
      M.update(this.school, ctx, code);
    };
    // Riya
    const riya = 'u-S7B01';
    older.forEach((d, i) => {
      add(riya, d, keyToTs(d, '10:45'), rnd() < 0.7 ? 2 : 1, true, 2);
      if (i % 2 === 0) add(riya, d, keyToTs(d, '13:40'), rnd() < 0.3 ? 3 : 1, true, 1);
      if (i % 3 === 0) add(riya, d, keyToTs(d, '11:35'), 10, true, 3);
    });
    const plan = { 8: [3], 7: [2], 6: [3], 5: [2, 1], 4: [1], 3: [3], 2: [2], 1: [10], 0: [3] }; // index from the end of `recent`
    Object.entries(plan).forEach(([back, codes]) => {
      const d = recent[recent.length - 1 - Number(back)];
      codes.forEach((code) => { const at = code === 2 ? '10:50' : code === 10 ? '11:40' : code === 3 ? '13:45' : '09:30'; add(riya, d, keyToTs(d, at), code, code !== 3 || rnd() < 0.5, code === 10 ? 3 : 1); });
    });
    // Everyone else with a band: simulated habits mapped onto real days.
    let seed = 500;
    for (const b of Object.values(this.s.bands)) {
      if (b.student_id === riya) continue;
      const sim = M.simulateChild(seed++, days.length);
      for (const ev of sim.events) {
        const d = days[ev.day]; const at = keyToTs(d, { English: '08:30', Hindi: '09:10', Science: '09:50', Maths: '10:45', PT: '11:30', Lunch: '12:15', 'Social Studies': '12:55', Computer: '13:35', Art: '14:15', Library: '15:00' }[ev.ctx.period] || '10:00');
        if (DIFFICULT.has(ev.code) && ev.day >= days.length - 10 && rnd() < 0.5) continue; // keep the recent window calm
        add(b.student_id, d, at, ev.code, ev.ctx.rise !== 'self', { self: 0, r20: 1, r30: 2, r45: 3 }[ev.ctx.rise]);
      }
    }
    // Aarav skipped the last two questions.
    [[recent[recent.length - 1], '15:20'], [dateKey(now), '09:31']].forEach(([d, t]) => this.s.feelings.push({ id: this.s.seq.id++, student_id: 'u-S7B02', code: 0, skipped: true, at: Math.min(keyToTs(d, t), now - 40 * MIN) }));
    // Zoya's band was silent all of yesterday: the class teacher was told at the end of the day.
    const y = recent[recent.length - 1];
    this.s.alerts.push({ id: this.s.seq.id++, rule: 'band_silent', rule_version: 1, student_id: 'u-S7B05', to_user: 'u-T01', at: keyToTs(y, '15:30'), detail: { band: 1005 } });
    this.s.notifications.push({ id: this.s.seq.id++, user_id: 'u-T01', channel: 'push', kind: 'silent', vars: { who: 'Zoya Ali (7B)', band: 1005 }, ...this._text('silent', { who: 'Zoya Ali (7B)', band: 1005 }), case_id: null, created_at: keyToTs(y, '15:30'), read_at: null });
    this.s.silentChecked[y] = true;
  }

  // Anonymous class answers for "class weather" (k >= 10 per cell). 7B has been tense for 3 days.
  _seedMood(rnd, ri, now) {
    const days = cal.daysBack(now, 10);
    const easy = [[1, 0.8], [10, 0.09], [2, 0.04], [6, 0.03], [3, 0.02], [8, 0.02]];
    const tense = [[1, 0.42], [8, 0.2], [2, 0.15], [6, 0.1], [3, 0.07], [4, 0.06]];
    const pickW = (pairs) => { let u = rnd(), a = 0; for (const [v, p] of pairs) { a += p; if (u < a) return v; } return pairs[0][0]; };
    for (const cl of this.s.classes) days.forEach((d, i) => {
      const today = d === dateKey(now);
      let n = today ? ri(16, 20) : ri(14, 24); if (cl.name === '9A' && i === 6) n = 7;
      const dist = cl.name === '7B' && i >= 7 ? tense : easy;
      for (let k = 0; k < n; k++) { let at = keyToTs(d, '08:10') + ri(0, 400) * MIN; if (at > now) at = now - ri(2, 120) * MIN; this.s.mood.push({ class_id: cl.id, code: pickW(dist), at }); }
    });
  }

  async _seedHistory(rnd, ri, now) {
    const days = cal.daysBack(now - DAY, 22);
    const students = ['S7B03', 'S7B04', 'S6A01', 'S8A01', 'S8A02', 'S4A01', 'S7B05', 'S7B02'].map((k) => `u-${k}`);
    const delays = [35, 80, 140, 20, 290, 45, 15, 60, 210, 25, 95, 50, 40, 30, 70, 110];
    const kinds = [...Array(7).fill('talk'), 'sos', ...Array(5).fill('talk'), 'medical_sos', 'talk', 'talk'];
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i]; const sos = kind !== 'talk';
      const created = keyToTs(days[i + 3], '09:10') + ri(0, 240) * MIN;
      const delay = sos ? ri(2, 6) : delays[i];
      const responded = created + delay * MIN;
      const deadline = sos ? created + SOS_ACK_MINUTES * MIN : cal.endOfSchoolDay(created);
      const late = responded > deadline;
      const st = students[ri(0, students.length - 1)];
      const route = i % 3 === 2 ? 'counsellor' : 'adult';
      const by = sos || late || route === 'counsellor' ? 'u-C01' : this.s.trusted[st] || 'u-C01';
      const c = this._newCase({ student_id: st, kind, route: sos ? null : route, status: 'resolved', level: late ? 2 : 1, recipients: [by], ever_recipients: [by], deadline,
        level_started_at: created, created_at: created, acknowledged_at: sos ? responded : null, first_response_at: responded, last_activity_at: responded + HOUR, going_by: sos ? by : null, location_gateway: sos ? 'gw-stairs' : null });
      await this.addEvent(c, 'created', created, st, { kind, seeded: true });
      if (late) await this.addEvent(c, 'deadline_missed', deadline, null, { level: 1 });
      await this.addEvent(c, sos ? 'going' : 'called', responded, by, { first: true });
      await this.addEvent(c, sos ? 'reached' : 'talked', responded + HOUR, by, { note: 'Seeded history' });
    }
  }

  _newCase(f) {
    const c = { id: `c-${this.s.seq.ref}`, ref: `PP-${this.s.seq.ref++}`, school_id: SCHOOL.id, student_id: null, kind: 'talk', route: 'adult', status: 'open', level: 1,
      recipients: [], ever_recipients: [], deadline: null, level_started_at: null, created_at: this.now(), acknowledged_at: null, first_response_at: null, last_activity_at: this.now(),
      going_by: null, location_gateway: null, location_at: null, trail: [], version: 1, ...f };
    this.s.cases.push(c); return c;
  }

  // -------------------------------------------------------------- lookups
  user(id) { return this.s.users.find((u) => u.id === id) || null; }
  label(u) { if (!u) return 'Someone'; const p = u.name.split(' '); return ['Ms', 'Mr', 'Mrs', 'Dr', 'Nurse'].includes(p[0]) ? `${p[0]} ${p[p.length - 1]}` : u.name; }
  withRoles(roles) { return this.s.users.filter((u) => roles.includes(u.role)).sort((a, b) => a.erp_ref.localeCompare(b.erp_ref)).map((u) => u.id); }
  person(u) { return u ? { id: u.id, name: u.name, label: this.label(u), role: u.role, title: u.title, class: u.class_name } : null; }
  who(sid) { const st = this.user(sid); return st ? `${st.name} (${st.class_name})` : 'A student'; }
  bandOf(sid) { return Object.values(this.s.bands).find((b) => b.student_id === sid) || null; }
  classTeacher(sid) { const st = this.user(sid); return st && CLASS_TEACHER[st.class_name] || null; }

  // -------------------------------------------------------------- audit chain
  async _hash(prev, e) {
    const payload = enc.encode(JSON.stringify([e.case_id, iso(e.at), e.kind, e.detail, e.actor_id]));
    return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...prev, ...payload])));
  }
  async addEvent(c, kind, at, actor, detail = {}) {
    const last = [...this.s.events].reverse().find((e) => e.case_id === c.id);
    const prev = last ? last.hash : new Uint8Array(32);
    const e = { id: this.s.seq.id++, case_id: c.id, at, actor_id: actor || null, kind, detail: JSON.parse(JSON.stringify(detail)), prev_hash: prev };
    e.hash = await this._hash(prev, e);
    this.s.events.push(e);
  }
  async verifyChain(caseId) {
    let prev = new Uint8Array(32);
    for (const e of this.s.events.filter((x) => x.case_id === caseId)) {
      if (C.hex(e.prev_hash) !== C.hex(prev)) return false;
      if (C.hex(e.hash) !== C.hex(await this._hash(prev, e))) return false;
      prev = e.hash;
    }
    return true;
  }

  // -------------------------------------------------------------- notifications (outbox)
  _text(kind, vars) { const [title, body] = NT[kind](vars); return { title, body }; }
  enqueue(channel, to, kind, vars, caseId, at) { this.s.outbox.push({ id: this.s.seq.id++, channel, to_user: to, kind, vars, ...this._text(kind, vars), case_id: caseId, created_at: at, sent_at: null }); }
  runOutbox() {
    let n = 0;
    for (const r of this.s.outbox.filter((x) => !x.sent_at && x.created_at <= this.now())) {
      if (r.channel === 'sms' || r.channel === 'call_task') console.info(`[mock ${r.channel}] to ${this.label(this.user(r.to_user))}: ${r.title}`);
      this.s.notifications.push({ id: this.s.seq.id++, user_id: r.to_user, channel: r.channel, kind: r.kind, vars: r.vars, title: r.title, body: r.body, case_id: r.case_id, created_at: this.now(), read_at: null });
      r.sent_at = this.now(); n++;
    }
    if (n) this.emit({ type: 'notification' });
    return n;
  }

  // -------------------------------------------------------------- short messages on the band (max 60 characters)
  bandMessage(sid, caseId, from, kind, vars, at) {
    const band = this.bandOf(sid); if (!band) return null;
    const when = WHEN.find((w) => w[0] === vars.when)?.[1][0]; const where = WHERE.find((w) => w[0] === vars.where)?.[1][0];
    const whenPhrase = { now: 'now', break: 'at the next break', lunch: 'at lunch', after: 'after school' }[vars.when] || when;
    const text = { call: `${vars.who} will see you ${vars.tomorrow ? 'tomorrow ' : ''}${whenPhrase}, ${where}`, coming: `${vars.who} is coming`, moved: `${vars.who} will contact you` }[kind] || '';
    const m = { id: this.s.seq.msg++, band_id: band.id, case_id: caseId, from_user: from, kind, vars, text: text.slice(0, 60), created_at: at, delivered_at: null, seen_at: null };
    this.s.bandMessages.push(m); this.emit({ type: 'band_message', band_id: band.id });
    return m;
  }

  // -------------------------------------------------------------- routing ladder for talk requests
  ladder(route) {
    if (route === 'adult') return [['chosen', ['eod']], ['counsellor', ['next_at', '12:00']], ['principal', ['next_at', SCHOOL.staff_end]], ['management', null]];
    if (route === 'counsellor') return [['counsellor', ['eod']], ['principal', ['next_at', SCHOOL.staff_end]], ['management', null]];
    if (route === 'staff') return [['principal+pocso', ['same_day_staff']], ['management', null]];
    throw new Error(route);
  }
  rungRecipients(c, who) {
    if (who === 'chosen') return c.student_id && this.s.trusted[c.student_id] ? [this.s.trusted[c.student_id]] : [];
    if (who === 'counsellor') return this.withRoles(['counsellor']);
    if (who === 'principal') return this.withRoles(['principal']);
    if (who === 'principal+pocso') return this.withRoles(['principal', 'pocso']).filter((i) => i !== c.about_staff_id);
    if (who === 'management') return this.withRoles(['management']);
    return [];
  }
  deadline(rule, at) {
    if (!rule) return null;
    if (rule[0] === 'eod') return cal.endOfSchoolDay(at);
    if (rule[0] === 'next_at') return cal.nextSchoolDayAt(at, rule[1]);
    if (rule[0] === 'same_day_staff') return cal.sameSchoolDayStaff(at);
    return null;
  }
  async applyLevel(c, level, at, reason) {
    const ladder = this.ladder(c.route); let who, rule, recipients = [];
    while (level <= ladder.length) { [who, rule] = ladder[level - 1]; recipients = this.rungRecipients(c, who); if (recipients.length) break; level++; }
    if (level > ladder.length) { level = ladder.length; who = 'management'; rule = null; recipients = []; }
    const dl = this.deadline(rule, at);
    Object.assign(c, { level, rung: who, recipients, ever_recipients: [...new Set([...c.ever_recipients, ...recipients])], deadline: dl, level_started_at: at, last_activity_at: at, version: c.version + 1 });
    this.stopTimers(c);
    if (dl) {
      for (const pct of [50, 80]) this.s.timers.push({ id: this.s.seq.id++, case_id: c.id, kind: 'remind', level, due_at: at + (dl - at) * pct / 100, detail: { pct }, done: false });
      this.s.timers.push({ id: this.s.seq.id++, case_id: c.id, kind: 'escalate', level, due_at: dl, detail: {}, done: false });
    }
    await this.addEvent(c, 'routed', at, null, { level, rung: who, recipients, deadline: iso(dl), reason });
  }
  announce(c, at, previous = null, by = null) {
    const st = this.user(c.student_id); const vars = { who: this.who(c.student_id), first: st?.name.split(' ')[0] || 'A student', due: fmtTime(c.deadline, at) };
    const kind = by ? 'talk_handover' : previous ? 'talk_moved_you' : 'talk_new';
    for (const r of c.recipients) this.enqueue('push', r, kind, { ...vars, by: by ? this.label(this.user(by)) : undefined }, c.id, at);
    if (c.rung === 'management' || (!c.recipients.length && c.level >= this.ladder(c.route).length)) {
      for (const r of [...this.withRoles(['management']), ...this.withRoles(['principal'])]) this.enqueue('push', r, 'unanswered', vars, c.id, at);
      this.s.alerts.push({ id: this.s.seq.id++, rule: 'unanswered', rule_version: 1, student_id: c.student_id, at, detail: { case: c.ref } });
    }
    if (previous) {
      const to = c.recipients.map((r) => this.label(this.user(r))).join(' and ') || 'management';
      for (const prev of previous) if (!c.recipients.includes(prev)) this.enqueue('push', prev, 'talk_moved_on', { ...vars, to }, c.id, at);
      if (c.recipients[0]) this.bandMessage(c.student_id, c.id, null, 'moved', { who: this.label(this.user(c.recipients[0])) }, at);
    }
  }

  // -------------------------------------------------------------- talk requests
  async createTalk(sid, toWhom, at) {
    const c = this._newCase({ student_id: sid, kind: 'talk', route: toWhom === 'counsellor' ? 'counsellor' : 'adult', created_at: at, last_activity_at: at });
    await this.addEvent(c, 'created', at, sid, { kind: 'talk', to: c.route, source: 'band' });
    await this.applyLevel(c, 1, at, 'new'); this.announce(c, at);
    this.emit({ type: 'case', case_id: c.id }); return c;
  }
  async escalate(c, at) {
    const previous = [...c.recipients];
    await this.addEvent(c, 'deadline_missed', at, null, { level: c.level });
    await this.applyLevel(c, c.level + 1, at, 'deadline missed');
    this.announce(c, at, previous);
  }
  async call(c, staff, when, where, at) {
    if (c.kind !== 'talk') throw new HttpError(400, 'only talk requests');
    if (!WHEN.some((w) => w[0] === when) || !WHERE.some((w) => w[0] === where)) throw new HttpError(422, 'choose when and where');
    const tomorrow = at >= keyToTs(dateKey(at), SCHOOL.day_end) || !cal.isSchoolDay(dateKey(at));
    const m = this.bandMessage(c.student_id, c.id, staff.id, 'call', { who: this.label(staff), when, where, tomorrow }, at);
    Object.assign(c, { status: 'responded', first_response_at: c.first_response_at ?? at, last_activity_at: at, call: { by: staff.id, when, where, tomorrow, message_id: m?.id } });
    this.stopTimers(c);
    await this.addEvent(c, 'called', at, staff.id, { when, where, tomorrow });
    this.emit({ type: 'case', case_id: c.id });
  }
  async talked(c, staff, note, at) { c.status = 'resolved'; c.last_activity_at = at; this.stopTimers(c); await this.addEvent(c, 'talked', at, staff.id, { note: note || '' }); this.emit({ type: 'case', case_id: c.id }); }
  async handover(c, staff, to, at) {
    const previous = [...c.recipients];
    c.route = to === 'staff' ? 'staff' : 'counsellor'; c.status = 'open';
    await this.addEvent(c, 'handover', at, staff.id, { to: c.route });
    await this.applyLevel(c, 1, at, 'handover');
    this.announce(c, at, null, staff.id);
    for (const p of previous) if (!c.recipients.includes(p) && p !== staff.id) this.enqueue('push', p, 'talk_moved_on', { who: this.who(c.student_id), to: c.recipients.map((r) => this.label(this.user(r))).join(' and ') }, c.id, at);
    this.emit({ type: 'case', case_id: c.id });
  }

  // -------------------------------------------------------------- SOS with live location
  locate(bandId, now = this.now()) {
    const seen = this.s.sightings.filter((x) => x.band_id === bandId);
    const recent = seen.filter((x) => x.at >= now - SIGHT_WINDOW);
    const pool = recent.length ? recent : seen.slice(-6);
    if (!pool.length) return null;
    const best = pool.reduce((a, b) => (b.rssi > a.rssi || (b.rssi === a.rssi && b.at > a.at) ? b : a));
    const lastAt = Math.max(...pool.filter((x) => x.gw === best.gw).map((x) => x.at));
    return { gw: best.gw, rssi: best.rssi, at: lastAt, live: recent.length > 0 };
  }
  sosRecipients(sid, medical) {
    let r = [...this.withRoles(['counsellor']), ...this.withRoles(['principal'])];
    const ct = this.classTeacher(sid); if (ct) r.push(ct);
    if (medical || this.s.health[sid]?.nurse_on_sos) r.push(...this.withRoles(['nurse']));
    if (this.s.settings.pocso_on_sos) r.push(...this.withRoles(['pocso']));
    return [...new Set(r)];
  }
  async createSos(sid, medical, at) {
    const open = this.s.cases.find((c) => c.student_id === sid && ['sos', 'medical_sos'].includes(c.kind) && ['open', 'acknowledged'].includes(c.status));
    if (open) return open; // a second press while help is on the way doesn't make a second alert
    const band = this.bandOf(sid); const loc = band ? this.locate(band.id, at) : null;
    const recipients = this.sosRecipients(sid, medical);
    const c = this._newCase({ student_id: sid, kind: medical ? 'medical_sos' : 'sos', route: null, recipients, ever_recipients: [...recipients], deadline: at + SOS_ACK_MINUTES * MIN,
      level_started_at: at, created_at: at, last_activity_at: at, location_gateway: loc?.gw || null, location_at: loc?.at || null, trail: loc ? [{ gw: loc.gw, at }] : [] });
    await this.addEvent(c, 'created', at, sid, { kind: c.kind, source: 'band', location: loc?.gw || null });
    this.s.timers.push({ id: this.s.seq.id++, case_id: c.id, kind: 'sos_repeat', level: 1, due_at: c.deadline, detail: {}, done: false });
    const vars = { who: this.who(sid), gw: loc?.gw || null, medical };
    for (const r of recipients) this.enqueue('push', r, 'sos', vars, c.id, at);
    this.enqueue('panel', null, 'sos', vars, c.id, at);
    if (medical || this.s.health[sid]?.nurse_on_sos) await this.addEvent(c, 'nurse_added', at, null, { reason: medical ? 'child chose Unwell' : 'health profile' });
    this.runOutbox();
    this.emit({ type: 'case', case_id: c.id }); return c;
  }
  async sosRepeat(c, at) {
    const k = `${c.student_id}:${dateKey(at)}`; const sent = this.s.smsToday[k] || 0;
    const vars = { who: this.who(c.student_id), gw: c.location_gateway };
    if (sent < SOS_SMS_CAP) {
      for (const r of c.recipients) { this.enqueue('sms', r, 'sos_sms', vars, c.id, at); this.enqueue('call_task', r, 'sos_call', vars, c.id, at); }
      this.s.smsToday[k] = sent + 1;
    }
    await this.addEvent(c, 'sos_unanswered', at, null, { sms_sent: sent < SOS_SMS_CAP });
    this.s.timers.push({ id: this.s.seq.id++, case_id: c.id, kind: 'sos_repeat', level: 1, due_at: at + SOS_ACK_MINUTES * MIN, detail: {}, done: false });
  }
  async going(c, staff, at) {
    if (!['sos', 'medical_sos'].includes(c.kind)) throw new HttpError(400, 'only SOS');
    const first = !c.going_by;
    if (c.status === 'open') c.status = 'acknowledged';
    c.acknowledged_at = c.acknowledged_at ?? at; c.going_by = c.going_by || staff.id; c.last_activity_at = at;
    this.stopTimers(c);
    await this.addEvent(c, 'going', at, staff.id, { first });
    if (first) {
      this.bandMessage(c.student_id, c.id, staff.id, 'coming', { who: this.label(staff) }, at);
      for (const r of c.recipients) if (r !== staff.id) this.enqueue('push', r, 'sos_going', { who: this.who(c.student_id), by: this.label(staff) }, c.id, at);
    }
    this.emit({ type: 'case', case_id: c.id });
  }
  async reached(c, staff, note, at) {
    c.status = 'resolved'; c.last_activity_at = at; c.reached_at = at; this.stopTimers(c);
    await this.addEvent(c, 'reached', at, staff.id, { note: note || '' });
    for (const r of c.recipients) if (r !== staff.id) this.enqueue('push', r, 'sos_reached', { who: this.who(c.student_id), by: this.label(staff) }, c.id, at);
    this.emit({ type: 'case', case_id: c.id });
  }
  async cancelSos(sid, at) {
    const c = [...this.s.cases].reverse().find((x) => x.student_id === sid && ['sos', 'medical_sos'].includes(x.kind) && x.status === 'open' && x.created_at > at - 60000);
    if (!c) return null;
    c.status = 'cancelled'; c.last_activity_at = at; this.stopTimers(c);
    await this.addEvent(c, 'cancelled_by_child', at, sid);
    for (const r of c.recipients) this.enqueue('push', r, 'sos_cancel', { who: this.who(sid) }, c.id, at);
    this.emit({ type: 'case', case_id: c.id }); return c;
  }
  stopTimers(c) { this.s.timers.filter((t) => t.case_id === c.id && !t.done).forEach((t) => { t.done = true; }); }
  async remind(c, pct, at) {
    for (const r of c.recipients) this.enqueue('push', r, 'remind', { who: this.who(c.student_id), pct, due: fmtTime(c.deadline, at) }, c.id, at);
    await this.addEvent(c, 'reminder', at, null, { pct });
  }
  async runTimers() {
    let n = 0;
    for (;;) {
      const due = this.s.timers.filter((t) => !t.done && t.due_at <= this.now()).sort((a, b) => a.due_at - b.due_at);
      if (!due.length) break;
      for (const t of due) {
        t.done = true; n++;
        const c = this.s.cases.find((x) => x.id === t.case_id);
        if (!c || ['resolved', 'cancelled', 'responded'].includes(c.status) || t.level !== c.level) continue;
        if (t.kind === 'escalate') await this.escalate(c, t.due_at);
        else if (t.kind === 'remind') await this.remind(c, t.detail.pct || 50, t.due_at);
        else if (t.kind === 'sos_repeat' && c.acknowledged_at == null) await this.sosRepeat(c, t.due_at);
      }
    }
    if (n) this.emit({ type: 'case' });
    return n;
  }
  // Band silent: after the school day, any band with no contact all day tells the class teacher.
  checkSilent(now) {
    const k = dateKey(now);
    if (!cal.isSchoolDay(k) || hm(now) < SCHOOL.day_end || this.s.silentChecked[k]) return;
    this.s.silentChecked[k] = true;
    const start = keyToTs(k, '00:00');
    for (const b of Object.values(this.s.bands)) {
      if (b.last_seen && b.last_seen >= start) continue;
      const to = this.classTeacher(b.student_id) || this.withRoles(['counsellor'])[0];
      if (this.recentAlert('band_silent', b.student_id, now, DAY - HOUR)) continue;
      this.s.alerts.push({ id: this.s.seq.id++, rule: 'band_silent', rule_version: 1, student_id: b.student_id, to_user: to, at: now, detail: { band: b.id } });
      this.enqueue('push', to, 'silent', { who: this.who(b.student_id), band: b.id }, null, now);
    }
  }
  async tick() {
    const now = this.now();
    for (const [id, on] of Object.entries(this.gwPower)) if (on && this.serverReachable) this.s.gateways[id].last_heartbeat = now;
    await this.runTimers(); this.checkSilent(now); this.runOutbox();
  }

  // -------------------------------------------------------------- feelings and rules
  recentAlert(rule, sid, at, within = COOLDOWN, match = () => true) { return this.s.alerts.some((a) => a.rule === rule && a.student_id === sid && a.at > at - within && match(a)); }
  async recordFeeling(st, meta, at) {
    const { code } = meta;
    const ctx = ctxAt(st.class_name, at, { rise: ['self', 'r20', 'r30', 'r45'][meta.rise] || 'self', move: meta.asked ? 'still' : 'light' });
    const f = { id: this.s.seq.id++, student_id: st.id, code, suggested: null, accepted: meta.accepted, ctx, source: meta.asked ? 'band-ask' : 'band-self', at, model_updated: false };
    this.s.feelings.push(f);
    if (st.class_id && code !== 9) this.s.mood.push({ class_id: st.class_id, code, at }); // anonymous, for class weather
    if (DIFFICULT.has(code)) this.rulePersistent(st, code, at);
    return f;
  }
  // The band follows each feeling with a "suggestion result": what it suggested, and movement.
  learnFrom(st, suggestedCode, accepted, move, at) {
    const f = [...this.s.feelings].reverse().find((x) => x.student_id === st.id && !x.skipped && !x.model_updated && x.at >= at - 2 * MIN);
    if (!f) return;
    f.suggested = suggestedCode || null; f.accepted = accepted; f.ctx.move = ['still', 'light', 'active'][move] || f.ctx.move; f.model_updated = true;
    const band = this.bandOf(st.id); if (band) M.update(band.model, f.ctx, f.code);
    M.update(this.school, f.ctx, f.code);
  }
  rulePersistent(st, code, at) {
    const days = cal.daysBack(at, 10); const start = keyToTs(days[0]);
    const hit = new Set(this.s.feelings.filter((r) => r.student_id === st.id && r.code === code && r.at >= start).map((r) => dateKey(r.at)).filter((d) => days.includes(d)));
    if (hit.size < 5 || this.recentAlert('persistent', st.id, at, COOLDOWN, (a) => a.detail?.code === code)) return;
    const to = this.withRoles(['counsellor'])[0];
    this.s.alerts.push({ id: this.s.seq.id++, rule: 'persistent', rule_version: RULES.persistent.version, student_id: st.id, to_user: to, at, detail: { code, days: hit.size } });
    this.enqueue('push', to, 'pattern', { who: this.who(st.id), code, n: hit.size, sid: st.id }, null, at);
  }
  recordSkip(st, at) {
    this.s.feelings.push({ id: this.s.seq.id++, student_id: st.id, code: 0, skipped: true, at });
    const mine = this.s.feelings.filter((r) => r.student_id === st.id && (r.skipped || r.source === 'band-ask')).sort((a, b) => b.at - a.at || b.id - a.id).slice(0, 3);
    if (mine.length === 3 && mine.every((r) => r.skipped) && !this.recentAlert('goes_quiet', st.id, at)) {
      const to = this.s.trusted[st.id] || this.withRoles(['counsellor'])[0];
      this.s.alerts.push({ id: this.s.seq.id++, rule: 'goes_quiet', rule_version: RULES.goes_quiet.version, student_id: st.id, to_user: to, at });
      this.enqueue('push', to, 'quiet', { who: this.who(st.id) }, null, at);
    }
  }

  // -------------------------------------------------------------- class weather (no names, k >= 10)
  classMood(classId, now) {
    const days = cal.daysBack(now, 10); const start = keyToTs(days[0]);
    const cellsFor = (cid) => days.map((d) => { const rows = this.s.mood.filter((m) => m.class_id === cid && dateKey(m.at) === d && m.at >= start);
      const n = rows.length; const hard = rows.filter((m) => DIFFICULT.has(m.code)).length; return { date: d, n, share: n >= MIN_CELL ? hard / n : null, hidden: n < MIN_CELL }; });
    const all = Object.fromEntries(this.s.classes.map((c) => [c.id, cellsFor(c.id)]));
    const med = days.map((_, i) => median(Object.values(all).map((cells) => cells[i].share).filter((x) => x != null)));
    const rows = this.s.classes.map((cl) => {
      const cells = all[cl.id]; let streak = 0;
      cells.forEach((c, i) => { c.hot = c.share != null && med[i] != null && c.share >= Math.max(2 * med[i], 0.15); streak = c.hot ? streak + 1 : 0; });
      const flag = streak >= 3; // the last 3 school days in a row
      const vis = cells.filter((c) => !c.hidden).slice(-3);
      const avg = vis.length ? vis.reduce((s, c) => s + c.share, 0) / vis.length : null;
      const weather = flag ? 'storm' : avg == null ? 'none' : avg >= 0.3 ? 'rain' : avg >= 0.15 ? 'mixed' : 'sun';
      const week = this.s.mood.filter((m) => m.class_id === cl.id && m.at >= keyToTs(days[Math.max(0, days.length - 5)]));
      const counts = {}; week.forEach((m) => { if (DIFFICULT.has(m.code)) counts[m.code] = (counts[m.code] || 0) + 1; });
      const top = week.length >= MIN_CELL ? Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => Number(c)) : [];
      const actTitle = flag ? (ACTIVITY_FOR[BY_CODE[top[0]]?.key] || 'Two kind things') : null;
      const activity = actTitle ? ACTIVITY_LIST.find((a) => a.title === actTitle) : null;
      return { class_id: cl.id, class: cl.name, cells: cells.map(({ date, share, hidden, hot }) => ({ date, share, hidden, hot })), flag, weather, top, activity,
        activity_done: activity ? this.s.activities[`${cl.id}:${activity.code}:${dateKey(now)}`] || null : null };
    });
    const row = classId ? rows.find((r) => r.class_id === classId) : null;
    return { days, rows, row, min_cell: MIN_CELL, rule: RULES.class_tension, week_feeling: WEEK_FEELING.code };
  }

  // -------------------------------------------------------------- gateway ingest (+ RSSI sightings)
  serial(fn) { const run = (this._ingestQ || Promise.resolve()).then(fn, fn); this._ingestQ = run.catch(() => {}); return run; }
  async ingest(gwId, packet, rssi = null) {
    if (packet.length !== 19) return { status: 'rejected', reason: `expected 19 bytes, got ${packet.length}` };
    if (packet[0] !== C.VERSION) return { status: 'rejected', reason: 'unknown version' };
    const h = C.parseHeader(packet); const now = this.now(); const serverEpoch = Math.floor(now / 1000 / C.EPOCH_SECONDS);
    let match = null;
    outer: for (const ep of [serverEpoch, serverEpoch - 1, serverEpoch + 1]) {
      for (const b of Object.values(this.s.bands)) {
        if (b.revoked || C.hex(await C.rotatingId(b.key, ep)) !== C.hex(h.rid)) continue;
        const opened = await C.openPacket(b.key, packet, ep);
        if (opened) { match = { band: b, ep, opened }; break outer; }
      }
    }
    if (!match) return { status: 'rejected', reason: 'unknown band or failed authentication' };
    const { band, ep, opened: [type, arg] } = match;
    if (rssi != null) this.sighting(band, gwId, rssi, now);
    const k = `${band.id}:${h.counter}`; const seen = this.s.bandEvents[k];
    if (seen) { if (!seen.gateways.includes(gwId)) seen.gateways.push(gwId); return { status: 'duplicate', receipt: C.hex(seen.receipt), type: C.TYPE_NAMES[type], band_id: band.id, counter: h.counter }; }
    if (h.counter <= band.last_counter - REPLAY_WINDOW) return { status: 'rejected', reason: 'replayed or too old' };
    await this.applyBand(band, type, arg, now);
    const waiting = this.s.bandMessages.some((m) => m.band_id === band.id && !m.delivered_at);
    const receipt = await C.buildReceipt(band.key, h.rid, h.counter, waiting ? 2 : 0, serverEpoch);
    this.s.bandEvents[k] = { band_id: band.id, counter: h.counter, type, arg, received_at: now, gateways: [gwId], receipt };
    band.last_counter = Math.max(band.last_counter, h.counter); band.last_seen = now;
    this.runOutbox();
    this.emit({ type: 'band', band_id: band.id });
    return { status: 'ok', receipt: C.hex(receipt), type: C.TYPE_NAMES[type], arg, band_id: band.id, counter: h.counter, epoch_used: ep };
  }
  sighting(band, gw, rssi, now) {
    this.s.sightings.push({ band_id: band.id, gw, rssi, at: now });
    if (this.s.sightings.length > 4000) this.s.sightings.splice(0, 1000);
    const c = this.s.cases.find((x) => x.student_id === band.student_id && ['sos', 'medical_sos'].includes(x.kind) && ['open', 'acknowledged'].includes(x.status));
    if (!c) return;
    const loc = this.locate(band.id, now);
    if (loc && loc.gw !== c.location_gateway) { c.location_gateway = loc.gw; c.trail.push({ gw: loc.gw, at: now }); this.emit({ type: 'sos_location', case_id: c.id }); }
    if (loc) c.location_at = loc.at;
  }
  async applyBand(band, type, arg, now) {
    if (type === C.T.BATTERY) { band.battery = arg; return; }
    const st = this.user(band.student_id); if (!st) return;
    if (type === C.T.FEELING) await this.recordFeeling(st, C.unpackFeeling(arg), now);
    else if (type === C.T.SUGGESTION) this.learnFrom(st, (arg >> 3) & 15, !!(arg & 1), (arg >> 1) & 3, now);
    else if (type === C.T.SKIPPED) this.recordSkip(st, now);
    else if (type === C.T.TALK) await this.createTalk(st.id, arg === 1 ? 'counsellor' : 'adult', now);
    else if (type === C.T.SOS) await this.createSos(st.id, arg === 1, now);
    else if (type === C.T.CANCEL) await this.cancelSos(st.id, now);
    else if (type === C.T.PAUSE) { band.pt_until = arg ? now + arg * MIN : 0; this.emit({ type: 'band', band_id: band.id }); }
    else if (type === C.T.SEEN) {
      const m = [...this.s.bandMessages].reverse().find((x) => x.band_id === band.id && (x.id & 255) === arg && !x.seen_at);
      if (m) { m.seen_at = now; const c = this.s.cases.find((x) => x.id === m.case_id); if (c) await this.addEvent(c, 'child_saw_message', now, st.id); this.emit({ type: 'case', case_id: m.case_id }); }
    } else if (type === C.T.EXERCISE) this.s.exercises.push({ id: this.s.seq.id++, student_id: st.id, result: arg === 2 ? 'talk' : arg === 1 ? 'better' : 'none', at: now });
  }

  // -------------------------------------------------------------- HTTP-shaped API
  canOpen(u, c) {
    if (u.role === 'principal') return true;
    if (c.ever_recipients.includes(u.id)) return true;
    if (u.role === 'counsellor' && c.route !== 'staff') return true;
    return false;
  }
  summary(c, viewer) {
    const st = this.user(c.student_id);
    const msg = c.call?.message_id ? this.s.bandMessages.find((m) => m.id === c.call.message_id) : this.s.bandMessages.filter((m) => m.case_id === c.id).slice(-1)[0];
    const loc = c.location_gateway ? { gw: c.location_gateway, at: iso(c.location_at), x: GW[c.location_gateway]?.x, y: GW[c.location_gateway]?.y } : null;
    return { id: c.id, ref: c.ref, kind: c.kind, route: c.route, status: c.status, level: c.level, rung: c.rung || null, student: this.person(st),
      recipients: c.recipients.map((r) => this.person(this.user(r))), mine: c.recipients.includes(viewer.id), deadline: iso(c.deadline), created_at: iso(c.created_at),
      first_response_at: iso(c.first_response_at), acknowledged_at: iso(c.acknowledged_at), going_by: this.person(this.user(c.going_by)), call: c.call || null,
      message: msg ? { kind: msg.kind, vars: msg.vars, text: msg.text, delivered: !!msg.delivered_at, seen: !!msg.seen_at } : null,
      location: loc, trail: (c.trail || []).map((t) => ({ gw: t.gw, at: iso(t.at) })), health_note: st && this.s.health[st.id]?.nurse_on_sos ? 'nurse' : null };
  }
  need(u, ...roles) { if (!roles.includes(u.role)) throw new HttpError(403, 'not allowed for your role'); }
  loadCase(id, u) { const c = this.s.cases.find((x) => x.id === id); if (!c || !this.canOpen(u, c)) throw new HttpError(404, 'case not found'); return c; }
  me(token) { const uid = token && token.startsWith('demo.') ? token.slice(5) : null; const u = uid && this.user(uid); if (!u) throw new HttpError(401, 'sign in first'); return u; }
  hasAccess(u, key, now) { return this.s.access.some((a) => a.key === key && a.user_id === u.id && a.at > now - 12 * HOUR); }

  async handle(method, path, body = {}, token = null, headers = {}) {
    const [p, qs] = path.split('?'); const q = new URLSearchParams(qs || '');
    const now = this.now(); const r = (re) => p.match(re);
    let m;
    if (p === '/api/config') return { demo_mode: true, version: '2.0.0', engine: 'in-browser' };
    if (p === '/api/auth/demo-users') return this.s.users.filter((u) => u.role !== 'student').sort((a, b) => a.role.localeCompare(b.role) || a.erp_ref.localeCompare(b.erp_ref)).map((u) => this.person(u));
    if (p === '/api/auth/login') { const u = this.user(body.user_id); if (!u) throw new HttpError(404, 'no such user'); return { token: `demo.${u.id}`, user: this.person(u) }; }
    if (p === '/api/gw/time') return { server_time: iso(now), unix: now / 1000, epoch: Math.floor(now / 1000 / C.EPOCH_SECONDS) };
    if (p === '/api/insights/rules') return RULES;
    if (p === '/api/demo/clock' && method === 'GET') return { now: iso(now), offset_seconds: this.offset / 1000 };
    if (p === '/api/demo/clock') {
      let add = 0;
      if (body.advance_minutes) add += body.advance_minutes * MIN;
      if (body.set_local) { const t = keyToTs(dateKey(now), body.set_local); if (t < now) throw new HttpError(400, 'the demo clock only moves forward'); add += t - now; }
      this.offset += add; await this.runTimers(); this.checkSilent(this.now()); this.runOutbox(); this.emit({ type: 'clock' }); return { now: iso(this.now()) };
    }
    if (p === '/api/demo/reset') { await this.seed(); return { school_id: SCHOOL.id }; }
    if (p === '/api/demo/bands') return Object.values(this.s.bands).map((b) => { const st = this.user(b.student_id); const a = this.user(this.s.trusted[st.id]);
      return { band_id: b.id, key: C.hex(b.key), student: st.name, student_id: st.id, class: st.class_name, counter: b.last_counter, battery: b.battery, junior: st.age_pack === 'junior',
        pause_sensing: this.s.health[st.id].pause_sensing || this.s.consents[st.id]?.sensing === false, pt_until: iso(b.pt_until || null), adult: a ? this.person(a) : null,
        timetable: timetableFor(st.class_name), model: b.model, school: this.school }; });
    // The band's mailbox. On real hardware the band fetches it through a gateway after a receipt with status 2.
    if (p === '/api/demo/band-inbox') {
      const b = this.s.bands[Number(q.get('band'))]; if (!b) throw new HttpError(404, 'no band');
      const out = this.s.bandMessages.filter((x) => x.band_id === b.id && !x.delivered_at);
      out.forEach((x) => { x.delivered_at = now; });
      const sos = this.s.cases.find((c) => c.student_id === b.student_id && ['sos', 'medical_sos'].includes(c.kind) && ['open', 'acknowledged'].includes(c.status));
      return { messages: out.map((x) => ({ id: x.id, kind: x.kind, vars: x.vars, text: x.text })), sos_active: !!sos, pt_until: iso(b.pt_until || null),
        sensing: !(this.s.health[b.student_id].pause_sensing || this.s.consents[b.student_id]?.sensing === false), model: b.model, school: this.school };
    }
    if (p === '/api/gw/ingest' || p === '/api/gw/heartbeat') {
      const gw = this.s.gateways[headers['X-Gateway-Id']];
      if (!gw || (headers.Authorization || '') !== `Bearer demo-token-${gw.id}`) throw new HttpError(401, 'unknown gateway');
      gw.last_heartbeat = now;
      if (p === '/api/gw/heartbeat') return { ok: true, server_time: iso(now), epoch: Math.floor(now / 1000 / C.EPOCH_SECONDS) };
      const results = [];
      // One packet at a time, like the database's UNIQUE(band_id, counter).
      for (const item of body.packets || []) {
        const hx = typeof item === 'string' ? item : item.hex; const rssi = typeof item === 'string' ? null : item.rssi ?? null;
        results.push(/^[0-9a-f]*$/i.test(hx) ? await this.serial(() => this.ingest(gw.id, C.unhex(hx), rssi)) : { status: 'rejected', reason: 'not hex' });
      }
      return { results };
    }
    if (p === '/api/model/suggest') {
      const b = this.s.bands[Number(q.get('band'))]; if (!b) throw new HttpError(404, 'no band'); const st = this.user(b.student_id);
      return M.suggest(b.model, this.school, ctxAt(st.class_name, now, { rise: q.get('rise') || 'r30', move: q.get('move') || 'still' }));
    }
    if (p === '/api/model/card') { const { school, ...rest } = card(); return rest; }

    const u = this.me(token);
    if (p === '/api/me') {
      const out = { user: this.person(u) };
      if (u.teaches) out.class = { id: `cl-${u.teaches}`, name: u.teaches };
      out.chosen_by = Object.entries(this.s.trusted).filter(([, a]) => a === u.id).map(([sid]) => this.person(this.user(sid)));
      if (u.role === 'parent') out.child = this.person(this.user(u.child_id));
      return out;
    }
    if (p === '/api/queue') {
      this.need(u, ...STAFF); const all = q.get('include_closed') === 'true';
      const vis = this.s.cases.filter((c) => (all || !['resolved', 'cancelled'].includes(c.status)) && this.canOpen(u, c) && (['principal', 'counsellor'].includes(u.role) || c.ever_recipients.includes(u.id)));
      const rank = (c) => [['sos', 'medical_sos'].includes(c.kind) && ['open', 'acknowledged'].includes(c.status) ? 0 : c.status === 'open' ? 1 : 2, c.deadline ?? Infinity];
      vis.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1]; });
      return vis.map((c) => this.summary(c, u));
    }
    if ((m = r(/^\/api\/cases\/([^/]+)\/open$/))) {
      this.need(u, ...STAFF); const c = this.loadCase(m[1], u);
      if (!body.reason || body.reason.trim().length < 3) throw new HttpError(422, 'give a short reason');
      this.s.access.push({ user_id: u.id, key: c.id, case_id: c.id, student_id: c.student_id, reason: body.reason, at: now });
      await this.addEvent(c, 'opened', now, u.id, { reason: body.reason }); this.emit({ type: 'case', case_id: c.id }); return { ok: true };
    }
    if ((m = r(/^\/api\/cases\/([^/]+)$/))) {
      const c = this.loadCase(m[1], u);
      if (!['sos', 'medical_sos'].includes(c.kind) && !this.hasAccess(u, c.id, now)) throw new HttpError(428, 'give a reason before opening this request');
      const out = this.summary(c, u);
      out.opened_by = this.s.access.filter((a) => a.case_id === c.id).map((a) => ({ who: this.person(this.user(a.user_id)), reason: a.reason, at: iso(a.at) }));
      out.timeline = this.s.events.filter((e) => e.case_id === c.id).map((e) => ({ at: iso(e.at), kind: e.kind, detail: e.detail, actor: e.actor_id ? this.label(this.user(e.actor_id)) : null }));
      out.chain_ok = await this.verifyChain(c.id);
      return out;
    }
    if ((m = r(/^\/api\/cases\/([^/]+)\/call$/))) { this.need(u, ...STAFF); const c = this.loadCase(m[1], u); await this.call(c, u, body.when, body.where, now); this.runOutbox(); return this.summary(c, u); }
    if ((m = r(/^\/api\/cases\/([^/]+)\/talked$/))) { this.need(u, ...STAFF); await this.talked(this.loadCase(m[1], u), u, body.note, now); return { ok: true }; }
    if ((m = r(/^\/api\/cases\/([^/]+)\/handover$/))) { this.need(u, ...STAFF); await this.handover(this.loadCase(m[1], u), u, body.to, now); this.runOutbox(); return { ok: true }; }
    if ((m = r(/^\/api\/cases\/([^/]+)\/ack$/))) { this.need(u, ...STAFF); await this.going(this.loadCase(m[1], u), u, now); this.runOutbox(); return { ok: true }; }
    if ((m = r(/^\/api\/cases\/([^/]+)\/(resolve|reached)$/))) {
      this.need(u, ...STAFF); const c = this.loadCase(m[1], u);
      if (['sos', 'medical_sos'].includes(c.kind)) await this.reached(c, u, body.note, now); else await this.talked(c, u, body.note, now);
      this.runOutbox(); return { ok: true };
    }
    if ((m = r(/^\/api\/cases\/([^/]+)\/verify$/))) { this.need(u, ...STAFF); this.loadCase(m[1], u); return { chain_ok: await this.verifyChain(m[1]) }; }
    if (p === '/api/sos/active') {
      this.need(u, ...STAFF);
      return this.s.cases.filter((c) => ['sos', 'medical_sos'].includes(c.kind) && ['open', 'acknowledged'].includes(c.status) && (c.ever_recipients.includes(u.id) || ['principal', 'counsellor'].includes(u.role))).map((c) => this.summary(c, u));
    }
    if (p === '/api/sos/history') {
      this.need(u, ...STAFF);
      return this.s.cases.filter((c) => ['sos', 'medical_sos'].includes(c.kind) && (c.ever_recipients.includes(u.id) || ['principal', 'counsellor'].includes(u.role))).sort((a, b) => b.created_at - a.created_at).slice(0, 10)
        .map((c) => ({ ...this.summary(c, u), minutes_to_reach: c.acknowledged_at ? Math.round((c.acknowledged_at - c.created_at) / MIN) : null }));
    }
    if (p === '/api/patterns') {
      this.need(u, 'counsellor', 'principal');
      return this.s.alerts.filter((a) => a.rule === 'persistent').sort((a, b) => b.at - a.at).map((a) => ({ id: a.id, student: this.person(this.user(a.student_id)), code: a.detail.code, days: a.detail.days, at: iso(a.at) }));
    }
    if ((m = r(/^\/api\/students\/([^/]+)\/open$/))) {
      this.need(u, 'counsellor', 'principal'); if (!body.reason || body.reason.trim().length < 3) throw new HttpError(422, 'give a short reason');
      this.s.access.push({ user_id: u.id, key: `st:${m[1]}`, student_id: m[1], reason: body.reason, at: now }); return { ok: true };
    }
    if ((m = r(/^\/api\/students\/([^/]+)\/inform-parent$/))) {
      this.need(u, 'counsellor', 'principal'); if (!body.text || !body.text.trim()) throw new HttpError(422, 'write what you want to share');
      this.s.parentMessages.push({ id: this.s.seq.id++, student_id: m[1], from: u.id, text: body.text.trim().slice(0, 400), created_at: now, read_at: null });
      this.s.access.push({ user_id: u.id, key: `parent:${m[1]}`, student_id: m[1], reason: 'Informed parent', at: now });
      this.emit({ type: 'parent' }); return { ok: true };
    }
    // A check-in the counsellor starts from a pattern note (no request from the child): same band message.
    if ((m = r(/^\/api\/students\/([^/]+)\/call$/))) {
      this.need(u, 'counsellor', 'principal'); const st = this.user(m[1]); if (!st) throw new HttpError(404, 'no such student');
      if (!WHEN.some((w) => w[0] === body.when) || !WHERE.some((w) => w[0] === body.where)) throw new HttpError(422, 'choose when and where');
      const c = this._newCase({ student_id: st.id, kind: 'talk', route: 'counsellor', status: 'open', recipients: [u.id], ever_recipients: [u.id], created_at: now, level_started_at: now, rung: 'counsellor', checkin: true });
      await this.addEvent(c, 'created', now, u.id, { kind: 'checkin', reason: body.reason || 'Feelings pattern' });
      this.s.access.push({ user_id: u.id, key: c.id, case_id: c.id, student_id: st.id, reason: body.reason || 'Feelings pattern', at: now });
      await this.call(c, u, body.when, body.where, now); return this.summary(c, u);
    }
    if ((m = r(/^\/api\/students\/([^/]+)$/))) {
      this.need(u, 'counsellor', 'principal'); const st = this.user(m[1]); if (!st || st.role !== 'student') throw new HttpError(404, 'no such student');
      if (!this.hasAccess(u, `st:${st.id}`, now)) throw new HttpError(428, 'give a reason before opening a child’s page');
      const reported = this.s.alerts.some((a) => a.student_id === st.id && a.rule === 'persistent');
      const visible = this.s.consents[st.id]?.feelings_to_counsellor || reported;
      const days = cal.daysBack(now, 14);
      const timeline = visible ? days.map((d) => { const rows = this.s.feelings.filter((f) => f.student_id === st.id && dateKey(f.at) === d && !f.skipped);
        const pickOne = rows.find((f) => DIFFICULT.has(f.code)) || rows[rows.length - 1]; return { date: d, code: pickOne?.code || null, all: rows.map((f) => f.code) }; }) : null;
      return { student: this.person(st), consent: this.s.consents[st.id], visible, reported, timeline, adult: this.person(this.user(this.s.trusted[st.id])),
        cases: this.s.cases.filter((c) => c.student_id === st.id).sort((a, b) => b.created_at - a.created_at).slice(0, 6).map((c) => this.summary(c, u)),
        opened_by: this.s.access.filter((a) => a.student_id === st.id).map((a) => ({ who: this.person(this.user(a.user_id)), reason: a.reason, at: iso(a.at) })),
        parent_messages: this.s.parentMessages.filter((x) => x.student_id === st.id).map((x) => ({ text: x.text, at: iso(x.created_at) })) };
    }
    if ((m = r(/^\/api\/class\/([^/]+)\/mood$/))) { this.need(u, 'teacher', 'counsellor', 'principal'); return this.classMood(m[1], now); }
    if ((m = r(/^\/api\/class\/([^/]+)\/timetable$/))) {
      const cl = this.s.classes.find((c) => c.id === m[1]); if (!cl) throw new HttpError(404, 'no class');
      return { class: cl.name, periods: timetableFor(cl.name), now: periodAt(cl.name, now), pt_bands: Object.values(this.s.bands).filter((b) => this.user(b.student_id)?.class_id === cl.id && b.pt_until > now).length };
    }
    if ((m = r(/^\/api\/activities\/([^/]+)\/done$/))) { this.need(u, 'teacher'); this.s.activities[`${m[1]}:${body.code}:${dateKey(now)}`] = iso(now); this.emit({ type: 'activity' }); return { ok: true }; }
    if (p === '/api/notifications' && method === 'GET') {
      const panel = ['principal'].includes(u.role);
      return this.s.notifications.filter((n) => n.user_id === u.id || (panel && n.user_id == null)).sort((a, b) => b.id - a.id).slice(0, 40)
        .map((n) => ({ id: n.id, channel: n.channel, kind: n.kind, vars: n.vars, title: n.title, body: n.body, case_id: n.case_id, at: iso(n.created_at), read: n.read_at != null, panel: n.user_id == null }));
    }
    if (p === '/api/notifications/read') { this.s.notifications.filter((n) => n.user_id === u.id && !n.read_at).forEach((n) => { n.read_at = now; }); return { ok: true }; }
    if (p === '/api/reports/response') { this.need(u, 'principal', 'management', 'counsellor'); return this.report(now); }
    if (p === '/api/reports/response.csv') {
      this.need(u, 'principal', 'management');
      const rows = [['ref', 'kind', 'route', 'status', 'level', 'created_at', 'first_response_at', 'deadline', 'minutes_to_respond']];
      for (const c of [...this.s.cases].sort((a, b) => a.created_at - b.created_at)) { const t = c.first_response_at ?? c.acknowledged_at; rows.push([c.ref, c.kind, c.route || '', c.status, c.level, iso(c.created_at), iso(t) || '', iso(c.deadline) || '', t ? Math.round((t - c.created_at) / MIN) : '']); }
      return rows.map((x) => x.join(',')).join('\n');
    }
    if (p === '/api/gateways') {
      this.need(u, 'admin', 'principal', 'counsellor');
      const heard = {}; for (const e of Object.values(this.s.bandEvents)) if (e.received_at > now - 8 * HOUR) for (const g of e.gateways) heard[g] = (heard[g] || 0) + 1;
      const gateways = Object.values(this.s.gateways).map((g) => { const ok = now - g.last_heartbeat < GW_STALE;
        return { id: g.id, kind: g.kind, location: g.location, x: g.x, y: g.y, version: g.version, ok, last_heartbeat: iso(g.last_heartbeat), messages_today: heard[g.id] || 0, status: ok ? 'Online' : `No gateway heard since ${fmtTime(g.last_heartbeat, now)}` }; });
      const bands = Object.values(this.s.bands).map((b) => { const st = this.user(b.student_id);
        return { id: b.id, student: st?.name || null, class: st?.class_name || null, battery: b.battery, last_seen: iso(b.last_seen), low_battery: (b.battery ?? 100) < 25, silent_today: !b.last_seen || dateKey(b.last_seen) !== dateKey(now) }; });
      return { gateways, bands };
    }
    if (p === '/api/parent/home') {
      this.need(u, 'parent'); const st = this.user(u.child_id); const b = this.bandOf(st.id);
      return { child: this.person(st), band: b ? { id: b.id, battery: b.battery, worn_today: !!b.last_seen && dateKey(b.last_seen) === dateKey(now), charge_tonight: b.battery < 40, last_seen: iso(b.last_seen) } : null,
        messages: this.s.parentMessages.filter((x) => x.student_id === st.id).sort((a, b2) => b2.created_at - a.created_at).map((x) => ({ text: x.text, from: this.person(this.user(x.from)), at: iso(x.created_at) })),
        consent: this.s.consents[st.id], health_note: this.s.health[st.id].note, language: u.language };
    }
    if (p === '/api/parent/consent') {
      this.need(u, 'parent'); const sid = u.child_id; const cs = this.s.consents[sid];
      if (typeof body.sensing === 'boolean') cs.sensing = body.sensing;
      if (typeof body.feelings_to_counsellor === 'boolean') cs.feelings_to_counsellor = body.feelings_to_counsellor;
      if (typeof body.health_note === 'string') this.s.health[sid].note = body.health_note.slice(0, 300);
      if (body.language) u.language = body.language === 'hi' ? 'hi' : 'en';
      cs.given_by = u.name; cs.given_at = now; this.emit({ type: 'consent' }); return { ok: true, consent: cs };
    }
    if (p === '/api/classes') return this.s.classes.map((c) => ({ id: c.id, name: c.name }));
    throw new HttpError(404, `no route ${method} ${p}`);
  }

  report(now) {
    const rows = this.s.cases.filter((c) => c.created_at > now - 30 * DAY);
    const missed = new Set(this.s.events.filter((e) => e.kind === 'deadline_missed' && e.at > now - 30 * DAY).map((e) => e.case_id));
    const talks = rows.filter((c) => c.kind === 'talk' && c.first_response_at);
    const mins = talks.map((c) => (c.first_response_at - c.created_at) / MIN);
    const sos = rows.filter((c) => c.kind !== 'talk');
    const ack = sos.filter((c) => c.acknowledged_at).map((c) => (c.acknowledged_at - c.created_at) / MIN);
    const count = (f) => rows.filter(f).length;
    return { window_days: 30, cases: rows.length,
      by_kind: { talk: count((c) => c.kind === 'talk'), sos: count((c) => c.kind === 'sos'), medical_sos: count((c) => c.kind === 'medical_sos') },
      by_route: { adult: count((c) => c.route === 'adult'), counsellor: count((c) => c.route === 'counsellor'), staff: count((c) => c.route === 'staff') },
      median_response_minutes: mins.length ? Math.round(median(mins)) : null,
      on_time_share: talks.length ? Math.round((talks.filter((c) => !missed.has(c.id)).length / talks.length) * 100) / 100 : null,
      moved_up: missed.size, open: count((c) => ['open', 'acknowledged', 'responded'].includes(c.status)), sos: sos.length,
      open_sos: count((c) => c.kind !== 'talk' && ['open', 'acknowledged'].includes(c.status)),
      median_sos_ack_minutes: ack.length ? Math.round(median(ack) * 10) / 10 : null,
      unanswered: count((c) => c.kind === 'talk' && c.rung === 'management' && c.status === 'open'),
      basis: 'Supreme Court of India, Sukdeb Saha v. State of Andhra Pradesh (25 Jul 2025): confidential reporting and counselling' };
  }

  // Virtual gateway radio (same contract as gateway.py's POST /air, plus the signal strength).
  async air(gwId, packetHex, rssi = null) {
    if (!this.gwPower[gwId]) return { gateway: gwId, status: 'gateway_off' };
    if (!this.serverReachable) { (this.gwQueue[gwId] ||= []).push({ hex: packetHex, rssi }); return { gateway: gwId, status: 'queued', reason: 'server unreachable; will send when back online' }; }
    await this.flushGw(gwId);
    const res = await this.handle('POST', '/api/gw/ingest', { packets: [{ hex: packetHex, rssi }] }, null, { 'X-Gateway-Id': gwId, Authorization: `Bearer demo-token-${gwId}` });
    return { gateway: gwId, ...res.results[0] };
  }
  async flushGw(gwId) {
    const q = this.gwQueue[gwId] || []; if (!q.length || !this.serverReachable) return;
    this.gwQueue[gwId] = [];
    await this.handle('POST', '/api/gw/ingest', { packets: q }, null, { 'X-Gateway-Id': gwId, Authorization: `Bearer demo-token-${gwId}` });
  }
  async setPower(gwId, on) { this.gwPower[gwId] = on; if (on) await this.flushGw(gwId); this.emit({ type: 'gateway' }); }
  async setServer(on) { this.serverReachable = on; if (on) for (const g of Object.keys(this.gwPower)) await this.flushGw(g); this.emit({ type: 'gateway' }); }
}
