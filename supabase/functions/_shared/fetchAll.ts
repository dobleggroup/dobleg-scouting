/**
 * PostgREST devuelve como máximo 1000 filas por consulta y NO avisa cuando corta.
 * Una consulta sin paginar sobre una tabla grande devuelve un subconjunto arbitrario
 * y el resto desaparece en silencio: si eso alimenta al scoring, los partidos que
 * quedaron afuera dejan de existir para el cálculo.
 *
 * Uso:
 *   const fixtures = await fetchAllRows((from, to) =>
 *     supabase.from('fixtures').select('id').eq('season', season).range(from, to))
 */
const MAX_TRIES = 3

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }>,
  pageSize = 1000,
  /** Espera antes de reintentar una pagina que corto por tiempo (la base estaba cargada). */
  retryDelayMs = 2000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    let data: T[] | null = null
    for (let attempt = 1; ; attempt++) {
      const res = await page(from, from + pageSize - 1)
      if (!res.error) {
        data = res.data
        break
      }
      const message = (res.error as { message?: string })?.message ?? String(res.error)
      // Un corte por tiempo suele ser la base ocupada en ese momento: se reintenta.
      if (!/statement timeout/i.test(message) || attempt >= MAX_TRIES) throw new Error(message)
      if (retryDelayMs > 0) await new Promise(r => setTimeout(r, retryDelayMs * attempt))
    }
    if (!data || data.length === 0) break
    out.push(...data)
    if (data.length < pageSize) break
  }
  return out
}
