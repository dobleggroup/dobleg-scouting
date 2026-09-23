import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseTmDebuts, judgeDebut, isSeniorDebut } from './tm-debuts.ts'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8')

describe('parseTmDebuts', () => {
  it('lee sección, competición y fecha de cada fila', () => {
    const entries = parseTmDebuts(fixture('tm_debuts_domina.html'))
    expect(entries).toContainEqual({ section: 'First Tier', competition: 'Professional Football League', date: '2023-01-31' })
    expect(entries).toContainEqual({ section: 'Domestic Cup', competition: 'Copa Argentina', date: '2023-05-10' })
    expect(entries.find(e => e.section === 'Youth league')).toBeTruthy()
  })

  it('juveniles, reserva y selecciones juveniles no cuentan como debut profesional', () => {
    const suarez = parseTmDebuts(fixture('tm_debuts_suarez.html'))
    const youth = suarez.filter(e => e.section === 'Youth league')
    expect(youth.length).toBeGreaterThan(0)
    expect(youth.every(e => !isSeniorDebut(e))).toBe(true)
    const rodriguez = parseTmDebuts(fixture('tm_debuts_lrodriguez.html'))
    expect(rodriguez.find(e => /U20/.test(e.competition))).toBeTruthy()
    expect(rodriguez.filter(isSeniorDebut).map(e => e.date).sort()[0]).toBe('2026-08-27')
  })

  it('página sin tabla: sin entradas', () => {
    expect(parseTmDebuts('<html><body>nada</body></html>')).toEqual([])
  })
})

describe('judgeDebut', () => {
  it('Dómina: debutó en 2023, la alerta de 2026 es falsa', () => {
    expect(judgeDebut('2026-09-13', parseTmDebuts(fixture('tm_debuts_domina.html'))))
      .toEqual({ status: 'rejected', tmDebut: '2023-01-31' })
  })
  it('Javier Suárez: debutó en Liga MX en julio de 2025', () => {
    expect(judgeDebut('2026-08-17', parseTmDebuts(fixture('tm_debuts_suarez.html'))).status).toBe('rejected')
  })
  it('Bautista Fernández: debutó 4 semanas antes de lo que teníamos -> se corrige la fecha', () => {
    expect(judgeDebut('2026-09-13', parseTmDebuts(fixture('tm_debuts_bfernandez.html'))))
      .toEqual({ status: 'adjusted', tmDebut: '2026-08-16' })
  })
  it('Luciano Rodríguez: debut en copa 3 semanas antes -> se corrige la fecha', () => {
    expect(judgeDebut('2026-09-20', parseTmDebuts(fixture('tm_debuts_lrodriguez.html'))))
      .toEqual({ status: 'adjusted', tmDebut: '2026-08-27' })
  })
  it('Alcalá: ya jugaba profesional en MLS Next Pro (2023)', () => {
    expect(judgeDebut('2026-08-16', parseTmDebuts(fixture('tm_debuts_alcala.html'))).status).toBe('rejected')
  })
  it('sin debut profesional en Transfermarkt (todavía no lo cargaron): se confirma con nuestro dato', () => {
    expect(judgeDebut('2026-09-13', [{ section: 'Youth league', competition: 'Liga MX U21', date: '2025-01-01' }]))
      .toEqual({ status: 'confirmed', tmDebut: null })
  })
  it('mismo día que el nuestro: confirmado', () => {
    expect(judgeDebut('2026-09-13', [{ section: 'First Tier', competition: 'Torneo Clausura', date: '2026-09-13' }]))
      .toEqual({ status: 'confirmed', tmDebut: '2026-09-13' })
  })
})
