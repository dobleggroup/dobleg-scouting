/**
 * InformeCanvaCard — tarjeta visual 1120×630px para exportar como PNG y pegar en Canva.
 * Diseño: jugador a la izquierda + gauge Score GG + barra comparativa a la derecha.
 * Usa SOLO inline styles para compatibilidad total con html2canvas.
 */

import type { EnrichedPlayer } from '@/types'
import type { BarDataRow } from './AnalisisCompletoPDF'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InformeCanvaCardProps {
  player: EnrichedPlayer
  barData: BarDataRow[]          // Usamos jugadorRaw/promedioRaw/promedio2Raw
  poolLabel: string
  pool2Label?: string
  leagueContext: { liga: string; rank: number | null; total: number; avg: number } | null
}

// ─── Colors ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 80) return '#34D399'
  if (s >= 55) return '#10B981'
  if (s >= 35) return '#F59E0B'
  if (s >= 20) return '#F97316'
  return '#EF4444'
}

function scoreLabel(s: number, avg?: number | null): string {
  if (s >= 80) return 'ÉLITE'
  if (avg != null) {
    if (s >= avg) return 'SOBRE EL PROMEDIO'
    if (s >= avg * 0.85) return 'CERCA DEL PROMEDIO'
    if (s >= avg * 0.70) return 'BAJO EL PROMEDIO'
    return 'MUY BAJO'
  }
  if (s >= 55) return 'BUENO'
  if (s >= 35) return 'PROMEDIO'
  if (s >= 20) return 'BAJO'
  return 'CRÍTICO'
}

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function footLabel(f?: string): string {
  if (!f) return '—'
  const l = f.toLowerCase()
  if (l === 'derecho' || l === 'right') return 'Diestro'
  if (l === 'izquierdo' || l === 'left') return 'Zurdo'
  if (l === 'ambos' || l === 'both') return 'Ambos'
  return f
}

// ─── Gauge SVG ────────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToCartesian(cx, cy, r, startDeg)
  const e = polarToCartesian(cx, cy, r, endDeg)
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function GaugeSVG({ score, avg }: { score: number; avg?: number | null }) {
  const cx = 100, cy = 90, r = 64, sw = 9
  const startDeg = 135, fullArc = 270
  const color = scoreColor(score)
  const valueDeg = startDeg + (Math.max(0, Math.min(100, score)) / 100) * fullArc
  const avgDeg = avg != null ? startDeg + (Math.max(0, Math.min(100, avg)) / 100) * fullArc : null

  // Needle
  const needleRad = ((valueDeg - 90) * Math.PI) / 180
  const needleLen = r - 14
  const tipX = cx + needleLen * Math.cos(needleRad)
  const tipY = cy + needleLen * Math.sin(needleRad)
  const baseR = 5
  const b1 = { x: cx + baseR * Math.cos(needleRad + Math.PI / 2), y: cy + baseR * Math.sin(needleRad + Math.PI / 2) }
  const b2 = { x: cx + baseR * Math.cos(needleRad - Math.PI / 2), y: cy + baseR * Math.sin(needleRad - Math.PI / 2) }

  return (
    <svg width="200" height="170" viewBox="0 0 200 170" style={{ display: 'block' }}>
      {/* Track */}
      <path d={arcPath(cx, cy, r, startDeg, startDeg + fullArc)} stroke="rgba(255,255,255,0.1)" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Colored zones */}
      {[
        { s: 0, e: 20, c: '#EF4444' },
        { s: 20, e: 35, c: '#F97316' },
        { s: 35, e: 55, c: '#F59E0B' },
        { s: 55, e: 80, c: '#10B981' },
        { s: 80, e: 100, c: '#34D399' },
      ].map((z, i) => (
        <path key={i}
          d={arcPath(cx, cy, r, startDeg + (z.s / 100) * fullArc, startDeg + (z.e / 100) * fullArc)}
          stroke={z.c} strokeWidth={sw + 18} fill="none" strokeLinecap="butt" opacity={0.08}
        />
      ))}
      {/* Value arc */}
      {score > 0 && (
        <path d={arcPath(cx, cy, r, startDeg, valueDeg)} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
      )}
      {/* Avg marker */}
      {avgDeg && (() => {
        const pi = polarToCartesian(cx, cy, r - sw / 2 - 8, avgDeg)
        const po = polarToCartesian(cx, cy, r + sw / 2 + 8, avgDeg)
        return <line x1={pi.x} y1={pi.y} x2={po.x} y2={po.y} stroke="rgba(255,255,255,0.4)" strokeWidth={2.5} strokeLinecap="round" />
      })()}
      {/* Tick labels */}
      {[0, 50, 100].map(v => {
        const deg = startDeg + (v / 100) * fullArc
        const lp = polarToCartesian(cx, cy, r + sw / 2 + 18, deg)
        return (
          <text key={v} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
            style={{ fontSize: 9, fill: '#4B5563', fontFamily: 'Arial, sans-serif' }}>{v}</text>
        )
      })}
      {/* Center */}
      <circle cx={cx} cy={cy} r={10} fill="#1c1c1e" />
      <circle cx={cx} cy={cy} r={5} fill="#0f0f11" />
      {/* Needle */}
      <polygon points={`${tipX.toFixed(2)},${tipY.toFixed(2)} ${b1.x.toFixed(2)},${b1.y.toFixed(2)} ${b2.x.toFixed(2)},${b2.y.toFixed(2)}`} fill={color} />
      <circle cx={cx} cy={cy} r={4} fill={color} />
      {/* Score text */}
      <text x={cx} y={cy + r + 28} textAnchor="middle"
        style={{ fontSize: 34, fontWeight: 900, fill: color, fontFamily: 'Arial, sans-serif', letterSpacing: -1 }}>
        {Math.round(score)}
      </text>
    </svg>
  )
}

// ─── Bar row (HTML divs, no SVG — renders perfectly with html2canvas) ─────────

function BarRow({ label, playerRaw, avgRaw, avg2Raw, globalMax, playerColor, avgColor, avg2Color }: {
  label: string
  playerRaw: number | null
  avgRaw: number | null
  avg2Raw?: number | null
  globalMax: number
  playerColor: string
  avgColor: string
  avg2Color?: string
}) {
  const maxBarW = 420
  const pW = playerRaw != null && globalMax > 0 ? Math.max(2, (playerRaw / globalMax) * maxBarW) : 0
  const aW = avgRaw != null && globalMax > 0 ? Math.max(2, (avgRaw / globalMax) * maxBarW) : 0
  const a2W = avg2Raw != null && globalMax > 0 ? Math.max(2, (avg2Raw / globalMax) * maxBarW) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 7 }}>
      {/* Label */}
      <div style={{ width: 200, textAlign: 'right', paddingRight: 12, fontSize: 11, color: '#9CA3AF', fontFamily: 'Arial, sans-serif', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      {/* Bars */}
      <div style={{ flex: 1 }}>
        {/* Player bar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
          <div style={{ width: pW, height: 9, backgroundColor: playerColor, borderRadius: 3 }} />
          {playerRaw != null && (
            <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: playerColor, fontFamily: 'Arial, sans-serif', minWidth: 32 }}>
              {playerRaw % 1 === 0 ? playerRaw : playerRaw.toFixed(1)}
            </span>
          )}
        </div>
        {/* Avg bar */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: avg2Raw != null ? 2 : 0 }}>
          <div style={{ width: aW, height: 7, backgroundColor: avgColor, borderRadius: 2 }} />
          {avgRaw != null && (
            <span style={{ marginLeft: 5, fontSize: 9, color: avgColor, fontFamily: 'Arial, sans-serif', minWidth: 32 }}>
              {avgRaw % 1 === 0 ? avgRaw : avgRaw.toFixed(1)}
            </span>
          )}
        </div>
        {/* 2nd league avg bar */}
        {avg2Raw != null && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: a2W, height: 7, backgroundColor: avg2Color ?? '#60A5FA', borderRadius: 2 }} />
            <span style={{ marginLeft: 5, fontSize: 9, color: avg2Color ?? '#60A5FA', fontFamily: 'Arial, sans-serif', minWidth: 32 }}>
              {avg2Raw % 1 === 0 ? avg2Raw : avg2Raw.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function InformeCanvaCard({
  player,
  barData,
  poolLabel,
  pool2Label,
  leagueContext,
}: InformeCanvaCardProps) {
  const score = player.ggScore
  const color = score != null ? scoreColor(score) : '#6B7280'
  const label = score != null ? scoreLabel(score, leagueContext?.avg) : '—'

  // Limit to max 13 metrics in the card
  const rows = barData.filter(d => d.jugadorRaw != null || d.promedioRaw != null).slice(0, 13)

  // Global max for bar scaling
  const globalMax = Math.max(
    1,
    ...rows.flatMap(d => [d.jugadorRaw ?? 0, d.promedioRaw ?? 0, d.promedio2Raw ?? 0])
  ) * 1.08  // 8% headroom

  const playerFirstName = player.Jugador.split(' ')[0]
  const playerLastName = player.Jugador.split(' ').slice(1).join(' ').toUpperCase()
  const year = new Date().getFullYear()

  return (
    <div style={{
      width: 1120, height: 630,
      backgroundColor: '#0f0f11',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Arial, Helvetica, sans-serif',
    }}>
      {/* ── Top green stripe ────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#22C55E' }} />

      {/* ── Brand ───────────────────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 14, right: 22, fontSize: 9, color: '#374151', letterSpacing: 2, fontWeight: 700 }}>
        DOBLE G SPORTS GROUP
      </div>

      {/* ── Left panel ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 4, left: 0, width: 272, bottom: 84,
        backgroundColor: '#17171a',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        paddingTop: 28, paddingBottom: 12,
      }}>
        {/* Avatar / photo */}
        <div style={{
          width: 74, height: 74, borderRadius: '50%',
          backgroundColor: '#2c2c2e',
          border: `3px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 12, overflow: 'hidden', flexShrink: 0,
        }}>
          {player.Imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.Imagen}
              alt={player.Jugador}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              crossOrigin="anonymous"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 800, color: '#6B7280' }}>{getInitials(player.Jugador)}</span>
          )}
        </div>

        {/* Position badge */}
        <div style={{
          backgroundColor: `${color}18`,
          border: `1px solid ${color}40`,
          borderRadius: 4, paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3,
          fontSize: 10, fontWeight: 700, color, marginBottom: 5, letterSpacing: 0.8,
        }}>
          {(player['Posición específica'] || player['Posición'] || '—').toUpperCase()}
        </div>

        {/* Team */}
        <div style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 2, textAlign: 'center', maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.Equipo || '—'}
        </div>
        <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 0, textAlign: 'center' }}>
          {player.Liga || '—'}
        </div>

        {/* Gauge */}
        <div style={{ marginTop: 12 }}>
          <GaugeSVG score={score ?? 0} avg={leagueContext?.avg} />
        </div>

        {/* SCORE GG label */}
        <div style={{ fontSize: 9, color: '#4B5563', letterSpacing: 2, fontWeight: 700, marginTop: -8 }}>
          SCORE GG
        </div>
        {/* Verdict */}
        <div style={{
          marginTop: 6,
          backgroundColor: `${color}15`,
          borderRadius: 4, paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: 0.5 }}>{label}</span>
        </div>

        {/* League rank */}
        {leagueContext?.rank && (
          <div style={{ marginTop: 8, fontSize: 9, color: '#6B7280', textAlign: 'center' }}>
            {leagueContext.rank}° de {leagueContext.total} en {leagueContext.liga}
          </div>
        )}
      </div>

      {/* ── Vertical separator ──────────────────────────────────────────── */}
      <div style={{ position: 'absolute', top: 4, left: 272, width: 1, bottom: 84, backgroundColor: '#2c2c2e' }} />

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', top: 4, left: 274, right: 0, bottom: 84,
        paddingTop: 20, paddingLeft: 24, paddingRight: 20,
      }}>
        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', marginBottom: 2 }}>
          Comparativa vs el promedio de {poolLabel} {year}
        </div>
        {pool2Label && (
          <div style={{ fontSize: 11, color: '#60A5FA', marginBottom: 6 }}>
            + comparación vs {pool2Label}
          </div>
        )}

        {/* Legend */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 12, height: 9, borderRadius: 2, backgroundColor: '#22C55E' }} />
            <span style={{ fontSize: 10, color: '#D1D5DB' }}>{player.Jugador.split(' ').map(w => w[0]).join('. ')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 7, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.6)' }} />
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>Promedio ({poolLabel})</span>
          </div>
          {pool2Label && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 7, borderRadius: 2, backgroundColor: 'rgba(96,165,250,0.6)' }} />
              <span style={{ fontSize: 10, color: '#60A5FA' }}>Promedio ({pool2Label})</span>
            </div>
          )}
        </div>

        {/* Bars */}
        {rows.length === 0 ? (
          <div style={{ color: '#4B5563', fontSize: 12, paddingTop: 30 }}>
            Seleccioná métricas en la pantalla para verlas aquí.
          </div>
        ) : (
          rows.map((d, i) => (
            <BarRow
              key={i}
              label={d.name}
              playerRaw={d.jugadorRaw}
              avgRaw={d.promedioRaw}
              avg2Raw={d.promedio2Raw ?? null}
              globalMax={globalMax}
              playerColor="#22C55E"
              avgColor="rgba(148,163,184,0.6)"
              avg2Color="rgba(96,165,250,0.7)"
            />
          ))
        )}
      </div>

      {/* ── Bottom strip ────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 84,
        backgroundColor: '#0a0a0c',
        borderTop: '1px solid #1f1f22',
        display: 'flex', alignItems: 'center',
        paddingLeft: 24, paddingRight: 24,
        gap: 0,
      }}>
        {/* Accent bar */}
        <div style={{ width: 4, height: 52, backgroundColor: '#22C55E', borderRadius: 2, marginRight: 16, flexShrink: 0 }} />

        {/* Name block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 30, fontWeight: 300, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 1, marginBottom: 4 }}>
            {playerFirstName}{' '}
            <span style={{ fontWeight: 900 }}>{playerLastName}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#6B7280' }}>
            {player['País de nacimiento'] && <span>{player['País de nacimiento']}</span>}
            {player.Altura && <span><span style={{ color: '#374151' }}>|</span> {player.Altura} m</span>}
            <span><span style={{ color: '#374151' }}>|</span> {footLabel(player.Pie)}</span>
            <span><span style={{ color: '#374151' }}>|</span> {player['Posición específica'] || player['Posición'] || '—'}</span>
            {player.Edad && <span><span style={{ color: '#374151' }}>|</span> {player.Edad} años</span>}
          </div>
        </div>

        {/* Date */}
        <div style={{ fontSize: 9, color: '#374151', textAlign: 'right' }}>
          {new Date().toLocaleDateString('es-AR')}
        </div>
      </div>
    </div>
  )
}
