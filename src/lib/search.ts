/**
 * Smart search utilities for fuzzy matching
 * Handles accents, case insensitivity, and partial matches
 */

/**
 * Normalize a string for search comparison
 * - Removes accents/diacritics (é → e, ñ → n, etc.)
 * - Converts to lowercase
 * - Trims whitespace
 */
export function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .trim()
}

/**
 * Check if a search term matches a target string (fuzzy)
 * Handles: accents, case, partial matches, initials
 */
export function fuzzyMatch(searchTerm: string, target: string): boolean {
  if (!searchTerm || !target) return false

  const normalizedSearch = normalizeForSearch(searchTerm)
  const normalizedTarget = normalizeForSearch(target)

  // Direct substring match
  if (normalizedTarget.includes(normalizedSearch)) {
    return true
  }

  // Match against individual words in target
  const targetWords = normalizedTarget.split(/\s+/)
  const searchWords = normalizedSearch.split(/\s+/)

  // All search words must match something
  return searchWords.every(searchWord =>
    targetWords.some(targetWord => targetWord.includes(searchWord))
  )
}

/**
 * Score a match for sorting (higher = better match)
 */
export function matchScore(searchTerm: string, target: string): number {
  if (!searchTerm || !target) return 0

  const normalizedSearch = normalizeForSearch(searchTerm)
  const normalizedTarget = normalizeForSearch(target)

  // Exact match = highest score
  if (normalizedTarget === normalizedSearch) return 100

  // Starts with = very high score
  if (normalizedTarget.startsWith(normalizedSearch)) return 90

  // Contains as complete word
  const words = normalizedTarget.split(/\s+/)
  for (const word of words) {
    if (word === normalizedSearch) return 85
    if (word.startsWith(normalizedSearch)) return 80
  }

  // Contains anywhere
  if (normalizedTarget.includes(normalizedSearch)) return 70

  // Partial word match
  const searchWords = normalizedSearch.split(/\s+/)
  const matchedWords = searchWords.filter(sw =>
    words.some(tw => tw.includes(sw))
  ).length

  if (matchedWords > 0) {
    return 50 + (matchedWords / searchWords.length) * 20
  }

  return 0
}

/**
 * Search and sort a list of items by match quality
 */
export function smartSearch<T>(
  items: T[],
  searchTerm: string,
  getSearchableText: (item: T) => string,
  limit = 10
): T[] {
  if (!searchTerm || searchTerm.length < 2) return []

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
