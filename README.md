# Mezclador

Una página para decidir **en qué rango de BPM suena cada instrumento** de la música adaptativa de [RadioRun](https://github.com/cvergaraqec-blip/RadioRun-App) y con qué volumen, escuchándolo en vivo con los mismos sonidos y el mismo secuenciador que la app.

![Cada fila es un instrumento; la parte verde es el rango de BPM en que suena.](docs/mezclador.png)

## Abrirlo

En la web, sin instalar nada: **https://cvergaraqec-blip.github.io/MezcladorRR/**

También puedes abrirlo en tu computador con [Node.js](https://nodejs.org) (versión 18 o más nueva):

```bash
git clone https://github.com/cvergaraqec-blip/MezcladorRR.git
cd MezcladorRR
node server.cjs
```

Abre http://localhost:8099 en el navegador. Para cerrarlo, `Ctrl+C`.

### Publicarlo en GitHub Pages

En el repositorio, ve a **Settings → Pages**, en *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y pulsa **Save**. En uno o dos minutos la página queda en `https://<tu-usuario>.github.io/MezcladorRR/`.

## Usarlo

- **Crear música:** escribe lo que le gusta al oyente (una canción, un artista, un género, un ánimo como «tranquilo» o «rápido», o un link de YouTube) y pulsa **Crear música**. La página arma una mezcla original con los sonidos del kit: elige los instrumentos, el BPM y el orden en que entran, y la pone a sonar. Luego puedes ajustarla a mano y **Guardar**. No copia ni descarga la canción: de un link de YouTube solo lee el título.
  - La IA es Claude, a través de una función de Supabase (`supabase/functions/crear-musica`) que guarda la clave de Anthropic en el secreto `ANTHROPIC_API_KEY`, fuera de la página. Claude elige estilo, BPM e instrumentos, y `generador.js` arma la mezcla.
  - Si la IA no responde (sin clave, sin saldo o sin internet), `generador.js` la hace con reglas: reconoce géneros, ánimos, BPM escritos y artistas conocidos.
- **Mapa:** cada fila es un instrumento. La parte verde es el rango de BPM en que suena; el degradado es donde entra o sale poco a poco. Arrastra las **barras blancas** para que entre antes o después, o para que dure más o menos.
- **Instrumento:** abajo puedes escribir los BPM exactos, hacer que siga sonando hasta 220 y cambiar su volumen.
- **Play:** con **BPM fijo** (el deslizador) o en un **Recorrido** de 45 a 215 BPM en 2 min 30 s. Los cambios se oyen al momento.
- **M:** silencia una fila solo para escuchar el resto; no se guarda.
- **Tus loops:** arrastra un WAV o MP3 e indica cuántos beats dura. Sigue el BPM sin cambiar de tono, como la música de Training. Solo se escucha mientras la página está abierta: no se guarda.
- **Guardar:** en la web, conserva tu mezcla en ese navegador (la encuentras ahí la próxima vez) y descarga `mix.json`. Con `node server.cjs`, la escribe directamente en `mix.json` de la carpeta. Haz commit de ese archivo para compartirla: la página lo carga al abrirse.
- **Abrir mix.json:** carga una mezcla guardada en un archivo.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La página del Mezclador |
| `generador.js` | Crear música: convierte lo que le gusta al oyente en una mezcla |
| `supabase/functions/crear-musica/` | La función que llama a Claude (la IA de Crear música) |
| `server.cjs` | Servidor local opcional: sirve la página y los sonidos, y guarda `mix.json` |
| `song.json` | La canción: las 18 capas, sus patrones y sus rangos de BPM originales |
| `kit/` | Los 47 sonidos de la canción (WAV) |
| `mix.json` | Tu mezcla: solo lo que cambia respecto a `song.json` (la descargas al guardar; si está en el repo, la página la carga) |

`song.json` y `kit/` vienen de RadioRun (`scripts/adaptive/song.cjs` y `kit.cjs`), en la versión tranquila: pad suave sin vaivén, flauta de pan en lugar de campanas y olas más bajas. Todos los sonidos son originales, generados por código; no hay grabaciones de terceros.

## Llevar la mezcla a RadioRun

`mix.json` tiene la forma `{ "flute": { "out": [145, 190] }, "air": { "gain": 0.1 } }`: por cada instrumento, solo los valores que cambiaste (`in` y `out` en BPM, `gain` de volumen). Pásale ese archivo a quien mantiene la música de la app (o a Claude) para aplicarlo en `scripts/adaptive/`.
