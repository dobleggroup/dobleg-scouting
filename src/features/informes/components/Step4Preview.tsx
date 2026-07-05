import { useEffect, useRef, useState } from 'react'
import type { Informe, InformeContent, MetricStat, MetricDef, ScatterAssignment } from '@/features/informes/types'
import { exportInformePDF } from '@/features/informes/exportInformePDF'
import { exportInformeHTML } from '@/features/informes/exportInformeHTML'
import InformeRadar from './charts/InformeRadar'
import InformeBars from './charts/InformeBars'
import InformeScatter from './charts/InformeScatter'
import InformeNumberCard from './charts/InformeNumberCard'

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseYouTubeId(url: string): string | null {
  if (!url) return null
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
    /youtube\.com\/embed\/([\w-]{6,})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

async function loadLogoDataUrl(path: string): Promise<string | undefined> {
  try {
    const res = await fetch(path)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
  } catch {
    return undefined
  }
}

function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '')
  return parts.join('') || '?'
}

const TABS = [
  { id: 'radar', label: 'Radar' },
  { id: 'bars', label: 'Barras' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'video', label: 'Video' },
  { id: 'carrera', label: 'Carrera' },
  { id: 'comparaciones', label: 'Comparaciones' },
] as const
type TabId = typeof TABS[number]['id']

// ─── Doble G dark theme primitives ─────────────────────────────────────────

const DG = {
  bg: '#08090B',
  card: '#0F1114',
  cardInner: '#14171B',
  border: 'rgba(255,255,255,0.08)',
  hairline: 'rgba(255,255,255,0.06)',
  text: '#F5F7FA',
  muted: '#8A9099',
  green: '#22C55E',
  greenHover: '#4ADE80',
  amber: '#F5C451',
}

/** Best-effort brand logo — se oculta sola si `/brand/logo-white.png` no carga. */
function BrandLogo({ height = 22 }: { height?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src="/brand/logo-white.png"
      alt="Doble G"
      style={{ height, width: 'auto', display: 'block' }}
      onError={() => setFailed(true)}
    />
  )
}

/** Título de sección: chico, uppercase, tracking amplio, con un tick verde corto. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="block w-6 h-[2px] rounded-full mb-1.5" style={{ backgroundColor: DG.green }} />
      <h3
        className="text-[11px] font-bold uppercase"
        style={{ letterSpacing: '0.12em', color: DG.muted }}
      >
        {children}
      </h3>
    </div>
  )
}

// ─── Left rail ──────────────────────────────────────────────────────────────

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" style={{ borderColor: DG.hairline }}>
      <dt className="flex-shrink-0" style={{ color: DG.muted }}>{label}</dt>
      <dd className="font-medium text-right truncate" style={{ color: DG.text }}>{value || '—'}</dd>
    </div>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: DG.muted }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: DG.text }}>{value}</span>
    </div>
  )
}

/** Bloque de estadísticas principales cargadas en el paso 3 (Rating/PJ/Minutos/Goles/Asistencias). */
function renderMainStats(content: InformeContent) {
  if (content.hideMainStats) return null

  const items = [
    { label: 'Rating', value: content.rating },
    { label: 'PJ', value: content.pj },
    { label: 'Minutos', value: content.minutos },
    { label: 'Goles', value: content.goles },
    { label: 'Asistencias', value: content.asistencias },
  ].filter(i => i.value !== '')

  if (items.length === 0) return null

  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: '0.12em', color: DG.muted }}>
        Estadísticas principales
      </h4>
      <div className="grid grid-cols-3 gap-3 text-sm">
        {items.map(i => (
          <StatItem key={i.label} label={i.label} value={i.value} />
        ))}
      </div>
    </div>
  )
}

function PlayerRail({ informe }: { informe: Informe }) {
  const { content } = informe
  const rolYPosicion = [content.posicion, content.rol].filter(Boolean).join(' · ')
  return (
    <div className="rounded-[18px] border p-5 space-y-4 h-fit" style={{ borderColor: DG.border, backgroundColor: DG.card }}>
      <div className="flex justify-center">
        <BrandLogo height={20} />
      </div>
      <div className="flex flex-col items-center text-center gap-3">
        {informe.fotoDataUrl ? (
          <img
            src={informe.fotoDataUrl}
            alt={content.nombre || 'Jugador'}
            className="w-28 h-28 rounded-full object-cover border-2"
            style={{ borderColor: 'rgba(34,197,94,0.35)' }}
          />
        ) : (
          <div
            className="w-28 h-28 rounded-full flex items-center justify-center text-2xl font-black border-2"
            style={{ backgroundColor: DG.cardInner, color: DG.muted, borderColor: 'rgba(34,197,94,0.35)' }}
          >
            {initials(content.nombre || '?')}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold" style={{ color: DG.text }}>{content.nombre || 'Sin nombre'}</h2>
          {rolYPosicion && (
            <p className="text-sm mt-0.5" style={{ color: DG.muted }}>{rolYPosicion}</p>
          )}
        </div>
      </div>
      <dl className="text-sm">
        <DataRow label="Club" value={content.club} />
        <DataRow label="Liga" value={content.liga} />
        <DataRow label="Edad" value={content.edad} />
        <DataRow label="País" value={content.nacionalidad} />
        <DataRow label="Contrato" value={content.contrato} />
        <DataRow label="Representante" value={content.representante} />
      </dl>
      {renderMainStats(content)}
      {content.transfermarktUrl && (
        <a
          href={content.transfermarktUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-center w-full px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors"
          style={{ borderColor: DG.green, color: DG.green }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          Transfermarkt ↗
        </a>
      )}
    </div>
  )
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Step4PreviewProps {
  informe: Informe
  stats: MetricStat[]
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  onBack: () => void
  onSave: () => void
}

export default function Step4Preview({ informe, stats, matrix, defs, onBack, onSave }: Step4PreviewProps) {
  const [tab, setTab] = useState<TabId>('radar')
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const exportMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { content } = informe
  const youtubeId = parseYouTubeId(content.videoUrl || '')
  const mainStatsBlock = renderMainStats(content)

  useEffect(() => {
    return () => {
      if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current)
    }
  }, [])

  function showExportMsg(msg: { ok: boolean; text: string }) {
    if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current)
    setExportMsg(msg)
    exportMsgTimer.current = setTimeout(() => setExportMsg(null), 3500)
  }

  const matches = content.ultimos5.filter(m => m.rival || m.resultado || m.rating || m.minutos)
  const comparables = content.comparables.filter(c => c.jugador || c.club || c.rating || c.delta)

  // ── Renders compartidos entre las tabs visibles y el contenedor oculto de export ──

  function renderHeader() {
    return (
      <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: DG.border }}>
        <BrandLogo height={26} />
        {informe.fotoDataUrl ? (
          <img
            src={informe.fotoDataUrl}
            alt={content.nombre || 'Jugador'}
            className="w-16 h-16 rounded-full object-cover border-2"
            style={{ borderColor: 'rgba(34,197,94,0.35)' }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-black"
            style={{ backgroundColor: DG.cardInner, color: DG.muted }}
          >
            {initials(content.nombre || '?')}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold truncate" style={{ color: DG.text }}>{content.nombre || 'Sin nombre'}</h1>
          <p className="text-sm truncate" style={{ color: DG.muted }}>
            {[content.club, content.posicion, content.rol].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>
    )
  }

  function renderRadar() {
    return (
      <div data-informe-section>
        <SectionTitle>Radar comparativo</SectionTitle>
        <p className="text-xs mb-4" style={{ color: DG.muted }}>
          {informe.contextoComparacion || 'Sin contexto de comparación definido'}
        </p>
        <InformeRadar informe={informe} stats={stats} matrix={matrix} defs={defs} />
        {informe.charts.numbers.length > 0 && (
          <div className="mt-6">
            <h4 className="text-[11px] font-bold uppercase mb-3" style={{ letterSpacing: '0.12em', color: DG.muted }}>
              Números clave
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {informe.charts.numbers.map(key => {
                const stat = stats.find(s => s.def.key === key)
                return stat ? <InformeNumberCard key={key} stat={stat} /> : null
              })}
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderBars() {
    return (
      <div data-informe-section>
        <SectionTitle>Barras comparativas</SectionTitle>
        <InformeBars stats={stats} keys={informe.charts.bar} />
      </div>
    )
  }

  function renderScatterItem(sc: ScatterAssignment, idx: number) {
    return (
      <div
        key={idx}
        data-informe-section
        className="rounded-xl p-4 border"
        style={{ borderColor: DG.border, backgroundColor: DG.cardInner }}
      >
        <InformeScatter scatter={sc} matrix={matrix} defs={defs} protagonistIndex={informe.protagonistIndex} />
      </div>
    )
  }

  function renderCarrera() {
    return (
      <div data-informe-section className="space-y-5">
        <div>
          <SectionTitle>Últimos 5 partidos</SectionTitle>
          {matches.length === 0 ? (
            <p className="text-sm italic" style={{ color: DG.muted }}>Sin partidos cargados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: DG.muted, borderColor: DG.border }}>
                    <th className="py-2 font-medium">Rival</th>
                    <th className="py-2 font-medium">Resultado</th>
                    <th className="py-2 font-medium">Rating</th>
                    <th className="py-2 font-medium">Minutos</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m, idx) => (
                    <tr key={idx} className="border-b last:border-0" style={{ borderColor: DG.hairline }}>
                      <td className="py-2" style={{ color: DG.text }}>{m.rival || '—'}</td>
                      <td className="py-2" style={{ color: DG.text }}>{m.resultado || '—'}</td>
                      <td className="py-2" style={{ color: DG.text }}>{m.rating || '—'}</td>
                      <td className="py-2" style={{ color: DG.text }}>{m.minutos || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ backgroundColor: DG.cardInner }}>
            <p className="text-xs mb-1" style={{ color: DG.muted }}>Contrato</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: DG.text }}>{content.contrato || '—'}</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: DG.cardInner }}>
            <p className="text-xs mb-1" style={{ color: DG.muted }}>Valor de mercado</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: DG.text }}>{content.valorMercado || '—'}</p>
          </div>
        </div>
      </div>
    )
  }

  function renderComparaciones() {
    return (
      <div data-informe-section className="space-y-5">
        {!content.hideComparables && (
          <div>
            <SectionTitle>Comparables</SectionTitle>
            {comparables.length === 0 ? (
              <p className="text-sm italic" style={{ color: DG.muted }}>Sin comparables cargados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: DG.muted, borderColor: DG.border }}>
                      <th className="py-2 font-medium">Jugador</th>
                      <th className="py-2 font-medium">Club</th>
                      <th className="py-2 font-medium">Rating</th>
                      <th className="py-2 font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparables.map((c, idx) => (
                      <tr key={idx} className="border-b last:border-0" style={{ borderColor: DG.hairline }}>
                        <td className="py-2" style={{ color: DG.text }}>{c.jugador || '—'}</td>
                        <td className="py-2" style={{ color: DG.text }}>{c.club || '—'}</td>
                        <td className="py-2" style={{ color: DG.text }}>{c.rating || '—'}</td>
                        <td className="py-2" style={{ color: DG.text }}>{c.delta || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {content.comparaciones && (
          <div>
            <h4 className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: '0.12em', color: DG.muted }}>
              Notas
            </h4>
            <p className="text-sm whitespace-pre-line" style={{ color: DG.text }}>{content.comparaciones}</p>
          </div>
        )}
      </div>
    )
  }

  async function doExport() {
    if (!printRef.current || exporting) return
    setExporting(true)
    try {
      // El PDF exportado replica el mismo tema oscuro Doble G del contenedor oculto.
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      await exportInformePDF({
        rootEl: printRef.current,
        nombre: content.nombre || 'informe',
        isDark: true,
        logoDataUrl,
      })
      showExportMsg({ ok: true, text: 'PDF generado ✓' })
    } catch (e) {
      console.error('Export PDF error:', e)
      showExportMsg({ ok: false, text: 'No se pudo generar el PDF. Probá de nuevo o revisá la consola.' })
    } finally {
      setExporting(false)
    }
  }

  async function doShare() {
    if (sharing) return
    setSharing(true)
    try {
      // El HTML exportado es siempre dark premium, independiente del tema de la app.
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      exportInformeHTML({ informe, stats, matrix, defs, logoDataUrl })
      showExportMsg({ ok: true, text: 'Listo para compartir ✓' })
    } catch (e) {
      console.error('Export HTML error:', e)
      showExportMsg({ ok: false, text: 'No se pudo generar el informe. Probá de nuevo o revisá la consola.' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="relative rounded-[28px] overflow-hidden" style={{ backgroundColor: DG.bg }}>
      {/* ── Glow y textura de fondo — fijos, independientes del tema de la app ── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(1100px 560px at 12% -8%, rgba(34,197,94,0.16), transparent 60%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(900px 500px at 100% 110%, rgba(34,197,94,0.08), transparent 60%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 p-4 sm:p-6 space-y-4">
        {/* ── Barra de acciones ── */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors"
            style={{ borderColor: DG.border, color: DG.muted }}
            onMouseEnter={e => { e.currentTarget.style.color = DG.text; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
            onMouseLeave={e => { e.currentTarget.style.color = DG.muted; e.currentTarget.style.borderColor = DG.border }}
          >
            ← Editar
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors"
            style={{ borderColor: DG.border, color: DG.muted }}
            onMouseEnter={e => { e.currentTarget.style.color = DG.text; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
            onMouseLeave={e => { e.currentTarget.style.color = DG.muted; e.currentTarget.style.borderColor = DG.border }}
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={doExport}
            disabled={exporting}
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ borderColor: DG.green, color: DG.green }}
            onMouseEnter={e => { if (!exporting) e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)' }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {exporting ? 'Exportando…' : 'Exportar PDF'}
          </button>
          <button
            type="button"
            onClick={doShare}
            disabled={sharing}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: DG.green, color: '#08090B' }}
            onMouseEnter={e => { if (!sharing) e.currentTarget.style.backgroundColor = DG.greenHover }}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = DG.green)}
          >
            {sharing ? 'Generando…' : 'Compartir'}
          </button>
        </div>

        {exportMsg && (
          <p className="text-sm font-medium" style={{ color: exportMsg.ok ? DG.greenHover : DG.amber }}>
            {exportMsg.text}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <PlayerRail informe={informe} />

          <div className="rounded-[18px] border p-5 min-w-0" style={{ borderColor: DG.border, backgroundColor: DG.card }}>
            {/* ── Tabs ── */}
            <div className="flex items-center gap-1 border-b mb-5 overflow-x-auto" style={{ borderColor: DG.border }}>
              {TABS.map(t => {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className="px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
                    style={{
                      color: active ? DG.green : DG.muted,
                      borderColor: active ? DG.green : 'transparent',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = DG.text }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = DG.muted }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* ── Radar ── */}
            {tab === 'radar' && renderRadar()}

            {/* ── Barras ── */}
            {tab === 'bars' && renderBars()}

            {/* ── Scatter ── */}
            {tab === 'scatter' && (
              <div>
                <SectionTitle>Dispersión en el contexto</SectionTitle>
                {informe.charts.scatters.length === 0 ? (
                  <p className="text-sm italic py-8 text-center" style={{ color: DG.muted }}>
                    Agregá scatter plots en el paso 2 para verlos acá.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {informe.charts.scatters.map((sc, idx) => renderScatterItem(sc, idx))}
                  </div>
                )}
              </div>
            )}

            {/* ── Video ── */}
            {tab === 'video' && (
              <div>
                <SectionTitle>Video</SectionTitle>
                {youtubeId ? (
                  <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${youtubeId}`}
                      title="Video del jugador"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p
                    className="text-sm italic py-12 text-center border-2 border-dashed rounded-xl"
                    style={{ color: DG.muted, borderColor: 'rgba(255,255,255,0.12)' }}
                  >
                    Sin video cargado. Agregá una URL de YouTube en el paso 3.
                  </p>
                )}
              </div>
            )}

            {/* ── Carrera ── */}
            {tab === 'carrera' && renderCarrera()}

            {/* ── Comparaciones ── */}
            {tab === 'comparaciones' && renderComparaciones()}
          </div>
        </div>

        {/* ── Contenedor oculto: apila TODAS las secciones para el export a PDF ── */}
        <div
          ref={printRef}
          aria-hidden
          className="fixed left-[-99999px] top-0 w-[794px] p-6 space-y-6"
          style={{ backgroundColor: DG.card, color: DG.text }}
        >
          <div data-informe-section>{renderHeader()}</div>
          {mainStatsBlock && <div data-informe-section>{mainStatsBlock}</div>}
          {renderRadar()}
          {renderBars()}
          {informe.charts.scatters.map((sc, idx) => renderScatterItem(sc, idx))}
          {renderCarrera()}
          {renderComparaciones()}
        </div>
      </div>
    </div>
  )
}
