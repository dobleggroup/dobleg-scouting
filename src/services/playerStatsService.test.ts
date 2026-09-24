import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildScoreLookup, currentSeasons, dedupeSeasonScoresByPosition, dedupeTeamsByName, type ScoreLookupRow } from './playerStatsService'
import type { PlayerSeasonScore } from '@/types/scoring'

const row = (over: Partial<ScoreLookupRow> & Pick<ScoreLookupRow, 'player_id' | 'name'>): ScoreLookupRow => ({
  current_team_id: null, transfermarkt_id: null, birth_date: null,
  team_name: null, team_logo: null,
  score: 5, position: 'VC', primary_position: null, percentile: 50, matches_played: 1, season: 2026,
  ...over,
})

const seasonScore = (
  over: Partial<PlayerSeasonScore> & Pick<PlayerSeasonScore, 'player_id' | 'season' | 'position'>,
): PlayerSeasonScore => ({
  league_id: 1, matches_played: 1, avg_score: 5, avg_rating: null,
  total_goals: 0, total_assists: 0, percentile: null, global_percentile: null,
  tackles_p90: null, interceptions_p90: null, blocks_p90: null, duels_won_pct: null,
  passes_accuracy: null, passes_key_p90: null, passes_total_p90: null,
  dribbles_success_p90: null, dribbles_pct: null, shots_on_p90: null, shots_pct: null,
  goals_p90: null, assists_p90: null, fouls_drawn_p90: null, saves_p90: null,
  goals_conceded_p90: null, penalty_saved_avg: null, clean_sheet_pct: null,
  ...over,
})

describe('buildScoreLookup', () => {
  it('con nombres únicos, arma el mapa directo', () => {
    const rows = [row({ player_id: 1, name: 'Alexis Steimbach', matches_played: 10 })]
    const map = buildScoreLookup(rows, [])
    expect(map.get('alexis steimbach')?.player_id).toBe(1)
  })

  it('duplicado de la misma persona (API-Football vs Sofascore): gana quien jugó más', () => {
    const rows = [
      row({ player_id: 1, name: 'Juan Postigo', matches_played: 5 }),
      row({ player_id: 2, name: 'Juan Postigo', matches_played: 12 }),
    ]
    const map = buildScoreLookup(rows, [])
    expect(map.get('juan postigo')?.player_id).toBe(2)
  })

  it('dos personas distintas con el mismo nombre: el equipo de la agencia desempata, no los partidos jugados', () => {
    // Caso real: "Julián López" de Defensa y Justicia (agencia, apiTeamId 442, pocos
    // partidos por lesión/suplencia) vs otro "Julián López" de una liga menor que
    // jugó mucho más este semestre. Sin desambiguar por equipo, gana el que no es.
    const rows = [
      row({ player_id: 5917, name: 'Julián López', current_team_id: 442, matches_played: 3 }),
      row({ player_id: 22036647, name: 'Julián López', current_team_id: 20255426, matches_played: 15 }),
    ]
    const agencyPlayers = [{ fullName: 'Julián López', shortName: 'J. López', apiTeamId: 442 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('julian lopez')?.player_id).toBe(5917)
  })

  it('agrega también la key del shortName de la agencia', () => {
    const rows = [row({ player_id: 1, name: 'Julián López', current_team_id: 442, matches_played: 3 })]
    const agencyPlayers = [{ fullName: 'Julián López', shortName: 'J. López', apiTeamId: 442 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('j. lopez')?.player_id).toBe(1)
  })

  it('sin match de equipo para el jugador de la agencia, no rompe: sigue el heurístico de partidos jugados', () => {
    const rows = [
      row({ player_id: 1, name: 'Julián López', current_team_id: 999, matches_played: 3 }),
      row({ player_id: 2, name: 'Julián López', current_team_id: 888, matches_played: 15 }),
    ]
    const agencyPlayers = [{ fullName: 'Julián López', shortName: 'J. López', apiTeamId: 442 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('julian lopez')?.player_id).toBe(2)
  })

  it('mismo jugador con un fragmento de 1 partido en el mismo equipo: no debe pisar el score real con el del fragmento (caso real José Paradela)', () => {
    // Caso real: José Paradela (Cruz Azul, agencia apiTeamId 2295) tiene 31 partidos
    // en VI con score 6.5, pero su id de API-Football también quedó con una fila
    // fragmentada de 1 solo partido detectado como EXT y score 4.2 (misma persona,
    // mismo equipo, mismo transfermarkt_id). El fragmento va primero en el array a
    // propósito, para reproducir el orden real que vino de la consulta.
    const rows = [
      row({ player_id: 6441, name: 'José Paradela', current_team_id: 2295, transfermarkt_id: 639152, matches_played: 1, score: 4.2, position: 'EXT' }),
      row({ player_id: 6441, name: 'José Paradela', current_team_id: 2295, transfermarkt_id: 639152, matches_played: 31, score: 6.5, position: 'VI' }),
      row({ player_id: 20944623, name: 'José Paradela', current_team_id: 20001947, transfermarkt_id: 639152, matches_played: 8, score: 7.7, position: 'VI' }),
    ]
    const agencyPlayers = [{ fullName: 'José Paradela', shortName: 'J. Paradela', apiTeamId: 2295 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('jose paradela')?.score).toBe(6.5)
    expect(map.get('jose paradela')?.matches_played).toBe(31)
  })

  it('temporada nueva con pocos partidos en posición ocasional no tapa la posición real del jugador (caso real José Paradela, EXT 2026 vs VI 2025)', () => {
    // Caso real: José Paradela jugó 34 partidos como VI en 2025 (su posición de
    // siempre, primary_position='VI') y apenas 3 como EXT en 2026. Sin el desempate
    // por posición, la fila de 2026 ganaba solo por ser más nueva (mismo criterio que
    // ya usaba el caso Julián López de más abajo), mostrando 6.3 en la lista mientras
    // la ficha individual mostraba 7.0 (busca por primary_position, no por temporada
    // más nueva a secas).
    const rows = [
      row({ player_id: 6441, name: 'José Paradela', season: 2026, position: 'EXT', primary_position: 'VI', matches_played: 3, score: 6.3 }),
      row({ player_id: 6441, name: 'José Paradela', season: 2025, position: 'VI', primary_position: 'VI', matches_played: 34, score: 7.0 }),
    ]
    const map = buildScoreLookup(rows, [])

    expect(map.get('jose paradela')?.score).toBe(7.0)
    expect(map.get('jose paradela')?.matches_played).toBe(34)
  })

  it('mismo transfermarkt_id, equipos distintos (API-Football desactualizado vs Sofascore al día): igual se fusionan como una sola identidad', () => {
    // El id de Sofascore de un jugador puede tener el `current_team_id` distinto del
    // id de API-Football (uno de los dos syncs se actualiza primero tras un
    // traspaso). El id de Transfermarkt no cambia: es la señal de identidad
    // confiable, no el equipo.
    const rows = [
      row({ player_id: 100, name: 'Nahuel Duplicado', current_team_id: 111, transfermarkt_id: 555, matches_played: 4 }),
      row({ player_id: 200, name: 'Nahuel Duplicado', current_team_id: 222, transfermarkt_id: 555, matches_played: 9 }),
    ]
    const map = buildScoreLookup(rows, [])
    expect(map.get('nahuel duplicado')?.player_id).toBe(200)
  })

  it('mismo transfermarkt_id pero SIN confirmar (nombres incompatibles, del saneamiento de datos): NO se fusiona', () => {
    // Caso real de la auditoría: 107/103 grupos donde Transfermarkt le asignó el mismo
    // id a dos personas distintas (ej. "Danilo" / "Danilo Santos", "Anthony Bedoya" /
    // "Moisés Caicedo"). `transfermarkt_id_confirmed: false` es justamente la señal de
    // "este id está bajo sospecha, no se validó por nombre+fecha de nacimiento" — sin
    // ella, este caso se fusionaba en vivo (mismo bug que motivó todo el saneamiento).
    const rows = [
      row({ player_id: 300, name: 'Danilo', transfermarkt_id: 999, transfermarkt_id_confirmed: false, matches_played: 4, score: 5.0 }),
      row({ player_id: 400, name: 'Danilo Santos', transfermarkt_id: 999, transfermarkt_id_confirmed: false, matches_played: 9, score: 7.0 }),
    ]
    const map = buildScoreLookup(rows, [])
    // Cada uno queda con su propia entrada — nunca se mezclan sus scores.
    expect(map.get('danilo')?.player_id).toBe(300)
    expect(map.get('danilo')?.score).toBe(5.0)
    expect(map.get('danilo santos')?.player_id).toBe(400)
    expect(map.get('danilo santos')?.score).toBe(7.0)
  })

  it('dos personas reales con el mismo nombre, sin equipo de agencia conocido: transfermarkt_id/fecha de nacimiento alcanzan para separarlas', () => {
    // Antes esto dependía por completo del apiTeamId del jugador de agencia. Con
    // identidad real (transfermarkt_id/fecha de nacimiento) alcanza para no
    // mezclarlos, sin necesitar ese dato adicional.
    const rows = [
      row({ player_id: 5917, name: 'Julián López', transfermarkt_id: 625203, birth_date: '2000-01-08', matches_played: 3 }),
      row({ player_id: 22036647, name: 'Julián López', transfermarkt_id: 554435, birth_date: '1991-09-14', matches_played: 15 }),
    ]
    // Sin agencyPlayers: nadie desempata por equipo, y aun así no se mezclan.
    const map = buildScoreLookup(rows, [])
    // Gana por partidos jugados entre identidades reales distintas (comportamiento
    // esperado sin más contexto) — lo importante es que NO fusiona ambas en una.
    expect(map.get('julian lopez')?.player_id).toBe(22036647)
    expect(map.get('julian lopez')?.matches_played).toBe(15)
  })

  it('jugador de agencia recién transferido: el equipo nuevo con MENOS partidos gana al equipo viejo con MÁS (caso real Mauricio Vera)', () => {
    // Caso real: Mauricio Vera se transfirió a Bhayangkara FC (apiTeamId 2443). Su
    // fila vieja (Nacional, Sofascore) tiene 4 partidos y score 3.9; su fila nueva
    // (Bhayangkara, API-Football) recién tiene 2 partidos y score 6.8. Antes de este
    // fix, el paso 1 (identidad por transfermarkt_id) se quedaba con la fila de más
    // partidos — la vieja — y la descartaba de `representatives`, así que el
    // desempate por equipo del paso 2 nunca llegaba a verla: la lista mostraba 3.9
    // mientras la ficha individual (que resuelve distinto) mostraba el 6.8 correcto.
    const rows = [
      row({ player_id: 21022801, name: 'Mauricio Vera', current_team_id: 20003230, transfermarkt_id: 697408, matches_played: 4, score: 3.9 }),
      row({ player_id: 133613, name: 'Mauricio Vera', current_team_id: 2443, transfermarkt_id: 697408, matches_played: 2, score: 6.8 }),
    ]
    const agencyPlayers = [{ fullName: 'Mauricio Vera', shortName: 'M. Vera', apiTeamId: 2443 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('mauricio vera')?.player_id).toBe(133613)
    expect(map.get('mauricio vera')?.score).toBe(6.8)
  })

  it('mismo caso, orden de filas invertido: el resultado no depende de qué fila aparece primero', () => {
    const rows = [
      row({ player_id: 133613, name: 'Mauricio Vera', current_team_id: 2443, transfermarkt_id: 697408, matches_played: 2, score: 6.8 }),
      row({ player_id: 21022801, name: 'Mauricio Vera', current_team_id: 20003230, transfermarkt_id: 697408, matches_played: 4, score: 3.9 }),
    ]
    const agencyPlayers = [{ fullName: 'Mauricio Vera', shortName: 'M. Vera', apiTeamId: 2443 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('mauricio vera')?.player_id).toBe(133613)
  })

  it('mismo jugador, mismo equipo, dos temporadas: gana la más nueva aunque tenga menos partidos (caso real Julián López)', () => {
    // Caso real: Julián López (Defensa y Justicia, sin traspaso de por medio) tiene
    // 9 partidos/score 5.0 en la temporada 2025 y sólo 6 partidos/score 4.8 en 2026.
    // La ficha individual (dedupeSeasonScoresByPosition) ya prioriza la temporada más
    // nueva; antes de este fix, el paso 1 de acá elegía por partidos jugados nomás,
    // así que la lista mostraba el 5.0 de 2025 mientras la ficha mostraba el 4.8 de
    // 2026 — mismo jugador, dos scores distintos según dónde lo mires.
    const rows = [
      row({ player_id: 5917, name: 'Julián López', current_team_id: 442, matches_played: 9, score: 5.0, season: 2025 }),
      row({ player_id: 5917, name: 'Julián López', current_team_id: 442, matches_played: 6, score: 4.8, season: 2026 }),
    ]
    const agencyPlayers = [{ fullName: 'Julián López', shortName: 'J. López', apiTeamId: 442 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('julian lopez')?.score).toBe(4.8)
    expect(map.get('julian lopez')?.matches_played).toBe(6)
  })

  it('mismo caso sin equipo de agencia conocido: la temporada más nueva sigue ganando', () => {
    const rows = [
      row({ player_id: 5917, name: 'Julián López', current_team_id: 442, matches_played: 9, score: 5.0, season: 2025 }),
      row({ player_id: 5917, name: 'Julián López', current_team_id: 442, matches_played: 6, score: 4.8, season: 2026 }),
    ]

    const map = buildScoreLookup(rows, [])

    expect(map.get('julian lopez')?.score).toBe(4.8)
  })

  it('fila oficial con nombre abreviado: el vínculo de la agencia la encuentra por id (caso real Franco Watson = "F. Watson")', () => {
    const rows = [row({ player_id: 202082, name: 'F. Watson', current_team_id: 446, matches_played: 21, score: 6.2 })]
    const agencyPlayers = [{ fullName: 'Franco Watson', shortName: 'F. Watson', apiTeamId: 446 }]
    const links = new Map([['franco watson', 202082]])

    const map = buildScoreLookup(rows, agencyPlayers, links)

    expect(map.get('franco watson')?.score).toBe(6.2)
    expect(map.get('f. watson')?.player_id).toBe(202082)
  })

  it('el vínculo por id le gana a un homónimo con más partidos', () => {
    const rows = [
      row({ player_id: 129877, name: 'Francesco Lo Celso', current_team_id: 1, matches_played: 3, score: 6.4 }),
      row({ player_id: 777, name: 'Francesco Lo Celso', current_team_id: 2, matches_played: 30, score: 7.5 }),
    ]
    const agencyPlayers = [{ fullName: 'Francesco Lo Celso', shortName: 'F. Lo Celso', apiTeamId: null }]

    const map = buildScoreLookup(rows, agencyPlayers, new Map([['francesco lo celso', 129877]]))

    expect(map.get('francesco lo celso')?.player_id).toBe(129877)
  })

  it('sin vínculo: el nombre abreviado sirve si coincide el equipo (caso real Mateo Carabajal = "M. Carabajal")', () => {
    const rows = [row({ player_id: 5196, name: 'M. Carabajal', current_team_id: 478, matches_played: 28, score: 7.1 })]
    const agencyPlayers = [{ fullName: 'Mateo Carabajal', shortName: 'M. Carabajal', apiTeamId: 478 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('mateo carabajal')?.player_id).toBe(5196)
  })

  it('sin vínculo ni equipo que coincida: un nombre abreviado compartido NO se asigna (F. Paradela = Federico o Francesco)', () => {
    const rows = [row({ player_id: 313080, name: 'F. Paradela', current_team_id: 999, matches_played: 9 })]
    const agencyPlayers = [{ fullName: 'Francesco Paradela', shortName: 'F. Paradela', apiTeamId: 434 }]

    const map = buildScoreLookup(rows, agencyPlayers)

    expect(map.get('francesco paradela')).toBeUndefined()
  })
})

describe('currentSeasons', () => {
  afterEach(() => vi.useRealTimers())

  it('en agosto (temporada europea recién arrancada) sigue incluyendo el año anterior', () => {
    // Caso real: 2026-08-01. Prestianni (Benfica), Palacios (Al Ain) y otros quedaban
    // sin score porque la función vieja devolvía sólo [2026] y su fila vigente
    // todavía estaba en season=2025 (la 2025/26 europea, en curso).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01'))
    expect(currentSeasons()).toEqual([2025, 2026])
  })

  it('a mitad de temporada europea (marzo) también incluye ambos años', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15'))
    expect(currentSeasons()).toEqual([2025, 2026])
  })

  it('en diciembre incluye el año en curso y el anterior', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-20'))
    expect(currentSeasons()).toEqual([2025, 2026])
  })
})

describe('dedupeSeasonScoresByPosition', () => {
  it('sin filas repetidas, las deja igual', () => {
    const scores = [
      seasonScore({ player_id: 1, season: 2026, position: 'EXT' }),
      seasonScore({ player_id: 1, season: 2026, position: 'VC' }),
    ]
    expect(dedupeSeasonScoresByPosition(scores)).toHaveLength(2)
  })

  it('caso real Santiago Montiel: dos filas EXT (2025 y 2026) -- se queda con la de 2026', () => {
    // currentSeasons() trae [2025, 2026] por diseño (ver test de arriba), asi que un
    // jugador con datos en ambos anos para la misma posicion trae 2 filas -- sin
    // deduplicar, "Score por posicion" las mostraba como si fueran dos posiciones
    // distintas en vez de la misma posicion en dos temporadas.
    const scores = [
      seasonScore({ player_id: 265973, season: 2025, position: 'EXT', matches_played: 7, avg_score: 5.4 }),
      seasonScore({ player_id: 265973, season: 2026, position: 'EXT', matches_played: 6, avg_score: 6.1 }),
    ]
    const deduped = dedupeSeasonScoresByPosition(scores)
    expect(deduped).toHaveLength(1)
    expect(deduped[0]).toMatchObject({ season: 2026, avg_score: 6.1 })
  })

  it('temporada mas nueva gana sin importar el orden de entrada', () => {
    const scores = [
      seasonScore({ player_id: 1, season: 2026, position: 'EXT', avg_score: 6.1 }),
      seasonScore({ player_id: 1, season: 2025, position: 'EXT', avg_score: 5.4 }),
    ]
    expect(dedupeSeasonScoresByPosition(scores)[0].season).toBe(2026)
  })
})

describe('dedupeTeamsByName', () => {
  // Bug real reportado 2026-08-26: el buscador de club de Mercado mostraba
  // "CA Talleres" (Sofascore, prefijo) y "Talleres Cordoba" (API-Football,
  // sufijo con la ciudad) como si fueran dos clubes distintos -- el
  // normalizado simple por prefijo no los hacia matchear entre si.
  it('detecta el mismo club cuando una fuente agrega el prefijo del tipo de club y la otra la ciudad como sufijo', () => {
    const teams = [
      { id: 20003210, name: 'CA Talleres', league_id: 128 },
      { id: 456, name: 'Talleres Cordoba', league_id: 128 },
    ]
    const result = dedupeTeamsByName(teams)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(456) // gana el id de API-Football (< 20000000)
  })

  it('no fusiona clubes de nombre parecido en ligas distintas (paises distintos)', () => {
    const teams = [
      { id: 1, name: 'River Plate', league_id: 128 }, // Argentina
      { id: 2, name: 'River Plate', league_id: 268 }, // Uruguay
    ]
    expect(dedupeTeamsByName(teams)).toHaveLength(2)
  })

  it('no fusiona clubes con nombres distintos dentro de la misma liga', () => {
    const teams = [
      { id: 1, name: 'Manchester United', league_id: 39 },
      { id: 2, name: 'Manchester City', league_id: 39 },
    ]
    expect(dedupeTeamsByName(teams)).toHaveLength(2)
  })

  it('detecta el caso clasico de prefijo compartido (CA Independiente vs Independiente)', () => {
    const teams = [
      { id: 20000001, name: 'CA Independiente', league_id: 128 },
      { id: 453, name: 'Independiente', league_id: 128 },
    ]
    const result = dedupeTeamsByName(teams)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(453)
  })

  // Bug real encontrado 2026-09-01 en Mercado ("Nueva busqueda" mostraba
  // "River Plate" duplicado dos veces): mismo club real con league_id
  // distinto en cada fuente (liga domestica vs copa nacional) -- agrupar
  // solo por league_id los dejaba en buckets distintos y nunca se comparaban.
  it('fusiona el mismo club cuando aparece con league_id distinto (liga vs copa) del mismo pais', () => {
    const teams = [
      { id: 435, name: 'River Plate', league_id: 130, country: 'Argentina' }, // Copa Argentina
      { id: 20003211, name: 'River Plate', league_id: 128, country: 'Argentina' }, // Liga Profesional
    ]
    const result = dedupeTeamsByName(teams)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe(435) // gana el id de API-Football (< 20000000)
  })

  it('sigue sin fusionar paises distintos aunque se provea country', () => {
    const teams = [
      { id: 1, name: 'River Plate', league_id: 128, country: 'Argentina' },
      { id: 2, name: 'River Plate', league_id: 268, country: 'Uruguay' },
    ]
    expect(dedupeTeamsByName(teams)).toHaveLength(2)
  })
})
