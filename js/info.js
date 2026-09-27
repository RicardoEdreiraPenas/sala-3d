/*
 * Textos del panel: muebles y comprobaciones.
 * Todo sale de las medidas y de dónde ha quedado cada mueble, así que sigue
 * valiendo cuando alguien cambia las medidas en «Mis medidas».
 *
 * ctx = { L, met, room, f, fmt, cm, c1 }
 *   L     distribución 'A' | 'B'
 *   met   métricas de buildLayout(): posiciones, pasos, apertura de la balconera…
 *   room  geometría de la sala (computeRoom)
 *   f     medidas de los muebles (metros; la TV en pulgadas)
 * Cada comprobación es [estado, etiqueta, título, explicación]; estado: 'ok' | 'warn'.
 */
const NAMES = { sofa: 'el sofá', chaise: 'la chaise longue', desk: 'el escritorio', tvUnit: 'el mueble de la TV', coffee: 'la mesa de centro' };

export function panelInfo({ L, met, room: g, f, fmt, cm, c1 }) {
  const m = v => `${fmt(v)} m`, cms = v => `${Math.max(0, cm(v))} cm`;
  const items = [];
  items.push(['Sofá con chaise longue', `${c1(f.sofaL)} × ${c1(f.sofaD)}`, `En la pared de ${m(g.L)}, con la chaise ${L === 'B' ? 'hacia la ventana' : 'hacia la cocina'} (${c1(f.chaiseL)} cm de largo). El extremo queda a ras del final de la pared.`]);
  items.push(['Escritorio con cajonera', `${c1(f.deskW)} × ${c1(f.deskD)}`, 'En la esquina de la pared de la TV junto a la ventana, con luz natural de lado.']);
  items.push(['Mueble de TV', `${c1(f.tvUnitW)} × ${c1(f.tvUnitD)}`, `Bajo, de ${c1(0.42)} cm de alto, a continuación del escritorio.`]);
  items.push([`TV ${f.tvIn}″`, `${c1(met.tv.w)} × ${c1(met.tv.h)}`, `Colgada en la pared, centrada sobre el mueble, con el centro a 130 cm del suelo.`]);
  items.push(['Repisa', `${c1(f.shelfL)} × 22`, `A 186 cm del suelo, sobre el escritorio y la TV.`]);
  items.push(['Mesa de centro', `${c1(f.coffeeW)} × ${c1(Math.round(f.coffeeW * 62) / 100)}`, 'Delante del sofá, en la parte sin chaise.']);

  const checks = [];
  // El sofá no sobresale de su pared
  const over = met.sofa.over;
  checks.push(over <= 0.005
    ? ['ok', 'Cabe', 'Sofá en su pared', `Mide ${c1(f.sofaL)} cm y la pared ${c1(g.L)}: no sobresale hacia la cocina${over < -0.02 ? ` y sobran ${cms(-over)}` : ''}.`]
    : ['warn', 'Sobresale', 'Sofá en su pared', `Mide ${c1(f.sofaL)} cm y la pared ${c1(g.L)}: sobresale ${cms(over)} hacia la cocina. Busca uno de ${c1(g.L)} cm como mucho.`]);

  // Distancia a la TV
  const d = met.viewDist, diag = met.tv.diag, ratio = d / diag;
  const inMin = Math.round(d / 2.1 / 0.0254 / 5) * 5, inMax = Math.round(d / 1.2 / 0.0254 / 5) * 5;
  checks.push(ratio <= 2.1 && ratio >= 1.2
    ? ['ok', 'Bien', 'Distancia a la TV', `Desde el sofá a la pantalla hay unos ${m(d)}. Para una TV 4K a esa distancia va bien de ${inMin}″ a ${inMax}″, y la tuya es de ${f.tvIn}″.`]
    : ratio > 2.1
      ? ['warn', 'Pequeña', 'Distancia a la TV', `Hay unos ${m(d)} hasta la pantalla y a esa distancia una de ${f.tvIn}″ se queda pequeña. Lo cómodo es de ${inMin}″ a ${inMax}″.`]
      : ['warn', 'Grande', 'Distancia a la TV', `Hay unos ${m(d)} hasta la pantalla: una de ${f.tvIn}″ está demasiado cerca. Lo cómodo es de ${inMin}″ a ${inMax}″.`]);
  checks.push(met.eyeTilt <= 15
    ? ['ok', 'Bien', 'Altura de la TV', `Sentado, miras el centro de la pantalla ${Math.round(Math.max(0, met.eyeTilt))}° hacia arriba. Hasta 15° no cansa el cuello.`]
    : ['warn', 'Alta', 'Altura de la TV', `Sentado miras ${Math.round(met.eyeTilt)}° hacia arriba: bájala un poco.`]);

  // La TV y la repisa
  const tvTop = 1.30 + met.tv.h / 2, gap = 1.83 - tvTop;
  const shelfOver = met.shelf.u1 > met.tv.uc - met.tv.w / 2 && met.shelf.u0 < met.tv.uc + met.tv.w / 2;
  if (shelfOver) checks.push(gap >= 0.12 ? ['ok', 'Bien', 'Repisa sobre la TV', `Quedan ${cms(gap)} entre el borde de la TV y la repisa.`] : ['warn', 'Choca', 'Repisa sobre la TV', `Entre la TV y la repisa solo quedan ${cms(gap)}: sube la repisa o baja la TV.`]);

  // Paso junto a la chaise
  const cp = met.chaisePass;
  checks.push([cp >= 0.75 ? 'ok' : 'warn', cp >= 0.75 ? 'Bien' : cp >= 0.6 ? 'Justo' : 'Estrecho', 'Paso junto a la chaise', `Entre la chaise y ${L === 'B' ? 'lo que tiene enfrente' : 'el mueble de la TV'} quedan ${m(Math.max(0, cp))}. Para pasar cómodo hacen falta unos 75 cm.`]);

  // Mesa de centro
  const cf = met.coffeePass;
  checks.push([cf >= 0.3 && cf <= 0.55 ? 'ok' : 'warn', cf < 0.3 ? 'Justo' : cf > 0.55 ? 'Lejos' : 'Bien', 'Mesa de centro', `Queda a ${cms(cf)} del sofá. Lo habitual es entre 30 y 50 cm para llegar sin levantarse y poder pasar.`]);

  // Balconera
  const lv = met.leaves, who = id => NAMES[id] || 'un mueble';
  if (lv.left >= 90 && lv.right >= 90) checks.push(['ok', 'Bien', 'Balconera', `Las dos hojas (${cms(lv.leafW)} cada una) abren del todo: el nicho de ${cms(g.nicheD)} se come parte del giro y lo que sobra no toca ningún mueble.`]);
  else {
    const parts = [];
    if (lv.left < 90) parts.push(`la izquierda solo abre ${lv.left}° antes de tocar ${who(lv.leftBy)}`);
    if (lv.right < 90) parts.push(`la derecha solo abre ${lv.right}° antes de tocar ${who(lv.rightBy)}`);
    checks.push(['warn', lv.left < 60 || lv.right < 60 ? 'Choca' : 'Justo', 'Balconera', `Cada hoja mide ${cms(lv.leafW)} y ${parts.join(' y ')}.`]);
  }

  // Silla del escritorio
  if (met.chairRoom != null) checks.push([met.chairRoom >= 0.75 ? 'ok' : 'warn', met.chairRoom >= 0.75 ? 'Bien' : 'Justo', 'Silla del escritorio', `Delante del escritorio quedan ${m(met.chairRoom)} para la silla. Con 75 cm te levantas sin mover nada.`]);
  if (met.desk && met.desk.overlap > 0.01) checks.push(['warn', 'No cabe', 'Escritorio y mueble de TV', `Seguidos no caben en la pared de ${m(g.R)}: se solapan ${cms(met.desk.overlap)}.`]);
  if (met.tv.overflow > 0.005) checks.push(['warn', 'No cabe', 'Mueble de TV', `Se pasa ${cms(met.tv.overflow)} del final de la pared.`]);

  // Luz natural
  const pct = g.glassArea / g.area * 100;
  checks.push([pct >= 10 ? 'ok' : 'warn', pct >= 10 ? 'Bien' : 'Poca', 'Luz natural', `La balconera tiene unos ${fmt(g.glassArea, 1)} m² de cristal, un ${Math.round(pct)} % del suelo de la sala. Se suele pedir al menos un 10 %.`]);

  return { items, checks };
}
