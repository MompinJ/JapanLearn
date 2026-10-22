import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import Svg, { Path } from 'react-native-svg';
import { KVG } from './DrawingCanvas';
import { T } from '@/ui/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** Los trazos de KanjiVG viven en un lienzo de 109x109, asi que ninguno es mas
 *  largo que ~200 unidades. Con un dash de ese tamano se consigue el efecto de
 *  "trazo dibujandose" sin tener que medir la longitud real del path. */
const DASH = 220;
const STROKE_MS = 420;
const PAUSE_MS = 130;

/**
 * Reproduce el orden de trazos. Ensena la parte que un glifo estatico no puede:
 * POR DONDE se empieza y en que secuencia.
 */
export function StrokePlayer({
  strokes, size = 200, autoPlay = true, showReplay = true, onFinish,
}: {
  strokes: { d: string }[] | null;
  size?: number;
  autoPlay?: boolean;
  /** Al superponerse sobre un lienzo, el enlace de repetir sobra. */
  showReplay?: boolean;
  onFinish?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const offset = useRef(new Animated.Value(DASH)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = strokes?.length ?? 0;

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    offset.stopAnimation();
  }, [offset]);

  useEffect(() => {
    if (!playing || !total) return;
    if (index >= total) { setPlaying(false); onFinish?.(); return; }

    offset.setValue(DASH);
    const anim = Animated.timing(offset, {
      toValue: 0,
      duration: STROKE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false, // strokeDashoffset no es prop nativa
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      timer.current = setTimeout(() => setIndex((i) => i + 1), PAUSE_MS);
    });
    return () => { anim.stop(); if (timer.current) clearTimeout(timer.current); };
  }, [index, playing, total, offset, onFinish]);

  useEffect(() => stop, [stop]);

  const replay = () => { stop(); setIndex(0); setPlaying(true); };

  if (!strokes?.length) return null;
  const done = strokes.slice(0, Math.min(index, total));
  const active = index < total ? strokes[index] : null;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${KVG} ${KVG}`}>
        {done.map((s, i) => (
          <Path key={i} d={s.d} stroke={T.ink} strokeWidth={4.5} fill="none"
                strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {active && (
          <AnimatedPath
            d={active.d}
            stroke={T.accent}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={DASH}
            strokeDashoffset={offset as unknown as number}
          />
        )}
      </Svg>
      {showReplay && (
        <Pressable onPress={replay} hitSlop={12}>
          <Text style={styles.replay}>
            {playing ? `trazo ${Math.min(index + 1, total)} de ${total}` : 'repetir animación'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  replay: { marginTop: 6, color: T.inkSoft, fontSize: 13, textDecorationLine: 'underline' },
});
