// App shell and routing (plain #names, which the hosted viewer allows).
import { api } from './api.js';
import { h, mount, clock, helplines, avatar } from './ui.js';
import { tr, getLang, setLang, onLang } from './i18n.js';
import { storyView } from './views/story.js';
import { adultApp } from './views/apps.js';
import { homeView, tryView, techView } from './views/pages.js';

const main = document.getElementById('main');
let cleanup = null, current = null;
const ROLE_PAGE = { teacher: 'Ms Anjali Mehta', counsellor: 'Ms Farah Khan', principal: 'Mr Suresh Iyer', parent: 'Mrs Sunita Sharma' };
const NAV = [['story', '▶', 'nav_story'], ['try', '👆', 'nav_try'], ['tech', '🔧', 'nav_tech']];

function chrome(r) {
  mount(document.getElementById('nav'), ...NAV.map(([id, e, k]) => h(`a${r === id ? '.on' : ''}${id === 'story' ? '.story-link' : ''}`, { href: `#${id}` }, h('span.ne', {}, e), h('span.nl', {}, tr(k)))));
  mount(document.getElementById('tools'),
    h('div.lang', { role: 'group', 'aria-label': tr('language') },
      h(`button${getLang() === 'en' ? '.on' : ''}`, { onclick: () => setLang('en'), lang: 'en' }, 'English'),
      h(`button${getLang() === 'hi' ? '.on' : ''}`, { onclick: () => setLang('hi'), lang: 'hi' }, 'हिन्दी')),
    h(`span.mode.${api.mode}`, { title: api.mode === 'live' ? tr('mode_live_t') : tr('mode_demo_t') }, api.mode === 'live' ? `● ${tr('mode_live')}` : `● ${tr('mode_demo')}`));
  mount(document.getElementById('foot'), helplines(), h('div.small.muted', {}, tr('disclaimer')));
  document.body.dataset.route = r;
}

async function route() {
  let r = (location.hash || '#home').slice(1) || 'home';
  if (['people', 'band', 'student', 'checkin'].includes(r)) r = 'try'; // older links
  if (typeof cleanup === 'function') cleanup(); else cleanup?.cleanup?.();
  cleanup = null; current = r; chrome(r); window.scrollTo(0, 0);
  mount(main, h('div.loading', {}, '…'));
  if (r === 'story') cleanup = await storyView(main);
  else if (r === 'try') cleanup = await tryView(main);
  else if (r === 'tech') await techView(main);
  else if (ROLE_PAGE[r]) await rolePage(r);
  else homeView(main);
}

async function rolePage(role) {
  const users = await api.get('/auth/demo-users');
  const u = users.find((x) => x.name === ROLE_PAGE[role]);
  const session = await api.post('/auth/login', { user_id: u.id });
  const scroll = h('div.frame-scroll');
  mount(main, h('div.role-page.is-staff', {}, h('h1.sr-only', {}, `${tr(`role_${role}`)}: ${u.name}`), h('div.viewing', {}, avatar(u.name), h('span', {}, tr('viewing_as'), ' ', h('b', {}, u.name)), h('a.btn.ghost.sm', { href: '#try' }, tr('change'))),
    h('div.device.phone.solo', {}, h('div.frame-screen.role-screen', {}, scroll))));
  cleanup = adultApp(scroll, session);
}

// Offline support (needs https or localhost; harmless where it is not available).
try { if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch { /* not allowed */ }

onLang(() => { if (!['story', 'try'].includes(current)) route(); else chrome(current); });
(async () => {
  document.documentElement.lang = getLang();
  await api.init(); await clock.sync();
  window.prerana = api; // for test scripts and curious judges: prerana.engine.s holds the demo state
  window.addEventListener('hashchange', route);
  route();
})();
