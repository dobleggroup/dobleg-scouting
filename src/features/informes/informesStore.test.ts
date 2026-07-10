// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saveInforme, listInformes, loadInforme, deleteInforme, newInformeId } from './informesStore'
import type { Informe } from './types'

function makeInforme(id: string, nombre: string): Informe {
  return {
    id, createdAt: '2026-07-05', updatedAt: '2026-07-05',
    contextoComparacion: 'LI - Uruguay', fotoDataUrl: null, protagonistIndex: 0,
    content: { nombre } as Informe['content'],
    charts: { radar: [], bar: [], numbers: [], scatters: [] },
    headers: [], rows: [], columnMap: {},
  }
}

describe('informesStore', () => {
  beforeEach(() => localStorage.clear())

  it('guarda, lista, carga y borra', () => {
    saveInforme(makeInforme('a', 'Yuri'))
    saveInforme(makeInforme('b', 'Otro'))
    const list = listInformes()
    expect(list).toHaveLength(2)
    expect(list.find(x => x.id === 'a')?.nombre).toBe('Yuri')
    expect(loadInforme('a')?.content.nombre).toBe('Yuri')
    deleteInforme('a')
    expect(listInformes()).toHaveLength(1)
    expect(loadInforme('a')).toBeNull()
  })

  it('newInformeId genera ids distintos', () => {
    expect(newInformeId()).not.toBe(newInformeId())
  })

  it('saveInforme lanza un error claro cuando se excede la cuota', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => saveInforme(makeInforme('q', 'Foto'))).toThrow(/demasiados informes/)
    spy.mockRestore()
  })
})
