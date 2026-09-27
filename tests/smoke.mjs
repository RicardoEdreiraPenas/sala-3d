/*
 * Prueba rápida: abre la web en Chromium sin ventana y comprueba que
 *  - carga sin errores de JavaScript,
 *  - la escena 3D se dibuja (el lienzo no sale vacío),
 *  - las dos distribuciones y los estilos funcionan,
 *  - «Mis medidas», las cotas de los muebles y el enlace compartible van bien.
 *
 * Uso: con la web servida en BASE_URL (por defecto http://localhost:8000/)
 *   node tests/smoke.mjs
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8000/';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(`console: ${m.text()}`); });
// Las fuentes no afectan a la prueba: se sirven vacías para no depender de la red
await page.route(/fonts\.(googleapis|gstatic)/, r => r.fulfill({ body: '', contentType: 'text/css' }));

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? '✔' : '✘'} ${what}`); if (!ok) failed++; };

await page.addInitScript(() => { window.__salaPaused = true; });   // los fotogramas se dibujan a mano
await page.goto(BASE_URL);
await page.waitForFunction(() => window.__sala, null, { timeout: 90_000 });

// Dibuja un fotograma y mide el lienzo: una imagen vacía no varía
const renderStats = () => page.evaluate(() => {
  const k = window.__sala; k.frame(); k.frame();
  const src = document.querySelector('#stage canvas'), c = document.createElement('canvas');
  c.width = 64; c.height = 48; const g = c.getContext('2d'); g.drawImage(src, 0, 0, 64, 48);
  const d = g.getImageData(0, 0, 64, 48).data; let sum = 0, sq = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; sq += v * v; }
  const mean = sum / n; return { mean, std: Math.sqrt(sq / n - mean * mean) };
});
const panel = () => page.evaluate(() => ({
  items: document.querySelectorAll('#items .row').length,
  checks: [...document.querySelectorAll('#checks .check')].map(c => ({ t: c.querySelector('.t').textContent, s: c.querySelector('.pill').className })),
  text: document.getElementById('checks').textContent,
}));

for (const layout of ['A', 'B']) {
  await page.evaluate(l => { const k = window.__sala; k.state.layout = l; k.state.hq = false; k.setQuality(); k.applyAll(); k.goView('iso', true); }, layout);
  const s = await renderStats();
  check(s.std > 8, `Distribución ${layout}: la escena se dibuja (variación ${s.std.toFixed(1)})`);
  const p = await panel();
  check(p.items >= 5 && p.checks.length >= 7, `Distribución ${layout}: ${p.items} muebles y ${p.checks.length} comprobaciones`);
  if (layout === 'A') check(p.checks.some(c => c.t === 'Sofá en su pared' && c.s.includes('ok')), 'El sofá de 2,40 no sobresale de la pared de 2,43');
  if (layout === 'B') check(p.checks.some(c => c.t === 'Balconera' && c.s.includes('warn')), 'Con la chaise en la ventana avisa de que la balconera no abre');
}

const presets = await page.$$eval('[data-preset]', els => els.map(e => e.dataset.preset));
for (const id of presets) {
  await page.click(`[data-preset="${id}"]`);
  const s = await renderStats();
  check(s.std > 8, `Estilo ${id}`);
}
await page.click('[data-preset="actual"]');

for (const v of ['cocina', 'ventana', 'tv', 'planta']) {
  await page.evaluate(v => window.__sala.goView(v, true), v);
  const s = await renderStats();
  check(s.std > 5, `Vista ${v}`);
}

await page.evaluate(() => { window.__salaSaveWidth = 900; window.__sala.goView('iso', true); });
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }).catch(() => null), page.click('#save-img')]);
check(!!download && /\.png$/.test(download.suggestedFilename()), `Guardar imagen (${download ? download.suggestedFilename() : 'sin descarga'})`);

await page.evaluate(() => { const k = window.__sala; k.state.night = true; k.state.hq = true; k.setQuality(); k.applyNight(); k.goView('cocina', true); });
const night = await renderStats();
check(night.std > 3, 'Noche en calidad alta (oclusión ambiental y bloom)');
await page.evaluate(() => { const k = window.__sala; k.state.night = false; k.state.hq = false; k.setQuality(); k.applyNight(); k.goView('iso', true); });

// Cotas de los muebles
const ad = await page.evaluate(() => { window.__sala.frame(); return [...document.querySelectorAll('.dim.ap')].filter(e => e.style.display !== 'none').length; });
check(ad >= 8, `Cotas de muebles visibles (${ad})`);
await page.click('#t-adims'); await page.evaluate(() => window.__sala.frame());
const ad2 = await page.evaluate(() => [...document.querySelectorAll('.dim.ap')].filter(e => e.style.display !== 'none').length);
check(ad2 === 0, 'El botón oculta las cotas de muebles');
await page.click('#t-adims');

// Mis medidas: sala rectangular más grande, sofá de 2,80 y TV de 65″
await page.evaluate(() => { document.getElementById('measures').open = true; });
for (const [k, v] of [['Wt', 380], ['Wb', 380], ['L', 3.2 * 100], ['sofaL', 280], ['tvIn', 65]]) await page.fill(`#m-${k}`, String(v));
await page.click('#m-apply');
const custom = await page.evaluate(() => ({ g: window.__sala.room(), f: window.__sala.state.furn, hash: location.hash, svg: document.querySelectorAll('#room-svg line').length }));
check(Math.abs(custom.g.Wt - 3.8) < 1e-6 && Math.abs(custom.g.L - 3.2) < 1e-6, 'Mis medidas: sala de 3,80 × 3,20');
check(custom.f.tvIn === 65 && Math.abs(custom.f.sofaL - 2.8) < 1e-6, 'Muebles aplicados (sofá 2,80, TV 65″)');
check(/\.m3800-3800-3200-/.test(custom.hash) && /\.f2800-/.test(custom.hash) && /-65-/.test(custom.hash), `Las medidas viajan en el enlace (${custom.hash})`);
check(custom.svg >= 8, 'El plano de «Mis medidas» se dibuja');
{ const s = await renderStats(); check(s.std > 8, 'La escena se dibuja con las medidas nuevas'); }
// Un sofá más largo que su pared avisa
await page.fill('#m-L', '243'); await page.click('#m-apply');
{ const p = await panel(); check(p.checks.some(c => c.t === 'Sofá en su pared' && c.s.includes('warn')), 'Aviso si el sofá sobresale de su pared'); }
await page.click('#m-reset');
const back = await page.evaluate(() => ({ W: window.__sala.room().Wt, hash: location.hash }));
check(Math.abs(back.W - 3.135) < 1e-6 && !/\.[mf]\d/.test(back.hash), 'Volver a las medidas originales');

// Un enlace con medidas se abre igual
await page.goto(BASE_URL + '#B.12300.m3500-3500-3000-3000-680-1460-305-140-2600');
await page.reload();
await page.waitForFunction(() => window.__sala, null, { timeout: 90_000 });
const fromLink = await page.evaluate(() => ({ L: window.__sala.state.layout, W: window.__sala.room().Wt, fin: window.__sala.state.fin }));
check(fromLink.L === 'B' && Math.abs(fromLink.W - 3.5) < 1e-6 && fromLink.fin.madera === 'blanco', 'Abrir un enlace compartido recupera el diseño');

check(errors.length === 0, `Sin errores en la consola${errors.length ? ':\n  ' + errors.join('\n  ') : ''}`);
await browser.close();
if (failed) { console.error(`\n${failed} comprobación(es) fallida(s)`); process.exit(1); }
console.log('\nTodo correcto');
