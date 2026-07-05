import { useState } from 'react'
import type { Informe, MetricStat, MetricDef } from '@/features/informes/types'
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Markdown mínimo y seguro: escapa HTML primero, después soporta **negrita** y [texto](url). */
function renderInlineMarkdown(text: string): string {
  const escaped = escapeHtml(text)
  const withLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  )
  const withBold = withLinks.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  return withBold.replace(/\n/g, '<br/>')
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
  { id: 'opinion', label: 'Opinión' },
  { id: 'carrera', label: 'Carrera' },
  { id: 'comparaciones', label: 'Comparaciones' },
] as const
type TabId = typeof TABS[number]['id']

// ─── Left rail ──────────────────────────────────────────────────────────────

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-apple-gray-100 dark:border-apple-gray-800 last:border-0">
      <dt className="text-apple-gray-400 dark:text-apple-gray-500 flex-shrink-0">{label}</dt>
      <dd className="font-medium text-apple-gray-900 dark:text-white text-right truncate">{value || '—'}</dd>
    </div>
  )
}

function PlayerRail({ informe }: { informe: Informe }) {
  const { content } = informe
  const rolYPosicion = [content.posicion, content.rol].filter(Boolean).join(' · ')
  return (
    <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5 space-y-4 h-fit">
      <div className="flex flex-col items-center text-center gap-3">
        {informe.fotoDataUrl ? (
          <img
            src={informe.fotoDataUrl}
            alt={content.nombre || 'Jugador'}
            className="w-28 h-28 rounded-full object-cover border-4 border-apple-gray-100 dark:border-apple-gray-800"
          />
        ) : (
          <div className="w-28 h-28 rounded-full bg-apple-gray-100 dark:bg-apple-gray-800 flex items-center justify-center text-2xl font-black text-apple-gray-400 dark:text-apple-gray-500">
            {initials(content.nombre || '?')}
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-apple-gray-900 dark:text-white">{content.nombre || 'Sin nombre'}</h2>
          {rolYPosicion && (
            <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">{rolYPosicion}</p>
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
      {content.transfermarktUrl && (
        <a
          href={content.transfermarktUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-center w-full px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
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
  onExport: () => void
}

export default function Step4Preview({ informe, stats, matrix, defs, onBack, onSave, onExport }: Step4PreviewProps) {
  const [tab, setTab] = useState<TabId>('radar')
  const { content } = informe
  const youtubeId = parseYouTubeId(content.videoUrl || '')

  const strengths = stats
    .filter(s => s.color === 'green' && s.percentile != null)
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0))
    .slice(0, 6)

  const matches = content.ultimos5.filter(m => m.rival || m.resultado || m.rating || m.minutos)
  const comparables = content.comparables.filter(c => c.jugador || c.club || c.rating || c.delta)

  return (
    <div className="space-y-4">
      {/* ── Barra de acciones ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
        >
          ← Editar
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onExport}
          className="px-4 py-2.5 rounded-xl bg-brand-red text-white text-sm font-semibold hover:bg-brand-red/90 transition-colors"
        >
          Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <PlayerRail informe={informe} />

        <div className="rounded-2xl border border-apple-gray-200 dark:border-apple-gray-800 bg-white dark:bg-apple-gray-900 p-5 min-w-0">
          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 border-b border-apple-gray-100 dark:border-apple-gray-800 mb-5 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? 'text-brand-red border-brand-red'
                    : 'text-apple-gray-500 dark:text-apple-gray-400 border-transparent hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Radar ── */}
          {tab === 'radar' && (
            <div data-informe-section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-1">
                Radar comparativo
              </h3>
              <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-4">
                {informe.contextoComparacion || 'Sin contexto de comparación definido'}
              </p>
              <InformeRadar stats={stats} keys={informe.charts.radar} />
              {informe.charts.numbers.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-3">
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
          )}

          {/* ── Barras ── */}
          {tab === 'bars' && (
            <div data-informe-section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-4">
                Barras comparativas
              </h3>
              <InformeBars stats={stats} keys={informe.charts.bar} contexto={informe.contextoComparacion} />
            </div>
          )}

          {/* ── Scatter ── */}
          {tab === 'scatter' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-4">
                Dispersión en el contexto
              </h3>
              {informe.charts.scatters.length === 0 ? (
                <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-8 text-center">
                  Agregá scatter plots en el paso 2 para verlos acá.
                </p>
              ) : (
                <div className="space-y-6">
                  {informe.charts.scatters.map((sc, idx) => (
                    <div
                      key={idx}
                      data-informe-section
                      className="border border-apple-gray-100 dark:border-apple-gray-800 rounded-xl p-4"
                    >
                      <InformeScatter scatter={sc} matrix={matrix} defs={defs} protagonistIndex={informe.protagonistIndex} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Video ── */}
          {tab === 'video' && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-4">
                Video
              </h3>
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
                <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic py-12 text-center border-2 border-dashed border-apple-gray-200 dark:border-apple-gray-700 rounded-xl">
                  Sin video cargado. Agregá una URL de YouTube en el paso 3.
                </p>
              )}
            </div>
          )}

          {/* ── Opinión ── */}
          {tab === 'opinion' && (
            <div data-informe-section className="space-y-6">
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400">
                    Lectura táctica
                  </h3>
                  {content.lecturaAutor && (
                    <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">— {content.lecturaAutor}</span>
                  )}
                </div>
                {content.lecturaTexto ? (
                  <div
                    className="text-sm leading-relaxed text-apple-gray-700 dark:text-apple-gray-200 [&_a]:text-brand-red [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(content.lecturaTexto) }}
                  />
                ) : (
                  <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic">Sin análisis cargado.</p>
                )}
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-2">
                  Fortalezas
                </h4>
                {strengths.length === 0 ? (
                  <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic">
                    Sin métricas destacadas (verdes) todavía.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {strengths.map(s => (
                      <li key={s.def.key} className="flex items-center gap-2 text-sm text-apple-gray-700 dark:text-apple-gray-200">
                        <span className="w-2 h-2 rounded-full bg-brand-green flex-shrink-0" />
                        {s.def.label}
                        <span className="text-xs text-apple-gray-400 dark:text-apple-gray-500">P{s.percentile}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* ── Carrera ── */}
          {tab === 'carrera' && (
            <div data-informe-section className="space-y-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-3">
                  Últimos 5 partidos
                </h3>
                {matches.length === 0 ? (
                  <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic">Sin partidos cargados.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500 border-b border-apple-gray-100 dark:border-apple-gray-800">
                          <th className="py-2 font-medium">Rival</th>
                          <th className="py-2 font-medium">Resultado</th>
                          <th className="py-2 font-medium">Rating</th>
                          <th className="py-2 font-medium">Minutos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matches.map((m, idx) => (
                          <tr key={idx} className="border-b border-apple-gray-50 dark:border-apple-gray-800/60 last:border-0">
                            <td className="py-2 text-apple-gray-900 dark:text-white">{m.rival || '—'}</td>
                            <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{m.resultado || '—'}</td>
                            <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{m.rating || '—'}</td>
                            <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{m.minutos || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 p-3">
                  <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-1">Contrato</p>
                  <p className="text-sm font-semibold text-apple-gray-900 dark:text-white">{content.contrato || '—'}</p>
                </div>
                <div className="rounded-xl bg-apple-gray-50 dark:bg-apple-gray-800/60 p-3">
                  <p className="text-xs text-apple-gray-400 dark:text-apple-gray-500 mb-1">Valor de mercado</p>
                  <p className="text-sm font-semibold text-apple-gray-900 dark:text-white">{content.valorMercado || '—'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Comparaciones ── */}
          {tab === 'comparaciones' && (
            <div data-informe-section className="space-y-5">
              {!content.hideComparables && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-3">
                    Comparables
                  </h3>
                  {comparables.length === 0 ? (
                    <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500 italic">Sin comparables cargados.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-apple-gray-400 dark:text-apple-gray-500 border-b border-apple-gray-100 dark:border-apple-gray-800">
                            <th className="py-2 font-medium">Jugador</th>
                            <th className="py-2 font-medium">Club</th>
                            <th className="py-2 font-medium">Rating</th>
                            <th className="py-2 font-medium">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparables.map((c, idx) => (
                            <tr key={idx} className="border-b border-apple-gray-50 dark:border-apple-gray-800/60 last:border-0">
                              <td className="py-2 text-apple-gray-900 dark:text-white">{c.jugador || '—'}</td>
                              <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{c.club || '—'}</td>
                              <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{c.rating || '—'}</td>
                              <td className="py-2 text-apple-gray-700 dark:text-apple-gray-200">{c.delta || '—'}</td>
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
                  <h4 className="text-xs font-bold uppercase tracking-wide text-apple-gray-500 dark:text-apple-gray-400 mb-2">
                    Notas
                  </h4>
                  <p className="text-sm text-apple-gray-700 dark:text-apple-gray-200 whitespace-pre-line">{content.comparaciones}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
