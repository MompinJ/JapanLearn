import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Line, Path } from 'react-native-svg';
import { T } from '@/ui/theme';

/** KanjiVG usa siempre este lienzo. Normalizamos el dibujo del usuario al mismo
 *  espacio para que superponer sea trivial y el trazo guardado no dependa de
 *  la resolucion de la pantalla. */
export const KVG = 109;

/** Descartar puntos mas cercanos que esto (en unidades KanjiVG) es lo que mas
 *  reduce el trabajo: react-native-svg reconstruye el path en cada evento. */
const MIN_DIST = 1.2;
const MAX_POINTS = 120;

export type DrawingCanvasHandle = {
  undo: () => void;
  clear: () => void;
  strokeCount: () => number;
  paths: () => string[];
};

function toPath(pts: number[][]): string {
  if (!pts.length) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0]},${pts[i][1]}`;
  return d;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, {
  size: number;
  /** Trazos correctos para superponer debajo, si el usuario pide ayuda. */
  ghost?: { d: string }[] | null;
  ghostUpTo?: number;
  onStrokeEnd?: (count: number) => void;
}>(function DrawingCanvas({ size, ghost, ghostUpTo, onStrokeEnd }, ref) {
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [current, setCurrent] = useState<number[][]>([]);
  const currentRef = useRef<number[][]>([]);
  // Espejo en ref: permite avisar del numero de trazos FUERA del actualizador
  // de estado. Llamar a onStrokeEnd dentro de setStrokes actualiza el padre
  // durante el render de otro componente, que es un error de React.
  const strokesRef = useRef<number[][][]>([]);

  const scale = KVG / size;
  const round = (v: number) => Math.round(v * scale * 10) / 10;

  useImperativeHandle(ref, () => ({
    undo: () => {
      strokesRef.current = strokesRef.current.slice(0, -1);
      setStrokes(strokesRef.current);
    },
    clear: () => {
      strokesRef.current = [];
      currentRef.current = [];
      setStrokes([]);
      setCurrent([]);
    },
    strokeCount: () => strokesRef.current.length,
    paths: () => strokesRef.current.map(toPath),
  }), []);

  const pan = Gesture.Pan()
    .minDistance(0)
    .averageTouches(true)
    .onBegin((e) => {
      currentRef.current = [[round(e.x), round(e.y)]];
      setCurrent(currentRef.current);
    })
    .onUpdate((e) => {
      const pts = currentRef.current;
      if (pts.length >= MAX_POINTS) return;
      const x = round(e.x), y = round(e.y);
      const last = pts[pts.length - 1];
      // decimacion: solo se anade el punto si se movio lo suficiente
      if (last && Math.hypot(x - last[0], y - last[1]) < MIN_DIST) return;
      currentRef.current = [...pts, [x, y]];
      setCurrent(currentRef.current);
    })
    .onEnd(() => {
      const pts = currentRef.current;
      if (pts.length > 1) {
        strokesRef.current = [...strokesRef.current, pts];
        setStrokes(strokesRef.current);
        onStrokeEnd?.(strokesRef.current.length);
      }
      currentRef.current = [];
      setCurrent([]);
    })
    .runOnJS(true);

  const guide = size / 2;

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.canvas, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${KVG} ${KVG}`}>
          {/* guias de cuadricula, como el papel de caligrafia */}
          <Line x1={KVG / 2} y1="0" x2={KVG / 2} y2={KVG} stroke={T.line} strokeWidth="0.6" strokeDasharray="3,3" />
          <Line x1="0" y1={KVG / 2} x2={KVG} y2={KVG / 2} stroke={T.line} strokeWidth="0.6" strokeDasharray="3,3" />

          {/* trazo correcto por debajo (modo guiado / comparacion) */}
          {ghost?.slice(0, ghostUpTo ?? ghost.length).map((g, i) => (
            <Path key={`g${i}`} d={g.d} stroke="#c9c2b6" strokeWidth={4} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* trazos ya terminados: inmutables, por eso son baratos de repintar */}
          {strokes.map((s, i) => (
            <Path key={i} d={toPath(s)} stroke={T.ink} strokeWidth={4.5} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* el trazo en curso va aparte: React solo repinta este por frame */}
          {current.length > 1 && (
            <Path d={toPath(current)} stroke={T.ink} strokeWidth={4.5} fill="none"
                  strokeLinecap="round" strokeLinejoin="round" />
          )}
        </Svg>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  canvas: {
    backgroundColor: T.surface,
    borderRadius: T.radius,
    borderWidth: 1,
    borderColor: T.line,
    overflow: 'hidden',
  },
});
