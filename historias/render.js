// Genera una historia de Instagram (1080x1920, 30 fps) a partir de un video de la prenda.
// Uso: node render.js productos/polera-punto.json
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const TOTAL = 11.5; // segundos del video final

(async () => {
  const cfgPath = path.resolve(process.argv[2] || 'productos/polera-punto.json');
  const D = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const video = path.resolve(path.dirname(cfgPath), D.video);
  const outDir = path.join(__dirname, 'salida');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${D.slug}_historia_v2.mp4`);

  const clip = D.duracionClip;
  const pad = (TOTAL - clip).toFixed(3);
  const blurStart = (clip - 0.2).toFixed(2);

  // Fondo: recorta la prenda (sin el marco antiguo), la lleva a pantalla completa,
  // mejora color/nitidez, congela el último cuadro y lo desenfoca para el cierre.
  const filter = [
    `[0:v]trim=0:${clip},setpts=PTS-STARTPTS,crop=${D.crop},scale=1080:1920:flags=lanczos,setsar=1,` +
      `eq=contrast=1.07:saturation=1.06:brightness=0.01,unsharp=5:5:0.6,fps=${FPS},` +
      `tpad=stop_mode=clone:stop_duration=${pad},split[a][b]`,
    `[b]gblur=sigma=28,eq=brightness=-0.18,format=yuva420p,fade=in:st=${blurStart}:d=0.45:alpha=1[bb]`,
    `[a][bb]overlay=format=auto[bg]`,
    `[1:v]format=rgba[ov]`,
    `[bg][ov]overlay=format=auto,format=yuv420p[v]`,
  ].join(';');

  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-i', video,
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-f', 'lavfi', '-t', String(TOTAL), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filter,
    '-map', '[v]', '-map', '2:a',
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
