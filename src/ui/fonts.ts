import { useFonts } from 'expo-font';

/**
 * Noto Sans JP subseteada al contenido exacto de la BD.
 *
 * Empaquetarla NO es opcional: sin fuente japonesa, Android puede resolver los
 * kanji con la variante china (Han unification) y dibujar una forma distinta
 * de la japonesa. En una app que ensena la forma del caracter, eso seria
 * ensenar la forma equivocada.
 */
export const FONT = { regular: 'NotoSansJP', bold: 'NotoSansJP-Bold' } as const;

export function useAppFonts() {
  const [loaded, error] = useFonts({
    [FONT.regular]: require('@/assets/fonts/NotoSansJP-Regular.ttf'),
    [FONT.bold]: require('@/assets/fonts/NotoSansJP-Bold.ttf'),
  });
  return { loaded, error };
}
