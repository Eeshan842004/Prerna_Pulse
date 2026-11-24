// Vercel build step: put the static site in ./public whether the project root is the repo
// (the site is in ./web) or the web folder itself (the site is in .).
const fs = require('fs');
const src = fs.existsSync('web/index.html') ? 'web' : '.';
fs.rmSync('public', { recursive: true, force: true });
fs.cpSync(src, 'public', { recursive: true, filter: (p) => !/^(public|node_modules|\.git|\.vercel)(\/|\|$)/.test(p) });
if (!fs.existsSync('public/index.html')) { console.error('index.html not found in', src); process.exit(1); }
console.log(`site copied from "${src}" to "public": ${fs.readdirSync('public').join(', ')}`);
