// Genera los assets de la landing a partir de las fotos del proyecto:
//   - recorta el fondo blanco de cada prenda
//   - le dibuja una percha cromada (gancho para poleras, pinzas para shorts)
//   - crea el logo blanco con transparencia
//
// Uso (desde la carpeta del proyecto, con `npm i sharp` instalado donde quieras):
//   node chili-sweat-hero/tools/build-assets.js
//
// Para agregar una prenda: súbela a la raíz del proyecto (foto frontal, fondo blanco liso),
// añádela a PRENDAS y vuelve a correr el script. Luego agrégala a la lista P de index.html.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(__dirname, '..', 'assets');
fs.mkdirSync(OUT, { recursive: true });

// tipo: 'polera' (gancho al cuello) | 'short' (percha de pinzas) · salida: assets/<tipo>-<id>.webp
const PRENDAS = [
  { tipo: 'polera', id: 'negro',       file: 'polera.png' },
  { tipo: 'short',  id: 'negro',       file: 'short.png' },
  { tipo: 'polera', id: 'azul-marino', file: 'polera azul marino.png' },
  { tipo: 'short',  id: 'azul-marino', file: 'short  azul marino.png' },
  { tipo: 'polera', id: 'gris',        file: 'polera gris.png' },
  { tipo: 'short',  id: 'gris',        file: 'short gris.png' },
  { tipo: 'polera', id: 'burdeo',      file: 'polera burdeo.png' },
  { tipo: 'polera', id: 'verde',       file: 'polera verde.png' },
];

const W = 1000, H = 1038; // mismo aspecto que la caja 289x300 del riel

// ---------- 1. recorte del fondo blanco (flood fill desde el borde) ----------
async function cutout(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, px = new Uint8ClampedArray(data);
  const bg = new Uint8Array(w * h);
  const minC = (i) => Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const q = new Int32Array(w * h); let qh = 0, qt = 0;
  const push = (i) => { if (!bg[i] && minC(i) >= 205) { bg[i] = 1; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  // banda de borde de 2 px
  const edge = new Uint8Array(w * h);
  const touches = (i, set) => {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      if (set[yy * w + xx]) return true;
    }
    return false;
  };
  const either = new Uint8Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < w * h; i++) either[i] = bg[i] || edge[i] ? 1 : 0;
    const add = [];
    for (let i = 0; i < w * h; i++) if (!either[i] && touches(i, either)) add.push(i);
    add.forEach((i) => (edge[i] = 1));
  }
  // en el borde: color de la prenda = promedio de los pixeles solidos cercanos; alfa = cobertura sobre el blanco
  const R = 5;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (bg[i]) { px[o + 3] = 0; continue; }
    if (!edge[i]) { px[o + 3] = 255; continue; }
    const x = i % w, y = (i / w) | 0;
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (bg[j] || edge[j]) continue;
      sr += px[j * 4]; sg += px[j * 4 + 1]; sb += px[j * 4 + 2]; n++;
    }
    const fr = n ? sr / n : 30, fg = n ? sg / n : 30, fb = n ? sb / n : 30;
    const dr = fr - 255, dg = fg - 255, db = fb - 255;
    const dd = dr * dr + dg * dg + db * db;
    const vr = px[o] - 255, vg = px[o + 1] - 255, vb = px[o + 2] - 255;
    const a = dd < 400 ? 1 : Math.max(0, Math.min(1, (vr * dr + vg * dg + vb * db) / dd));
    px[o] = fr; px[o + 1] = fg; px[o + 2] = fb; px[o + 3] = Math.round(a * 255);
  }
  // recorte al contenido
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 24) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const img = await sharp(Buffer.from(px.buffer), { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: cw, height: ch }).png().toBuffer();
  return { img, w: cw, h: ch };
}

// primer pixel opaco de una columna (para ubicar el gancho y las pinzas)
async function topAt(buf, xs) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return xs.map((x) => {
    for (let y = 0; y < info.height; y++) if (data[(y * info.width + Math.round(x)) * 4 + 3] > 200) return y;
    return 0;
  });
}

// ---------- 2. perchas cromadas (SVG) ----------
const CHROME_DEFS = `<defs>
  <linearGradient id="cr" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fafafa"/><stop offset=".35" stop-color="#b9bcc1"/>
    <stop offset=".6" stop-color="#6b6e75"/><stop offset=".85" stop-color="#b4b8be"/><stop offset="1" stop-color="#eceded"/>
  </linearGradient></defs>`;
const wire = (d, wd = 9) => `
  <path d="${d}" fill="none" stroke="#3d4046" stroke-width="${wd + 3.5}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="url(#cr)" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" transform="translate(-1.6,-1.6)" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;

// gancho que abraza la riel: centro del anillo a y=83 (24 px de la caja 289x300 * 3.46)
const RING_CY = 83, RING_R = 29;
const hookPath = (cx, neckBottomY) =>
  `M${cx},${neckBottomY} L${cx},${RING_CY + RING_R} A${RING_R},${RING_R} 0 1 0 ${cx - RING_R},${RING_CY}`;
const svg = (inner) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${CHROME_DEFS}${inner}</svg>`);
const blank = () => sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const toWebp = (s) => s.webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();

async function hangPolera(buf, pw) {
  const left = Math.round((W - pw) / 2), top = 148;
  const [collarY] = await topAt(buf, [pw / 2]);
  const cx = left + pw / 2;
  const back = svg(wire(hookPath(cx, top + collarY + 26)));
  return toWebp(blank().composite([{ input: back }, { input: buf, left, top }]));
}

async function hangShort(buf, sw) {
  const left = Math.round((W - sw) / 2), top = 150;
  const xsRel = [sw * 0.36, sw * 0.64];
  const [t1, t2] = await topAt(buf, xsRel);
  const cx = left + sw / 2;
  const barY = top + Math.min(t1, t2) - 62;
  const x1 = left + xsRel[0], x2 = left + xsRel[1];
  const back = svg(`
    ${wire(hookPath(cx, barY), 9)}
    ${wire(`M${x1},${barY} L${x2},${barY}`, 9)}
    ${wire(`M${x1},${barY} L${x1},${top + t1 + 4}`, 8)}
    ${wire(`M${x2},${barY} L${x2},${top + t2 + 4}`, 8)}`);
  const clip = (x, y) => `
    <rect x="${x - 21}" y="${y - 8}" width="42" height="54" rx="8" fill="#3d4046"/>
    <rect x="${x - 18}" y="${y - 5}" width="36" height="48" rx="6" fill="url(#cr)"/>
    <rect x="${x - 15}" y="${y - 2}" width="6" height="40" rx="3" fill="#fff" fill-opacity=".55"/>`;
  const front = svg(clip(x1, top + t1 - 4) + clip(x2, top + t2 - 4));
  return toWebp(blank().composite([{ input: back }, { input: buf, left, top }, { input: front }]));
}

// ---------- 3. logo blanco con transparencia ----------
async function buildLogo() {
  const { data, info } = await sharp(path.join(ROOT, 'logo.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const rgba = Buffer.alloc(w * h * 4);
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(1, (232 - data[i]) / (232 - 45)));
    rgba[i * 4] = 241; rgba[i * 4 + 1] = 239; rgba[i * 4 + 2] = 236;
    rgba[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.1) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const pad = 6;
  const ex = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad) };
  ex.width = Math.min(w - ex.left, x1 - x0 + 1 + pad * 2);
  ex.height = Math.min(h - ex.top, y1 - y0 + 1 + pad * 2);
  const out = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract(ex).resize({ width: 1100 }).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
  fs.writeFileSync(path.join(OUT, 'logo-blanco.webp'), out);
}

async function build() {
  const cuts = [];
  for (const p of PRENDAS) cuts.push({ ...p, ...(await cutout(path.join(ROOT, p.file))) });
  // misma escala para todas: la pieza mas ancha ocupa 98.5% del ancho
  const s = 985 / Math.max(...cuts.map((c) => c.w));
  for (const c of cuts) {
    const w = Math.round(c.w * s), h = Math.round(c.h * s);
    const buf = await sharp(c.img).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    const out = c.tipo === 'polera' ? await hangPolera(buf, w) : await hangShort(buf, w);
    const name = `${c.tipo}-${c.id}.webp`;
    fs.writeFileSync(path.join(OUT, name), out);
    console.log(name, `${c.w}x${c.h} ->`, `${w}x${h}`);
  }
  await buildLogo();
  console.log('logo-blanco.webp listo');
}
build().catch((e) => { console.error(e); process.exit(1); });
