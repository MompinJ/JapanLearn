import type { SQLiteDatabase } from 'expo-sqlite';
import { WEB_CONTENT_DDL } from './webSchema.sql';
import { WEB_SEED_SQL } from './webSeed.sql';

/**
 * Arranque SOLO para WEB.
 *
 * En movil el contenido llega dentro de japanese.db empaquetado como asset,
 * que SQLiteProvider copia solo. En web eso no funciona: expo-file-system no
 * existe alli, asi que se crea el esquema a mano y se siembra una muestra
 * pequena de contenido real.
 *
 * Sirve para revisar la interfaz sin dispositivo. NUNCA se ejecuta en Android
 * ni en iOS: la llamada esta detras de Platform.OS === 'web'.
 */
export async function seedWebContent(db: SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='glyph'");
  if ((existing?.n ?? 0) === 0) {
    await db.execAsync(WEB_CONTENT_DDL);
  }
  const seeded = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM glyph');
  if ((seeded?.n ?? 0) === 0) {
    await db.execAsync(WEB_SEED_SQL);
  }
}
