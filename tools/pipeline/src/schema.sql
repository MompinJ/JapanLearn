-- Esquema de CONTENIDO (japanese.db). Fuente unica de verdad.
-- Read-only en la app. Se puede reemplazar entero sin tocar el progreso.
--
-- Regla de oro: todos los ids son DETERMINISTAS y derivados del dato de origen
-- (codepoint Unicode / ent_seq de JMdict). Nada de AUTOINCREMENT aqui. Eso es
-- lo que permite regenerar el contenido sin romper las referencias del progreso.
--
-- OJO: este archivo NO debe activar WAL. El contenido es de solo lectura y los
-- sidecars -wal/-shm huerfanos tras un forceOverwrite corrompen la base.

CREATE TABLE content_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE glyph (
  id           INTEGER PRIMARY KEY,        -- codepoint Unicode (o PUA para compuestos)
  literal      TEXT    NOT NULL UNIQUE,
  kind         TEXT    NOT NULL,           -- hiragana | katakana | kanji | component
  stroke_count INTEGER,
  grade        INTEGER,
  jlpt         INTEGER,                    -- JLPT VIEJO de 4 niveles: obsoleto, no ordenar por esto
  freq         INTEGER,                    -- rango 1..2501, NULL fuera
  radical      INTEGER,
  romaji       TEXT,                       -- solo kana
  has_strokes  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX glyph_freq_idx ON glyph(freq) WHERE freq IS NOT NULL;
CREATE INDEX glyph_kind_idx ON glyph(kind);

CREATE TABLE glyph_meaning (
  glyph_id INTEGER NOT NULL REFERENCES glyph(id),
  lang     TEXT    NOT NULL,               -- 'es' | 'en'
  ord      INTEGER NOT NULL,
  text     TEXT    NOT NULL,
  PRIMARY KEY (glyph_id, lang, ord)
) WITHOUT ROWID;

CREATE TABLE glyph_reading (
  glyph_id INTEGER NOT NULL REFERENCES glyph(id),
  kind     TEXT    NOT NULL,               -- 'on' | 'kun' | 'nanori'
  ord      INTEGER NOT NULL,
  reading  TEXT    NOT NULL,
  PRIMARY KEY (glyph_id, kind, ord)
) WITHOUT ROWID;

-- Descomposicion a profundidad 1, usando kvg:original ?? kvg:element
CREATE TABLE glyph_component (
  glyph_id     INTEGER NOT NULL REFERENCES glyph(id),
  ord          INTEGER NOT NULL,
  component_id INTEGER NOT NULL REFERENCES glyph(id),
  PRIMARY KEY (glyph_id, ord)
) WITHOUT ROWID;
CREATE INDEX glyph_component_rev ON glyph_component(component_id);

-- Un blob JSON por glifo, no una fila por trazo: siempre se leen todos juntos
-- (dibujo, animacion, overlay). 1 lookup + parse gana a N filas.
CREATE TABLE glyph_strokes (
  glyph_id INTEGER PRIMARY KEY REFERENCES glyph(id),
  count    INTEGER NOT NULL,
  view_box TEXT    NOT NULL,
  paths    TEXT    NOT NULL                -- JSON: [{"d":"M12.5,...","t":"㇐"}, ...]
);

-- Orden de ensenanza. glyph_id NO es unico: un glifo puede entrar como
-- 'component' (prerrequisito temprano) y luego como 'kanji' (por frecuencia).
CREATE TABLE curriculum (
  pos      INTEGER PRIMARY KEY,
  glyph_id INTEGER NOT NULL REFERENCES glyph(id),
  tier     TEXT    NOT NULL CHECK (tier IN ('kana','component','kanji')),
  reason   TEXT    NOT NULL,               -- 'target' | 'prereq:X' | 'kana:grupo'
  UNIQUE (glyph_id, tier)
);
CREATE INDEX curriculum_glyph_idx ON curriculum(glyph_id, pos);

-- ---- Lexico (JMdict)
-- OJO: en JMdict multiidioma las glosas en espanol viven en <sense> SEPARADOS
-- al final de la entrada, no junto a las inglesas. No se emparejan 1 a 1, asi
-- que el idioma va en el sense, que es como esta realmente en la fuente.
CREATE TABLE word (
  id             INTEGER PRIMARY KEY,      -- ent_seq de JMdict: estable entre releases
  headword       TEXT    NOT NULL,         -- keb principal (o reb si es solo kana)
  reading        TEXT    NOT NULL,
  kana_only      INTEGER NOT NULL DEFAULT 0,
  tier           INTEGER NOT NULL,         -- 1 nucleo | 2 ampliado
  freq_rank      INTEGER,                  -- banda nfXX de JMdict (1 = mas frecuente)
  has_es         INTEGER NOT NULL DEFAULT 0,
  curriculum_pos INTEGER                   -- pos del kanji mas tardio que contiene
);
CREATE INDEX word_tier_idx    ON word(tier, freq_rank);
CREATE INDEX word_reading_idx ON word(reading);
CREATE INDEX word_curr_idx    ON word(curriculum_pos);

CREATE TABLE word_form (
  word_id    INTEGER NOT NULL REFERENCES word(id),
  form       TEXT    NOT NULL,
  is_reading INTEGER NOT NULL,
  PRIMARY KEY (word_id, form, is_reading)
) WITHOUT ROWID;
CREATE INDEX word_form_idx ON word_form(form);

CREATE TABLE sense (
  id      INTEGER PRIMARY KEY,             -- word_id * 100 + ord: determinista
  word_id INTEGER NOT NULL REFERENCES word(id),
  ord     INTEGER NOT NULL,
  lang    TEXT    NOT NULL,                -- 'en' | 'es'
  pos     TEXT                             -- codigos JMdict separados por coma
);
CREATE INDEX sense_word_idx ON sense(word_id, lang, ord);

CREATE TABLE gloss (
  sense_id INTEGER NOT NULL REFERENCES sense(id),
  ord      INTEGER NOT NULL,
  text     TEXT    NOT NULL,
  PRIMARY KEY (sense_id, ord)
) WITHOUT ROWID;

CREATE TABLE word_glyph (
  word_id  INTEGER NOT NULL REFERENCES word(id),
  glyph_id INTEGER NOT NULL REFERENCES glyph(id),
  PRIMARY KEY (word_id, glyph_id)
) WITHOUT ROWID;
CREATE INDEX word_glyph_rev ON word_glyph(glyph_id, word_id);

-- Palabras ancla por kanji: alimentan la tarjeta de LECTURA (palabra -> lectura).
-- Un kanji nunca se estudia aislado; siempre llega con vocabulario que lo usa.
CREATE TABLE curriculum_word (
  glyph_id INTEGER NOT NULL REFERENCES glyph(id),
  ord      INTEGER NOT NULL,
  word_id  INTEGER NOT NULL REFERENCES word(id),
  PRIMARY KEY (glyph_id, ord)
) WITHOUT ROWID;
CREATE INDEX curriculum_word_rev ON curriculum_word(word_id);
