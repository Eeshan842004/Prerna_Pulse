// Vercel build step: put the static site in ./public whether the project root is the repo
// (the site is in ./web) or the web folder itself (the site is in .).
const fs = require('fs');
const path = require('path');
const src = fs.existsSync('web/index.html') ? 'web' : '.';
fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync('public');
const skip = new Set(['public', 'node_modules', '.git', '.vercel', 'build-site.js', 'vercel.json']);
for (const name of fs.readdirSync(src)) {
  if (skip.has(name)) continue;               // copy each child, never the folder into itself
  fs.cpSync(path.join(src, name), path.join('public', name), { recursive: true });
}
if (!fs.existsSync('public/index.html')) { console.error('index.html not found in', src); process.exit(1); }
console.log(`site copied from "${src}" to "public": ${fs.readdirSync('public').join(', ')}`);
