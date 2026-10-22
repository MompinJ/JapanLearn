import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView,
  StyleSheet, TextInput, View,
} from 'react-native';
import { Text } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';

import {
  forgetItem, introduceNow, libraryCounts, libraryPage, removeItem, setSuspended, setUserGloss,
  type Counts, type LibraryRow, type Scope, type Status,
} from '@/db/library';
import { F, T } from '@/ui/theme';
import { humanInterval } from '@/lib/time';
import { ScreenHeader } from '@/ui/ScreenHeader';

const PAGE = 60;

const SCOPES: { k: Scope; label: string }[] = [
  { k: 'all', label: 'Todo' },
  { k: 'kana', label: 'Kana' },
  { k: 'kanji', label: 'Kanji' },
  { k: 'component', label: 'Piezas' },
  { k: 'word', label: 'Vocabulario' },
];

const STATUSES: { k: Status; label: string }[] = [
  { k: 'all', label: 'Todos' },
  { k: 'new', label: 'Sin ver' },
  { k: 'learning', label: 'Aprendiendo' },
  { k: 'known', label: 'Afianzados' },
  { k: 'suspended', label: 'Ocultos' },
];

/**
 * Nada "se termina": en FSRS el estado 2 solo significa que salio de la fase de
 * aprendizaje y pasa a intervalos largos (dias, meses, anos), pero sigue
 * volviendo, y si lo fallas cae otra vez a minutos. Por eso no se dice
 * "dominado" —que promete un final que no existe— sino cuando vuelve.
 * Lo unico que saca algo de la rotacion es ocultarlo.
 */
function statusOf(r: LibraryRow, now: number) {
  if (r.suspended) return { label: 'oculto', color: T.inkSoft };
  if (r.state == null) return { label: 'sin ver', color: T.line };
  if (r.state === 2) {
    const gap = (r.due ?? now) - now;
    return {
      label: gap > 60000 ? `en ${humanInterval(gap)}` : 'pendiente',
      color: T.dataDone,
    };
  }
  return { label: 'aprendiendo', color: T.hard };
}

export default function Library() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<Status>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [end, setEnd] = useState(false);
  const [selected, setSelected] = useState<LibraryRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [page, c] = await Promise.all([
      libraryPage(db, { scope, status, search, limit: PAGE, offset: 0 }),
      libraryCounts(db, scope),
    ]);
    setRows(page);
    setCounts(c);
    setEnd(page.length < PAGE);
    setLoading(false);
  }, [db, scope, status, search]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loading || end) return;
    const page = await libraryPage(db, { scope, status, search, limit: PAGE, offset: rows.length });
    setRows((r) => [...r, ...page]);
    if (page.length < PAGE) setEnd(true);
  }, [db, scope, status, search, rows.length, loading, end]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    await fn();
    setSelected(null);
    reload();
  }, [reload]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <ScreenHeader kanji="本" title="Biblioteca" />

      <TextInput
        style={styles.search}
        placeholder="buscar carácter, lectura o palabra"
        placeholderTextColor={T.inkSoft}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}
                  contentContainerStyle={styles.chipRowInner}>
        {SCOPES.map((s) => (
          <Chip key={s.k} label={s.label} active={scope === s.k} onPress={() => setScope(s.k)} />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRowSmall}
                  contentContainerStyle={styles.chipRowInner}>
        {STATUSES.map((s) => (
          <Chip key={s.k} label={s.label} active={status === s.k} onPress={() => setStatus(s.k)} small />
        ))}
      </ScrollView>

      {counts && (
        <View style={styles.summary}>
          <Stat n={counts.total} label="total" />
          <Stat n={counts.dominado} label="afianzados" color={T.dataDone} />
          <Stat n={counts.aprendiendo} label="aprendiendo" color={T.hard} />
          <Stat n={counts.nuevo} label="sin ver" />
          <Stat n={counts.suspendido} label="ocultos" />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => `${r.kind}:${r.id}`}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          initialNumToRender={20}
          windowSize={9}
          removeClippedSubviews
          ListEmptyComponent={<Text style={styles.empty}>Nada con estos filtros.</Text>}
          renderItem={({ item }) => {
            const st = statusOf(item, Date.now());
            return (
              <Pressable style={styles.row} onPress={() => setSelected(item)}>
                <View style={[styles.dot, { backgroundColor: st.color }]} />
                <Text style={item.kind === 'word' ? styles.rowWord : styles.rowGlyph}>{item.literal}</Text>
                <View style={styles.rowMid}>
                  {item.sub && <Text style={styles.rowSub}>{item.sub}</Text>}
                  {item.meaning && (
                    <Text style={styles.rowMeaning} numberOfLines={1}>
                      {item.meaning}
                      {item.userGloss
                        ? <Text style={styles.mineTag}>  TUYA</Text>
                        : item.dictLang === 'en' && <Text style={styles.enTag}>  EN</Text>}
                    </Text>
                  )}
                </View>
                <Text style={styles.rowStatus}>{st.label}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <ItemSheet
        row={selected}
        onClose={() => setSelected(null)}
        onIntroduce={(r) => act(() => introduceNow(db, r, Date.now()))}
        onSuspend={(r, v) => act(() => setSuspended(db, r, v, Date.now()))}
        onForget={(r) => act(() => forgetItem(db, r, Date.now()))}
        onRemove={(r) => act(() => removeItem(db, r))}
        onGloss={(r, t) => act(() => setUserGloss(db, r, t, Date.now()))}
      />
    </View>
  );
}

function ItemSheet({ row, onClose, onIntroduce, onSuspend, onForget, onRemove, onGloss }: {
  row: LibraryRow | null;
  onClose: () => void;
  onIntroduce: (r: LibraryRow) => void;
  onSuspend: (r: LibraryRow, v: boolean) => void;
  onForget: (r: LibraryRow) => void;
  onRemove: (r: LibraryRow) => void;
  onGloss: (r: LibraryRow, text: string) => void;
}) {
  // El campo empieza VACIO salvo que ya tengas una tuya. Antes lo precargaba
  // con la del diccionario bajo el titulo "tu traduccion", lo que hacia parecer
  // que esa traduccion era tuya. Ahora se ven separadas y se dice de donde sale
  // cada una.
  const [mine, setMine] = useState('');
  useEffect(() => { setMine(row?.userGloss ?? ''); }, [row]);
  if (!row) return null;

  const introduced = row.state != null;
  // Los kana son fonéticos: no tienen significado que buscar en el diccionario,
  // y su lectura ya está bajo el carácter. Enseñar "(sin significado)" ahí se
  // lee como un fallo, no como lo que es.
  const isKana = row.tier === 'kana';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={row.kind === 'word' ? styles.sheetWord : styles.sheetGlyph}>{row.literal}</Text>
          {row.sub && <Text style={styles.sheetSub}>{row.sub}</Text>}

          {!isKana && (
            <>
              <Text style={styles.sheetLabel}>en el diccionario</Text>
              <View style={styles.dictRow}>
                <Text style={styles.dictText}>{row.dictMeaning ?? '—'}</Text>
                {row.dictMeaning && (
                  <View style={[styles.langTag, row.dictLang === 'es' ? styles.langEs : styles.langEn]}>
                    <Text style={styles.langTagText}>
                      {row.dictLang === 'es' ? 'ESPAÑOL' : 'INGLÉS'}
                    </Text>
                  </View>
                )}
              </View>
              {row.dictLang === 'en' && row.dictMeaning && (
                <Text style={styles.hint}>
                  No tiene traducción al español en el diccionario, por eso sale en inglés.
                  Puedes escribir la tuya abajo.
                </Text>
              )}
            </>
          )}

          <Text style={styles.sheetLabel}>
            {isKana ? 'tu nota · opcional' : 'tu propia traducción · opcional'}
          </Text>
          <TextInput
            style={styles.glossInput}
            value={mine}
            onChangeText={setMine}
            placeholder={isKana ? 'una pista para recordarlo' : 'déjalo vacío para usar la de arriba'}
            placeholderTextColor={T.inkSoft}
          />
          <Text style={styles.hint}>
            {isKana
              ? 'Aparecerá junto a este kana cuando lo estudies. Solo la ves tú.'
              : 'Si escribes una, se usará en lugar de la del diccionario. Solo la ves tú.'}
          </Text>
          {(mine.trim() !== (row.userGloss ?? '')) && (
            <Pressable style={styles.saveGloss} onPress={() => onGloss(row, mine)}>
              <Text style={styles.saveGlossText}>
                {mine.trim() ? 'Guardar' : 'Quitar la mía'}
              </Text>
            </Pressable>
          )}

          {introduced && (
            <>
              <Text style={styles.sheetLabel}>estado</Text>
              <Text style={styles.stateText}>
                {row.suspended
                  ? 'Oculto: no volverá a salir hasta que lo reactives.'
                  : row.state === 2
                    ? `Vuelve ${(row.due ?? 0) - Date.now() > 60000
                        ? `en ${humanInterval((row.due ?? 0) - Date.now())}`
                        : 'ahora'}. Cada vez que aciertes, el intervalo crece; si fallas, vuelve a minutos.`
                    : 'En aprendizaje: sale cada pocos minutos hasta que se asiente.'}
              </Text>
              {!row.suspended && (
                <Text style={styles.hint}>
                  Nada deja de aparecer del todo: los intervalos se van alargando
                  (días, meses, años), pero siempre vuelve. Para que no salga más,
                  usa «No mostrarlo más».
                </Text>
              )}
            </>
          )}

          <View style={styles.sheetActions}>
            {!introduced && <Action label="Aprender ahora" primary onPress={() => onIntroduce(row)} />}
            {introduced && (
              <>
                <Action
                  label={row.suspended ? 'Volver a mostrarlo' : 'No mostrarlo más'}
                  onPress={() => onSuspend(row, !row.suspended)}
                />
                <Action label="Reiniciar a cero" onPress={() => onForget(row)} />
                <Action
                  label="Quitar de mi lista"
                  danger
                  onPress={() => onRemove(row)}
                />
                <Text style={styles.hint}>
                  Quitarlo deshace “Aprender ahora”: vuelve a «sin ver» y reaparecerá
                  cuando le toque por orden.
                </Text>
              </>
            )}
            <Action label="Cerrar" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const Chip = ({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) => (
  <Pressable onPress={onPress} style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}>
    <Text style={[styles.chipText, small && styles.chipTextSmall, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

const Stat = ({ n, label, color }: { n: number; label: string; color?: string }) => (
  <View style={styles.stat}>
    <Text style={[styles.statN, color ? { color } : null]}>{n}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Action = ({ label, onPress, primary, danger }: {
  label: string; onPress: () => void; primary?: boolean; danger?: boolean;
}) => (
  <Pressable
    style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.actionPressed]}
    onPress={onPress}
  >
    <Text style={[styles.actionText, primary && styles.actionTextPrimary, danger && styles.actionTextDanger]}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  topSide: { flex: 1 },
  back: { color: T.accent, fontSize: 15 },
  title: { flex: 2, fontSize: 17, fontWeight: '700', color: T.ink, textAlign: 'center' },
  search: {
    marginHorizontal: 16, marginTop: 4, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: T.surface, borderRadius: T.radius, borderWidth: 1, borderColor: T.line,
    color: T.ink, fontSize: 15,
  },
  // Altura explicita: sin ella el ScrollView horizontal se aplasta y los
  // chips salen recortados y superpuestos.
  chipRow: { flexGrow: 0, flexShrink: 0, height: 40 },
  chipRowSmall: { flexGrow: 0, flexShrink: 0, height: 34 },
  chipRowInner: { paddingHorizontal: 16, gap: 7, alignItems: 'center' },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: T.surface, borderWidth: 1, borderColor: T.line },
  chipSmall: { paddingVertical: 5, paddingHorizontal: 11 },
  chipActive: { backgroundColor: T.ink, borderColor: T.ink },
  chipPressed: { backgroundColor: T.sunken },
  chipText: { color: T.ink, fontSize: 14 },
  chipTextSmall: { fontSize: 12.5 },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  summary: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, paddingHorizontal: 8 },
  stat: { alignItems: 'center' },
  statN: { fontSize: 17, fontWeight: '700', color: T.ink },
  statLabel: { fontSize: 10.5, color: T.inkSoft, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.lineSoft,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rowGlyph: { fontSize: 27, color: T.ink, width: 42, textAlign: 'center' },
  rowWord: { fontSize: 19, color: T.ink, minWidth: 42, maxWidth: 104 },
  rowMid: { flex: 1 },
  rowSub: { fontSize: F.small, color: T.accent },
  rowMeaning: { fontSize: F.label, color: T.inkMid },
  enTag: { fontSize: 9.5, color: T.enBadge, fontWeight: '700' },
  mineTag: { fontSize: 9.5, color: T.esBadge, fontWeight: '700' },
  rowStatus: { fontSize: F.micro, color: T.inkSoft },
  empty: { textAlign: 'center', color: T.inkSoft, marginTop: 40 },
  backdrop: { flex: 1, backgroundColor: '#0006' },
  sheet: {
    backgroundColor: T.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 22, paddingBottom: 34,
  },
  sheetGlyph: { fontSize: 52, color: T.ink, textAlign: 'center' },
  sheetWord: { fontSize: 34, color: T.ink, textAlign: 'center' },
  sheetSub: { fontSize: 17, color: T.accent, textAlign: 'center', marginTop: 2 },
  sheetLabel: { fontSize: 11, color: T.inkSoft, letterSpacing: 1.2, marginTop: 16, textTransform: 'uppercase' },
  dictRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  dictText: { fontSize: 17, color: T.ink },
  langTag: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 5 },
  langEs: { backgroundColor: T.esBadge },
  langEn: { backgroundColor: T.enBadge },
  langTagText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  hint: { fontSize: 12.5, color: T.inkSoft, marginTop: 7, lineHeight: 18 },
  stateText: { fontSize: 15, color: T.ink, marginTop: 7, lineHeight: 21 },
  actionPressed: { backgroundColor: T.sunken },
  actionTextDanger: { color: T.again },
  glossInput: {
    marginTop: 7, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: T.surface,
    borderRadius: T.radius, borderWidth: 1, borderColor: T.line, color: T.ink, fontSize: 15,
  },
  saveGloss: { marginTop: 8, alignSelf: 'flex-start' },
  saveGlossText: { color: T.accent, fontSize: 14 },
  sheetActions: { marginTop: 16, gap: 7 },
  action: {
    paddingVertical: 12, borderRadius: T.radius, alignItems: 'center',
    backgroundColor: T.surface, borderWidth: 1, borderColor: T.line,
  },
  actionPrimary: { backgroundColor: T.ink, borderColor: T.ink },
  actionText: { color: T.ink, fontSize: 15 },
  actionTextPrimary: { color: '#fff', fontWeight: '600' },
});
