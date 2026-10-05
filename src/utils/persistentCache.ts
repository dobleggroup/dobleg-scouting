/**
 * Cache chico en IndexedDB (sobrevive a recargas y a cerrar la pestaña) para
 * datos grandes que cambian poco, como los ratings de temporada (~15.000 filas,
 * varios MB: no entran en localStorage). Si IndexedDB no está disponible o
 * falla (modo privado, permisos), todo devuelve null / no hace nada y el que
 * llama sigue pidiendo los datos a la red como siempre.
 */

const DB_NAME = 'scout-platform-cache'
const STORE = 'entries'

interface Entry<T> {
  savedAt: number
  data: T
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/** Devuelve el dato guardado si tiene menos de `maxAgeMs`; si no, null. */
export async function readPersistentCache<T>(key: string, maxAgeMs: number): Promise<T | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => {
        const entry = req.result as Entry<T> | undefined
        resolve(entry && Date.now() - entry.savedAt < maxAgeMs ? entry.data : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    } finally {
      db.close()
    }
  })
}

export async function writePersistentCache<T>(key: string, data: T): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put({ savedAt: Date.now(), data } satisfies Entry<T>, key)
  } catch {
    // sin cache: la próxima visita vuelve a pedir a la red
  } finally {
    db.close()
  }
}
