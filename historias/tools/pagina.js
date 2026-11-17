// Transición "cambio de página": la imagen A se despega desde la esquina inferior derecha como la hoja
// de una revista (doblez con dorso de papel, brillo y sombra) y deja ver la imagen B.
// Uso: node tools/pagina.js dirA dirB salida.mp4   (dirA/dirB con cuadros 001.png… de 1080x1920)
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
  const tmp = path.join(path.dirname(out), '.pagina_tmp.html');
  fs.writeFileSync(tmp, html);
  await page.goto('file://' + tmp);
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const e = 0.5 - Math.cos(Math.PI * p) / 2;
    await page.evaluate(async ({ a, b, e }) => {
      const load = (id, src) => new Promise(r => { const im = document.getElementById(id); im.onload = r; im.onerror = r; im.src = 'file://' + src; });
      await Promise.all([load('a', a), load('b', b)]);
      const A = document.getElementById('a'), B = document.getElementById('b');
      const W = 1080, H = 1920, ctx = document.getElementById('c').getContext('2d');
      // dirección del doblez: desde la esquina inferior derecha hacia arriba-izquierda (va girando un poco)
      const th = Math.PI + 0.62 - 0.25 * e;
      const u = [Math.cos(th), Math.sin(th)]; // unitario hacia el interior
      const C = [W, H];
      const dot = (P) => (P[0] - C[0]) * u[0] + (P[1] - C[1]) * u[1];
      const sMax = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(dot));
      const s = e * (sMax + 60);                  // distancia del doblez a la esquina
      const rect = [[0, 0], [W, 0], [W, H], [0, H]];
      // recorta un polígono con el semiplano dot(P) >= s (keep) o < s (!keep)
      const recorta = (poly, keep) => {
        const res = [], dentro = P => keep ? dot(P) >= s : dot(P) < s;
        for (let k = 0; k < poly.length; k++) {
          const P = poly[k], Q = poly[(k + 1) % poly.length], dp = dentro(P), dq = dentro(Q);
          if (dp) res.push(P);
          if (dp !== dq) { const t = (s - dot(P)) / (dot(Q) - dot(P)); res.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
        }
        return res;
      };
      const camino = poly => { ctx.beginPath(); poly.forEach((P, k) => k ? ctx.lineTo(...P) : ctx.moveTo(...P)); ctx.closePath(); };
      // reflexión respecto de la línea del doblez
      const Q0 = [C[0] + s * u[0], C[1] + s * u[1]];
      const k2 = 2 * (Q0[0] * u[0] + Q0[1] * u[1]);
      const M = [1 - 2 * u[0] * u[0], -2 * u[0] * u[1], -2 * u[0] * u[1], 1 - 2 * u[1] * u[1], k2 * u[0], k2 * u[1]];
      const refl = P => [M[0] * P[0] + M[2] * P[1] + M[4], M[1] * P[0] + M[3] * P[1] + M[5]];

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(B, 0, 0, W, H);
      const quedan = recorta(rect, true), sale = recorta(rect, false), solapa = sale.map(refl);
      // sombra sobre la página de abajo, a lo largo del doblez
      if (sale.length) {
        ctx.save();
        const g = ctx.createLinearGradient(Q0[0], Q0[1], Q0[0] - u[0] * 140, Q0[1] - u[1] * 140);
        g.addColorStop(0, `rgba(0,0,0,${0.5 * Math.sin(Math.PI * e) + 0.1})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
      // la parte de la hoja que sigue en su lugar
      if (quedan.length) {
        ctx.save(); camino(quedan); ctx.clip(); ctx.drawImage(A, 0, 0, W, H);
        // sombra que proyecta la solapa sobre la hoja
        const g = ctx.createLinearGradient(Q0[0], Q0[1], Q0[0] + u[0] * (s * 1.1 + 60), Q0[1] + u[1] * (s * 1.1 + 60));
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; camino(solapa.length ? solapa : quedan); ctx.fill();
        ctx.restore();
      }
      // la solapa: dorso de papel con la imagen apenas transparentada, brillo cerca del doblez
      if (solapa.length) {
        ctx.save(); camino(solapa); ctx.clip();
        ctx.fillStyle = '#f4efe9'; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.16; ctx.setTransform(-1, 0, 0, 1, W, 0);
        ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); ctx.drawImage(A, 0, 0, W, H);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
        const g = ctx.createLinearGradient(Q0[0], Q0[1], Q0[0] + u[0] * s, Q0[1] + u[1] * s);
        g.addColorStop(0, 'rgba(120,100,90,0.35)'); g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
        g.addColorStop(0.55, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(90,70,60,0.30)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // borde fino del doblez
        ctx.save(); camino(solapa); ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
    }, { a: path.join(dirA, frames[i]), b: path.join(dirB, frames[i]), e });
    const png = await page.locator('#c').screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await browser.close();
  fs.unlinkSync(tmp);
  await new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  console.log('Página lista:', out, n, 'cuadros');
})();
