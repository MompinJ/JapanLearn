import Svg, { Path } from 'react-native-svg';

/**
 * Renderiza el glifo desde los paths de KanjiVG, NO como texto con una fuente.
 *
 * Esto elimina de raiz el riesgo de Han unification: en Android el sistema
 * puede resolver un kanji con la variante china y mostrar una forma distinta
 * de la japonesa. En una app cuyo proposito es ensenar la forma del caracter,
 * eso seria ensenar la forma equivocada. El path de KanjiVG ES la forma correcta.
 */
export function GlyphSvg({
  strokes, viewBox = '0 0 109 109', size = 200, color = '#111', strokeWidth = 4.5, upTo,
}: {
  strokes: { d: string; t?: string | null }[] | null;
  viewBox?: string | null;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Si se pasa, solo dibuja los primeros N trazos (modo guiado / animacion). */
  upTo?: number;
}) {
  if (!strokes?.length) return null;
  const shown = upTo == null ? strokes : strokes.slice(0, upTo);
  return (
    <Svg width={size} height={size} viewBox={viewBox ?? '0 0 109 109'}>
      {shown.map((s, i) => (
        <Path
          key={i}
          d={s.d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}
