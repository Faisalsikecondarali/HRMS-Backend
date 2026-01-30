import http from 'http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/test',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  
  res.on('end', () => {
    console.log(`Response: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`Request error: ${e.message}`);
});

req.end();
