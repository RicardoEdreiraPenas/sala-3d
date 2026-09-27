/*
 * Texturas procedurales de la sala (dibujadas en <canvas>, sin imágenes externas).
 * Cada textura devuelve { map, bump?, canvas } y una miniatura para el panel.
 * Se generan bajo demanda: solo se dibujan cuando algo las usa por primera vez,
 * y warmUp() prepara el resto en ratos libres para las miniaturas del panel.
 */

function prng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

export function createTextures(THREE, renderer) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const out = {}, thumbs = {}, cache = {}, pending = [];

  function build(name, w, h, drawColor, drawHeight, seed) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    let rnd = prng(seed); drawColor(c.getContext('2d'), w, h, rnd);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = aniso;
    const t = { map, canvas: c };
    if (drawHeight) {
      const hc = document.createElement('canvas'); hc.width = w; hc.height = h;
      rnd = prng(seed); drawHeight(hc.getContext('2d'), w, h, rnd);
      const bump = new THREE.CanvasTexture(hc); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.anisotropy = aniso;
      t.bump = bump;
    }
    const s = document.createElement('canvas'); s.width = s.height = 96;
    s.getContext('2d').drawImage(c, 0, 0, Math.min(w, h) * 0.5, Math.min(h, w) * 0.5, 0, 0, 96, 96);
    thumbs[name] = s.toDataURL('image/jpeg', 0.8);
    return t;
  }
  function make(name, w, h, drawColor, drawHeight, seed = 1) {
    pending.push(name);
    Object.defineProperty(out, name, { enumerable: true, get: () => cache[name] || (cache[name] = build(name, w, h, drawColor, drawHeight, seed)) });
  }
  // Genera las texturas que falten, una por hueco libre del navegador, y avisa al terminar
  function warmUp(onDone) {
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 30));
    const next = () => {
      const name = pending.find(n => !cache[n]);
      if (!name) { onDone && onDone(); return; }
      void out[name]; idle(next);
    };
    idle(next);
  }
  const noise = (g, w, h, rnd, n, cols, size = 3) => {
    for (let i = 0; i < n; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0].replace('A', (rnd() * 0.08).toFixed(3)); const s = 1 + rnd() * size; g.fillRect(rnd() * w, rnd() * h, s, s); }
  };
  // Dibuja una forma en las 9 posiciones envolventes para que la textura sea continua
  const wrap9 = (w, h, fn) => { for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) fn(dx, dy); };

  /* ── Madera de roble (1 m) ── */
  const oakGrain = (g, w, h, rnd, base = '#C39A6B') => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      const y = rnd() * h, a = 0.03 + rnd() * 0.12, amp = 2 + rnd() * 7, f = 0.003 + rnd() * 0.01, ph = rnd() * 6;
      g.strokeStyle = rnd() > .3 ? `rgba(105,68,36,${a})` : `rgba(242,208,165,${a})`; g.lineWidth = 0.5 + rnd() * 2.4;
      g.beginPath(); for (let x = -16; x <= w + 16; x += 16) g.lineTo(x, y + Math.sin(x * f + ph) * amp); g.stroke();
    }
    for (let k = 0; k < 6; k++) { const x = rnd() * w, y = rnd() * h; const gr = g.createRadialGradient(x, y, 1, x, y, 14 + rnd() * 10); gr.addColorStop(0, 'rgba(90,55,25,.35)'); gr.addColorStop(1, 'rgba(90,55,25,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, 30, 8, 0, 0, 7); g.fill(); }
  };
  make('oak', 1024, 1024, (g, w, h, r) => oakGrain(g, w, h, r), (g, w, h, r) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(0,0,0,${r() * .25})`; g.lineWidth = 1 + r() * 2; const y = r() * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - .5) * 8); g.stroke(); } }, 3);

  /* ── Roble en espiga húngara (0,9 m) ── */
  const herring = (g, w, h, rnd, height) => {
    const cols = 4, c = w / cols, ph = 128, rows = h / ph;
    const tones = []; for (let i = 0; i < cols * rows; i++) tones.push([192 + rnd() * 30, 0.66 + rnd() * 0.06, 0.42 + rnd() * 0.06]);
    g.fillStyle = height ? '#000' : '#6b4a2c'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < cols; k++) for (let j = -3; j < rows + 3; j++) {
      const x0 = k * c, y = j * ph, even = k % 2 === 0;
      const pts = even ? [[x0, y], [x0 + c, y - c], [x0 + c, y - c + ph], [x0, y + ph]] : [[x0, y - c], [x0 + c, y], [x0 + c, y + ph], [x0, y - c + ph]];
      g.save(); g.beginPath(); pts.forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.clip();
      if (height) { g.fillStyle = '#fff'; g.fill(); }
      else {
        const [r0, gf, bf] = tones[k * rows + ((j % rows) + rows) % rows]; g.fillStyle = `rgb(${r0},${r0 * gf},${r0 * bf})`; g.fill();
        for (let l = 0; l < 26; l++) { const off = rnd() * ph * 1.4 - ph * 0.2; g.strokeStyle = rnd() > .4 ? `rgba(100,62,30,${0.05 + rnd() * 0.12})` : `rgba(245,210,165,${0.05 + rnd() * 0.1})`; g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath(); if (even) { g.moveTo(x0, y + off); g.lineTo(x0 + c, y - c + off + (rnd() - .5) * 6); } else { g.moveTo(x0, y - c + off); g.lineTo(x0 + c, y + off + (rnd() - .5) * 6); } g.stroke(); }
      }
      g.restore();
      g.strokeStyle = height ? '#000' : 'rgba(60,38,20,.55)'; g.lineWidth = 2.5; g.beginPath(); pts.forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.stroke();
    }
  };
  make('herringbone', 1024, 1024, (g, w, h, r) => herring(g, w, h, r, false), (g, w, h, r) => herring(g, w, h, r, true), 71);

  /* ── Microcemento (2 m) ── */
  make('microcement', 1024, 1024, (g, w, h, rnd) => {
    g.fillStyle = '#BEB9B1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const x = rnd() * w, y = rnd() * h, r = 50 + rnd() * 220, light = rnd() > .5; const a = 0.05 + rnd() * 0.08; wrap9(w, h, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, light ? `rgba(235,230,222,${a})` : `rgba(120,112,102,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); }); }
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(250,248,244,${rnd() * 0.05})`; g.lineWidth = 8 + rnd() * 20; g.beginPath(); const x = rnd() * w, y = rnd() * h; g.arc(x, y, 60 + rnd() * 120, rnd() * 6, rnd() * 6 + 1.2); g.stroke(); }
    noise(g, w, h, rnd, 12000, ['rgba(90,85,80,A)', 'rgba(255,255,255,A)'], 1.5);
  }, null, 81);


  /* ── Porcelánico gris 60×60 (1,2 m), como el de la sala ── */
  const greyTile = (g, w, h, rnd, height) => {
    const s = w / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      if (height) { g.fillStyle = '#fff'; g.fillRect(i * s, j * s, s, s); continue; }
      const v = 116 + Math.floor(rnd() * 8); g.fillStyle = `rgb(${v},${v},${v - 1})`; g.fillRect(i * s, j * s, s, s);
      for (let k = 0; k < 3500; k++) { const a = rnd() * 0.07; g.fillStyle = rnd() > .5 ? `rgba(70,70,70,${a})` : `rgba(200,200,198,${a})`; g.fillRect(i * s + rnd() * s, j * s + rnd() * s, 2 + rnd() * 4, 2 + rnd() * 4); }
    }
    g.strokeStyle = height ? '#000' : '#a9a9a6'; g.lineWidth = 3;
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * s, 0); g.lineTo(k * s, h); g.stroke(); g.beginPath(); g.moveTo(0, k * s); g.lineTo(w, k * s); g.stroke(); }
  };
  make('greyTile', 1024, 1024, (g, w, h, r) => greyTile(g, w, h, r, false), (g, w, h, r) => greyTile(g, w, h, r, true), 61);

  /* ── Tarima de roble, lamas de 20 cm (1,2 m) ── */
  const planks = (g, w, h, rnd, height) => {
    const rows = 6, ph = h / rows;
    g.fillStyle = height ? '#000' : '#6b4a2c'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * w * 0.6;
      while (x < w) {
        const len = w * (0.45 + rnd() * 0.5), y = r * ph;
        g.save(); g.beginPath(); g.rect(x + 1.5, y + 1.5, len - 3, ph - 3); g.clip();
        if (height) { g.fillStyle = '#fff'; g.fill(); }
        else {
          const t = 190 + rnd() * 34; g.fillStyle = `rgb(${t},${t * 0.72},${t * 0.47})`; g.fill();
          for (let l = 0; l < 30; l++) { const yy = y + rnd() * ph; g.strokeStyle = rnd() > .4 ? `rgba(100,62,30,${0.05 + rnd() * 0.12})` : `rgba(245,210,165,${0.05 + rnd() * 0.1})`; g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + (rnd() - .5) * 6, x + len * .7, yy + (rnd() - .5) * 6, x + len, yy); g.stroke(); }
        }
        g.restore(); x += len;
      }
    }
  };
  make('planks', 1024, 1024, (g, w, h, r) => planks(g, w, h, r, false), (g, w, h, r) => planks(g, w, h, r, true), 72);

  /* ── Tapicerías: la textura va en gris claro y se tiñe con el color del catálogo ── */
  // Bouclé: rizos pequeños (0,25 m)
  const boucle = (g, w, h, rnd, height) => {
    g.fillStyle = height ? '#5a5a5a' : '#dcdcdc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30000; i++) {
      const x = rnd() * w, y = rnd() * h, r = 2.5 + rnd() * 4.5, v = height ? 140 + rnd() * 115 : 200 + rnd() * 55;
      g.strokeStyle = `rgba(${v},${v},${v},.9)`; g.lineWidth = 1.4 + rnd() * 1.4; g.beginPath(); g.arc(x, y, r, rnd() * 6, rnd() * 6 + 4.2); g.stroke();
    }
  };
  make('boucle', 1024, 1024, (g, w, h, r) => boucle(g, w, h, r, false), (g, w, h, r) => boucle(g, w, h, r, true), 201);
  // Lino: trama fina con hilos irregulares (0,25 m)
  const linen = (g, w, h, rnd, height) => {
    g.fillStyle = height ? '#808080' : '#e6e6e6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { const v = height ? 100 + rnd() * 90 : 200 + rnd() * 50; g.fillStyle = `rgba(${v},${v},${v},.55)`; g.fillRect(i, 0, 1 + (rnd() > .9 ? 1 : 0), h); }
    for (let j = 0; j < h; j += 2) { const v = height ? 100 + rnd() * 90 : 200 + rnd() * 50; g.fillStyle = `rgba(${v},${v},${v},.45)`; g.fillRect(0, j, w, 1 + (rnd() > .9 ? 1 : 0)); }
    for (let k = 0; k < 260; k++) { const v = height ? 255 : 245, y = rnd() * h, x = rnd() * w; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(x, y, 20 + rnd() * 60, 1.5); }
  };
  make('linen', 512, 512, (g, w, h, r) => linen(g, w, h, r, false), (g, w, h, r) => linen(g, w, h, r, true), 202);
  // Terciopelo: casi liso, con aguas suaves
  make('velvet', 512, 512, (g, w, h, rnd) => {
    g.fillStyle = '#eaeaea'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 120, c = rnd() > .5 ? '255,255,255' : '160,160,160'; wrap9(w, h, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(${c},.12)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); }); }
  }, null, 203);
  // Pana: canutillo de unos 8 mm (0,25 m)
  const corduroy = (g, w, h, rnd, height) => {
    const n = 32, s = w / n, hi = height ? 255 : 240, lo = height ? 40 : 170;
    for (let i = 0; i < n; i++) { const gr = g.createLinearGradient(i * s, 0, (i + 1) * s, 0); gr.addColorStop(0, `rgb(${lo},${lo},${lo})`); gr.addColorStop(0.5, `rgb(${hi},${hi},${hi})`); gr.addColorStop(1, `rgb(${lo},${lo},${lo})`); g.fillStyle = gr; g.fillRect(i * s, 0, s, h); }
    if (!height) noise(g, w, h, rnd, 4000, ['rgba(255,255,255,A)', 'rgba(0,0,0,A)'], 1.5);
  };
  make('corduroy', 512, 512, (g, w, h, r) => corduroy(g, w, h, r, false), (g, w, h, r) => corduroy(g, w, h, r, true), 204);

  /* ── Alfombras ── */
  // Yute trenzado (0,5 m)
  const jute = (g, w, h, rnd, height) => {
    g.fillStyle = height ? '#000' : '#8a6c45'; g.fillRect(0, 0, w, h);
    const n = 16, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n * 2; j++) {
      const up = (i + j) % 2 === 0;
      g.save(); g.translate(i * s + s / 2, j * s / 2 + s / 4); g.rotate(up ? 0.5 : -0.5);
      if (height) g.fillStyle = '#fff'; else { const t = 175 + rnd() * 40; g.fillStyle = `rgb(${t},${t * 0.8},${t * 0.55})`; }
      g.beginPath(); g.ellipse(0, 0, s * 0.48, s * 0.2, 0, 0, 6.3); g.fill(); g.restore();
    }
  };
  make('jute', 512, 512, (g, w, h, r) => jute(g, w, h, r, false), (g, w, h, r) => jute(g, w, h, r, true), 301);
  // Bereber: crema con rombos oscuros (1,2 m)
  make('berber', 1024, 1024, (g, w, h, rnd) => {
    g.fillStyle = '#EDE5D6'; g.fillRect(0, 0, w, h);
    noise(g, w, h, rnd, 20000, ['rgba(120,100,80,A)', 'rgba(255,255,255,A)'], 2);
    g.strokeStyle = 'rgba(60,45,35,.8)'; g.lineWidth = 7; g.lineJoin = 'round';
    const n = 3, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const cx = i * s + s / 2, cy = j * s + s / 2, a = s * 0.42, b = s * 0.5;
      g.beginPath(); g.moveTo(cx, cy - b); g.lineTo(cx + a, cy); g.lineTo(cx, cy + b); g.lineTo(cx - a, cy); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx - 12, cy); g.lineTo(cx + 12, cy); g.stroke();
    }
  }, null, 302);

  /* ── Yeso pintado: relieve muy suave para que la pared no parezca plástico (1,6 m) ── */
  make('plaster', 1024, 1024, (g, w, h, rnd) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = rnd() * w, y = rnd() * h, r = 20 + rnd() * 90, v = rnd() > .5 ? 255 : 0, a = 0.03 + rnd() * 0.05; wrap9(w, h, (dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); }); }
    noise(g, w, h, rnd, 60000, ['rgba(255,255,255,A)', 'rgba(0,0,0,A)'], 1.2);
  }, null, 401);

  /* ── Manta de punto grueso (0,2 m) ── */
  const knit = (g, w, h, rnd, height) => {
    g.fillStyle = height ? '#000' : '#cfcfcf'; g.fillRect(0, 0, w, h);
    const cols = 8, rows = 12, cw = w / cols, rh = h / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) for (const side of [-1, 1]) {
      const cx = i * cw + cw / 2 + side * cw * 0.2, cy = j * rh + rh / 2;
      g.save(); g.translate(cx, cy); g.rotate(side * 0.55);
      const gr = g.createRadialGradient(0, 0, 1, 0, 0, cw * 0.32);
      if (height) { gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#222'); } else { const v = 225 + rnd() * 25; gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(1, 'rgb(170,170,170)'); }
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, cw * 0.2, rh * 0.62, 0, 0, 6.3); g.fill(); g.restore();
    }
  };
  make('knit', 512, 512, (g, w, h, r) => knit(g, w, h, r, false), (g, w, h, r) => knit(g, w, h, r, true), 402);

  return { tex: out, thumbs, warmUp };
}
