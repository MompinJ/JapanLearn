import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import Svg, { Path } from 'react-native-svg';
import { DrawingCanvas, KVG, type DrawingCanvasHandle } from '@/features/writing/DrawingCanvas';
import { StrokePlayer } from '@/features/writing/StrokePlayer';
import type { GlyphPayload } from '@/queue/queue';
import { T } from '@/ui/theme';

/**
 * Tarjeta de escritura: se da el significado y el usuario dibuja el caracter.
 *
 * La validacion es AUTOEVALUACION: el reconocimiento automatico cuesta el 95%
 * del esfuerzo y aporta poco frente a que el usuario compare y decida, que es
 * lo que hacen Anki y Kanji Study.
 *
 * Pero el usuario tiende a aprobarse de mas, asi que se anade la unica senal
 * OBJETIVA que sale gratis: contar los trazos dibujados contra los esperados.
 */
export function WritingCard({
  glyph, revealed, onReveal, onStrokeCount, size,
}: {
  glyph: GlyphPayload;
  revealed: boolean;
  onReveal: () => void;
  onStrokeCount: (drawn: number, expected: number) => void;
  size: number;
}) {
  const canvas = useRef<DrawingCanvasHandle>(null);
  const [drawn, setDrawn] = useState(0);
  const [hint, setHint] = useState(0);
  const [userPaths, setUserPaths] = useState<string[]>([]);

  const expected = glyph.strokes?.length ?? 0;
  const isKana = glyph.kind === 'hiragana' || glyph.kind === 'katakana';
  const prompt = isKana
    ? glyph.romaji
    : (glyph.userGloss ?? glyph.meaningsEs[0] ?? glyph.meaningsEn[0] ?? '?');

  useEffect(() => {
    canvas.current?.clear();
    setDrawn(0); setHint(0); setUserPaths([]);
  }, [glyph.id]);

  const reveal = () => {
    setUserPaths(canvas.current?.paths() ?? []);
    onStrokeCount(drawn, expected);
    onReveal();
  };

  if (!revealed) {
    return (
      <View style={styles.stage}>
        <Text style={styles.label}>escribe</Text>
        <Text style={styles.prompt}>{prompt}</Text>
        {!isKana && glyph.readingsKun.length + glyph.readingsOn.length > 0 && (
          <Text style={styles.hintReading}>
            {[...glyph.readingsKun.slice(0, 1), ...glyph.readingsOn.slice(0, 1)].join('  ')}
          </Text>
        )}

        <View style={styles.canvasWrap}>
          <DrawingCanvas
            ref={canvas}
            size={size}
            ghost={hint > 0 ? glyph.strokes : null}
            ghostUpTo={hint}
            onStrokeEnd={setDrawn}
          />
        </View>

        <View style={styles.tools}>
          <Tool label="deshacer" onPress={() => { canvas.current?.undo(); setDrawn((d) => Math.max(0, d - 1)); }} />
          <Tool label="limpiar" onPress={() => { canvas.current?.clear(); setDrawn(0); }} />
          <Tool
            label={hint >= expected ? 'sin más pistas' : `pista (${hint}/${expected})`}
            onPress={() => setHint((h) => Math.min(expected, h + 1))}
            dim={hint >= expected}
          />
        </View>

        <Pressable style={styles.revealBtn} onPress={reveal}>
          <Text style={styles.revealText}>Ver respuesta</Text>
        </Pressable>
      </View>
    );
  }

  const mismatch = drawn !== expected;

  return (
    <View style={styles.stage}>
      <Text style={styles.label}>{prompt}</Text>

      <View style={styles.compareRow}>
        <View style={styles.compareCol}>
          <Text style={styles.compareLabel}>tu trazo</Text>
          <View style={styles.compareBox}>
            <Svg width={size * 0.62} height={size * 0.62} viewBox={`0 0 ${KVG} ${KVG}`}>
              {glyph.strokes?.map((s, i) => (
                <Path key={`r${i}`} d={s.d} stroke="#ddd7cc" strokeWidth={4} fill="none"
                      strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {userPaths.map((d, i) => (
                <Path key={i} d={d} stroke={T.ink} strokeWidth={4.5} fill="none"
                      strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </Svg>
          </View>
          <Text style={styles.compareCaption}>superpuesto al correcto</Text>
        </View>

        <View style={styles.compareCol}>
          <Text style={styles.compareLabel}>orden correcto</Text>
          <StrokePlayer strokes={glyph.strokes} size={size * 0.62} />
        </View>
      </View>

      <View style={[styles.count, mismatch && styles.countBad]}>
        <Text style={[styles.countText, mismatch && styles.countTextBad]}>
          {mismatch
            ? `dibujaste ${drawn} trazos, son ${expected}`
            : `${expected} trazos, correcto`}
        </Text>
      </View>
    </View>
  );
}

function Tool({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={dim} hitSlop={8}>
      <Text style={[styles.tool, dim && styles.toolDim]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { color: T.inkSoft, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  prompt: { fontSize: 30, color: T.ink, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  hintReading: { fontSize: 16, color: T.inkSoft, marginTop: 4 },
  canvasWrap: { marginTop: 18 },
  tools: { flexDirection: 'row', gap: 22, marginTop: 14 },
  tool: { color: T.accent, fontSize: 14 },
  toolDim: { color: T.line },
  revealBtn: {
    marginTop: 20, paddingHorizontal: 34, paddingVertical: 13,
    borderRadius: T.radius, backgroundColor: T.ink,
  },
  revealText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  compareRow: { flexDirection: 'row', gap: 18, marginTop: 18, alignItems: 'flex-start' },
  compareCol: { alignItems: 'center' },
  compareLabel: { color: T.inkSoft, fontSize: 12, marginBottom: 6 },
  compareBox: {
    backgroundColor: T.surface, borderRadius: T.radius,
    borderWidth: 1, borderColor: T.line, padding: 2,
  },
  compareCaption: { color: T.inkSoft, fontSize: 11, marginTop: 6 },
  count: {
    marginTop: 18, paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: '#e8f0ea',
  },
  countBad: { backgroundColor: '#fbe9e7' },
  countText: { color: T.good, fontSize: 13, fontWeight: '600' },
  countTextBad: { color: T.again },
});
