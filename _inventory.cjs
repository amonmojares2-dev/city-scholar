// ==========================================
// Portal audit: static/fake data + dead buttons
//
// Scans every page in the city / barangay / superadmin portals and reports:
//   * top-level constant arrays/objects (the "fake data" containers)
//   * which API endpoints each page already calls
//   * <button> elements with no onClick (dead controls)
//   * inline lookalike handlers (console.log stubs, empty bodies)
//
// Output is written to _inventory.txt for review.
// ==========================================
const fs = require('fs');
const path = require('path');

const root = 'c:/Users/amonm/city-scholar/client/src/Pages';
const portals = ['city', 'barangay', 'superadmin'];
const out = [];

for (const portal of portals) {
    const dir = path.join(root, portal);
    out.push('\n' + '='.repeat(70) + '\nPORTAL: ' + portal + '\n' + '='.repeat(70));
    for (const file of fs.readdirSync(dir).sort()) {
        if (!file.endsWith('.tsx')) continue;
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        const lines = raw.split(/\r?\n/);
        out.push('\n### ' + portal + '/' + file + '  (' + lines.length + ' lines)');

        // API usage
        const endpoints = new Set();
        const re = /(['"`])(\/[a-z0-9/:_-]*)\1/gi;
        let m;
        while ((m = re.exec(raw))) {
            if (m[2].startsWith('/api') || /^\/[a-z]/.test(m[2])) endpoints.add(m[2]);
        }
        const apiCalls = (raw.match(/api</g) || []).length;
        out.push('  api<T> calls: ' + apiCalls + ' | path literals: ' + [...endpoints].join(', '));

        // Top-level static data containers: const NAME = [ { ... } ] or { ... }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const decl = /^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*(\[|\{)/.exec(line);
            if (!decl) continue;
            if (decl[1].toUpperCase() === decl[1] && decl[1].length <= 2) continue; // skip single letters
            // measure the block
            let depth = 0;
            let end = i;
            for (let j = i; j < lines.length; j++) {
                depth += (lines[j].match(/[[{]/g) || []).length;
                depth -= (lines[j].match(/[\]}]/g) || []).length;
                if (depth <= 0 && j > i) { end = j; break; }
                if (depth <= 0 && j === i) { end = i; break; }
            }
            const size = end - i + 1;
            const opener = decl[2];
            // only flag containers that look like data records
            const body = lines.slice(i, end + 1).join('\n');
            const recordish = opener === '[' ? /[{[]/.test(body.slice(line.length)) : /:\s*[{'"]/.test(body);
            const tag = recordish && size >= 3 ? 'STATIC-DATA' : 'const';
            if (tag === 'STATIC-DATA' || size > 25) {
                out.push(`  [${tag}] line ${i + 1}: ${decl[1]} (${size} lines)`);
            }
        }

        // Dead buttons
        for (let i = 0; i < lines.length; i++) {
            if (!/<button/.test(lines[i])) continue;
            let j = i;
            let depth = 0;
            let block = '';
            for (; j < lines.length && j < i + 30; j++) {
                block += lines[j] + '\n';
                depth += (lines[j].match(/</g) || []).length;
                depth -= (lines[j].match(/>/g) || []).length;
                if (/<\/button>/.test(lines[j]) || (depth <= 0 && j > i)) break;
            }
            if (/onClick/.test(block)) continue;
            out.push(`  [DEAD-BUTTON] line ${i + 1}: ${lines[i].trim().slice(0, 90)}`);
        }

        // Stub handlers
        lines.forEach((line, i) => {
            if (/onClick=\{\(\)\s*=>\s*\{?\s*\}?\s*\}/.test(line) || /console\.log\(/.test(line) && /=>/.test(line) && /onClick|onChange|onSubmit/.test(line)) {
                out.push(`  [STUB-HANDLER] line ${i + 1}: ${line.trim().slice(0, 90)}`);
            }
            if (/disabled(=\{true\})?/.test(line) && /<button/.test(line)) {
                out.push(`  [DISABLED-BUTTON] line ${i + 1}: ${line.trim().slice(0, 90)}`);
            }
        });
    }
}

fs.writeFileSync('c:/Users/amonm/city-scholar/_inventory.txt', out.join('\n'));
console.log('wrote _inventory.txt');
