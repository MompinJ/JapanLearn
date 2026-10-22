// KANJIDIC2 -> registros de kanji.
// Se parsea por bloques con regex a proposito: el archivo tiene un DTD con
// entidades internas que hace fallar a los parsers SAX estandar, y la estructura
// de <character> es lo bastante regular como para que esto sea seguro y rapido.
import fs from 'node:fs';

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]);

const one = (re, s) => { const m = re.exec(s); return m ? m[1] : null; };
const num = (re, s) => { const v = one(re, s); return v == null ? null : parseInt(v, 10); };

export function parseKanjidic(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = new Map(); // literal -> registro

  for (const m of xml.matchAll(/<character>([\s\S]*?)<\/character>/g)) {
    const b = m[1];
    // /u es obligatorio: sin el, '.' no captura pares suplentes y se pierden
    // los ~300 kanji fuera del BMP
    const literal = one(/<literal>(.)<\/literal>/u, b);
    if (!literal) continue;

    // significados: <meaning> sin atributo es INGLES; m_lang="es" es espanol
    const es = [...b.matchAll(/<meaning m_lang="es">([^<]+)<\/meaning>/g)].map((x) => decode(x[1]));
    const en = [...b.matchAll(/<meaning>([^<]+)<\/meaning>/g)].map((x) => decode(x[1]));

    const on = [...b.matchAll(/<reading r_type="ja_on">([^<]+)<\/reading>/g)].map((x) => x[1]);
    const kun = [...b.matchAll(/<reading r_type="ja_kun">([^<]+)<\/reading>/g)].map((x) => x[1]);
    const nanori = [...b.matchAll(/<nanori>([^<]+)<\/nanori>/g)].map((x) => x[1]);

    out.set(literal, {
      literal,
      id: literal.codePointAt(0),
      grade: num(/<grade>(\d+)<\/grade>/, b),
      freq: num(/<freq>(\d+)<\/freq>/, b),
      jlpt: num(/<jlpt>(\d+)<\/jlpt>/, b),
      strokeCount: num(/<stroke_count>(\d+)<\/stroke_count>/, b),
      radical: num(/<rad_value rad_type="classical">(\d+)<\/rad_value>/, b),
      meaningsEs: es,
      meaningsEn: en,
      on,
      kun,
      nanori,
    });
  }
  return out;
}

export function summarize(kanji) {
  const all = [...kanji.values()];
  const targets = all.filter((k) => k.grade != null);
  const withEs = targets.filter((k) => k.meaningsEs.length > 0);
  return {
    total: all.length,
    targets: targets.length,
    targetsWithEs: withEs.length,
    esCoverage: withEs.length / targets.length,
  };
}
