const dotenv = require('dotenv');
dotenv.config({ path: './.env' });

const { startServer } = require('./server');
const http = require('http');

let server;
let listeningPort;

function request(path) {
  return new Promise((resolve) => {
    const payload = path.includes('/auth/login')
      ? JSON.stringify({ email: 'test@example.com', password: 'TempPass1!' })
      : null;

    const headers = { Accept: 'application/json' };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      `http://127.0.0.1:${listeningPort}${path}`,
      {
        method: payload ? 'POST' : 'GET',
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          console.log(`${path} -> STATUS ${res.statusCode} BODY ${data}`);
          resolve();
        });
      }
    );

    req.on('error', (err) => {
      console.log(`${path} -> REQUEST_ERROR ${err && err.message}`);
      resolve();
    });

    if (payload) req.write(payload);
    req.end();
  });
}

startServer()
  .then((srv) => {
    server = srv;
    const addr = server && server.address();
    listeningPort = addr && addr.port;
    console.log('PORT', listeningPort || 'NOT_LISTENING');

    let mongoose;
    try {
      mongoose = require('mongoose');
    } catch (e) {
      mongoose = null;
    }

    console.log(
      'MONGO_STATE_AFTER',
      mongoose ? mongoose.connection.readyState : 'no-mongoose',
      mongoose && mongoose.connection.host || 'none'
    );

    return Promise.all([
      request('/api/barangays'),
      request('/api/auth/login'),
    ]);
  })
  .catch((err) => {
    console.log('START_SERVER_FAILED', err && err.message);
  })
  .finally(() => {
    if (server) server.close();
  });
