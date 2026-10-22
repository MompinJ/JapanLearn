import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { F, T } from '@/ui/theme';

/**
 * Explicador que aparece las primeras veces que se revela una respuesta.
 *
 * Sin esto el sistema es opaco: cuatro botones y unos numeros sueltos. La duda
 * natural de cualquiera que empieza es "si le doy a Otra vez y vuelve a salir,
 * ¿que gano?". La respuesta es justo lo contrario de lo que parece intuitivo,
 * asi que hay que decirla.
 */
export function HowItWorks({ onDismiss }: { onDismiss: () => void }) {
  // Va en modal, no en linea. Puesto entre la tarjeta y los botones le robaba
  // el sitio a la respuesta y la dejaba cortada detras de la explicacion.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kanji}>覚</Text>
        <Text style={styles.title}>Cómo funciona</Text>
      </View>

      <Text style={styles.p}>
        Los botones no son <Text style={styles.em}>acertar o fallar</Text>. Dices cuánto te
        costó recordarlo, y la app calcula cuándo volver a preguntártelo.
      </Text>
      <Text style={styles.p}>
        Si <Text style={styles.em}>no te acordaste</Text>, vuelve en un minuto. Parece inútil,
        pero es al revés: verlo otra vez mientras sigue fresco es justo lo que lo fija.
        Dejarlo para mañana solo desperdicia el intento.
      </Text>
      <Text style={styles.p}>
        Si fue <Text style={styles.em}>fácil</Text>, no lo verás en días. Así el tiempo se va
        en lo que te cuesta, no en lo que ya sabes.
      </Text>

            <Pressable onPress={onDismiss} style={styles.btn}>
              <Text style={styles.btnText}>Entendido</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#1a1714aa' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  card: {
    backgroundColor: T.bg, borderRadius: T.radiusLg,
    padding: 22,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  kanji: { fontSize: 26, color: T.accent },
  title: { fontSize: F.title, fontWeight: '700', color: T.ink },
  p: { fontSize: F.label, color: T.inkMid, lineHeight: 21, marginBottom: 9 },
  em: { color: T.ink, fontWeight: '700' },
  btn: {
    marginTop: 14, backgroundColor: T.ink, borderRadius: T.radius,
    paddingVertical: 13, alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: F.body, fontWeight: '600' },
});
