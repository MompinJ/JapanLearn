import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Version NATIVA: no hace nada.
 *
 * En Android/iOS el contenido llega dentro de japanese.db empaquetado como
 * asset, asi que no hay nada que sembrar. Metro resuelve webBootstrap.web.ts
 * en web y este archivo en movil, de modo que la semilla (~100 KB de SQL) no
 * entra nunca en el bundle del telefono.
 */
export async function seedWebContent(_db: SQLiteDatabase): Promise<void> {}
