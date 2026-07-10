import { useEffect, useRef, useState } from 'react'
import type { Informe, InformeContent, MetricStat, MetricDef, ScatterAssignment } from '@/features/informes/types'
import { exportInformePDF } from '@/features/informes/exportInformePDF'
import { exportInformeHTML, buildInformeHtml, type EvolutionChartExport } from '@/features/informes/exportInformeHTML'
import { uploadInformeHtml } from '@/features/informes/shareInforme'
import MetricEvolutionChart from '@/components/charts/MetricEvolutionChart'
import { lineSvg } from '@/features/informes/chartSvg'
import type { WyscoutPoint } from '@/services/wyscoutEvolutionService'
import InformeRadar from './charts/InformeRadar'
import InformeComparisonRadar from './charts/InformeComparisonRadar'
import InformeRatingGauge from './charts/InformeRatingGauge'
import InformeChartHelp from './charts/InformeChartHelp'
import InformeLineChart from './charts/InformeLineChart'
import InformeBars from './charts/InformeBars'
import InformeScatter from './charts/InformeScatter'
import InformeNumberCard from './charts/InformeNumberCard'
import { comparisonTable, comparisonWinCounts, topStrengths } from '@/features/informes/chartData'
import { useInformeEnrichment, type InformeEnrichment } from '@/features/informes/useInformeEnrichment'
import { t, translateMetric, translateInjury, isRtl, LANGS, type Lang } from '@/features/informes/i18n'
import { normalizeForSearch } from '@/lib/search'

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

const TAB_IDS = ['general', 'radar', 'bars', 'scatter', 'fisico', 'evolutivas', 'video', 'carrera', 'comparaciones'] as const
type TabId = typeof TAB_IDS[number]

// Serie Wyscout ya resuelta para una métrica del informe (label/unidad + puntos).
interface EvoChart { key: string; label: string; unit: '%' | ''; series: WyscoutPoint[] }

/** Fecha corta "3 May" para el eje X del gráfico exportado (mismo criterio que MetricEvolutionChart). */
function evoShortDate(d: string): string {
  const dt = new Date(d)
  const m = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return isNaN(dt.getTime()) ? d : `${dt.getDate()} ${m[dt.getMonth()]}`
}

/** Mapea las series resueltas al formato que consume el export HTML/PDF (`lineSvg`). */
function evoToExport(charts: EvoChart[]): EvolutionChartExport[] {
  return charts.map(ec => ({
    label: ec.label,
    unit: ec.unit,
    points: ec.series
      .filter(s => s.value !== null)
      .map(s => ({ label: evoShortDate(s.date), value: s.value as number })),
  }))
}

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

function BrandLogo({ height = 22 }: { height?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img src="/brand/logo-white.png" alt="Doble G" style={{ height, width: 'auto', display: 'block' }} onError={() => setFailed(true)} />
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <span className="block w-6 h-[2px] rounded-full mb-1.5" style={{ backgroundColor: DG.green }} />
      <h3 className="text-[11px] font-bold uppercase" style={{ letterSpacing: '0.12em', color: DG.muted }}>{children}</h3>
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0" style={{ borderColor: DG.hairline }}>
      <dt className="flex-shrink-0" style={{ color: DG.muted }}>{label}</dt>
      <dd className="font-medium text-right truncate" style={{ color: DG.text }}>{value || '—'}</dd>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 text-center border" style={{ borderColor: DG.border, backgroundColor: DG.cardInner }}>
      <p className="text-lg font-bold tabular-nums" style={{ color: DG.text }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide" style={{ color: DG.muted }}>{label}</p>
    </div>
  )
}

/** Estadísticas principales (Rating/PJ/Minutos/Goles/Asistencias) cargadas en el paso 3. */
function renderMainStats(content: InformeContent, lang: Lang) {
  if (content.hideMainStats) return null
  const items = [
    ...(content.hideRating ? [] : [{ label: t(lang, 's_rating'), value: content.rating }]),
    { label: t(lang, 's_pj'), value: content.pj },
    { label: t(lang, 's_minutes'), value: content.minutos },
    { label: t(lang, 's_goals'), value: content.goles },
    { label: t(lang, 's_assists'), value: content.asistencias },
  ].filter(i => i.value !== '')
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: '0.12em', color: DG.muted }}>
        {t(lang, 't_mainStats')}
      </h4>
      <div className="grid grid-cols-3 gap-3 text-sm">
        {items.map(i => (
          <div key={i.label} className="flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] uppercase tracking-wide" style={{ color: DG.muted }}>{i.label}</span>
            <span className="font-semibold tabular-nums" style={{ color: DG.text }}>{i.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerRail({ informe, lang }: { informe: Informe; lang: Lang }) {
  const { content } = informe
  const rolYPosicion = [content.posicion, content.rol].filter(Boolean).join(' · ')
  // Comparación de rating vs su posición en su liga (si hay percentil de la DB).
  const pct = informe.dbPercentile
  const ratingCompare =
    pct != null
      ? t(lang, 'm_ratingVsPos', {
          pct: Math.round(pct),
          pos: content.posicion || t(lang, 'r_agent') /* fallback improbable */,
          league: informe.dbLeagueName || content.liga || '—',
        })
      : null
  return (
    <div className="rounded-[18px] border p-5 space-y-4 h-fit" style={{ borderColor: DG.border, backgroundColor: DG.card }}>
      <div className="flex flex-col items-center text-center gap-3">
        {informe.fotoDataUrl ? (
          <img src={informe.fotoDataUrl} alt={content.nombre || 'Jugador'} className="w-28 h-28 rounded-full object-cover border-2" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />
        ) : (
          <div className="w-28 h-28 rounded-full flex items-center justify-center text-2xl font-black border-2" style={{ backgroundColor: DG.cardInner, color: DG.muted, borderColor: 'rgba(34,197,94,0.35)' }}>
            {initials(content.nombre || '?')}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold" style={{ color: DG.text }}>{content.nombre || 'Sin nombre'}</h2>
          {rolYPosicion && <p className="text-sm mt-0.5" style={{ color: DG.muted }}>{rolYPosicion}</p>}
        </div>
      </div>
      {!(content.hideRating || content.hideRatingGauge) && (
        <div>
          <InformeRatingGauge rating={content.rating} promedio={content.ratingPromedio} />
          {ratingCompare && (
            <p className="text-xs text-center mt-1.5 px-2 leading-snug" style={{ color: DG.muted }}>
              <span style={{ color: DG.green, fontWeight: 600 }}>{ratingCompare}</span>
            </p>
          )}
        </div>
      )}
      <dl className="text-sm">
        <DataRow label={t(lang, 'r_club')} value={content.club} />
        <DataRow label={t(lang, 'r_league')} value={content.liga} />
        <DataRow label={t(lang, 'r_age')} value={content.edad} />
        <DataRow label={t(lang, 'r_country')} value={content.nacionalidad} />
        <DataRow label={t(lang, 'r_contract')} value={content.contrato} />
        <DataRow label={t(lang, 'r_agent')} value={content.representante} />
      </dl>
      {renderMainStats(content, lang)}
      {content.transfermarktUrl && (
        <a href={content.transfermarktUrl} target="_blank" rel="noreferrer" className="block text-center w-full px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors" style={{ borderColor: DG.green, color: DG.green }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
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
  onChange: (informe: Informe) => void
}

export default function Step4Preview({ informe, stats, matrix, defs, onBack, onSave, onChange }: Step4PreviewProps) {
  const lang: Lang = informe.idioma ?? 'es'
  const rtl = isRtl(lang)
  const [tab, setTab] = useState<TabId>('general')
  const [evoView, setEvoView] = useState<'match' | 'week' | 'month'>('match')
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const exportMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { content } = informe
  const youtubeId = parseYouTubeId(content.videoUrl || '')
  const mainStatsBlock = renderMainStats(content, lang)
  const enrichment: InformeEnrichment = useInformeEnrichment(informe)
  const showFisico = enrichment.hasPhysical && !content.hideFisicoTab
  const showMarketEvo = enrichment.marketEvolution.length >= 2

  // ── Métricas evolutivas (Wyscout) — solo internos con jugador en la planilla ──
  const [evoCharts, setEvoCharts] = useState<EvoChart[]>([])
  const showEvolutivas = evoCharts.length > 0
  const evoKeysSig = JSON.stringify(informe.evolutionCharts ?? [])
  useEffect(() => {
    const keys = informe.evolutionCharts
    const name = informe.dbPlayerName
    if (!keys?.length || !name) { setEvoCharts([]); return }
    let alive = true
    import('@/services/wyscoutEvolutionService')
      .then(m => m.loadWyscoutEvolution())
      .then(w => {
        if (!alive) return
        if (!w.hasPlayer(name)) { setEvoCharts([]); return }
        const resolved = keys
          .map(k => {
            const def = w.metrics.find(mm => mm.key === k)
            if (!def) return null
            return { key: k, label: def.label, unit: def.unit, series: w.getSeries(name, k) } as EvoChart
          })
          .filter((c): c is EvoChart => c !== null)
        setEvoCharts(resolved)
      })
      .catch(() => { if (alive) setEvoCharts([]) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evoKeysSig, informe.dbPlayerName])

  useEffect(() => () => { if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current) }, [])

  function showExportMsg(msg: { ok: boolean; text: string }) {
    if (exportMsgTimer.current) clearTimeout(exportMsgTimer.current)
    setExportMsg(msg)
    exportMsgTimer.current = setTimeout(() => setExportMsg(null), 3500)
  }

  const matches = content.ultimos5.filter(m => m.rival || m.resultado || m.rating || m.minutos)
  const comparables = content.comparables.filter(c => c.jugador || c.club || c.rating || c.delta)

  const visibleTabs = TAB_IDS.filter(id =>
    id === 'fisico' ? showFisico : id === 'evolutivas' ? showEvolutivas : true,
  )

  // ── Renders ──

  function renderHeader() {
    // Sin logo acá: el export a PDF ya estampa el logo de marca arriba a la izquierda
    // de cada página. Ponerlo también en el header duplicaba el logo en la 1ª hoja.
    return (
      <div className="flex items-center gap-4 pb-4 border-b" style={{ borderColor: DG.border }}>
        {informe.fotoDataUrl ? (
          <img src={informe.fotoDataUrl} alt={content.nombre || 'Jugador'} className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: 'rgba(34,197,94,0.35)' }} />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-black" style={{ backgroundColor: DG.cardInner, color: DG.muted }}>
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

  function renderGeneral() {
    const c = enrichment.continuity
    const minStat = stats.find(s => normalizeForSearch(s.def.label) === 'minutos jugados')
      ?? stats.find(s => normalizeForSearch(s.def.label).includes('minutos'))
    const minPct = minStat?.percentile ?? null
    const hasAny = enrichment.levelEvolution.length >= 2 || !!c || enrichment.injuries.length > 0
    return (
      <div className="space-y-6">
        {enrichment.levelByMatch.length >= 2 && (() => {
          const evoOptions = ([
            { id: 'match' as const, points: enrichment.levelByMatch },
            { id: 'week' as const, points: enrichment.levelByWeek },
            { id: 'month' as const, points: enrichment.levelByMonth },
          ]).filter(o => o.points.length >= 2)
          const active = evoOptions.find(o => o.id === evoView) ?? evoOptions[0]
          return (
            <div data-informe-section>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <SectionTitle>{t(lang, 't_levelEvo')}</SectionTitle>
                {evoOptions.length > 1 && (
                  <div className="inline-flex rounded-lg p-0.5" style={{ backgroundColor: DG.cardInner, border: `1px solid ${DG.border}` }}>
                    {evoOptions.map(o => {
                      const on = o.id === active.id
                      return (
                        <button key={o.id} type="button" onClick={() => setEvoView(o.id)} className="px-3 py-1 rounded-md text-xs font-semibold transition-colors" style={{ backgroundColor: on ? DG.green : 'transparent', color: on ? '#08090B' : DG.muted }}>
                          {t(lang, `evo_${o.id}`)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <InformeLineChart points={active.points} color={DG.green} formatValue={v => v.toFixed(0)} showValues />
              <InformeChartHelp text={t(lang, 'help_level')} lang={lang} />
            </div>
          )
        })()}
        {c && (
          <div data-informe-section>
            <SectionTitle>{t(lang, 't_continuity')}</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatTile label={t(lang, 's_matches')} value={String(c.matches)} />
              <StatTile label={t(lang, 's_starts')} value={String(c.starts)} />
              <StatTile label={t(lang, 's_minutes')} value={c.minutes.toLocaleString('es-AR')} />
              <StatTile label={t(lang, 's_last5')} value={`${c.last5Played}/${c.last5Total}`} />
              <StatTile label={t(lang, 's_last10')} value={`${c.last10Played}/${c.last10Total}`} />
            </div>
            {minPct != null && (
              <p className="text-sm mt-3" style={{ color: DG.text }}>
                <span style={{ color: DG.green, fontWeight: 700 }}>▲ </span>
                {t(lang, 'm_playedMoreThan', { pct: minPct })}
              </p>
            )}
          </div>
        )}
        {(enrichment.injuries.length > 0 || c) && (
          <div data-informe-section>
            <SectionTitle>{t(lang, 't_injuries')}</SectionTitle>
            {enrichment.injuries.length === 0 ? (
              <p className="text-sm italic" style={{ color: DG.muted }}>{t(lang, 'm_noInjuries')}</p>
            ) : (
              <div className="space-y-1.5">
                {enrichment.injuries.slice(0, 8).map((inj, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: DG.cardInner }}>
                    <span className="text-sm font-medium" style={{ color: DG.text }}>{translateInjury(inj.type, lang)}</span>
                    <span className="text-xs tabular-nums" style={{ color: DG.muted }}>
                      {inj.start} → {inj.end || t(lang, 'm_present')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!hasAny && (
          <p className="text-sm italic" style={{ color: DG.muted }}>{t(lang, 'm_selectPlayerData')}</p>
        )}
      </div>
    )
  }

  function renderRadar() {
    return (
      <div className="space-y-6">
        <div data-informe-section>
          <SectionTitle>{t(lang, 't_radar')}</SectionTitle>
          <p className="text-xs mb-4" style={{ color: DG.muted }}>{informe.contextoComparacion || ''}</p>
          <InformeRadar informe={informe} stats={stats} matrix={matrix} defs={defs} lang={lang} />
          <InformeChartHelp text={t(lang, 'help_radar')} highlights={topStrengths(stats, informe.charts.radar).map(l => translateMetric(l, lang))} lang={lang} />
        </div>
        {informe.charts.numbers.length > 0 && (
          <div data-informe-section>
            <h4 className="text-[11px] font-bold uppercase mb-3" style={{ letterSpacing: '0.12em', color: DG.muted }}>{t(lang, 't_keyNumbers')}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {informe.charts.numbers.map(key => {
                const stat = stats.find(s => s.def.key === key)
                return stat ? <InformeNumberCard key={key} stat={stat} lang={lang} /> : null
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
        <SectionTitle>{t(lang, 't_bars')}</SectionTitle>
        <InformeBars stats={stats} keys={informe.charts.bar} lang={lang} />
        <InformeChartHelp text={t(lang, 'help_bars')} highlights={topStrengths(stats, informe.charts.bar).map(l => translateMetric(l, lang))} lang={lang} />
      </div>
    )
  }

  function renderScatterItem(sc: ScatterAssignment, idx: number) {
    return (
      <div key={idx} data-informe-section className="rounded-xl p-4 border" style={{ borderColor: DG.border, backgroundColor: DG.cardInner }}>
        <InformeScatter scatter={sc} matrix={matrix} defs={defs} protagonistIndex={informe.protagonistIndex} lang={lang} />
      </div>
    )
  }

  function renderCarrera() {
    return (
      <div className="space-y-5">
        <div data-informe-section>
          <SectionTitle>{t(lang, 't_last5')}</SectionTitle>
          {matches.length === 0 ? (
            <p className="text-sm italic" style={{ color: DG.muted }}>{t(lang, 'm_noMatches')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: DG.muted, borderColor: DG.border }}>
                    <th className="py-2 font-medium">{t(lang, 'h_opponent')}</th>
                    <th className="py-2 font-medium">{t(lang, 'h_result')}</th>
                    <th className="py-2 font-medium">{t(lang, 's_rating')}</th>
                    <th className="py-2 font-medium">{t(lang, 's_minutes')}</th>
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
        <div data-informe-section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl p-3" style={{ backgroundColor: DG.cardInner }}>
            <p className="text-xs mb-1" style={{ color: DG.muted }}>{t(lang, 'r_contract')}</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: DG.text }}>{content.contrato || '—'}</p>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: DG.cardInner }}>
            <p className="text-xs mb-1" style={{ color: DG.muted }}>{t(lang, 'r_marketValue')}</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: DG.text }}>{content.valorMercado || '—'}</p>
          </div>
        </div>
        {showMarketEvo && (
          <div data-informe-section>
            <SectionTitle>{t(lang, 't_marketEvo')}</SectionTitle>
            <InformeLineChart points={enrichment.marketEvolution} color={DG.amber} formatValue={v => `€${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`} />
            <InformeChartHelp text={t(lang, 'help_market')} lang={lang} />
          </div>
        )}
      </div>
    )
  }

  function renderFisico() {
    const plural = enrichment.physicalMatches === 1 ? '' : 's'
    // Auto-oculta las métricas en 0 (ej. 0 sprints).
    const tiles = enrichment.physicalTiles.filter(t2 => !t2.zero)
    return (
      <div className="space-y-6">
        <div data-informe-section>
          <SectionTitle>{t(lang, 't_phys')}</SectionTitle>
          <p className="text-xs mb-3" style={{ color: DG.muted }}>{`${t(lang, 'm_avg')} · ${enrichment.physicalMatches} ${t(lang, 's_matches').toLowerCase()}${plural && lang === 'es' ? '' : ''}`}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tiles.map(tl => (
              <div key={tl.label} className="rounded-xl p-3 text-center border" style={{ borderColor: DG.border, backgroundColor: DG.cardInner }}>
                <p className="text-base font-bold tabular-nums" style={{ color: DG.text }}>{tl.value}</p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: DG.muted }}>{tl.label}</p>
              </div>
            ))}
          </div>
        </div>
        {!content.hideFisicoCharts && enrichment.physicalEvolution.length >= 2 && (
          <div data-informe-section>
            <div className="mb-4">
              <h4 className="text-[11px] font-bold uppercase mb-3" style={{ letterSpacing: '0.12em', color: DG.muted }}>{t(lang, 't_phys_intensity')}</h4>
              <InformeLineChart points={enrichment.physicalEvolution} color="#38BDF8" formatValue={v => v.toFixed(0)} />
            </div>
            {/* El texto de ayuda habla de "la línea": solo tiene sentido si el gráfico se muestra. */}
            <InformeChartHelp text={t(lang, 'help_phys')} lang={lang} />
          </div>
        )}
      </div>
    )
  }

  // Métricas evolutivas Wyscout. En pantalla usa MetricEvolutionChart (Recharts);
  // en el contenedor oculto del PDF usa el SVG puro `lineSvg` (Recharts no mide
  // ancho fuera de pantalla), igual que el resto de gráficos del export.
  function renderEvolutivas(print = false) {
    if (evoCharts.length === 0) return null
    return (
      <div className="space-y-6">
        <div data-informe-section={print ? '' : undefined}>
          <SectionTitle>{t(lang, 't_evolutivas')}</SectionTitle>
          <p className="text-xs mb-4" style={{ color: DG.muted }}>{t(lang, 'm_evolutivas_sub')}</p>
        </div>
        {evoCharts.map(ec => (
          <div key={ec.key} data-informe-section={print ? '' : undefined}>
            <h4 className="text-[11px] font-bold uppercase mb-3" style={{ letterSpacing: '0.12em', color: DG.muted }}>
              {ec.label}{ec.unit === '%' ? ' (%)' : ''}
            </h4>
            {print ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: lineSvg({
                    points: ec.series.filter(s => s.value !== null).map(s => ({ label: evoShortDate(s.date), value: s.value as number })),
                    unit: ec.unit,
                  }),
                }}
              />
            ) : (
              <MetricEvolutionChart series={ec.series} unit={ec.unit} label={ec.label} />
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderComparisonSummary() {
    if ((informe.comparePlayerIndices?.length ?? 0) === 0) return null
    const table = comparisonTable(informe, matrix, defs)
    if (table.rows.length === 0) return null
    const { wins, total } = comparisonWinCounts(table)
    const leaderWins = Math.max(...wins.map(w => w.wins))
    return (
      <div className="space-y-5">
        <div data-informe-section>
          <SectionTitle>{t(lang, 't_radar')}</SectionTitle>
          <InformeComparisonRadar informe={informe} matrix={matrix} defs={defs} lang={lang} />
        </div>
        <div data-informe-section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {wins.map(w => {
            const leads = w.wins === leaderWins && leaderWins > 0
            return (
              <div key={w.name || w.color} className="rounded-xl p-3 text-center border" style={{ borderColor: leads ? w.color : DG.border, backgroundColor: DG.cardInner }}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: w.color }} />
                  <span className="text-xs font-medium truncate" style={{ color: DG.text }}>{w.name || 'Sin nombre'}</span>
                </div>
                <p className="text-lg font-bold tabular-nums" style={{ color: leads ? w.color : DG.text }}>
                  {w.wins}<span className="text-xs font-normal" style={{ color: DG.muted }}> / {total}</span>
                </p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: DG.muted }}>{t(lang, 'm_metricsWon')}</p>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderPlayerComparisonTable() {
    if ((informe.comparePlayerIndices?.length ?? 0) === 0) return null
    const table = comparisonTable(informe, matrix, defs)
    if (table.rows.length === 0) return null
    return (
      <div data-informe-section>
        <SectionTitle>{t(lang, 't_detail')}</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: DG.muted, borderColor: DG.border }}>
                <th className="py-2 font-medium">{t(lang, 'h_metric')}</th>
                {table.players.map(p => (
                  <th key={p.idx} className="py-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span style={{ color: DG.text }}>{p.name || 'Sin nombre'}</span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, idx) => (
                <tr key={idx} className="border-b last:border-0" style={{ borderColor: DG.hairline }}>
                  <td className="py-2" style={{ color: DG.muted }}>{translateMetric(row.label, lang)}</td>
                  {row.cells.map((cell, ci) => (
                    <td key={ci} className="py-2 tabular-nums" style={{ color: cell.best ? DG.green : DG.text, fontWeight: cell.best ? 700 : 400 }}>{cell.value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function renderComparaciones() {
    const hasCompare = (informe.comparePlayerIndices?.length ?? 0) > 0
    return (
      <div className="space-y-5">
        {!hasCompare && (
          <p data-informe-section className="text-sm italic" style={{ color: DG.muted }}>{t(lang, 'help_compar')}</p>
        )}
        {renderComparisonSummary()}
        {hasCompare && <div data-informe-section><InformeChartHelp text={t(lang, 'help_compar')} lang={lang} /></div>}
        {renderPlayerComparisonTable()}
        {!content.hideComparables && (
          <div data-informe-section>
            <SectionTitle>{t(lang, 't_comparables')}</SectionTitle>
            {comparables.length === 0 ? (
              <p className="text-sm italic" style={{ color: DG.muted }}>{t(lang, 'm_noComparables')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide border-b" style={{ color: DG.muted, borderColor: DG.border }}>
                      <th className="py-2 font-medium">{t(lang, 'h_player')}</th>
                      <th className="py-2 font-medium">{t(lang, 'r_club')}</th>
                      <th className="py-2 font-medium">{t(lang, 's_rating')}</th>
                      <th className="py-2 font-medium">{t(lang, 'h_delta')}</th>
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
          <div data-informe-section>
            <h4 className="text-[11px] font-bold uppercase mb-2" style={{ letterSpacing: '0.12em', color: DG.muted }}>{t(lang, 't_notes')}</h4>
            <p className="text-sm whitespace-pre-line" style={{ color: DG.text }}>{content.comparaciones}</p>
          </div>
        )}
      </div>
    )
  }

  function renderTab(id: TabId) {
    switch (id) {
      case 'general': return renderGeneral()
      case 'radar': return renderRadar()
      case 'bars': return renderBars()
      case 'scatter':
        return (
          <div>
            <SectionTitle>{t(lang, 't_scatter')}</SectionTitle>
            {informe.charts.scatters.length === 0 ? (
              <p className="text-sm italic py-8 text-center" style={{ color: DG.muted }}>Agregá scatter plots en el paso 2 para verlos acá.</p>
            ) : (
              <div className="space-y-6">{informe.charts.scatters.map((sc, idx) => renderScatterItem(sc, idx))}</div>
            )}
            {informe.charts.scatters.length > 0 && <InformeChartHelp text={t(lang, 'help_scatter')} lang={lang} />}
          </div>
        )
      case 'fisico': return renderFisico()
      case 'evolutivas': return renderEvolutivas()
      case 'video':
        return (
          <div>
            <SectionTitle>{t(lang, 'tab_video')}</SectionTitle>
            {youtubeId ? (
              <>
                <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                  <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${youtubeId}`} title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
                <a href={`https://www.youtube.com/watch?v=${youtubeId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: '#FF0000', color: '#fff' }}>▶ {t(lang, 'v_youtube')}</a>
              </>
            ) : content.videoUrl ? (
              <a href={content.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold" style={{ backgroundColor: '#FF0000', color: '#fff' }}>▶ {t(lang, 'v_watch')}</a>
            ) : (
              <p className="text-sm italic py-12 text-center border-2 border-dashed rounded-xl" style={{ color: DG.muted, borderColor: 'rgba(255,255,255,0.12)' }}>{t(lang, 'm_noVideo')}</p>
            )}
          </div>
        )
      case 'carrera': return renderCarrera()
      case 'comparaciones': return renderComparaciones()
    }
  }

  async function doExport() {
    if (!printRef.current || exporting) return
    setExporting(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      await exportInformePDF({ rootEl: printRef.current, nombre: content.nombre || 'informe', isDark: true, logoDataUrl })
      showExportMsg({ ok: true, text: 'PDF ✓' })
    } catch (e) {
      console.error('Export PDF error:', e)
      showExportMsg({ ok: false, text: 'No se pudo generar el PDF. Probá de nuevo o revisá la consola.' })
    } finally {
      setExporting(false)
    }
  }

  // Descarga el HTML autocontenido: se abre SIN internet (todo menos el video de
  // YouTube, que siempre necesita conexión — igual queda el link "Ver en YouTube").
  async function doDownloadHtml() {
    if (sharing) return
    setSharing(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      exportInformeHTML({ informe, stats, matrix, defs, logoDataUrl, enrichment, evolution: evoToExport(evoCharts) })
      showExportMsg({ ok: true, text: 'HTML descargado ✓ (se abre sin internet)' })
    } catch (e) {
      console.error('Export HTML error:', e)
      showExportMsg({ ok: false, text: 'No se pudo generar el HTML. Probá de nuevo o revisá la consola.' })
    } finally {
      setSharing(false)
    }
  }

  // Sube el HTML a Storage y devuelve un link público para mandar; el que lo
  // recibe lo abre en el navegador y navega las pestañas (necesita internet).
  async function doShareLink() {
    if (sharing) return
    setSharing(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      const html = buildInformeHtml({ informe, stats, matrix, defs, logoDataUrl, enrichment, evolution: evoToExport(evoCharts) })
      const url = await uploadInformeHtml(html, informe.id, content.nombre || 'informe')
      setShareUrl(url)
      try { await navigator.clipboard.writeText(url) } catch { /* el portapapeles puede fallar sin https/gesto */ }
      showExportMsg({ ok: true, text: 'Link generado y copiado ✓' })
    } catch (e) {
      console.error('Share link error:', e)
      showExportMsg({ ok: false, text: 'No se pudo generar el link. ¿Está creado el bucket "informes-compartidos" en Supabase?' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="relative rounded-[28px] overflow-hidden" style={{ backgroundColor: DG.bg }} dir={rtl ? 'rtl' : 'ltr'}>
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(1100px 560px at 12% -8%, rgba(34,197,94,0.16), transparent 60%)' }} />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 500px at 100% 110%, rgba(34,197,94,0.08), transparent 60%)' }} />

      <div className="relative z-10 p-4 sm:p-6 space-y-4">
        {/* ── Barra de acciones ── */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors" style={{ borderColor: DG.border, color: DG.muted }} onMouseEnter={e => { e.currentTarget.style.color = DG.text; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }} onMouseLeave={e => { e.currentTarget.style.color = DG.muted; e.currentTarget.style.borderColor = DG.border }}>
            ← Editar
          </button>
          <div className="hidden sm:block flex-1" />
          {/* Selector de idioma (sutil) */}
          <div className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5" style={{ borderColor: DG.border }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={DG.muted} strokeWidth={1.6}>
              <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
            </svg>
            <select
              value={lang}
              onChange={e => onChange({ ...informe, idioma: e.target.value as Lang })}
              className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer"
              style={{ color: DG.text }}
              aria-label="Idioma del informe"
            >
              {LANGS.map(l => (
                <option key={l.code} value={l.code} style={{ color: '#000' }}>{l.flag} {l.label}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={onSave} className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors" style={{ borderColor: DG.border, color: DG.muted }} onMouseEnter={e => { e.currentTarget.style.color = DG.text; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }} onMouseLeave={e => { e.currentTarget.style.color = DG.muted; e.currentTarget.style.borderColor = DG.border }}>
            Guardar
          </button>
          <button type="button" onClick={doExport} disabled={exporting} className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed" style={{ borderColor: DG.green, color: DG.green }} onMouseEnter={e => { if (!exporting) e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)' }} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            {exporting ? 'Exportando…' : 'Exportar PDF'}
          </button>
          <button type="button" onClick={doDownloadHtml} disabled={sharing} className="px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed" style={{ borderColor: DG.green, color: DG.green }} onMouseEnter={e => { if (!sharing) e.currentTarget.style.backgroundColor = 'rgba(34,197,94,0.1)' }} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
            Descargar HTML
          </button>
          <button type="button" onClick={doShareLink} disabled={sharing} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed" style={{ backgroundColor: DG.green, color: '#08090B' }} onMouseEnter={e => { if (!sharing) e.currentTarget.style.backgroundColor = DG.greenHover }} onMouseLeave={e => (e.currentTarget.style.backgroundColor = DG.green)}>
            {sharing ? 'Generando…' : 'Compartir link'}
          </button>
        </div>

        {exportMsg && (
          <p className="text-sm font-medium" style={{ color: exportMsg.ok ? DG.greenHover : DG.amber }}>{exportMsg.text}</p>
        )}

        {shareUrl && (
          <div className="flex items-center gap-2 flex-wrap rounded-xl border px-3 py-2.5" style={{ borderColor: DG.border, backgroundColor: DG.card }}>
            <input
              readOnly
              value={shareUrl}
              onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-[180px] bg-transparent text-sm px-2 py-1.5 rounded-lg border focus:outline-none"
              style={{ borderColor: DG.border, color: DG.text }}
              aria-label="Link del informe"
            />
            <button type="button" onClick={() => { navigator.clipboard.writeText(shareUrl).then(() => showExportMsg({ ok: true, text: 'Copiado ✓' })).catch(() => showExportMsg({ ok: false, text: 'No se pudo copiar; seleccioná y copiá a mano.' })) }} className="px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: DG.green, color: DG.green }}>
              Copiar
            </button>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{ backgroundColor: '#25D366', color: '#08120A' }}>
              WhatsApp
            </a>
            <a href={shareUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: DG.border, color: DG.text }}>
              Abrir
            </a>
          </div>
        )}

        {/* ── Banda de marca ── */}
        <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: DG.border }}>
          <BrandLogo height={38} />
          <span className="text-sm truncate" style={{ color: DG.muted }}>{informe.contextoComparacion || t(lang, 'm_scoutingReport')}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <PlayerRail informe={informe} lang={lang} />

          <div className="rounded-[18px] border p-5 min-w-0" style={{ borderColor: DG.border, backgroundColor: DG.card }}>
            {/* ── Tabs ── */}
            <div className="flex items-center gap-1 border-b mb-5 overflow-x-auto" style={{ borderColor: DG.border }}>
              {visibleTabs.map(id => {
                const active = tab === id
                return (
                  <button key={id} type="button" onClick={() => setTab(id)} className="px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors" style={{ color: active ? DG.green : DG.muted, borderColor: active ? DG.green : 'transparent' }} onMouseEnter={e => { if (!active) e.currentTarget.style.color = DG.text }} onMouseLeave={e => { if (!active) e.currentTarget.style.color = DG.muted }}>
                    {t(lang, `tab_${id}`)}
                  </button>
                )
              })}
            </div>
            {renderTab(visibleTabs.includes(tab) ? tab : 'general')}
          </div>
        </div>

        {/* ── Contenedor oculto: apila TODAS las secciones para el export a PDF ── */}
        <div ref={printRef} aria-hidden dir={rtl ? 'rtl' : 'ltr'} className="fixed left-[-99999px] top-0 w-[794px] p-6 space-y-6" style={{ backgroundColor: DG.card, color: DG.text }}>
          <div data-informe-section>{renderHeader()}</div>
          {mainStatsBlock && <div data-informe-section>{mainStatsBlock}</div>}
          {renderGeneral()}
          {renderRadar()}
          {renderBars()}
          {informe.charts.scatters.length > 0 && (
            <div className="space-y-4">
              {informe.charts.scatters.map((sc, idx) => renderScatterItem(sc, idx))}
              <div data-informe-section><InformeChartHelp text={t(lang, 'help_scatter')} lang={lang} /></div>
            </div>
          )}
          {showFisico && renderFisico()}
          {showEvolutivas && renderEvolutivas(true)}
          {renderCarrera()}
          {renderComparaciones()}
        </div>
      </div>
    </div>
  )
}
