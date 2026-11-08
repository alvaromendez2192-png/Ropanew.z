// Genera una historia de Instagram (1080x1920, 30 fps) a partir de un video de la prenda.
// Uso: node render.js productos/polera-punto.json
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const CIERRE = 2.7; // segundos de la pantalla final (llamada a la acción)

(async () => {
  const cfgPath = path.resolve(process.argv[2] || 'productos/polera-punto.json');
  const D = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const outDir = path.join(__dirname, 'salida');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${D.slug}_historia.mp4`);

  // Uno o varios videos (p. ej. frente y espalda), unidos con una transición.
  const clips = D.clips || [{ video: D.video, inicio: D.inicio, dur: D.duracionClip, hdr: D.hdr, crop: D.crop }];
  const tr = D.transicion || { tipo: 'squeezeh', dur: 0.5 };
  const clip = +(clips.reduce((a, c) => a + c.dur, 0) - (clips.length - 1) * tr.dur).toFixed(3);
  D.duracionClip = clip;
  const TOTAL = +(clip + CIERRE).toFixed(2);
  const pad = (TOTAL - clip).toFixed(3);
  const blurStart = (clip - 0.2).toFixed(2);

  // Fondo: cada clip a pantalla completa (HDR de iPhone pasado a SDR para que no se vea lavado),
  // con color/nitidez mejorados; al final se congela el último cuadro y se desenfoca para el cierre.
  const parts = clips.map((c, i) => {
    const t0 = c.inicio || 0;
    return `[${i}:v]trim=${t0}:${t0 + c.dur},setpts=PTS-STARTPTS,` +
      (c.hdr ? 'zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,' : '') +
      (c.crop ? `crop=${c.crop},` : '') +
      `scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,` +
      `eq=contrast=1.07:saturation=${c.saturacion || 1.06}:brightness=0.01,unsharp=5:5:0.6,fps=${FPS},format=yuv420p,settb=AVTB[c${i}]`;
  });
  let last = 'c0', acc = clips[0].dur;
  for (let i = 1; i < clips.length; i++) {
    parts.push(`[${last}][c${i}]xfade=transition=${tr.tipo}:duration=${tr.dur}:offset=${(acc - tr.dur).toFixed(3)}[x${i}]`);
    last = `x${i}`; acc += clips[i].dur - tr.dur;
  }
  // Lupa opcional: un círculo que muestra el tejido ampliado.
  const L = D.lupa;
  if (L) {
    const side = Math.round((2 * L.r) / L.zoom), d = 2 * L.r;
    parts.push(
      `[${last}]split[base][lz]`,
      `[lz]crop=${side}:${side}:${L.cx - side / 2}:${L.cy - side / 2},scale=${d}:${d}:flags=lanczos,format=yuva444p,` +
        `geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lte(hypot(X-${L.r},Y-${L.r}),${L.r}),255,0)',` +
        `fade=in:st=${L.desde}:d=0.3:alpha=1,fade=out:st=${L.hasta - 0.3}:d=0.3:alpha=1[lens]`,
      `[base][lens]overlay=${L.x - L.r}:${L.y - L.r}:enable='between(t,${L.desde},${L.hasta})'[lupa]`
    );
    last = 'lupa';
  }
  const n = clips.length;
  const filter = [
    ...parts,
    `[${last}]tpad=stop_mode=clone:stop_duration=${pad},split[a][b]`,
    `[b]gblur=sigma=28,eq=brightness=-0.18,format=yuva420p,fade=in:st=${blurStart}:d=0.45:alpha=1[bb]`,
    `[a][bb]overlay=format=auto[bg]`,
    `[${n}:v]format=rgba[ov]`,
    `[bg][ov]overlay=format=auto,format=yuv420p[v]`,
  ].join(';');

  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    ...clips.flatMap(c => ['-i', path.resolve(path.dirname(cfgPath), c.video)]),
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-f', 'lavfi', '-t', String(TOTAL), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filter,
    '-map', '[v]', '-map', `${n + 1}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(TOTAL), '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript(d => { window.DATA = d; }, D);
  await page.goto('file://' + path.join(__dirname, 'overlay.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));

  const frames = Math.round(TOTAL * FPS);
  for (let i = 0; i < frames; i++) {
    const ms = (i / FPS) * 1000;
    await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), ms);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`cuadro ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await browser.close();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  console.log('Listo:', out);
})();
