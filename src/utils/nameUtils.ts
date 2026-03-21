/**
 * Utilities for matching player names across different formats.
 *
 * Wyscout exports names as "I. Surname" (e.g., "L. Messi", "C. Ronaldo").
 * Manual entries or reports may use "Lionel Messi" or just "Messi".
 * These functions help reconcile both formats.
 */

/** Returns true if a name looks like a Wyscout-style "I. Surname" */
export function isWyscoutFormat(name: string): boolean {
  return /^[A-ZÁÉÍÓÚÑ]\.\s+\S/.test(name.trim())
}

/**
 * Extracts the surname (last word) and first initial from a name.
 * Works for both "L. Messi" and "Lionel Messi".
 */
export function extractNameParts(name: string): { initial: string; surname: string } {
  const clean = name.trim()
  const parts = clean.split(/\s+/)
  const surname = parts[parts.length - 1].toLowerCase()

  // "L. Messi" → initial = "l"
  // "Lionel Messi" → initial = "l"
  const initial = parts[0].charAt(0).toLowerCase()

  return { initial, surname }
}

/**
 * Returns a normalized "dedup key" for a player name.
 * Used to detect duplicates across Wyscout and manual name formats.
 * Key = "initial:surname" → "l:messi"
 */
export function nameKey(name: string): string {
  const { initial, surname } = extractNameParts(name)
  return `${initial}:${surname}`
}

/**
 * Returns true if two player names refer to the same player,
 * handling both "L. Messi" and "Lionel Messi" formats.
 */
export function playerNamesMatch(name1: string, name2: string): boolean {
  if (!name1 || !name2) return false
  // Exact match (case-insensitive)
  if (name1.toLowerCase().trim() === name2.toLowerCase().trim()) return true
  // Key-based match: same initial + same surname
  return nameKey(name1) === nameKey(name2)
}

/**
 * Given a Wyscout-format name like "L. Messi",
 * returns a human-readable display name.
 * If already a full name, returns as-is.
 */
export function displayName(name: string): string {
  return name?.trim() || ''
}

/**
 * Tries to build a Wyscout-style name from a full name.
 * "Lionel Messi" → "L. Messi"
 * Used for reverse lookups.
 */
export function toWyscoutFormat(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return fullName
  const initial = parts[0].charAt(0).toUpperCase()
  const surname = parts[parts.length - 1]
  return `${initial}. ${surname}`
}
