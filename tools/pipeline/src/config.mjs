// Configuracion del pipeline. Las URLs y umbrales viven aqui, en un solo sitio.
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

export const PIPELINE_VERSION = 1;
export const CONTENT_SCHEMA_VERSION = 1;

export const DIRS = {
  pipeline: path.resolve(here, '..'),
  cache: path.resolve(here, '../.cache'),
  raw: path.resolve(here, '../.cache/raw'),
  data: path.resolve(here, '../data'),
  reports: path.resolve(here, '../reports'),
  assetsDb: path.resolve(here, '../../../assets/db'),
  assetsFonts: path.resolve(here, '../../../assets/fonts'),
};

export const SOURCES = {
  kanjidic2: {
    url: 'http://www.edrdg.org/kanjidic/kanjidic2.xml.gz',
    file: 'kanjidic2.xml',
    gzip: true,
  },
  kanjivg: {
    url: 'https://github.com/KanjiVG/kanjivg/releases/download/r20250816/kanjivg-20250816.xml.gz',
    file: 'kanjivg.xml',
    gzip: true,
  },
  jmdict: {
    url: 'http://ftp.edrdg.org/pub/Nihongo/JMdict.gz',
    file: 'jmdict.xml',
    gzip: true,
  },
};

// Tiers de vocabulario segun los tags de prioridad de JMdict. Medido:
//   tier 1 (news1/ichi1/spec1/gai1): 20.952 palabras, 72% con espanol
//   tier 2 (+news2/ichi2/spec2/gai2): 30.159 acumuladas, 59% con espanol
// Se incluyen 1 y 2 (eleccion del usuario: ~30.000 palabras).
export const WORD_TIER_1 = ['news1', 'ichi1', 'spec1', 'gai1'];
export const WORD_TIER_2 = ['news2', 'ichi2', 'spec2', 'gai2'];
export const MAX_WORD_TIER = 2;

// Palabras ancla por kanji para las tarjetas de lectura.
export const ANCHORS_PER_KANJI = 4;

// Cada cuantos items del flujo de kanji se intercala un katakana.
//
// El katakana ya no va en bloque delante del primer kanji. Iba, y costaba 104
// items de silabario que retrasaban el kanji nº 1 hasta la posicion 209: a 12
// items nuevos al dia son ~17 dias de simbolos sueltos antes de ver un solo
// kanji. Intercalado 1 de cada 3, el primer kanji llega en la posicion 105 y el
// silabario se completa igual, en paralelo.
export const KATAKANA_EVERY = 3;

// Grado maximo del objetivo. Medido sobre KANJIDIC2:
//   grade 1-6  = 1.026  kyouiku (primaria)
//   grade 8    = 1.110  resto de jouyou  -> jouyou total = 2.136 (cifra oficial)
//   grade 9    =   651  jinmeiyou real (kanji de nombres)
//   grade 10   =   212  VARIANTES de compatibilidad de kanji jouyou que ya estan
//                       en la lista. No son caracteres que se aprendan: son formas
//                       antiguas/tipograficas, sin trazos en KanjiVG y casi sin
//                       significados. Se EXCLUYEN.
// Objetivo resultante: 2.787 kanji.
export const MAX_GRADE = 9;

// Tope duro del artefacto final. Si se pasa, el build falla y obliga a decidir.
export const MAX_DB_BYTES = 25 * 1024 * 1024;

// Cobertura minima de espanol en los kanji objetivo. Medido: ~81%.
export const MIN_ES_COVERAGE_TARGET = 0.70;

// Rango de uso privado para componentes de KanjiVG que no tienen codepoint propio.
export const PUA_BASE = 0xf0000;
