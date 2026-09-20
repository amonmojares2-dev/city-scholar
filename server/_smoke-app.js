const { app } = require('./server');
const http = require('http');

const payload = JSON.stringify({
  email: 'test@example.com',
  password: 'TempPass1!'
});

const server = app.listen(0, () => {
  const addr = server.address();
  console.log('LISTENING', addr.port);

  const req = http.request(`http://127.0.0.1:${addr.port}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('STATUS', res.statusCode);
      console.log('BODY', data);
      server.close();
    });
  });

  req.on('error', (err) => {
    console.log('REQUEST_ERROR', err && err.message);
    server.close();
  });

  req.write(payload);
  req.end();
});