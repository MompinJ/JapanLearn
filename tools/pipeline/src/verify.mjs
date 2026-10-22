// Invariantes que DEBEN cumplirse. Si alguna falla, el contenido no sirve.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DIRS } from './config.mjs';

const dbPath = path.join(DIRS.assetsDb, 'japanese.db');
const db = new Database(dbPath, { readonly: true });
let failures = 0;
const q = (sql) => db.prepare(sql).get().n;
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures++;
};

console.log('\n== Invariantes de contenido ==');

// 1. pos contiguo 1..N
const { n, mn, mx } = db.prepare('SELECT COUNT(*) n, MIN(pos) mn, MAX(pos) mx FROM curriculum').get();
check('curriculum con pos contiguo 1..N', mn === 1 && mx === n, `n=${n} min=${mn} max=${mx}`);

// 2. EL invariante clave: todo glifo aparece DESPUES de todos sus componentes
const violations = db.prepare(`
  SELECT g.literal AS kanji, cg.literal AS comp, c1.pos AS kpos, c2.pos AS cpos
  FROM curriculum c1
  JOIN glyph g            ON g.id = c1.glyph_id
  JOIN glyph_component gc ON gc.glyph_id = c1.glyph_id
  JOIN glyph cg           ON cg.id = gc.component_id
  JOIN curriculum c2      ON c2.glyph_id = gc.component_id
  WHERE c2.pos > c1.pos
  ORDER BY c1.pos LIMIT 10
`).all();
check('todo kanji va despues de sus componentes', violations.length === 0,
  violations.length ? JSON.stringify(violations.slice(0, 3)) : '0 violaciones');

// 3. golden: los primeros kanji del curriculum
const GOLDEN = ('日 一 囗 丶 玉 国 人 二 厶 云 会 丿 十 干 年 大 木 本 口 丨 中 長 山 凵 出 三 土 寸 寺 時 '
              + '彳 行 示 社 目 八 儿 見 月 刀').split(' ');
const firstK = db.prepare(`
  SELECT g.literal FROM curriculum c JOIN glyph g ON g.id = c.glyph_id
  WHERE c.tier != 'kana' ORDER BY c.pos LIMIT 40`).all().map(r => r.literal);
check('golden de los primeros 40 kanji', JSON.stringify(firstK) === JSON.stringify(GOLDEN), firstK.join(' '));

// 3b. El orden es PEDAGOGICO, no de prensa.
//
// Es la regresion que hay que impedir: ordenar por el campo <freq> de KANJIDIC
// a secas es ordenar por un corpus de periodicos, y eso sacaba 政 de kanji nº
// 17 y 議 de nº 25 mientras 食 caia en el 328 y 何 en el 340.
const posOf = db.prepare(`
  SELECT c.pos FROM curriculum c JOIN glyph g ON g.id = c.glyph_id WHERE g.literal = ?`);
const at = (lit) => posOf.get(lit)?.pos ?? Infinity;
const basicos = ['食', '水', '何', '母', '父', '友', '車', '花'];
const prensa = ['政', '議', '総', '経'];
const peorBasico = Math.max(...basicos.map(at));
const mejorPrensa = Math.min(...prensa.map(at));
check('los kanji basicos van antes que los de prensa', peorBasico < mejorPrensa,
  `ultimo basico en ${peorBasico}, primero de prensa en ${mejorPrensa}`);

// 3c. El kanji no puede quedar detras de un muro de silabario.
const firstKanjiPos = db.prepare(
  `SELECT MIN(pos) n FROM curriculum WHERE tier != 'kana'`).get().n;
check('el primer kanji llega antes de la posicion 150', firstKanjiPos < 150,
  `posicion ${firstKanjiPos}`);

// 3d. Ningun componente se ensena con el nombre de radical en ingles.
const compSinEs = db.prepare(`
  SELECT COUNT(*) n FROM curriculum c
  WHERE c.tier = 'component'
    AND NOT EXISTS (SELECT 1 FROM glyph_meaning m
                     WHERE m.glyph_id = c.glyph_id AND m.lang = 'es' AND m.ord = 0)`).get().n;
check('todo componente del curriculum tiene nombre en espanol', compSinEs === 0,
  `${compSinEs} con nombre solo en ingles`);

// 4. todo item tier='kanji' tiene al menos un significado
const noMeaning = db.prepare(`
  SELECT COUNT(*) n FROM curriculum c
  WHERE c.tier = 'kanji'
    AND NOT EXISTS (SELECT 1 FROM glyph_meaning m WHERE m.glyph_id = c.glyph_id)`).get().n;
check('todo kanji del curriculum tiene significado', noMeaning === 0, `${noMeaning} sin significado`);

// 5. todo item tier='kanji' tiene al menos una lectura
const noReading = db.prepare(`
  SELECT COUNT(*) n FROM curriculum c
  WHERE c.tier = 'kanji'
    AND NOT EXISTS (SELECT 1 FROM glyph_reading r WHERE r.glyph_id = c.glyph_id)`).get().n;
check('todo kanji del curriculum tiene lectura', noReading === 0, `${noReading} sin lectura`);

// 6. trazos: no son requisito del item, sino de la tarjeta de ESCRITURA.
//    Un kanji sin trazos en KanjiVG se estudia igual (reconocimiento y lectura),
//    simplemente no genera tarjeta de escritura. Se exige >=99% de cobertura.
const totK = db.prepare(`SELECT COUNT(*) n FROM curriculum WHERE tier='kanji'`).get().n;
const noStrokes = db.prepare(`
  SELECT COUNT(*) n FROM curriculum c JOIN glyph g ON g.id = c.glyph_id
  WHERE c.tier = 'kanji' AND g.has_strokes = 0`).get().n;
check('cobertura de trazos >= 99%', (totK - noStrokes) / totK >= 0.99,
  `${totK - noStrokes}/${totK} = ${(100 * (totK - noStrokes) / totK).toFixed(1)}% (${noStrokes} sin tarjeta de escritura)`);

// 7. kana simples con trazos (los yoon son compuestos: se leen, no se escriben)
const kanaNoStrokes = db.prepare(`
  SELECT COUNT(*) n FROM curriculum c JOIN glyph g ON g.id = c.glyph_id
  WHERE c.tier = 'kana' AND g.has_strokes = 0 AND LENGTH(g.literal) = 1`).get().n;
check('todo kana simple tiene trazos', kanaNoStrokes === 0, `${kanaNoStrokes} sin trazos`);

// 8. cobertura de espanol en el curriculum
const es = db.prepare(`
  SELECT COUNT(DISTINCT c.glyph_id) n FROM curriculum c
  JOIN glyph_meaning m ON m.glyph_id = c.glyph_id AND m.lang = 'es'
  WHERE c.tier = 'kanji'`).get().n;
const tot = db.prepare(`SELECT COUNT(*) n FROM curriculum WHERE tier='kanji'`).get().n;
check('cobertura de espanol >= 70%', es / tot >= 0.70, `${es}/${tot} = ${(100 * es / tot).toFixed(1)}%`);

// 9. sin sidecars WAL junto al artefacto
const sidecars = ['-wal', '-shm'].filter(x => fs.existsSync(dbPath + x));
check('sin sidecars -wal/-shm', sidecars.length === 0, sidecars.join(' ') || 'limpio');

// 10. journal mode del artefacto
const jm = db.pragma('journal_mode', { simple: true });
check("journal_mode = delete (NO wal)", jm === 'delete', jm);

// ---- vocabulario
console.log('\n== Invariantes de vocabulario ==');

const wTot = q('SELECT COUNT(*) n FROM word');
check('hay vocabulario', wTot > 20000, `${wTot} palabras`);

// toda palabra debe ser ensenable: sus kanji estan en el curriculum
const unteachable = db.prepare(`
  SELECT COUNT(*) n FROM word w
  WHERE EXISTS (
    SELECT 1 FROM word_glyph wg
    WHERE wg.word_id = w.id
      AND NOT EXISTS (SELECT 1 FROM curriculum c WHERE c.glyph_id = wg.glyph_id))`).get().n;
check('toda palabra usa solo kanji del curriculum', unteachable === 0, `${unteachable} no ensenables`);

// las anclas deben desbloquearse DESPUES de su kanji, nunca antes
const early = db.prepare(`
  SELECT COUNT(*) n FROM curriculum_word cw
  JOIN curriculum c ON c.glyph_id = cw.glyph_id
  JOIN word w       ON w.id = cw.word_id
  WHERE w.curriculum_pos < c.pos`).get().n;
check('ninguna palabra ancla llega antes que su kanji', early === 0, `${early} adelantadas`);

// ids de sense deterministas
const badSense = q('SELECT COUNT(*) n FROM sense WHERE id != word_id * 100 + ord');
check('sense.id = word_id*100 + ord', badSense === 0, `${badSense} mal formados`);

// toda glosa cuelga de un sense existente
const orphanGloss = db.prepare(
  'SELECT COUNT(*) n FROM gloss g WHERE NOT EXISTS (SELECT 1 FROM sense s WHERE s.id = g.sense_id)').get().n;
check('sin glosas huerfanas', orphanGloss === 0, `${orphanGloss} huerfanas`);

const anchored = q("SELECT COUNT(DISTINCT glyph_id) n FROM curriculum_word");
const kanjiN = q("SELECT COUNT(*) n FROM curriculum WHERE tier='kanji'");
check('>=80% de kanji tienen palabra ancla', anchored / kanjiN >= 0.80,
  `${anchored}/${kanjiN} = ${(100*anchored/kanjiN).toFixed(1)}%`);

const esWords = q('SELECT COUNT(*) n FROM word WHERE has_es = 1');
check('>=55% del vocabulario con espanol', esWords / wTot >= 0.55,
  `${esWords}/${wTot} = ${(100*esWords/wTot).toFixed(1)}%`);

// El headword es lo que va DELANTE de la tarjeta: nunca cifras ni alfabeto
// latino (１月, ３０００, ＯＵＴ), que ensenan a leer un teclado.
const noJapones = db.prepare(
  "SELECT COUNT(*) n FROM word WHERE headword GLOB '*[0-9０-９A-Za-zＡ-Ｚａ-ｚ]*'").get().n;
check('ningun headword con cifras o alfabeto latino', noJapones === 0, `${noJapones} con basura`);

// Una palabra anclada a un KANA tiene que poder leerse con kana. Si su headword
// lleva kanji, la tarjeta pide leer algo que el usuario no ha visto nunca.
const kanjiEnKana = db.prepare(`
  SELECT COUNT(*) n FROM curriculum_word cw
  JOIN curriculum c ON c.glyph_id = cw.glyph_id
  JOIN word w       ON w.id = cw.word_id
  WHERE c.tier = 'kana' AND w.headword != w.reading`).get().n;
check('toda palabra ancla de un kana se escribe en kana', kanjiEnKana === 0,
  `${kanjiEnKana} con kanji delante`);

const bytes = fs.statSync(dbPath).size;
check('BD <= 25 MB', bytes <= 25 * 1024 * 1024, `${(bytes/1048576).toFixed(2)} MB`);

console.log(`\n${failures === 0 ? 'TODAS LAS INVARIANTES OK' : failures + ' INVARIANTES FALLIDAS'}\n`);
db.close();
process.exit(failures === 0 ? 0 : 1);
