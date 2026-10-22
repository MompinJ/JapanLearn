import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { FONT } from './fonts';

/**
 * UNICO componente de texto de la app. Fuerza la fuente japonesa empaquetada.
 *
 * Se usa este y no el Text de react-native porque un solo descuido deja un
 * texto con la fuente del sistema, y ahi es donde aparecen los glifos chinos.
 *
 * Como se empaquetan dos ficheros de peso separados (no una fuente variable,
 * que da problemas en Android), la familia se elige segun fontWeight en vez de
 * dejar que el sistema sintetice la negrita.
 */
export function Text({ style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const w = flat.fontWeight;
  const bold = w === 'bold' || (typeof w === 'string' && parseInt(w, 10) >= 600) || (typeof w === 'number' && w >= 600);
  return (
    <RNText
      {...rest}
      style={[style, { fontFamily: bold ? FONT.bold : FONT.regular, fontWeight: undefined }]}
    />
  );
}
