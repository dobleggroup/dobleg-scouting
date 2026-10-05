import { describe, it, expect } from 'vitest'
import { readPersistentCache, writePersistentCache } from './persistentCache'

describe('persistentCache sin IndexedDB', () => {
  it('no rompe: leer devuelve null y escribir no hace nada (se sigue pidiendo a la red)', async () => {
    const original = (globalThis as any).indexedDB
    ;(globalThis as any).indexedDB = undefined
    try {
      await expect(writePersistentCache('k', [1, 2, 3])).resolves.toBeUndefined()
      await expect(readPersistentCache('k', 60_000)).resolves.toBeNull()
    } finally {
      ;(globalThis as any).indexedDB = original
    }
  })
})
