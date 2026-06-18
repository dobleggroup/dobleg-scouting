/**
 * InformeCanvaCard — 1120×630px card exportable como PNG/PDF.
 * Layout FLEXBOX (no absolute positioning en paneles principales).
 * Usa SOLO inline styles para compatibilidad con html-to-image.
 */

import type { EnrichedPlayer } from '@/types'
import type { BarDataRow } from './AnalisisCompletoPDF'

export interface InformeCanvaCardProps {
  player: EnrichedPlayer
  barData: BarDataRow[]
  poolLabel: string
  pool2Label?: string
  leagueContext: { liga: string; rank: number | null; total: number; avg: number } | null
  videoUrl?: string
  logoDataUrl?: string   // base64 del logo-white.png, si el usuario lo eligió
}

// ─── Color helpers (escala 1-10) ──────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 8) return '#34D399'
  if (s >= 5.5) return '#10B981'
  if (s >= 3.5) return '#F59E0B'
  if (s >= 2) return '#F97316'
  return '#EF4444'
}

function scoreLabel(s: number, avg?: number | null): string {
  if (s >= 8) return 'ÉLITE'
  if (avg != null) {
    if (s >= avg + 0.5) return 'SOBRE EL PROMEDIO'
    if (s >= avg - 0.5) return 'EN EL PROMEDIO'
    return 'BAJO EL PROMEDIO'
  }
  if (s >= 5.5) return 'BUENO'
  if (s >= 3.5) return 'PROMEDIO'
  return 'BAJO'
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

function fmtVal(v: number | null): string {
  if (v == null) return ''
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

function formatContract(raw: string): string {
  if (!raw || raw === '—' || raw.trim() === '') return ''
  if (raw.length <= 10 && !/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.trim()
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${months[parseInt(isoMatch[2]) - 1]} ${isoMatch[1]}`
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) return `${months[parseInt(slashMatch[2]) - 1]} ${slashMatch[3]}`
  return raw.trim()
}

function contractColor(status?: string): string {
  if (status === 'critical') return '#EF4444'
  if (status === 'warning') return '#F59E0B'
  return '#34D399'
}

function truncateUrl(url: string, maxLen = 42): string {
  if (!url) return ''
  const clean = url.replace(/^https?:\/\/(www\.)?/, '')
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean
}

// ─── Análisis inteligente ─────────────────────────────────────────────────────

function generateAnalysis(barData: BarDataRow[], poolLabel: string): string {
  const rows = barData.filter(d => d.jugadorRaw != null && d.promedioRaw != null && d.promedio > 0)
  if (rows.length < 3) return ''

  // Gaps normalizados: diferencia en escala 0-100 sobre el promedio de ese pool
  // (barData.jugador/promedio ya vienen normalizados 0-100 desde el adaptador)
  const GAP_STRENGTH = 18   // ≥18 pts sobre el promedio normalizado → fortaleza clara
  const GAP_DEFICIT = 14    // ≥14 pts por debajo del promedio normalizado → área de mejora

  const strengths = rows
    .filter(d => (d.jugador - d.promedio) >= GAP_STRENGTH)
    .sort((a, b) => (b.jugador - b.promedio) - (a.jugador - a.promedio))
    .slice(0, 3)

  const deficits = rows
    .filter(d => (d.promedio - d.jugador) >= GAP_DEFICIT)
    .sort((a, b) => (b.promedio - b.jugador) - (a.promedio - a.jugador))
    .slice(0, 2)

  const fmtList = (items: BarDataRow[]) => {
    const names = items.map(x => x.name)
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1]
  }

  const parts: string[] = []

  if (strengths.length > 0) {
    const liga = poolLabel.length > 24 ? poolLabel.slice(0, 22) + '…' : poolLabel
    parts.push(`Supera el promedio de ${liga} en ${fmtList(strengths)}.`)
  }

  if (deficits.length > 0) {
    parts.push(`Tiene margen de mejora en ${fmtList(deficits)}.`)
  } else if (strengths.length > 0) {
    parts.push('Sin déficits notorios en las métricas restantes.')
  } else {
    parts.push(`Rendimiento equilibrado frente al promedio de ${poolLabel} en todas las métricas evaluadas.`)
  }

  return parts.join(' ')
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, s: number, e: number) {
  const sp = polarToCartesian(cx, cy, r, s)
  const ep = polarToCartesian(cx, cy, r, e)
  return `M ${sp.x.toFixed(2)} ${sp.y.toFixed(2)} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${ep.x.toFixed(2)} ${ep.y.toFixed(2)}`
}

// ─── Gauge SVG (compact) — escala 1-10 ───────────────────────────────────────
// El arco va de 1 (start) a 10 (end). La aguja se posiciona con (score-1)/9.

function GaugeSVG({ score, avg, color }: { score: number; avg?: number | null; color: string }) {
  const cx = 75, cy = 65, r = 48, sw = 6
  const start = 135, full = 270
  // Normalizar 1-10 → 0-1 para posicionar sobre el arco
  const norm = (v: number) => Math.max(0, Math.min(1, (v - 1) / 9))
  const valDeg = start + norm(score) * full
  const avgDeg = avg != null ? start + norm(avg) * full : null
  const nRad = ((valDeg - 90) * Math.PI) / 180
  const nLen = r - 12
  const tipX = cx + nLen * Math.cos(nRad), tipY = cy + nLen * Math.sin(nRad)
  const bR = 4
  const b1 = { x: cx + bR * Math.cos(nRad + Math.PI / 2), y: cy + bR * Math.sin(nRad + Math.PI / 2) }
  const b2 = { x: cx + bR * Math.cos(nRad - Math.PI / 2), y: cy + bR * Math.sin(nRad - Math.PI / 2) }

  // Zonas de color recalibradas a 1-10: 1-2 / 2-3.5 / 3.5-5.5 / 5.5-8 / 8-10
  const zones = [
    { s: 1, e: 2,   c: '#EF4444' },
    { s: 2, e: 3.5, c: '#F97316' },
    { s: 3.5, e: 5.5, c: '#F59E0B' },
    { s: 5.5, e: 8,  c: '#10B981' },
    { s: 8, e: 10,  c: '#34D399' },
  ]

  // viewBox 158 para que el score quede bien por debajo del arco (arc bottom ≈ 116, score a y=148)
  return (
    <svg width="150" height="158" viewBox="0 0 150 158" style={{ display: 'block' }}>
      <path d={arcPath(cx, cy, r, start, start + full)} stroke="rgba(255,255,255,0.08)" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {zones.map((z, i) => (
        <path key={i} d={arcPath(cx, cy, r, start + norm(z.s) * full, start + norm(z.e) * full)} stroke={z.c} strokeWidth={sw + 14} fill="none" strokeLinecap="butt" opacity={0.09} />
      ))}
      {score > 1 && <path d={arcPath(cx, cy, r, start, valDeg)} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />}
      {avgDeg && (() => {
        const pi = polarToCartesian(cx, cy, r - sw / 2 - 6, avgDeg)
        const po = polarToCartesian(cx, cy, r + sw / 2 + 6, avgDeg)
        return <line x1={pi.x} y1={pi.y} x2={po.x} y2={po.y} stroke="rgba(255,255,255,0.45)" strokeWidth={2} strokeLinecap="round" />
      })()}
      {/* Etiquetas de eje: 1 (min), 5.5 (medio), 10 (max) */}
      {[1, 5.5, 10].map(v => {
        const p = polarToCartesian(cx, cy, r + sw / 2 + 13, start + norm(v) * full)
        return <text key={v} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 8, fill: '#4B5563', fontFamily: 'Arial,sans-serif' }}>{v}</text>
      })}
      <circle cx={cx} cy={cy} r={8} fill="#1c1c1e" />
      <circle cx={cx} cy={cy} r={4} fill="#0f0f11" />
      <polygon points={`${tipX.toFixed(2)},${tipY.toFixed(2)} ${b1.x.toFixed(2)},${b1.y.toFixed(2)} ${b2.x.toFixed(2)},${b2.y.toFixed(2)}`} fill={color} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      {/* Score con un decimal (ej. "6.8"), no redondeado al entero */}
      <text x={cx} y={148} textAnchor="middle" style={{ fontSize: 24, fontWeight: 'bold', fill: color, fontFamily: 'Arial,sans-serif' }}>
        {score.toFixed(1)}
      </text>
    </svg>
  )
}

// ─── Radar SVG con etiquetas de eje ──────────────────────────────────────────

function splitLabel(text: string): string[] {
  if (text.length <= 14) return [text]
  const mid = Math.floor(text.length / 2)
  let bestSpace = -1
  let bestDist = Infinity
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      const dist = Math.abs(i - mid)
      if (dist < bestDist) { bestDist = dist; bestSpace = i }
    }
  }
  if (bestSpace === -1) return [text]
  return [text.slice(0, bestSpace), text.slice(bestSpace + 1)]
}

function RadarSVG({ metrics, color }: { metrics: Array<{ jugador: number; promedio: number; label?: string }>; color: string }) {
  if (metrics.length < 3) return null
  const n = metrics.length
  const cx = 200, cy = 200, maxR = 100
  const W = 400, H = 400
  const labelR = 132  // distancia del centro al texto de etiqueta

  function pt(idx: number, val: number): [number, number] {
    const angle = (idx / n) * 2 * Math.PI - Math.PI / 2
    const r = maxR * Math.max(0, Math.min(100, val)) / 100
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  function poly(vals: number[]) {
    return vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {/* Grid rings */}
      {[20, 40, 60, 80, 100].map(lvl => (
        <polygon key={lvl} points={poly(metrics.map(() => lvl))} fill="none"
          stroke={lvl === 100 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)'}
          strokeWidth={lvl === 100 ? 1.2 : 0.7} />
      ))}
      {/* Axis lines */}
      {metrics.map((_, i) => {
        const [x, y] = pt(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(255,255,255,0.08)" strokeWidth={0.7} />
      })}
      {/* Avg + player polygons */}
      <polygon points={poly(metrics.map(m => m.promedio))} fill="rgba(148,163,184,0.10)" stroke="rgba(148,163,184,0.40)" strokeWidth={1.5} />
      <polygon points={poly(metrics.map(m => m.jugador))} fill={`${color}26`} stroke={color} strokeWidth={2} />
      {/* Player dots */}
      {metrics.map((m, i) => {
        const [x, y] = pt(i, m.jugador)
        return <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3} fill={color} />
      })}
      {/* Axis labels */}
      {metrics.map((m, i) => {
        if (!m.label) return null
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2
        const lx = cx + labelR * Math.cos(angle)
        const ly = cy + labelR * Math.sin(angle)
        const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle'
        const lines = splitLabel(m.label)
        const lineH = 8.5
        const totalH = lines.length * lineH
        const startY = ly - totalH / 2 + lineH / 2
        return (
          <g key={`lbl-${i}`}>
            {lines.map((line, li) => (
              <text key={li}
                x={lx.toFixed(1)}
                y={(startY + li * lineH).toFixed(1)}
                textAnchor={anchor}
                style={{ fontSize: 7, fill: '#9CA3AF', fontFamily: 'Arial,sans-serif', fontWeight: 600 }}
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
    </svg>
  )
}

// ─── Bar row ──────────────────────────────────────────────────────────────────

function BarRow({ label, playerRaw, avgRaw, avg2Raw, playerPct, avgPct, avg2Pct, playerColor, avgColor, avg2Color }: {
  label: string; playerRaw: number | null; avgRaw: number | null; avg2Raw?: number | null
  playerPct: number; avgPct: number; avg2Pct?: number; playerColor: string; avgColor: string; avg2Color?: string
}) {
  const maxW = 190
  const pW = Math.max(3, (playerPct / 100) * maxW)
  const aW = Math.max(3, (avgPct / 100) * maxW)
  const a2W = avg2Pct != null ? Math.max(3, (avg2Pct / 100) * maxW) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
      <div style={{ width: 136, flexShrink: 0, textAlign: 'right', paddingRight: 9, fontSize: 10, color: '#9CA3AF', fontFamily: 'Arial,sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
          <div style={{ width: pW, height: 8, backgroundColor: playerColor, borderRadius: 3 }} />
          {playerRaw != null && <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: playerColor, fontFamily: 'Arial,sans-serif' }}>{fmtVal(playerRaw)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: avg2Raw != null ? 2 : 0 }}>
          <div style={{ width: aW, height: 6, backgroundColor: avgColor, borderRadius: 2 }} />
          {avgRaw != null && <span style={{ marginLeft: 5, fontSize: 8, color: avgColor, fontFamily: 'Arial,sans-serif' }}>{fmtVal(avgRaw)}</span>}
        </div>
        {avg2Raw != null && a2W > 0 && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: a2W, height: 6, backgroundColor: avg2Color ?? '#60A5FA', borderRadius: 2 }} />
            <span style={{ marginLeft: 5, fontSize: 8, color: avg2Color ?? '#60A5FA', fontFamily: 'Arial,sans-serif' }}>{fmtVal(avg2Raw)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

export default function InformeCanvaCard({ player, barData, poolLabel, pool2Label, leagueContext, videoUrl, logoDataUrl }: InformeCanvaCardProps) {
  const score = player.ggScore
  const color = score != null ? scoreColor(score) : '#6B7280'
  const verdict = score != null ? scoreLabel(score, leagueContext?.avg) : '—'
  const rows = barData.filter(d => d.jugadorRaw != null || d.promedioRaw != null).slice(0, 10)
  const radarMetrics = rows.map(d => ({ jugador: d.jugador, promedio: d.promedio, label: d.name }))
  const superaCount = rows.filter(d => d.jugador > d.promedio).length
  const bajoCount = rows.filter(d => d.promedio >= d.jugador).length

  const playerFirstName = player.Jugador.split(' ')[0]
  const playerLastName = player.Jugador.split(' ').slice(1).join(' ').toUpperCase()
  const year = new Date().getFullYear()

  // Valor de mercado y contrato
  const mv = player.marketValueFormatted && player.marketValueFormatted !== '—' && player.marketValueFormatted !== '' ? player.marketValueFormatted : null
  const contractRaw = player['Vencimiento contrato'] ?? ''
  const contract = formatContract(contractRaw)
  const cColor = contractColor(player.contractStatus)

  // Percentil
  const percentile = player.ggScorePercentile != null ? Math.round(player.ggScorePercentile) : null

  // Partidos / minutos
  const games = player['Partidos jugados'] ? parseInt(player['Partidos jugados']) : null
  const minutes = player.minutesPlayed ?? null

  // Análisis inteligente
  const analysisText = score != null ? generateAnalysis(rows, poolLabel) : ''

  // Label de comparación claro
  const compareLabel = pool2Label ? `${poolLabel} / ${pool2Label}` : poolLabel

  return (
    <div style={{ width: 1120, height: 630, backgroundColor: '#0f0f11', display: 'flex', flexDirection: 'column', fontFamily: 'Arial,Helvetica,sans-serif', position: 'relative', overflow: 'hidden' }}>

      {/* Top stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#22C55E', zIndex: 1 }} />

      {/* Brand / Logo — top-right corner */}
      {logoDataUrl
        ? (
          <div style={{ position: 'absolute', top: 10, right: 18, zIndex: 2, display: 'flex', alignItems: 'center', gap: 7 }}>
            <img
              src={logoDataUrl}
              alt="Doble G Sports Group"
              style={{ height: 34, width: 'auto', opacity: 0.75, display: 'block', filter: 'brightness(1.1)' }}
            />
          </div>
        )
        : (
          <div style={{ position: 'absolute', top: 14, right: 20, fontSize: 8, color: '#374151', letterSpacing: 2, fontWeight: 700, zIndex: 1 }}>
            DOBLE G SPORTS GROUP
          </div>
        )
      }

      {/* ── Main row ── */}
      <div style={{ display: 'flex', flex: 1, marginTop: 4, overflow: 'hidden' }}>

        {/* COL A — Player info (214px) */}
        <div style={{ width: 214, flexShrink: 0, backgroundColor: '#17171a', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 18, paddingBottom: 10, paddingLeft: 6, paddingRight: 6 }}>

          {/* Avatar */}
          <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: '#2c2c2e', border: `2px solid ${color}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, overflow: 'hidden', flexShrink: 0 }}>
            {player.Imagen
              ? <img src={player.Imagen} alt={player.Jugador} style={{ width: '100%', height: '100%', objectFit: 'cover' }} crossOrigin="anonymous" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
              : <span style={{ fontSize: 16, fontWeight: 800, color: '#6B7280' }}>{getInitials(player.Jugador)}</span>
            }
          </div>

          {/* Position badge */}
          <div style={{ backgroundColor: `${color}18`, border: `1px solid ${color}40`, borderRadius: 4, paddingLeft: 8, paddingRight: 8, paddingTop: 3, paddingBottom: 3, fontSize: 9, fontWeight: 700, color, marginBottom: 5, letterSpacing: 0.8, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {(player['Posición específica'] || player['Posición'] || '—').toUpperCase()}
          </div>

          {/* Team */}
          <div style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 1, textAlign: 'center', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {player.Equipo || '—'}
          </div>
          <div style={{ fontSize: 9, color: '#6B7280', textAlign: 'center', marginBottom: 0 }}>
            {player.Liga || '—'}
          </div>

          {/* Gauge */}
          <div style={{ marginTop: 6, flexShrink: 0 }}>
            <GaugeSVG score={score ?? 0} avg={leagueContext?.avg} color={color} />
          </div>

          <div style={{ fontSize: 7, color: '#4B5563', letterSpacing: 2, fontWeight: 700, marginTop: 6, marginBottom: 7 }}>
            SCORE GG
          </div>

          {/* Percentil badge */}
          {percentile != null && (
            <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 6, letterSpacing: 0.5 }}>
              TOP <span style={{ color, fontWeight: 700 }}>{100 - percentile}%</span> en su posición
            </div>
          )}

          {/* Verdict */}
          <div style={{ backgroundColor: `${color}15`, borderRadius: 4, paddingLeft: 10, paddingRight: 10, paddingTop: 3, paddingBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
            <span style={{ fontSize: 8, fontWeight: 700, color, letterSpacing: 0.5 }}>{verdict}</span>
          </div>

          {/* League rank */}
          {leagueContext?.rank && (
            <div style={{ marginTop: 9, fontSize: 9, color: '#6B7280', textAlign: 'center', lineHeight: 1.4 }}>
              {leagueContext.rank}° de {leagueContext.total}<br />
              <span style={{ fontSize: 8 }}>{leagueContext.liga}</span>
            </div>
          )}

          {/* Valor de mercado + contrato */}
          {(mv || contract) && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              {mv && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 5, paddingLeft: 9, paddingRight: 9, paddingTop: 3, paddingBottom: 3 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="#22C55E" strokeWidth="2" />
                    <path d="M12 6v12M9 9h4.5a1.5 1.5 0 010 3H9m0 0h5.25a1.5 1.5 0 010 3H9" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', fontFamily: 'Arial,sans-serif' }}>{mv}</span>
                </div>
              )}
              {contract && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: `${cColor}10`, border: `1px solid ${cColor}30`, borderRadius: 5, paddingLeft: 9, paddingRight: 9, paddingTop: 3, paddingBottom: 3 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke={cColor} strokeWidth="2" />
                    <path d="M3 9h18M9 3v3M15 3v3" stroke={cColor} strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 9, color: cColor, fontFamily: 'Arial,sans-serif' }}>hasta {contract}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Separator A|B */}
        <div style={{ width: 1, flexShrink: 0, backgroundColor: '#2a2a2e' }} />

        {/* COL B — Bars (430px) */}
        <div style={{ width: 430, flexShrink: 0, paddingTop: 14, paddingLeft: 16, paddingRight: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ marginBottom: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'nowrap', overflow: 'hidden' }}>
              <div style={{ width: 3, height: 20, backgroundColor: '#22C55E', borderRadius: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', letterSpacing: -0.2, flexShrink: 0 }}>
                Métricas de rendimiento
              </div>
              <div style={{ width: 1, height: 14, backgroundColor: '#2a2a2e', flexShrink: 0 }} />
              <div style={{ fontSize: 9, color: '#4B5563', flexShrink: 0 }}>vs.</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {compareLabel}
              </div>
              <div style={{ fontSize: 8, color: '#374151', flexShrink: 0 }}>· {year}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 11 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 7, borderRadius: 2, backgroundColor: '#22C55E' }} />
                <span style={{ fontSize: 8, color: '#D1D5DB' }}>{player.Jugador.split(' ').slice(0, 2).map((w: string) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 5, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.65)' }} />
                <span style={{ fontSize: 8, color: '#9CA3AF' }}>Prom. {poolLabel.length > 18 ? poolLabel.slice(0, 16) + '…' : poolLabel}</span>
              </div>
              {pool2Label && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 5, borderRadius: 2, backgroundColor: 'rgba(96,165,250,0.65)' }} />
                  <span style={{ fontSize: 8, color: '#60A5FA' }}>{pool2Label.length > 14 ? pool2Label.slice(0, 13) + '…' : pool2Label}</span>
                </div>
              )}
            </div>
          </div>

          {/* Barras */}
          <div style={{ flex: 1 }}>
            {rows.length === 0
              ? <div style={{ color: '#4B5563', fontSize: 11 }}>Sin métricas.</div>
              : rows.map((d, i) => (
                <BarRow key={i} label={d.name}
                  playerRaw={d.jugadorRaw} avgRaw={d.promedioRaw} avg2Raw={d.promedio2Raw ?? null}
                  playerPct={d.jugador} avgPct={d.promedio} avg2Pct={d.promedio2}
                  playerColor="#22C55E" avgColor="rgba(148,163,184,0.65)" avg2Color="rgba(96,165,250,0.75)" />
              ))
            }
          </div>

          {/* Análisis inteligente — aprovecha el espacio libre debajo de las barras */}
          {analysisText && (
            <div style={{ flexShrink: 0, paddingTop: 10, paddingBottom: 14, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 2, flexShrink: 0, alignSelf: 'stretch', backgroundColor: 'rgba(34,197,94,0.4)', borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 7, fontWeight: 700, color: '#4B5563', letterSpacing: 1.5, marginBottom: 4 }}>ANÁLISIS</div>
                  <span style={{ fontSize: 9.5, color: '#9CA3AF', lineHeight: 1.6, fontStyle: 'italic', fontFamily: 'Arial,sans-serif' }}>
                    {analysisText}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator B|C */}
        <div style={{ width: 1, flexShrink: 0, backgroundColor: '#2a2a2e' }} />

        {/* COL C — Radar (flex:1) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 8, paddingBottom: 6 }}>
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#D1D5DB', letterSpacing: 1 }}>
              GRÁFICO DE RADAR
            </div>
          </div>
          <RadarSVG metrics={radarMetrics} color={color} />
          <div style={{ display: 'flex', gap: 14, marginTop: 2, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 3, backgroundColor: color, borderRadius: 2 }} />
              <span style={{ fontSize: 8, color: '#9CA3AF' }}>Jugador</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 3, backgroundColor: 'rgba(148,163,184,0.5)', borderRadius: 2 }} />
              <span style={{ fontSize: 8, color: '#9CA3AF' }}>Promedio</span>
            </div>
          </div>

          {/* Métricas summary */}
          {rows.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', width: '85%' }}>
              <div style={{ fontSize: 7, fontWeight: 700, color: '#374151', letterSpacing: 1.2, textAlign: 'center', marginBottom: 7 }}>COMPARATIVA</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.22)', borderRadius: 7, paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#22C55E', lineHeight: 1, fontFamily: 'Arial,sans-serif' }}>{superaCount}</span>
                  <div style={{ fontSize: 7, color: '#6B7280', lineHeight: 1.35, fontFamily: 'Arial,sans-serif' }}>
                    <div>métricas</div>
                    <div style={{ color: '#22C55E', fontWeight: 700 }}>supera</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: 'rgba(107,114,128,0.07)', border: '1px solid rgba(107,114,128,0.18)', borderRadius: 7, paddingLeft: 10, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#6B7280', lineHeight: 1, fontFamily: 'Arial,sans-serif' }}>{bajoCount}</span>
                  <div style={{ fontSize: 7, color: '#6B7280', lineHeight: 1.35, fontFamily: 'Arial,sans-serif' }}>
                    <div>métricas</div>
                    <div style={{ fontWeight: 700 }}>por debajo</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom strip ── */}
      <div style={{ flexShrink: 0, backgroundColor: '#0a0a0c', borderTop: '1px solid #1f1f22', paddingLeft: 20, paddingRight: 20, paddingTop: 10, paddingBottom: 10 }}>

        {/* Nombre + datos generales + info derecha */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 4, height: 40, backgroundColor: '#22C55E', borderRadius: 2, marginRight: 12, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 300, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 1, marginBottom: 4 }}>
              {playerFirstName} <span style={{ fontWeight: 900 }}>{playerLastName}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 9, color: '#6B7280', flexWrap: 'wrap' }}>
              {player['País de nacimiento'] && <span>{player['País de nacimiento']}</span>}
              {player.Altura && <span><span style={{ color: '#374151' }}>|</span> {player.Altura} m</span>}
              <span><span style={{ color: '#374151' }}>|</span> {footLabel(player.Pie)}</span>
              <span><span style={{ color: '#374151' }}>|</span> {player['Posición específica'] || player['Posición'] || '—'}</span>
              {player.Edad && <span><span style={{ color: '#374151' }}>|</span> {player.Edad} años</span>}
              {games != null && <span><span style={{ color: '#374151' }}>|</span> {games} partidos</span>}
              {minutes != null && minutes > 0 && <span><span style={{ color: '#374151' }}>|</span> {minutes.toLocaleString()} min</span>}
            </div>
          </div>

          {/* Derecha: VIDEO REPORT button + fecha */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {videoUrl ? (
              <>
                {/* VIDEO REPORT — botón estilo CTA, verde de la app */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                  border: '1px solid rgba(34,197,94,0.4)',
                  borderRadius: 8,
                  paddingLeft: 12, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
                  boxShadow: '0 2px 14px rgba(34,197,94,0.3)',
                  cursor: 'pointer',
                }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.15)" />
                    <path d="M10 8l6 4-6 4V8z" fill="white" />
                  </svg>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#FFFFFF', letterSpacing: 1.2, fontFamily: 'Arial,sans-serif' }}>
                    VIDEO REPORT
                  </span>
                </div>
                <span style={{ fontSize: 8, color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {truncateUrl(videoUrl, 30)}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 8, color: '#374151' }}>{new Date().toLocaleDateString('es-AR')}</span>
            )}
            {videoUrl && (
              <span style={{ fontSize: 8, color: '#374151' }}>{new Date().toLocaleDateString('es-AR')}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
