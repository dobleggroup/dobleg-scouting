import type { CommentKind } from '@/services/playerCommentsService'

// Cada comentario de un jugador dice qué fue: comentario, reunión presencial, reunión online
// o contacto. Esto adivina la etiqueta a partir del texto ("segunda reunión en Córdoba",
// "videollamada con el representante", "le escribí por WhatsApp") y, si fue presencial, la
// ciudad. El scout siempre puede cambiarla con un toque.

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const ONLINE = /\b(video ?llamadas?|zoom|meet|videoconferencias?|reunion virtual|reunion online|virtual)\b/
const IN_PERSON = /\b(reunion(es)?|reunimos|nos juntamos|juntamos|cafe|almuerzo|almorzamos|cena|cenamos|presencial|en persona)\b/
const CONTACT = /\b(llamadas?|llame|llamamos|me llamo|hable|hablamos|whats?app|wpp|mensajes?|le escribi|me escribio|contacte|contactamos|contacto|por telefono)\b/

// Palabras que cortan el nombre de la ciudad ("en Córdoba con el padre" → "Córdoba").
const STOP = new Set(['con', 'por', 'para', 'y', 'visto', 'vista', 'el', 'los', 'las', 'a', 'que', 'sobre', 'junto', 'hoy', 'ayer'])

export interface KindGuess {
  kind: CommentKind
  city: string | null
}

function cityAfterMeetingWord(text: string): string | null {
  const t = norm(text)
  const m = t.match(/(?:reunion(?:es)?|reunimos|juntamos|presencial|almuerzo|cena|cafe)[^.,;()\n]*?\ben\s+([^.,;()\n]+)/)
  if (!m) return null
  // Se recorta del texto original (con tildes y mayúsculas) en la misma posición.
  const start = (m.index ?? 0) + m[0].length - m[1].length
  const original = text.slice(start, start + m[1].length)
  const words: string[] = []
  for (const w of original.trim().split(/\s+/)) {
    if (words.length > 0 && STOP.has(norm(w))) break
    words.push(w)
    if (words.length === 3) break
  }
  while (words.length && ['de', 'del', 'la'].includes(norm(words[words.length - 1]))) words.pop()
  return words.length ? words.join(' ').replace(/^./, c => c.toUpperCase()) : null
}

export function guessCommentKind(text: string): KindGuess {
  const t = norm(text)
  if (ONLINE.test(t)) return { kind: 'reunion_online', city: null }
  if (IN_PERSON.test(t)) return { kind: 'reunion_presencial', city: cityAfterMeetingWord(text) }
  if (CONTACT.test(t)) return { kind: 'contacto', city: null }
  return { kind: 'comentario', city: null }
}
