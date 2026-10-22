#!/usr/bin/env bash
# Subsetea Noto Sans JP al conjunto exacto de caracteres del contenido.
#
# Empaquetar la fuente NO es opcional en esta app: sin ella Android puede
# resolver los kanji con la variante china (Han unification) y mostrar una
# forma distinta de la japonesa. En una app cuyo proposito es ensenar la forma
# del caracter, eso seria ensenar la forma equivocada.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PIPE="$(cd "$HERE/.." && pwd)"
OUT="$PIPE/../../assets/fonts"
VENV="$PIPE/.venv/bin"
CACHE="$PIPE/.cache"
SRC="$CACHE/NotoSansJP-var.ttf"
CHARSET="$CACHE/charset.txt"

mkdir -p "$OUT" "$CACHE"

if [ ! -f "$SRC" ]; then
  echo "  bajando Noto Sans JP variable..."
  curl -sL -o "$SRC" \
    "https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"
fi
echo "  origen: $(du -h "$SRC" | cut -f1)"

for W in 400:Regular 700:Bold; do
  WEIGHT="${W%%:*}"; NAME="${W##*:}"
  # Se instancia a peso estatico: las fuentes variables dan problemas en
  # Android dentro de React Native.
  "$VENV/fonttools" varLib.instancer -q "$SRC" "wght=$WEIGHT" -o "$CACHE/nsjp-$WEIGHT.ttf" >/dev/null
  "$VENV/pyftsubset" "$CACHE/nsjp-$WEIGHT.ttf" \
    --unicodes-file="$CHARSET" \
    --layout-features='kern,liga,vert,vrt2,palt,halt' \
    --no-hinting --desubroutinize --drop-tables+=DSIG \
    --output-file="$OUT/NotoSansJP-$NAME.ttf"
  echo "  $NAME: $(du -h "$OUT/NotoSansJP-$NAME.ttf" | cut -f1)"
done
