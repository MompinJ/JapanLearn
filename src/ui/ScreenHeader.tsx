import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { router } from 'expo-router';
import { F, T } from '@/ui/theme';

/** Cabecera comun: kanji de la seccion, titulo centrado y vuelta a estudiar. */
export function ScreenHeader({ kanji, title }: { kanji: string; title: string }) {
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => router.back()}
        hitSlop={14}
        style={({ pressed }) => [styles.side, pressed && { opacity: 0.5 }]}
      >
        <Text style={styles.back} numberOfLines={1}>← estudiar</Text>
      </Pressable>

      <View style={styles.middle}>
        <Text style={styles.kanji}>{kanji}</Text>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.side} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 10 },
  side: { flex: 1 },
  back: { color: T.accent, fontSize: F.label },
  middle: { flex: 2, alignItems: 'center' },
  kanji: { fontSize: 19, color: T.accent, lineHeight: 23 },
  title: { fontSize: F.small, color: T.inkSoft, letterSpacing: 0.8 },
});
