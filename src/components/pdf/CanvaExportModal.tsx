/**
 * CanvaExportModal — configuración del informe Canva.
 * Permite elegir: logo, video, y métricas (auto por posición o selección manual).
 */

import { useState, useEffect, useRef } from 'react'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface CanvaMetricPreview {
  key: string
  label: string        // con unidad explícita (/90, %, etc.)
  jugador: number      // normalizado 0–100
  promedio: number     // normalizado 0–100
  jugadorRaw: number | null
  promedioRaw: number | null
}

export interface CanvaExportOptions {
  showLogo: boolean
  videoUrl: string
  metricKeys: string[]
}

interface Props {
  onConfirm: (opts: CanvaExportOptions) => void
  onClose: () => void
  allMetrics: CanvaMetricPreview[]   // todas las métricas disponibles para este jugador/pool
  positionKeys: string[]             // top 10 por peso de posición (modo auto)
}

// ─── Color según gap jugador vs promedio ─────────────────────────────────────

type ChipColor = 'green' | 'yellow' | 'red'

function metricChipColor(jugador: number, promedio: number): ChipColor {
  const gap = jugador - promedio
  if (gap >= 14) return 'green'
  if (gap <= -14) return 'red'
  return 'yellow'
}

const CHIP_PALETTE: Record<ChipColor, { border: string; bg: string; bgSelected: string; dot: string; text: string; textSelected: string }> = {
  green:  { border: 'rgba(34,197,94,0.35)',  bg: 'rgba(34,197,94,0.04)',  bgSelected: 'rgba(34,197,94,0.14)',  dot: '#22C55E', text: '#4B5563', textSelected: '#4ADE80' },
  yellow: { border: 'rgba(251,191,36,0.30)', bg: 'rgba(251,191,36,0.04)', bgSelected: 'rgba(251,191,36,0.12)', dot: '#F59E0B', text: '#4B5563', textSelected: '#FCD34D' },
  red:    { border: 'rgba(239,68,68,0.30)',  bg: 'rgba(239,68,68,0.04)',  bgSelected: 'rgba(239,68,68,0.12)',  dot: '#EF4444', text: '#4B5563', textSelected: '#F87171' },
}

function fmtRaw(v: number | null): string {
  if (v == null) return '—'
  return v % 1 === 0 ? String(v) : v.toFixed(2)
}

const MAX_METRICS = 10

// ─── Modal ────────────────────────────────────────────────────────────────────

export default function CanvaExportModal({ onConfirm, onClose, allMetrics, positionKeys }: Props) {
  const [showLogo, setShowLogo] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [metricMode, setMetricMode] = useState<'auto' | 'manual'>('auto')
  const [selectedKeys, setSelectedKeys] = useState<string[]>(positionKeys.slice(0, MAX_METRICS))
  const [colorFilter, setColorFilter] = useState<ChipColor | 'all'>('all')
  const [logoLoaded, setLogoLoaded] = useState(false)
  const videoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const hasVideo = videoUrl.trim().length > 3

  function toggleMetric(key: string) {
    setSelectedKeys(prev => {
      if (prev.includes(key)) return prev.filter(k => k !== key)
      if (prev.length >= MAX_METRICS) return prev   // límite alcanzado
      return [...prev, key]
    })
  }

  function handleConfirm() {
    const finalKeys = metricMode === 'auto' ? positionKeys.slice(0, MAX_METRICS) : selectedKeys
    onConfirm({ showLogo, videoUrl: videoUrl.trim(), metricKeys: finalKeys })
  }

  // Métricas filtradas para mostrar en el grid
  const displayMetrics = colorFilter === 'all'
    ? allMetrics
    : allMetrics.filter(m => metricChipColor(m.jugador, m.promedio) === colorFilter)

  const finalMetricCount = metricMode === 'auto' ? Math.min(positionKeys.length, MAX_METRICS) : selectedKeys.length

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      />

      {/* Modal card */}
      <div style={{
        position: 'relative', width: 560,
        maxHeight: '90vh', overflowY: 'auto',
        backgroundColor: '#0f0f11',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 22,
        padding: '28px 26px 24px',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column', gap: 20,
        scrollbarWidth: 'thin',
      }}>

        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>Configurar informe</h2>
            <p style={{ fontSize: 11, color: '#6B7280', margin: '2px 0 0' }}>Personalizá logo, video y métricas antes de generar</p>
          </div>
        </div>

        {/* ─── Fila compacta: Branding + Video ─── */}
        <div style={{ display: 'flex', gap: 12 }}>

          {/* Branding */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4B5563', letterSpacing: 1.4, marginBottom: 8 }}>BRANDING</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowLogo(false)} style={{ flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${!showLogo ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.07)'}`, backgroundColor: !showLogo ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><path d="M4.93 4.93l14.14 14.14" strokeLinecap="round" /></svg>
                <span style={{ fontSize: 10, fontWeight: 600, color: !showLogo ? '#22C55E' : '#6B7280' }}>Sin logo</span>
              </button>
              <button onClick={() => setShowLogo(true)} style={{ flex: 1, padding: '10px 8px', borderRadius: 12, border: `1.5px solid ${showLogo ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.07)'}`, backgroundColor: showLogo ? 'rgba(34,197,94,0.05)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <img src="/brand/logo-white.png" alt="Logo" style={{ width: 28, height: 28, objectFit: 'contain', opacity: logoLoaded ? 0.8 : 0 }} onLoad={() => setLogoLoaded(true)} />
                <span style={{ fontSize: 10, fontWeight: 600, color: showLogo ? '#22C55E' : '#6B7280' }}>Con logo</span>
              </button>
            </div>
          </div>

          {/* Video */}
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#4B5563', letterSpacing: 1.4, marginBottom: 8 }}>
              VIDEO REPORT <span style={{ color: '#374151', fontWeight: 400, letterSpacing: 0 }}>— opcional</span>
            </div>
            <div style={{ borderRadius: 12, border: `1.5px solid ${hasVideo ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.07)'}`, backgroundColor: hasVideo ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.02)', padding: '10px 12px' }}>
              {hasVideo && <div style={{ fontSize: 10, color: '#22C55E', marginBottom: 5, fontWeight: 600 }}>✓ Video vinculado — aparece como botón en el informe</div>}
              <div style={{ position: 'relative' }}>
                <input
                  ref={videoRef}
                  type="url"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://wyscout.com/... o youtube.com/..."
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 30px 8px 10px', borderRadius: 8, border: `1px solid ${hasVideo ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}`, backgroundColor: '#0a0a0c', color: hasVideo ? '#86EFAC' : '#9CA3AF', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
                />
                {videoUrl && <button onClick={() => setVideoUrl('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Métricas ─── */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4B5563', letterSpacing: 1.4, marginBottom: 10 }}>MÉTRICAS DEL INFORME</div>

          {/* Mode selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: metricMode === 'manual' ? 12 : 0 }}>
            <button
              onClick={() => setMetricMode('auto')}
              style={{ flex: 1, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${metricMode === 'auto' ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.07)'}`, backgroundColor: metricMode === 'auto' ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: metricMode === 'auto' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={metricMode === 'auto' ? '#22C55E' : '#4B5563'} strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: metricMode === 'auto' ? '#22C55E' : '#6B7280' }}>Más importantes según posición</div>
                <div style={{ fontSize: 9.5, color: '#4B5563', marginTop: 1 }}>Top {Math.min(positionKeys.length, MAX_METRICS)} métricas por peso táctico</div>
              </div>
            </button>

            <button
              onClick={() => setMetricMode('manual')}
              style={{ flex: 1, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${metricMode === 'manual' ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.07)'}`, backgroundColor: metricMode === 'manual' ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: metricMode === 'manual' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={metricMode === 'manual' ? '#22C55E' : '#4B5563'} strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10" /></svg>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: metricMode === 'manual' ? '#22C55E' : '#6B7280' }}>Elegir métricas manualmente</div>
                <div style={{ fontSize: 9.5, color: '#4B5563', marginTop: 1 }}>Seleccionás hasta {MAX_METRICS} del total disponible</div>
              </div>
            </button>
          </div>

          {/* Grid manual */}
          {metricMode === 'manual' && (
            <>
              {/* Leyenda + filtro */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {(['all', 'green', 'yellow', 'red'] as const).map(f => {
                    const labels = { all: 'Todas', green: 'Destaca', yellow: 'Promedio', red: 'Floja' }
                    const dots = { all: '#6B7280', green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' }
                    const isActive = colorFilter === f
                    return (
                      <button key={f} onClick={() => setColorFilter(f)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: `1px solid ${isActive ? dots[f] + '60' : 'rgba(255,255,255,0.07)'}`, backgroundColor: isActive ? dots[f] + '14' : 'transparent', cursor: 'pointer' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: dots[f] }} />
                        <span style={{ fontSize: 9.5, color: isActive ? dots[f] : '#4B5563', fontWeight: isActive ? 600 : 400 }}>{labels[f]}</span>
                      </button>
                    )
                  })}
                </div>
                <span style={{ fontSize: 10, color: selectedKeys.length >= MAX_METRICS ? '#22C55E' : '#4B5563' }}>
                  {selectedKeys.length}/{MAX_METRICS} seleccionadas
                </span>
              </div>

              {/* Chips de métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 300, overflowY: 'auto', paddingRight: 2, scrollbarWidth: 'thin' }}>
                {displayMetrics.map(m => {
                  const chipColor = metricChipColor(m.jugador, m.promedio)
                  const pal = CHIP_PALETTE[chipColor]
                  const isSelected = selectedKeys.includes(m.key)
                  const isDisabled = !isSelected && selectedKeys.length >= MAX_METRICS
                  return (
                    <button
                      key={m.key}
                      onClick={() => !isDisabled && toggleMetric(m.key)}
                      title={`Jugador: ${fmtRaw(m.jugadorRaw)} | Promedio: ${fmtRaw(m.promedioRaw)}`}
                      style={{
                        padding: '7px 8px',
                        borderRadius: 9,
                        border: `1px solid ${isSelected ? pal.border : 'rgba(255,255,255,0.05)'}`,
                        borderLeft: `3px solid ${pal.dot}`,
                        backgroundColor: isSelected ? pal.bgSelected : pal.bg,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        opacity: isDisabled ? 0.4 : 1,
                        textAlign: 'left',
                        transition: 'all 0.12s',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: pal.dot, flexShrink: 0 }} />}
                        <span style={{ fontSize: 9.5, fontWeight: isSelected ? 700 : 400, color: isSelected ? pal.textSelected : '#9CA3AF', lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {m.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 9, color: isSelected ? pal.textSelected + 'CC' : '#374151', display: 'flex', gap: 4 }}>
                        <span style={{ fontWeight: 700 }}>{fmtRaw(m.jugadorRaw)}</span>
                        {m.promedioRaw != null && <span style={{ opacity: 0.6 }}>vs {fmtRaw(m.promedioRaw)}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>

              {displayMetrics.length === 0 && (
                <div style={{ textAlign: 'center', color: '#374151', fontSize: 11, padding: '20px 0' }}>
                  Sin métricas con ese filtro
                </div>
              )}
            </>
          )}
        </div>

        {/* ─── Preview chips ─── */}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {showLogo && <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#22C55E' }} />
            <span style={{ fontSize: 10.5, color: '#22C55E' }}>Logo incluido</span>
          </div>}
          {hasVideo && <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#22C55E' }} />
            <span style={{ fontSize: 10.5, color: '#22C55E' }}>Video Report activo</span>
          </div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, paddingLeft: 10, paddingRight: 10, paddingTop: 4, paddingBottom: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#22C55E' }} />
            <span style={{ fontSize: 10.5, color: '#22C55E' }}>{finalMetricCount} métricas · {metricMode === 'auto' ? 'auto' : 'manual'}</span>
          </div>
        </div>

        {/* ─── Confirm ─── */}
        <button
          onClick={handleConfirm}
          disabled={metricMode === 'manual' && selectedKeys.length === 0}
          style={{ width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: 0.3, boxShadow: '0 4px 16px rgba(34,197,94,0.25)', opacity: (metricMode === 'manual' && selectedKeys.length === 0) ? 0.5 : 1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zM8 12l3 3 5-5" />
          </svg>
          Generar informe
        </button>
      </div>
    </div>
  )
}
