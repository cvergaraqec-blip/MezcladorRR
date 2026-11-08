'use strict';
// ---- Crear música: turns what a listener likes (a song, an artist, a genre or a
// YouTube link) into a mix of the 18 layers of song.json. Rule based and offline:
// it reads genres, moods, tempo words and a few known artists from the text, and
// never downloads or copies the song it is given. The same text always gives the
// same mix. Works in the browser (window.Generador) and in Node (module.exports).
(function (root) {
  // Layer weights per style: which instruments carry it (1 = as in song.json).
  const GENRES = {
    reggaeton: { name: 'Reggaetón', bpm: 95, layers: { kick: 1.2, clap: 1.2, shaker: 1.1, sub: 1.3, perc: 1.1, hat: 0.9, pad: 0.6 } },
    dembow: { name: 'Dembow', bpm: 118, layers: { kick: 1.3, clap: 1.2, perc: 1.3, shaker: 1, sub: 1.2, hats16: 0.8 } },
    trap: { name: 'Trap', bpm: 140, layers: { kick: 1.2, hats16: 1.2, sub: 1.4, clap: 1, pad: 0.8, perc: 0.7 } },
    hiphop: { name: 'Hip hop', bpm: 90, layers: { kick: 1.2, clap: 1.1, hat: 1, sub: 1.2, pad: 0.7, perc: 0.8 } },
    pop: { name: 'Pop', bpm: 115, layers: { kick: 1, clap: 1, hat: 1, sub: 1, pad: 0.9, stab: 0.9, flute: 0.8, shaker: 0.8 } },
    rock: { name: 'Rock', bpm: 128, layers: { kick: 1.2, clap: 1.1, ride: 1.2, openhat: 1, fill: 1.1, sub: 1.1, hat: 0.9 } },
    metal: { name: 'Metal', bpm: 180, layers: { drive: 1.2, kick: 1.2, fill: 1.2, ride: 1.2, openhat: 1, clap: 1, roll: 0.9 } },
    house: { name: 'House', bpm: 124, layers: { kick: 1.1, clap: 1.1, hat: 1, openhat: 1.1, sub: 1, stab: 1.1, pad: 0.8, shaker: 0.8 } },
    techno: { name: 'Techno', bpm: 132, layers: { kick: 1.2, hats16: 1, openhat: 1, ride: 1, acid: 1.2, roll: 1.1, clap: 0.9, perc: 0.9 } },
    trance: { name: 'Trance', bpm: 138, layers: { kick: 1.1, roll: 1.1, openhat: 1, stab: 1.2, pad: 1.1, acid: 0.8, hats16: 0.9, clap: 0.9 } },
    edm: { name: 'Electrónica', bpm: 128, layers: { kick: 1.2, clap: 1.1, openhat: 1, stab: 1.2, sub: 1.1, roll: 1, fill: 0.9, pad: 0.8 } },
    dnb: { name: 'Drum & bass', bpm: 172, layers: { kick: 1.1, hats16: 1.1, fill: 1.1, roll: 1.2, sub: 1.2, pad: 0.8, ride: 0.8 } },
    latin: { name: 'Latina', bpm: 100, layers: { perc: 1.3, shaker: 1.2, clap: 1, sub: 1.1, flute: 1, kick: 0.8, hat: 0.8 } },
    reggae: { name: 'Reggae', bpm: 76, layers: { kick: 1, clap: 1, sub: 1.3, hat: 0.9, shaker: 0.9, pad: 0.8 } },
    jazz: { name: 'Jazz', bpm: 110, layers: { ride: 1.2, sub: 1.1, pad: 1, perc: 0.8, flute: 1, kick: 0.6 } },
    lofi: { name: 'Lo-fi', bpm: 82, layers: { pad: 1.1, kick: 0.8, clap: 0.7, hat: 0.8, sub: 1, air: 0.8, flute: 0.8 } },
    chill: { name: 'Chill', bpm: 72, layers: { pad: 1.2, air: 1.1, flute: 1.1, heartbeat: 0.8, shaker: 0.8, sub: 0.9 } },
    classical: { name: 'Clásica', bpm: 68, layers: { pad: 1.3, flute: 1.3, air: 0.8 } },
    workout: { name: 'Para entrenar', bpm: 160, layers: { kick: 1.2, clap: 1.1, hats16: 1, openhat: 1, roll: 1.1, acid: 1, stab: 1, fill: 1, drive: 1 } },
  };
  // Words (without accents, lower case) that point to each style.
  const WORDS = [
    ['reggaeton', ['reggaeton', 'regueton', 'reguetón', 'perreo', 'urbano', 'urbana']],
    ['dembow', ['dembow']],
    ['trap', ['trap', 'drill']],
    ['hiphop', ['hip hop', 'hiphop', 'hip-hop', 'rap', 'boom bap']],
    ['rock', ['rock', 'grunge', 'indie', 'alternativ', 'punk']],
    ['metal', ['metal', 'heavy', 'thrash', 'hardcore']],
    ['house', ['house', 'disco', 'funk', 'deep']],
    ['techno', ['techno', 'tecno', 'minimal', 'industrial']],
    ['trance', ['trance', 'psytrance', 'psy']],
    ['dnb', ['drum and bass', 'drum & bass', 'drum n bass', 'dnb', 'jungle', 'breakbeat']],
    ['edm', ['edm', 'electronica', 'electronic', 'electro', 'dance', 'dubstep', 'big room', 'festival']],
    ['latin', ['salsa', 'cumbia', 'bachata', 'merengue', 'latina', 'latino', 'tropical', 'vallenato', 'mambo', 'samba', 'bossa', 'champeta']],
    ['reggae', ['reggae', 'dub', 'ska']],
    ['jazz', ['jazz', 'blues', 'swing', 'soul', 'r&b', 'rnb', 'bolero']],
    ['lofi', ['lofi', 'lo-fi', 'lo fi', 'estudiar', 'study']],
    ['chill', ['chill', 'ambient', 'relaj', 'tranquil', 'calma', 'spa', 'yoga', 'medita', 'dormir', 'sleep', 'acustic', 'acoustic', 'balada', 'romantic']],
    ['classical', ['clasica', 'classical', 'piano', 'orquesta', 'sinfon', 'opera', 'instrumental', 'violin']],
    ['pop', ['pop', 'k-pop', 'kpop', 'radio', 'balada pop']],
    ['workout', ['gym', 'gimnasio', 'entrenar', 'entreno', 'workout', 'correr', 'running', 'cardio', 'crossfit', 'motivacion', 'fiesta', 'party']],
  ];
  // A few well-known artists, so a song or a YouTube title points to a style.
  const ARTISTS = [
    ['reggaeton', ['bad bunny', 'daddy yankee', 'j balvin', 'karol g', 'ozuna', 'anuel', 'maluma', 'feid', 'rauw alejandro', 'nicky jam', 'don omar', 'wisin', 'farruko', 'myke towers', 'sech', 'jhay cortez', 'arcangel', 'young miko', 'blessd', 'ryan castro', 'despacito', 'gasolina', 'tusa']],
    ['dembow', ['el alfa', 'tokischa', 'chimbala']],
    ['trap', ['travis scott', 'future', 'quevedo', 'duki', 'bizarrap', 'eladio carrion', 'peso pluma', 'natanael cano']],
    ['hiphop', ['eminem', 'drake', 'kendrick', 'kanye', 'tupac', '2pac', 'snoop', '50 cent', 'jay-z', 'canserbero', 'residente', 'calle 13', 'nicki minaj', 'post malone']],
    ['pop', ['taylor swift', 'dua lipa', 'shakira', 'the weeknd', 'ed sheeran', 'ariana grande', 'billie eilish', 'harry styles', 'bruno mars', 'michael jackson', 'madonna', 'lady gaga', 'katy perry', 'justin bieber', 'rihanna', 'beyonce', 'sebastian yatra', 'camilo', 'morat', 'bts', 'blackpink', 'coldplay', 'imagine dragons', 'maroon 5', 'olivia rodrigo', 'sabrina carpenter', 'miley cyrus']],
    ['rock', ['queen', 'ac/dc', 'acdc', 'nirvana', 'foo fighters', 'guns n', 'red hot', 'beatles', 'rolling stones', 'led zeppelin', 'pink floyd', 'arctic monkeys', 'soda stereo', 'heroes del silencio', 'mana', 'linkin park', 'green day', 'the killers', 'muse', 'u2', 'bon jovi', 'aerosmith', 'caifanes', 'enanitos verdes']],
    ['metal', ['metallica', 'iron maiden', 'slayer', 'megadeth', 'slipknot', 'system of a down', 'rammstein', 'pantera', 'black sabbath', 'avenged']],
    ['house', ['daft punk', 'fisher', 'purple disco', 'disclosure', 'fred again', 'peggy gou', 'dom dolla', 'john summit']],
    ['techno', ['charlotte de witte', 'amelie lens', 'adam beyer', 'richie hawtin', 'carl cox', 'boris brejcha', 'enrico sangiuliano', 'nina kraviz']],
    ['trance', ['tiesto', 'armin', 'above & beyond', 'paul van dyk', 'ferry corsten', 'infected mushroom', 'vini vici']],
    ['edm', ['avicii', 'david guetta', 'calvin harris', 'martin garrix', 'skrillex', 'marshmello', 'alan walker', 'kygo', 'zedd', 'swedish house mafia', 'steve aoki', 'deadmau5', 'the chainsmokers', 'alok']],
    ['dnb', ['pendulum', 'netsky', 'chase & status', 'sub focus', 'wilkinson', 'noisia', 'goldie']],
    ['latin', ['marc anthony', 'celia cruz', 'hector lavoe', 'ruben blades', 'romeo santos', 'aventura', 'prince royce', 'juan luis guerra', 'carlos vives', 'grupo niche', 'joe arroyo', 'los angeles azules', 'gloria estefan', 'ricky martin', 'elvis crespo', 'silvestre dangond']],
    ['reggae', ['bob marley', 'damian marley', 'ub40', 'alborosie', 'gondwana', 'cultura profetica']],
    ['jazz', ['miles davis', 'john coltrane', 'louis armstrong', 'ella fitzgerald', 'frank sinatra', 'norah jones', 'nina simone', 'amy winehouse', 'luis miguel', 'b.b. king']],
    ['lofi', ['lofi girl', 'nujabes', 'j dilla']],
    ['chill', ['enya', 'bon iver', 'ludovico einaudi', 'brian eno', 'tycho', 'bonobo', 'jack johnson', 'norah', 'sade']],
    ['classical', ['bach', 'mozart', 'beethoven', 'chopin', 'vivaldi', 'debussy', 'tchaikovsky', 'hans zimmer', 'yiruma']],
  ];
  // Moods shift the tempo and how hard the drums hit.
  const MOODS = [
    { words: ['rapid', 'rapido', 'fast', 'energ', 'intens', 'potente', 'fuerte', 'duro', 'hard', 'subir', 'motiva', 'adrenalina', 'explosiv'], name: 'con más energía', bpm: 14, drums: 1.15, calm: 0.8 },
    { words: ['lent', 'slow', 'suave', 'soft', 'tranquil', 'relaj', 'calma', 'dormir', 'descans', 'paz', 'zen'], name: 'más tranquila', bpm: -14, drums: 0.75, calm: 1.2 },
    { words: ['triste', 'melancol', 'sad', 'nostalg', 'llorar', 'emocional'], name: 'melancólica', bpm: -6, drums: 0.85, calm: 1.25 },
    { words: ['oscur', 'dark', 'misterio', 'sombr'], name: 'oscura', bpm: 0, drums: 1, calm: 0.9, boost: { acid: 1.3, sub: 1.2, roll: 1.1 } },
    { words: ['feliz', 'alegre', 'happy', 'verano', 'summer', 'playa', 'baila', 'bailar', 'sabros'], name: 'alegre', bpm: 4, drums: 1.05, calm: 1, boost: { shaker: 1.2, perc: 1.2, flute: 1.1, stab: 1.1 } },
  ];
  const CALM = new Set(['pad', 'air', 'flute', 'heartbeat', 'bells']);
  const MIN = 40, MAX = 220;

  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clamp = (x) => Math.max(MIN, Math.min(MAX, Math.round(x)));
  // Small seeded random numbers, so the same request always sounds the same.
  function rng(text) {
    let h = 2166136261;
    for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }
  const has = (text, w) => (w.length <= 3 ? new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&') + '([^a-z0-9]|$)').test(text) : text.includes(w));

  /** What the text asks for: {genre, why, moods, bpm}. */
  function read(rawText) {
    const text = norm(rawText);
    const score = {};
    let why = null;
    for (const [g, list] of ARTISTS) for (const a of list) if (has(text, norm(a))) { score[g] = (score[g] || 0) + 3; why = why || a; }
    for (const [g, list] of WORDS) for (const w of list) if (has(text, norm(w))) score[g] = (score[g] || 0) + 2;
    const genre = Object.keys(score).sort((a, b) => score[b] - score[a])[0] || null;
    const moods = MOODS.filter((m) => m.words.some((w) => text.includes(w)));
    const m = text.match(/(\d{2,3})\s*(bpm|pulsaciones|ppm)/);
    const bpm = m ? Number(m[1]) : null;
    return { genre, artist: why, moods, bpm: bpm && bpm >= MIN && bpm <= MAX ? bpm : null };
  }

  /**
   * Builds the mix. `layers` are song.json's layers. Returns
   * {mix: {id: {in, out, gain}}, bpm, genre, label, instruments: [ids], known}.
   */
  function create(rawText, layers, extra = '') {
    const text = norm(rawText + ' ' + extra);
    const asked = read(rawText + ' ' + extra);
    const known = !!asked.genre;
    const style = GENRES[asked.genre || 'pop'];
    let bpm = asked.bpm || null, drums = 1, calm = 1;
    const boost = {};
    for (const m of asked.moods) {
      if (!asked.bpm) bpm = (bpm ?? style.bpm) + m.bpm;
      drums *= m.drums; calm *= m.calm;
      for (const id in m.boost || {}) boost[id] = (boost[id] || 1) * m.boost[id];
    }
    const label = [style.name + (known ? '' : ' (no reconocí el estilo, así que hice una mezcla pop)'), ...asked.moods.map((m) => m.name)].join(', ');
    const r = build({ weights: style.layers, bpm: bpm ?? style.bpm, jitterBpm: !asked.bpm, drums, calm, boost, extraColour: true }, layers, text);
    return { ...r, genre: asked.genre || 'pop', label, known, artist: asked.artist };
  }

  /** Builds the mix from the AI's plan: {style, bpm, summary, layers: [{id, weight}]}. */
  function fromPlan(plan, layers, text = '') {
    const ids = new Set(layers.map((l) => l.id));
    const weights = {};
    for (const l of (plan && plan.layers) || []) if (ids.has(l.id)) weights[l.id] = Math.max(0.3, Math.min(1.5, Number(l.weight) || 1));
    if (!Object.keys(weights).length) throw new Error('plan vacío');
    const bpm = Math.round(Number(plan.bpm)) || 110;
    const r = build({ weights, bpm, jitterBpm: false, drums: 1, calm: 1, boost: {}, extraColour: false }, layers, norm(text + ' ' + plan.style));
    return { ...r, genre: plan.style, label: String(plan.style || 'Mezcla'), summary: String(plan.summary || ''), known: true };
  }

  // Most chosen instruments are fully in by the target BPM, entering one after
  // another on the way up; the last ones join above it, so running faster still
  // adds layers. Everything not chosen stays quiet.
  function build(o, layers, seed) {
    const rand = rng(seed.trim() || 'mezcla');
    let bpm = o.bpm + (o.jitterBpm ? Math.round((rand() - 0.5) * 6) : 0);
    bpm = Math.max(50, Math.min(210, bpm));
    const byId = Object.fromEntries(layers.map((l) => [l.id, l]));
    const chosen = layers.filter((l) => o.weights[l.id] || o.boost[l.id] > 1.15).map((l) => l.id);
    if (o.extraColour) {
      // Every request gets one extra colour from the kit, picked by the text.
      const spare = layers.map((l) => l.id).filter((id) => !chosen.includes(id) && !(o.drums < 1 && !CALM.has(id)));
      if (spare.length) chosen.push(spare[Math.floor(rand() * spare.length)]);
    }
    chosen.sort((a, b) => byId[a].in[0] - byId[b].in[0] || byId[a].in[1] - byId[b].in[1]);
    const n = chosen.length, core = Math.max(1, Math.ceil(n * 0.8));
    const mix = {};
    chosen.forEach((id, i) => {
      const l = byId[id];
      let in1, in0;
      if (i < core) { in1 = clamp(bpm - 36 * (1 - i / Math.max(1, core - 1))); in0 = clamp(in1 - 16); }
      else { in1 = clamp(bpm + 10 + 12 * (i - core)); in0 = clamp(in1 - 14); }
      if (l.in[0] === MIN && l.in[1] === MIN && i === 0) { in0 = MIN; in1 = MIN; }
      let out = null;
      if (l.out) { const o0 = clamp(Math.max(in1, bpm + 24 + Math.round(rand() * 10))); out = [o0, clamp(o0 + 24)]; }
      const w = (o.weights[id] || 0.8) * (o.boost[id] || 1) * (CALM.has(id) ? o.calm : o.drums) * (0.92 + rand() * 0.16);
      mix[id] = { in: [in0, Math.max(in0, in1)], out, gain: Math.min(1.5, Math.round(l.gain * w * 1000) / 1000) };
    });
    for (const l of layers) if (!mix[l.id]) mix[l.id] = { gain: 0 };
    return { mix, bpm, instruments: chosen };
  }

  /** The YouTube video id in a link, or null. */
  function youtubeId(text) {
    const m = String(text || '').match(/(?:youtube\.com\/(?:watch\?(?:[^ ]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?v=)([\w-]{11})/i);
    return m ? m[1] : null;
  }

  const api = { create, fromPlan, read, youtubeId, GENRES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Generador = api;
})(typeof window !== 'undefined' ? window : globalThis);
