import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { F, T } from '@/ui/theme';

/**
 * Escribir a mano, encendido o apagado.
 *
 * Es el ajuste que mas cambia el trabajo diario, asi que se decide a
 * proposito y no por descarte. Cada kanji que gradua reconocimiento genera
 * ademas una tarjeta de escritura: al final del curriculum son ~2.800 tarjetas
 * mas, con su propia programacion y sus propios repasos.
 *
 * Reconocer e interpretar no necesita saber trazarlo. Escribir a mano se
 * aprende solo si se quiere escribir a mano.
 */
export function WritingSetting({ value, onChange }: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View>
      <Text style={styles.intro}>
        Reconocer un kanji y saber dibujarlo son dos cosas distintas. Dibujarlo
        ayuda a que no se te confundan los parecidos, pero duplica el tiempo
        que le dedicas cada día.
      </Text>
      {OPTIONS.map((o) => {
        const active = value === o.on;
        return (
          <Pressable
            key={o.label}
            onPress={() => onChange(o.on)}
            style={({ pressed }) => [
              styles.card, active && styles.cardActive, pressed && styles.cardPressed,
            ]}
          >
            <View style={styles.head}>
              <Text style={styles.label}>{o.label}</Text>
              {active && <Text style={styles.check}>✓</Text>}
            </View>
            <Text style={styles.detail}>{o.detail}</Text>
            <Text style={styles.load}>{o.load}</Text>
          </Pressable>
        );
      })}
      <Text style={styles.note}>
        Al apagarlo, las tarjetas de escritura que ya tengas se aparcan; no se
        borran. Si vuelves a encenderlo, siguen donde estaban.
      </Text>
    </View>
  );
}

const OPTIONS = [
  {
    on: false,
    label: 'Solo reconocer',
    detail: 'Ves el kanji y dices qué significa. Y lees palabras reales que lo usan.',
    load: 'la mitad de tarjetas',
  },
  {
    on: true,
    label: 'Reconocer y escribir',
    detail: 'Además, cada kanji que domines te pedirá dibujarlo de memoria.',
    load: 'el doble de tarjetas por kanji',
  },
] as const;

const styles = StyleSheet.create({
  intro: { fontSize: F.label, color: T.inkMid, lineHeight: 21, marginBottom: 12 },
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
  load: { fontSize: F.micro, color: T.inkSoft, marginTop: 5 },
  note: { fontSize: F.micro, color: T.inkSoft, lineHeight: 16, marginTop: 2 },
});
