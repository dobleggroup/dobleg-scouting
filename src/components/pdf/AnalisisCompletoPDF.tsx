import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { EnrichedPlayer } from '@/types'

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  bg: '#111111',
  card: '#1c1c1e',
  cardAlt: '#2c2c2e',
  brand: '#22C55E',
  brandDim: 'rgba(34,197,94,0.15)',
  text: '#ffffff',
  textSec: '#c8c8c8',
  gray: '#9CA3AF',
  grayDark: '#6B7280',
  border: '#37373c',
  red: '#EF4444',
  orange: '#F97316',
  yellow: '#EAB308',
  blue: '#3B82F6',
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return C.gray
  if (s >= 7) return C.brand
  if (s >= 5) return C.yellow
  if (s >= 3) return C.orange
  return C.red
}

function scoreLabel(s: number) {
  if (s >= 7) return 'EXCELENTE'
  if (s >= 5) return 'BUENO'
  if (s >= 3) return 'REGULAR'
  return 'BAJO'
}

function footLabel(f?: string): string {
  if (!f) return '—'
  const l = f.toLowerCase()
  if (l === 'derecho' || l === 'right') return 'Diestro'
  if (l === 'izquierdo' || l === 'left') return 'Zurdo'
  if (l === 'ambos' || l === 'both') return 'Ambos'
  return f
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 28,
    fontFamily: 'Helvetica',
  },
  // Header stripe
  topStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.brand,
  },
  // Page header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: `1 solid ${C.border}`,
  },
  brandText: { fontSize: 9, color: C.grayDark, fontFamily: 'Helvetica-Bold' },
  pageTitle: { fontSize: 9, color: C.textSec },
  dateText: { fontSize: 8, color: C.grayDark },
  // Cards
  card: {
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
  },
  cardRow: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 14,
    marginBottom: 10,
    gap: 14,
  },
  // Section titles
  sectionTitle: {
    fontSize: 11,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    borderLeft: `3 solid ${C.brand}`,
    paddingLeft: 8,
  },
  sectionTitleSm: {
    fontSize: 9,
    color: C.gray,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    letterSpacing: 0.8,
  },
  // Player info
  playerName: {
    fontSize: 20,
    color: C.text,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  playerSub: {
    fontSize: 10,
    color: C.gray,
    marginBottom: 10,
  },
  // Stats row
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: { fontSize: 7, color: C.grayDark, marginBottom: 2 },
  statValue: { fontSize: 11, color: C.text, fontFamily: 'Helvetica-Bold' },
  // Score badge
  scoreBadge: {
    width: 64,
    height: 64,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreVal: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  scoreLabel: { fontSize: 7, color: C.gray, marginTop: 2 },
  // Bar chart
  barRow: { marginBottom: 10 },
  barLabel: { fontSize: 8, color: C.gray, marginBottom: 4 },
  barTrack: {
    height: 9,
    backgroundColor: C.cardAlt,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 2,
  },
  barFill: { height: '100%', borderRadius: 4 },
  barMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barValPlayer: { fontSize: 7, color: C.brand, fontFamily: 'Helvetica-Bold' },
  barValAvg: { fontSize: 7, color: C.gray },
  // League legend
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
    alignItems: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendLabel: { fontSize: 8, color: C.textSec },
  // Rankings
  rankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rankCard: {
    width: '22%',
    backgroundColor: C.cardAlt,
    borderRadius: 5,
    padding: 8,
    marginBottom: 4,
  },
  rankNum: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  rankMetric: { fontSize: 7, color: C.textSec, marginBottom: 3 },
  rankVal: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  rankAvg: { fontSize: 7, color: C.grayDark },
  // Conclusions
  conclusionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
  },
  conclusionText: { fontSize: 9, flex: 1, lineHeight: 1.5 },
  // Context row
  contextRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  contextChip: {
    backgroundColor: C.cardAlt,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  contextChipText: { fontSize: 8, color: C.textSec },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: `1 solid ${C.border}`,
    paddingTop: 6,
  },
  footerText: { fontSize: 7, color: C.grayDark },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BarDataRow {
  name: string
  jugador: number
  promedio: number
  promedio2?: number
  jugadorRaw: number | null
  promedioRaw: number | null
  promedio2Raw?: number | null
}

export interface RankingRow {
  key: string
  label: string
  rank: number
  total: number
  playerVal: number
  avg: number
}

export interface AnalisisPDFProps {
  player: EnrichedPlayer
  barData: BarDataRow[]
  radarData: { subject: string; jugador: number; promedio: number }[]
  rankings: RankingRow[]
  conclusions: {
    playerScore: number | null
    avgScore: number | null
    scoreRank: number | null
    scorePct: number | null
    poolSize: number
    top1: RankingRow[]
    top3: RankingRow[]
    above: string[]
    below: string[]
    recommendation: string
    recommendationLevel: 'green' | 'amber' | 'red' | 'neutral'
    sampleWarning: string | null
  } | null
  poolLabel: string
  pool2Label?: string
  leagueContext: {
    liga: string
    rank: number | null
    total: number
    avg: number
  } | null
  authorName?: string
}

// ─── Page header component ────────────────────────────────────────────────────

function PageHeader({ playerName }: { playerName: string }) {
  return (
    <>
      <View style={s.topStripe} />
      <View style={s.pageHeader}>
        <Text style={s.brandText}>DOBLE G SPORTS GROUP</Text>
        <Text style={s.pageTitle}>{playerName}</Text>
        <Text style={s.dateText}>{new Date().toLocaleDateString('es-AR')}</Text>
      </View>
    </>
  )
}

// ─── Footer component ─────────────────────────────────────────────────────────

function PageFooter({ author }: { author?: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Doble G Sports Group · Informe de Scouting</Text>
      {author && <Text style={s.footerText}>{author}</Text>}
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  )
}

// ─── Bar chart section ────────────────────────────────────────────────────────

function BarSection({ data, playerName, poolLabel, pool2Label }: {
  data: BarDataRow[]
  playerName: string
  poolLabel: string
  pool2Label?: string
}) {
  if (!data.length) return null

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Comparación vs promedio del grupo</Text>

      {/* Legend */}
      <View style={s.legendRow}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: C.brand }]} />
          <Text style={s.legendLabel}>{playerName}</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: C.gray, opacity: 0.6 }]} />
          <Text style={s.legendLabel}>{poolLabel}</Text>
        </View>
        {pool2Label && (
          <View style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: C.blue, opacity: 0.6 }]} />
            <Text style={s.legendLabel}>{pool2Label}</Text>
          </View>
        )}
      </View>

      {/* Bars */}
      {data.map((d, i) => (
        <View key={i} style={s.barRow}>
          <Text style={s.barLabel}>{d.name.length > 30 ? d.name.slice(0, 29) + '…' : d.name}</Text>

          {/* Player bar */}
          <View style={[s.barTrack, { marginBottom: 3 }]}>
            <View style={[s.barFill, { width: `${Math.max(1, d.jugador)}%`, backgroundColor: C.brand }]} />
          </View>

          {/* Pool 1 avg bar */}
          <View style={[s.barTrack, { height: 6, marginBottom: d.promedio2 !== undefined ? 3 : 0 }]}>
            <View style={[s.barFill, { width: `${Math.max(1, d.promedio)}%`, backgroundColor: 'rgba(148,163,184,0.55)' }]} />
          </View>

          {/* Pool 2 avg bar (if present) */}
          {d.promedio2 !== undefined && (
            <View style={[s.barTrack, { height: 6 }]}>
              <View style={[s.barFill, { width: `${Math.max(1, d.promedio2)}%`, backgroundColor: 'rgba(59,130,246,0.55)' }]} />
            </View>
          )}

          {/* Values */}
          <View style={[s.barMeta, { marginTop: 3 }]}>
            <Text style={s.barValPlayer}>{d.jugadorRaw?.toFixed(2) ?? '—'}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={s.barValAvg}>{poolLabel}: {d.promedioRaw?.toFixed(2) ?? '—'}</Text>
              {d.promedio2Raw != null && pool2Label && (
                <Text style={[s.barValAvg, { color: C.blue }]}>{pool2Label}: {d.promedio2Raw.toFixed(2)}</Text>
              )}
            </View>
          </View>
        </View>
      ))}
    </View>
  )
}

// ─── Rankings section ─────────────────────────────────────────────────────────

function RankingsSection({ rankings, playerName }: { rankings: RankingRow[]; playerName: string }) {
  if (!rankings.length) return null
  const top = rankings.slice(0, 12)
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Posicionamiento en el grupo</Text>
      <Text style={[s.barLabel, { marginBottom: 10 }]}>
        Métricas donde {playerName} se ubica en los primeros puestos del grupo.
      </Text>
      <View style={s.rankGrid}>
        {top.map((r, i) => (
          <View key={i} style={[s.rankCard, r.rank === 1 ? { backgroundColor: 'rgba(34,197,94,0.12)', borderLeft: `3 solid ${C.brand}` } : {}]}>
            <Text style={[s.rankNum, { color: r.rank === 1 ? C.brand : r.rank <= 3 ? C.textSec : C.grayDark }]}>
              {r.rank}°
            </Text>
            <Text style={s.rankMetric}>{r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label}</Text>
            <Text style={[s.rankVal, { color: r.rank === 1 ? C.brand : C.textSec }]}>{r.playerVal.toFixed(2)}</Text>
            <Text style={s.rankAvg}>prom: {r.avg.toFixed(2)}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Radar table ─────────────────────────────────────────────────────────────

function RadarTable({ data, playerName, poolLabel }: {
  data: { subject: string; jugador: number; promedio: number }[]
  playerName: string
  poolLabel: string
}) {
  if (!data.length) return null
  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Métricas seleccionadas (normalizado 0-100)</Text>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        <Text style={[s.sectionTitleSm, { flex: 2, fontSize: 8 }]}>MÉTRICA</Text>
        <Text style={[s.sectionTitleSm, { flex: 1, textAlign: 'center', fontSize: 8, color: C.brand }]}>{playerName.split(' ')[0].toUpperCase()}</Text>
        <Text style={[s.sectionTitleSm, { flex: 1, textAlign: 'center', fontSize: 8 }]}>{poolLabel.slice(0, 10).toUpperCase()}</Text>
        <Text style={[s.sectionTitleSm, { flex: 1, textAlign: 'right', fontSize: 8, color: C.grayDark }]}>DIFERENCIA</Text>
      </View>
      {data.map((d, i) => {
        const diff = d.jugador - d.promedio
        return (
          <View key={i} style={{ flexDirection: 'row', paddingVertical: 5, borderBottom: `1 solid ${C.border}` }}>
            <Text style={{ flex: 2, fontSize: 8, color: C.textSec }}>{d.subject}</Text>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: 40, height: 5, backgroundColor: C.cardAlt, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${d.jugador}%`, height: '100%', backgroundColor: C.brand }} />
              </View>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: 40, height: 5, backgroundColor: C.cardAlt, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ width: `${d.promedio}%`, height: '100%', backgroundColor: 'rgba(148,163,184,0.55)' }} />
              </View>
            </View>
            <Text style={{ flex: 1, fontSize: 8, textAlign: 'right', color: diff > 0 ? C.brand : diff < 0 ? C.orange : C.gray }}>
              {diff > 0 ? '+' : ''}{diff.toFixed(0)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

// ─── Conclusions section ──────────────────────────────────────────────────────

function ConclusionsSection({ c, playerName }: {
  c: NonNullable<AnalisisPDFProps['conclusions']>
  playerName: string
}) {
  const recBg = c.recommendationLevel === 'green' ? 'rgba(34,197,94,0.08)'
    : c.recommendationLevel === 'amber' ? 'rgba(245,158,11,0.08)'
    : c.recommendationLevel === 'red' ? 'rgba(239,68,68,0.08)'
    : C.card

  const recColor = c.recommendationLevel === 'green' ? C.brand
    : c.recommendationLevel === 'amber' ? C.yellow
    : c.recommendationLevel === 'red' ? C.red
    : C.textSec

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Análisis automático</Text>

      {c.sampleWarning && (
        <View style={{ backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 8, color: C.yellow }}>{c.sampleWarning}</Text>
        </View>
      )}

      {/* Score */}
      {c.playerScore != null && c.avgScore != null && (
        <View style={[s.conclusionRow, { backgroundColor: C.cardAlt, marginBottom: 8 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: scoreColor(c.playerScore) }}>{c.playerScore.toFixed(1)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, color: C.text, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>Score GG</Text>
            <Text style={{ fontSize: 8, color: C.gray, lineHeight: 1.4 }}>
              {c.scorePct != null ? `Percentil ${c.scorePct} del grupo (${c.scoreRank}° de ${c.poolSize}).` : `Promedio del grupo: ${c.avgScore.toFixed(1)}.`}
              {' '}{Math.abs(c.playerScore - c.avgScore) > 0.3
                ? c.playerScore > c.avgScore
                  ? `Supera el promedio por ${(c.playerScore - c.avgScore).toFixed(1)} puntos.`
                  : `Está ${Math.abs(c.playerScore - c.avgScore).toFixed(1)} puntos por debajo.`
                : 'En línea con el promedio del grupo.'
              }
            </Text>
          </View>
        </View>
      )}

      {/* Rankings highlight */}
      {c.top1.length > 0 && (
        <View style={{ backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 5, padding: 8, marginBottom: 8, borderLeft: `3 solid ${C.brand}` }}>
          <Text style={{ fontSize: 9, color: C.brand, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
            Lidera en {c.top1.length} métrica{c.top1.length > 1 ? 's' : ''}
          </Text>
          <Text style={{ fontSize: 8, color: C.textSec, lineHeight: 1.4 }}>
            {c.top1.map(r => `${r.label} (${r.playerVal.toFixed(2)})`).join(' · ')}
          </Text>
        </View>
      )}

      {/* Above / below */}
      {(c.above.length > 0 || c.below.length > 0) && (
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {c.above.length > 0 && (
            <View style={{ flex: 1, backgroundColor: 'rgba(34,197,94,0.06)', borderRadius: 5, padding: 8 }}>
              <Text style={{ fontSize: 8, color: C.brand, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
                Por encima del promedio ({c.above.length})
              </Text>
              <Text style={{ fontSize: 7.5, color: C.textSec, lineHeight: 1.4 }}>
                {c.above.slice(0, 6).join(', ')}{c.above.length > 6 ? ` y ${c.above.length - 6} más` : ''}
              </Text>
            </View>
          )}
          {c.below.length > 0 && (
            <View style={{ flex: 1, backgroundColor: C.cardAlt, borderRadius: 5, padding: 8 }}>
              <Text style={{ fontSize: 8, color: C.grayDark, fontFamily: 'Helvetica-Bold', marginBottom: 3 }}>
                Por debajo del promedio ({c.below.length})
              </Text>
              <Text style={{ fontSize: 7.5, color: C.gray, lineHeight: 1.4 }}>
                {c.below.slice(0, 5).join(', ')}{c.below.length > 5 ? ` y ${c.below.length - 5} más` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Recommendation */}
      {c.recommendation && (
        <View style={{ backgroundColor: recBg, borderRadius: 5, padding: 10, borderLeft: `3 solid ${recColor}` }}>
          <Text style={{ fontSize: 9, color: recColor, fontFamily: 'Helvetica-Bold', marginBottom: 2 }}>Evaluación</Text>
          <Text style={{ fontSize: 8.5, color: recColor, lineHeight: 1.5 }}>{c.recommendation}</Text>
        </View>
      )}
    </View>
  )
}

// ─── Main document ────────────────────────────────────────────────────────────

export default function AnalisisCompletoPDF({
  player,
  barData,
  radarData,
  rankings,
  conclusions,
  poolLabel,
  pool2Label,
  leagueContext,
  authorName,
}: AnalisisPDFProps) {
  const pName = player.Jugador

  const statsRow = [
    { label: 'EDAD', value: player.Edad ? `${player.Edad} años` : '—' },
    { label: 'ALTURA', value: player.Altura ? `${player.Altura} cm` : '—' },
    { label: 'PIE', value: footLabel(player.Pie) },
    { label: 'PARTIDOS', value: String(player['Partidos jugados'] || '—') },
    { label: 'MINUTOS', value: player.minutesPlayed ? player.minutesPlayed.toLocaleString('es-AR') : '—' },
    { label: 'LIGA', value: player.Liga || '—' },
  ]

  return (
    <Document title={`Informe Scout — ${pName}`} author="Doble G Sports Group">

      {/* ─── Page 1: Player Overview ─────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <PageHeader playerName={pName} />

        {/* Player card */}
        <View style={[s.card, { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.playerName}>{pName}</Text>
            <Text style={s.playerSub}>
              {player.Equipo || '—'}{player.Liga ? `  ·  ${player.Liga}` : ''}{player['Posición'] ? `  ·  ${player['Posición']}` : ''}
            </Text>

            {/* Stats grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {statsRow.map((stat, i) => (
                <View key={i} style={{ width: '30%', backgroundColor: C.cardAlt, borderRadius: 4, padding: '6 8', marginBottom: 4 }}>
                  <Text style={s.statLabel}>{stat.label}</Text>
                  <Text style={[s.statValue, { fontSize: 10 }]}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Score badge */}
          {player.ggScore != null && (
            <View style={[s.scoreBadge, { backgroundColor: `rgba(34,197,94,0.12)` }]}>
              <Text style={[s.scoreVal, { color: scoreColor(player.ggScore) }]}>{player.ggScore.toFixed(1)}</Text>
              <Text style={s.scoreLabel}>SCORE GG</Text>
              <Text style={{ fontSize: 8, color: scoreColor(player.ggScore), marginTop: 2 }}>{scoreLabel(player.ggScore)}</Text>
            </View>
          )}
        </View>

        {/* League context */}
        {leagueContext && player.ggScore != null && (
          <View style={[s.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }]}>
            <Text style={{ fontSize: 8, color: C.grayDark }}>Ranking en {leagueContext.liga}</Text>
            {leagueContext.rank && (
              <View style={{ backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 9, color: C.brand, fontFamily: 'Helvetica-Bold' }}>
                  {leagueContext.rank}° de {leagueContext.total}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 8, color: C.grayDark }}>
              Promedio de liga: {leagueContext.avg.toFixed(1)}
              {player.ggScore != null ? `  ·  Diferencia: ${player.ggScore > leagueContext.avg ? '+' : ''}${(player.ggScore - leagueContext.avg).toFixed(1)}` : ''}
            </Text>
          </View>
        )}

        {/* Context chips */}
        <View style={s.contextRow}>
          <View style={s.contextChip}>
            <Text style={s.contextChipText}>Contexto: {poolLabel}</Text>
          </View>
          {pool2Label && (
            <View style={[s.contextChip, { borderLeft: `3 solid ${C.blue}` }]}>
              <Text style={s.contextChipText}>También vs: {pool2Label}</Text>
            </View>
          )}
        </View>

        {/* Conclusions on page 1 */}
        {conclusions && <ConclusionsSection c={conclusions} playerName={pName} />}

        <PageFooter author={authorName} />
      </Page>

      {/* ─── Page 2: Bar chart ───────────────────────────────────────────────── */}
      {barData.length > 0 && (
        <Page size="A4" style={s.page}>
          <PageHeader playerName={pName} />
          <BarSection
            data={barData}
            playerName={pName}
            poolLabel={poolLabel}
            pool2Label={pool2Label}
          />
          {radarData.length >= 3 && (
            <RadarTable data={radarData} playerName={pName} poolLabel={poolLabel} />
          )}
          <PageFooter author={authorName} />
        </Page>
      )}

      {/* ─── Page 3: Rankings ────────────────────────────────────────────────── */}
      {rankings.length > 0 && (
        <Page size="A4" style={s.page}>
          <PageHeader playerName={pName} />
          <RankingsSection rankings={rankings} playerName={pName} />
          <PageFooter author={authorName} />
        </Page>
      )}

    </Document>
  )
}
