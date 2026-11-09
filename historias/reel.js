// Genera el reel de Instagram (1080x1920, 30 fps) uniendo cortes de los videos de las prendas.
// Uso: node reel.js reel/reel-ropanewz.json
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;

(async () => {
  const cfgPath = path.resolve(process.argv[2] || 'reel/reel-ropanewz.json');
  const D = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const outDir = path.join(__dirname, 'salida');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${D.slug}.mp4`);

  // Tiempos de cada corte (se los pasamos también a la página de textos)
  let t = 0;
  D.cortes.forEach(c => { c.t = +t.toFixed(3); t += c.dur; });
  const TOTAL = +t.toFixed(3);
  D.total = TOTAL;

  // Cada corte: recorte del video, HDR → SDR, pantalla completa y un "golpe" de zoom al entrar.
  const parts = D.cortes.map((c, i) => {
    const golpe = c.golpe === false ? '' :
      `,zoompan=z='1+0.16*max(0\\,1-on/9)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=${FPS}`;
    return `[${i}:v]trim=${c.inicio}:${(c.inicio + c.dur).toFixed(3)},setpts=PTS-STARTPTS,` +
      `zscale=t=linear:npl=${c.npl || 100},format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,` +
      `scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,fps=${FPS}${golpe},` +
      `eq=contrast=1.08:saturation=${c.saturacion || 1.1},unsharp=5:5:0.5,format=yuv420p,setsar=1,settb=AVTB[c${i}]`;
  });
  const n = D.cortes.length;
  const filter = [
    ...parts,
    `${D.cortes.map((_, i) => `[c${i}]`).join('')}concat=n=${n}:v=1:a=0[bg]`,
    `[${n}:v]format=rgba[ov]`,
    `[bg][ov]overlay=format=auto,format=yuv420p[v]`,
  ].join(';');

  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    ...D.cortes.flatMap(c => ['-i', path.resolve(path.dirname(cfgPath), c.video)]),
    '-thread_queue_size', '64', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-f', 'lavfi', '-t', String(TOTAL), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', filter,
    '-map', '[v]', '-map', `${n + 1}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-t', String(TOTAL), '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript(d => { window.DATA = d; }, D);
  await page.goto('file://' + path.join(__dirname, 'reel.html'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));

  const frames = Math.round(TOTAL * FPS);
  for (let i = 0; i < frames; i++) {
    const ms = (i / FPS) * 1000;
    await page.evaluate(t => { document.getAnimations().forEach(a => { a.currentTime = t; }); if (window.onFrame) window.onFrame(t / 1000); }, ms);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const png = await page.screenshot({ omitBackground: true, type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 90 === 0) process.stdout.write(`cuadro ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await browser.close();
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  console.log('Listo:', out);
})();
