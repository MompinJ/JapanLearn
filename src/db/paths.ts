// UNICO archivo que toca expo-file-system.
//
// TRAMPA DE SDK 57: los metodos legacy (documentDirectory, copyAsync,
// readAsStringAsync...) siguen exportados del entrypoint principal y
// typechequean bien, pero LANZAN EN RUNTIME. Aqui solo se usa la API nueva
// File / Directory / Paths.
import { Directory, File, Paths } from 'expo-file-system';

const SQLITE_DIR = 'SQLite';
const CONTENT_DB = 'japanese.db';

// ATTACH necesita una ruta POSIX, NO un URI file://. Si se le pasa el URI,
// SQLite puede interpretarlo como URI propio o fallar sin mensaje util.
function toPosix(uri: string): string {
  const p = decodeURIComponent(uri.replace(/^file:\/\//, ''));
  if (!p.startsWith('/')) throw new Error(`ruta inesperada para ATTACH: ${uri}`);
  return p;
}

export function sqliteDir(): Directory {
  const dir = new Directory(Paths.document, SQLITE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export function progressDbPath(): string {
  return toPosix(new File(sqliteDir(), 'progress.db').uri);
}

export function contentStateFile(): File {
  return new File(Paths.document, 'content.state.json');
}

/**
 * Borra la BD de contenido Y sus sidecars antes de recopiar el asset.
 * Un -wal huerfano sobre un .db nuevo produce "database disk image is
 * malformed", y el fallo solo aparece en la SEGUNDA actualizacion de contenido.
 */
export function deleteContentDb(): void {
  const dir = sqliteDir();
  for (const name of [CONTENT_DB, `${CONTENT_DB}-wal`, `${CONTENT_DB}-shm`]) {
    const f = new File(dir, name);
    if (f.exists) f.delete();
  }
}

// text() es ASINCRONO en SDK 57; write/create/delete/exists son sincronos.
export async function readContentState(): Promise<{ version: string } | null> {
  try {
    const f = contentStateFile();
    if (!f.exists) return null;
    return JSON.parse(await f.text());
  } catch {
    return null;
  }
}

export function writeContentState(state: { version: string }): void {
  const f = contentStateFile();
  if (!f.exists) f.create();
  f.write(JSON.stringify(state));
}
