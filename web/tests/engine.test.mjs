// Runs the in-browser demo server (v2, band-only) under Node and checks every rule in document.md.
import assert from 'node:assert/strict';
import { Engine, cal, dateKey } from '../js/engine.js';
import * as C from '../js/crypto.js';
import { rssiFrom } from '../js/content.js';

const MIN = 60000;
let e;
const fresh = async () => { e = new Engine(); await e.seed(); };
const epoch = () => Math.floor(e.now() / 1000 / C.EPOCH_SECONDS);
const pkt = async (band, counter, t, arg = 0) => C.hex(await C.buildPacket(await C.demoBandKey(band), counter, epoch(), t, arg));
const login = async (erp) => (await e.handle('POST', '/api/auth/login', { user_id: `u-${erp}` })).token;
const get = async (path, erp) => e.handle('GET', path, {}, await login(erp));
const post = async (path, body, erp) => e.handle('POST', path, body, await login(erp));
const notes = (uid) => e.s.notifications.filter((n) => n.user_id === uid);
let counter = 100;
const send = async (band, t, arg = 0, near = 'gw-7b') => { const p = await pkt(band, ++counter, t, arg); return e.air(near, p, rssiFrom(near, near)); };
let ok = 0; const test = async (name, fn) => { await fresh(); counter = 100; await fn(); ok++; console.log('ok', name); };

await test('two gateways, one case, same receipt', async () => {
  const p = await pkt(1001, 200, C.T.TALK, 0);
  const a = await e.air('gw-7b', p, -50), b = await e.air('gw-stairs', p, -70);
  assert.equal(a.status, 'ok'); assert.equal(b.status, 'duplicate'); assert.equal(a.receipt, b.receipt);
  const rid = C.parseHeader(C.unhex(p)).rid;
  assert.equal((await C.verifyReceipt(await C.demoBandKey(1001), C.unhex(a.receipt), rid, 200)).status, 0);
  assert.equal(e.s.cases.filter((c) => c.kind === 'talk' && c.status === 'open').length, 1);
});
await test('two gateways at the same moment still make one case', async () => {
  const p = await pkt(1003, 900, C.T.TALK, 1);
  const r = await Promise.all([e.air('gw-7b', p, -50), e.air('gw-office', p, -80)]);
  assert.deepEqual(r.map((x) => x.status).sort(), ['duplicate', 'ok']);
  assert.equal(e.s.cases.filter((c) => c.status === 'open').length, 1);
});
await test('replay and forgery rejected', async () => {
  assert.equal((await e.air('gw-7b', await pkt(1001, 300, C.T.FEELING, 1), -50)).status, 'ok');
  assert.match((await e.air('gw-7b', await pkt(1001, 260, C.T.SOS, 0), -50)).reason, /replay/);
  const f = C.unhex(await pkt(1001, 301, C.T.SOS, 0)); f[18] ^= 0xff;
  assert.equal((await e.air('gw-7b', C.hex(f), -50)).status, 'rejected');
});
await test('one difficult feeling is private: nobody is told', async () => {
  const before = e.s.notifications.length + e.s.outbox.length;
  await send(1001, C.T.FEELING, C.packFeeling(2, 2, true, true)); // worried: 4th day in 10, still private
  assert.equal(e.s.outbox.length + e.s.notifications.length, before);
  assert.equal(e.s.alerts.filter((a) => a.rule === 'persistent').length, 0);
});
await test('the 5th day of the same feeling reaches the counsellor with the name, not before', async () => {
  const riya = e.user('u-S7B01');
  const days = cal.daysBack(e.now(), 10);
  // a child with no history: 4 days of "left out" stay private, the 5th reaches the counsellor
  const kabir = e.user('u-S7B03');
  e.s.feelings = e.s.feelings.filter((f) => f.student_id !== kabir.id);
  for (let i = 0; i < 4; i++) await e.recordFeeling(kabir, { code: 8, rise: 1, asked: true }, Date.parse(`${days[i * 2]}T06:00:00Z`));
  assert.equal(e.s.alerts.filter((a) => a.rule === 'persistent' && a.student_id === kabir.id).length, 0);
  await e.recordFeeling(kabir, { code: 8, rise: 1, asked: true }, Date.parse(`${days[9]}T05:00:00Z`));
  assert.equal(e.s.alerts.filter((a) => a.rule === 'persistent' && a.student_id === kabir.id).length, 1);
  // Riya: sad today is her 5th sad day
  await send(1001, C.T.FEELING, C.packFeeling(3, 0, false, false));
  e.runOutbox();
  const n = notes('u-C01').find((x) => x.kind === 'pattern' && x.vars.sid === riya.id);
  assert.ok(n && /Riya Sharma/.test(n.body) && n.vars.n === 5);
  await send(1001, C.T.FEELING, C.packFeeling(3, 0, false, false)); // a second sad today: no second note
  e.runOutbox();
  assert.equal(notes('u-C01').filter((x) => x.kind === 'pattern' && x.vars.sid === riya.id).length, 1);
  const pats = await get('/api/patterns', 'C01'); assert.ok(pats.some((x) => x.student.name === 'Riya Sharma' && x.code === 3));
  await assert.rejects(() => get('/api/patterns', 'T01')); // teachers never see individual feelings
});
await test('three skipped questions in a row: a quiet note to the chosen adult', async () => {
  await send(1002, C.T.SKIPPED); e.runOutbox();
  assert.ok(notes('u-T02').some((x) => x.kind === 'quiet' && /Aarav/.test(x.body)));
});
await test('talk: the reply clock moves up, Call to talk stops it and reaches the band', async () => {
  await send(1001, C.T.TALK, 0); e.runOutbox();
  let c = e.s.cases.find((x) => x.kind === 'talk' && x.status === 'open');
  assert.deepEqual(c.recipients, ['u-T01']); assert.ok(notes('u-T01').some((x) => x.kind === 'talk_new'));
  await e.handle('POST', '/api/demo/clock', { set_local: '15:31' });
  assert.equal(c.level, 2); assert.deepEqual(c.recipients, ['u-C01']);
  assert.ok(notes('u-T01').some((x) => x.kind === 'talk_moved_on'));
  assert.ok(e.s.bandMessages.some((m) => m.kind === 'moved' && m.text === 'Ms Khan will contact you'));
  await assert.rejects(() => get(`/api/cases/${c.id}`, 'C01'), (err) => err.status === 428); // a reason first
  await post(`/api/cases/${c.id}/open`, { reason: 'Moved to me' }, 'C01');
  const s = await post(`/api/cases/${c.id}/call`, { when: 'lunch', where: 'counselling' }, 'C01');
  assert.equal(s.status, 'responded'); assert.equal(s.message.text, 'Ms Khan will see you tomorrow at lunch, Counselling room');
  assert.ok(s.message.text.length <= 60);
  assert.ok(e.s.timers.filter((t) => t.case_id === c.id).every((t) => t.done));
  const inbox = await e.handle('GET', '/api/demo/band-inbox?band=1001');
  const msg = inbox.messages.find((m) => m.kind === 'call'); assert.ok(msg);
  await send(1001, C.T.SEEN, msg.id & 255);
  c = await get(`/api/cases/${c.id}`, 'C01'); assert.equal(c.message.seen, true);
  await e.handle('POST', '/api/demo/clock', { advance_minutes: 60 * 24 }); // nothing moves after a real response
  assert.equal(e.s.cases.find((x) => x.id === c.id).level, 2);
});
await test('SOS: three adults at once, live location from the strongest gateway, follows the child', async () => {
  await send(1001, C.T.SOS, 0, 'gw-stairs'); e.runOutbox();
  const c = e.s.cases.find((x) => x.kind === 'sos' && x.status !== 'resolved');
  assert.deepEqual([...c.recipients].sort(), ['u-C01', 'u-P01', 'u-T01']);
  assert.equal(c.location_gateway, 'gw-stairs');
  for (const id of ['u-C01', 'u-P01', 'u-T01']) assert.ok(notes(id).some((x) => x.kind === 'sos'));
  // the band keeps broadcasting; every gateway that hears it reports RSSI
  const p = await pkt(1001, ++counter, C.T.STATUS);
  for (const g of ['gw-library', 'gw-stairs', 'gw-7b']) await e.air(g, p, rssiFrom('gw-library', g));
  assert.equal(c.location_gateway, 'gw-library'); assert.equal(c.trail.length, 2);
  const active = await get('/api/sos/active', 'P01'); assert.equal(active[0].location.gw, 'gw-library');
  await post(`/api/cases/${c.id}/ack`, {}, 'C01');
  assert.equal(c.going_by, 'u-C01');
  assert.ok(e.s.bandMessages.some((m) => m.kind === 'coming' && m.text === 'Ms Khan is coming'));
  assert.ok(notes('u-P01').some((x) => x.kind === 'sos_going') || e.s.outbox.some((x) => x.kind === 'sos_going' && x.to_user === 'u-P01'));
});
await test('SOS not answered in 10 minutes: SMS + call to all, repeated', async () => {
  await send(1004, C.T.SOS, 0, 'gw-playground');
  const c = e.s.cases.find((x) => x.kind === 'sos' && x.status !== 'resolved');
  assert.ok(c.recipients.includes('u-N01')); // Meera's health profile adds the nurse
  await e.handle('POST', '/api/demo/clock', { advance_minutes: 11 }); e.runOutbox();
  assert.equal(e.s.notifications.filter((n) => n.channel === 'sms' && n.case_id === c.id).length, c.recipients.length);
  await e.handle('POST', '/api/demo/clock', { advance_minutes: 10 }); e.runOutbox();
  assert.equal(e.s.notifications.filter((n) => n.channel === 'sms' && n.case_id === c.id).length, 2 * c.recipients.length);
});
await test('Unwell + Need the nurse: medical SOS to the nurse and counsellor', async () => {
  await send(1003, C.T.SOS, 1, 'gw-lab');
  const c = e.s.cases.find((x) => x.kind === 'medical_sos' && x.status !== 'resolved');
  assert.ok(c.recipients.includes('u-N01') && c.recipients.includes('u-C01'));
});
await test('the child can cancel SOS within 60 seconds', async () => {
  await send(1001, C.T.SOS, 0);
  await send(1001, C.T.CANCEL, 0);
  assert.equal(e.s.cases.find((x) => x.kind === 'sos' && x.status !== 'resolved').status, 'cancelled');
});
await test('PT mode and the timetable', async () => {
  await send(1001, C.T.PAUSE, 30);
  assert.ok(e.s.bands[1001].pt_until > e.now() + 29 * MIN);
  const tt = await get('/api/class/cl-7B/timetable', 'T01');
  assert.ok(tt.periods.some((x) => x.subject === 'PT' && x.start === '11:20' && x.pauses)); assert.equal(tt.pt_bands, 1);
});
await test('class weather: 7B is tense, small groups are hidden, no names', async () => {
  const m = await get('/api/class/cl-7B/mood', 'T01');
  assert.equal(m.row.weather, 'storm'); assert.ok(m.row.activity); assert.ok(m.row.top.length >= 1);
  assert.equal(m.rows.filter((r) => r.flag).length, 1);
  assert.ok(m.rows.find((r) => r.class === '9A').cells[6].hidden);
  assert.ok(!JSON.stringify(m).includes('Riya'));
});
await test('parents: no automatic alerts; consent switches; counsellor messages only', async () => {
  await send(1001, C.T.SOS, 0); await send(1001, C.T.FEELING, C.packFeeling(3)); await send(1001, C.T.TALK, 0);
  await e.handle('POST', '/api/demo/clock', { advance_minutes: 30 }); e.runOutbox();
  assert.equal(notes('u-G01').length, 0);
  let home = await get('/api/parent/home', 'G01'); assert.equal(home.messages.length, 0); assert.equal(home.band.worn_today, true);
  await post('/api/students/u-S7B01/inform-parent', { text: 'We talked with Riya today. All is well.' }, 'C01');
  home = await get('/api/parent/home', 'G01'); assert.equal(home.messages.length, 1);
  await post('/api/parent/consent', { sensing: false }, 'G01');
  assert.equal((await e.handle('GET', '/api/demo/band-inbox?band=1001')).sensing, false);
});
await test('the counsellor needs a reason to open a child’s page; the timeline respects consent', async () => {
  await assert.rejects(() => get('/api/students/u-S7B01', 'C01'), (err) => err.status === 428);
  await post('/api/students/u-S7B01/open', { reason: 'Feelings pattern' }, 'C01');
  const pg = await get('/api/students/u-S7B01', 'C01'); assert.equal(pg.timeline.length, 14); assert.ok(pg.opened_by.length);
  await post('/api/students/u-S8A02/open', { reason: 'Check' }, 'C01');
  assert.equal((await get('/api/students/u-S8A02', 'C01')).timeline, null); // consent off, not reported
});
await test('the emotion model beats the baseline on held-out simulated children', async () => {
  const card = await e.handle('GET', '/api/model/card');
  assert.ok(card.top1 > card.baseline_top1 && card.top3 > card.baseline_top3, JSON.stringify(card));
  const s = await e.handle('GET', '/api/model/suggest?band=1001&rise=r30&move=still');
  assert.equal(s[0].code, 2); // Riya in Maths with a rise: ★ Worried
});
await test('response report and device health', async () => {
  const rep = await get('/api/reports/response', 'P01');
  assert.ok(rep.cases >= 10 && rep.median_response_minutes > 0 && rep.on_time_share > 0.5);
  const gws = await get('/api/gateways', 'P01');
  assert.match(gws.gateways.find((g) => g.id === 'gw-blockb').status, /No gateway heard since/);
  assert.ok(gws.bands.find((b) => b.id === 1005).low_battery);
});
console.log(`${ok} engine tests passed`);
