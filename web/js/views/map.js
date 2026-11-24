// A simple school floor plan: gateway dots (traffic lights in the Devices view) and a pulsing
// SOS pin at the strongest gateway, with the trail as the child moves. Room-level, inside school only.
import { h } from '../ui.js';
import { tr, getLang } from '../i18n.js';
import { GATEWAYS, GW, gwName } from '../content.js';

const BLOCKS = [
  { x: 40, y: 28, w: 280, h: 66, k: 'map_blocka' }, { x: 6, y: 112, w: 56, h: 82, k: 'map_blockb' }, { x: 300, y: 108, w: 86, h: 66, k: 'map_lab' },
  { x: 74, y: 168, w: 150, h: 78, k: 'map_ground', green: true }, { x: 248, y: 192, w: 120, h: 56, k: 'map_office' },
];
const ns = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };

export function schoolMap({ pin = null, trail = [], status = null, compact = false, demo = null } = {}) {
  const svg = el('svg', { viewBox: '0 0 400 260', class: `school-map${compact ? ' compact' : ''}`, role: 'img', 'aria-label': pin ? tr('map_aria_pin', { place: gwName(pin, getLang()) }) : tr('map_aria') });
  for (const b of BLOCKS) {
    svg.append(el('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 10, class: b.green ? 'm-ground' : 'm-block' }));
    svg.append(el('text', { x: b.x + 8, y: b.y + 15, class: 'm-label' }, tr(b.k)));
  }
  svg.append(el('path', { d: 'M62 150 H300 M180 94 V168', class: 'm-path' }));
  if (trail.length > 1) svg.append(el('polyline', { points: trail.map((t) => `${GW[t.gw]?.x},${GW[t.gw]?.y}`).join(' '), class: 'm-trail' }));
  for (const g of GATEWAYS) {
    const st = status ? status[g.id] : null;
    svg.append(el('circle', { cx: g.x, cy: g.y, r: status ? 7 : 4.5, class: `m-gw${st === false ? ' down' : st === true ? ' up' : ''}` }));
    if (status || !compact) svg.append(el('text', { x: g.x, y: g.y + (g.y > 200 ? -10 : 18), class: 'm-gwlabel', 'text-anchor': 'middle' }, gwName(g.id, getLang()).replace(/ \(.*\)/, '')));
  }
  if (pin && GW[pin]) {
    const g = el('g', { class: 'm-pin', transform: `translate(${GW[pin].x} ${GW[pin].y})`, 'data-demo': demo });
    g.append(el('circle', { r: 22, class: 'm-pulse' }), el('circle', { r: 22, class: 'm-pulse p2' }), el('path', { d: 'M0 0 C-9 -12 -11 -16 -11 -21 A11 11 0 1 1 11 -21 C11 -16 9 -12 0 0Z', class: 'm-drop' }), el('circle', { cy: -21, r: 4.5, fill: '#fff' }));
    svg.append(g);
  }
  return h('div.map-wrap', {}, svg);
}
