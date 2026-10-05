import { describe, it, expect } from 'vitest'
import { prepareOcrImage } from './prepareOcrImage'

const px = (...rgb: number[][]) => new Uint8ClampedArray(rgb.flatMap(c => [...c, 255]))

describe('prepareOcrImage', () => {
  it('en fondo oscuro deja sólo el texto blanco, en negro', () => {
    const data = px([16, 64, 96], [16, 64, 96], [255, 255, 255], [106, 163, 200], [16, 64, 96], [16, 64, 96], [16, 64, 96], [16, 64, 96])
    expect(prepareOcrImage(data)).toBe(true)
    expect([data[0], data[8], data[12]]).toEqual([255, 0, 255])
  })

  it('no toca una página clara', () => {
    const data = px([250, 250, 250], [0, 0, 0])
    expect(prepareOcrImage(data)).toBe(false)
    expect(data[0]).toBe(250)
  })
})
