// Banco de pruebas sin dispositivo.
//
// Dos capas:
//  1. Extrae TODOS los literales SQL estaticos de src/ y los prepara contra la
//     BD real. Eso caza errores de sintaxis y nombres de columna inexistentes
//     sin tener que ejecutar nada, y no se desincroniza del codigo.
//  2. Simula una sesion completa (introducir, graduar, desbloquear escritura y
//     lectura, biblioteca, estadisticas) para comprobar la logica.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DB = path.join(ROOT, 'assets/db/japanese.db');
// El progreso de la prueba es desechable y va al temporal del sistema. Estaba
// apuntando a un directorio de trabajo concreto de otra maquina, asi que el
// test solo arrancaba ahi.
const PROG = path.join(os.tmpdir(), 'japanlearn-smoke-progress.db');

let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`  ${cond ? 'OK  ' : 'FALLA'}  ${name}${detail ? '  -> ' + detail : ''}`);
  if (!cond) fails++;
};

// ---------- preparar BD ----------
for (const f of [PROG, PROG + '-wal', PROG + '-shm']) fs.rmSync(f, { force: true });
const db = new Database(DB);
db.exec('PRAGMA foreign_keys = ON');
db.exec(`ATTACH DATABASE '${PROG}' AS prog`);
db.exec('PRAGMA prog.journal_mode = WAL');

const ts = fs.readFileSync(path.join(ROOT, 'src/db/migrations.ts'), 'utf8');
db.exec(ts.match(/sql: `([\s\S]*?)`,\n  },\n\];/)[1]);
db.exec('PRAGMA prog.user_version = 1');

console.log('\n== 1. Todos los SQL estaticos de src/ compilan ==');
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
let prepared = 0, skipped = 0;
for (const file of walk(path.join(ROOT, 'src'))) {
  const src = fs.readFileSync(file, 'utf8');
  // Plantillas y cadenas con comillas simples. El filtro clave es exigir que la
  // cadena EMPIECE por una palabra SQL: sin eso la regex salta de una plantilla
  // a la siguiente y captura codigo que hay en medio.
  const literals = [
    ...[...src.matchAll(/`([^`]*)`/gs)].map((m) => m[1]),
    ...[...src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]),
  ];
  for (const raw of literals) {
    const sql = raw.trim();
    if (!/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql)) continue;
    if (sql.includes('${')) { skipped++; continue; }        // compuesto: se prueba ejecutandolo
    try { db.prepare(sql); prepared++; }
    catch (e) {
      ok(`SQL en ${path.relative(ROOT, file)}`, false, `${e.message} :: ${sql.slice(0, 90)}`);
    }
  }
}
ok(`${prepared} sentencias SQL estaticas compilan`, true, `${skipped} compuestas se prueban ejecutandolas`);

// ---------- 2. sesion simulada ----------
console.log('\n== 2. Sesion simulada ==');
const now = Date.now();
const CARD_COLS = `id, subject_kind, subject_id, subject_key, card_kind, due,
  stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review`;

const pick = db.prepare(`SELECT c.pos,c.glyph_id,c.tier,g.literal
  FROM curriculum c JOIN glyph g ON g.id=c.glyph_id
  WHERE NOT EXISTS (SELECT 1 FROM prog.introduced i WHERE i.glyph_id=c.glyph_id AND i.tier=c.tier)
  ORDER BY c.pos LIMIT 1`);
const insIntro = db.prepare('INSERT OR IGNORE INTO prog.introduced (glyph_id,tier,pos,at) VALUES (?,?,?,?)');
const insCard = db.prepare(`INSERT OR IGNORE INTO prog.card
  (subject_kind,subject_id,subject_key,card_kind,due,created_at,updated_at)
  VALUES ('glyph',?,?,'recognition',?,?,?)`);

// introducir los 260 primeros items (kana completos + primeros kanji)
let introduced = 0;
for (let i = 0; i < 260; i++) {
  const r = pick.get(); if (!r) break;
  insIntro.run(r.glyph_id, r.tier, r.pos, now);
  insCard.run(r.glyph_id, r.literal, now, now, now);
  introduced++;
}
ok('introduccion por curriculum', introduced === 260, `${introduced} items`);

// graduarlos todos (state=2), como si se hubieran aprendido
db.prepare("UPDATE prog.card SET state=2, stability=10, difficulty=5, reps=3, last_review=? WHERE card_kind='recognition'").run(now);

// --- desbloqueo de tarjetas derivadas (SQL copiado de queue.ts)
//
// El LIMIT es la parte que se prueba. Estas tarjetas no pasan por el
// presupuesto de plan(), asi que sin tope se insertan todas de golpe con
// due = ahora: cientos de tarjetas nuevas marcadas como vencidas de una vez.
const BUDGET = 8;   // DEFAULT_SETTINGS.maxLearning

const unlockWriting = db.prepare(`INSERT INTO prog.card
     (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
   SELECT 'glyph', subject_id, subject_key, 'writing', ?, ?, ?
   FROM (
     SELECT c.subject_id AS subject_id, c.subject_key AS subject_key, cur.pos AS cpos
     FROM prog.card c
     JOIN glyph g        ON g.id = c.subject_id
     JOIN curriculum cur ON cur.glyph_id = c.subject_id
     WHERE c.card_kind = 'recognition' AND c.state = 2
       AND g.has_strokes = 1
       AND cur.tier != 'component'
       AND NOT EXISTS (
         SELECT 1 FROM prog.card w
         WHERE w.subject_kind = 'glyph' AND w.subject_id = c.subject_id
           AND w.card_kind = 'writing')
     ORDER BY cpos
     LIMIT ?
   )`);

const unlockWords = db.prepare(`INSERT INTO prog.card
     (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
   SELECT 'word', id, headword, 'reading', ?, ?, ?
   FROM (
     SELECT DISTINCT w.id AS id, w.headword AS headword, w.curriculum_pos AS cpos
     FROM curriculum_word cw
     JOIN word w ON w.id = cw.word_id
     JOIN prog.card kc ON kc.subject_kind = 'glyph' AND kc.subject_id = cw.glyph_id
                      AND kc.card_kind = 'recognition' AND kc.state = 2
     WHERE NOT EXISTS (
       SELECT 1 FROM word_glyph wg
       WHERE wg.word_id = w.id
         AND NOT EXISTS (
           SELECT 1 FROM prog.card c2
           WHERE c2.subject_kind='glyph' AND c2.subject_id=wg.glyph_id
             AND c2.card_kind='recognition' AND c2.state=2))
       AND NOT EXISTS (
         SELECT 1 FROM prog.card c3
         WHERE c3.subject_kind = 'word' AND c3.subject_id = w.id
           AND c3.card_kind = 'reading')
     ORDER BY cpos, id
     LIMIT ?
   )`);

const w1 = unlockWriting.run(now, now, now, BUDGET).changes;
const r1 = unlockWords.run(now, now, now, BUDGET).changes;
ok('una tanda de desbloqueo no se pasa del presupuesto', w1 <= BUDGET && r1 <= BUDGET,
  `${w1} de escritura y ${r1} de lectura, tope ${BUDGET}`);

// y llamarlo otra vez tiene que AVANZAR: si el NOT EXISTS y el LIMIT no
// encajan, las mismas filas ya insertadas copan el tope y no entra nada nuevo.
const w2 = unlockWriting.run(now, now, now, BUDGET).changes;
const r2 = unlockWords.run(now, now, now, BUDGET).changes;
ok('la siguiente tanda sigue avanzando', w2 > 0 && r2 > 0,
  `${w2} de escritura y ${r2} de lectura en la segunda tanda`);

// se vacia la cola de desbloqueos para probar el resto con volumen
for (let i = 0; i < 400; i++) {
  const a = unlockWriting.run(now, now, now, BUDGET).changes;
  const b = unlockWords.run(now, now, now, BUDGET).changes;
  if (a === 0 && b === 0) break;
}

const wr = db.prepare("SELECT COUNT(*) n FROM prog.card WHERE card_kind='writing'").get().n;
ok('se desbloquean tarjetas de escritura', wr > 100, `${wr} tarjetas`);

// los yoon (2 codepoints) NO deben tener tarjeta de escritura
const yoonWriting = db.prepare(`SELECT COUNT(*) n FROM prog.card c JOIN glyph g ON g.id=c.subject_id
  WHERE c.card_kind='writing' AND LENGTH(g.literal) > 1`).get().n;
ok('los yoon no generan tarjeta de escritura', yoonWriting === 0, `${yoonWriting} indebidas`);

// un componente se reconoce para leer el kanji, pero no se escribe suelto
const compWriting = db.prepare(`SELECT COUNT(*) n FROM prog.card c
  JOIN curriculum cur ON cur.glyph_id = c.subject_id
  WHERE c.card_kind='writing' AND cur.tier='component'`).get().n;
ok('los componentes no generan tarjeta de escritura', compWriting === 0, `${compWriting} indebidas`);

const rd = db.prepare("SELECT COUNT(*) n FROM prog.card WHERE card_kind='reading'").get().n;
ok('se desbloquean tarjetas de lectura', rd > 0, `${rd} palabras`);

// una palabra anclada a un kana tiene que poder leerse con kana
const kanjiFrontOnKanaWord = db.prepare(`SELECT COUNT(*) n FROM prog.card c
  JOIN word w ON w.id = c.subject_id
  JOIN word_glyph wg ON wg.word_id = w.id
  JOIN curriculum cur ON cur.glyph_id = wg.glyph_id
  WHERE c.card_kind='reading' AND cur.tier='kana' AND w.headword != w.reading`).get().n;
ok('las palabras de kana no ensenan kanji por delante', kanjiFrontOnKanaWord === 0,
  `${kanjiFrontOnKanaWord} con kanji delante`);

// INVARIANTE: ninguna palabra desbloqueada puede tener un kanji sin graduar
const premature = db.prepare(`SELECT COUNT(*) n FROM prog.card c
  WHERE c.card_kind='reading' AND EXISTS (
    SELECT 1 FROM word_glyph wg WHERE wg.word_id=c.subject_id
      AND NOT EXISTS (SELECT 1 FROM prog.card k WHERE k.subject_kind='glyph'
        AND k.subject_id=wg.glyph_id AND k.card_kind='recognition' AND k.state=2))`).get().n;
ok('ninguna palabra llega antes que sus kanji', premature === 0, `${premature} prematuras`);

const sampleWord = db.prepare(`SELECT c.subject_key, w.reading FROM prog.card c
  JOIN word w ON w.id=c.subject_id WHERE c.card_kind='reading' LIMIT 3`).all();
console.log('       ejemplo de vocabulario desbloqueado:',
  sampleWord.map(w => `${w.subject_key}(${w.reading})`).join('  ') || '(ninguno)');

// --- plan de la query caliente
const plan = db.prepare('EXPLAIN QUERY PLAN SELECT id FROM prog.card WHERE suspended=0 AND due<=? ORDER BY due LIMIT 1')
  .all(now).map(r => r.detail).join(' | ');
ok('la cola usa el indice sin sort temporal', !/SCAN|TEMP B-TREE/i.test(plan), plan);

// ---------- 3. consultas compuestas: biblioteca y estadisticas ----------
console.log('\n== 3. Biblioteca (todas las combinaciones de filtro) ==');

// Los dos SELECT grandes se LEEN del propio library.ts para que el test no se
// desincronice si cambian. Las clausulas de estado, que son cortas, se replican.
const libTs = fs.readFileSync(path.join(ROOT, 'src/db/library.ts'), 'utf8');
const grab = (name) => libTs.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;'))[1];
const GLYPH_SELECT = grab('GLYPH_SELECT');
const WORD_SELECT = grab('WORD_SELECT');

const STATUS = {
  all: '1=1',
  new: 'c.id IS NULL',
  learning: 'c.id IS NOT NULL AND c.suspended = 0 AND c.state IN (0,1,3)',
  known: 'c.id IS NOT NULL AND c.suspended = 0 AND c.state = 2',
  suspended: 'c.suspended = 1',
};
const KINDF = {
  all: '', kana: "AND g.kind IN ('hiragana','katakana')",
  kanji: "AND cur.tier = 'kanji'", component: "AND cur.tier = 'component'",
};

let libRows = 0;
for (const scope of ['all', 'kana', 'kanji', 'component', 'word']) {
  for (const status of Object.keys(STATUS)) {
    for (const search of ['', '日']) {
      const useSearch = search.length > 0;
      let sql, args;
      if (scope === 'word') {
        sql = `${WORD_SELECT}
               WHERE ${STATUS[status]}
                 ${useSearch ? 'AND (w.headword LIKE ? OR w.reading LIKE ?)' : ''}
               ORDER BY w.tier, COALESCE(w.freq_rank, 99), w.id
               LIMIT ? OFFSET ?`;
        args = useSearch ? ['%' + search + '%', '%' + search + '%', 20, 0] : [20, 0];
      } else {
        sql = `${GLYPH_SELECT}
               WHERE ${STATUS[status]} ${KINDF[scope]}
                 ${useSearch ? 'AND (g.literal LIKE ? OR g.romaji LIKE ?)' : ''}
               ORDER BY cur.pos
               LIMIT ? OFFSET ?`;
        args = useSearch ? ['%' + search + '%', '%' + search + '%', 20, 0] : [20, 0];
      }
      try {
        const rows = db.prepare(sql).all(...args);
        libRows += rows.length;
      } catch (e) {
        ok(`biblioteca ${scope}/${status}${useSearch ? '/buscando' : ''}`, false, e.message);
      }
    }
  }
}
ok('50 combinaciones de filtro de biblioteca ejecutan', true, `${libRows} filas devueltas en total`);

// contadores por ambito
for (const scope of ['all', 'kana', 'kanji', 'component', 'word']) {
  const isWord = scope === 'word';
  const from = isWord
    ? `FROM word w LEFT JOIN prog.card c ON c.subject_kind='word' AND c.subject_id=w.id AND c.card_kind='reading'`
    : `FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
       LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'`;
  const kindFilter = isWord ? '' :
    scope === 'kana' ? "WHERE g.kind IN ('hiragana','katakana')" :
    scope === 'kanji' ? "WHERE cur.tier='kanji'" :
    scope === 'component' ? "WHERE cur.tier='component'" : '';
  try {
    const r = db.prepare(`SELECT COUNT(*) AS total,
        SUM(CASE WHEN c.id IS NULL THEN 1 ELSE 0 END) AS nuevo,
        SUM(CASE WHEN c.id IS NOT NULL AND c.suspended=0 AND c.state IN (0,1,3) THEN 1 ELSE 0 END) AS aprendiendo,
        SUM(CASE WHEN c.id IS NOT NULL AND c.suspended=0 AND c.state=2 THEN 1 ELSE 0 END) AS dominado,
        SUM(CASE WHEN c.suspended=1 THEN 1 ELSE 0 END) AS suspendido
      ${from} ${kindFilter}`).get();
    const consistent = r.nuevo + r.aprendiendo + r.dominado + r.suspendido === r.total;
    ok(`contadores de "${scope}" suman el total`, consistent,
      `${r.total} = ${r.nuevo} sin ver + ${r.aprendiendo} aprendiendo + ${r.dominado} dominados + ${r.suspendido} ocultos`);
  } catch (e) {
    ok(`contadores de "${scope}"`, false, e.message);
  }
}

console.log('\n== 4. Estadisticas ==');
const PROGQ = [
  ["Kana", `FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
    LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'
    WHERE cur.tier='kana'`],
  ["Kanji", `FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
    LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'
    WHERE cur.tier='kanji'`],
  ["Vocabulario", `FROM word w
    LEFT JOIN prog.card c ON c.subject_kind='word' AND c.subject_id=w.id AND c.card_kind='reading'`],
];
for (const [label, from] of PROGQ) {
  try {
    const r = db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN c.state=2 AND c.suspended=0 THEN 1 ELSE 0 END) known,
      SUM(CASE WHEN c.id IS NOT NULL AND c.state!=2 AND c.suspended=0 THEN 1 ELSE 0 END) learning
      ${from}`).get();
    ok(`progreso de ${label}`, r.known <= r.total, `${r.known} dominados de ${r.total}`);
  } catch (e) { ok(`progreso de ${label}`, false, e.message); }
}

try {
  const DAY_MS = 86400000;
  const f = db.prepare(`SELECT CAST((due - ?) / ? AS INTEGER) d, COUNT(*) n
    FROM prog.card WHERE suspended = 0 AND due > ? AND due < ?
    GROUP BY d ORDER BY d`).all(now, DAY_MS, now, now + 14 * DAY_MS);
  ok('pronostico de carga futura ejecuta', true, `${f.length} dias con carga`);
} catch (e) { ok('pronostico de carga futura', false, e.message); }

try {
  const a = db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) again FROM prog.review_log WHERE review_kind='scheduled'").get();
  ok('consulta de aciertos ejecuta', true, `${a.total} repasos registrados`);
} catch (e) { ok('consulta de aciertos', false, e.message); }

// reinicio de progreso
try {
  db.exec('BEGIN');
  for (const t of ['review_log', 'card', 'introduced', 'day_stat', 'user_gloss']) db.exec(`DELETE FROM prog.${t}`);
  db.exec("UPDATE prog.meta SET value='1' WHERE key='next_curriculum_pos'");
  db.exec('COMMIT');
  const left = db.prepare('SELECT COUNT(*) n FROM prog.card').get().n;
  const content = db.prepare('SELECT COUNT(*) n FROM glyph').get().n;
  ok('reiniciar progreso lo borra todo', left === 0, `${left} tarjetas restantes`);
  ok('reiniciar NO toca el contenido', content > 3000, `${content} glifos intactos`);
} catch (e) { ok('reiniciar progreso', false, e.message); }

db.close();
console.log(`\n${fails === 0 ? 'SMOKE OK' : fails + ' FALLOS'}\n`);
for (const f of [PROG, PROG + '-wal', PROG + '-shm']) fs.rmSync(f, { force: true });
process.exit(fails === 0 ? 0 : 1);
