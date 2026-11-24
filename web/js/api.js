// One API for the whole web app. "live" talks to the FastAPI server and the gateway
// processes; "demo" runs the in-browser copy of the server (engine.js) so the hosted link
// works on its own. Views never know which one they are using.
import { Engine, HttpError } from './engine.js';
import { GATEWAYS } from './content.js';

// Live mode: one gateway process per place on the school map, on ports 8081-8087 (see run_local.sh).
// gw-blockb is deliberately not started (it shows as a silent gateway), so the virtual band never tries it.
export const LIVE_GATEWAYS = GATEWAYS.map((g, i) => ({ id: g.id, label: g.name[0], url: `http://localhost:${8081 + i}` })).filter((g) => g.id !== 'gw-blockb');
export const DEMO_GATEWAYS = GATEWAYS.map((g) => ({ id: g.id, label: g.name[0] }));

class Api {
  async init() {
    this.mode = 'demo';
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch('api/config', { signal: ctl.signal }); clearTimeout(t);
      // The band-only v2 rules need a v2 server; the FastAPI backend in this repo still speaks v1.
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) { const cfg = await r.json(); if (String(cfg.version || '').startsWith('2')) { this.config = cfg; this.mode = 'live'; } }
    } catch { /* no server: use the in-browser engine */ }
    if (this.mode === 'demo') {
      this.engine = new Engine(); await this.engine.seed();
      this.config = { demo_mode: true, version: '2.0.0', engine: 'in-browser' };
      setInterval(() => this.engine.tick(), 1000);
    }
    this.gateways = this.mode === 'live' ? LIVE_GATEWAYS : DEMO_GATEWAYS;
    return this;
  }

  async call(method, path, body, token) {
    if (this.mode === 'demo') {
      try { return structuredClone(await this.engine.handle(method, `/api${path}`, body || {}, token)); } catch (e) {
        if (e instanceof HttpError) throw Object.assign(new Error(e.message), { status: e.status });
        throw e;
      }
    }
    const r = await fetch(`api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!r.ok) throw Object.assign(new Error((data && data.detail && (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail))) || r.statusText), { status: r.status });
    return data;
  }
  get(path, token) { return this.call('GET', path, null, token); }
  post(path, body, token) { return this.call('POST', path, body, token); }

  // Live updates: server-sent events in live mode, the engine's own events in demo mode.
  subscribe(token, fn) {
    if (this.mode === 'demo') return this.engine.on(fn);
    const es = new EventSource(`api/events?token=${encodeURIComponent(token)}`);
    es.onmessage = (m) => { try { fn(JSON.parse(m.data)); } catch { /* ignore */ } };
    return () => es.close();
  }
  // Staff views without a session (the demo desk clock, the band) still want to refresh.
  onAny(fn) {
    if (this.mode === 'demo') return this.engine.on(fn);
    const t = setInterval(() => fn({ type: 'poll' }), 3000); return () => clearInterval(t);
  }

  // The band's radio: the same POST /air contract as gateway/gateway.py.
  async air(gw, packetHex, rssi = null) {
    if (this.mode === 'demo') return this.engine.air(gw.id, packetHex, rssi);
    try {
      const r = await fetch(`${gw.url}/air`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packet: packetHex, rssi }) });
      return await r.json();
    } catch { return { gateway: gw.id, status: 'out_of_range', reason: 'gateway process not running' }; }
  }
  async gatewayPower(gw, on) {
    if (this.mode === 'demo') return this.engine.setPower(gw.id, on);
    try { await fetch(`${gw.url}/power`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }); } catch { /* not running */ }
  }
  async gatewayStatus(gw) {
    if (this.mode === 'demo') return { id: gw.id, paused: !this.engine.gwPower[gw.id], queued: (this.engine.gwQueue?.[gw.id] || []).length };
    try { return await (await fetch(`${gw.url}/status`)).json(); } catch { return { id: gw.id, offline: true }; }
  }
  setServerReachable(on) { if (this.mode === 'demo') return this.engine.setServer(on); }
  get canCutServer() { return this.mode === 'demo'; }
}

export const api = new Api();
