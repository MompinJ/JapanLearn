// Enlaza vocabulario con kanji y elige las palabras ancla.
//
// Regla pedagogica central: un kanji NUNCA se estudia aislado. Cada kanji llega
// con palabras reales que lo usan, y una palabra solo se desbloquea cuando
// todos sus kanji ya se han visto.
import { ANCHORS_PER_KANJI } from './config.mjs';

const isKanji = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) ||   // CJK unificado
  (cp >= 0x3400 && cp <= 0x4dbf) ||   // extension A
  (cp >= 0xf900 && cp <= 0xfaff);     // ideogramas de compatibilidad

export function kanjiIn(text) {
  const out = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (isKanji(cp)) out.push(ch);
  }
  return [...new Set(out)];
}

const isKana = (cp) => (cp >= 0x3041 && cp <= 0x3096) || (cp >= 0x30a1 && cp <= 0x30fa);

/**
 * NO se filtra por categoria gramatical.
 *
 * Lo intente y salio mal: excluir pronombres y expresiones dejaba fuera これ,
 * なに, だれ y どこ, y excluir interjecciones dejaba fuera ありがとう. Son de
 * las primeras palabras que aprende cualquiera. La categoria gramatical no
 * dice si algo merece la pena aprenderse.
 *
 * Lo que si filtra bien es tener traduccion al espanol y frecuencia real.
 */

export function kanaIn(text) {
  const out = [];
  for (const ch of text) {
    if (isKana(ch.codePointAt(0))) out.push(ch);
  }
  return [...new Set(out)];
}

/**
 * @param words  Map<id, WordRec> de parse-jmdict
 * @param curriculumPos Map<literal, pos> de los items del curriculum
 */
export function linkVocabulary({ words, curriculumPos, vocabStartPos = 0 }) {
  const links = [];          // {wordId, literal}
  const wordPos = new Map(); // wordId -> curriculum_pos (el kanji mas tardio)
  const byKanji = new Map(); // literal -> [wordRec]

  for (const w of words.values()) {
    const chars = kanjiIn(w.headword);

    // Legible solo con kana: o no tiene kanji, o esta marcada "uk" (en texto
    // real se escribe en kana aunque tenga forma con kanji).
    const kanaReadable = chars.length === 0 || w.usuallyKana === 1;

    if (kanaReadable) {
      // Palabra escrita solo en kana. Antes se marcaba con pos 0 y se
      // abandonaba ahi: como no es "ancla" de ningun kanji, no se desbloqueaba
      // NUNCA. Eran 4.654 palabras inalcanzables, justo el vocabulario basico
      // que se puede leer nada mas terminar los kana.
      //
      // Ahora se ancla a los KANA que la componen: en cuanto esos kana estan
      // aprendidos, la palabra entra. Asi, despues de los silabarios llega
      // vocabulario real antes de meterse con los kanji.
      const kana = kanaIn(w.reading);
      let maxKana = 0;
      let readable = kana.length > 0;
      for (const ch of kana) {
        const pos = curriculumPos.get(ch);
        if (pos == null) { readable = false; break; }
        if (pos > maxKana) maxKana = pos;
      }
      // Solo el nucleo comun, y solo palabras que ENSENEN algo. Sin este filtro
      // salian ああ, おいおい, さえ: interjecciones y particulas de dos letras
      // que ganan por ser cortas y usar los primeros kana. Un principiante
      // quiere ねこ, みず, たべる.
      if (!readable || w.tier !== 1) continue;
      if (!w.hasEs) continue;                      // sin traduccion no ensena nada
      if ([...w.reading].length < 2) continue;     // una sola letra nunca es una palabra util

      // El vocabulario en kana no aparece hasta terminar el hiragana BASICO.
      //
      // El suelo existe porque sin el, en la posicion 14 solo conoces あ-せ, y
      // con catorce kana no hay palabras utiles: el algoritmo rellenaba con
      // onomatopeyas (せかせか, うとうと) porque eran lo unico legible.
      //
      // Pero el suelo eran los 208 items de kana COMPLETOS, es decir los dos
      // silabarios enteros con dakuten y yoon: ~17 dias de simbolos sueltos
      // antes de la primera palabra. Ahora es el gojuon de hiragana (46), que
      // es donde ya existen ねこ, みず, やま o これ. El resto del silabario se
      // sigue aprendiendo, pero ya con vocabulario de verdad al lado.
      wordPos.set(w.id, Math.max(maxKana, vocabStartPos));
      for (const ch of kana) {
        links.push({ wordId: w.id, literal: ch });
        if (!byKanji.has(ch)) byKanji.set(ch, []);
        byKanji.get(ch).push(w);
      }
      continue;
    }

    // si algun kanji no esta en el curriculum, la palabra no es ensenable:
    // el usuario nunca llegaria a poder leerla
    let maxPos = 0;
    let teachable = true;
    for (const ch of chars) {
      const pos = curriculumPos.get(ch);
      if (pos == null) { teachable = false; break; }
      if (pos > maxPos) maxPos = pos;
    }
    if (!teachable) continue;

    wordPos.set(w.id, maxPos);
    for (const ch of chars) {
      links.push({ wordId: w.id, literal: ch });
      if (!byKanji.has(ch)) byKanji.set(ch, []);
      byKanji.get(ch).push(w);
    }
  }

  // --- palabras ancla: las mejores N por kanji
  const anchors = new Map(); // literal -> [wordId]
  for (const [literal, list] of byKanji) {
    const kanaAnchor = kanaIn(literal).length > 0 && kanjiIn(literal).length === 0;
    const scored = list
      .map((w) => ({
        w,
        // menor es mejor. Para anclas de KANJI manda poder leerla pronto; para
        // anclas de KANA manda que la palabra sea util, porque el desbloqueo ya
        // se encarga de esperar a que sepas sus kana.
        key: kanaAnchor
          // Primero las que tienen rango de frecuencia REAL (nf de JMdict) y
          // por ese rango; luego, a igualdad, las mas cortas.
          //
          // Antes iba `-length`, premiando lo mas largo con la idea de que
          // seria vocabulario de contenido. Hacia lo contrario: ganaban las
          // onomatopeyas de cuatro moras (せかせか, うとうと) frente a なに,
          // だれ o これ.
          ? [w.freqRank ?? 999, [...w.reading].length, w.id]
          : [w.tier, wordPos.get(w.id) ?? 99999, w.freqRank ?? 99, [...w.headword].length, w.id],
      }))
      .sort((a, b) => {
        for (let i = 0; i < a.key.length; i++) {
          if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
        }
        return 0;
      });
    anchors.set(literal, scored.slice(0, ANCHORS_PER_KANJI).map((s) => s.w.id));
  }

  return { links, wordPos, anchors };
}

export function summarizeVocab({ words, wordPos, anchors, curriculumPos }) {
  const teachable = [...wordPos.keys()];
  const kanjiInCurriculum = [...curriculumPos.keys()].filter((k) => {
    const cp = k.codePointAt(0);
    return isKanji(cp);
  });
  const withAnchors = kanjiInCurriculum.filter((k) => (anchors.get(k)?.length ?? 0) > 0);
  return {
    totalWords: words.size,
    teachableWords: teachable.length,
    kanjiInCurriculum: kanjiInCurriculum.length,
    kanjiWithAnchors: withAnchors.length,
    kanjiWithoutAnchors: kanjiInCurriculum.length - withAnchors.length,
  };
}
