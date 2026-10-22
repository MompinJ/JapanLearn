// El motor de la cola. Aqui vive el requisito de producto: abrir la app debe
// poner una tarjeta delante SIN menus, y salir tras 3 tarjetas tiene que ser
// tan valido como hacer 80.
//
// Escalera, siempre devuelve algo:
//   1. vencidas            (due <= now)
//   2. learning inminentes (due <= now + 5 min)  -> no hacer esperar al usuario
//   3. nuevas              (segun presupuesto diario)
//   4. cram                (adelantar SIN escribir programacion)
//   5. libre               (practica que no toca el SRS)
import type { SQLiteDatabase } from 'expo-sqlite';
import type { CardRow } from '../srs/scheduler';
import type { Settings } from '../db/bootstrap';
import { logicalDay } from '../lib/time';

const LEARNING_LOOKAHEAD_MS = 5 * 60 * 1000;
/** Cada item nuevo genera ~8 repasos antes de estabilizarse. Convertir
 *  "nuevas" en carga futura es lo que evita el agujero clasico de Anki:
 *  metes 30 un domingo y el miercoles tienes 250 vencidas y abandonas. */
const NEW_ITEM_COST = 8;

export type GlyphPayload = {
  id: number;
  literal: string;
  kind: string;
  romaji: string | null;
  stroke_count: number | null;
  has_strokes: number;
  strokes: { d: string; t: string | null }[] | null;
  view_box: string | null;
  meaningsEs: string[];
  meaningsEn: string[];
  readingsOn: string[];
  readingsKun: string[];
  components: { id: number; literal: string }[];
  userGloss: string | null;
};

export type WordPayload = {
  id: number;
  headword: string;
  reading: string;
  kanaOnly: number;
  tier: number;
  meaningsEs: string[];
  meaningsEn: string[];
  pos: string | null;
  kanji: { id: number; literal: string }[];
  userGloss: string | null;
};

export type QueueItem = {
  card: CardRow;
  glyph: GlyphPayload | null;
  word: WordPayload | null;
  source: 'due' | 'learning' | 'new' | 'cram' | 'free';
};

const CARD_COLS = `id, subject_kind, subject_id, subject_key, card_kind, due,
  stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review`;

export async function countsFor(db: SQLiteDatabase, now: number) {
  const due = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) n FROM prog.card WHERE suspended = 0 AND due <= ?', now);
  const learning = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) n FROM prog.card WHERE suspended = 0 AND state IN (1,3)');
  return { due: due?.n ?? 0, learning: learning?.n ?? 0 };
}

export async function todayStat(db: SQLiteDatabase, now: number, cutoff: number) {
  const day = logicalDay(now, cutoff);
  const r = await db.getFirstAsync<{ reviews: number; new_items: number }>(
    'SELECT reviews, new_items FROM prog.day_stat WHERE day = ?', day);
  return { day, reviews: r?.reviews ?? 0, newItems: r?.new_items ?? 0 };
}

/** Funcion pura: decide que tocar ahora. Testeable sin base de datos. */
export function plan(ctx: {
  dueCount: number; learningCount: number;
  todayReviews: number; todayNew: number; s: Settings;
}): { mode: 'due' | 'new' | 'mixed' | 'free'; everyN?: number; newBudget: number } {
  const remainingLoad = ctx.s.dailyTargetReviews - ctx.todayReviews;
  const newBudget = Math.max(0, Math.min(
    Math.floor((remainingLoad - ctx.dueCount) / NEW_ITEM_COST),
    ctx.s.maxNewPerDay - ctx.todayNew,
  ));
  const canIntroduce = newBudget > 0 && ctx.learningCount < ctx.s.maxLearning;

  if (!canIntroduce && ctx.dueCount > 0) return { mode: 'due', newBudget };
  if (canIntroduce && ctx.dueCount === 0) return { mode: 'new', newBudget };
  if (canIntroduce) {
    const everyN = Math.max(3, Math.min(15, Math.ceil(ctx.dueCount / newBudget)));
    return { mode: 'mixed', everyN, newBudget };
  }
  return { mode: 'free', newBudget };
}

async function selectDue(db: SQLiteDatabase, now: number, limit: number): Promise<CardRow[]> {
  return db.getAllAsync<CardRow>(
    `SELECT ${CARD_COLS} FROM prog.card
     WHERE suspended = 0 AND due <= ? ORDER BY due LIMIT ?`, now, limit);
}

async function selectLearningSoon(db: SQLiteDatabase, now: number): Promise<CardRow[]> {
  return db.getAllAsync<CardRow>(
    `SELECT ${CARD_COLS} FROM prog.card
     WHERE suspended = 0 AND state IN (1,3) AND due <= ? ORDER BY due LIMIT 1`,
    now + LEARNING_LOOKAHEAD_MS);
}

/** Introduce el siguiente item del curriculum y crea su tarjeta de reconocimiento. */
export async function introduceNext(db: SQLiteDatabase, now: number): Promise<CardRow | null> {
  const row = await db.getFirstAsync<{ pos: number; glyph_id: number; tier: string; literal: string; has_strokes: number }>(
    `SELECT c.pos, c.glyph_id, c.tier, g.literal, g.has_strokes
     FROM curriculum c JOIN glyph g ON g.id = c.glyph_id
     WHERE NOT EXISTS (
       SELECT 1 FROM prog.introduced i WHERE i.glyph_id = c.glyph_id AND i.tier = c.tier)
     ORDER BY c.pos LIMIT 1`);
  if (!row) return null;

  await db.runAsync(
    'INSERT OR IGNORE INTO prog.introduced (glyph_id, tier, pos, at) VALUES (?,?,?,?)',
    row.glyph_id, row.tier, row.pos, now);
  await db.runAsync(
    `INSERT OR IGNORE INTO prog.card
       (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
     VALUES ('glyph', ?, ?, 'recognition', ?, ?, ?)`,
    row.glyph_id, row.literal, now, now, now);
  await db.runAsync(
    `UPDATE prog.meta SET value = ? WHERE key = 'next_curriculum_pos'`, String(row.pos + 1));

  return db.getFirstAsync<CardRow>(
    `SELECT ${CARD_COLS} FROM prog.card
     WHERE subject_kind='glyph' AND subject_id=? AND card_kind='recognition'`, row.glyph_id);
}

/**
 * Material nuevo creado pero SIN empezar que ya esta esperando.
 *
 * Es el freno de los desbloqueos. Las tarjetas derivadas (escritura y lectura)
 * no nacen de introduceNext, asi que no pasan por el presupuesto de plan(): se
 * insertaban directamente con due = ahora y state = 0, es decir, como vencidas.
 * Cada graduacion metia 1 tarjeta de escritura y hasta 4 de lectura de golpe, y
 * al terminar el hiragana se volcaban de una vez todas las palabras que
 * esperaban al ultimo kana. Justamente el atracon que el resto de la cola se
 * cuida de evitar, entrando por la puerta de atras.
 */
async function pendingNewCount(db: SQLiteDatabase, now: number): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) n FROM prog.card WHERE suspended = 0 AND state = 0 AND due <= ?', now);
  return r?.n ?? 0;
}

/**
 * Crea las tarjetas derivadas que toquen, sin pasarse del presupuesto.
 *
 * Se reparte primero a LECTURA: es donde el kanji deja de estar aislado, que es
 * el objetivo del metodo. La escritura coge lo que sobre, y solo si esta
 * activada en ajustes.
 */
export async function unlockDerivedCards(
  db: SQLiteDatabase, s: Settings, now: number,
): Promise<void> {
  let budget = s.maxLearning - (await pendingNewCount(db, now));
  if (budget <= 0) return;

  budget -= await unlockWordCards(db, now, budget);
  if (budget > 0 && s.writingEnabled) await unlockWritingCards(db, now, budget);
}

/** La tarjeta de escritura se desbloquea cuando la de reconocimiento gradua. */
export async function unlockWritingCards(
  db: SQLiteDatabase, now: number, limit: number,
): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO prog.card
       (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
     SELECT 'glyph', subject_id, subject_key, 'writing', ?, ?, ?
     FROM (
       SELECT c.subject_id AS subject_id, c.subject_key AS subject_key, cur.pos AS cpos
       FROM prog.card c
       JOIN glyph g        ON g.id = c.subject_id
       JOIN curriculum cur ON cur.glyph_id = c.subject_id
       WHERE c.card_kind = 'recognition' AND c.state = 2
         AND g.has_strokes = 1
         -- un componente se reconoce para leer el kanji, no se escribe suelto
         AND cur.tier != 'component'
         AND NOT EXISTS (
           SELECT 1 FROM prog.card w
           WHERE w.subject_kind = 'glyph' AND w.subject_id = c.subject_id
             AND w.card_kind = 'writing')
       ORDER BY cpos
       LIMIT ?
     )`,
    now, now, now, limit);
  return r.changes;
}

/**
 * Desbloquea tarjetas de LECTURA sobre palabras ancla.
 *
 * Una palabra solo aparece cuando TODOS sus kanji ya estan graduados. Asi el
 * kanji nunca se estudia aislado: llega acompanado de vocabulario real que el
 * usuario ya puede leer entero.
 */
export async function unlockWordCards(
  db: SQLiteDatabase, now: number, limit: number,
): Promise<number> {
  const r = await db.runAsync(
    `INSERT INTO prog.card
       (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
     SELECT 'word', id, headword, 'reading', ?, ?, ?
     FROM (
       SELECT DISTINCT w.id AS id, w.headword AS headword, w.curriculum_pos AS cpos
       FROM curriculum_word cw
       JOIN word w ON w.id = cw.word_id
       JOIN prog.card kc ON kc.subject_kind = 'glyph'
                        AND kc.subject_id = cw.glyph_id
                        AND kc.card_kind = 'recognition'
                        AND kc.state = 2
       WHERE NOT EXISTS (
         -- ningun kanji de la palabra puede estar sin graduar
         SELECT 1 FROM word_glyph wg
         WHERE wg.word_id = w.id
           AND NOT EXISTS (
             SELECT 1 FROM prog.card c2
             WHERE c2.subject_kind = 'glyph' AND c2.subject_id = wg.glyph_id
               AND c2.card_kind = 'recognition' AND c2.state = 2))
         AND NOT EXISTS (
           SELECT 1 FROM prog.card c3
           WHERE c3.subject_kind = 'word' AND c3.subject_id = w.id
             AND c3.card_kind = 'reading')
       ORDER BY cpos, id
       LIMIT ?
     )`,
    now, now, now, limit);
  return r.changes;
}

export async function hydrateWord(db: SQLiteDatabase, wordId: number): Promise<WordPayload> {
  const w = await db.getFirstAsync<any>(
    `SELECT w.id, w.headword, w.reading, w.kana_only, w.tier,
            (SELECT text FROM prog.user_gloss u
              WHERE u.subject_kind='word' AND u.subject_id=w.id) AS user_gloss
     FROM word w WHERE w.id = ?`, wordId);

  const senses = await db.getAllAsync<{ lang: string; pos: string | null; text: string }>(
    `SELECT s.lang, s.pos, g.text
     FROM sense s JOIN gloss g ON g.sense_id = s.id
     WHERE s.word_id = ? ORDER BY s.lang, s.ord, g.ord`, wordId);

  const kanji = await db.getAllAsync<{ id: number; literal: string }>(
    `SELECT g.id, g.literal FROM word_glyph wg JOIN glyph g ON g.id = wg.glyph_id
     WHERE wg.word_id = ?`, wordId);

  return {
    id: w.id, headword: w.headword, reading: w.reading,
    kanaOnly: w.kana_only, tier: w.tier,
    meaningsEs: senses.filter((x) => x.lang === 'es').map((x) => x.text).slice(0, 4),
    meaningsEn: senses.filter((x) => x.lang === 'en').map((x) => x.text).slice(0, 4),
    pos: senses.find((x) => x.pos)?.pos ?? null,
    kanji,
    userGloss: w.user_gloss ?? null,
  };
}

export async function hydrateGlyph(db: SQLiteDatabase, glyphId: number): Promise<GlyphPayload> {
  const g = await db.getFirstAsync<any>(
    `SELECT g.id, g.literal, g.kind, g.romaji, g.stroke_count, g.has_strokes,
            s.paths, s.view_box,
            (SELECT text FROM prog.user_gloss u
              WHERE u.subject_kind='glyph' AND u.subject_id=g.id) AS user_gloss
     FROM glyph g LEFT JOIN glyph_strokes s ON s.glyph_id = g.id
     WHERE g.id = ?`, glyphId);

  const meanings = await db.getAllAsync<{ lang: string; text: string }>(
    'SELECT lang, text FROM glyph_meaning WHERE glyph_id = ? ORDER BY lang, ord', glyphId);
  const readings = await db.getAllAsync<{ kind: string; reading: string }>(
    "SELECT kind, reading FROM glyph_reading WHERE glyph_id = ? AND kind != 'nanori' ORDER BY kind, ord", glyphId);
  const components = await db.getAllAsync<{ id: number; literal: string }>(
    `SELECT g2.id, g2.literal FROM glyph_component gc
     JOIN glyph g2 ON g2.id = gc.component_id
     WHERE gc.glyph_id = ? ORDER BY gc.ord`, glyphId);

  return {
    id: g.id, literal: g.literal, kind: g.kind, romaji: g.romaji,
    stroke_count: g.stroke_count, has_strokes: g.has_strokes,
    strokes: g.paths ? JSON.parse(g.paths) : null,
    view_box: g.view_box ?? null,
    meaningsEs: meanings.filter((m) => m.lang === 'es').map((m) => m.text),
    meaningsEn: meanings.filter((m) => m.lang === 'en').map((m) => m.text),
    readingsOn: readings.filter((r) => r.kind === 'on').map((r) => r.reading),
    readingsKun: readings.filter((r) => r.kind === 'kun').map((r) => r.reading),
    components,
    userGloss: g.user_gloss ?? null,
  };
}

/** Devuelve la siguiente tarjeta. NUNCA devuelve null salvo que no quede nada en absoluto. */
export async function nextItem(db: SQLiteDatabase, s: Settings, now: number): Promise<QueueItem | null> {
  const { due, learning } = await countsFor(db, now);
  const today = await todayStat(db, now, s.dayCutoffHour);
  const p = plan({ dueCount: due, learningCount: learning, todayReviews: today.reviews, todayNew: today.newItems, s });

  let card: CardRow | null = null;
  let source: QueueItem['source'] = 'due';

  if (p.mode === 'due' || p.mode === 'mixed') {
    card = (await selectDue(db, now, 1))[0] ?? null;
  }
  if (!card && (p.mode === 'new' || p.mode === 'mixed')) {
    card = await introduceNext(db, now);
    source = 'new';
  }
  if (!card) {
    card = (await selectLearningSoon(db, now))[0] ?? null;
    if (card) source = 'learning';
  }
  // Introducir material nuevo SOLO si queda presupuesto. Sin esta guarda la
  // cola mete items sin freno cuando no hay nada vencido, que es exactamente
  // el agujero clasico de Anki: 50 nuevas hoy, 400 vencidas el miercoles,
  // abandono el jueves.
  if (!card && p.newBudget > 0) {
    card = await introduceNext(db, now);
    if (card) source = 'new';
  }
  if (!card) {
    // cram: la mas proxima a vencer. NO escribe programacion al responder.
    card = (await db.getAllAsync<CardRow>(
      `SELECT ${CARD_COLS} FROM prog.card
       WHERE suspended = 0 AND state = 2 ORDER BY due LIMIT 1`))[0] ?? null;
    if (card) source = 'cram';
  }
  if (!card) {
    // modo libre: practica sobre algo ya visto. Tampoco toca el SRS.
    card = (await db.getAllAsync<CardRow>(
      `SELECT ${CARD_COLS} FROM prog.card
       WHERE suspended = 0 ORDER BY RANDOM() LIMIT 1`))[0] ?? null;
    if (card) source = 'free';
  }
  if (!card) return null;

  if (card.subject_kind === 'word') {
    return { card, glyph: null, word: await hydrateWord(db, card.subject_id), source };
  }
  return { card, glyph: await hydrateGlyph(db, card.subject_id), word: null, source };
}
