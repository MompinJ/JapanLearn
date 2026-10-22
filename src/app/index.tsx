import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { useFocusEffect } from 'expo-router';

import { getMeta, getSettings, setMeta, type Settings } from '@/db/bootstrap';
import { countsFor, nextItem, todayStat, unlockDerivedCards, type QueueItem } from '@/queue/queue';
import { applyRating } from '@/srs/apply';
import { previewIntervals, Rating, toCard, type Grade } from '@/srs/scheduler';
import { RecognitionCard } from '@/features/study/RecognitionCard';
import { WritingCard } from '@/features/study/WritingCard';
import { ReadingCard } from '@/features/study/ReadingCard';
import { AnswerBar } from '@/features/study/AnswerBar';
import { HowItWorks } from '@/features/study/HowItWorks';
import { TracePractice } from '@/features/writing/TracePractice';
import { NavBar } from '@/ui/NavBar';
import { F, T } from '@/ui/theme';

const EXPLAINER_KEY = 'explainer_dismissed';

export default function Study() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [item, setItem] = useState<QueueItem | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [counts, setCounts] = useState({ due: 0, newToday: 0 });
  const [strokeMeta, setStrokeMeta] = useState<{ drawn: number; expected: number } | null>(null);
  const [showHow, setShowHow] = useState(false);
  const [tracing, setTracing] = useState<QueueItem | null>(null);
  const shownAt = useRef(Date.now());

  const load = useCallback(async (s: Settings) => {
    const now = Date.now();
    await unlockDerivedCards(db, s, now);
    const next = await nextItem(db, s, now);
    const c = await countsFor(db, now);
    const t = await todayStat(db, now, s.dayCutoffHour);
    setCounts({ due: c.due, newToday: t.newItems });
    setItem(next);
    setEmpty(next === null);
    setRevealed(false);
    setStrokeMeta(null);
    shownAt.current = Date.now();
  }, [db]);

  const boot = useCallback(async () => {
    const s = await getSettings(db);
    setSettings(s);
    setShowHow((await getMeta(db, EXPLAINER_KEY)) !== '1');
    await load(s);
  }, [db, load]);

  useEffect(() => { boot(); }, [boot]);

  // expo-router mantiene la pantalla montada, asi que al volver de Biblioteca o
  // Avances no se remonta: sin esto seguiria con los contadores viejos.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    boot();
  }, [boot]));

  useEffect(() => {
    if (item || empty) SplashScreen.hideAsync().catch(() => {});
  }, [item, empty]);

  const dismissHow = useCallback(() => {
    setShowHow(false);
    setMeta(db, EXPLAINER_KEY, '1').catch(() => {});
  }, [db]);

  const answer = useCallback((rating: Grade) => {
    if (!item || !settings) return;
    const now = Date.now();
    const current = item;
    const meta = strokeMeta;

    applyRating({
      db, card: current.card, rating, now, durationMs: now - shownAt.current,
      source: current.source, cutoffHour: settings.dayCutoffHour,
      retention: settings.requestRetention,
      drawnStrokes: meta?.drawn ?? null,
      expectedStrokes: meta?.expected ?? null,
    }).catch((e) => console.warn('[srs] fallo al guardar', e));

    // Al fallar se ofrece calcar el caracter: la tarjeta volvera al minuto, y
    // ese minuto se aprovecha escribiendola en vez de solo volver a mirarla.
    const canTrace =
      rating === Rating.Again &&
      current.card.card_kind !== 'writing' &&
      (current.glyph?.strokes?.length ?? 0) > 0;

    if (canTrace) setTracing(current);
    else load(settings);
  }, [db, item, settings, load, strokeMeta]);

  if (!settings) return <View style={styles.center}><ActivityIndicator color={T.inkSoft} /></View>;

  const pad = { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 };

  if (empty) {
    return (
      <View style={[styles.root, pad]}>
        <NavBar />
        <View style={styles.center}>
          <Text style={styles.emptyKanji}>空</Text>
          <Text style={styles.emptyBig}>Todo al día</Text>
          <Text style={styles.emptySmall}>
            No queda nada pendiente. Si quieres seguir, adelanta material desde la Biblioteca.
          </Text>
        </View>
      </View>
    );
  }
  if (!item) return <View style={styles.center}><ActivityIndicator color={T.inkSoft} /></View>;

  const { glyph, word, card, source } = item;
  const isWriting = card.card_kind === 'writing' && glyph != null;
  const isReading = card.subject_kind === 'word' && word != null;
  const intervals = previewIntervals(toCard(card), Date.now(), settings.requestRetention);
  const canvasSize = Math.min(width - 72, 300);
  const missed = isWriting && revealed && strokeMeta != null && strokeMeta.drawn !== strokeMeta.expected;

  const kindLabel = isWriting ? 'escritura' : isReading ? 'lectura' : null;

  return (
    <View style={[styles.root, pad]}>
      <NavBar
        center={
          <View style={styles.counts}>
            <Text style={styles.count}>{counts.due} pendientes</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.count}>{counts.newToday}/{settings.maxNewPerDay} nuevos</Text>
          </View>
        }
      />

      {kindLabel && <Text style={styles.kindTag}>{kindLabel}</Text>}

      {isWriting ? (
        <WritingCard
          glyph={glyph}
          revealed={revealed}
          size={canvasSize}
          onReveal={() => setRevealed(true)}
          onStrokeCount={(drawn, expected) => setStrokeMeta({ drawn, expected })}
        />
      ) : (
        <Pressable style={styles.stage} onPress={() => !revealed && setRevealed(true)}>
          {source === 'new' && <Text style={styles.newTag}>nuevo</Text>}
          {(source === 'cram' || source === 'free') && (
            <Text style={styles.extraTag}>práctica extra · no cuenta</Text>
          )}
          {isReading
            ? <ReadingCard word={word} revealed={revealed} />
            : glyph && <RecognitionCard glyph={glyph} revealed={revealed} size={216} />}
        </Pressable>
      )}

      {revealed && (
        <View>
          {showHow && <HowItWorks onDismiss={dismissHow} />}
          <AnswerBar
            intervals={intervals}
            onAnswer={answer}
            suggestLow={missed}
            note={missed ? `dibujaste ${strokeMeta!.drawn} trazos, son ${strokeMeta!.expected}` : null}
          />
        </View>
      )}

      {tracing?.glyph && (
        <TracePractice
          glyph={tracing.glyph}
          onDone={() => { setTracing(null); if (settings) load(settings); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg, paddingHorizontal: 20 },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg, padding: 24,
  },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  count: { color: T.inkSoft, fontSize: F.small },
  dot: { color: T.line, fontSize: F.small },
  kindTag: {
    textAlign: 'center', color: T.accent, fontSize: F.micro,
    letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 2,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newTag: {
    color: T.accent, fontSize: F.micro, letterSpacing: 1.6,
    textTransform: 'uppercase', marginBottom: 12,
  },
  extraTag: { color: T.inkSoft, fontSize: F.micro, letterSpacing: 0.6, marginBottom: 12 },
  emptyKanji: { fontSize: 56, color: T.line, marginBottom: 14 },
  emptyBig: { fontSize: F.display, color: T.ink, fontWeight: '300' },
  emptySmall: {
    fontSize: F.label, color: T.inkSoft, marginTop: 10,
    textAlign: 'center', lineHeight: 21, maxWidth: 300,
  },
});
