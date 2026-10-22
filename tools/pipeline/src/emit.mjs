// Escribe assets/db/japanese.db.
//
// El artefacto final se emite en journal_mode=DELETE y via VACUUM INTO: sin
// sidecars -wal/-shm. Un -wal huerfano sobre un .db recien copiado por
// forceOverwrite produce "database disk image is malformed", y el fallo solo
// aparece en la SEGUNDA actualizacion de contenido, ya en el dispositivo.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DIRS, CONTENT_SCHEMA_VERSION, PIPELINE_VERSION } from './config.mjs';

export function emit({ kanji, components, strokes, viewBox, curriculum, ids, kana, sources,
                       componentNames = {}, words = new Map(), links = [], wordPos = new Map(), anchors = new Map() }) {
  fs.mkdirSync(DIRS.assetsDb, { recursive: true });
  const finalPath = path.join(DIRS.assetsDb, 'japanese.db');
  const tmpPath = path.join(DIRS.cache, 'build.db');
  fs.rmSync(tmpPath, { force: true });

  const db = new Database(tmpPath);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.exec(fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));

  const kanaByLiteral = new Map(kana.map((k) => [k.literal, k]));
  const inCurriculum = new Set(curriculum.map((r) => r.literal));

  // --- que glifos entran en la tabla glyph:
  //     kana + todo KANJIDIC (sirve de diccionario) + componentes referenciados
  const wanted = new Map(); // literal -> fila
  const addGlyph = (literal, extra) => {
    if (wanted.has(literal)) return;
    const id = ids[literal];
    if (id == null) return;
    wanted.set(literal, { id, literal, ...extra });
  };

  for (const k of kana) {
    addGlyph(k.literal, {
      kind: k.kind, stroke_count: null, grade: null, jlpt: null,
      freq: null, radical: null, romaji: k.romaji,
    });
  }
  // Solo entran los glifos ALCANZABLES: los del curriculum, los que aparecen en
  // alguna palabra ensenable, y sus componentes. Meter los 13.108 kanji de
  // KANJIDIC como "diccionario" son ~10.000 caracteres que el usuario no puede
  // alcanzar por ningun camino, y ademas disparan el subset de la fuente.
  const reachable = new Set(curriculum.map((r) => r.literal));
  for (const { literal } of links) reachable.add(literal);

  const addKanji = (lit) => {
    const k = kanji.get(lit);
    if (k) {
      addGlyph(lit, {
        kind: 'kanji', stroke_count: k.strokeCount, grade: k.grade, jlpt: k.jlpt,
        freq: k.freq, radical: k.radical, romaji: null,
      });
    } else {
      addGlyph(lit, { kind: 'component', stroke_count: null, grade: null, jlpt: null,
                      freq: null, radical: null, romaji: null });
    }
  };
  for (const lit of reachable) addKanji(lit);
  // componentes de lo alcanzable (para la ficha "compuesto de ...")
  for (const lit of [...reachable]) {
    for (const c of components.get(lit) ?? []) addKanji(c);
  }

  // --- trazos: solo para lo que se estudia o se descompone. Los yoon (2
  //     codepoints) NO llevan trazos: escribir きゃ es escribir き y luego ゃ,
  //     asi que se ensenan como lectura, no como escritura.
  const strokeTargets = new Set();
  for (const lit of wanted.keys()) {
    if ([...lit].length !== 1) continue;
    if (inCurriculum.has(lit) || kanaByLiteral.has(lit) || components.has(lit)) strokeTargets.add(lit);
    for (const c of components.get(lit) ?? []) strokeTargets.add(c);
  }

  const ins = {
    meta: db.prepare('INSERT INTO content_meta (key,value) VALUES (?,?)'),
    glyph: db.prepare(`INSERT INTO glyph (id,literal,kind,stroke_count,grade,jlpt,freq,radical,romaji,has_strokes)
                       VALUES (@id,@literal,@kind,@stroke_count,@grade,@jlpt,@freq,@radical,@romaji,@has_strokes)`),
    meaning: db.prepare('INSERT INTO glyph_meaning (glyph_id,lang,ord,text) VALUES (?,?,?,?)'),
    reading: db.prepare('INSERT INTO glyph_reading (glyph_id,kind,ord,reading) VALUES (?,?,?,?)'),
    comp: db.prepare('INSERT INTO glyph_component (glyph_id,ord,component_id) VALUES (?,?,?)'),
    strokes: db.prepare('INSERT INTO glyph_strokes (glyph_id,count,view_box,paths) VALUES (?,?,?,?)'),
    curr: db.prepare('INSERT INTO curriculum (pos,glyph_id,tier,reason) VALUES (?,?,?,?)'),
    word: db.prepare(`INSERT INTO word (id,headword,reading,kana_only,tier,freq_rank,has_es,curriculum_pos)
                      VALUES (@id,@headword,@reading,@kana_only,@tier,@freq_rank,@has_es,@curriculum_pos)`),
    wform: db.prepare('INSERT OR IGNORE INTO word_form (word_id,form,is_reading) VALUES (?,?,?)'),
    sense: db.prepare('INSERT INTO sense (id,word_id,ord,lang,pos) VALUES (?,?,?,?,?)'),
    gloss: db.prepare('INSERT INTO gloss (sense_id,ord,text) VALUES (?,?,?)'),
    wglyph: db.prepare('INSERT OR IGNORE INTO word_glyph (word_id,glyph_id) VALUES (?,?)'),
    canchor: db.prepare('INSERT OR IGNORE INTO curriculum_word (glyph_id,ord,word_id) VALUES (?,?,?)'),
  };

  const stats = { glyphs: 0, meanings: 0, readings: 0, comps: 0, strokes: 0, curriculum: 0,
                  words: 0, senses: 0, glosses: 0, wordGlyph: 0, anchors: 0 };

  db.transaction(() => {
    // orden determinista por id -> builds reproducibles byte a byte
    const sorted = [...wanted.values()].sort((a, b) => a.id - b.id);
    for (const g of sorted) {
      const hasStrokes = strokeTargets.has(g.literal) && strokes.has(g.literal) ? 1 : 0;
      ins.glyph.run({ ...g, has_strokes: hasStrokes });
      stats.glyphs++;

      const k = kanji.get(g.literal);
      // Nombre curado a mano en espanol. Es la unica fuente de espanol para los
      // componentes (KANJIDIC solo trae nombres de radical en ingles), asi que
      // si no se inserta aqui la lista curada no llega nunca a la app.
      //
      // Cuando hay nombre curado GANA el, y el de KANJIDIC pasa detras. Antes
      // solo se insertaba si KANJIDIC no traia espanol, y para los componentes
      // eso es justo al reves de lo que interesa: el espanol de KANJIDIC es la
      // traduccion del nombre de radical de diccionario ("variante del radical
      // cabeza de cerdo (nº 58)"), no algo que se pueda memorizar.
      const curated = componentNames[g.literal];
      let esOrd = 0;
      if (curated) {
        ins.meaning.run(g.id, 'es', esOrd++, curated);
        stats.meanings++;
      }
      if (k) {
        k.meaningsEs.forEach((t) => { ins.meaning.run(g.id, 'es', esOrd++, t); stats.meanings++; });
        k.meaningsEn.forEach((t, i) => { ins.meaning.run(g.id, 'en', i, t); stats.meanings++; });
        k.on.forEach((r, i) => { ins.reading.run(g.id, 'on', i, r); stats.readings++; });
        k.kun.forEach((r, i) => { ins.reading.run(g.id, 'kun', i, r); stats.readings++; });
        k.nanori.forEach((r, i) => { ins.reading.run(g.id, 'nanori', i, r); stats.readings++; });
      }

      if (hasStrokes) {
        const p = strokes.get(g.literal);
        ins.strokes.run(g.id, p.length, viewBox, JSON.stringify(p));
        stats.strokes++;
      }

    }

    // Segunda pasada: glyph_component referencia OTRO glifo, asi que todas las
    // filas de glyph tienen que existir ya o salta la foreign key.
    for (const g of sorted) {
      (components.get(g.literal) ?? []).forEach((c, i) => {
        if (ids[c] == null || !wanted.has(c)) return;
        ins.comp.run(g.id, i, ids[c]);
        stats.comps++;
      });
    }

    for (const r of curriculum) {
      ins.curr.run(r.pos, ids[r.literal], r.tier, r.reason);
      stats.curriculum++;
    }

    // ---- vocabulario. Solo palabras ensenables: todos sus kanji estan en el
    //      curriculum, asi que el usuario llegara a poder leerlas.
    const wordIds = [...wordPos.keys()].sort((a, b) => a - b);
    for (const wid of wordIds) {
      const w = words.get(wid);
      if (!w) continue;
      ins.word.run({
        id: w.id, headword: w.headword, reading: w.reading,
        kana_only: w.kanaOnly, tier: w.tier, freq_rank: w.freqRank,
        has_es: w.hasEs, curriculum_pos: wordPos.get(wid) ?? 0,
      });
      stats.words++;
      for (const f of w.forms) { ins.wform.run(w.id, f, 0); }
      for (const r of w.readings) { ins.wform.run(w.id, r, 1); }
      w.senses.forEach((sn, i) => {
        const sid = w.id * 100 + i;   // id determinista
        ins.sense.run(sid, w.id, i, sn.lang, sn.pos.join(',') || null);
        stats.senses++;
        sn.glosses.forEach((g, gi) => { ins.gloss.run(sid, gi, g); stats.glosses++; });
      });
    }

    for (const { wordId, literal } of links) {
      if (ids[literal] == null || !wanted.has(literal) || !wordPos.has(wordId)) continue;
      ins.wglyph.run(wordId, ids[literal]);
      stats.wordGlyph++;
    }

    for (const [literal, list] of anchors) {
      if (ids[literal] == null || !wanted.has(literal)) continue;
      list.forEach((wid, i) => {
        if (!wordPos.has(wid)) return;
        ins.canchor.run(ids[literal], i, wid);
        stats.anchors++;
      });
    }

    const meta = {
      content_schema_version: String(CONTENT_SCHEMA_VERSION),
      pipeline_version: String(PIPELINE_VERSION),
      built_at: new Date().toISOString(),
      curriculum_algo: 'v2',
      sources: JSON.stringify(sources),
      counts: JSON.stringify(stats),
    };
    for (const [k, v] of Object.entries(meta)) ins.meta.run(k, v);
  })();

  db.exec('ANALYZE'); // embebe sqlite_stat1: el planificador acierta desde la 1a query
  db.pragma('journal_mode = DELETE');
  fs.rmSync(finalPath, { force: true });
  db.exec(`VACUUM INTO '${finalPath.replace(/'/g, "''")}'`);
  db.close();
  fs.rmSync(tmpPath, { force: true });

  const bytes = fs.statSync(finalPath).size;
  return { path: finalPath, bytes, stats };
}
