// Verify everything in one pass: tsc (normal + strict), vite build, server module loads.
const fs = require('fs');
const { execSync } = require('child_process');

function sh(cmd) {
    try { return { out: execSync(cmd, { cwd: 'c:/Users/amonm/city-scholar', encoding: 'utf8', timeout: 120000, stdio: ['ignore','pipe','pipe'] }), ok: true }; }
    catch (e) { return { out: (e.stdout||'') + (e.stderr||'') + String(e.message), ok: false }; }
}

const root = 'c:/Users/amonm/city-scholar';
let report = [];

// 1) TypeScript, normal
report.push('--- tsc --noEmit (normal) ---');
const t1 = sh(`cd client && node node_modules/typescript/bin/tsc --noEmit`);
report.push(t1.out || '(no output)');
report.push('exit ' + (t1.ok ? '0 (clean)' : 'non-zero -> see above'));
report.push('');

// 2) TypeScript, strict
report.push('--- tsc --noEmit --strict ---');
const t2 = sh(`cd client && node node_modules/typescript/bin/tsc --noEmit --strict`);
report.push(t2.out || '(no output)');
report.push('exit ' + (t2.ok ? '0 (clean)' : 'non-zero -> see above'));
report.push('');

// 3) Vite build
report.push('--- vite build ---');
const b = sh(`cd client && node node_modules/vite/bin/vite.js build`);
report.push(b.out || '(no output)');
report.push('exit ' + (b.ok ? '0 (built)' : 'non-zero -> see above'));
report.push('');

// 4) Server module load (no DB)
report.push('--- server module load (require server.js, no DB connect) ---');
const s = sh(`cd server && node -e "Object.defineProperty(process.env,'MONGO_URI',{value:'mongodb://127.0.0.1:27017/invalid',writable:true}); try{require('./server.js');console.log('SERVER_LOAD_OK');}catch(e){console.log('SERVER_LOAD_FAIL');console.log(e.message.split(String.fromCharCode(10))[0]);}"`);
report.push(s.out || '(no output)');
report.push('');

// 5) Explicitly require each controller that has ever thrown SyntaxError
report.push('--- require every potentially-syntax-broken controller ---');
const cs = sh(`cd server && node -e "['controllers/scholarApprovalController.js','controllers/superAdminController.js','controllers/userController.js','controllers/applicationController.js','controllers/scholarApprovalController.js'].forEach(p=>{try{require('./'+p);console.log('OK '+p);}catch(e){console.log('FAIL '+p);console.log(e.message.split(String.fromCharCode(10))[0]);}})"`);
report.push(cs.out || '(no output)');

fs.writeFileSync(root + '/_verify_now.txt', report.join('\n'), 'utf8');
console.log('wrote _verify_now.txt');
