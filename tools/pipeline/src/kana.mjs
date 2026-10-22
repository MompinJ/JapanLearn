// Inventario completo de kana, en orden pedagogico: filas del gojuon primero,
// luego dakuten/handakuten, luego yoon. Hiragana entero antes que katakana.
// No depende de ningun dataset externo: los kana son un conjunto cerrado.

const BASIC = [
  ['あ','a'],['い','i'],['う','u'],['え','e'],['お','o'],
  ['か','ka'],['き','ki'],['く','ku'],['け','ke'],['こ','ko'],
  ['さ','sa'],['し','shi'],['す','su'],['せ','se'],['そ','so'],
  ['た','ta'],['ち','chi'],['つ','tsu'],['て','te'],['と','to'],
  ['な','na'],['に','ni'],['ぬ','nu'],['ね','ne'],['の','no'],
  ['は','ha'],['ひ','hi'],['ふ','fu'],['へ','he'],['ほ','ho'],
  ['ま','ma'],['み','mi'],['む','mu'],['め','me'],['も','mo'],
  ['や','ya'],['ゆ','yu'],['よ','yo'],
  ['ら','ra'],['り','ri'],['る','ru'],['れ','re'],['ろ','ro'],
  ['わ','wa'],['を','wo'],['ん','n'],
];

const DAKUTEN = [
  ['が','ga'],['ぎ','gi'],['ぐ','gu'],['げ','ge'],['ご','go'],
  ['ざ','za'],['じ','ji'],['ず','zu'],['ぜ','ze'],['ぞ','zo'],
  ['だ','da'],['ぢ','ji'],['づ','zu'],['で','de'],['ど','do'],
  ['ば','ba'],['び','bi'],['ぶ','bu'],['べ','be'],['ぼ','bo'],
  ['ぱ','pa'],['ぴ','pi'],['ぷ','pu'],['ぺ','pe'],['ぽ','po'],
];

// Yoon: se escriben con el kana pequeno. Se ensenan como unidad, no por partes.
const YOON_BASE = [
  ['き','ky'],['し','sh'],['ち','ch'],['に','ny'],['ひ','hy'],
  ['み','my'],['り','ry'],['ぎ','gy'],['じ','j'],['び','by'],['ぴ','py'],
];
const YOON_SMALL = [['ゃ','a'],['ゅ','u'],['ょ','o']];

// shi/chi/ji no llevan la 'y' en Hepburn: sha, cho, ju...
const romajiYoon = (stem, v) => (stem === 'sh' || stem === 'ch' || stem === 'j' ? stem + v : stem + v);

// katakana esta desplazado 0x60 respecto a hiragana en el bloque basico
const toKatakana = (s) => [...s].map((c) => {
  const cp = c.codePointAt(0);
  return cp >= 0x3041 && cp <= 0x3096 ? String.fromCodePoint(cp + 0x60) : c;
}).join('');

function buildScript(script) {
  const conv = script === 'katakana' ? toKatakana : (s) => s;
  const rows = [];

  for (const [k, r] of BASIC) rows.push({ literal: conv(k), romaji: r, group: 'basico' });
  for (const [k, r] of DAKUTEN) rows.push({ literal: conv(k), romaji: r, group: 'dakuten' });
  for (const [base, stem] of YOON_BASE) {
    for (const [small, v] of YOON_SMALL) {
      rows.push({
        literal: conv(base) + conv(small),
        romaji: romajiYoon(stem, v),
        group: 'yoon',
      });
    }
  }
  return rows.map((r) => ({ ...r, kind: script }));
}

export function buildKana() {
  return [...buildScript('hiragana'), ...buildScript('katakana')];
}
