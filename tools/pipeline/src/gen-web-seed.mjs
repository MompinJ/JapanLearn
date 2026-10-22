// Genera src/db/webSeed.sql.ts y src/db/webSchema.sql.ts a partir de la BD real.
//
// Sirve SOLO para poder revisar la interfaz en web, donde expo-file-system no
// existe y no se puede cargar el japanese.db empaquetado. En movil nada de esto
// se usa: Metro resuelve webBootstrap.web.ts en web y el stub vacio en nativo.
//
//   node src/gen-web-seed.mjs
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DIRS } from './config.mjs';

const SRC = path.resolve(DIRS.pipeline, '../../src/db');
const db = new Database(path.join(DIRS.assetsDb, 'japanese.db'), { readonly: true });

const esc = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const num = (n) => (n === null || n === undefined ? 'NULL' : n);
const L = ['-- GENERADO por tools/pipeline/src/gen-web-seed.mjs. No editar a mano.'];

const glyphs = db.prepare(`
  SELECT g.*, s.paths, s.view_box, s.count AS scount, c.pos, c.tier
  FROM curriculum c JOIN glyph g ON g.id = c.glyph_id
  LEFT JOIN glyph_strokes s ON s.glyph_id = g.id
  WHERE c.pos <= 12 OR (c.tier != 'kana' AND c.pos <= 230)
  ORDER BY c.pos LIMIT 40`).all();
const ids = new Set(glyphs.map((g) => g.id));

for (const g of glyphs) {
  L.push(`INSERT OR IGNORE INTO glyph (id,literal,kind,stroke_count,grade,jlpt,freq,radical,romaji,has_strokes) VALUES (${g.id},${esc(g.literal)},${esc(g.kind)},${num(g.stroke_count)},${num(g.grade)},${num(g.jlpt)},${num(g.freq)},${num(g.radical)},${esc(g.romaji)},${g.has_strokes});`);
  L.push(`INSERT OR IGNORE INTO curriculum (pos,glyph_id,tier,reason) VALUES (${g.pos},${g.id},${esc(g.tier)},'seed');`);
  if (g.paths) L.push(`INSERT OR IGNORE INTO glyph_strokes (glyph_id,count,view_box,paths) VALUES (${g.id},${g.scount},${esc(g.view_box)},${esc(g.paths)});`);
  for (const m of db.prepare('SELECT lang,ord,text FROM glyph_meaning WHERE glyph_id=? ORDER BY lang,ord LIMIT 4').all(g.id))
    L.push(`INSERT OR IGNORE INTO glyph_meaning VALUES (${g.id},${esc(m.lang)},${m.ord},${esc(m.text)});`);
  for (const r of db.prepare("SELECT kind,ord,reading FROM glyph_reading WHERE glyph_id=? AND kind!='nanori' ORDER BY kind,ord LIMIT 4").all(g.id))
    L.push(`INSERT OR IGNORE INTO glyph_reading VALUES (${g.id},${esc(r.kind)},${r.ord},${esc(r.reading)});`);
  for (const c of db.prepare('SELECT ord,component_id FROM glyph_component WHERE glyph_id=? ORDER BY ord').all(g.id))
    if (ids.has(c.component_id)) L.push(`INSERT OR IGNORE INTO glyph_component VALUES (${g.id},${c.ord},${c.component_id});`);
}

const words = db.prepare(`
  SELECT DISTINCT w.* FROM word w JOIN word_glyph wg ON wg.word_id = w.id
  WHERE wg.glyph_id IN (${[...ids].join(',')})
  ORDER BY w.tier, COALESCE(w.freq_rank, 99) LIMIT 25`).all();

for (const w of words) {
  L.push(`INSERT OR IGNORE INTO word (id,headword,reading,kana_only,tier,freq_rank,has_es,curriculum_pos) VALUES (${w.id},${esc(w.headword)},${esc(w.reading)},${w.kana_only},${w.tier},${num(w.freq_rank)},${w.has_es},${num(w.curriculum_pos)});`);
  // Por IDIOMA, no los 4 primeros por orden: en JMdict los sentidos espanoles
  // van DESPUES de los ingleses, asi que un LIMIT global se los come enteros y
  // la revision en web mostraria ingles donde la app real muestra espanol.
  const senses = [
    ...db.prepare("SELECT id,ord,lang,pos FROM sense WHERE word_id=? AND lang='en' ORDER BY ord LIMIT 2").all(w.id),
    ...db.prepare("SELECT id,ord,lang,pos FROM sense WHERE word_id=? AND lang='es' ORDER BY ord LIMIT 2").all(w.id),
  ];
  for (const s of senses) {
    L.push(`INSERT OR IGNORE INTO sense VALUES (${s.id},${w.id},${s.ord},${esc(s.lang)},${esc(s.pos)});`);
    for (const g2 of db.prepare('SELECT ord,text FROM gloss WHERE sense_id=? ORDER BY ord LIMIT 3').all(s.id))
      L.push(`INSERT OR IGNORE INTO gloss VALUES (${s.id},${g2.ord},${esc(g2.text)});`);
  }
  for (const wg of db.prepare('SELECT glyph_id FROM word_glyph WHERE word_id=?').all(w.id))
    if (ids.has(wg.glyph_id)) L.push(`INSERT OR IGNORE INTO word_glyph VALUES (${w.id},${wg.glyph_id});`);
  for (const cw of db.prepare('SELECT glyph_id,ord FROM curriculum_word WHERE word_id=?').all(w.id))
    if (ids.has(cw.glyph_id)) L.push(`INSERT OR IGNORE INTO curriculum_word VALUES (${cw.glyph_id},${cw.ord},${w.id});`);
}
db.close();

const header = (from) =>
  `// GENERADO desde ${from} por tools/pipeline/src/gen-web-seed.mjs. No editar a mano.\n` +
  `// Solo se usa en WEB, para revisar la interfaz sin dispositivo.\n`;

fs.writeFileSync(path.join(SRC, 'webSeed.sql.ts'),
  header('assets/db/japanese.db') + `export const WEB_SEED_SQL = ${JSON.stringify(L.join('\n'))};\n`);
fs.writeFileSync(path.join(SRC, 'webSchema.sql.ts'),
  header('tools/pipeline/src/schema.sql') +
  `export const WEB_CONTENT_DDL = ${JSON.stringify(fs.readFileSync(path.join(DIRS.pipeline, 'src/schema.sql'), 'utf8'))};\n`);

console.log(`semilla web: ${L.length} sentencias, ${glyphs.length} glifos, ${words.length} palabras`);
