# Historias Instagram – Ropa New.Z

Plantilla para crear historias (1080x1920, MP4) de cada prenda.

1. Pon el video de la prenda en `entrada/`.
2. Copia `productos/polera-punto.json`, cambia nombre, precio, talla, beneficios y textos.
3. Ejecuta: `node render.js productos/<prenda>.json`
4. El video queda en `salida/<prenda>_historia_v2.mp4`.

Estructura del video (11,5 s): la prenda limpia a pantalla completa con una tarjeta compacta (nombre, talla, precio) y beneficios breves → cierre con llamada a la acción ("Responde esta historia").
