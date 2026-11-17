// Repositorio RadioRun: the Mezclador sends finished songs and routines here,
// into the table public.repositorio, which the RadioRun app reads.
//   GET                      -> everything in the repository (public, read only)
//   GET ?tipo=rutina|cancion -> only that kind
//   POST {clave, item}       -> add or update one item (needs the export key)
//   POST {clave, borrar: id} -> remove one item (needs the export key)
// The export key is the EXPORT_KEY secret; the page never stores it in code.
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = ["https://cvergaraqec-blip.github.io", "http://localhost:8099", "http://127.0.0.1:8099"];
const PREVIEW = /^https:\/\/([a-z0-9-]+\.)*(claudeusercontent\.com|claude\.ai|claude\.site)$/;
const SITES = /^https:\/\/([a-z0-9-]+--)?mezcladorrr[a-z0-9-]*\.(netlify|vercel)\.app$/;
const allowed = (o: string | null) => !o || ORIGINS.includes(o) || PREVIEW.test(o) || SITES.test(o) || o === "null";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && allowed(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

// Same length-independent compare, so the key can't be guessed by timing.
function sameKey(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const fails = new Map<string, number[]>();

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  if (req.method === "GET") {
    const tipo = new URL(req.url).searchParams.get("tipo");
    let q = db.from("repositorio").select("*").order("exportado_at", { ascending: false }).limit(500);
    if (tipo === "rutina" || tipo === "cancion") q = q.eq("tipo", tipo);
    const { data, error } = await q;
    if (error) return json({ error: "No pude leer el repositorio" }, 500, headers);
    return json(data, 200, headers);
  }
  if (req.method !== "POST") return json({ error: "Usa GET o POST" }, 405, headers);
  if (origin && !allowed(origin)) return json({ error: "Origen no permitido" }, 403, headers);

  const key = Deno.env.get("EXPORT_KEY") || "";
  if (!key) return json({ error: "Falta configurar la clave de exportación (EXPORT_KEY) en Supabase" }, 503, headers);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now();
  const recent = (fails.get(ip) || []).filter((t) => now - t < 600_000);
  if (recent.length >= 10) return json({ error: "Demasiados intentos con clave equivocada. Espera unos minutos." }, 429, headers);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Petición no válida" }, 400, headers); }
  if (!sameKey(String(body?.clave || ""), key)) {
    recent.push(now); fails.set(ip, recent);
    return json({ error: "Clave de exportación incorrecta" }, 401, headers);
  }

  if (body.borrar) {
    const { error } = await db.from("repositorio").delete().eq("id", String(body.borrar).slice(0, 80));
    if (error) return json({ error: "No pude borrar" }, 500, headers);
    return json({ ok: true }, 200, headers);
  }

  const it = body.item || {};
  const tipo = it.tipo === "rutina" ? "rutina" : it.tipo === "cancion" ? "cancion" : "";
  const id = String(it.id || "").slice(0, 80);
  const nombre = String(it.nombre || "").trim().slice(0, 80);
  if (!tipo || !id || !nombre || typeof it.datos !== "object" || !it.datos) return json({ error: "Faltan datos del tema" }, 400, headers);
  const datos = JSON.stringify(it.datos);
  if (datos.length > 200_000) return json({ error: "El tema es demasiado grande" }, 413, headers);
  const row = {
    id: tipo + ":" + id.replace(/^(rutina|cancion):/, ""),
    tipo, nombre,
    estilo: it.estilo ? String(it.estilo).slice(0, 60) : null,
    bpm: Number.isFinite(+it.bpm) ? Math.round(+it.bpm) : null,
    duracion_seg: Number.isFinite(+it.duracion_seg) ? Math.round(+it.duracion_seg) : null,
    datos: it.datos,
    creditos: Array.isArray(it.creditos) ? it.creditos.slice(0, 50) : [],
    exportado_at: new Date().toISOString(),
  };
  const { error } = await db.from("repositorio").upsert(row, { onConflict: "id" });
  if (error) { console.error(error.message); return json({ error: "No pude guardar en el repositorio" }, 500, headers); }
  return json({ ok: true, id: row.id, exportado_at: row.exportado_at }, 200, headers);
});
