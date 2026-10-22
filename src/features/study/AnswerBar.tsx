import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { Rating, type Grade } from '@/srs/scheduler';
import { humanInterval } from '@/lib/time';
import { F, T } from '@/ui/theme';

/**
 * Los cuatro botones NO son "acerte / falle": son cuanto te costo recordarlo,
 * y eso lo decide el usuario. Antes ponia "Dificil" y "6m", que es jerga de
 * Anki: parece una nota y no dice que el numero es CUANDO vuelve a salir.
 *
 * Ahora cada boton dice en cristiano que significa y cuando reaparece.
 */
const OPTIONS: { r: Grade; label: string; color: string }[] = [
  { r: Rating.Again, label: 'No me acordé', color: T.again },
  { r: Rating.Hard, label: 'Me costó', color: T.hard },
  { r: Rating.Good, label: 'Bien', color: T.good },
  { r: Rating.Easy, label: 'Muy fácil', color: T.easy },
];

export function AnswerBar({
  intervals, onAnswer, suggestLow, note,
}: {
  intervals: Record<number, number>;
  onAnswer: (r: Grade) => void;
  /** Cuando hay una senal objetiva de fallo (p.ej. trazos que no cuadran). */
  suggestLow?: boolean;
  note?: string | null;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{note ?? '¿qué tal te salió?'}</Text>
      <View style={styles.grid}>
        {OPTIONS.map(({ r, label, color }) => {
          const low = r === Rating.Again || r === Rating.Hard;
          const dim = suggestLow && !low;
          return (
            <Pressable
              key={r}
              onPress={() => onAnswer(r)}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: color },
                suggestLow && low && styles.btnSuggested,
                dim && styles.btnDim,
                pressed && styles.btnPressed,
              ]}
            >
              <Text style={[styles.label, { color }]}>{label}</Text>
              <Text style={styles.when}>vuelve en {humanInterval(intervals[r])}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 10 },
  prompt: {
    textAlign: 'center', color: T.inkSoft, fontSize: F.small,
    marginBottom: 10, letterSpacing: 0.2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  btn: {
    flexBasis: '47.5%', flexGrow: 1,
    borderWidth: 1, borderRadius: T.radius,
    paddingVertical: 14, paddingHorizontal: 10,
    alignItems: 'center', backgroundColor: T.surface,
  },
  btnSuggested: { borderWidth: 2 },
  btnDim: { opacity: 0.4 },
  btnPressed: { backgroundColor: T.sunken },
  label: { fontSize: F.body, fontWeight: '600' },
  when: { fontSize: F.micro, color: T.inkSoft, marginTop: 4 },
});
