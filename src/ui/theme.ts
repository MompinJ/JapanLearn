/**
 * Paleta inspirada en la estetica japonesa tradicional:
 *   washi (和紙)  papel artesanal, blanco calido y ligeramente irregular
 *   sumi  (墨)    tinta negra de barra, nunca negro puro
 *   shu   (朱色)  bermellon de los sellos y los torii
 *
 * La idea rectora es el MA (間): el espacio vacio no es relleno, es parte de la
 * composicion. Por eso hay pocas lineas, muy finas, y mucho aire.
 */
export const T = {
  // superficies
  bg: '#faf8f3',        // washi
  surface: '#ffffff',
  sunken: '#f3f0e8',

  // tinta
  ink: '#1a1714',       // sumi
  inkMid: '#544b40',
  inkSoft: '#8b8175',
  line: '#e8e2d6',      // trazo fino
  lineSoft: '#f0ebe1',

  // acento
  accent: '#b5402a',    // shu
  accentSoft: '#f6ece9',

  // respuestas: el color refuerza, nunca informa por si solo.
  // Siempre van acompanadas de texto explicito.
  again: '#b5402a',
  hard: '#a8701f',
  good: '#2f6b4f',
  easy: '#35608f',

  esBadge: '#2f6b4f',
  enBadge: '#a8701f',

  // datos (validada con scripts/validate_palette.js, seis chequeos):
  // verde/azul da dE 20.7 en deuteranopia; el verde/ambar anterior solo 7.1.
  // El color sigue el SIGNIFICADO en toda la app, no el orden:
  //   verde = dominado / hecho     azul = aprendiendo / pendiente
  dataDone: '#00875a',
  dataPending: '#3060c0',
  dataRest: '#e8e2d6',

  radius: 14,
  radiusLg: 20,
} as const;

/** Escala tipografica. Se usa en toda la app para que nada quede a ojo. */
export const F = {
  glyph: 128,
  display: 40,
  title: 20,
  body: 16,
  label: 14,
  small: 12.5,
  micro: 10.5,
} as const;
