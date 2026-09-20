const http = require('http');

const payload = JSON.stringify({
  email: 'test@example.com',
  password: 'TempPass1!'
});

const doRequest = () => {
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:5000/api/auth/login', {
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
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(payload);
    req.end();
  });
};

(async () => {
  try {
    const result = await doRequest();
    console.log('STATUS', result.statusCode);
    console.log('BODY', result.body);
  } catch (err) {
    console.log('REQUEST_ERROR', err && err.message);
  }
})();