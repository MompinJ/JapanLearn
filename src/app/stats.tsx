import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { router, useFocusEffect } from 'expo-router';

import { getSettings, setMeta, setWritingEnabled } from '@/db/bootstrap';
import { resetScheduler } from '@/srs/scheduler';
import { PaceSetting } from '@/features/stats/PaceSetting';
import { WritingSetting } from '@/features/stats/WritingSetting';
import { loadStats, resetProgress, type StatsSnapshot } from '@/db/stats';
import { F, T } from '@/ui/theme';
import { ScreenHeader } from '@/ui/ScreenHeader';

export default function Stats() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<StatsSnapshot | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [retention, setRetention] = useState(0.9);
  const [writing, setWriting] = useState(false);

  const reload = useCallback(async () => {
    const set = await getSettings(db);
    setRetention(set.requestRetention);
    setWriting(set.writingEnabled);
    setS(await loadStats(db, Date.now(), set.dayCutoffHour));
  }, [db]);

  const changePace = useCallback(async (v: number) => {
    setRetention(v);
    await setMeta(db, 'requestRetention', String(v));
    // El scheduler es un singleton cacheado: sin resetearlo se seguiria usando
    // la retencion anterior hasta reiniciar la app.
    resetScheduler();
  }, [db]);

  const changeWriting = useCallback(async (v: boolean) => {
    setWriting(v);
    await setWritingEnabled(db, v);
    // Las tarjetas de escritura se acaban de aparcar o de recuperar, asi que
    // los contadores de "Tarjetas activas" ya no valen.
    reload();
  }, [db, reload]);

  useEffect(() => { reload(); }, [reload]);
  // Igual que en estudio: la pantalla sigue montada al volver atras.
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!s) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  const minutes = Math.round(s.today.ms / 60000);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <ScreenHeader kanji="歩" title="Avances" />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Numeros sueltos: no son graficos, son titulares. */}
        <View style={styles.tiles}>
          <Tile n={String(s.streak)} label={s.streak === 1 ? 'día seguido' : 'días seguidos'} />
          <Tile n={String(s.today.reviews)} label="repasos hoy" />
          <Tile n={minutes > 0 ? `${minutes}m` : '—'} label="tiempo hoy" />
          <Tile
            n={s.accuracy == null ? '—' : `${Math.round(s.accuracy * 100)}%`}
            label="aciertos"
          />
        </View>

        <Section title="Progreso">
          <Legend />
          {s.progress.map((p) => <Meter key={p.label} p={p} />)}
        </Section>

        <Section title="Repasos por día" note="últimos 30 días">
          <Bars
            data={s.history.map((h) => ({ v: h.reviews, k: dayLabel(h.day) }))}
            color={T.dataDone}
            emptyLabel="Aún no hay historial. Estudia un par de días y aparecerá aquí."
          />
        </Section>

        <Section title="Carga que viene" note="próximos 14 días">
          <Bars
            data={s.forecast.map((f) => ({ v: f.count, k: f.dayOffset === 0 ? 'hoy' : `+${f.dayOffset}` }))}
            color={T.dataPending}
            emptyLabel="Nada programado todavía."
          />
        </Section>

        <Section title="Tarjetas activas">
          <View style={styles.kinds}>
            {s.cardsByKind.length === 0
              ? (
                <View style={styles.kindRow}>
                  <Text style={styles.kindLabel}>ninguna todavía</Text>
                  <Text style={styles.kindN}>0</Text>
                </View>
              )
              : s.cardsByKind.map((c) => (
                  <View key={c.kind} style={styles.kindRow}>
                    <Text style={styles.kindLabel}>{KIND_ES[c.kind] ?? c.kind}</Text>
                    <Text style={styles.kindN}>{c.n}</Text>
                  </View>
                ))}
            <View style={styles.kindRow}>
              <Text style={styles.kindLabel}>repasos registrados</Text>
              <Text style={styles.kindN}>{s.totalReviews}</Text>
            </View>
          </View>
        </Section>

        <Section title="Practicar escritura">
          <WritingSetting value={writing} onChange={changeWriting} />
        </Section>

        <Section title="Ritmo de repaso">
          <PaceSetting value={retention} onChange={changePace} />
        </Section>

        <Pressable style={styles.credits} onPress={() => router.push('/credits')}>
          <Text style={styles.creditsText}>礼  Créditos y licencias</Text>
        </Pressable>

        <Pressable style={styles.reset} onPress={() => setConfirmReset(true)}>
          <Text style={styles.resetText}>Reiniciar todo mi progreso</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>¿Borrar todo el progreso?</Text>
            <Text style={styles.dialogBody}>
              Se borran tus repasos, tu historial y tus traducciones propias. El contenido
              (kanji, kana y vocabulario) no se toca. Esto no se puede deshacer.
            </Text>
            <Pressable
              style={[styles.dialogBtn, styles.dialogDanger]}
              onPress={async () => { await resetProgress(db); setConfirmReset(false); reload(); }}
            >
              <Text style={styles.dialogDangerText}>Sí, empezar de cero</Text>
            </Pressable>
            <Pressable style={styles.dialogBtn} onPress={() => setConfirmReset(false)}>
              <Text style={styles.dialogBtnText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** 20260913 -> "13/9" */
function dayLabel(yyyymmdd: number): string {
  const m = Math.floor((yyyymmdd % 10000) / 100);
  const d = yyyymmdd % 100;
  return `${d}/${m}`;
}

const KIND_ES: Record<string, string> = {
  recognition: 'reconocimiento', writing: 'escritura', reading: 'lectura',
};

function Tile({ n, label }: { n: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileN}>{n}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** Con dos series el significado nunca puede quedar solo en el color. */
function Legend() {
  return (
    <View style={styles.legend}>
      <LegendItem color={T.dataDone} label="afianzado" />
      <LegendItem color={T.dataPending} label="aprendiendo" />
      <LegendItem color={T.dataRest} label="sin ver" />
    </View>
  );
}
const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <View style={styles.legendItem}>
    <View style={[styles.swatch, { backgroundColor: color }]} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

function Meter({ p }: { p: { label: string; total: number; known: number; learning: number } }) {
  const pct = (n: number) => (p.total ? (n / p.total) * 100 : 0);
  const knownPct = pct(p.known);
  const learnPct = pct(p.learning);
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterHead}>
        <Text style={styles.meterLabel}>{p.label}</Text>
        <Text style={styles.meterValue}>
          <Text style={styles.meterKnown}>{p.known}</Text>
          <Text style={styles.meterMuted}> / {p.total}</Text>
        </Text>
      </View>
      <View style={styles.track}>
        {knownPct > 0 && (
          <View style={[styles.seg, { width: `${knownPct}%`, backgroundColor: T.dataDone }]} />
        )}
        {learnPct > 0 && (
          // separador de 2px entre segmentos: el borde del color de fondo
          <View style={[styles.seg, styles.segGap, { width: `${learnPct}%`, backgroundColor: T.dataPending }]} />
        )}
      </View>
    </View>
  );
}

/**
 * Barras de una sola serie: sin leyenda (el titulo la nombra), eje recesivo,
 * y etiqueta directa SOLO en el maximo, no un numero sobre cada barra.
 * Al pulsar una barra se muestra su valor: el equivalente movil del hover.
 */
function Bars({ data, color, emptyLabel }: {
  data: { v: number; k: string }[]; color: string; emptyLabel: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.v));
  const hasAny = data.some((d) => d.v > 0);

  if (!hasAny) return <Text style={styles.muted}>{emptyLabel}</Text>;

  const peak = data.reduce((bi, d, i) => (d.v > data[bi].v ? i : bi), 0);

  return (
    <View>
      <View style={styles.bars}>
        {data.map((d, i) => (
          <Pressable
            key={i}
            style={styles.barSlot}
            onPress={() => setPicked(picked === i ? null : i)}
            hitSlop={4}
          >
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.bar,
                  { height: `${(d.v / max) * 100}%`, backgroundColor: color },
                  d.v === 0 && styles.barZero,
                  picked === i && styles.barPicked,
                ]}
              />
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.barAxis}>
        <Text style={styles.axisText}>{data[0]?.k}</Text>
        <Text style={styles.axisText}>{data[data.length - 1]?.k}</Text>
      </View>
      <Text style={styles.barNote}>
        {picked != null
          ? `${data[picked].k}: ${data[picked].v}`
          : `máximo ${data[peak].v} (${data[peak].k}) · toca una barra para ver su valor`}
      </Text>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {note && <Text style={styles.sectionNote}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  topSide: { flex: 1 },
  back: { color: T.accent, fontSize: 15 },
  title: { flex: 2, fontSize: 17, fontWeight: '700', color: T.ink, textAlign: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  tile: {
    flexGrow: 1, flexBasis: '46%', backgroundColor: T.surface, borderRadius: T.radius,
    borderWidth: 1, borderColor: T.line, paddingVertical: 14, alignItems: 'center',
  },
  tileN: { fontSize: 28, fontWeight: '300', color: T.ink },
  tileLabel: { fontSize: F.micro, color: T.inkSoft, marginTop: 4 },
  section: { marginTop: 22, paddingHorizontal: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: T.ink },
  sectionNote: { fontSize: 11.5, color: T.inkSoft },
  legend: { flexDirection: 'row', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2.5 },
  legendText: { fontSize: 11.5, color: T.inkSoft },
  meterRow: { marginBottom: 13 },
  meterHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  meterLabel: { fontSize: 13.5, color: T.ink },
  meterValue: { fontSize: 13 },
  meterKnown: { color: T.dataDone, fontWeight: '700' },
  meterMuted: { color: T.inkSoft },
  track: { height: 9, borderRadius: 4, backgroundColor: T.dataRest, flexDirection: 'row', overflow: 'hidden' },
  seg: { height: '100%', borderRadius: 4 },
  segGap: { borderLeftWidth: 2, borderLeftColor: T.bg },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 92, gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 },
  barZero: { backgroundColor: T.dataRest, height: 2 },
  barPicked: { opacity: 0.55 },
  barAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  axisText: { fontSize: 10.5, color: T.inkSoft },
  barNote: { fontSize: 11.5, color: T.inkSoft, marginTop: 7 },
  kinds: { backgroundColor: T.surface, borderRadius: T.radius, borderWidth: 1, borderColor: T.line, paddingHorizontal: 14 },
  kindRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.line,
  },
  kindLabel: { fontSize: 13.5, color: T.inkSoft },
  kindN: { fontSize: 13.5, color: T.ink, fontWeight: '600' },
  muted: { fontSize: 13, color: T.inkSoft },
  credits: { marginTop: 30, marginHorizontal: 16, paddingVertical: 13, alignItems: 'center' },
  creditsText: { color: T.accent, fontSize: F.label },
  reset: { marginTop: 4, marginHorizontal: 16, paddingVertical: 13, alignItems: 'center' },
  resetText: { color: T.again, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 28 },
  dialog: { backgroundColor: T.bg, borderRadius: 18, padding: 22 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: T.ink },
  dialogBody: { fontSize: 14, color: T.inkSoft, marginTop: 10, lineHeight: 20 },
  dialogBtn: { marginTop: 10, paddingVertical: 13, borderRadius: T.radius, alignItems: 'center', borderWidth: 1, borderColor: T.line },
  dialogBtnText: { color: T.ink, fontSize: 15 },
  dialogDanger: { backgroundColor: T.again, borderColor: T.again },
  dialogDangerText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
