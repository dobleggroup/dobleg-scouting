import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';

Deno.env.set('API_FOOTBALL_KEY', 'test');
Deno.env.set('SUPABASE_URL', 'http://localhost:54321');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test');

const { fetchLineups, isQuotaStop, setApiCaller, QUOTA_RESERVED } = await import('./api-football.ts');

// Simula API-Football con `current` consultas usadas de 7.500 y cuenta las consultas reales.
function mockApi(current: number) {
  const calls = { api: 0, bumps: [] as string[] };
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes('/status')) {
      return new Response(JSON.stringify({ response: { requests: { current, limit_day: 7500 } } }));
    }
    if (url.includes('bump_api_football_usage')) {
      calls.bumps.push(JSON.parse(String(init?.body)).p_source);
      return new Response('null', { headers: { 'Content-Type': 'application/json' } });
    }
    calls.api++;
    return new Response(JSON.stringify({ errors: [], response: [] }));
  }) as typeof fetch;
  return calls;
}

Deno.test('lo secundario se frena al 50 % sin gastar consultas', async () => {
  const calls = mockApi(3800);
  setApiCaller('fill-nationality', 'secondary');
  await assertRejects(() => fetchLineups(1), Error, QUOTA_RESERVED);
  assertEquals(calls.api, 0);
});

Deno.test('lo esencial sigue con el mismo uso y se cuenta con su nombre', async () => {
  const calls = mockApi(3800);
  setApiCaller('sync-player-stats', 'essential');
  await fetchLineups(1);
  await fetchLineups(2);
  assertEquals(calls.api, 2);
  assertEquals(calls.bumps, ['sync-player-stats', 'sync-player-stats']);
});

Deno.test('lo esencial se frena al 95 %, contando lo que gastó en la corrida', async () => {
  const calls = mockApi(7124); // 94,99 %: entra una consulta y con ella se llega al 95 %
  setApiCaller('sync-fixtures', 'essential');
  await fetchLineups(1);
  await assertRejects(() => fetchLineups(2), Error, QUOTA_RESERVED);
  assertEquals(calls.api, 1);
});

Deno.test('isQuotaStop reconoce la pausa y el límite de la API, no otros errores', () => {
  assertEquals(isQuotaStop(new Error(QUOTA_RESERVED)), true);
  assertEquals(isQuotaStop(new Error('RATE_LIMITED')), true);
  assertEquals(isQuotaStop(new Error('API-Football 500: bug')), false);
});
