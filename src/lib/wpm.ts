export const MIN_WPM = 100;
export const MAX_WPM = 800;

export function clampWpm(value: number): number {
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(value)));
}

export function clampWpmFromStorage(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(n)));
}
