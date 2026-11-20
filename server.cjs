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
const os = require('os');
const crypto = require('crypto');

const ROOT = __dirname;
const PAGE = path.join(ROOT, 'index.html');
const SONG = path.join(ROOT, 'song.json');
const MIX = path.join(ROOT, 'mix.json');
const KIT = path.join(ROOT, 'kit');
const PORT = Number(process.env.PORT) || 8099;
const MIN_BPM = 40;
const MAX_BPM = 220;

// Repositorio: each exported song or routine is a JSON file in a folder, plus
// indice.json with all of them (what the RadioRun app will read later). The
// folder goes inside Google Drive for desktop when it is installed, so it syncs;
// otherwise on the Desktop. MEZCLADOR_REPO can point it anywhere else.
function repoDir() {
  if (process.env.MEZCLADOR_REPO) return process.env.MEZCLADOR_REPO;
  const home = os.homedir();
  const drives = ['G:\\Mi unidad', 'G:\\My Drive', path.join(home, 'Google Drive', 'Mi unidad'), path.join(home, 'Google Drive', 'My Drive'), path.join(home, 'Google Drive'), path.join(home, 'Mi unidad'), path.join(home, 'My Drive')];
  for (const d of drives) { try { if (fs.statSync(d).isDirectory()) return path.join(d, 'RadioRun-repositorio'); } catch {} }
  return path.join(home, 'Desktop', 'RadioRun-repositorio');
}
const REPO_KINDS = { rutina: 'rutinas', cancion: 'canciones' };
const safeId = (id) => String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
function repoList(dir) {
  const out = [];
  for (const [tipo, sub] of Object.entries(REPO_KINDS)) {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (!f.endsWith('.json')) continue;
      try { const x = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); if (x && x.tipo === tipo) out.push(x); } catch {}
    }
  }
  return out.sort((a, b) => String(b.exportado_at).localeCompare(String(a.exportado_at)));
}
function writeIndex(dir) {
  const items = repoList(dir);
  fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify({ version: 1, actualizado: new Date().toISOString(), items }, null, 2) + '\n');
  return items;
}

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

function send(res, status, type, body) {
  // X-Mezclador tells the page it can save mix.json through this server (not for a visitor
  // through the tunnel: they can listen and try, but not change Carlos's files).
  const h = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (!res.remote) h['X-Mezclador'] = 'server';
  res.writeHead(status, h);
  res.end(body);
}

// Sharing through a tunnel (cloudflared → 127.0.0.1:8099). A request that comes through it
// carries cf-connecting-ip or a Host that isn't this PC, and must give the password. The
// password is created once on this PC (~/.mezclador-clave); Tunel.ps1 writes it, with the
// link, to the Desktop file for the partner. Nobody else ever sees it.
const SHARE_USER = 'radiorun';
const KEY_FILE = path.join(os.homedir(), '.mezclador-clave');
function sharePassword() {
  try { const k = fs.readFileSync(KEY_FILE, 'utf8').trim(); if (k.length >= 8) return k; } catch {}
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const k = Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join('');
  fs.writeFileSync(KEY_FILE, k + '\n', { mode: 0o600 });
  return k;
}
const isRemote = (req) => Boolean(req.headers['cf-connecting-ip']) || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '');
function passwordOk(req) {
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const [user, ...rest] = Buffer.from(m[1], 'base64').toString('utf8').split(':');
  if (user.trim().toLowerCase() !== SHARE_USER) return false;
  const given = Buffer.from(rest.join(':').trim().toLowerCase()); // phones capitalize the first letter
  const want = Buffer.from(sharePassword());
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

// The separator (port 8097) is only reachable on this PC, so a visitor's page uses /sep/… here.
// Separating takes minutes and the tunnel cuts a request after ~100 s, so /sep/separar answers
// 202 "still working" after 60 s and the page asks again; the same song joins the same job.
const SEP_PORT = Number(process.env.SEPARADOR_PORT) || 8097;
const sepJobs = new Map();
function sepRequest(method, p, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: SEP_PORT, method, path: p, headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {} }, (up) => {
      const chunks = []; up.on('data', (c) => chunks.push(c)); up.on('end', () => resolve({ status: up.statusCode, type: up.headers['content-type'] || 'application/octet-stream', body: Buffer.concat(chunks) }));
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}
function sepProxy(req, res, url) {
  const p = url.pathname.slice(4);
  const fail = () => send(res, 502, 'application/json', JSON.stringify({ error: 'El separador no está abierto en el PC del Mezclador.' }));
  if (req.method === 'GET' && (p === '/estado' || /^\/stems\/[0-9a-f]{16}\/(voz|bateria|bajo|otros)\.mp3$/.test(p))) {
    return sepRequest('GET', p).then((r) => send(res, r.status, r.type, r.body), fail);
  }
  if (req.method === 'POST' && p === '/separar') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy(); });
    req.on('end', () => {
      let key; try { key = String(JSON.parse(body || '{}').url || ''); } catch { key = ''; }
      if (!key) return send(res, 400, 'application/json', JSON.stringify({ error: 'Falta la canción' }));
      let job = sepJobs.get(key);
      if (!job) {
        job = sepRequest('POST', '/separar', JSON.stringify({ url: key }));
        sepJobs.set(key, job);
        job.then(() => setTimeout(() => sepJobs.delete(key), 600_000), () => sepJobs.delete(key));
      }
      const wait = new Promise((r) => setTimeout(() => r(null), 60_000));
      Promise.race([job, wait]).then((r) => {
        if (!r) return send(res, 202, 'application/json', JSON.stringify({ pendiente: true }));
        send(res, r.status, r.type, r.body);
      }, fail);
    });
    return;
  }
  send(res, 404, 'text/plain', 'Not found');
}

function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (isRemote(req)) {
    res.remote = true;
    if (!passwordOk(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Mezclador RadioRun", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Pide la clave a quien te compartió el Mezclador.');
    }
    if (req.method !== 'GET' && !url.pathname.startsWith('/sep/')) {
      return send(res, 403, 'application/json', JSON.stringify({ ok: false, error: 'esto solo se puede hacer en el PC del Mezclador' }));
    }
  }
  if (url.pathname.startsWith('/sep/')) return sepProxy(req, res, url);
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(PAGE));
  }
  if (req.method === 'GET' && url.pathname === '/generador.js') {
    return send(res, 200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(ROOT, 'generador.js')));
  }
  if (req.method === 'GET' && url.pathname === '/song.json') {
    return send(res, 200, 'application/json', fs.readFileSync(SONG));
  }
  if (req.method === 'GET' && url.pathname === '/mix.json') {
    if (!fs.existsSync(MIX)) return send(res, 404, 'text/plain', 'Not found');
    return send(res, 200, 'application/json', fs.readFileSync(MIX));
  }
  if (req.method === 'GET' && url.pathname === '/api/song') {
    const { layers } = readJson(SONG, { layers: [] });
    return send(res, 200, 'application/json', JSON.stringify({ layers, mix: cleanMix(readJson(MIX, {}), layers) }));
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
  if (url.pathname === '/api/repo') {
    const dir = repoDir();
    if (req.method === 'GET') return send(res, 200, 'application/json', JSON.stringify({ carpeta: res.remote ? 'RadioRun-repositorio (en el PC del Mezclador)' : dir, items: repoList(dir) }));
    if (req.method === 'POST') {
      // Only this page may write: same origin and JSON (other sites can't send that without asking first).
      const origin = req.headers.origin;
      if ((origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) || !/^application\/json/.test(req.headers['content-type'] || '')) return send(res, 403, 'application/json', JSON.stringify({ ok: false, error: 'no permitido' }));
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
      req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}');
          if (d.borrar) {
            const sub = REPO_KINDS[d.borrar.tipo], id = safeId(d.borrar.id);
            if (!sub || !id) throw new Error('falta qué borrar');
            fs.rmSync(path.join(dir, sub, id + '.json'), { force: true });
          } else {
            const x = d.item, sub = x && REPO_KINDS[x.tipo], id = x && safeId(x.id);
            if (!sub || !id || !x.nombre) throw new Error('datos incompletos');
            fs.mkdirSync(path.join(dir, sub), { recursive: true });
            const item = { ...x, id, nombre: String(x.nombre).slice(0, 80), exportado_at: new Date().toISOString() };
            fs.writeFileSync(path.join(dir, sub, id + '.json'), JSON.stringify(item, null, 2) + '\n');
          }
          fs.mkdirSync(dir, { recursive: true });
          const items = writeIndex(dir);
          send(res, 200, 'application/json', JSON.stringify({ ok: true, carpeta: dir, items }));
        } catch (e) {
          send(res, 400, 'application/json', JSON.stringify({ ok: false, error: String(e.message || e) }));
        }
      });
      return;
    }
  }
  send(res, 404, 'text/plain', 'Not found');
}

// The tunnel for the partner, run by this server (so nothing else has to start at login).
// tunel/ngrok.exe + ngrok-token.txt + ngrok-dominio.txt → fixed link; else tunel/cloudflared.exe →
// a link that changes. The current link, user and password go to Desktop/mezclador-radiorun.txt.
// Every minute it checks that the link answers; after 3 misses it starts the tunnel again.
// MEZCLADOR_TUNEL=0 turns it off.
function startTunnel() {
  if (process.env.MEZCLADOR_TUNEL === '0') return;
  const { spawn } = require('child_process');
  const https = require('https');
  const dir = path.join(ROOT, 'tunel');
  const f = (n) => path.join(dir, n);
  const read = (n) => { try { return fs.readFileSync(f(n), 'utf8').trim(); } catch { return ''; } };
  const exe = (n) => fs.existsSync(f(n + '.exe')) ? f(n + '.exe') : null;
  const out = path.join(os.homedir(), 'Desktop', 'mezclador-radiorun.txt');
  const log = (m) => console.log('[túnel] ' + m);
  let child = null, link = null, misses = 0;
  const write = (fixed) => {
    const lines = ['Mezclador RadioRun, para tu socio', '', 'Enlace:  ' + link, 'Usuario: ' + SHARE_USER, 'Clave:   ' + sharePassword(), '',
      fixed ? 'Este enlace es fijo: no cambia aunque reinicies el PC. Funciona mientras el PC esté encendido.' : 'Pásale estas tres líneas. El enlace funciona mientras este PC esté encendido.',
      fixed ? 'La primera vez ngrok muestra un aviso: pulsa "Visit Site" y luego pon usuario y clave.' : 'Si el PC se reinicia o el túnel se cae, el enlace cambia: este archivo se actualiza solo.',
      'Actualizado: ' + new Date().toLocaleString('es')];
    try { fs.writeFileSync(out, '\ufeff' + lines.join('\r\n') + '\r\n'); } catch (e) { log('no pude escribir ' + out + ': ' + e.message); }
  };
  function start() {
    link = null; misses = 0;
    const domain = read('ngrok-dominio.txt').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const token = read('ngrok-token.txt');
    const ng = exe('ngrok'), cf = exe('cloudflared');
    if (ng && token && domain) {
      child = spawn(ng, ['http', '--url', 'https://' + domain, '--log', 'stdout', 'http://127.0.0.1:' + PORT], { windowsHide: true, env: { ...process.env, NGROK_AUTHTOKEN: token } });
      link = 'https://' + domain; write(true); log(link);
    } else if (cf) {
      child = spawn(cf, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT], { windowsHide: true });
      const look = (b) => { const m = !link && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(b)); if (m) { link = m[0]; write(false); log(link); } };
      child.stdout.on('data', look); child.stderr.on('data', look);
    } else return;
    child.stdout.resume(); child.stderr.resume();
    child.on('error', (e) => log('no arrancó: ' + e.message));
    child.on('exit', () => { child = null; setTimeout(start, 10_000); });
  }
  setInterval(() => {
    if (!child) return;
    if (!link) { if (++misses >= 3) child.kill(); return; }
    const req = https.get(link + '/estado-tunel', { timeout: 20_000, headers: { 'ngrok-skip-browser-warning': '1' } }, (res) => {
      res.resume(); if ([200, 401, 404].includes(res.statusCode)) misses = 0; else if (++misses >= 3) child && child.kill();
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => { if (++misses >= 3 && child) child.kill(); });
  }, 60_000).unref();
  process.on('exit', () => child && child.kill());
  start();
}

if (require.main === module) {
  sharePassword();
  startTunnel();
  http.createServer(handle).listen(PORT, '127.0.0.1', () => {
    console.log(`Mezclador: http://localhost:${PORT}  (Ctrl+C para cerrar)`);
  });
}

module.exports = { cleanMix, handle };
