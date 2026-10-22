import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { router } from 'expo-router';
import { F, T } from '@/ui/theme';

/**
 * Navegacion con kanji reales en vez de iconos genericos: encaja con la
 * estetica y ademas son dos caracteres que el usuario va a aprender igualmente.
 *   本 (libro)  -> Biblioteca
 *   歩 (paso)   -> Avances
 * La etiqueta en espanol va debajo: el kanji decora, no cifra la funcion.
 */
export function NavBar({ center }: { center?: React.ReactNode }) {
  return (
    <View style={styles.bar}>
      <NavItem kanji="本" label="Biblioteca" onPress={() => router.push('/library')} />
      <View style={styles.center}>{center}</View>
      <NavItem kanji="歩" label="Avances" onPress={() => router.push('/stats')} align="right" />
    </View>
  );
}

function NavItem({ kanji, label, onPress, align = 'left' }: {
  kanji: string; label: string; onPress: () => void; align?: 'left' | 'right';
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.item, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }, pressed && styles.pressed]}
    >
      <Text style={styles.kanji}>{kanji}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', paddingBottom: 4 },
  item: { minWidth: 76 },
  pressed: { opacity: 0.5 },
  kanji: { fontSize: 21, color: T.accent, lineHeight: 26 },
  label: { fontSize: F.micro, color: T.inkSoft, marginTop: -1 },
  center: { flex: 1, alignItems: 'center', paddingTop: 6 },
});
