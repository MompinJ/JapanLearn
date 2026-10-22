import { Platform } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { progressDbPath, writeContentState } from './paths';
import contentVersion from '@/assets/db/content-version.json';
import { runMigrations } from './migrations';

export const DEFAULT_SETTINGS = {
  maxNewPerDay: 12,
  dailyTargetReviews: 120,
  maxLearning: 8,
  dayCutoffHour: 4,
  requestRetention: 0.9,
  // Escribir a mano se activa a mano. Va APAGADO de serie porque duplica el
  // trabajo diario (una tarjeta de escritura por cada kanji graduado, ~2.800 al
  // final del curriculum) y no hace falta para el objetivo por defecto, que es
  // reconocer e interpretar. Calcar el caracter al fallar sigue funcionando
  // este ajuste como este: eso no es una tarjeta, es una ayuda para memorizar.
  writingEnabled: 0,
};

/**
 * onInit de SQLiteProvider. Monta el progreso y deja la BD lista.
 * El contenido (japanese.db) es la base principal; el progreso va ATTACHeado
 * como `prog` para poder reemplazar el contenido entero sin tocarlo.
 */
export async function bootstrapDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');

  // En web no hay asset que copiar: se crea el contenido a mano. Solo sirve
  // para revisar la interfaz; el movil usa japanese.db empaquetado.
  if (Platform.OS === 'web') {
    const { seedWebContent } = await import('./webBootstrap');
    await seedWebContent(db);
  }

  // En web no existe expo-file-system, asi que el progreso va a una base en
  // memoria en vez de a un archivo del dispositivo.
  const path = Platform.OS === 'web' ? ':memory:' : progressDbPath().replace(/'/g, "''");
  await db.execAsync(`ATTACH DATABASE '${path}' AS prog`);

  // WAL SOLO en el progreso. El contenido es read-only y sus sidecars
  // huerfanos corromperian la base tras un forceOverwrite.
  await db.execAsync('PRAGMA prog.journal_mode = WAL');
  await db.execAsync('PRAGMA prog.synchronous = NORMAL');

  await runMigrations(db);

  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.runAsync('INSERT OR IGNORE INTO prog.meta (key, value) VALUES (?, ?)', k, String(v));
  }
  await db.runAsync(
    "INSERT OR IGNORE INTO prog.meta (key, value) VALUES ('next_curriculum_pos', '1')"
  );

  // El estado del contenido se marca SOLO cuando todo ha ido bien. Escribirlo
  // antes de la copia haria que un fallo dejara el archivo diciendo "ya
  // actualizado" y la version vieja no se reintentaria jamas.
  if (Platform.OS !== 'web') {
    try { writeContentState({ version: contentVersion.version }); } catch {}
  }
}

export async function getSettings(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM prog.meta');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    maxNewPerDay: Number(map.maxNewPerDay ?? DEFAULT_SETTINGS.maxNewPerDay),
    dailyTargetReviews: Number(map.dailyTargetReviews ?? DEFAULT_SETTINGS.dailyTargetReviews),
    maxLearning: Number(map.maxLearning ?? DEFAULT_SETTINGS.maxLearning),
    dayCutoffHour: Number(map.dayCutoffHour ?? DEFAULT_SETTINGS.dayCutoffHour),
    requestRetention: Number(map.requestRetention ?? DEFAULT_SETTINGS.requestRetention),
    writingEnabled: Number(map.writingEnabled ?? DEFAULT_SETTINGS.writingEnabled) === 1,
    nextCurriculumPos: Number(map.next_curriculum_pos ?? 1),
  };
}

/**
 * Activa o desactiva la practica de escritura.
 *
 * Las tarjetas que ya existen no se borran: se aparcan con suspended = 3, que
 * es un valor propio para "desactivada por ajuste". Usar el 1 (suspendida por
 * el usuario) las mezclaria con las que el usuario haya suspendido a mano y al
 * volver a activar la escritura se le desharia esa decision.
 */
export async function setWritingEnabled(db: SQLiteDatabase, enabled: boolean): Promise<void> {
  await setMeta(db, 'writingEnabled', enabled ? '1' : '0');
  await db.runAsync(
    enabled
      ? "UPDATE prog.card SET suspended = 0 WHERE card_kind = 'writing' AND suspended = 3"
      : "UPDATE prog.card SET suspended = 3 WHERE card_kind = 'writing' AND suspended = 0");
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO prog.meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
}

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM prog.meta WHERE key = ?', key);
  return r?.value ?? null;
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
