// supabase/functions/_shared/api-response.ts
//
// API-Football avisa los errores (incluido el límite de consultas por minuto) con HTTP 200,
// `response: []` y el detalle en `errors`. Solo se miraba el 429, así que un partido pedido
// durante un corte quedaba marcado como "sin estadísticas" para siempre: en 2025 la
// Premier tenía 10 de 380 partidos con datos de jugadores.

/** Mensaje de error si la respuesta trae `errors`; null si vino bien. */
export function apiResponseError(json: { errors?: unknown }): string | null {
  const errors = json.errors;
  const values = Array.isArray(errors)
    ? errors
    : errors && typeof errors === 'object'
      ? Object.entries(errors as Record<string, unknown>).map(([k, v]) => ({ k, v }))
      : [];
  if (values.length === 0) return null;
  if (!Array.isArray(errors) && 'rateLimit' in (errors as Record<string, unknown>)) return 'RATE_LIMITED';
  const first = values[0] as unknown;
  const text = typeof first === 'object' && first !== null && 'v' in first ? String((first as { v: unknown }).v) : String(first);
  return `API-Football: ${text}`;
}

const GRACE_DAYS = 3;

/**
 * Un partido terminado que todavía no tiene datos de jugadores se reintenta en las próximas
 * pasadas; recién después de GRACE_DAYS se da por cerrado (esa liga no cubre ese partido).
 */
export function canCloseWithoutPlayers(fixtureDate: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(fixtureDate).getTime() > GRACE_DAYS * 86400000;
}
