import http from 'node:http';

const TARGET_HOST = process.env.PROXY_TARGET_HOST || 'rest';
const TARGET_PORT = parseInt(process.env.PROXY_TARGET_PORT || '3000', 10);
const PROFILE = process.env.MCP_PROFILE || 'coco';
const LISTEN_PORT = parseInt(process.env.PROXY_PORT || '3001', 10);

const server = http.createServer((req, res) => {
  // Strip /rest/v1/ prefix — PostgREST routes by Accept-Profile/Content-Profile
  const path = req.url.replace(/^\/rest\/v1\//, '/');

  const headers = { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` };

  // Inject profile headers (Supabase Kong does this in production)
  if (!headers['accept-profile']) headers['accept-profile'] = PROFILE;
  if (!headers['content-profile']) headers['content-profile'] = PROFILE;

  const proxy = http.request(
    { hostname: TARGET_HOST, port: TARGET_PORT, path, method: req.method, headers },
    (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    },
  );

  proxy.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `proxy error: ${err.message}` }));
  });

  req.pipe(proxy);
});

server.listen(LISTEN_PORT, () => {
  console.log(`rest-proxy :${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT}, profile=${PROFILE}`);
});
