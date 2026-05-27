import type { PlayerMatchStat, Position, PositionMetricAverages } from '@/types/scoring'

export interface RadarMetricDef {
  key: keyof PositionMetricAverages
  label: string
  inverse?: boolean
  computePlayer: (matches: PlayerMatchStat[]) => number
}

function p90(matches: PlayerMatchStat[], field: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10)
  if (valid.length === 0) return 0
  const vals = valid.map(m => ((m[field] as number ?? 0) / m.minutes) * 90)
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function avgField(matches: PlayerMatchStat[], field: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10)
  const vals = valid.map(m => m[field] as number).filter(v => v != null && v > 0)
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

function pctField(matches: PlayerMatchStat[], num: keyof PlayerMatchStat, den: keyof PlayerMatchStat): number {
  const valid = matches.filter(m => m.minutes >= 10)
  const totN = valid.reduce((s, m) => s + ((m[num] as number) ?? 0), 0)
  const totD = valid.reduce((s, m) => s + ((m[den] as number) ?? 0), 0)
  return totD > 0 ? (totN / totD) * 100 : 0
}

export const RADAR_METRICS: Record<Position, RadarMetricDef[]> = {
  ARQ: [
    { key: 'saves_p90', label: 'Atajadas/90', computePlayer: m => p90(m, 'saves') },
    { key: 'goals_conceded_p90', label: 'GC/90', inverse: true, computePlayer: m => p90(m, 'goals_conceded') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'penalty_saved_avg', label: 'Pen. atajados', computePlayer: m => avgField(m, 'penalty_saved') },
    { key: 'clean_sheet_pct', label: 'Valla invicta %', computePlayer: m => {
      const valid = m.filter(x => x.minutes >= 10)
      return valid.length > 0 ? (valid.filter(x => x.goals_conceded === 0).length / valid.length) * 100 : 0
    }},
  ],
  CB: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'tackles_p90', label: 'Tackles/90', computePlayer: m => p90(m, 'tackles') },
    { key: 'interceptions_p90', label: 'Int./90', computePlayer: m => p90(m, 'interceptions') },
    { key: 'blocks_p90', label: 'Bloqueos/90', computePlayer: m => p90(m, 'blocks') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'passes_total_p90', label: 'Pases/90', computePlayer: m => p90(m, 'passes_total') },
  ],
  LD: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates/90', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asist./90', computePlayer: m => p90(m, 'assists') },
    { key: 'tackles_p90', label: 'Tackles/90', computePlayer: m => p90(m, 'tackles') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'interceptions_p90', label: 'Int./90', computePlayer: m => p90(m, 'interceptions') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
  ],
  LI: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates/90', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asist./90', computePlayer: m => p90(m, 'assists') },
    { key: 'tackles_p90', label: 'Tackles/90', computePlayer: m => p90(m, 'tackles') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'interceptions_p90', label: 'Int./90', computePlayer: m => p90(m, 'interceptions') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
  ],
  VC: [
    { key: 'tackles_p90', label: 'Tackles/90', computePlayer: m => p90(m, 'tackles') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'interceptions_p90', label: 'Int./90', computePlayer: m => p90(m, 'interceptions') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'passes_total_p90', label: 'Pases/90', computePlayer: m => p90(m, 'passes_total') },
    { key: 'blocks_p90', label: 'Bloqueos/90', computePlayer: m => p90(m, 'blocks') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
  ],
  VI: [
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
    { key: 'dribbles_success_p90', label: 'Regates/90', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'assists_p90', label: 'Asist./90', computePlayer: m => p90(m, 'assists') },
    { key: 'goals_p90', label: 'Goles/90', computePlayer: m => p90(m, 'goals') },
    { key: 'passes_accuracy', label: 'Pases %', computePlayer: m => avgField(m, 'passes_accuracy') },
    { key: 'shots_on_p90', label: 'Tiros al arco/90', computePlayer: m => p90(m, 'shots_on') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'tackles_p90', label: 'Tackles/90', computePlayer: m => p90(m, 'tackles') },
  ],
  EXT: [
    { key: 'dribbles_success_p90', label: 'Regates/90', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'goals_p90', label: 'Goles/90', computePlayer: m => p90(m, 'goals') },
    { key: 'assists_p90', label: 'Asist./90', computePlayer: m => p90(m, 'assists') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
    { key: 'shots_on_p90', label: 'Tiros al arco/90', computePlayer: m => p90(m, 'shots_on') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'dribbles_pct', label: 'Regates %', computePlayer: m => pctField(m, 'dribbles_success', 'dribbles_attempted') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'fouls_drawn_p90', label: 'Faltas rec./90', computePlayer: m => p90(m, 'fouls_drawn') },
  ],
  DEL: [
    { key: 'goals_p90', label: 'Goles/90', computePlayer: m => p90(m, 'goals') },
    { key: 'shots_on_p90', label: 'Tiros al arco/90', computePlayer: m => p90(m, 'shots_on') },
    { key: 'assists_p90', label: 'Asist./90', computePlayer: m => p90(m, 'assists') },
    { key: 'shots_pct', label: 'Precisión tiros %', computePlayer: m => pctField(m, 'shots_on', 'shots_total') },
    { key: 'passes_key_p90', label: 'Pases clave/90', computePlayer: m => p90(m, 'passes_key') },
    { key: 'duels_won_pct', label: 'Duelos %', computePlayer: m => pctField(m, 'duels_won', 'duels_total') },
    { key: 'rating_avg', label: 'Rating', computePlayer: m => avgField(m, 'rating') },
    { key: 'dribbles_success_p90', label: 'Regates/90', computePlayer: m => p90(m, 'dribbles_success') },
    { key: 'fouls_drawn_p90', label: 'Faltas rec./90', computePlayer: m => p90(m, 'fouls_drawn') },
  ],
}
