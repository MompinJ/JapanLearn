// Pipeline completo: fetch -> parse -> curriculum -> emit -> reports
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { DIRS, MAX_DB_BYTES, MIN_ES_COVERAGE_TARGET } from './config.mjs';
import { fetchAll } from './download.mjs';
import { parseKanjidic, summarize } from './parse-kanjidic.mjs';
import { parseKanjivg } from './parse-kanjivg.mjs';
import { parseJmdict, summarizeWords } from './parse-jmdict.mjs';
import { linkVocabulary, summarizeVocab } from './vocab.mjs';
import { buildKana } from './kana.mjs';
import { buildCurriculum, assignIds } from './curriculum.mjs';
import { emit } from './emit.mjs';

const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

async function build() {
  console.log('\n== 1. Fuentes ==');
  const sources = await fetchAll();

  console.log('\n== 2. Parseo ==');
  const kanji = parseKanjidic(sources.kanjidic2.path);
  const s = summarize(kanji);
  console.log(`  KANJIDIC2: ${s.total} kanji, ${s.targets} objetivo, espanol ${(s.esCoverage * 100).toFixed(1)}%`);
  if (s.esCoverage < MIN_ES_COVERAGE_TARGET) {
    throw new Error(`cobertura de espanol ${(s.esCoverage * 100).toFixed(1)}% < minimo ${MIN_ES_COVERAGE_TARGET * 100}%`);
  }

  const { components, strokes, viewBox } = parseKanjivg(sources.kanjivg.path);
  console.log(`  KanjiVG: ${components.size} con descomposicion, ${strokes.size} con trazos`);

  const kana = buildKana();
  console.log(`  Kana: ${kana.length} (${kana.filter(k => k.kind === 'hiragana').length} hiragana + ${kana.filter(k => k.kind === 'katakana').length} katakana)`);

  console.log('\n== 3. Curriculum v3 ==');
  const componentNames = readJson(path.join(DIRS.data, 'component-names.es.json'), {});
  const { rows, vocabStartPos, report } = buildCurriculum({ kanji, components, kana, componentNames });
  const byTier = rows.reduce((a, r) => ((a[r.tier] = (a[r.tier] ?? 0) + 1), a), {});
  console.log(`  ${rows.length} items:`, byTier);
  console.log(`  ciclos: ${report.cycles.length}`);
  console.log(`  componentes excluidos por no tener nombre en espanol: ${report.excluded.length}`);

  const firstKanjiPos = rows.find(r => r.tier !== 'kana')?.pos ?? 0;
  console.log(`  el primer kanji cae en la posicion ${firstKanjiPos}`);
  const first = rows.filter(r => r.tier !== 'kana').slice(0, 30).map(r => r.literal).join(' ');
  console.log(`  primeros kanji: ${first}`);

  console.log('\n== 4. Vocabulario ==');
  const words = parseJmdict(sources.jmdict.path);
  const ws = summarizeWords(words);
  console.log(`  JMdict: ${ws.total} palabras (tier1 ${ws.tier1}), con espanol ${ws.withEs} (${(100*ws.withEs/ws.total).toFixed(1)}%)`);
  const curriculumPos = new Map(rows.map((r) => [r.literal, r.pos]));
  const { links, wordPos, anchors } = linkVocabulary({ words, curriculumPos, vocabStartPos });
  console.log(`  el vocabulario en kana empieza en la posicion ${vocabStartPos}`);
  const vs = summarizeVocab({ words, wordPos, anchors, curriculumPos });
  console.log(`  ensenables: ${vs.teachableWords}  |  kanji con palabras ancla: ${vs.kanjiWithAnchors}/${vs.kanjiInCurriculum}  (sin ancla: ${vs.kanjiWithoutAnchors})`);

  console.log('\n== 5. Ids deterministas ==');
  const literals = new Set();
  for (const k of kana) literals.add(k.literal);
  for (const k of kanji.keys()) literals.add(k);
  for (const [lit, cs] of components) { literals.add(lit); for (const c of cs) literals.add(c); }
  const existing = readJson(path.join(DIRS.data, 'component-ids.json'), {});
  const ids = assignIds([...literals].sort(), existing);
  fs.writeFileSync(path.join(DIRS.data, 'component-ids.json'), JSON.stringify(ids, null, 0));
  console.log(`  ${Object.keys(ids).length} literales con id estable`);

  console.log('\n== 6. Emision ==');
  const srcMeta = Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, v.sha256]));
  const res = emit({ kanji, components, strokes, viewBox, curriculum: rows, ids, kana, sources: srcMeta, componentNames, words, links, wordPos, anchors });
  console.log(`  ${res.path}`);
  console.log(`  ${(res.bytes / 1048576).toFixed(2)} MB`, res.stats);

  if (res.bytes > MAX_DB_BYTES) {
    throw new Error(`la BD pesa ${(res.bytes / 1048576).toFixed(1)} MB, tope ${MAX_DB_BYTES / 1048576} MB`);
  }

  console.log('\n== 7. Reportes ==');
  fs.mkdirSync(DIRS.reports, { recursive: true });
  fs.writeFileSync(path.join(DIRS.reports, 'curriculum.txt'),
    rows.map(r => `${String(r.pos).padStart(5)}  ${r.tier.padEnd(10)} ${r.literal}\t${r.reason}`).join('\n'));
  fs.writeFileSync(path.join(DIRS.reports, 'unnamed-components.txt'),
    report.excluded.join('\n'));
  // La version se deriva del ARTEFACTO emitido, no de un subconjunto de las
  // fuentes. Antes se construia con los hashes de kanjidic2 + kanjivg y se
  // dejaba fuera jmdict: al anadir el vocabulario esos dos no cambiaron, la
  // version salio identica, y el dispositivo conservo la base vieja. Hashear el
  // .db garantiza que CUALQUIER cambio de contenido fuerza la actualizacion.
  const dbHash = crypto.createHash('sha256').update(fs.readFileSync(res.path)).digest('hex');
  fs.writeFileSync(path.join(DIRS.assetsDb, 'content-version.json'), JSON.stringify({
    version: dbHash.slice(0, 16),
    dbSha256: dbHash,
    contentSchema: 1,
    builtAt: new Date().toISOString(),
    counts: res.stats,
    bytes: res.bytes,
  }, null, 2));
  console.log('  reports/curriculum.txt, reports/unnamed-components.txt, assets/db/content-version.json');
  console.log('\nOK\n');
}

const cmd = process.argv[2] ?? 'all';
if (cmd === 'fetch') await fetchAll();
else if (cmd === 'build' || cmd === 'all') await build();
else { console.error(`comando desconocido: ${cmd}`); process.exit(1); }
