// Descarga con cache por contenido. Idempotente: si el archivo ya esta y su
// sha256 coincide con el sidecar, no vuelve a bajar nada.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { DIRS, SOURCES } from './config.mjs';

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

export async function fetchSource(name) {
  const src = SOURCES[name];
  if (!src) throw new Error(`fuente desconocida: ${name}`);

  fs.mkdirSync(DIRS.raw, { recursive: true });
  const out = path.join(DIRS.raw, src.file);
  const meta = `${out}.meta.json`;

  if (fs.existsSync(out) && fs.existsSync(meta)) {
    const m = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (m.sha256 === sha256(out)) {
      console.log(`  [cache] ${src.file}  (${(m.bytes / 1048576).toFixed(1)} MB)`);
      return { path: out, ...m, cached: true };
    }
    console.log(`  [cache invalida] ${src.file}, rebajando`);
  }

  console.log(`  [bajando] ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`${src.url} -> HTTP ${res.status}`);

  const tmp = `${out}.tmp`;
  if (src.gzip) {
    await pipeline(res.body, zlib.createGunzip(), fs.createWriteStream(tmp));
  } else {
    await pipeline(res.body, fs.createWriteStream(tmp));
  }
  fs.renameSync(tmp, out);

  const info = {
    source: src.url,
    bytes: fs.statSync(out).size,
    sha256: sha256(out),
    fetchedAt: new Date().toISOString(),
  };
  fs.writeFileSync(meta, JSON.stringify(info, null, 2));
  console.log(`  [ok] ${src.file}  (${(info.bytes / 1048576).toFixed(1)} MB)`);
  return { path: out, ...info, cached: false };
}

export async function fetchAll() {
  const out = {};
  for (const name of Object.keys(SOURCES)) out[name] = await fetchSource(name);
  return out;
}
