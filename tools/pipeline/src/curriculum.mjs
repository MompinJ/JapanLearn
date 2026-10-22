// Currículum v3: orden PEDAGOGICO, kana por fases, componentes solo si tienen
// nombre en espanol.
//
// Historia de las versiones anteriores, para no repetirlas:
//
// v1: orden topologico puro (componentes primero, desempate por frecuencia).
//     Front-loadeaba decenas de radicales oscuros antes del primer kanji real.
//     Correcto como grafo, inservible como curso.
//
// v2: frecuencia de KANJIDIC mandando, componentes just-in-time. Arreglaba el
//     front-load pero heredaba el sesgo de la fuente: el campo <freq> es un
//     ranking de PRENSA, no de utilidad para quien empieza. Sacaba 政 (politica)
//     de kanji nº 17 y 議 (deliberacion) de nº 25, mientras 食 (comer) caia en
//     el 328 y 何 (que) en el 340. Se aprendia a leer editoriales antes que a
//     pedir agua.
//
// v3 (esta): el orden lo marca la DIFICULTAD RECONOCIDA, y la frecuencia solo
//     desempata dentro de cada nivel. Ver studyRank().
import { PUA_BASE, MAX_GRADE, KATAKANA_EVERY } from './config.mjs';

const FREQ_NONE = 99999;

/** grade de KANJIDIC -> 0..7. 1-6 son los cursos de primaria japonesa
 *  (kyouiku), 8 es el resto de jouyou y 9 los kanji de nombres (jinmeiyou). */
const gradeBucket = (g) => (g <= 6 ? g - 1 : g === 8 ? 6 : 7);

/**
 * Nivel de estudio de un kanji. Menor = antes.
 *
 * El JLPT manda porque es la progresion que siguen los cursos y los libros de
 * texto, que es justo donde va a continuar el usuario. La escala <jlpt> de
 * KANJIDIC es la ANTIGUA (4 = mas facil ... 1 = mas dificil) y cubre 2.230 de
 * los 2.787 kanji objetivo:
 *
 *   jlpt 4 -> 103 kanji   (equivale a N5)
 *   jlpt 3 -> 181
 *   jlpt 2 -> 739
 *   jlpt 1 -> 1207
 *   sin jlpt -> 557       -> se ordenan detras, por curso escolar
 *
 * Los 557 sin nivel son sobre todo anadidos al jouyou de 2010 y jinmeiyou: van
 * despues de TODO el JLPT, que es donde corresponden.
 */
export const studyRank = (k) => (k.jlpt != null ? 4 - k.jlpt : 4 + gradeBucket(k.grade));

export function buildCurriculum({ kanji, components, kana, componentNames }) {
  const learned = new Set();
  const emitting = new Set();
  const report = { cycles: [], unnamedComponents: new Map(), excluded: [] };

  // ---- 1. Kana. El hiragana entero va primero: es el prerrequisito real para
  //      leer cualquier cosa. El katakana NO bloquea el kanji (ver punto 3).
  const hiragana = kana.filter((k) => k.kind === 'hiragana');
  const katakana = kana.filter((k) => k.kind === 'katakana');

  const kanaRow = (k) => ({
    literal: k.literal,
    tier: 'kana',
    reason: `kana:${k.kind}:${k.group}`,
    kind: k.kind,
    romaji: k.romaji,
  });

  const head = hiragana.map(kanaRow);
  for (const k of kana) learned.add(k.literal);

  // El vocabulario en kana se desbloquea al terminar el hiragana BASICO, no al
  // terminar los dos silabarios. Con los 46 kana del gojuon ya existen palabras
  // de verdad (ねこ, みず, やま, これ); esperar a los 208 items son ~17 dias de
  // simbolos sueltos sin una sola palabra, que es donde se abandona.
  const lastBasicHiragana = head.reduce(
    (acc, r, i) => (r.reason.endsWith(':basico') ? i + 1 : acc), 0);

  // ---- 2. Kanji objetivo por nivel de estudio, frecuencia como desempate
  const targets = [...kanji.values()]
    .filter((k) => k.grade != null && k.grade <= MAX_GRADE)
    .sort((a, b) =>
      studyRank(a) - studyRank(b) ||
      (a.freq ?? FREQ_NONE) - (b.freq ?? FREQ_NONE) ||
      (a.strokeCount ?? 99) - (b.strokeCount ?? 99) ||
      a.id - b.id); // desempate totalmente determinista

  const tierOf = (lit) => {
    const k = kanji.get(lit);
    if (k && ((k.grade != null && k.grade <= MAX_GRADE) || (k.freq != null && k.freq <= 2500))) return 'kanji';
    return 'component';
  };

  /**
   * Un item solo se ensena si su respuesta sirve de algo.
   *
   * Para un KANJI basta con que KANJIDIC le de algun significado.
   *
   * Para un COMPONENTE se exige nombre curado en ESPANOL. KANJIDIC solo trae
   * nombres de radical en ingles y con jerga de diccionario: preguntar "¿que
   * significa 彑?" para responder "pig's head radical variant (no. 58)" no
   * ensena nada y ademas quema la confianza en el resto de respuestas. De los
   * 312 componentes que KanjiVG usa para descomponer los kanji objetivo, la
   * inmensa mayoria aparece en 1-4 kanji y no tiene ningun valor mnemotecnico.
   *
   * El excluido NO desaparece: sigue en glyph/glyph_component, asi que la ficha
   * del kanji lo sigue mostrando en "compuesto de ...". Simplemente no genera
   * tarjeta propia.
   */
  const teachable = (lit) => {
    if (tierOf(lit) === 'component') return Boolean(componentNames[lit]);
    const k = kanji.get(lit);
    return Boolean(k && (k.meaningsEs.length || k.meaningsEn.length));
  };

  const stream = [];
  const emit = (lit, reason) => {
    if (learned.has(lit)) return;
    if (emitting.has(lit)) { report.cycles.push(lit); return; }
    emitting.add(lit);

    for (const c of components.get(lit) ?? []) {
      if (c !== lit) emit(c, `prereq:${lit}`);
    }
    emitting.delete(lit);
    learned.add(lit);

    if (!teachable(lit)) {
      report.excluded.push(lit);
      const n = report.unnamedComponents.get(lit) ?? 0;
      report.unnamedComponents.set(lit, n + 1);
      return;
    }
    stream.push({ literal: lit, tier: tierOf(lit), reason, kind: tierOf(lit) });
  };

  for (const k of targets) emit(k.literal, 'target');

  // ---- 3. Katakana INTERCALADO en el flujo de kanji.
  //
  // Antes iba en bloque delante del primer kanji: 104 items mas de silabario
  // que retrasaban el kanji nº 1 hasta la posicion 209. El katakana hace falta
  // (las lecturas ON se escriben con el), pero no es prerrequisito para
  // reconocer un kanji por su significado, asi que no tiene por que bloquearlo.
  //
  // Intercalado 1 de cada KATAKANA_EVERY: el primer kanji llega en la posicion
  // 105 y el silabario se completa igualmente, en paralelo.
  const tail = [];
  let ki = 0;
  for (let i = 0; i < stream.length; i++) {
    tail.push(stream[i]);
    if (ki < katakana.length && (i + 1) % KATAKANA_EVERY === 0) {
      tail.push(kanaRow(katakana[ki++]));
    }
  }
  while (ki < katakana.length) tail.push(kanaRow(katakana[ki++]));

  const rows = [...head, ...tail].map((r, i) => ({ ...r, pos: i + 1 }));

  return {
    rows,
    /** Posicion a partir de la cual tiene sentido ensenar vocabulario en kana. */
    vocabStartPos: lastBasicHiragana,
    report,
  };
}

// Los componentes de KanjiVG sin codepoint propio reciben un id estable en el
// area de uso privado. El mapa se persiste y NUNCA se reasigna, solo crece:
// es lo que permite regenerar el contenido sin romper el progreso del usuario.
export function assignIds(literals, existingMap) {
  const map = { ...existingMap };
  let next = PUA_BASE;
  for (const v of Object.values(map)) if (v >= next) next = v + 1;

  for (const lit of literals) {
    if (map[lit] != null) continue;
    const cps = [...lit];
    if (cps.length === 1) {
      const cp = lit.codePointAt(0);
      // los kana compuestos (yoon) y los componentes raros van a PUA
      map[lit] = cp;
    } else {
      map[lit] = next++;
    }
  }
  return map;
}
