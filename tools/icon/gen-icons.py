#!/usr/bin/env python3
"""
Genera el juego de iconos de la app a partir de los trazos REALES de KanjiVG.

Por que no se dibuja el kanji a mano ni se genera con un modelo de imagen: los
generadores de imagen inventan los trazos. Producen algo con aspecto de kanji
que no es ningun kanji, con trazos de mas, de menos o en orden imposible. En
una app para APRENDER kanji eso es el peor fallo posible, y ademas es invisible
para cualquiera que no sepa japones.

La app ya dibuja cada glifo desde KanjiVG por ese mismo motivo (ver README).
El icono sale de la misma fuente: es literalmente el mismo caracter que la app
te va a ensenar.

Uso:
    python3 tools/icon/gen-icons.py           # kanji por defecto
    python3 tools/icon/gen-icons.py 学        # otro kanji
    python3 tools/icon/gen-icons.py --compare # hoja de comparacion, no escribe assets
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = os.path.join(ROOT, 'assets/db/japanese.db')
OUT = os.path.join(ROOT, 'assets/images')

# Paleta de src/ui/theme.ts. Si cambia alli, cambia aqui.
WASHI = '#faf8f3'   # papel
SUMI = '#1a1714'    # tinta
SHU = '#b5402a'     # bermellon del sello

KVG = 109           # viewBox de KanjiVG: "0 0 109 109"

# Zona segura de los iconos adaptativos de Android: el sistema recorta a un
# circulo, un squircle o lo que decida el lanzador, y solo garantiza el 66%
# central. Todo lo que se salga de ahi se puede perder.
SAFE_ZONE = 0.66


def strokes_for(literal):
    db = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    row = db.execute(
        'SELECT s.paths FROM glyph g JOIN glyph_strokes s ON s.glyph_id = g.id '
        'WHERE g.literal = ?', (literal,)).fetchone()
    db.close()
    if not row:
        sys.exit(f'{literal} no tiene trazos en {DB}')
    return [s['d'] for s in json.loads(row[0])]


def paths_group(paths, x, y, size, color, width):
    """Coloca un glifo de KanjiVG en una caja de `size` puntos en (x, y)."""
    s = size / KVG
    body = ''.join(f'<path d="{d}"/>' for d in paths)
    return (f'<g transform="translate({x:.2f},{y:.2f}) scale({s:.5f})" fill="none" '
            f'stroke="{color}" stroke-width="{width}" stroke-linecap="round" '
            f'stroke-linejoin="round">{body}</g>')


def seal(x, y, size, ink):
    """
    Sello hanko en bermellon con 日 calado en negativo.

    日 se lee tanto "sol" como "Japon" y son cuatro trazos: es lo unico que
    sigue leyendose cuando el icono baja a 48 px, donde el kanji grande ya es
    una mancha.
    """
    r = size * 0.16
    pad = size * 0.11
    inner = size - 2 * pad
    glyph_pad = size * 0.24
    return (
        f'<g transform="translate({x:.2f},{y:.2f})">'
        f'<rect width="{size:.2f}" height="{size:.2f}" rx="{r:.2f}" fill="{SHU}"/>'
        f'<rect x="{pad:.2f}" y="{pad:.2f}" width="{inner:.2f}" height="{inner:.2f}" '
        f'rx="{r * 0.55:.2f}" fill="none" stroke="{ink}" stroke-width="{size * 0.045:.2f}"/>'
        + paths_group(strokes_for('日'), glyph_pad, glyph_pad,
                      size - 2 * glyph_pad, ink, 7.5)
        + '</g>')


def icon_svg(paths, canvas, background, with_seal=True, fit=None, ink=SUMI):
    """
    Compone el icono sobre una caja fija de 1024 y opcionalmente lo reencuadra.

    `fit` es la fraccion del lienzo que debe ocupar el DIBUJO, no el lienzo.
    Esa distincion es justo el error tipico del icono adaptativo de Android:
    encoger el lienzo entero al 66% encoge tambien sus margenes, y como la
    composicion ya trae los suyos, el kanji acababa ocupando un 41% del icono y
    se veia perdido dentro del circulo. Reencuadrando por la caja del dibujo,
    el 66% se gasta en tinta.
    """
    C = 1024.0
    # El glifo no va centrado: se sube para dejar aire abajo a la derecha, que
    # es donde cae el sello. Es la composicion de un tanzaku, no una cuadricula.
    glyph_size = 640.0 if with_seal else 780.0
    gx = (C - glyph_size) / 2
    gy = 160.0 if with_seal else (C - glyph_size) / 2

    content = paths_group(paths, gx, gy, glyph_size, ink, 6.4)
    box = [gx, gy, gx + glyph_size, gy + glyph_size]

    if with_seal:
        sx, sy, ss = 778.0, 800.0, 140.0
        # El calado del sello va SIEMPRE en washi, tambien sobre fondo
        # transparente: el sello lleva debajo su propio rectangulo solido, asi
        # que el color del papel no depende de que haya papel detras.
        content += seal(sx, sy, ss, WASHI)
        box = [min(box[0], sx), min(box[1], sy),
               max(box[2], sx + ss), max(box[3], sy + ss)]

    if fit is not None:
        bw, bh = box[2] - box[0], box[3] - box[1]
        k = (C * fit) / max(bw, bh)
        # centrar la caja del dibujo en el lienzo, ya escalada
        tx = (C - bw * k) / 2 - box[0] * k
        ty = (C - bh * k) / 2 - box[1] * k
        content = f'<g transform="translate({tx:.2f},{ty:.2f}) scale({k:.5f})">{content}</g>'

    bg = f'<rect width="{C}" height="{C}" fill="{WASHI}"/>' if background else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {C:.0f} {C:.0f}" '
            f'width="{canvas}" height="{canvas}">{bg}{content}</svg>')


def render(svg, path, size):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(svg)
        tmp = f.name
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-o', path, tmp],
                   check=True)
    os.unlink(tmp)
    print(f'  {os.path.relpath(path, ROOT)}  {size}x{size}')


def build(literal):
    paths = strokes_for(literal)
    print(f'\n{literal}: {len(paths)} trazos de KanjiVG')
    os.makedirs(OUT, exist_ok=True)

    # icono principal: a pantalla completa, sin transparencia (iOS la rechaza)
    render(icon_svg(paths, 1024, background=True), os.path.join(OUT, 'icon.png'), 1024)

    # Android adaptativo: primer plano transparente dentro de la zona segura,
    # y el fondo como capa propia de color plano.
    render(icon_svg(paths, 512, background=False, fit=SAFE_ZONE),
           os.path.join(OUT, 'android-icon-foreground.png'), 512)
    render(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" width="512" '
           f'height="512"><rect width="1" height="1" fill="{WASHI}"/></svg>',
           os.path.join(OUT, 'android-icon-background.png'), 512)

    # tematico: el sistema lo recolorea, asi que va en negro plano y SIN sello
    # (el bermellon se perderia igual y solo ensuciaria la silueta)
    render(icon_svg(paths, 432, background=False, with_seal=False,
                    fit=SAFE_ZONE, ink='#000000'),
           os.path.join(OUT, 'android-icon-monochrome.png'), 432)

    # splash: solo el kanji, sin sello ni papel. El color de fondo lo pone
    # app.json, asi la marca de agua no se recorta en pantallas raras.
    render(icon_svg(paths, 512, background=False, with_seal=False),
           os.path.join(OUT, 'splash-icon.png'), 512)

    # El favicon va SIN sello y con el glifo mas grande: a 48 px el sello es un
    # punto rojo que no aporta y el kanji necesita cada pixel que pueda robarle.
    render(icon_svg(paths, 48, background=True, with_seal=False),
           os.path.join(OUT, 'favicon.png'), 48)


def compare(candidates):
    """Hoja de contactos para elegir kanji. No toca assets/."""
    out = os.path.join(tempfile.gettempdir(), 'japanlearn-iconos.png')
    tiles = []
    for lit in candidates:
        p = os.path.join(tempfile.gettempdir(), f'icon-{ord(lit)}.png')
        render(icon_svg(strokes_for(lit), 512, background=True), p, 512)
        small = os.path.join(tempfile.gettempdir(), f'icon-{ord(lit)}-48.png')
        render(icon_svg(strokes_for(lit), 48, background=True, with_seal=False), small, 48)
        tiles += [p, small]
    subprocess.run(['magick', 'montage', *tiles, '-tile', '2x', '-geometry', '+18+18',
                    '-background', '#ffffff', out], check=True)
    print(f'\ncomparativa: {out}')
    return out


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not shutil.which('rsvg-convert'):
        sys.exit('hace falta rsvg-convert (paquete librsvg)')
    if '--compare' in sys.argv:
        compare(args or ['覚', '学'])
    else:
        build(args[0] if args else '覚')
        print('\nlisto')
