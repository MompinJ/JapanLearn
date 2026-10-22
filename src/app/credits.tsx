import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { F, T } from '@/ui/theme';

/**
 * Atribuciones. NO es una cortesia: KANJIDIC2, JMdict y KanjiVG se publican
 * bajo CC BY-SA, que OBLIGA a reconocer la autoria y a indicar la licencia.
 * Usar sus datos sin esta pantalla incumpliria los terminos.
 *
 * Solo se lista lo que viaja de verdad dentro de la app.
 */
const SOURCES = [
  {
    name: 'KANJIDIC2',
    what: 'Significados, lecturas, número de trazos, grado escolar y frecuencia de cada kanji.',
    by: 'Electronic Dictionary Research and Development Group (EDRDG)',
    license: 'CC BY-SA 4.0',
    url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
  },
  {
    name: 'JMdict',
    what: 'Diccionario de vocabulario japonés con traducciones al español y al inglés.',
    by: 'Electronic Dictionary Research and Development Group (EDRDG)',
    license: 'CC BY-SA 4.0',
    url: 'https://www.edrdg.org/jmdict/j_jmdict.html',
  },
  {
    name: 'KanjiVG',
    what: 'Trazos de cada carácter, con su orden y su forma. Es lo que se dibuja en pantalla.',
    by: 'Ulrich Apel',
    license: 'CC BY-SA 3.0',
    url: 'https://kanjivg.tagaini.net',
  },
  {
    name: 'Noto Sans JP',
    what: 'La tipografía japonesa de la app.',
    by: 'Google',
    license: 'SIL Open Font License 1.1',
    url: 'https://fonts.google.com/noto/specimen/Noto+Sans+JP',
  },
  {
    name: 'FSRS · ts-fsrs',
    what: 'El algoritmo que decide cuándo vuelve cada tarjeta.',
    by: 'Open Spaced Repetition',
    license: 'MIT',
    url: 'https://github.com/open-spaced-repetition/ts-fsrs',
  },
];

export default function Credits() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <ScreenHeader kanji="礼" title="Créditos" />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.intro}>
          Esta app no sería posible sin estos proyectos. Sus datos se usan bajo las
          licencias indicadas, que exigen reconocer su autoría.
        </Text>

        {SOURCES.map((s) => (
          <View key={s.name} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.license}>{s.license}</Text>
            </View>
            <Text style={styles.what}>{s.what}</Text>
            <Text style={styles.by}>{s.by}</Text>
            <Pressable onPress={() => Linking.openURL(s.url).catch(() => {})} hitSlop={8}>
              <Text style={styles.url}>{s.url.replace(/^https?:\/\//, '')}</Text>
            </Pressable>
          </View>
        ))}

        <Text style={styles.foot}>
          Los datos de KANJIDIC2, JMdict y KanjiVG se distribuyen bajo CC BY-SA:
          cualquier obra derivada debe compartirse con la misma licencia.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  body: { paddingHorizontal: 18, paddingTop: 4 },
  intro: { fontSize: F.label, color: T.inkMid, lineHeight: 21, marginBottom: 16 },
  card: {
    backgroundColor: T.surface, borderRadius: T.radius,
    borderWidth: 1, borderColor: T.line, padding: 15, marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: F.body, color: T.ink, fontWeight: '700' },
  license: { fontSize: F.micro, color: T.inkSoft },
  what: { fontSize: F.small, color: T.inkMid, marginTop: 6, lineHeight: 19 },
  by: { fontSize: F.small, color: T.inkSoft, marginTop: 6 },
  url: { fontSize: F.small, color: T.accent, marginTop: 6 },
  foot: { fontSize: F.small, color: T.inkSoft, lineHeight: 19, marginTop: 8 },
});
