// The virtual band (v2). It runs the logic the firmware will run: learn this child's normal heart
// rate for each time of day, notice a sustained rise while still (never in PT mode or a PT period,
// at most 3 questions a day), vibrate privately, and show a word menu on a small OLED.
// One button: tap = next, hold 1 s = choose, double tap = open the menu, hold 5 s = SOS.
// Every choice is sent as 19 encrypted bytes; a buzz happens only on a receipt signed with the band's key.
import * as C from './crypto.js';
import { api } from './api.js';
import { clock } from './ui.js';
import { FEELINGS, BY_CODE, DIFFICULT, JUNIOR_CODES, exerciseFor, rssiFrom, IN_RANGE } from './content.js';
import * as M from './model.js';

export const DEMO_TIMING = { learnSamples: 20, stillSeconds: 6, noticeSeconds: 8, askWindow: 25, reaskSeconds: 30, cooldown: 40, exerciseScale: 0.25,
  confirmWindow: 10, cancelWindow: 60, beacon: 5, maxQuestions: 3, retry: [0, 2, 4, 8], inboxPoll: 8 };
export const REAL_TIMING = { learnSamples: '2 weeks of still readings', stillSeconds: 300, noticeSeconds: 120, askWindow: 60, reaskSeconds: 600, cooldown: 45 * 60, exerciseScale: 1 };
const TOD = (ts) => { const d = new Date(ts + 330 * 60000); return M.todOf(d.getUTCHours(), d.getUTCMinutes()); };
const HHMM = (ts) => { const d = new Date(ts + 330 * 60000); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

export class VirtualBand extends EventTarget {
  constructor(info) {
    super();
    this.bandId = info.band_id; this.key = C.unhex(info.key); this.counter = info.counter; this.student = info.student; this.className = info.class;
    this.junior = !!info.junior; this.adult = info.adult; this.timetable = info.timetable || []; this.model = info.model; this.school = info.school;
    this.pauseSensing = !!info.pause_sensing; this.ptUntil = info.pt_until ? Date.parse(info.pt_until) : 0;
    this.T = { ...DEMO_TIMING };
    this.hrTarget = 82; this.hr = 82; this.move = 0; this.where = 'gw-7b'; this.battery = info.battery ?? 78; this.sentBattery = this.battery;
    this.base = { morning: { n: 0, mean: 0, m2: 0 }, mid: { n: 0, mean: 0, m2: 0 }, afternoon: { n: 0, mean: 0, m2: 0 } };
    this.tune = 0; this.still = 0; this.elevated = 0; this.lastAsk = -1e9; this.questions = { day: '', n: 0 }; this.reaskAt = null;
    this.mode = 'learning'; this.sec = 0; this.flash = null; this.menu = null; this.ex = null; this.message = null; this.sos = null; this.pending = []; this.log = [];
    this.gwOff = {};
    this.timer = setInterval(() => this.tick(), 1000);
  }
  destroy() { clearInterval(this.timer); clearTimeout(this.tapTimer); this.clearHold(); clearTimeout(this.flashTimer); }
  changed() { this.dispatchEvent(new Event('change')); }
  buzz(pattern) { this.dispatchEvent(new CustomEvent('buzz', { detail: pattern })); }
  now() { return clock.now(); }

  // ------------------------------------------------------------------ sensing
  get tod() { return TOD(this.now()); }
  get b() { return this.base[this.tod]; }
  get learned() { return this.b.n >= this.T.learnSamples; }
  get normal() { return Math.round(this.b.mean); }
  get threshold() { return this.b.mean * (1.2 + this.tune); }
  get risePct() { return this.learned ? Math.round((this.hr / this.b.mean - 1) * 100) : 0; }
  get riseBucket() { const r = this.risePct; return r >= 45 ? 3 : r >= 30 ? 2 : r >= 20 ? 1 : 0; }
  get period() { const t = HHMM(this.now()); return this.timetable.find((p) => t >= p.start && t < p.end) || null; }
  get ptActive() { return this.ptUntil > this.now(); }
  get ptMinutes() { return Math.max(0, Math.ceil((this.ptUntil - this.now()) / 60000)); }
  get timetablePause() { return !!this.period?.pauses; }
  get questionsToday() { const d = new Date(this.now() + 330 * 60000).toISOString().slice(0, 10); if (this.questions.day !== d) this.questions = { day: d, n: 0 }; return this.questions.n; }
  get noticing() { return this.learned && !this.pauseSensing && !this.ptActive && !this.timetablePause; }
  // Fill the baseline at once (the story's "two weeks in ten seconds").
  learnNow(mean = 80, sd = 3) { for (const k of Object.keys(this.base)) this.base[k] = { n: this.T.learnSamples, mean, m2: sd * sd * (this.T.learnSamples - 1) }; if (this.mode === 'learning') this.mode = 'idle'; this.changed(); }

  tick() {
    this.sec++;
    const target = this.move === 2 ? Math.max(this.hrTarget, 128) : this.hrTarget;
    this.hr = Math.round(target + (Math.random() - 0.5) * 4);
    if (this.move) { this.still = 0; } else this.still++;
    const b = this.b;
    if (!this.pauseSensing && !this.move && (!this.learned || this.hr < this.threshold) && ['learning', 'idle'].includes(this.mode)) {
      b.n++; const d = this.hr - b.mean; b.mean += d / Math.min(b.n, 200); b.m2 += d * (this.hr - b.mean);
    }
    if (this.mode === 'learning' && this.learned) this.mode = 'idle';
    this.elevated = this.noticing && !this.move && this.hr >= this.threshold ? this.elevated + 1 : 0;
    if (this.mode === 'idle' && this.elevated >= this.T.noticeSeconds && this.still >= this.T.stillSeconds && this.sec - this.lastAsk >= this.T.cooldown && this.questionsToday < this.T.maxQuestions) this.ask(false);
    if (this.mode === 'idle' && this.reaskAt && this.sec >= this.reaskAt) this.ask(true);
    if (this.mode === 'menu' && this.menu?.asked && this.sec >= this.menu.until) this.noAnswer();
    if (this.mode === 'confirm_sos' && this.sec >= this.confirmUntil) this.setMode('idle');
    if (this.mode === 'exercise') this.exTick();
    if (this.sos && this.sec % this.T.beacon === 0) this.beacon();
    if (this.sec % this.T.inboxPoll === 0) this.fetchInbox();
    if (this.pending.length && this.sec % 15 === 0) for (const m of [...this.pending]) this.deliver(m, [0]);
    this.changed();
  }
  setMode(mode) { this.mode = mode; this.changed(); }
  showFlash(key, vars = {}, ms = 2600, then = 'idle') { this.flash = { key, vars }; this.mode = 'flash'; clearTimeout(this.flashTimer); this.flashTimer = setTimeout(() => { this.flash = null; if (this.mode === 'flash') this.mode = this.sos ? 'sos' : then; this.changed(); }, ms); this.changed(); }

  // ------------------------------------------------------------------ the question and the menu
  ask(again) {
    if (!again) { this.questions.n++; this.lastAsk = this.sec; }
    this.reaskAt = null; this.again = again;
    this.buzz('ask');
    this.openMenu(true);
  }
  noAnswer() {
    this.menu = null;
    if (!this.again) { this.reaskAt = this.sec + this.T.reaskSeconds; this.setMode('idle'); }
    else { this.reaskAt = null; this.again = false; this.send(C.T.SKIPPED, 0, 'No answer: skipped', { quiet: true }); this.setMode('idle'); }
  }
  ctx(asked) { return M.cleanCtx({ tod: this.tod, dow: String(Math.min(6, new Date(this.now() + 330 * 60000).getUTCDay() || 7)), period: this.period?.subject || 'none', rise: asked ? ['self', 'r20', 'r30', 'r45'][this.riseBucket || 1] : 'self', move: ['still', 'light', 'active'][this.move] }); }
  openMenu(asked) {
    const codes = this.junior ? JUNIOR_CODES : FEELINGS.map((f) => f.code).filter((c) => asked || c !== 10);
    const ranked = M.suggest(this.model, this.school, this.ctx(asked), codes);
    const star = ranked[0].code;
    const items = [{ t: 'feel', code: star, star: true }, ...codes.filter((c) => c !== star).map((code) => ({ t: 'feel', code })), { t: 'talk' }];
    if (!asked && !this.junior) items.push({ t: 'pt' });
    if (!this.junior) items.push({ t: 'danger' });
    this.menu = { asked, items, i: 0, star, ranked: ranked.slice(0, 3), until: this.sec + this.T.askWindow, rise: asked ? this.riseBucket || 1 : 0 };
    this.setMode('menu');
  }

  // ------------------------------------------------------------------ the one button
  clearHold() { clearTimeout(this.h1); clearTimeout(this.h5); clearTimeout(this.h2); }
  pressDown() {
    this.downAt = performance.now(); this.holdFired = false; this.clearHold();
    if (this.mode === 'sos' && this.sos && this.sec - this.sos.sec <= this.T.cancelWindow) {
      this.dispatchEvent(new CustomEvent('hold', { detail: { ms: 2000, kind: 'cancel' } }));
      this.h2 = setTimeout(() => { this.holdFired = true; this.cancelSos(); }, 2000); return;
    }
    this.dispatchEvent(new CustomEvent('hold', { detail: { ms: 5000, kind: 'sos' } }));
    this.h1 = setTimeout(() => { this.dispatchEvent(new CustomEvent('hold', { detail: { ms: 5000, kind: 'sos', chooseReady: true } })); }, 1000);
    this.h5 = setTimeout(() => { this.holdFired = true; this.confirmSos(); }, 5000);
  }
  pressUp() {
    this.clearHold(); this.dispatchEvent(new CustomEvent('hold', { detail: { ms: 0 } }));
    if (this.downAt == null) return;
    const ms = performance.now() - this.downAt; this.downAt = null;
    if (this.holdFired) return;
    if (ms < 600) this.tap(); else if (ms >= 1000) this.hold();
  }
  tap() {
    if (['idle', 'learning', 'flash'].includes(this.mode)) {
      if (this.tapTimer) { clearTimeout(this.tapTimer); this.tapTimer = null; this.openMenu(false); return; }
      this.tapTimer = setTimeout(() => { this.tapTimer = null; this.wake = this.sec; this.changed(); }, 380);
      return;
    }
    if (this.mode === 'sos') { this.wake = this.sec; this.changed(); return; }
    if (this.mode === 'menu') { this.menu.i = (this.menu.i + 1) % this.menu.items.length; this.menu.until = this.sec + this.T.askWindow; this.changed(); }
    else if (['talk', 'pt'].includes(this.mode)) { this.sub.i = (this.sub.i + 1) % this.sub.items.length; this.changed(); }
    else if (this.mode === 'confirm_sos') this.sendSos(false);
    else if (this.mode === 'nurse') this.showFlash('b_get_well');
    else if (this.mode === 'ptoffer') this.showFlash('b_ok');
    else if (this.mode === 'better') { this.send(C.T.EXERCISE, 1, 'Exercise done: felt better', { quiet: true }); this.showFlash('b_glad'); }
    else if (this.mode === 'exercise') { /* taps don't stop an exercise; hold does */ }
    else if (this.mode === 'message') { this.wake = this.sec; this.changed(); }
  }
  hold() {
    if (this.mode === 'menu') this.choose(this.menu.items[this.menu.i]);
    else if (this.mode === 'talk') this.sendTalk(this.sub.items[this.sub.i]);
    else if (this.mode === 'pt') this.startPt(this.sub.items[this.sub.i]);
    else if (this.mode === 'nurse') this.sendSos(true);
    else if (this.mode === 'ptoffer') this.startPt(30);
    else if (this.mode === 'better') { this.send(C.T.EXERCISE, 2, 'Exercise done: wants to talk', { quiet: true }); this.openTalk(); }
    else if (this.mode === 'exercise') this.endExercise();
    else if (this.mode === 'message') this.seeMessage();
    else if (this.mode === 'idle' && this.message) this.setMode('message');
  }

  // ------------------------------------------------------------------ choices
  async choose(item) {
    const m = this.menu; this.menu = null;
    if (item.t === 'talk') return this.openTalk();
    if (item.t === 'pt') { this.sub = { items: [30, 45, 60], i: 0 }; return this.setMode('pt'); }
    if (item.t === 'danger') return this.confirmSos();
    const code = item.code; const accepted = code === m.star;
    const sent = this.send(C.T.FEELING, C.packFeeling(code, m.rise, m.asked, accepted), `Feeling: ${BY_CODE[code].en}${accepted ? ' (★ accepted)' : ''}`);
    sent.then(() => this.send(C.T.SUGGESTION, (accepted ? 1 : 0) | (this.move << 1) | (m.star << 3), 'Suggestion result', { quiet: true }));
    M.update(this.model, { ...this.ctx(m.asked) }, code); // the band learns too; the server copy syncs back
    this.lastChoice = { code, accepted, star: m.star };
    if (code === 1) { this.tune = Math.min(0.35, this.tune + 0.03); return this.showFlash('b_thanks'); }
    if (code === 10) { this.tune = Math.min(0.35, this.tune + 0.03); return this.setMode('ptoffer'); }
    if (code === 9) return this.setMode('nurse');
    if (DIFFICULT.has(code)) return this.startExercise(code);
    this.showFlash('b_thanks');
  }
  openTalk() { this.sub = { items: ['adult', 'counsellor'], i: 0 }; this.setMode('talk'); }
  sendTalk(to) {
    this.talkSent = to;
    this.send(C.T.TALK, to === 'counsellor' ? 1 : 0, `Talk to ${to === 'counsellor' ? 'the counsellor' : this.adult?.label || 'my adult'}`);
    this.showFlash(to === 'counsellor' ? 'b_sent_counsellor' : 'b_sent_adult', { name: this.adult?.label || '' }, 4000);
  }
  startPt(min) { this.ptUntil = this.now() + min * 60000; this.send(C.T.PAUSE, min, `PT mode ${min} min`); this.showFlash('b_pt_on', { n: min }, 3000); }
  endPt() { this.ptUntil = 0; this.send(C.T.PAUSE, 0, 'PT mode off', { quiet: true }); this.changed(); }

  // ------------------------------------------------------------------ exercises (about 1 minute; faster in the demo)
  startExercise(code) {
    const ex = exerciseFor(code); if (!ex) return this.showFlash('b_thanks');
    const steps = []; for (let r = 0; r < (ex.rounds || 1); r++) steps.push(...ex.steps);
    const scale = this.T.exerciseScale;
    const total = steps.reduce((s, x) => s + Math.max(1, Math.round(x[1] * scale)), 0);
    this.ex = { code, ex, steps, i: 0, left: Math.max(1, Math.round(steps[0][1] * scale)), total, done: 0, scale };
    this.mode = 'exercise'; this.buzz('calm'); this.changed();
  }
  exTick() {
    const x = this.ex; if (!x) return;
    x.left--; x.done++;
    if (x.left <= 0) {
      x.i++;
      if (x.i >= x.steps.length) return this.endExercise();
      x.left = Math.max(1, Math.round(x.steps[x.i][1] * x.scale));
      if (x.steps[x.i][2]) this.buzz(x.steps[x.i][2] === 'in' ? 'breath_in' : x.steps[x.i][2] === 'out' ? 'breath_out' : 'breath_hold');
    }
  }
  endExercise() { this.ex = null; this.setMode('better'); }

  // ------------------------------------------------------------------ SOS
  confirmSos() { this.confirmUntil = this.sec + this.T.confirmWindow; this.buzz('sos_confirm'); this.setMode('confirm_sos'); }
  sendSos(medical) {
    this.sos = { sec: this.sec, medical, coming: null };
    this.send(C.T.SOS, medical ? 1 : 0, medical ? 'SOS: medical (nurse)' : 'SOS');
    this.setMode('sos');
  }
  cancelSos() { this.send(C.T.CANCEL, 0, 'Cancel SOS'); this.sos = null; this.showFlash('b_sos_cancelled'); }
  beacon() { this.send(C.T.STATUS, 0, 'SOS location beacon', { quiet: true, once: true }); }

  // ------------------------------------------------------------------ messages from adults
  async fetchInbox() {
    let r; try { r = await api.get(`/demo/band-inbox?band=${this.bandId}`); } catch { return; }
    if (r.model) { this.model = r.model; this.school = r.school; }
    this.pauseSensing = !r.sensing;
    if (this.sos && !r.sos_active && this.sec - this.sos.sec > 3) { this.sos = null; if (this.mode === 'sos') this.setMode('idle'); }
    for (const m of r.messages) {
      if (m.kind === 'coming' && this.sos) this.sos.coming = m;
      this.message = m; this.buzz('message');
      if (!['exercise', 'confirm_sos'].includes(this.mode)) this.setMode('message');
    }
  }
  seeMessage() {
    const m = this.message; this.message = null;
    if (m) this.send(C.T.SEEN, m.id & 255, 'Okay: message seen');
    this.mode = this.sos ? 'sos' : 'idle'; this.showFlash('b_ok', {}, 1600, this.sos ? 'sos' : 'idle');
  }

  setBattery(v) { this.battery = v; if (Math.abs(v - this.sentBattery) >= 5) { this.sentBattery = v; this.send(C.T.BATTERY, v, `Battery ${v}%`, { quiet: true }); } this.changed(); }

  // ------------------------------------------------------------------ radio
  inRange() { return api.gateways.filter((g) => !this.gwOff[g.id] && rssiFrom(this.where, g.id) >= IN_RANGE); }
  async epoch() { try { return (await api.get('/gw/time')).epoch; } catch { return Math.floor(Date.now() / 1000 / C.EPOCH_SECONDS); } }
  async send(type, arg, label, opts = {}) {
    this.counter++;
    const packet = await C.buildPacket(this.key, this.counter, await this.epoch(), type, arg);
    const msg = { counter: this.counter, type, arg, label, packet, rid: packet.slice(1, 5), quiet: !!opts.quiet, at: new Date(), tries: 0 };
    if (!opts.once) this.pending.push(msg);
    this.addLog({ dir: 'tx', msg });
    await this.deliver(msg, opts.once ? [0] : this.T.retry, opts.once);
  }
  async deliver(msg, schedule, once = false) {
    for (const wait of schedule) {
      if (wait) await new Promise((r) => setTimeout(r, wait * 1000));
      if (!once && !this.pending.includes(msg)) return;
      msg.tries++;
      const gws = this.inRange();
      const results = await Promise.all(gws.map((g) => api.air(g, C.hex(msg.packet), rssiFrom(this.where, g.id))));
      let good = null;
      for (const r of results) {
        const rc = r.receipt ? await C.verifyReceipt(this.key, C.unhex(r.receipt), msg.rid, msg.counter) : null;
        this.addLog({ dir: 'rx', msg, result: { ...r, rssi: rssiFrom(this.where, r.gateway) }, verified: !!rc });
        if (rc && !good) good = rc;
      }
      if (!gws.length) this.addLog({ dir: 'rx', msg, result: { status: 'no gateway in range' }, verified: false });
      if (good) {
        this.pending = this.pending.filter((m) => m !== msg); msg.delivered = true;
        if (!msg.quiet) this.buzz('one');
        if (good.status === 2) this.fetchInbox();
        this.changed(); return;
      }
    }
    if (!msg.quiet && !msg.warned) { msg.warned = true; this.buzz('two'); }
    this.changed();
  }
  addLog(entry) { this.log.unshift({ ...entry, at: new Date() }); this.log = this.log.slice(0, 60); this.changed(); }

  // ------------------------------------------------------------------ security demos (Under the hood)
  async replayLast() {
    const last = this.log.find((l) => l.dir === 'tx' && l.msg.delivered); if (!last) return null;
    const r = await Promise.all(this.inRange().map((g) => api.air(g, C.hex(last.msg.packet), rssiFrom(this.where, g.id))));
    for (const x of r) this.addLog({ dir: 'rx', msg: { ...last.msg, label: `Replay of #${last.msg.counter}` }, result: x, verified: !!x.receipt });
    return r;
  }
  async sendTampered() {
    this.counter++;
    const p = await C.buildPacket(this.key, this.counter, await this.epoch(), C.T.SOS, 0);
    p[10] ^= 0x01;
    const msg = { counter: this.counter, type: C.T.SOS, label: 'Tampered packet (1 bit flipped)', packet: p, rid: p.slice(1, 5), at: new Date() };
    this.addLog({ dir: 'tx', msg });
    const r = await Promise.all(this.inRange().map((g) => api.air(g, C.hex(p), rssiFrom(this.where, g.id))));
    for (const x of r) this.addLog({ dir: 'rx', msg, result: x, verified: false });
    this.buzz('two');
  }
}

export async function loadBands() { return api.get('/demo/bands'); }
export async function makeBand(info) { return new VirtualBand(info); }
