// Mezclador: decides in which BPM range each instrument of RadioRun's adaptive
// music plays, and how loud, with a live preview.
// Run: node server.cjs   → open http://localhost:8099   (no install needed)
//
// The page also works without this server, on any static host (GitHub Pages):
// there "Guardar" keeps the mix in the browser and downloads mix.json.
// With this server, "Guardar" writes the changes to mix.json in this folder. The server only
// listens on this computer (127.0.0.1).
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = __dirname;
const PAGE = path.join(ROOT, 'index.html');
const SONG = path.join(ROOT, 'song.json');
const MIX = path.join(ROOT, 'mix.json');
const KIT = path.join(ROOT, 'kit');
const PORT = Number(process.env.PORT) || 8099;
const MIN_BPM = 40;
const MAX_BPM = 220;

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const isRange = (r) =>
  Array.isArray(r) && r.length === 2 && r.every((b) => Number.isInteger(b) && b >= MIN_BPM && b <= MAX_BPM) && r[0] <= r[1];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Keeps only valid changes ({layerId: {in, out, gain}}) that differ from song.json. */
function cleanMix(input, layers) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const l of layers) {
    const m = input[l.id];
    if (!m || typeof m !== 'object') continue;
    const entry = {};
    if (isRange(m.in)) entry.in = [...m.in];
    if (m.out === null) entry.out = null;
    else if (isRange(m.out) && m.out[0] >= (entry.in || l.in)[1]) entry.out = [...m.out];
    if (typeof m.gain === 'number' && m.gain >= 0 && m.gain <= 1.5) entry.gain = Math.round(m.gain * 1000) / 1000;
    if ('in' in entry && same(entry.in, l.in)) delete entry.in;
    if ('out' in entry && same(entry.out, l.out)) delete entry.out;
    if ('gain' in entry && entry.gain === l.gain) delete entry.gain;
    if (Object.keys(entry).length) out[l.id] = entry;
  }
  return out;
}

function send(res, status, type, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(PAGE));
  }
  if (req.method === 'GET' && url.pathname === '/song.json') {
    // X-Mezclador tells the page it can save mix.json through this server.
    return send(res, 200, 'application/json', fs.readFileSync(SONG), { 'X-Mezclador': 'server' });
  }
  if (req.method === 'GET' && url.pathname === '/mix.json') {
    if (!fs.existsSync(MIX)) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, 'application/json', fs.readFileSync(MIX));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/kit/')) {
    const name = path.basename(url.pathname);
    const file = path.join(KIT, name);
    if (!/^[a-z0-9-]+\.wav$/.test(name) || !fs.existsSync(file)) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, 'audio/wav', fs.readFileSync(file));
  }
  if (req.method === 'POST' && url.pathname === '/api/mix') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 100_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const mix = cleanMix(JSON.parse(body || '{}'), readJson(SONG, { layers: [] }).layers);
        if (Object.keys(mix).length) fs.writeFileSync(MIX, JSON.stringify(mix, null, 2) + '\n');
        else if (fs.existsSync(MIX)) fs.rmSync(MIX);
        send(res, 200, 'application/json', JSON.stringify({ ok: true, mix }));
      } catch (e) {
        send(res, 400, 'application/json', JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }
  send(res, 404, 'text/plain', 'Not found');
}

if (require.main === module) {
  http.createServer(handle).listen(PORT, '127.0.0.1', () => {
    console.log(`Mezclador: http://localhost:${PORT}  (Ctrl+C para cerrar)`);
  });
}

module.exports = { cleanMix, handle };
