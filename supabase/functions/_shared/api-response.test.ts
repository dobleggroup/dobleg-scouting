// supabase/functions/_shared/api-response.test.ts

import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { apiResponseError, canCloseWithoutPlayers } from './api-response.ts';

Deno.test('apiResponseError: el límite por minuto llega con HTTP 200 y "errors" (antes se tomaba como partido vacío)', () => {
  assertEquals(apiResponseError({ errors: { rateLimit: 'Too many requests. You have exceeded the limit of requests per minute of your subscription.' }, response: [] }), 'RATE_LIMITED');
});

Deno.test('apiResponseError: otros errores del proveedor también cortan', () => {
  assertEquals(apiResponseError({ errors: { token: 'Error/Missing application key.' }, response: [] }), 'API-Football: Error/Missing application key.');
  assertEquals(apiResponseError({ errors: ['algo'], response: [] }), 'API-Football: algo');
});

Deno.test('apiResponseError: sin errores devuelve null', () => {
  assertEquals(apiResponseError({ errors: [], response: [] }), null);
  assertEquals(apiResponseError({ errors: {}, response: [{}] }), null);
  assertEquals(apiResponseError({ response: [] }), null);
});

Deno.test('canCloseWithoutPlayers: un partido recién terminado sin datos se reintenta', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  assertEquals(canCloseWithoutPlayers('2026-09-23T23:00:00Z', now), false);
});

Deno.test('canCloseWithoutPlayers: pasados 3 días sin datos, se da por cerrado (liga sin cobertura de ese partido)', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  assertEquals(canCloseWithoutPlayers('2026-09-20T20:00:00Z', now), true);
});
