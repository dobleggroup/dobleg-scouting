import { describe, expect, it } from 'vitest'
import { guessCommentKind } from './meetingFromComment'

describe('guessCommentKind', () => {
  it('videollamada = reunión online', () => {
    expect(guessCommentKind('sin representante ( videollamada ) sumar a GERA GUILLE O GASTON')).toEqual({ kind: 'reunion_online', city: null })
  })
  it('reunión en una ciudad = reunión presencial con la ciudad', () => {
    expect(guessCommentKind('segunda reunión en cordoba ( visto por GERA GUILLE y FEDE )')).toEqual({ kind: 'reunion_presencial', city: 'Cordoba' })
    expect(guessCommentKind('Nos juntamos en Mar del Plata con el padre')).toEqual({ kind: 'reunion_presencial', city: 'Mar del Plata' })
    expect(guessCommentKind('Reunión en San Lorenzo con el representante')).toEqual({ kind: 'reunion_presencial', city: 'San Lorenzo' })
  })
  it('reunión sin ciudad', () => {
    expect(guessCommentKind('Tuvimos reunión con el papá')).toEqual({ kind: 'reunion_presencial', city: null })
  })
  it('llamada o mensaje = contacto', () => {
    expect(guessCommentKind('Le escribí por WhatsApp al representante')).toEqual({ kind: 'contacto', city: null })
    expect(guessCommentKind('Hablé con el padre por teléfono')).toEqual({ kind: 'contacto', city: null })
  })
  it('un comentario cualquiera queda como comentario', () => {
    expect(guessCommentKind('Muy buen partido, rápido y con gol')).toEqual({ kind: 'comentario', city: null })
  })
})
