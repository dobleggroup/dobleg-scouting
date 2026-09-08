import { useMemo, useRef, useState } from 'react'
import type { Informe, MetricDef } from '@/features/informes/types'
import { getRowName } from '@/features/informes/chartData'
import { buildComparisonRows, buildRadarSeries, buildInsightText, countWins } from '@/features/informes/comparisonInsight'
import { radarSvg } from '@/features/informes/chartSvg'
import { exportInformePDF } from '@/features/informes/exportInformePDF'
import { buildComparisonHtml, exportComparisonHTML } from '@/features/informes/exportComparisonHTML'
import { buildComparisonOgImageBlob } from '@/features/informes/ogImage'
import { uploadInformeHtml, uploadInformeOgImage, informeShareUrl, shareVersionToken } from '@/features/informes/shareInforme'

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
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

// Paleta oscura / clara — el verde es SIEMPRE el de marca (#22C55E, el mismo de
// toda la plataforma) en los dos temas; lo que cambia es el fondo y el acento del
// jugador 2 (gris claro en oscuro, gris oscuro en claro — nunca compite con el verde).
const BRAND_GREEN = '#22C55E'
const PALETTE = {
  dark: { bg: '#08090B', header: '#000000', card: '#14171B', border: 'rgba(255,255,255,0.08)', text: '#F5F7FA', muted: '#8A9099', track: 'rgba(255,255,255,0.10)', green: BRAND_GREEN, accentB: '#E5E7EB' },
  light: { bg: '#FFFFFF', header: '#111827', card: '#F7F8F9', border: '#E5E7EB', text: '#111827', muted: '#6B7280', track: '#E5E7EB', green: BRAND_GREEN, accentB: '#111827' },
}

interface PlayerCardProps {
  pal: typeof PALETTE.light
  name: string
  club: string
  liga: string
  edad: string
  altura: string
  pie: string
  contrato: string
  posicion: string
  rol: string
  pj: string
  minutos: string
  goles: string
  asistencias: string
  foto: string | null | undefined
  accent: string
}

function PlayerCard({ pal, name, club, liga, edad, altura, pie, contrato, posicion, rol, pj, minutos, goles, asistencias, foto, accent }: PlayerCardProps) {
  const tiles = [
    { v: pj, l: 'PJ' }, { v: minutos, l: 'Min' }, { v: goles, l: 'Goles' }, { v: asistencias, l: 'Asist.' },
  ].filter(t => t.v)
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: pal.card, border: `1px solid ${pal.border}`, borderLeft: `4px solid ${accent}` }}>
      <div className="flex gap-3.5 items-start">
        {foto ? (
          <img src={foto} alt={name} className="w-16 h-16 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-black flex-shrink-0" style={{ backgroundColor: pal.border, color: pal.muted }}>
            {initials(name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold truncate" style={{ color: accent }}>{name || '—'}</p>
          <p className="text-xs font-semibold truncate" style={{ color: pal.muted }}>{[club, liga].filter(Boolean).join(' · ')}</p>
          <p className="text-[11px] truncate mt-0.5" style={{ color: pal.muted }}>
            {[edad ? `${edad} años` : '', altura ? `${altura} m` : '', pie].filter(Boolean).join(' · ')}
          </p>
          {contrato && <p className="text-[11px] mt-0.5" style={{ color: pal.muted }}>Contrato hasta <b style={{ color: pal.text }}>{contrato}</b></p>}
          {posicion && <p className="text-[11px] mt-0.5" style={{ color: pal.muted }}>Posición: <b style={{ color: pal.text }}>{posicion}</b></p>}
          {rol && <p className="text-[11px] mt-0.5" style={{ color: pal.muted }}>Rol: <b style={{ color: pal.text }}>{rol}</b></p>}
        </div>
      </div>
      {tiles.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-3.5">
          {tiles.map(t => (
            <div key={t.l} className="rounded-lg text-center py-1.5" style={{ backgroundColor: pal.bg, border: `1px solid ${pal.border}` }}>
              <p className="text-base font-extrabold" style={{ color: pal.text }}>{t.v}</p>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: pal.muted }}>{t.l}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Props {
  informe: Informe
  defs: MetricDef[]
  matrix: Record<string, (number | null)[]>
  onBack: () => void
  onSave: () => void
}

export default function ComparisonPreview({ informe, defs, matrix, onBack, onSave }: Props) {
  const [dark, setDark] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pal = dark ? PALETTE.dark : PALETTE.light

  const idxA = informe.protagonistIndex
  const idxB = (informe.comparePlayerIndices ?? [])[0] ?? -1
  const nameA = getRowName(informe, idxA) || informe.content.nombre
  const nameB = idxB >= 0 ? getRowName(informe, idxB) : (informe.comparisonB?.nombre ?? '')

  const keys = informe.comparisonMetrics ?? []
  const rows = useMemo(() => buildComparisonRows(keys, defs, matrix, idxA, idxB), [keys, defs, matrix, idxA, idxB])
  const winCounts = useMemo(() => countWins(rows), [rows])
  const insightText = useMemo(() => buildInsightText(rows, nameA, nameB), [rows, nameA, nameB])
  const { axes, series } = useMemo(
    () => buildRadarSeries(rows, nameA, nameB, pal.green, pal.accentB),
    [rows, nameA, nameB, pal.green, pal.accentB],
  )
  const radarHtml = useMemo(
    () => (axes.length >= 3 ? radarSvg({ axes, series, size: 420, gridColor: pal.track, axisTextColor: pal.muted }) : ''),
    [axes, series, pal.track, pal.muted],
  )

  const b = informe.comparisonB

  function showMsg(m: { ok: boolean; text: string }) {
    setMsg(m)
    window.setTimeout(() => setMsg(null), 3500)
  }

  async function doExportPdf() {
    if (!rootRef.current || exporting) return
    setExporting(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      await exportInformePDF({ rootEl: rootRef.current, nombre: `${nameA}_vs_${nameB}`, isDark: dark, logoDataUrl })
      showMsg({ ok: true, text: 'PDF ✓' })
    } catch (e) {
      console.error('Export PDF error:', e)
      showMsg({ ok: false, text: 'No se pudo generar el PDF.' })
    } finally {
      setExporting(false)
    }
  }

  async function doDownloadHtml() {
    if (sharing) return
    setSharing(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      exportComparisonHTML({ informe, rows, insightText, winCounts, nameA, nameB, logoDataUrl })
      showMsg({ ok: true, text: 'HTML descargado ✓ (se abre sin internet)' })
    } catch (e) {
      console.error('Export HTML error:', e)
      showMsg({ ok: false, text: 'No se pudo generar el HTML.' })
    } finally {
      setSharing(false)
    }
  }

  async function doShareLink() {
    if (sharing) return
    setSharing(true)
    try {
      const logoDataUrl = await loadLogoDataUrl('/brand/logo-white.png')
      const nombreKey = `${nameA} vs ${nameB}` || 'comparacion'
      const version = shareVersionToken(Date.now())
      const shareLink = informeShareUrl(informe.id, nombreKey, version)

      let imageUrl: string | null = null
      try {
        const og = await buildComparisonOgImageBlob({
          a: { nombre: nameA, club: informe.content.club, fotoDataUrl: informe.fotoDataUrl },
          b: { nombre: nameB, club: b?.club, fotoDataUrl: informe.fotoComparadoDataUrl },
          logoDataUrl,
        })
        if (og) imageUrl = await uploadInformeOgImage(og, informe.id, nombreKey, version)
      } catch (e) {
        console.warn('No se pudo generar la imagen de preview:', e)
      }

      const html = buildComparisonHtml({
        informe, rows, insightText, winCounts, nameA, nameB, logoDataUrl,
        share: { url: shareLink, imageUrl },
      })
      const url = await uploadInformeHtml(html, informe.id, nombreKey, version)
      setShareUrl(url)
      try { await navigator.clipboard.writeText(url) } catch { /* sin permiso de portapapeles */ }
      showMsg({ ok: true, text: 'Link generado y copiado ✓' })
    } catch (e) {
      console.error('Share link error:', e)
      showMsg({ ok: false, text: 'No se pudo generar el link. ¿Está creado el bucket "informes-compartidos" en Supabase?' })
    } finally {
      setSharing(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap mb-4">
        <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl border text-sm font-semibold border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800 transition-colors">
          ← Editar
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setDark(d => !d)}
          className="px-3 py-2.5 rounded-xl border text-sm font-medium border-apple-gray-200 dark:border-apple-gray-700 text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-800 transition-colors"
        >
          {dark ? '☀️ Claro' : '🌙 Oscuro'}
        </button>
        <button type="button" onClick={onSave} className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors">
          Guardar
        </button>
        <button type="button" disabled={sharing} onClick={() => void doDownloadHtml()} className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50">
          Descargar HTML
        </button>
        <button type="button" disabled={exporting} onClick={() => void doExportPdf()} className="px-4 py-2.5 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-700 dark:text-apple-gray-200 text-sm font-semibold hover:bg-apple-gray-200 dark:hover:bg-apple-gray-700 transition-colors disabled:opacity-50">
          {exporting ? 'Generando...' : 'Descargar PDF'}
        </button>
        <button type="button" disabled={sharing} onClick={() => void doShareLink()} className="px-4 py-2.5 rounded-xl bg-brand-green text-white text-sm font-semibold hover:bg-brand-green/90 transition-colors disabled:opacity-50">
          Compartir link
        </button>
      </div>

      {msg && (
        <div className={`text-sm font-medium px-4 py-2.5 rounded-xl mb-3 ${msg.ok ? 'bg-brand-green/10 text-brand-green' : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'}`}>
          {msg.text}
        </div>
      )}
      {shareUrl && (
        <div className="text-sm px-4 py-2.5 rounded-xl mb-3 bg-brand-green/10 text-brand-green break-all">
          {shareUrl}
        </div>
      )}

      <div ref={rootRef} className="rounded-[20px] overflow-hidden" style={{ backgroundColor: pal.bg, color: pal.text }}>
        <div data-informe-section className="px-6 py-6 flex items-center justify-between" style={{ backgroundColor: pal.header, color: '#fff' }}>
          <img src="/brand/logo-white.png" alt="Doble G" className="h-8" onError={e => { e.currentTarget.style.display = 'none' }} />
          <div className="text-right">
            <h1 className="text-xl font-extrabold m-0">Comparativa</h1>
            <p className="text-xs m-0 mt-0.5" style={{ color: '#9CA3AF' }}>{informe.contextoComparacion || ' '}</p>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-6 space-y-7">
          <div data-informe-section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlayerCard
              pal={pal} name={nameA} club={informe.content.club} liga={informe.content.liga}
              edad={informe.content.edad} altura={informe.content.altura ?? ''} pie={informe.content.pie ?? ''}
              contrato={informe.content.contrato} posicion={informe.content.posicion} rol={informe.content.rol}
              pj={informe.content.pj} minutos={informe.content.minutos} goles={informe.content.goles} asistencias={informe.content.asistencias}
              foto={informe.fotoDataUrl} accent={pal.green}
            />
            <PlayerCard
              pal={pal} name={nameB} club={b?.club ?? ''} liga={b?.liga ?? ''}
              edad={b?.edad ?? ''} altura={b?.altura ?? ''} pie={b?.pie ?? ''}
              contrato={b?.contrato ?? ''} posicion={b?.posicion ?? ''} rol={b?.rol ?? ''}
              pj={b?.pj ?? ''} minutos={b?.minutos ?? ''} goles={b?.goles ?? ''} asistencias={b?.asistencias ?? ''}
              foto={informe.fotoComparadoDataUrl} accent={pal.accentB}
            />
          </div>

          <div data-informe-section className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6 items-center">
            <div>
              {radarHtml ? (
                <div dangerouslySetInnerHTML={{ __html: radarHtml }} />
              ) : (
                <p className="text-sm" style={{ color: pal.muted }}>Elegí al menos 3 métricas para el radar.</p>
              )}
              <div className="flex gap-4 justify-center mt-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: pal.green }} />{nameA}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: pal.accentB }} />{nameB}</span>
              </div>
            </div>
            <div>
              <h3 className="text-[15px] font-extrabold mb-2">Perfil de rendimiento</h3>
              <p className="text-[13.5px] leading-relaxed" style={{ color: pal.text }}>{insightText || 'Elegí métricas en el paso anterior para generar el resumen.'}</p>
            </div>
          </div>

          <div data-informe-section>
            <div style={{ borderTop: `1px solid ${pal.border}` }} className="pt-2">
              {rows.map(row => {
                const aWin = row.winner === 'a'
                const bWin = row.winner === 'b'
                return (
                  <div key={row.key} className="grid grid-cols-[1fr_150px_1fr] items-center gap-2.5 py-1.5">
                    <div className="grid grid-cols-[48px_1fr] items-center gap-2">
                      <span className="text-[13px] font-semibold text-right tabular-nums" style={{ color: aWin ? pal.text : pal.muted, fontWeight: aWin ? 800 : 600 }}>{row.displayA}</span>
                      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: pal.track }}>
                        <div className="h-full rounded-full" style={{ width: `${row.pctA}%`, backgroundColor: aWin ? pal.green : pal.track }} />
                      </div>
                    </div>
                    <span className="text-[12px] text-center truncate" style={{ color: pal.muted }}>{row.label}</span>
                    <div className="grid grid-cols-[1fr_48px] items-center gap-2">
                      <div className="h-2 rounded-full overflow-hidden flex justify-end" style={{ backgroundColor: pal.track }}>
                        <div className="h-full rounded-full flex-shrink-0" style={{ width: `${row.pctB}%`, backgroundColor: bWin ? pal.accentB : pal.track }} />
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: bWin ? pal.text : pal.muted, fontWeight: bWin ? 800 : 600 }}>{row.displayB}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 text-xs" style={{ borderTop: `1px solid ${pal.border}`, color: pal.muted }}>
              <span>
                {winCounts.winsA > 0 && <><b style={{ color: pal.green }}>{nameA}</b> supera en <b style={{ color: pal.text }}>{winCounts.winsA}</b> de {rows.length} métricas</>}
                {winCounts.winsB > 0 && <> · <b style={{ color: pal.text }}>{nameB}</b> en <b style={{ color: pal.text }}>{winCounts.winsB}</b></>}
                {winCounts.ties > 0 && <> · {winCounts.ties} empate{winCounts.ties === 1 ? '' : 's'}</>}
              </span>
              <span>{informe.contextoComparacion}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
