const fs = require('fs'), path = require('path');
function walk(d, acc) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, acc); }
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const hits = [];
for (const f of walk('client/src', [])) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/api\s*[<(]/.test(l) && /events/.test(l) && /method/.test(l)) hits.push(f + ':' + (i + 1) + ': ' + l.trim());
  });
}
fs.writeFileSync('_client_upd.txt', 'EVENT API CALLS WITH method IN CLIENT:\n' + (hits.join('\n') || '(none)'));
console.log('done', hits.length);
