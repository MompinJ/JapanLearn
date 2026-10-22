// JMdict -> vocabulario.
//
// Se parsea por streaming con regex, no con SAX: el archivo declara entidades
// en su DTD interno (&n;, &vs;, &uk;...) y un parser SAX estandar aborta con
// "undefined entity" salvo que se le alimente el mapa a mano. Con regex el
// problema no existe, y ademas el nombre de la entidad ES el codigo que
// queremos guardar (n, v1, adj-i).
//
// Son 115 MB descomprimidos: hay que ir por trozos, no leer el archivo entero.
import fs from 'node:fs';
import { WORD_TIER_1, WORD_TIER_2, MAX_WORD_TIER } from './config.mjs';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

// Kana, kanji (incluida la extension B) y las marcas que se escriben con ellos
// (々 repeticion, ヶ/ヵ contadores, ー alargamiento, ・ separador).
const JAPANESE_ONLY =
  /^[\u3041-\u309f\u30a0-\u30ff\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u{20000}-\u{2fa1f}々〆ヶヵー・]+$/u;
const decode = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENT[m]);

const T1 = new Set(WORD_TIER_1);
const T2 = new Set(WORD_TIER_2);

function tierOf(prios) {
  for (const p of prios) if (T1.has(p)) return 1;
  for (const p of prios) if (T2.has(p)) return 2;
  return 3;
}

function freqRank(prios) {
  let best = null;
  for (const p of prios) {
    const m = /^nf(\d+)$/.exec(p);
    if (m) { const n = parseInt(m[1], 10); if (best == null || n < best) best = n; }
  }
  return best;
}

function parseEntry(xml) {
  const seq = /<ent_seq>(\d+)<\/ent_seq>/.exec(xml);
  if (!seq) return null;
  const id = parseInt(seq[1], 10);

  const kebs = [];
  const prios = [];
  for (const k of xml.matchAll(/<k_ele>([\s\S]*?)<\/k_ele>/g)) {
    const keb = /<keb>([^<]+)<\/keb>/.exec(k[1]);
    if (keb) kebs.push(decode(keb[1]));
    for (const p of k[1].matchAll(/<ke_pri>([^<]+)<\/ke_pri>/g)) prios.push(p[1]);
  }
  const rebs = [];
  for (const r of xml.matchAll(/<r_ele>([\s\S]*?)<\/r_ele>/g)) {
    const reb = /<reb>([^<]+)<\/reb>/.exec(r[1]);
    if (reb) rebs.push(decode(reb[1]));
    for (const p of r[1].matchAll(/<re_pri>([^<]+)<\/re_pri>/g)) prios.push(p[1]);
  }
  if (!rebs.length) return null;

  const tier = tierOf(prios);
  if (tier > MAX_WORD_TIER) return null;   // se descarta pronto: memoria

  // sentidos: los que no llevan xml:lang son ingles; el espanol va en
  // bloques <sense> propios al final de la entrada
  const senses = [];
  for (const s of xml.matchAll(/<sense>([\s\S]*?)<\/sense>/g)) {
    const body = s[1];
    const pos = [...body.matchAll(/<pos>&([a-z0-9-]+);<\/pos>/g)].map((m) => m[1]);
    // <misc>&uk;</misc> = "usually written in kana". Son las palabras que en
    // texto real aparecen en kana aunque tengan forma con kanji: これ, きれい,
    // ありがとう, たくさん. Justo el vocabulario legible nada mas saber los
    // silabarios, y sin esto se quedaba fuera.
    const misc = [...body.matchAll(/<misc>&([a-z0-9-]+);<\/misc>/g)].map((m) => m[1]);
    const es = [...body.matchAll(/<gloss xml:lang="spa"[^>]*>([^<]+)<\/gloss>/g)].map((m) => decode(m[1]));
    if (es.length) { senses.push({ lang: 'es', pos, misc, glosses: es }); continue; }
    const en = [...body.matchAll(/<gloss(?: xml:lang="eng")?(?: g_type="[^"]*")?>([^<]+)<\/gloss>/g)].map((m) => decode(m[1]));
    if (en.length) senses.push({ lang: 'en', pos, misc, glosses: en });
  }
  if (!senses.length) return null;

  // Recorte de la cola larga. Una entrada de JMdict puede traer 20 sentidos con
  // 8 sinonimos cada uno; en una app de estudio nadie lee mas alla de los
  // primeros. Limitarlo baja la BD varios MB sin perder nada util.
  const MAX_SENSES_PER_LANG = 4;
  const MAX_GLOSSES = 4;
  const keep = { en: 0, es: 0 };
  const trimmed = [];
  for (const sn of senses) {
    if (keep[sn.lang] >= MAX_SENSES_PER_LANG) continue;
    keep[sn.lang]++;
    trimmed.push({ ...sn, glosses: sn.glosses.slice(0, MAX_GLOSSES) });
  }
  senses.length = 0;
  senses.push(...trimmed);

  // "uk" (usually written in kana) SOLO cuenta si esta en el sentido
  // PRINCIPAL. Antes valia con que lo llevara cualquier sentido, y eso
  // clasifica mal 263 palabras: 爆弾 lleva uk en su segundo sentido, que es un
  // combinado alcoholico de argot escrito バクダン, no en el primero, que es
  // "bomba" y se escribe con kanji siempre. Resultado: 爆弾, 改善, 偉い o 移す
  // entraban como vocabulario legible con solo saber los silabarios.
  const primary = senses[0];
  const usuallyKana = (primary?.misc ?? []).includes('uk') ? 1 : 0;

  // Palabra que se ESTUDIA en kana: o no tiene forma con kanji, o en texto real
  // se escribe en kana aunque la tenga (これ, きれい, たくさん).
  //
  // En ese caso el headword es la LECTURA, no el kanji. El headword es lo que
  // la tarjeta pone delante, y ensenar 此れ a quien acaba de aprender el
  // hiragana es justo lo contrario de lo que toca: la forma que tiene que
  // reconocer es これ. Las formas con kanji siguen en word_form para la ficha.
  // Hay entradas cuya "forma con kanji" usa cifras arabigas o alfabeto latino:
  // １月 (いちがつ), ３０００ (さんぜん), ＯＵＴ (アウト). Puestas delante de una
  // tarjeta ensenan a leer un teclado, no japones. Se busca la primera forma
  // escrita SOLO en japones; si no hay ninguna, la palabra se estudia en kana.
  const kebJp = kebs.find((k) => JAPANESE_ONLY.test(k));
  const studyInKana = kebJp == null || usuallyKana === 1;

  return {
    id,
    headword: studyInKana ? rebs[0] : kebJp,
    reading: rebs[0],
    kanaOnly: studyInKana ? 1 : 0,
    tier,
    freqRank: freqRank(prios),
    forms: [...new Set(kebs)],
    readings: [...new Set(rebs)],
    senses,
    hasEs: senses.some((s) => s.lang === 'es') ? 1 : 0,
    usuallyKana,
  };
}

/** Recorre el archivo por trozos y devuelve solo las palabras de tier <= MAX. */
export function parseJmdict(file) {
  const out = new Map();
  const fd = fs.openSync(file, 'r');
  const CHUNK = 8 * 1024 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let tail = '';
  let pos = 0;

  for (;;) {
    const n = fs.readSync(fd, buf, 0, CHUNK, pos);
    if (n <= 0) break;
    pos += n;
    let text = tail + buf.toString('utf8', 0, n);
    let idx;
    while ((idx = text.indexOf('</entry>')) !== -1) {
      const end = idx + '</entry>'.length;
      const start = text.lastIndexOf('<entry>', idx);
      if (start !== -1) {
        const rec = parseEntry(text.slice(start, end));
        if (rec) out.set(rec.id, rec);
      }
      text = text.slice(end);
    }
    tail = text;
  }
  fs.closeSync(fd);
  return out;
}

export function summarizeWords(words) {
  const all = [...words.values()];
  const t1 = all.filter((w) => w.tier === 1);
  return {
    total: all.length,
    tier1: t1.length,
    withEs: all.filter((w) => w.hasEs).length,
    tier1WithEs: t1.filter((w) => w.hasEs).length,
  };
}
