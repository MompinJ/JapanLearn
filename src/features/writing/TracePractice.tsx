import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/ui/Text';
import { DrawingCanvas, type DrawingCanvasHandle } from './DrawingCanvas';
import { StrokePlayer } from './StrokePlayer';
import type { GlyphPayload } from '@/queue/queue';
import { F, T } from '@/ui/theme';

/**
 * Practica de calcado tras fallar.
 *
 * La tarjeta vuelve al minuto porque asi se fija el recuerdo, pero volver a
 * VERLA sin hacer nada distinto aporta poco. Aqui ese minuto se pasa calcando:
 * memoria motora ademas de visual. No se puntua ni toca el SRS.
 *
 * DOS TRAMPAS resueltas aqui:
 *
 * 1. `Modal` de React Native monta su contenido en una jerarquia de vistas
 *    NATIVA APARTE, fuera del GestureHandlerRootView de la raiz. Sin volver a
 *    montar uno dentro, los gestos no llegan y el lienzo no dibuja: se ve, pero
 *    no responde al dedo.
 *
 * 2. El lienzo y la animacion lado a lado partian el ancho por la mitad y
 *    dejaban un area de dibujo diminuta. Ahora el lienzo ocupa todo el ancho y
 *    la animacion se superpone SOBRE el, a demanda.
 */
export function TracePractice({ glyph, onDone }: {
  glyph: GlyphPayload;
  onDone: () => void;
}) {
  const canvas = useRef<DrawingCanvasHandle>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [drawn, setDrawn] = useState(0);
  const [playing, setPlaying] = useState(false);

  const expected = glyph.strokes?.length ?? 0;
  const isKana = glyph.kind === 'hiragana' || glyph.kind === 'katakana';
  const prompt = isKana
    ? glyph.romaji
    : (glyph.userGloss ?? glyph.meaningsEs[0] ?? glyph.meaningsEn[0] ?? '');

  // El lienzo manda: se lleva todo el ancho disponible y el alto que sobre.
  const size = Math.min(width - 48, height - insets.top - insets.bottom - 300, 380);

  return (
    <Modal visible animationType="slide" onRequestClose={onDone}>
      <GestureHandlerRootView style={styles.root}>
        <View style={[styles.page, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.eyebrow}>practica antes de que vuelva</Text>
          <Text style={styles.prompt}>{prompt}</Text>

          <View style={styles.canvasWrap}>
            <DrawingCanvas
              ref={canvas}
              size={size}
              ghost={glyph.strokes}
              ghostUpTo={expected}
              onStrokeEnd={setDrawn}
            />
            {playing && (
              // pointerEvents none: la animacion se ve, pero el dedo sigue
              // llegando al lienzo de abajo.
              <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="none">
                <StrokePlayer
                  strokes={glyph.strokes}
                  size={size}
                  showReplay={false}
                  onFinish={() => setPlaying(false)}
                />
              </View>
            )}
          </View>

          <Text style={styles.count}>
            {drawn === 0 ? `${expected} trazos` : `${drawn} de ${expected} trazos`}
          </Text>

          <View style={styles.tools}>
            <Tool label="limpiar" onPress={() => { canvas.current?.clear(); setDrawn(0); }} />
            <Tool
              label={playing ? 'reproduciendo…' : 'ver el orden'}
              onPress={() => setPlaying(true)}
              dim={playing}
            />
          </View>

          <Pressable style={styles.done} onPress={onDone}>
            <Text style={styles.doneText}>Listo</Text>
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Tool({ label, onPress, dim }: { label: string; onPress: () => void; dim?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={dim} hitSlop={10}>
      <Text style={[styles.tool, dim && styles.toolDim]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { flex: 1, backgroundColor: T.bg, alignItems: 'center', paddingHorizontal: 24 },
  eyebrow: {
    fontSize: F.micro, color: T.inkSoft, letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  prompt: {
    fontSize: F.display, color: T.ink, fontWeight: '600',
    textAlign: 'center', marginTop: 6,
  },
  canvasWrap: { marginTop: 22 },
  overlay: { alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: F.label, color: T.inkSoft, marginTop: 16 },
  tools: { flexDirection: 'row', gap: 30, marginTop: 14 },
  tool: { color: T.accent, fontSize: F.body },
  toolDim: { color: T.inkSoft },
  done: {
    marginTop: 'auto', alignSelf: 'stretch',
    backgroundColor: T.ink, borderRadius: T.radius,
    paddingVertical: 16, alignItems: 'center',
  },
  doneText: { color: '#fff', fontSize: F.body, fontWeight: '600' },
});
