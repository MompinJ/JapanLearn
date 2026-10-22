// Deriva el conjunto EXACTO de codepoints que la app puede llegar a mostrar,
// leyendolo de la BD ya construida. Asi el subset de la fuente no se adivina:
// si un caracter esta en el contenido, esta en la fuente.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DIRS } from './config.mjs';

export function buildCharset() {
  const db = new Database(path.join(DIRS.assetsDb, 'japanese.db'), { readonly: true });
  const cps = new Set();
  const add = (s) => { if (s) for (const ch of s) cps.add(ch.codePointAt(0)); };

  for (const r of db.prepare('SELECT literal FROM glyph').all()) add(r.literal);
  for (const r of db.prepare('SELECT reading FROM glyph_reading').all()) add(r.reading);
  for (const r of db.prepare('SELECT text FROM glyph_meaning').all()) add(r.text);
  for (const r of db.prepare('SELECT headword, reading FROM word').all()) { add(r.headword); add(r.reading); }
  for (const r of db.prepare('SELECT form FROM word_form').all()) add(r.form);
  for (const r of db.prepare('SELECT text FROM gloss').all()) add(r.text);
  db.close();

  // ASCII + Latin-1 (acentos del espanol) + puntuacion y kana completos
  for (let c = 0x20; c <= 0x7e; c++) cps.add(c);
  for (let c = 0xa0; c <= 0xff; c++) cps.add(c);
  for (let c = 0x3000; c <= 0x303f; c++) cps.add(c);   // puntuacion CJK
  for (let c = 0x3040; c <= 0x30ff; c++) cps.add(c);   // hiragana + katakana
  for (let c = 0xff00; c <= 0xffef; c++) cps.add(c);   // formas de ancho completo

  const list = [...cps].sort((a, b) => a - b);
  const file = path.join(DIRS.cache, 'charset.txt');
  fs.writeFileSync(file, list.map((c) => c.toString(16).toUpperCase().padStart(4, '0')).join('\n'));
  return { file, count: list.length };
}
