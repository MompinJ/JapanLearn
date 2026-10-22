import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Consultas de la biblioteca. Todo va paginado: son 3.264 items de curriculum
 * y 29.726 palabras, asi que traerlo entero a memoria no es opcion.
 */

export type Scope = 'all' | 'kana' | 'kanji' | 'component' | 'word';
export type Status = 'all' | 'new' | 'learning' | 'known' | 'suspended';

export type LibraryRow = {
  kind: 'glyph' | 'word';
  id: number;
  literal: string;
  sub: string | null;        // romaji o lectura
  /** Significado EFECTIVO que se muestra en la lista (el propio si existe). */
  meaning: string | null;
  /** El del diccionario (KANJIDIC / JMdict), siempre. */
  dictMeaning: string | null;
  dictLang: 'es' | 'en' | null;
  /** Solo si el usuario escribio uno propio. */
  userGloss: string | null;
  pos: number;               // orden de curriculum
  tier: string;
  state: number | null;      // null = nunca introducido
  due: number | null;
  suspended: number;
  reps: number;
};

export type Counts = { total: number; nuevo: number; aprendiendo: number; dominado: number; suspendido: number };

/** Estado derivado: ningun campo lo guarda, sale de card.state + suspended. */
function statusClause(status: Status, alias = 'c') {
  switch (status) {
    case 'new':       return `${alias}.id IS NULL`;
    case 'learning':  return `${alias}.id IS NOT NULL AND ${alias}.suspended = 0 AND ${alias}.state IN (0,1,3)`;
    case 'known':     return `${alias}.id IS NOT NULL AND ${alias}.suspended = 0 AND ${alias}.state = 2`;
    case 'suspended': return `${alias}.suspended = 1`;
    default:          return '1=1';
  }
}

const GLYPH_SELECT = `
  SELECT 'glyph' AS kind, g.id, g.literal,
         g.romaji AS sub,
         (SELECT text FROM prog.user_gloss u
           WHERE u.subject_kind='glyph' AND u.subject_id=g.id) AS userGloss,
         COALESCE(
           (SELECT text FROM glyph_meaning m WHERE m.glyph_id=g.id AND m.lang='es' ORDER BY m.ord LIMIT 1),
           (SELECT text FROM glyph_meaning m WHERE m.glyph_id=g.id AND m.lang='en' ORDER BY m.ord LIMIT 1)
         ) AS dictMeaning,
         CASE WHEN EXISTS (SELECT 1 FROM glyph_meaning m WHERE m.glyph_id=g.id AND m.lang='es')
              THEN 'es' ELSE 'en' END AS dictLang,
         COALESCE(
           (SELECT text FROM prog.user_gloss u WHERE u.subject_kind='glyph' AND u.subject_id=g.id),
           (SELECT text FROM glyph_meaning m WHERE m.glyph_id=g.id AND m.lang='es' ORDER BY m.ord LIMIT 1),
           (SELECT text FROM glyph_meaning m WHERE m.glyph_id=g.id AND m.lang='en' ORDER BY m.ord LIMIT 1)
         ) AS meaning,
         cur.pos AS pos, cur.tier AS tier,
         c.state, c.due, COALESCE(c.suspended,0) AS suspended, COALESCE(c.reps,0) AS reps
  FROM curriculum cur
  JOIN glyph g ON g.id = cur.glyph_id
  LEFT JOIN prog.card c
         ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'`;

const WORD_SELECT = `
  SELECT 'word' AS kind, w.id, w.headword AS literal,
         w.reading AS sub,
         (SELECT text FROM prog.user_gloss u
           WHERE u.subject_kind='word' AND u.subject_id=w.id) AS userGloss,
         COALESCE(
           (SELECT g.text FROM sense s JOIN gloss g ON g.sense_id=s.id
             WHERE s.word_id=w.id AND s.lang='es' ORDER BY s.ord, g.ord LIMIT 1),
           (SELECT g.text FROM sense s JOIN gloss g ON g.sense_id=s.id
             WHERE s.word_id=w.id AND s.lang='en' ORDER BY s.ord, g.ord LIMIT 1)
         ) AS dictMeaning,
         CASE WHEN w.has_es=1 THEN 'es' ELSE 'en' END AS dictLang,
         COALESCE(
           (SELECT text FROM prog.user_gloss u WHERE u.subject_kind='word' AND u.subject_id=w.id),
           (SELECT g.text FROM sense s JOIN gloss g ON g.sense_id=s.id
             WHERE s.word_id=w.id AND s.lang='es' ORDER BY s.ord, g.ord LIMIT 1),
           (SELECT g.text FROM sense s JOIN gloss g ON g.sense_id=s.id
             WHERE s.word_id=w.id AND s.lang='en' ORDER BY s.ord, g.ord LIMIT 1)
         ) AS meaning,
         w.curriculum_pos AS pos, 'word' AS tier,
         c.state, c.due, COALESCE(c.suspended,0) AS suspended, COALESCE(c.reps,0) AS reps
  FROM word w
  LEFT JOIN prog.card c
         ON c.subject_kind='word' AND c.subject_id=w.id AND c.card_kind='reading'`;

export async function libraryPage(
  db: SQLiteDatabase,
  opts: { scope: Scope; status: Status; search: string; limit: number; offset: number },
): Promise<LibraryRow[]> {
  const { scope, status, search, limit, offset } = opts;
  const like = `%${search.trim()}%`;
  const useSearch = search.trim().length > 0;

  if (scope === 'word') {
    return db.getAllAsync<LibraryRow>(
      `${WORD_SELECT}
       WHERE ${statusClause(status)}
         ${useSearch ? 'AND (w.headword LIKE ? OR w.reading LIKE ?)' : ''}
       ORDER BY w.tier, COALESCE(w.freq_rank, 99), w.id
       LIMIT ? OFFSET ?`,
      ...(useSearch ? [like, like] : []), limit, offset);
  }

  const kindFilter =
    scope === 'kana'      ? "AND g.kind IN ('hiragana','katakana')" :
    scope === 'kanji'     ? "AND cur.tier = 'kanji'" :
    scope === 'component' ? "AND cur.tier = 'component'" : '';

  return db.getAllAsync<LibraryRow>(
    `${GLYPH_SELECT}
     WHERE ${statusClause(status)} ${kindFilter}
       ${useSearch ? 'AND (g.literal LIKE ? OR g.romaji LIKE ?)' : ''}
     ORDER BY cur.pos
     LIMIT ? OFFSET ?`,
    ...(useSearch ? [like, like] : []), limit, offset);
}

export async function libraryCounts(db: SQLiteDatabase, scope: Scope): Promise<Counts> {
  const isWord = scope === 'word';
  const from = isWord
    ? `FROM word w LEFT JOIN prog.card c ON c.subject_kind='word' AND c.subject_id=w.id AND c.card_kind='reading'`
    : `FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
       LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'`;
  const kindFilter = isWord ? '' :
    scope === 'kana'      ? "WHERE g.kind IN ('hiragana','katakana')" :
    scope === 'kanji'     ? "WHERE cur.tier='kanji'" :
    scope === 'component' ? "WHERE cur.tier='component'" : '';

  const r = await db.getFirstAsync<Counts>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN c.id IS NULL THEN 1 ELSE 0 END) AS nuevo,
            SUM(CASE WHEN c.id IS NOT NULL AND c.suspended=0 AND c.state IN (0,1,3) THEN 1 ELSE 0 END) AS aprendiendo,
            SUM(CASE WHEN c.id IS NOT NULL AND c.suspended=0 AND c.state=2 THEN 1 ELSE 0 END) AS dominado,
            SUM(CASE WHEN c.suspended=1 THEN 1 ELSE 0 END) AS suspendido
     ${from} ${kindFilter}`);
  return r ?? { total: 0, nuevo: 0, aprendiendo: 0, dominado: 0, suspendido: 0 };
}

// ---------- acciones sobre un item ----------

/** Introduce un item AHORA, saltandose el orden del curriculum. */
export async function introduceNow(
  db: SQLiteDatabase, row: LibraryRow, now: number,
): Promise<void> {
  const cardKind = row.kind === 'word' ? 'reading' : 'recognition';
  await db.withTransactionAsync(async () => {
    if (row.kind === 'glyph') {
      await db.runAsync(
        `INSERT OR IGNORE INTO prog.introduced (glyph_id, tier, pos, at) VALUES (?,?,?,?)`,
        row.id, row.tier, row.pos, now);
    }
    await db.runAsync(
      `INSERT OR IGNORE INTO prog.card
         (subject_kind, subject_id, subject_key, card_kind, due, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      row.kind, row.id, row.literal, cardKind, now, now, now);
  });
}

/** Suspender = "no me lo vuelvas a mostrar". Reversible, no borra el historial. */
export async function setSuspended(
  db: SQLiteDatabase, row: LibraryRow, suspended: boolean, now: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE prog.card SET suspended = ?, updated_at = ?
     WHERE subject_kind = ? AND subject_id = ?`,
    suspended ? 1 : 0, now, row.kind, row.id);
}

/** Olvidar: vuelve a estado nuevo conservando el review_log. */
export async function forgetItem(
  db: SQLiteDatabase, row: LibraryRow, now: number,
): Promise<void> {
  await db.runAsync(
    `UPDATE prog.card
       SET state=0, stability=0, difficulty=0, scheduled_days=0, learning_steps=0,
           reps=0, lapses=0, last_review=NULL, due=?, suspended=0, updated_at=?
     WHERE subject_kind=? AND subject_id=?`,
    now, now, row.kind, row.id);
}

/**
 * Deshace "Aprender ahora": borra las tarjetas y la marca de introducido, de
 * modo que el item vuelve a "sin ver" y reaparecera cuando le toque por orden.
 *
 * NO se borra el review_log: guarda subject_kind/subject_id/card_kind propios,
 * asi que el historial sobrevive aunque la tarjeta desaparezca. Eso permite
 * reoptimizar los parametros de FSRS mas adelante.
 */
export async function removeItem(
  db: SQLiteDatabase, row: LibraryRow,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'DELETE FROM prog.card WHERE subject_kind = ? AND subject_id = ?', row.kind, row.id);
    if (row.kind === 'glyph') {
      await db.runAsync('DELETE FROM prog.introduced WHERE glyph_id = ?', row.id);
      // El puntero del curriculum puede haber pasado de largo: se retrocede
      // hasta este item para que vuelva a entrar por su sitio.
      await db.runAsync(
        `UPDATE prog.meta SET value = MIN(CAST(value AS INTEGER), ?) WHERE key = 'next_curriculum_pos'`,
        row.pos);
    }
  });
}

export async function setUserGloss(
  db: SQLiteDatabase, row: LibraryRow, text: string, now: number,
): Promise<void> {
  const t = text.trim();
  if (!t) {
    await db.runAsync('DELETE FROM prog.user_gloss WHERE subject_kind=? AND subject_id=?', row.kind, row.id);
    return;
  }
  await db.runAsync(
    `INSERT INTO prog.user_gloss (subject_kind, subject_id, text, updated_at)
     VALUES (?,?,?,?)
     ON CONFLICT(subject_kind, subject_id) DO UPDATE SET text=excluded.text, updated_at=excluded.updated_at`,
    row.kind, row.id, t, now);
}
