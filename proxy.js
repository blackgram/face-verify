// Local reverse proxy to tunnel API requests from the phone via ngrok
// Usage: node proxy.js
// Then run: ngrok http 8787

const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET = 'https://liveliness-check.dev.accessbankplc.com';
const PORT = 8787;

const server = http.createServer((req, res) => {
  const target = new URL(req.url, TARGET);
  const mod = target.protocol === 'https:' ? https : http;

  console.log(`→ ${req.method} ${req.url}`);

  const proxyReq = mod.request(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
      rejectUnauthorized: false,
    },
    (proxyRes) => {
      console.log(`← ${proxyRes.statusCode} ${req.url}`);
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    console.error(`✕ Proxy error: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log(`\n🔀 Proxy listening on http://localhost:${PORT}`);
  console.log(`   Forwarding to ${TARGET}`);
  console.log(`\n   Next: run "ngrok http ${PORT}" in another terminal`);
  console.log(`   Then set EXPO_PUBLIC_API_URL to the ngrok URL\n`);
});
