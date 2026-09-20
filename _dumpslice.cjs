// Dump a file in numbered 120-char slices so nothing is line-truncated.
const fs = require('fs');
const file = process.argv[2];
const start = Number(process.argv[3] || 0);
const content = fs.readFileSync(file, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let off = 0; off < line.length || off === 0; off += 120) {
        console.log((i + 1) + ':' + String(off).padStart(5) + '| ' + line.slice(off, off + 120));
    }
}
console.log('TOTAL_LINES', lines.length);
