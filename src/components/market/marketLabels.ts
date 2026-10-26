import type { NegotiationStatus, NeedStatus, CandidateStatus } from '@/types/market'

export const NEGOTIATION_STATUS_ORDER: NegotiationStatus[] = [
  // "Avanzado" y "Pausado" siguen existiendo en la base pero ya no se ofrecen:
  // 4 estados con las mismas palabras que los ofrecidos de una búsqueda.
  'ofrecido', 'en_negociacion', 'cerrado_exito', 'cerrado_caido',
]

export const NEGOTIATION_STATUS_LABEL_KEY: Record<NegotiationStatus, string> = {
  ofrecido: 'mercado.estadoOfrecido',
  pausado: 'mercado.estadoPausado',
  en_negociacion: 'mercado.estadoEnNegociacion',
  avanzado: 'mercado.estadoAvanzado',
  cerrado_exito: 'mercado.estadoCerradoExito',
  cerrado_caido: 'mercado.estadoCerradoCaido',
}

export const NEGOTIATION_STATUS_COLOR: Record<NegotiationStatus, string> = {
  ofrecido: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  pausado: 'bg-apple-gray-100 text-apple-gray-600 dark:bg-apple-gray-700 dark:text-apple-gray-300',
  en_negociacion: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  avanzado: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  cerrado_exito: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  cerrado_caido: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

/**
 * Acento sutil (franja + fondo tenue) para diferenciar el estado de un
 * vistazo en lugares donde no entra la píldora entera — el `<select>` de
 * "Estado" en la fila expandida, y los filtros de estado de la página.
 */
export const NEGOTIATION_STATUS_ACCENT: Record<NegotiationStatus, string> = {
  ofrecido: 'border-l-4 border-l-sky-400 bg-sky-50/60 dark:bg-sky-900/10',
  pausado: 'border-l-4 border-l-apple-gray-300 dark:border-l-apple-gray-600 bg-apple-gray-50 dark:bg-apple-gray-800/40',
  en_negociacion: 'border-l-4 border-l-amber-400 bg-amber-50/60 dark:bg-amber-900/10',
  avanzado: 'border-l-4 border-l-purple-400 bg-purple-50/60 dark:bg-purple-900/10',
  cerrado_exito: 'border-l-4 border-l-emerald-400 bg-emerald-50/60 dark:bg-emerald-900/10',
  cerrado_caido: 'border-l-4 border-l-red-400 bg-red-50/60 dark:bg-red-900/10',
}

export const NEED_STATUS_ORDER: NeedStatus[] = ['abierto', 'cerrado']

export const NEED_STATUS_LABEL_KEY: Record<NeedStatus, string> = {
  abierto: 'mercado.estadoAbierto',
  cerrado: 'mercado.estadoCerrado',
}

export const NEED_STATUS_COLOR: Record<NeedStatus, string> = {
  abierto: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800/70',
  cerrado: 'bg-apple-gray-200 text-apple-gray-600 ring-1 ring-inset ring-apple-gray-300 dark:bg-apple-gray-700 dark:text-apple-gray-300 dark:ring-apple-gray-600',
}

export const NEED_STATUS_ACCENT: Record<NeedStatus, string> = {
  abierto: 'border-l-4 border-l-sky-400 bg-sky-50/60 dark:bg-sky-900/10',
  cerrado: 'border-l-4 border-l-apple-gray-300 dark:border-l-apple-gray-600 bg-apple-gray-50 dark:bg-apple-gray-800/40',
}

export const CANDIDATE_STATUS_ORDER: CandidateStatus[] = ['propuesto', 'en_negociacion', 'fichado', 'descartado']

export const CANDIDATE_STATUS_LABEL_KEY: Record<CandidateStatus, string> = {
  propuesto: 'mercado.candidatoPropuesto',
  en_negociacion: 'mercado.candidatoEnNegociacion',
  descartado: 'mercado.candidatoDescartado',
  fichado: 'mercado.candidatoFichado',
}

export const CANDIDATE_STATUS_COLOR: Record<CandidateStatus, string> = {
  propuesto: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  en_negociacion: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  descartado: 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-200 dark:bg-red-900/20 dark:text-red-400 dark:ring-red-800/60',
  fichado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}
