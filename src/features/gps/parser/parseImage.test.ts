import { describe, it, expect, vi } from 'vitest'
import { parseGpsImage } from './parseImage'
import { BASE_AGENCY_PLAYERS } from '@/constants/agencyPlayers'
import type { OcrWord } from './ocrRows'

const word = (text: string, x0: number, y0: number, x1: number, y1: number): OcrWord =>
  ({ text, bbox: { x0, y0, x1, y1 } })

let mockWords: OcrWord[] = []
let mockRecognizeError: Error | null = null
const terminate = vi.fn().mockResolvedValue(undefined)
const recognize = vi.fn().mockImplementation(async () => {
  if (mockRecognizeError) throw mockRecognizeError
  return { data: { words: mockWords } }
})
const createWorker = vi.fn().mockImplementation(async () => ({ recognize, terminate }))

vi.mock('tesseract.js', () => ({
  createWorker: (...args: unknown[]) => createWorker(...args),
}))

describe('parseGpsImage', () => {
  it('tira un error claro si el OCR no reconoce texto', async () => {
    mockWords = []
    mockRecognizeError = null

    await expect(
      parseGpsImage(new Blob(), { roster: BASE_AGENCY_PLAYERS, lookup: {} }),
    ).rejects.toThrow('No se reconoció texto en la imagen')
  })

  it('tira un error claro si el motor de OCR falla', async () => {
    mockWords = []
    mockRecognizeError = new Error('no se pudo cargar el modelo')

    await expect(
      parseGpsImage(new Blob(), { roster: BASE_AGENCY_PLAYERS, lookup: {} }),
    ).rejects.toThrow('No se pudo leer la imagen')
  })

  it('sin jugador elegido, tira un error claro para una tarjeta de un solo jugador (sin tabla)', async () => {
    mockRecognizeError = null
    mockWords = [
      word('DISTANCE', 20, 400, 100, 420),
      word('10480', 20, 440, 90, 460),
    ]

    await expect(
      parseGpsImage(new Blob(), { roster: BASE_AGENCY_PLAYERS, lookup: {} }),
    ).rejects.toThrow('elegilo arriba')
  })

  it('con el jugador elegido, lee la tarjeta de un solo jugador tipo PlayerTek', async () => {
    mockRecognizeError = null
    mockWords = [
      word('DISTANCE', 20, 400, 100, 420),
      word('HSR', 300, 400, 340, 420),
      word('DISTANCE', 346, 400, 430, 420),
      word('10480', 20, 440, 90, 460),
      word('458', 300, 440, 340, 460),
      word('MAX', 20, 500, 70, 520),
      word('SPEED', 76, 500, 150, 520),
      word('SPRINTS', 300, 500, 380, 520),
      word('27.3', 20, 540, 70, 560),
      word('3', 300, 540, 310, 560),
    ]

    const result = await parseGpsImage(new Blob(), {
      roster: BASE_AGENCY_PLAYERS,
      lookup: {},
      presetPlayerName: 'Santiago Cartagena',
    })

    expect(result.players).toHaveLength(1)
    expect(result.players[0].rawName).toBe('Santiago Cartagena')
    expect(result.players[0].candidates).toEqual(['Santiago Cartagena'])

    const distIdx = result.columns.findIndex(c => c.header === 'DISTANCE')
    const maxSpeedIdx = result.columns.findIndex(c => c.header === 'MAX SPEED')
    expect(result.players[0].values[distIdx]).toBe(10480)
    expect(result.players[0].values[maxSpeedIdx]).toBe(27.3)

    expect(terminate).toHaveBeenCalled()
  })
})
