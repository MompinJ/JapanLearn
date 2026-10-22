import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { F, T } from '@/ui/theme';

/**
 * Ritmo de repaso = request_retention de FSRS.
 *
 * Es la probabilidad OBJETIVO de que sigas acordandote cuando la tarjeta
 * vuelva. No es una preferencia estetica: define cuanto se alargan los
 * intervalos y, por tanto, cuanto trabajo diario tendras.
 *
 * Las curvas y las cargas son numeros REALES, medidos con el algoritmo sobre
 * una tarjeta respondida siempre "Bien" durante un ano.
 */
export const PACES = [
  {
    value: 0.90,
    label: 'Relajado',
    recall: 'te acordarás el 90% de las veces',
    detail: 'Vuelve poco. Menos tiempo al día, pero se te escapan más cosas.',
    curve: '2 días → 11 días → 1.5 meses',
    load: '6 repasos al año por tarjeta',
  },
  {
    value: 0.95,
    label: 'Equilibrado',
    recall: 'te acordarás el 95% de las veces',
    detail: 'Vuelve más a menudo. Más tiempo al día, se te olvida menos.',
    curve: '1 día → 3 días → 8 días → 19 días',
    load: '9 repasos al año por tarjeta',
  },
  {
    value: 0.97,
    label: 'Exigente',
    recall: 'te acordarás el 97% de las veces',
    detail: 'Vuelve mucho. Bastante más tiempo al día, casi no olvidas nada.',
    curve: '1 día → 2 días → 4 días → 7 días',
    load: '11 repasos al año por tarjeta',
  },
] as const;

export function PaceSetting({ value, onChange }: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View>
      <Text style={styles.intro}>
        Cuanto más vuelve algo, mejor se te queda. Lo que cuesta no es memoria,
        es tiempo: bajar más la lista significa más minutos al día.
      </Text>
      <Text style={styles.introSmall}>
        Se aplica desde el próximo repaso; lo ya programado no se recalcula.
      </Text>
      {PACES.map((p) => {
        const active = Math.abs(value - p.value) < 0.005;
        return (
          <Pressable
            key={p.value}
            onPress={() => onChange(p.value)}
            style={({ pressed }) => [
              styles.card, active && styles.cardActive, pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.head}>
              <Text style={styles.label}>{p.label}</Text>
              {active && <Text style={styles.check}>✓</Text>}
            </View>
            <Text style={styles.recall}>{p.recall}</Text>
            <Text style={styles.detail}>{p.detail}</Text>
            <Text style={styles.curve}>{p.curve}</Text>
            <Text style={styles.load}>{p.load}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: F.label, color: T.inkMid, lineHeight: 21, marginBottom: 6 },
  introSmall: { fontSize: F.micro, color: T.inkSoft, lineHeight: 16, marginBottom: 12 },
  recall: { fontSize: F.small, color: T.dataDone, fontWeight: '700', marginTop: 5 },
  card: {
    backgroundColor: T.surface, borderRadius: T.radius,
    borderWidth: 1, borderColor: T.line,
    padding: 14, marginBottom: 9,
  },
  cardActive: { borderColor: T.ink, borderWidth: 2 },
  cardPressed: { backgroundColor: T.sunken },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: F.body, color: T.ink, fontWeight: '600' },
  check: { fontSize: F.body, color: T.dataDone, fontWeight: '700' },
  detail: { fontSize: F.small, color: T.inkMid, marginTop: 5, lineHeight: 18 },
  curve: { fontSize: F.small, color: T.accent, marginTop: 6 },
  load: { fontSize: F.micro, color: T.inkSoft, marginTop: 3 },
});
