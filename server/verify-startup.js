const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');

process.chdir(__dirname);
process.env.PORT = '4173';
const output = path.join(__dirname, 'startup-verification-result.log');
const lines = [];
let server;
let mongoose;
let finished = false;

function record(message) {
    lines.push(message);
    fs.writeFileSync(output, lines.join('\n') + '\n');
    console.log(message);
}

const deadline = setTimeout(() => {
    record('FAIL: verification exceeded 25 seconds.');
    process.exit(1);
}, 25000);

async function main() {
    record('START: isolated verification on http://127.0.0.1:4173');
    try {
        const { startServer } = require('./server');
        mongoose = require('mongoose');
        server = await startServer();
        if (!server) throw new Error('startServer returned without listening: database connection failed (see captured console output).');
        if (!server.listening) await once(server, 'listening');
        record('LISTENING: ' + JSON.stringify(server.address()));
        record('DATABASE readyState: ' + mongoose.connection.readyState);
        for (const endpoint of ['/', '/api/barangays']) {
            const response = await fetch('http://127.0.0.1:4173' + endpoint, {
                signal: AbortSignal.timeout(5000)
            });
            const body = await response.text();
            record('GET ' + endpoint + ' -> ' + response.status);
            // Record the response shape/count rather than all database records.
            let json;
            try { json = JSON.parse(body); } catch { throw new Error('Non-JSON response: ' + body.slice(0, 500)); }
            record('RESPONSE: ' + JSON.stringify({
                keys: Object.keys(json),
                success: json.success,
                message: json.message,
                barangayCount: Array.isArray(json.barangays) ? json.barangays.length : undefined
            }));
            if (!response.ok) throw new Error(endpoint + ' returned HTTP ' + response.status + ': ' + body.slice(0, 500));
        }
        record('PASS: both routes returned successful JSON responses.');
    } catch (error) {
        record('FAIL: ' + (error.stack || String(error)));
        process.exitCode = 1;
    } finally {
        if (server?.listening) {
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
        if (mongoose) await mongoose.disconnect();
        finished = true;
        clearTimeout(deadline);
        record('CLEANUP: test server closed and database disconnected.');
    }
}

main().catch(error => {
    record('CLEANUP FAILURE: ' + (error.stack || String(error)));
    process.exitCode = 1;
    if (finished) clearTimeout(deadline);
});
