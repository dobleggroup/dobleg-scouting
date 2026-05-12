export function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.\-_,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function initialsMatch(searchWords: string[], targetWords: string[]): boolean {
  if (searchWords.length < 1) return false
  const first = searchWords[0]
  if (first.length > 2) return false
  const rest = searchWords.slice(1)
  const hasInitialHit = targetWords.some(tw => tw.startsWith(first))
  if (!hasInitialHit) return false
  if (rest.length === 0) return first.length >= 2
  return rest.every(sw => targetWords.some(tw => tw.includes(sw) || sw.includes(tw)))
}

export function fuzzyMatch(searchTerm: string, target: string): boolean {
  if (!searchTerm || !target) return false

  const ns = normalizeForSearch(searchTerm)
  const nt = normalizeForSearch(target)

  if (!ns) return false

  if (ns.length >= 2 && nt.includes(ns)) return true

  const sw = ns.split(/\s+/)
  const tw = nt.split(/\s+/)

  if (sw.length > 1 && sw.every(s => tw.some(t => t.includes(s)))) return true
  if (sw.length === 1 && sw[0].length >= 3 && tw.some(t => t.startsWith(sw[0]))) return true

  if (initialsMatch(sw, tw)) return true
  if (initialsMatch(tw, sw)) return true

  return false
}

export function matchScore(searchTerm: string, target: string): number {
  if (!searchTerm || !target) return 0

  const ns = normalizeForSearch(searchTerm)
  const nt = normalizeForSearch(target)

  if (!ns) return 0
  if (nt === ns) return 100
  if (nt.startsWith(ns)) return 90

  const tw = nt.split(/\s+/)
  const sw = ns.split(/\s+/)

  for (const word of tw) {
    if (word === ns) return 85
    if (word.startsWith(ns)) return 80
  }

  if (ns.length >= 2 && nt.includes(ns)) return 70

  if (initialsMatch(sw, tw)) return 75

  const matched = sw.filter(s => tw.some(t => t.includes(s) || t.startsWith(s))).length
  if (matched === sw.length) return 65

  if (matched > 0) return 40 + (matched / sw.length) * 25

  if (sw.length === 1 && sw[0].length >= 3) {
    for (const t of tw) {
      if (t.startsWith(sw[0])) return 60
    }
  }

  return 0
}

export function smartSearch<T>(
  items: T[],
  searchTerm: string,
  getSearchableText: (item: T) => string,
  limit = 10
): T[] {
  if (!searchTerm || searchTerm.length < 1) return []

  const scored = items
    .map(item => ({
      item,
      score: matchScore(searchTerm, getSearchableText(item))
    }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(x => x.item)
}
