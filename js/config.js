/*
 * Configuración de la sala.
 * ─────────────────────────────────────────────────────────────
 * Todas las medidas en metros. El origen (0,0) es la esquina interior
 * donde se unen la pared de la ventana y la pared del sofá.
 *   x → hacia la pared de la TV
 *   z → hacia la cocina (el lado abierto)
 *
 *          winX        winW (nicho de nicheD de fondo)
 *   (0,0) ──────┐                ┌──────── Wt
 *     │         └──── ventana ───┘         │
 *     L (pared del sofá)                   R (pared de la TV)
 *     │                                    │
 *     └ ─ ─ ─ ─ ─ ─ Wb (abierto a la cocina) ─ ─ ┘
 *
 * La pared de la TV no es del todo paralela a la del sofá: arriba la sala mide Wt
 * y abajo Wb. Estas son las medidas de mi sala; se cambian desde «Mis medidas».
 */

export const DEFAULT_ROOM = {
  Wb: 3.165,      // ancho junto a la cocina
  Wt: 3.135,      // ancho junto a la ventana (68 + 146 + 99,5)
  L: 2.43,        // pared del sofá
  R: 2.80,        // pared de la TV
  winX: 0.68,     // de la esquina del sofá al nicho de la ventana
  winW: 1.46,     // ancho del nicho
  nicheD: 0.305,  // fondo del nicho
  frame: 0.14,    // pared a cada lado de la ventana, dentro del nicho
  H: 2.60,        // techo
};

// Límites del formulario «Mis medidas»
export const ROOM_LIMITS = {
  Wb: [2.4, 6.0], Wt: [2.4, 6.0], L: [1.6, 6.0], R: [1.6, 6.0], winX: [0.1, 4.0], winW: [0.6, 3.0],
  nicheD: [0, 0.6], frame: [0, 0.4], H: [2.3, 3.2],
};

export const T = 0.10;   // grosor de muro

// Muebles de partida (metros; la TV en pulgadas). También se cambian desde «Mis medidas».
export const DEFAULT_FURNITURE = {
  sofaL: 2.40, sofaD: 0.90, chaiseL: 1.55,    // sofá con chaise longue
  deskW: 1.20, deskD: 0.60,                   // escritorio con cajonera
  tvUnitW: 1.50, tvUnitD: 0.40,               // mueble bajo de la TV
  tvIn: 50,                                   // TV (pulgadas)
  shelfL: 1.80,                               // repisa sobre el escritorio y la TV
  coffeeW: 0.80,                              // mesa de centro
};
export const FURNITURE_LIMITS = {
  sofaL: [1.40, 3.60], sofaD: [0.70, 1.20], chaiseL: [1.20, 2.00],
  deskW: [0.80, 1.80], deskD: [0.45, 0.80],
  tvUnitW: [0.80, 2.60], tvUnitD: [0.30, 0.55],
  tvIn: [32, 85],
  shelfL: [0.60, 3.00],
  coffeeW: [0.50, 1.20],
};

// Alturas fijas (metros)
export const HEIGHTS = { seat: 0.44, back: 0.84, desk: 0.74, tvUnit: 0.42, shelf: 1.86, tvCenter: 1.30, coffee: 0.42 };
export const WINDOW = { h: 2.20, box: 0.22 };   // balconera de dos hojas y cajón de persiana encima
export const BALCONY = { depth: 0.45, rail: 1.0 }; // balcón de asomarse con barandilla de forja

/*
 * Catálogo de acabados: 4 opciones por categoría, tendencias 2025–2026.
 * type: 'fabric' (tapicería) | 'color' | 'wood' | textura procedural (ver js/textures.js)
 */
export const CATALOG = {
  sofa: {
    label: 'Tapicería del sofá',
    options: [
      { id: 'boucle', name: 'Bouclé crudo', tex: 'boucle', color: '#E4DBCC', roughness: 0.95, size: 0.18, bump: 2.2 },
      { id: 'lino', name: 'Lino arena', tex: 'linen', color: '#CDBCA3', roughness: 0.9, size: 0.12, bump: 1.2 },
      { id: 'oliva', name: 'Terciopelo oliva', tex: 'velvet', color: '#6E7248', roughness: 0.62, sheen: 1, size: 0.6 },
      { id: 'terracota', name: 'Pana terracota', tex: 'corduroy', color: '#B5673F', roughness: 0.85, size: 0.2, bump: 2 },
    ],
  },
  madera: {
    label: 'Muebles',
    options: [
      { id: 'roble', name: 'Roble claro', type: 'wood', tint: '#ffffff' },
      { id: 'nogal', name: 'Nogal', type: 'wood', tint: '#86705f' },
      { id: 'blanco', name: 'Lacado blanco', type: 'color', color: '#EFEDE8' },
      { id: 'grafito', name: 'Grafito mate', type: 'color', color: '#3A3D3F' },
    ],
  },
  pared: {
    label: 'Pintura de pared',
    options: [
      { id: 'blanco', name: 'Blanco cálido', color: '#EFEBE4' },
      { id: 'greige', name: 'Greige', color: '#D8D0C4' },
      { id: 'arcilla', name: 'Arcilla', color: '#D9B8A0' },
      { id: 'niebla', name: 'Verde niebla', color: '#C6CEC0' },
    ],
  },
  suelo: {
    label: 'Suelo',
    options: [
      { id: 'gris', name: 'Porcelánico gris 60×60', tex: 'greyTile', size: 1.2, roughness: 0.32, clearcoat: 0.55 },
      { id: 'espiga', name: 'Roble espiga', tex: 'herringbone', size: 0.9, roughness: 0.45, clearcoat: 0.2 },
      { id: 'tarima', name: 'Tarima de roble', tex: 'planks', size: 1.2, roughness: 0.5, clearcoat: 0.15 },
      { id: 'microcemento', name: 'Microcemento', tex: 'microcement', size: 2.0, roughness: 0.5, clearcoat: 0.25 },
    ],
  },
  alfombra: {
    label: 'Alfombra',
    options: [
      { id: 'ninguna', name: 'Sin alfombra', none: true },
      { id: 'yute', name: 'Yute natural', tex: 'jute', size: 0.5 },
      { id: 'bereber', name: 'Bereber crema', tex: 'berber', size: 1.2 },
      { id: 'terracota', name: 'Lisa terracota', color: '#B87254' },
    ],
  },
};

// Estilos: combinaciones listas para aplicar de un clic
export const PRESETS = [
  { id: 'actual', name: 'Como la tengo', fin: { sofa: 'boucle', madera: 'roble', pared: 'blanco', suelo: 'gris', alfombra: 'ninguna' } },
  { id: 'japandi', name: 'Japandi', fin: { sofa: 'lino', madera: 'roble', pared: 'greige', suelo: 'tarima', alfombra: 'yute' } },
  { id: 'mediterraneo', name: 'Mediterráneo', fin: { sofa: 'terracota', madera: 'blanco', pared: 'arcilla', suelo: 'microcemento', alfombra: 'bereber' } },
  { id: 'oscuro', name: 'Oliva y nogal', fin: { sofa: 'oliva', madera: 'nogal', pared: 'niebla', suelo: 'espiga', alfombra: 'terracota' } },
];

// Diseño que se abre por defecto (el de Ricardo)
export const DEFAULT_DESIGN = { layout: 'A', fin: { ...PRESETS[0].fin } };
