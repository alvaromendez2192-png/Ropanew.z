# Historias Instagram – Ropa New.Z

Plantilla para crear historias (1080x1920, MP4) de cada prenda.

1. Pon el video de la prenda en `entrada/`.
2. Copia `productos/polera-punto.json`, cambia nombre, precio, talla, beneficios y textos.
3. Ejecuta: `node render.js productos/<prenda>.json`
4. El video queda en `salida/<prenda>_historia_v2.mp4`.

Cada historia: la prenda a pantalla completa con una tarjeta compacta por producto (nombre, talla, precio y 2 frases cortas) y un cierre con llamada a la acción ("Responde esta historia").

- Un video con varios productos: agrega un bloque en `segmentos` por prenda, con `desde`/`hasta` (segundos) y `pos` (`abajo` o `arriba`, para no tapar la prenda que se está mostrando).
- Videos de iPhone (HDR): pon `"hdr": true` para que los colores no salgan lavados.
- La música agrégala dentro de Instagram (sticker de música).
