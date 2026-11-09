// Crear música con IA: the listener's words (and a YouTube video's title) go to
// Claude, which answers with a plan for the mix: style, BPM and how much each of
// the kit's instruments should carry it. The page (generador.js) turns that plan
// into the mix. The Anthropic key lives here, as the ANTHROPIC_API_KEY secret,
// never in the page.
import Anthropic from "npm:@anthropic-ai/sdk";

const LAYERS = {
  pad: "pad de fondo suave, acordes largos",
  air: "aire, olas, ambiente",
  flute: "flauta de pan, melodía tranquila",
  heartbeat: "latido grave y lento",
  shaker: "shaker, maraca",
  sub: "bajo sub",
  kick: "bombo",
  hat: "charles (hi-hat) a corcheas",
  clap: "palmas / caja",
  roll: "bajo rodante, arpegiado",
  hats16: "charles en semicorcheas",
  openhat: "charles abierto a contratiempo",
  perc: "percusión latina / congas",
  ride: "platillo ride",
  acid: "sintetizador acid 303",
  stab: "acordes stab de sintetizador",
  fill: "redobles y fills de batería",
  drive: "bombo extra, empuje techno duro",
};
// Who may call this function (the published page and local testing).
const ORIGINS = ["https://cvergaraqec-blip.github.io", "http://localhost:8099", "http://127.0.0.1:8099"];
// Preview copies of the page opened inside claude.ai (Artifacts).
const PREVIEW = /^https:\/\/([a-z0-9-]+\.)*(claudeusercontent\.com|claude\.ai|claude\.site)$/;
// Artifact previews may run in a sandboxed frame whose origin is "null".
const allowed = (o: string | null) => !!o && (ORIGINS.includes(o) || PREVIEW.test(o) || o === "null");
const MODELS = ["claude-opus-5-5", "claude-haiku-5-5"];
const MAX_PER_HOUR = 30; // per visitor IP, best effort (per instance)
const seen = new Map<string, number[]>();

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["style", "bpm", "summary", "layers"],
  properties: {
    style: { type: "string", description: "Nombre corto del estilo en español, p. ej. 'Reggaetón', 'Synthwave'" },
    bpm: { type: "integer", description: "Tempo objetivo entre 50 y 210" },
    summary: { type: "string", description: "Una frase en español para el oyente sobre la mezcla, sin nombrar ni copiar letras" },
    layers: {
      type: "array",
      description: "De 4 a 10 instrumentos del kit que mejor evocan ese estilo, en orden de importancia",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "weight"],
        properties: {
          id: { type: "string", enum: Object.keys(LAYERS) },
          weight: { type: "number", description: "Volumen relativo: 0.5 suave, 1 normal, 1.4 protagonista" },
        },
      },
    },
  },
};

const SYSTEM = `Eres el productor musical de RadioRun, una app de música adaptativa para correr.
Un oyente describe lo que le gusta (una canción, un artista, un género, un ánimo o el título de un video).
Tu trabajo es diseñar una mezcla ORIGINAL con el kit de instrumentos de la app que evoque ese estilo: tempo, energía e instrumentación.
No reproduzcas ni cites letras, melodías ni nombres de pistas protegidas; solo inspírate en el género y la energía.
Instrumentos disponibles (id: descripción):
${Object.entries(LAYERS).map(([id, d]) => `- ${id}: ${d}`).join("\n")}
Elige el BPM típico del estilo (o el que pida el oyente). Responde solo con el JSON pedido.`;

function cors(origin: string | null) {
  const ok = allowed(origin) ? origin! : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": ok,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, x-anthropic-key",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

async function youtubeTitle(id: string): Promise<string> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`);
    if (!r.ok) return "";
    const d = await r.json();
    return [d.title, d.author_name].filter(Boolean).join(" — ").slice(0, 200);
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = cors(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, headers);
  if (!allowed(origin)) return json({ error: "Origen no permitido" }, 403, headers);

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const now = Date.now();
  const hits = (seen.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= MAX_PER_HOUR) return json({ error: "Demasiadas mezclas seguidas. Prueba en un rato." }, 429, headers);
  hits.push(now); seen.set(ip, hits);

  let text = "", youtubeId = "", model = MODELS[0];
  try {
    const body = await req.json();
    text = String(body.text || "").slice(0, 300);
    youtubeId = /^[\w-]{11}$/.test(body.youtubeId || "") ? body.youtubeId : "";
    if (MODELS.includes(body.model)) model = body.model;
  } catch {
    return json({ error: "Petición no válida" }, 400, headers);
  }
  if (!text.trim() && !youtubeId) return json({ error: "Falta el texto" }, 400, headers);
  const video = youtubeId ? await youtubeTitle(youtubeId) : "";

  // The visitor's own key (from the page's "Ajustes de la IA") if given, else
  // the ANTHROPIC_API_KEY secret. Never stored or logged.
  const own = (req.headers.get("x-anthropic-key") || "").trim();
  const apiKey = own || Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!apiKey) return json({ error: "falta la clave de Anthropic" }, 503, headers);
  const client = new Anthropic({ apiKey });
  try {
    const res = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      // Server-side fallback exists for Opus, not for Haiku.
      ...(model === "claude-opus-5-5" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `Lo que pide el oyente: ${text.replace(/https?:\/\/\S+/g, "").trim() || "(solo envió un link)"}` +
          (video ? `\nTítulo y canal del video de YouTube que compartió: ${video}` : ""),
      }],
    } as any);
    if (res.stop_reason === "refusal") return json({ error: "La IA no pudo crear esta mezcla." }, 422, headers);
    const block = res.content.find((b: any) => b.type === "text") as any;
    const plan = JSON.parse(block?.text || "{}");
    return json({ plan, video }, 200, headers);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "la clave de Anthropic no es válida" }, 401, headers);
    if (e instanceof Anthropic.PermissionDeniedError) return json({ error: "la clave no tiene permiso o la cuenta no tiene saldo" }, 403, headers);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Anthropic pidió esperar un momento" }, 429, headers);
    if (e instanceof Anthropic.BadRequestError) { console.error(String((e as Error).message)); return json({ error: "la cuenta de Anthropic no tiene saldo o la petición no es válida" }, 400, headers); }
    console.error(String((e as Error)?.message || e));
    return json({ error: "la IA no respondió" }, 502, headers);
  }
});
