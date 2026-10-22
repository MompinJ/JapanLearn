// El "dia logico" corta a las 4:00 locales, no a medianoche: si estudias a la
// 1 de la madrugada sigue contando como el dia anterior.
export function logicalDay(now: number, cutoffHour: number): number {
  const d = new Date(now);
  d.setHours(d.getHours() - cutoffHour);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * Intervalo en lenguaje natural: "1 min", "6 dias", "2 meses".
 *
 * La forma corta ("1m", "6d") es jerga de Anki y no dice nada a quien empieza:
 * parece una nota, no una fecha. Aqui se escribe entero y se antepone
 * "vuelve en" en la interfaz, para que quede claro que es CUANDO reaparece.
 */
export function humanInterval(ms: number): string {
  const min = ms / 60000;
  if (min < 1.5) return '1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} ${Math.round(h) === 1 ? 'hora' : 'horas'}`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)} ${Math.round(d) === 1 ? 'día' : 'días'}`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)} ${Math.round(mo) === 1 ? 'mes' : 'meses'}`;
  const y = d / 365;
  return `${y < 2 ? '1' : Math.round(y)} ${y < 2 ? 'año' : 'años'}`;
}

export function formatInterval(ms: number): string {
  const min = ms / 60000;
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.round(d)}d`;
  const mo = d / 30;
  if (mo < 12) return `${Math.round(mo)}mes`;
  return `${(d / 365).toFixed(1)}a`;
}
