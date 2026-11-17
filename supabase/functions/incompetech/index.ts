// Incompetech (Kevin MacLeod, CC BY 4.0) inside the Mezclador.
// incompetech.com sends no CORS headers, so the page can't read its catalog or
// decode its MP3s by itself. This function does two things, nothing more:
//   GET ?list            -> the catalog, trimmed to what the page shows
//   GET ?f=<filename>    -> that track's MP3, passed through with CORS
// Only filenames that are in the catalog are fetched, so it is not an open proxy.
const BASE = "https://incompetech.com/music/royalty-free/";
const ORIGINS = ["https://cvergaraqec-blip.github.io", "http://localhost:8099", "http://127.0.0.1:8099"];
const PREVIEW = /^https:\/\/([a-z0-9-]+\.)*(claudeusercontent\.com|claude\.ai|claude\.site)$/;
const allowed = (o: string | null) => !o || ORIGINS.includes(o) || PREVIEW.test(o) || o === "null";

type Piece = { title: string; filename: string; length: string; bpm: string; feel: string; instruments: string; description: string; isrc: string; collection: string | null };
type Track = { t: string; f: string; s: number; b: number; feel: string; ins: string; d: string; i: string; g: string };
let cache: { at: number; tracks: Track[]; files: Set<string> } | null = null;

const secs = (l: string) => (l || "").split(":").reduce((a, x) => a * 60 + (Number(x) || 0), 0);
async function catalog() {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache;
  const r = await fetch(BASE + "pieces.json", { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error("catalog " + r.status);
  const pieces = (await r.json()) as Piece[];
  // Collection names ("Funk and Blues", "Rock Classic"…) work as the genre.
  const names: Record<string, string> = {};
  try {
    const c = await fetch(BASE + "collections.json", { signal: AbortSignal.timeout(10000) });
    if (c.ok) for (const x of (await c.json()) as { id: string; collection_name: string }[]) names[x.id] = x.collection_name;
  } catch { /* genres are optional */ }
  const tracks = pieces.filter((p) => p.filename && p.title).map((p) => ({
    t: p.title, f: p.filename, s: secs(p.length), b: Number(p.bpm) || 0,
    feel: p.feel || "", ins: p.instruments || "", d: (p.description || "").slice(0, 160), i: p.isrc || "", g: (p.collection && names[p.collection]) || "",
  }));
  cache = { at: Date.now(), tracks, files: new Set(tracks.map((x) => x.f)) };
  return cache;
}

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowed(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return new Response("Usa GET", { status: 405, headers });
  if (!allowed(origin)) return new Response("Origen no permitido", { status: 403, headers });
  const url = new URL(req.url);
  try {
    const c = await catalog();
    if (url.searchParams.has("list")) {
      return new Response(JSON.stringify(c.tracks), {
        headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=21600" },
      });
    }
    const f = url.searchParams.get("f") || "";
    if (!c.files.has(f)) return new Response("No está en el catálogo", { status: 404, headers });
    const r = await fetch(BASE + "mp3-royaltyfree/" + encodeURIComponent(f), { signal: AbortSignal.timeout(30000) });
    if (!r.ok || !r.body) return new Response("Incompetech no respondió", { status: 502, headers });
    return new Response(r.body, {
      headers: { ...headers, "Content-Type": "audio/mpeg", "Cache-Control": "public, max-age=86400",
        ...(r.headers.get("content-length") ? { "Content-Length": r.headers.get("content-length")! } : {}) },
    });
  } catch (e) {
    console.error(String((e as Error)?.message || e));
    return new Response("Incompetech no respondió", { status: 502, headers });
  }
});
