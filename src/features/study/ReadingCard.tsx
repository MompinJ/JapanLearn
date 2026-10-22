import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import type { WordPayload } from '@/queue/queue';
import { T } from '@/ui/theme';

/**
 * Tarjeta de lectura: se muestra una palabra real y se pide su lectura.
 *
 * Es la pieza que hace que los kanji dejen de estudiarse aislados. Saber que
 * 日 significa "dia" sirve de poco; leer 日本 (にほん) ensena el kanji, una de
 * sus lecturas y vocabulario util a la vez.
 *
 * Con el vocabulario en KANA la pregunta tiene que ser otra. Ahi la palabra ya
 * esta escrita como se lee (ねこ, みず, ください), asi que pedir la lectura es
 * ensenar la respuesta en el enunciado: lo que se pregunta es el significado.
 */
export function ReadingCard({ word, revealed }: { word: WordPayload; revealed: boolean }) {
  const hasEs = word.meaningsEs.length > 0;
  const meaning = word.userGloss
    ?? (hasEs ? word.meaningsEs.slice(0, 2).join(', ') : word.meaningsEn.slice(0, 2).join(', '));
  const src = word.userGloss ? 'tuya' : hasEs ? 'es' : 'en';
  const writtenInKana = word.headword === word.reading;

  return (
    <>
      <Text style={styles.word}>{word.headword}</Text>

      {!revealed ? (
        <Text style={styles.tapHint}>
          {writtenInKana ? '¿qué significa?' : '¿cómo se lee?'}
        </Text>
      ) : (
        <ScrollView style={styles.answer} contentContainerStyle={styles.answerInner}>
          {!writtenInKana && <Text style={styles.reading}>{word.reading}</Text>}
          <View style={[styles.meaningRow, writtenInKana && styles.meaningRowAlone]}>
            <Text style={styles.meaning}>{meaning || '(sin significado)'}</Text>
            {src !== 'es' && (
              <View style={[styles.badge, { backgroundColor: src === 'tuya' ? T.esBadge : T.enBadge }]}>
                <Text style={styles.badgeText}>{src === 'tuya' ? 'TUYA' : 'EN INGLES'}</Text>
              </View>
            )}
          </View>
          {word.kanji.length > 0 && (
            <Text style={styles.kanji}>
              kanji: {word.kanji.map((k) => k.literal).join('  ')}
            </Text>
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  word: { fontSize: 62, color: T.ink, fontWeight: '600', textAlign: 'center' },
  tapHint: { marginTop: 34, color: T.inkSoft, fontSize: 14 },
  answer: { marginTop: 22, alignSelf: 'stretch', maxHeight: 230 },
  answerInner: { alignItems: 'center', paddingBottom: 12 },
  reading: { fontSize: 38, color: T.accent, fontWeight: '600' },
  meaningRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  // sin la linea de lectura encima, el significado no necesita separacion
  meaningRowAlone: { marginTop: 0 },
  meaning: { fontSize: 22, color: T.ink, textAlign: 'center' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  kanji: { marginTop: 18, fontSize: 15, color: T.inkSoft },
});
