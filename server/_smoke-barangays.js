const http = require('http');

const body = JSON.stringify({ ok: true });
const req = http.request('http://localhost:5000/api/barangays', {
  method: 'GET',
  headers: { 'Accept': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY', data);
  });
});

req.on('error', (err) => {
  console.log('REQUEST_ERROR', err.message);
});

req.end();