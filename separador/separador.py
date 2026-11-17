"""Separador de instrumentos del Mezclador RadioRun (corre en tu PC).

Recibe una canción libre (Incompetech / Jamendo) y la separa con Demucs en
4 pistas: voz, batería, bajo y otros. El Mezclador (http://localhost:8099)
las carga como canales separados en la Mesa y el Editor secuencial.

  POST /separar  {"url": "..."}  -> {"id": "...", "stems": {"voz": "/stems/<id>/voz.mp3", ...}}
  GET  /stems/<id>/<pista>.mp3   -> el archivo
  GET  /estado                   -> {"ok": true}

Solo acepta canciones de las fuentes que usa el Mezclador, y solo responde a
páginas del propio Mezclador.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("SEPARADOR_PORT", "8097"))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "pistas")
ORIGINS = re.compile(r"^(http://(localhost|127\.0\.0\.1):\d+|https://([a-z0-9-]+--)?mezcladorrr[a-z0-9-]*\.(vercel|netlify)\.app|null)$")
HOSTS = re.compile(r"(^|\.)(kjakeluquwhmdvpesroj\.supabase\.co|jamendo\.com|incompetech\.com|openverse\.org|wikimedia\.org|freesound\.org|ccmixter\.org|localhost|127\.0\.0\.1)$")
NAMES = {"vocals": "voz", "drums": "bateria", "bass": "bajo", "other": "otros"}
LOCK = threading.Lock()  # one separation at a time: Demucs uses all the CPU


def separate(url):
    host = urllib.parse.urlparse(url).hostname or ""
    if not HOSTS.search(host):
        raise ValueError("Esa canción no viene de una fuente permitida")
    sid = hashlib.sha1(url.encode()).hexdigest()[:16]
    dest = os.path.join(OUT, sid)
    if all(os.path.exists(os.path.join(dest, n + ".mp3")) for n in NAMES.values()):
        return sid  # already separated before
    with LOCK:
        tmp = tempfile.mkdtemp(prefix="sep-")
        try:
            src = os.path.join(tmp, "cancion.mp3")
            req = urllib.request.Request(url, headers={"User-Agent": "MezcladorRadioRun/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(src, "wb") as f:
                shutil.copyfileobj(r, f)
            cmd = [sys.executable, "-m", "demucs", "-n", "htdemucs", "--mp3", "--mp3-bitrate", "192", "-o", tmp, src]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if p.returncode != 0:
                raise RuntimeError("Demucs falló: " + (p.stderr or p.stdout)[-400:])
            made = os.path.join(tmp, "htdemucs", "cancion")
            os.makedirs(dest, exist_ok=True)
            for en, es in NAMES.items():
                shutil.move(os.path.join(made, en + ".mp3"), os.path.join(dest, es + ".mp3"))
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    return sid


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        o = self.headers.get("Origin") or ""
        if ORIGINS.match(o):
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Vary", "Origin")

    def reply(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        if self.path == "/estado":
            return self.reply(200, {"ok": True})
        m = re.match(r"^/stems/([0-9a-f]{16})/(voz|bateria|bajo|otros)\.mp3$", self.path)
        if not m:
            return self.reply(404, {"error": "No existe"})
        f = os.path.join(OUT, m.group(1), m.group(2) + ".mp3")
        if not os.path.exists(f):
            return self.reply(404, {"error": "No existe"})
        with open(f, "rb") as fh:
            self.reply(200, fh.read(), "audio/mpeg")

    def do_POST(self):
        if self.path != "/separar":
            return self.reply(404, {"error": "No existe"})
        o = self.headers.get("Origin")
        if o and not ORIGINS.match(o):
            return self.reply(403, {"error": "Origen no permitido"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            url = str(json.loads(self.rfile.read(min(n, 10000)) or b"{}").get("url") or "")
            sid = separate(url)
            self.reply(200, {"id": sid, "stems": {es: f"/stems/{sid}/{es}.mp3" for es in NAMES.values()}})
        except Exception as e:  # report the reason to the page, in Spanish
            self.reply(500, {"error": str(e)[:500]})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print(f"Separador listo en http://localhost:{PORT}  (deja esta ventana abierta)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
