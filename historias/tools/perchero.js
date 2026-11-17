// Transición "pasar perchas": como deslizar la ropa en el colgador de una tienda. La imagen A se va
// hacia la izquierda con un leve balanceo desde arriba y la B entra desde la derecha y se asienta.
// Uso: node tools/perchero.js dirA dirB salida.mp4   (cuadros 001.png… de 1080x1920)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const [dirA, dirB, out] = process.argv.slice(2).map(p => path.resolve(p));
const frames = fs.readdirSync(dirA).filter(f => f.endsWith('.png')).sort();
const n = frames.length;
const html = `<html><body style="margin:0;background:#000"><canvas id="c" width="1080" height="1920"></canvas><img id="a"><img id="b"></body></html>`;

(async () => {
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const tmp = path.join(path.dirname(out), '.perchero_tmp.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    await page.evaluate(async ({ a, b, p }) => {
      const load = (id, src) => new Promise(r => { const im = document.getElementById(id); im.onload = r; im.onerror = r; im.src = 'file://' + src; });
      await Promise.all([load('a', a), load('b', b)]);
      const A = document.getElementById('a'), B = document.getElementById('b');
      const W = 1080, H = 1920, ctx = document.getElementById('c').getContext('2d');
      const GAP = 70, D = W + GAP;
      // avance suave (entra y sale lento), con balanceo leve que se asienta al final
      const e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      const vel = Math.sin(Math.PI * p);                                   // rapidez relativa
      const swing = d => (3.2 * Math.sin(Math.PI * p) - 1.2 * Math.sin(Math.PI * 2 * p) * (1 - p)) * d; // grados
      const zoom = 1 + 0.07 * vel;                                         // un poco más grande al moverse: sin cuñas vacías
      // fondo: tela oscura del clóset y una barra de colgador arriba
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2a2528'); g.addColorStop(1, '#151214');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      const pieza = (img, x, ang) => {
        ctx.save();
        ctx.translate(x + W / 2, -160); ctx.rotate(ang * Math.PI / 180); ctx.scale(zoom, zoom); ctx.translate(-W / 2, 160 + (zoom - 1) * 900);
        ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50 * vel; ctx.shadowOffsetX = 0;
        ctx.filter = vel > 0.35 ? `blur(${(vel - 0.35) * 5}px)` : 'none';
        ctx.drawImage(img, 0, 0, W, H);
        ctx.filter = 'none'; ctx.shadowBlur = 0;
        // brillo que barre la pieza al moverse
        const lx = W * (1 - p) - 200;
        const lg = ctx.createLinearGradient(lx, 0, lx + 400, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, `rgba(255,255,255,${0.10 * vel})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      };
      const xa = -D * e, xb = D * (1 - e);
      pieza(A, xa, swing(1));
      pieza(B, xb, swing(1) * 0.8);
    }, { a: path.join(dirA, frames[i]), b: path.join(dirB, frames[i]), p });
    const png = await page.locator('#c').screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await browser.close();
  fs.unlinkSync(tmp);
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  console.log('Perchero listo:', out, n, 'cuadros');
})();
