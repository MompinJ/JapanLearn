import type { SQLiteDatabase } from 'expo-sqlite';
import { Rating, scheduler, toCard, type CardRow, type Grade } from './scheduler';
import { logicalDay } from '../lib/time';

type ApplyArgs = {
  db: SQLiteDatabase;
  card: CardRow;
  rating: Grade;
  now: number;
  durationMs: number;
  source: string;
  cutoffHour: number;
  retention: number;
  drawnStrokes?: number | null;
  expectedStrokes?: number | null;
};

/**
 * Persiste una respuesta. La UI NO espera a esta promesa: avanza a la siguiente
 * tarjeta en el mismo frame y la escritura se encola.
 *
 * REGLA INVIOLABLE: en modo cram NO se escribe programacion. Aplicar
 * scheduler.next() sobre una tarjeta que aun no vence inflaria la estabilidad
 * con un elapsed_days falso y corromperia el modelo en silencio.
 */
export async function applyRating(a: ApplyArgs): Promise<void> {
  const { db, card, rating, now } = a;
  const elapsedDays = card.last_review
    ? Math.max(0, Math.round((now - card.last_review) / 86400000))
    : 0;
  const day = logicalDay(now, a.cutoffHour);
  // Ni cram ni modo libre escriben programacion: aplicar scheduler.next() sobre
  // una tarjeta que aun no vence inflaria la estabilidad con un elapsed_days
  // falso y corromperia el modelo en silencio.
  const isCram = a.source === 'cram' || a.source === 'free';
  const isNew = card.state === 0;

  const logRow = [
    card.id, card.subject_kind, card.subject_id, card.card_kind,
    rating, card.state, card.due, card.stability, card.difficulty,
    elapsedDays, now, a.durationMs, isCram ? 'cram' : 'scheduled',
    a.drawnStrokes ?? null, a.expectedStrokes ?? null,
  ];

  await db.withTransactionAsync(async () => {
    if (!isCram) {
      const next = scheduler(a.retention).next(toCard(card), new Date(now), rating).card;
      await db.runAsync(
        `UPDATE prog.card SET due=?, stability=?, difficulty=?, scheduled_days=?,
           learning_steps=?, reps=?, lapses=?, state=?, last_review=?, updated_at=?
         WHERE id=?`,
        next.due.getTime(), next.stability, next.difficulty, next.scheduled_days,
        next.learning_steps, next.reps, next.lapses, next.state, now, now, card.id);
    }

    await db.runAsync(
      `INSERT INTO prog.review_log
        (card_id, subject_kind, subject_id, card_kind, rating, state, due,
         stability, difficulty, elapsed_days, review, duration_ms, review_kind,
         drawn_strokes, expected_strokes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ...logRow);

    await db.runAsync(
      `INSERT INTO prog.day_stat (day, reviews, new_items, again, ms)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         reviews   = reviews   + 1,
         new_items = new_items + excluded.new_items,
         again     = again     + excluded.again,
         ms        = ms        + excluded.ms`,
      day, isNew && !isCram ? 1 : 0, rating === Rating.Again ? 1 : 0, a.durationMs);
  });
}
