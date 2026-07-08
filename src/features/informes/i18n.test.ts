import { describe, it, expect } from 'vitest'
import { t, translateMetric, translateInjury, isRtl } from './i18n'

describe('i18n t()', () => {
  it('traduce claves fijas por idioma', () => {
    expect(t('es', 'tab_general')).toBe('General')
    expect(t('en', 'tab_general')).toBe('Overview')
    expect(t('fr', 'r_agent')).toBe('Agence')
    expect(t('es', 'r_agent')).toBe('Agencia')
  })
  it('interpola variables', () => {
    expect(t('en', 'm_ratingVsPos', { pct: 80, pos: 'CB', league: 'La Liga' })).toBe('Better than 80% of CB in La Liga')
  })
  it('cae al español si falta el idioma y devuelve la clave si no existe', () => {
    expect(t('es', 'no_existe')).toBe('no_existe')
  })
})

describe('translateMetric', () => {
  it('traduce métricas conocidas (accent/case-insensitive)', () => {
    expect(translateMetric('Minutos jugados', 'en')).toBe('Minutes played')
    expect(translateMetric('Duelos ganados, %', 'en')).toBe('Duels won %')
  })
  it('devuelve el original en español o si no matchea', () => {
    expect(translateMetric('Minutos jugados', 'es')).toBe('Minutos jugados')
    expect(translateMetric('Métrica rara del archivo', 'en')).toBe('Métrica rara del archivo')
  })
})

describe('translateInjury', () => {
  it('traduce el tipo genérico "Injury" y tipos específicos al español', () => {
    expect(translateInjury('Injury', 'es')).toBe('Lesión')
    expect(translateInjury('Knee Injury', 'es')).toBe('Lesión de rodilla')
    expect(translateInjury('Hamstring', 'es')).toBe('Isquiotibiales')
    expect(translateInjury('Suspended', 'es')).toBe('Suspendido')
  })
  it('matchea lo específico antes que lo genérico y es case/accent-insensitive', () => {
    // "ankle" gana sobre el genérico "injury" aunque el texto contenga ambos.
    expect(translateInjury('ANKLE injury', 'es')).toBe('Lesión de tobillo')
    expect(translateInjury('Muscle injury', 'en')).toBe('Muscle injury')
  })
  it('deja el original si no reconoce el tipo', () => {
    expect(translateInjury('Contract dispute', 'es')).toBe('Contract dispute')
  })
})

describe('isRtl', () => {
  it('árabe es RTL, el resto no', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('es')).toBe(false)
    expect(isRtl('en')).toBe(false)
  })
})
