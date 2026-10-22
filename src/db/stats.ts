import type { SQLiteDatabase } from 'expo-sqlite';
import { logicalDay } from '@/lib/time';

export type Progress = { label: string; total: number; known: number; learning: number };
export type DayBar = { day: number; reviews: number; again: number };
export type Forecast = { dayOffset: number; count: number };

export type StatsSnapshot = {
  progress: Progress[];
  today: { reviews: number; newItems: number; again: number; ms: number };
  streak: number;
  history: DayBar[];
  forecast: Forecast[];
  accuracy: number | null;
  totalReviews: number;
  cardsByKind: { kind: string; n: number }[];
};

const PROGRESS_QUERIES: { label: string; sql: string }[] = [
  { label: 'Kana', sql: `
    FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
    LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'
    WHERE cur.tier='kana'` },
  { label: 'Kanji', sql: `
    FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
    LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'
    WHERE cur.tier='kanji'` },
  { label: 'Piezas', sql: `
    FROM curriculum cur JOIN glyph g ON g.id=cur.glyph_id
    LEFT JOIN prog.card c ON c.subject_kind='glyph' AND c.subject_id=g.id AND c.card_kind='recognition'
    WHERE cur.tier='component'` },
  { label: 'Vocabulario', sql: `
    FROM word w
    LEFT JOIN prog.card c ON c.subject_kind='word' AND c.subject_id=w.id AND c.card_kind='reading'` },
];

export async function loadStats(db: SQLiteDatabase, now: number, cutoffHour: number): Promise<StatsSnapshot> {
  const progress: Progress[] = [];
  for (const p of PROGRESS_QUERIES) {
    const r = await db.getFirstAsync<{ total: number; known: number; learning: number }>(
      `SELECT COUNT(*) total,
              SUM(CASE WHEN c.state=2 AND c.suspended=0 THEN 1 ELSE 0 END) known,
              SUM(CASE WHEN c.id IS NOT NULL AND c.state!=2 AND c.suspended=0 THEN 1 ELSE 0 END) learning
       ${p.sql}`);
    progress.push({ label: p.label, total: r?.total ?? 0, known: r?.known ?? 0, learning: r?.learning ?? 0 });
  }

  const day = logicalDay(now, cutoffHour);
  const t = await db.getFirstAsync<{ reviews: number; new_items: number; again: number; ms: number }>(
    'SELECT reviews, new_items, again, ms FROM prog.day_stat WHERE day = ?', day);
  const today = { reviews: t?.reviews ?? 0, newItems: t?.new_items ?? 0, again: t?.again ?? 0, ms: t?.ms ?? 0 };

  // Se devuelven SIEMPRE los 30 dias, con ceros incluidos. Si solo se
  // devolvieran los dias con datos, un unico dia de historial se dibujaria como
  // una barra que ocupa todo el ancho: parece un bloque solido, no un grafico.
  const rows30 = await db.getAllAsync<DayBar>(
    'SELECT day, reviews, again FROM prog.day_stat ORDER BY day DESC LIMIT 30');
  const byDay = new Map(rows30.map((r) => [r.day, r]));
  const history: DayBar[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = shiftDay(day, -i);
    history.push(byDay.get(d) ?? { day: d, reviews: 0, again: 0 });
  }

  // racha: dias logicos consecutivos con al menos un repaso, hacia atras
  const days = await db.getAllAsync<{ day: number }>(
    'SELECT day FROM prog.day_stat WHERE reviews > 0 ORDER BY day DESC LIMIT 400');
  let streak = 0;
  let cursor = day;
  const set = new Set(days.map((d) => d.day));
  // si hoy aun no se ha estudiado, la racha se cuenta desde ayer
  if (!set.has(cursor)) cursor = shiftDay(cursor, -1);
  while (set.has(cursor)) { streak++; cursor = shiftDay(cursor, -1); }

  // carga futura: cuantas tarjetas vencen cada uno de los proximos 14 dias
  const forecast: Forecast[] = [];
  const DAY_MS = 86400000;
  const rows = await db.getAllAsync<{ d: number; n: number }>(
    `SELECT CAST((due - ?) / ? AS INTEGER) d, COUNT(*) n
     FROM prog.card
     WHERE suspended = 0 AND due > ? AND due < ?
     GROUP BY d ORDER BY d`, now, DAY_MS, now, now + 14 * DAY_MS);
  const byOffset = new Map(rows.map((r) => [r.d, r.n]));
  for (let i = 0; i < 14; i++) forecast.push({ dayOffset: i, count: byOffset.get(i) ?? 0 });

  const acc = await db.getFirstAsync<{ total: number; again: number }>(
    "SELECT COUNT(*) total, SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) again FROM prog.review_log WHERE review_kind='scheduled'");
  const totalReviews = acc?.total ?? 0;
  const accuracy = totalReviews > 0 ? 1 - (acc!.again ?? 0) / totalReviews : null;

  const cardsByKind = await db.getAllAsync<{ kind: string; n: number }>(
    'SELECT card_kind kind, COUNT(*) n FROM prog.card WHERE suspended=0 GROUP BY card_kind');

  return { progress, today, streak, history, forecast, accuracy, totalReviews, cardsByKind };
}

function shiftDay(yyyymmdd: number, delta: number): number {
  const y = Math.floor(yyyymmdd / 10000);
  const m = Math.floor((yyyymmdd % 10000) / 100);
  const d = yyyymmdd % 100;
  const dt = new Date(y, m - 1, d + delta);
  return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
}

/** Borra TODO el progreso. El contenido no se toca. */
export async function resetProgress(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of ['review_log', 'card', 'introduced', 'day_stat', 'user_gloss']) {
      await db.runAsync(`DELETE FROM prog.${t}`);
    }
    await db.runAsync("UPDATE prog.meta SET value='1' WHERE key='next_curriculum_pos'");
  });
}
