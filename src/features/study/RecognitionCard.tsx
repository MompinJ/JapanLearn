import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { GlyphSvg } from '@/features/glyph/GlyphSvg';
import type { GlyphPayload } from '@/queue/queue';
import { T } from '@/ui/theme';

export function RecognitionCard({ glyph, revealed, size }: {
  glyph: GlyphPayload; revealed: boolean; size: number;
}) {
  const isKana = glyph.kind === 'hiragana' || glyph.kind === 'katakana';
  const hasEs = glyph.meaningsEs.length > 0;
  const meaning = glyph.userGloss
    ?? (hasEs ? glyph.meaningsEs.slice(0, 3).join(', ') : glyph.meaningsEn.slice(0, 3).join(', '));
  const src = glyph.userGloss ? 'tuya' : hasEs ? 'es' : 'en';

  return (
    <>
      <GlyphSvg strokes={glyph.strokes} viewBox={glyph.view_box} size={size} color={T.ink} />
      {!glyph.strokes && <Text style={styles.fallback}>{glyph.literal}</Text>}

      {!revealed ? (
        <Text style={styles.tapHint}>toca para ver la respuesta</Text>
      ) : (
        <ScrollView style={styles.answer} contentContainerStyle={styles.answerInner}>
          {isKana ? (
            <Text style={styles.romaji}>{glyph.romaji}</Text>
          ) : (
            <>
              <View style={styles.meaningRow}>
                <Text style={styles.meaning}>{meaning || '(sin significado)'}</Text>
                {src !== 'es' && (
                  <View style={[styles.badge, { backgroundColor: src === 'tuya' ? T.esBadge : T.enBadge }]}>
                    <Text style={styles.badgeText}>{src === 'tuya' ? 'TUYA' : 'EN INGLES'}</Text>
                  </View>
                )}
              </View>
              {glyph.readingsKun.length > 0 && (
                <Text style={styles.reading}>
                  <Text style={styles.readingLabel}>kun </Text>{glyph.readingsKun.slice(0, 4).join('、')}
                </Text>
              )}
              {glyph.readingsOn.length > 0 && (
                <Text style={styles.reading}>
                  <Text style={styles.readingLabel}>on </Text>{glyph.readingsOn.slice(0, 4).join('、')}
                </Text>
              )}
              {glyph.components.length > 0 && (
                <Text style={styles.components}>
                  compuesto de {glyph.components.map((c) => c.literal).join(' + ')}
                </Text>
              )}
            </>
          )}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  fallback: { fontSize: 140, color: T.ink },
  tapHint: { marginTop: 36, color: T.inkSoft, fontSize: 14 },
  answer: { marginTop: 20, alignSelf: 'stretch', maxHeight: 230 },
  answerInner: { alignItems: 'center', paddingBottom: 12 },
  romaji: { fontSize: 44, color: T.ink, fontWeight: '600' },
  meaningRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  meaning: { fontSize: 26, color: T.ink, textAlign: 'center', fontWeight: '600' },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  reading: { marginTop: 10, fontSize: 19, color: T.ink },
  readingLabel: { fontSize: 12, color: T.inkSoft },
  components: { marginTop: 16, fontSize: 15, color: T.inkSoft },
});
