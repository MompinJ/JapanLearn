// Migraciones del PROGRESO, forward-only, versionadas con PRAGMA prog.user_version.
//
// Se usa el PRAGMA y no una fila de metadatos para que el bump de version sea
// atomico con la transaccion de la migracion.
//
// El progreso referencia el contenido por id DETERMINISTA (codepoint / ent_seq)
// mas subject_key como red de seguridad. SQLite NO valida foreign keys entre
// bases adjuntas, asi que la integridad la garantizan los ids estables y el
// paso de reconciliacion.
import type { SQLiteDatabase } from 'expo-sqlite';

export const MIGRATIONS: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
CREATE TABLE prog.meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE prog.card (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_kind TEXT    NOT NULL,          -- 'glyph' | 'word'
  subject_id   INTEGER NOT NULL,          -- codepoint / ent_seq: ESTABLE
  subject_key  TEXT    NOT NULL,          -- red de seguridad para reconciliar
  card_kind    TEXT    NOT NULL,          -- 'recognition' | 'reading' | 'writing'

  -- estado FSRS. elapsed_days esta deprecado en ts-fsrs 5.4: no se persiste aqui.
  due            INTEGER NOT NULL,
  stability      REAL    NOT NULL DEFAULT 0,
  difficulty     REAL    NOT NULL DEFAULT 0,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  state          INTEGER NOT NULL DEFAULT 0,
  last_review    INTEGER,

  suspended  INTEGER NOT NULL DEFAULT 0,  -- 0 activa | 1 usuario | 2 huerfana | 3 ajuste
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (subject_kind, subject_id, card_kind)
);

-- EL indice caliente: range-scan puro para "dame la siguiente vencida",
-- sin TEMP B-TREE. Se ejecuta en cada tarjeta.
CREATE INDEX prog.card_queue_idx   ON card (due) WHERE suspended = 0;
CREATE INDEX prog.card_state_idx   ON card (state, due) WHERE suspended = 0;
CREATE INDEX prog.card_subject_idx ON card (subject_kind, subject_id);

CREATE TABLE prog.review_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id      INTEGER NOT NULL,
  subject_kind TEXT    NOT NULL,
  subject_id   INTEGER NOT NULL,
  card_kind    TEXT    NOT NULL,
  rating       INTEGER NOT NULL,
  state        INTEGER NOT NULL,
  due          INTEGER NOT NULL,
  stability    REAL,
  difficulty   REAL,
  -- elapsed_days SI se guarda aqui aunque este deprecado en Card: el
  -- optimizador de parametros de FSRS lo consume. Sin el, dentro de meses
  -- no se podran reoptimizar los pesos y el historial estara perdido.
  elapsed_days INTEGER NOT NULL DEFAULT 0,
  review       INTEGER NOT NULL,
  duration_ms  INTEGER,
  review_kind  TEXT    NOT NULL DEFAULT 'scheduled',
  drawn_strokes    INTEGER,
  expected_strokes INTEGER
);
CREATE INDEX prog.review_log_card_idx ON review_log (card_id, review);
CREATE INDEX prog.review_log_time_idx ON review_log (review);

CREATE TABLE prog.user_gloss (
  subject_kind TEXT    NOT NULL,
  subject_id   INTEGER NOT NULL,
  text         TEXT    NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (subject_kind, subject_id)
) WITHOUT ROWID;

CREATE TABLE prog.introduced (
  glyph_id INTEGER NOT NULL,
  tier     TEXT    NOT NULL,
  pos      INTEGER NOT NULL,
  at       INTEGER NOT NULL,
  PRIMARY KEY (glyph_id, tier)
) WITHOUT ROWID;

CREATE TABLE prog.day_stat (
  day       INTEGER PRIMARY KEY,          -- YYYYMMDD del dia logico
  reviews   INTEGER NOT NULL DEFAULT 0,
  new_items INTEGER NOT NULL DEFAULT 0,
  again     INTEGER NOT NULL DEFAULT 0,
  ms        INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
`,
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA prog.user_version');
  let current = row?.user_version ?? 0;

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
      await db.execAsync(`PRAGMA prog.user_version = ${m.version}`);
    });
    current = m.version;
  }
  return current;
}
