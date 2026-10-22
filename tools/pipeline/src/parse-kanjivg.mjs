// KanjiVG -> componentes directos (profundidad 1) + paths SVG de cada trazo.
//
// Dos decisiones que importan:
//  1. Solo profundidad 1. La descomposicion recursiva completa mete ruido.
//  2. Se usa kvg:original ?? kvg:element, para que 海 se descomponga en 水
//     (que tiene significado ensenable) y no en la forma deformada 氵.
import fs from 'node:fs';

const VIEW_BOX = '0 0 109 109';

export function parseKanjivg(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const components = new Map(); // literal -> [literal de componente]
  const strokes = new Map();    // literal -> [{d, type}]

  for (const m of xml.matchAll(/<kanji id="kvg:kanji_([0-9a-f_]+)"[^>]*>([\s\S]*?)<\/kanji>/g)) {
    const hex = m[1].split('-')[0];
    let literal;
    try { literal = String.fromCodePoint(parseInt(hex, 16)); } catch { continue; }
    const body = m[2];

    // --- trazos, en orden de aparicion (que es el orden canonico de escritura)
    const paths = [];
    for (const p of body.matchAll(/<path[^>]*?\sd="([^"]+)"[^>]*>/g)) {
      const tag = p[0];
      const type = /kvg:type="([^"]+)"/.exec(tag);
      paths.push({ d: p[1], t: type ? type[1] : null });
    }
    if (paths.length) strokes.set(literal, paths);

    // --- componentes directos: elementos <g> a profundidad 1 bajo el <g> raiz
    const comps = [];
    let depth = -1;
    for (const t of body.matchAll(/<g\b[^>]*>|<\/g>/g)) {
      const tag = t[0];
      if (tag === '</g>') { depth--; continue; }
      depth++;
      if (depth !== 1) continue;
      const orig = /kvg:original="([^"]+)"/.exec(tag);
      const elem = /kvg:element="([^"]+)"/.exec(tag);
      const c = (orig && orig[1]) || (elem && elem[1]);
      if (c && c !== literal && [...c].length === 1) comps.push(c);
    }
    if (comps.length) components.set(literal, comps);
  }

  return { components, strokes, viewBox: VIEW_BOX };
}
