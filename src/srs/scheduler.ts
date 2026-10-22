// Envoltorio de ts-fsrs 5.4.2.
import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';

export { Rating, State };
/** Grade son las 4 notas reales (Again/Hard/Good/Easy). Rating ademas
 *  incluye Manual, que no es una respuesta del usuario. */
export type { Grade };

export type CardRow = {
  id: number;
  subject_kind: 'glyph' | 'word';
  subject_id: number;
  subject_key: string;
  card_kind: 'recognition' | 'reading' | 'writing';
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
};

let instance: FSRS | null = null;

export function scheduler(requestRetention = 0.9): FSRS {
  if (!instance) {
    instance = fsrs({
      request_retention: requestRetention,
      enable_fuzz: true,
      enable_short_term: true,
    });
  }
  return instance;
}

export function resetScheduler(): void {
  instance = null;
}

/** Fila de SQLite -> Card de ts-fsrs. */
export function toCard(row: CardRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: 0, // deprecado en 5.4: se recalcula, no se persiste
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  } as Card;
}

export function emptyCard(now: number): Card {
  return createEmptyCard(new Date(now));
}

/** Los 4 intervalos reales, para etiquetar los botones antes de pulsarlos. */
export function previewIntervals(card: Card, now: number, retention = 0.9) {
  const r = scheduler(retention).repeat(card, new Date(now));
  return {
    [Rating.Again]: r[Rating.Again].card.due.getTime() - now,
    [Rating.Hard]: r[Rating.Hard].card.due.getTime() - now,
    [Rating.Good]: r[Rating.Good].card.due.getTime() - now,
    [Rating.Easy]: r[Rating.Easy].card.due.getTime() - now,
  } as Record<number, number>;
}
