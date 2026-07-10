import { radarSvg, barsSvg, scatterSvg, gaugeSvg, lineChartSvg, lineSvg } from './chartSvg'
import { radarData, radarComparisonData, barsData, scatterData, comparisonTable, comparisonWinCounts, parseRating, ratingMax } from './chartData'
import { t, translateMetric, translateInjury, translateTransferType, isRtl } from './i18n'
import type { Informe, MetricStat, MetricDef } from './types'
import type { InformeEnrichment, Last5Row } from './useInformeEnrichment'
import type { PlayerTransfer } from '@/services/footballApiService'

// ---------------------------------------------------------------------------
// Seguridad: escape de texto de usuario antes de interpolar en el HTML.
// ---------------------------------------------------------------------------

function escapeHtml(input: string | number | null | undefined): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Solo permite embeber URLs http(s); cualquier otro esquema (javascript:, data:, etc) se descarta. */
function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return null
  return trimmed
}

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

/** Valida que el id extraído sea un id de YouTube razonable antes de embeberlo. */
function safeYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const id = parseYouTubeId(url)
  if (!id) return null
  return /^[\w-]{6,}$/.test(id) ? id : null
}

function initials(name: string): string {
  const parts = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '')
  return parts.join('') || '?'
}

/**
 * Percentil promedio para la 2da línea "Mejor que X%" del rail: promedia el
 * percentil de las métricas elegidas por el usuario (si no eligió ninguna, usa
 * todas las que tengan percentil). Devuelve null si no hay ninguna comparable.
 */
export function comparePercentile(stats: MetricStat[], metricKeys: string[] | undefined): number | null {
  const withPct = (metricKeys && metricKeys.length)
    ? stats.filter(s => metricKeys.includes(s.def.key) && s.percentile != null)
    : stats.filter(s => s.percentile != null) // default: todas las que tengan percentil
  if (withPct.length === 0) return null
  return Math.round(withPct.reduce((a, s) => a + (s.percentile as number), 0) / withPct.length)
}

function formatStatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  return stat.def.unit === '%' ? `${stat.value.toFixed(0)}%` : stat.value.toFixed(2)
}

/**
 * Color del Rating (nota de partido de la API) para la tabla de últimos 5.
 * Devuelve '' si no hay valor. Puro: mismos umbrales en export y preview.
 */
export function ratingColor(v: number | null): string {
  if (v == null) return ''
  if (v >= 8) return '#22C55E'
  if (v >= 6.5) return '#4ADE80'
  if (v >= 4) return '#F59E0B'
  return '#EF4444'
}

function safeDataUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /^data:image\//i.test(url) ? url : null
}

/** Defensivo: el color viene de un helper interno (hex fijo), pero igual se valida antes de usarlo en `style`. */
function safeHexColor(color: string | null | undefined, fallback: string): string {
  if (color && /^#[0-9A-Fa-f]{3,8}$/.test(color)) return color
  return fallback
}

// ---------------------------------------------------------------------------
// Métricas evolutivas (Wyscout): la data se resuelve en el llamador (async) y se
// pasa ya calculada, para mantener este módulo síncrono y puro.
// ---------------------------------------------------------------------------

export interface EvolutionChartExport {
  label: string
  unit: '%' | ''
  points: { label: string; value: number }[]
}

// ---------------------------------------------------------------------------
// buildInformeHtml: construye el string HTML completo (puro, testeable)
// ---------------------------------------------------------------------------

export function buildInformeHtml(opts: {
  informe: Informe
  stats: MetricStat[]
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  logoDataUrl?: string
  enrichment?: InformeEnrichment
  evolution?: EvolutionChartExport[]
  transfers?: PlayerTransfer[]
}): string {
  const { informe, stats, matrix, defs, enrichment } = opts
  const { content } = informe
  const lang = informe.idioma ?? 'es'
  const rtl = isRtl(lang)

  const nombre = content.nombre || 'Sin nombre'
  const rolYPosicion = [content.posicion, content.rol].filter(Boolean).join(' · ')
  const clubYLiga = [content.club, content.liga].filter(Boolean).join(' · ')

  const logoSafe = safeDataUrl(opts.logoDataUrl)
  const fotoSafe = safeDataUrl(informe.fotoDataUrl)
  const crestSafe = safeDataUrl(informe.ligaCrestDataUrl)
  const transfermarktUrl = safeHttpUrl(content.transfermarktUrl)
  const youtubeId = safeYouTubeId(content.videoUrl)

  // ── Charts (con métricas traducidas) ──
  const radar = radarData(informe, stats, matrix, defs)
  const radarSeries = radar.series.map(s => (s.dashed ? { ...s, name: t(lang, 'l_avgPosition') } : s))
  const radarSvgStr = radarSvg({ axes: radar.axes.map(a => translateMetric(a, lang)), series: radarSeries })

  const barsRows = barsData(stats, informe.charts.bar).map(r => ({ ...r, label: translateMetric(r.label, lang) }))
  // Dos layouts: ancho para desktop, apilado para mobile (labels legibles en pantallas angostas).
  const barsSvgStr = `<div class="dg-bars-wide dg-chart">${barsSvg({ rows: barsRows })}</div><div class="dg-bars-narrow dg-chart">${barsSvg({ rows: barsRows, stacked: true })}</div>`

  const scatterBlocks = informe.charts.scatters.map(sc => {
    const data = scatterData(sc, matrix, defs, informe.protagonistIndex)
    return {
      caption: sc.caption,
      svg: scatterSvg({
        points: data.points,
        xLabel: translateMetric(data.xLabel, lang),
        yLabel: translateMetric(data.yLabel, lang),
        xMin: data.xMin,
        yMin: data.yMin,
        xHigherIsBetter: data.xHigherIsBetter,
        yHigherIsBetter: data.yHigherIsBetter,
      }),
    }
  })

  const numberCards = informe.charts.numbers
    .map(key => stats.find(s => s.def.key === key))
    .filter((s): s is MetricStat => !!s)

  const comparables = content.comparables.filter(c => c.jugador || c.club || c.rating || c.delta)

  const compTable = comparisonTable(informe, matrix, defs)
  const hasPlayerComparison = (informe.comparePlayerIndices?.length ?? 0) > 0 && compTable.rows.length > 0
  const compRadar = radarComparisonData(informe, matrix, defs)
  const compRadarSvgStr = compRadar.axes.length >= 3 ? radarSvg({ axes: compRadar.axes.map(a => translateMetric(a, lang)), series: compRadar.series }) : ''
  const compWins = comparisonWinCounts(compTable)

  // ── Enriquecimiento: físico (interno), evolución de nivel, valor, continuidad, lesiones ──
  const hasPhysical = !!enrichment?.hasPhysical && !content.hideFisicoTab
  const levelByMatch = enrichment?.levelByMatch ?? []
  const levelByWeek = enrichment?.levelByWeek ?? []
  const levelByMonth = enrichment?.levelByMonth ?? []
  const physEvo = enrichment?.physicalEvolution ?? []
  const marketEvo = enrichment?.marketEvolution ?? []
  const continuity = enrichment?.continuity ?? null
  const last5Rows = enrichment?.last5 ?? []
  const injuries = enrichment?.injuries ?? []
  const showFisico = hasPhysical

  const physTiles = (enrichment?.physicalTiles ?? []).filter(pt => !pt.zero)
  const physicalTilesHtml = hasPhysical
    ? `<div class="dg-wins">${physTiles
        .map(pt => `<div class="dg-win-card"><p class="dg-win-value">${escapeHtml(pt.value)}</p><p class="dg-win-label">${escapeHtml(pt.label)}</p></div>`)
        .join('')}</div>`
    : ''
  const physEvoHtml = physEvo.length >= 2 && !content.hideFisicoCharts ? lineChartSvg({ points: physEvo, color: '#38BDF8', formatValue: v => String(Math.round(v)) }) : ''
  const marketEvoHtml = marketEvo.length >= 2 ? lineChartSvg({ points: marketEvo, color: '#F5C451', formatValue: v => `€${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M` }) : ''

  // Evolución de nivel con toggle Partido / Semanal / Mensual. Se renderizan las
  // vistas disponibles (≥2 puntos) y el JB del HTML alterna cuál se muestra.
  const evoViews = ([
    { id: 'match', label: t(lang, 'evo_match'), points: levelByMatch },
    { id: 'week', label: t(lang, 'evo_week'), points: levelByWeek },
    { id: 'month', label: t(lang, 'evo_month'), points: levelByMonth },
  ] as const).filter(v => v.points.length >= 2)
  const levelEvoBlock = evoViews.length
    ? `<div class="dg-evo-head">
         <h3 class="dg-panel-title">${escapeHtml(t(lang, 't_levelEvo'))}</h3>
         ${evoViews.length > 1
           ? `<div class="dg-seg">${evoViews
               .map((v, i) => `<button type="button" class="dg-seg-btn${i === 0 ? ' active' : ''}" data-evo="${v.id}">${escapeHtml(v.label)}</button>`)
               .join('')}</div>`
           : ''}
       </div>
       ${evoViews
         .map((v, i) => `<div class="dg-chart dg-evo-chart${i === 0 ? ' active' : ''}" data-evo="${v.id}">${lineChartSvg({ points: v.points, color: '#22C55E', formatValue: x => String(Math.round(x)), showValues: true })}</div>`)
         .join('')}`
    : ''

  const fisicoPanel = `
    <div class="dg-panel-inner">
      ${hasPhysical && enrichment
        ? `<h3 class="dg-panel-title">${escapeHtml(t(lang, 't_phys'))}</h3>
           <p class="dg-muted dg-subtitle">${escapeHtml(t(lang, 'm_avg'))} · ${enrichment.physicalMatches}</p>
           ${physicalTilesHtml}
           ${physEvoHtml ? `<h4 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_phys_intensity'))}</h4><div class="dg-chart">${physEvoHtml}</div>` : ''}`
        : `<p class="dg-empty">${escapeHtml(t(lang, 'm_selectPlayerData'))}</p>`}
    </div>`

  // ── General: evolución de nivel + continuidad + lesiones ──
  const minStat = stats.find(s => s.def.label.toLowerCase().includes('minutos'))
  const minPct = minStat?.percentile ?? null
  const continuityHtml = continuity
    ? `<h3 class="dg-panel-title${levelEvoBlock ? ' dg-mt' : ''}">${escapeHtml(t(lang, 't_continuity'))}</h3>
       <div class="dg-wins">
         <div class="dg-win-card"><p class="dg-win-value">${continuity.matches}</p><p class="dg-win-label">${escapeHtml(t(lang, 's_matches'))}</p></div>
         <div class="dg-win-card"><p class="dg-win-value">${continuity.starts}</p><p class="dg-win-label">${escapeHtml(t(lang, 's_starts'))}</p></div>
         <div class="dg-win-card"><p class="dg-win-value">${continuity.minutes}</p><p class="dg-win-label">${escapeHtml(t(lang, 's_minutes'))}</p></div>
         <div class="dg-win-card"><p class="dg-win-value">${continuity.last5Played}/${continuity.last5Total}</p><p class="dg-win-label">${escapeHtml(t(lang, 's_last5'))}</p></div>
         <div class="dg-win-card"><p class="dg-win-value">${continuity.last10Played}/${continuity.last10Total}</p><p class="dg-win-label">${escapeHtml(t(lang, 's_last10'))}</p></div>
       </div>
       ${minPct != null ? `<p class="dg-note">▲ ${escapeHtml(t(lang, 'm_playedMoreThan', { pct: minPct }))}</p>` : ''}`
    : ''
  const injuriesHtml = continuity || injuries.length
    ? `<h3 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_injuries'))}</h3>
       ${injuries.length === 0
        ? `<p class="dg-empty">${escapeHtml(t(lang, 'm_noInjuries'))}</p>`
        : `<div class="dg-inj-list">${injuries.slice(0, 8)
            .map(inj => `<div class="dg-inj"><span>${escapeHtml(translateInjury(inj.type, lang))}</span><span class="dg-muted">${escapeHtml(inj.start)} → ${escapeHtml(inj.end || t(lang, 'm_present'))}</span></div>`)
            .join('')}</div>`}`
    : ''
  // Últimos 5 partidos (API): resultado con puntito + color según el desenlace.
  const outcomeColor = (o: Last5Row['outcome']): string => o === 'win' ? '#22C55E' : o === 'loss' ? '#EF4444' : '#8A9099'
  const last5Html = last5Rows.length
    ? `<h3 class="dg-panel-title${(levelEvoBlock || continuityHtml || injuriesHtml) ? ' dg-mt' : ''}">${escapeHtml(t(lang, 't_last5'))}</h3>
       <div class="dg-table-wrap"><table class="dg-table">
         <thead><tr><th>${escapeHtml(t(lang, 'h_opponent'))}</th><th>${escapeHtml(t(lang, 'h_result'))}</th><th>${escapeHtml(t(lang, 's_rating'))}</th><th>${escapeHtml(t(lang, 's_minutes'))}</th></tr></thead>
         <tbody>
           ${last5Rows
             .map(r => {
               const col = outcomeColor(r.outcome)
               const rc = ratingColor(parseRating(r.rating))
               return `<tr>
             <td>${escapeHtml(r.rival) || '—'}</td>
             <td style="color:${col};font-weight:600"><span class="dg-result-dot" style="background:${col}"></span>${escapeHtml(r.result)}</td>
             <td${rc ? ` style="color:${rc};font-weight:700"` : ''}>${escapeHtml(r.rating)}</td>
             <td>${escapeHtml(String(r.minutes))}</td>
           </tr>`
             })
             .join('')}
         </tbody>
       </table></div>`
    : ''
  const showGeneral = !!(last5Html || levelEvoBlock || continuityHtml || injuriesHtml)
  const generalPanel = `
    <div class="dg-panel-inner">
      ${levelEvoBlock}${continuityHtml}${injuriesHtml}${last5Html}
      ${!showGeneral ? `<p class="dg-empty">${escapeHtml(t(lang, 'm_selectPlayerData'))}</p>` : ''}
    </div>`

  // ── Header / logo / escudo de liga ──
  const logoHtml = logoSafe
    ? `<img class="dg-logo" src="${logoSafe}" alt="Doble G" />`
    : ''
  const crestHtml = crestSafe
    ? `<img class="dg-liga-crest" src="${crestSafe}" alt="Liga" />`
    : ''

  // ── Player rail (izquierda) ──
  const photoHtml = fotoSafe
    ? `<img class="dg-photo" src="${fotoSafe}" alt="${escapeHtml(nombre)}" />`
    : `<div class="dg-photo dg-photo-fallback">${escapeHtml(initials(nombre))}</div>`

  function dataRow(label: string, value: string): string {
    return `<div class="dg-datarow"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value) || '—'}</dd></div>`
  }

  const mainStatsHtml = (() => {
    if (content.hideMainStats) return ''
    const items = [
      ...(content.hideRating ? [] : [{ label: t(lang, 's_rating'), value: content.rating }]),
      { label: t(lang, 's_pj'), value: content.pj },
      { label: t(lang, 's_minutes'), value: content.minutos },
      { label: t(lang, 's_goals'), value: content.goles },
      { label: t(lang, 's_assists'), value: content.asistencias },
    ].filter(i => i.value !== '')
    if (items.length === 0) return ''
    return `
      <div class="dg-mainstats">
        <h4>${escapeHtml(t(lang, 't_mainStats'))}</h4>
        <div class="dg-mainstats-grid">
          ${items
            .map(
              i =>
                `<div class="dg-stat-item"><span class="dg-stat-label">${escapeHtml(i.label)}</span><span class="dg-stat-value">${escapeHtml(i.value)}</span></div>`,
            )
            .join('')}
        </div>
      </div>`
  })()

  const transfermarktHtml = transfermarktUrl
    ? `<a class="dg-tm-link" href="${escapeHtml(transfermarktUrl)}" target="_blank" rel="noreferrer">Transfermarkt ↗</a>`
    : ''

  // Gauge de rating (velocímetro) bajo la foto + comparación vs su posición.
  const ratingVal = parseRating(content.rating)
  const ratingAvg = parseRating(content.ratingPromedio ?? '')
  const ratingCompareHtml = informe.dbPercentile != null
    ? `<p class="dg-rating-cmp">${escapeHtml(t(lang, 'm_ratingVsPos', { pct: Math.round(informe.dbPercentile), pos: content.posicion || '—', league: informe.dbLeagueName || content.liga || '—' }))}</p>`
    : ''
  const ratingGaugeHtml = !content.hideRating && !content.hideRatingGauge && ratingVal != null
    ? `<div class="dg-gauge">${gaugeSvg({ value: ratingVal, max: ratingMax(ratingVal), avg: ratingAvg != null ? ratingAvg : undefined, size: 200 })}<p class="dg-gauge-label">${escapeHtml(t(lang, 'm_ratingGauge'))}${ratingAvg != null ? ' · ' + escapeHtml(t(lang, 'm_avgLine')) : ''}</p>${ratingCompareHtml}</div>`
    : ''

  // 2da línea "Mejor que X%" bajo el gauge: percentil promedio de las métricas
  // elegidas vs el pool del informe, rotulado con la liga que el usuario escribió.
  const cmpPct = comparePercentile(stats, informe.compareMetrics)
  const compareLeagueHtml = cmpPct != null && informe.compareLeague
    ? `<p class="dg-rating-cmp">${escapeHtml(t(lang, 'm_ratingVsPos', { pct: cmpPct, pos: content.posicion || '—', league: informe.compareLeague }))}</p>`
    : ''

  const playerRailHtml = `
    <aside class="dg-rail">
      <div class="dg-rail-head">
        ${photoHtml}
        <div>
          <h2>${escapeHtml(nombre)}</h2>
          ${rolYPosicion ? `<p class="dg-muted">${escapeHtml(rolYPosicion)}</p>` : ''}
        </div>
      </div>
      ${ratingGaugeHtml}
      ${compareLeagueHtml}
      <dl class="dg-datalist">
        ${dataRow(t(lang, 'r_club'), content.club)}
        ${dataRow(t(lang, 'r_league'), content.liga)}
        ${dataRow(t(lang, 'r_age'), content.edad)}
        ${dataRow(t(lang, 'r_country'), content.nacionalidad)}
        ${dataRow(t(lang, 'r_contract'), content.contrato)}
        ${dataRow(t(lang, 'r_agent'), content.representante)}
      </dl>
      ${mainStatsHtml}
      ${transfermarktHtml}
    </aside>`

  // ── Tabs / panels (derecha) ──
  const legendHtml = radarSeries
    .map(
      s =>
        `<span class="dg-legend-item"><span class="dg-legend-dot" style="background:${s.color}"></span>${escapeHtml(s.name || 'Jugador')}</span>`,
    )
    .join('')

  const numberCardsHtml = numberCards.length
    ? `
      <div class="dg-numbers">
        <h4>${escapeHtml(t(lang, 't_keyNumbers'))}</h4>
        <div class="dg-numbers-grid">
          ${numberCards
            .map(
              stat => `
            <div class="dg-number-card dg-color-${stat.color}">
              <span class="dg-number-value">${escapeHtml(formatStatValue(stat))}</span>
              <span class="dg-number-rank">${stat.rank != null ? `N°${stat.rank} ${escapeHtml(t(lang, 'm_of'))} ${stat.total}` : '—'}</span>
              <span class="dg-number-label">${escapeHtml(translateMetric(stat.def.label, lang))}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>`
    : ''

  function helpBox(text: string, highlights?: string[]): string {
    return `<div class="dg-help"><span class="dg-help-k">${escapeHtml(t(lang, 'howToRead'))} · </span>${escapeHtml(text)}${
      highlights && highlights.length ? `<div class="dg-help-h"><span>${escapeHtml(t(lang, 'standsOut'))}: </span>${escapeHtml(highlights.join(' · '))}</div>` : ''
    }</div>`
  }

  const radarPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">${escapeHtml(t(lang, 't_radar'))}</h3>
      ${informe.contextoComparacion ? `<p class="dg-muted dg-subtitle">${escapeHtml(informe.contextoComparacion)}</p>` : ''}
      <div class="dg-legend">${legendHtml}</div>
      <div class="dg-chart">${radarSvgStr}</div>
      ${helpBox(t(lang, 'help_radar'))}
      ${numberCardsHtml}
    </div>`

  const barsLegend = `
    <div class="dg-legend">
      <span class="dg-legend-item"><span class="dg-legend-dot" style="background:#22C55E"></span>${escapeHtml(t(lang, 'l_thisPlayer'))}</span>
      <span class="dg-legend-item"><span class="dg-legend-bar" style="background:#CBD2DB"></span>${escapeHtml(t(lang, 'm_avg'))}</span>
    </div>`

  const barsPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">${escapeHtml(t(lang, 't_bars'))}</h3>
      ${barsRows.length ? `${barsLegend}${barsSvgStr}${helpBox(t(lang, 'help_bars'))}` : `<p class="dg-empty">—</p>`}
    </div>`

  const scatterPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">${escapeHtml(t(lang, 't_scatter'))}</h3>
      ${
        scatterBlocks.length === 0
          ? '<p class="dg-empty">—</p>'
          : scatterBlocks
              .map(
                b => `
          <div class="dg-scatter-block">
            <div class="dg-chart">${b.svg}</div>
            ${b.caption ? `<p class="dg-caption">${escapeHtml(b.caption)}</p>` : ''}
          </div>`,
              )
              .join('') + helpBox(t(lang, 'help_scatter'))
      }
    </div>`

  const rawVideoUrl = safeHttpUrl(content.videoUrl)
  const videoPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">${escapeHtml(t(lang, 'tab_video'))}</h3>
      ${
        youtubeId
          ? `<div class="dg-video-wrap" data-yt="${youtubeId}" role="button" tabindex="0" aria-label="Reproducir video">
               <img class="dg-video-poster" src="https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg" loading="lazy" alt="" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg'" />
               <span class="dg-video-play" aria-hidden="true"></span>
             </div>
             <a class="dg-video-link" href="https://www.youtube.com/watch?v=${youtubeId}" target="_blank" rel="noopener noreferrer">▶ ${escapeHtml(t(lang, 'v_youtube'))}</a>`
          : rawVideoUrl
            ? `<a class="dg-video-link" href="${rawVideoUrl}" target="_blank" rel="noopener noreferrer">▶ ${escapeHtml(t(lang, 'v_watch'))}</a>`
            : `<p class="dg-empty dg-empty-box">${escapeHtml(t(lang, 'm_noVideo'))}</p>`
      }
    </div>`

  // Historial de traspasos (API-Football, por id). Más recientes primero. Logos
  // externos https permitidos por el CSP del share; se validan igual que el resto.
  const transfers = (opts.transfers ?? [])
    .filter(tr => tr.teams?.in?.name || tr.teams?.out?.name)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const crestImg = (logo: string | null | undefined): string => {
    const safe = safeHttpUrl(logo)
    return safe ? `<img class="dg-tr-logo" src="${escapeHtml(safe)}" alt="" loading="lazy" />` : ''
  }
  const transfersHtml = `<h3 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_transfers'))}</h3>
    ${
      transfers.length === 0
        ? `<p class="dg-empty">${escapeHtml(t(lang, 'm_noTransfers'))}</p>`
        : `<div class="dg-tr-list">${transfers
            .map(tr => {
              const meta = [tr.date, translateTransferType(tr.type, lang), tr.fee].filter(Boolean).map(x => escapeHtml(String(x))).join(' · ')
              return `<div class="dg-tr">
                <span class="dg-tr-teams">${crestImg(tr.teams?.out?.logo)}${escapeHtml(tr.teams?.out?.name || '—')}<span class="dg-tr-arrow">→</span>${crestImg(tr.teams?.in?.logo)}${escapeHtml(tr.teams?.in?.name || '—')}</span>
                <span class="dg-muted">${meta}</span>
              </div>`
            })
            .join('')}</div>`
    }`

  const carreraPanel = `
    <div class="dg-panel-inner">
      <div class="dg-cards-2col">
        <div class="dg-info-card"><p class="dg-muted">${escapeHtml(t(lang, 'r_contract'))}</p><p class="dg-info-value">${escapeHtml(content.contrato) || '—'}</p></div>
        <div class="dg-info-card"><p class="dg-muted">${escapeHtml(t(lang, 'r_marketValue'))}</p><p class="dg-info-value">${escapeHtml(content.valorMercado) || '—'}</p></div>
      </div>
      ${transfersHtml}
      ${marketEvoHtml
        ? `<h3 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_marketEvo'))}</h3><div class="dg-chart">${marketEvoHtml}</div>${helpBox(t(lang, 'help_market'))}`
        : ''}
    </div>`

  const leaderWins = Math.max(0, ...compWins.wins.map(w => w.wins))
  const compRadarHtml = hasPlayerComparison && compRadarSvgStr
    ? `<h3 class="dg-panel-title">Radar comparativo</h3>
        <div class="dg-legend">${compRadar.series
          .map(s => `<span class="dg-legend-item"><span class="dg-legend-dot" style="background:${safeHexColor(s.color, '#8A9099')}"></span>${escapeHtml(s.name || 'Jugador')}</span>`)
          .join('')}</div>
        <div class="dg-chart">${compRadarSvgStr}</div>`
    : ''

  const compWinsHtml = hasPlayerComparison
    ? `<div class="dg-wins">
        ${compWins.wins
          .map(w => {
            const leads = w.wins === leaderWins && leaderWins > 0
            const col = safeHexColor(w.color, '#8A9099')
            return `<div class="dg-win-card"${leads ? ` style="border-color:${col}"` : ''}>
              <div class="dg-win-head"><span class="dg-legend-dot" style="background:${col}"></span><span>${escapeHtml(w.name || 'Sin nombre')}</span></div>
              <p class="dg-win-value"${leads ? ` style="color:${col}"` : ''}>${w.wins}<span class="dg-win-total"> / ${compWins.total}</span></p>
              <p class="dg-win-label">${escapeHtml(t(lang, 'm_metricsWon'))}</p>
            </div>`
          })
          .join('')}
      </div>`
    : ''

  const playerComparisonHtml = hasPlayerComparison
    ? `${compRadarHtml}${compWinsHtml}
        ${helpBox(t(lang, 'help_compar'))}
        <h3 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_detail'))}</h3>
        <div class="dg-table-wrap"><table class="dg-table">
          <thead><tr>
            <th>${escapeHtml(t(lang, 'h_metric'))}</th>
            ${compTable.players
              .map(
                p =>
                  `<th><span class="dg-legend-item"><span class="dg-legend-dot" style="background:${safeHexColor(p.color, '#8A9099')}"></span>${escapeHtml(p.name || 'Sin nombre')}</span></th>`,
              )
              .join('')}
          </tr></thead>
          <tbody>
            ${compTable.rows
              .map(
                row => `<tr>
              <td>${escapeHtml(translateMetric(row.label, lang))}</td>
              ${row.cells
                .map(
                  cell =>
                    `<td${cell.best ? ' style="color:#4ADE80;font-weight:700"' : ''}>${escapeHtml(cell.value)}</td>`,
                )
                .join('')}
            </tr>`,
              )
              .join('')}
          </tbody>
        </table></div>`
    : ''

  const comparacionesPanel = `
    <div class="dg-panel-inner">
      ${playerComparisonHtml}
      ${
        content.hideComparables
          ? ''
          : `<h3 class="dg-panel-title${hasPlayerComparison ? ' dg-mt' : ''}">${escapeHtml(t(lang, 't_comparables'))}</h3>
            ${
              comparables.length === 0
                ? `<p class="dg-empty">${escapeHtml(t(lang, 'm_noComparables'))}</p>`
                : `<div class="dg-table-wrap"><table class="dg-table">
                    <thead><tr><th>${escapeHtml(t(lang, 'h_player'))}</th><th>${escapeHtml(t(lang, 'r_club'))}</th><th>${escapeHtml(t(lang, 's_rating'))}</th><th>${escapeHtml(t(lang, 'h_delta'))}</th></tr></thead>
                    <tbody>
                      ${comparables
                        .map(
                          c => `<tr>
                        <td>${escapeHtml(c.jugador) || '—'}</td>
                        <td>${escapeHtml(c.club) || '—'}</td>
                        <td>${escapeHtml(c.rating) || '—'}</td>
                        <td>${escapeHtml(c.delta) || '—'}</td>
                      </tr>`,
                        )
                        .join('')}
                    </tbody>
                  </table></div>`
            }`
      }
      ${
        content.comparaciones
          ? `<h4 class="dg-panel-title dg-mt">${escapeHtml(t(lang, 't_notes'))}</h4><p class="dg-notes">${escapeHtml(content.comparaciones)}</p>`
          : ''
      }
    </div>`

  // ── Métricas evolutivas (Wyscout) — solo si el llamador resolvió la data ──
  const evolution = opts.evolution ?? []
  const showEvolutivas = evolution.length > 0
  const evolutivasPanel = showEvolutivas
    ? `<div class="dg-panel-inner">
         <h3 class="dg-panel-title">${escapeHtml(t(lang, 't_evolutivas'))}</h3>
         <p class="dg-muted dg-subtitle">${escapeHtml(t(lang, 'm_evolutivas_sub'))}</p>
         ${evolution
           .map(
             ec =>
               `<h4 class="dg-panel-title dg-mt">${escapeHtml(ec.label)}${ec.unit === '%' ? ' (%)' : ''}</h4><div class="dg-chart">${lineSvg({ points: ec.points, unit: ec.unit })}</div>`,
           )
           .join('')}
       </div>`
    : ''

  const tabs = [
    ...(showGeneral ? [{ id: 'general', html: generalPanel }] : []),
    { id: 'radar', html: radarPanel },
    { id: 'bars', html: barsPanel },
    { id: 'scatter', html: scatterPanel },
    ...(showFisico ? [{ id: 'fisico', html: fisicoPanel }] : []),
    ...(showEvolutivas ? [{ id: 'evolutivas', html: evolutivasPanel }] : []),
    { id: 'video', html: videoPanel },
    { id: 'carrera', html: carreraPanel },
    { id: 'comparaciones', html: comparacionesPanel },
  ]

  const tabBarHtml = tabs
    .map(
      (tb, i) =>
        `<button type="button" class="dg-tab${i === 0 ? ' active' : ''}" data-tab="${tb.id}">${escapeHtml(t(lang, `tab_${tb.id}`))}</button>`,
    )
    .join('')

  const panelsHtml = tabs
    .map((tb, i) => `<section class="dg-panel${i === 0 ? ' active' : ''}" data-panel="${tb.id}">${tb.html}</section>`)
    .join('')

  const title = `Informe — ${nombre}`

  return `<!doctype html>
<html lang="${lang}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
${css}
</style>
</head>
<body>
<div class="dg-bg"></div>
<div class="dg-rotate-hint"><svg class="dg-rotate-ico" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2.6" width="6.6" height="12" rx="1.5"/><path d="M6.3 12.7a7.6 7.6 0 0 0 12.4 2.9"/><polyline points="18.9 11.9 19.1 15.9 15.4 14.9"/></svg><span>${escapeHtml(t(lang, 'hint_rotate'))}</span></div>
<div class="dg-container">
  <header class="dg-header">
    ${logoHtml}
    <span class="dg-header-badge">${escapeHtml(t(lang, 'm_scoutingReport'))}</span>
    ${crestHtml}
  </header>

  <div class="dg-layout">
    ${playerRailHtml}

    <div class="dg-panel-card">
      <nav class="dg-tabbar">${tabBarHtml}</nav>
      <div class="dg-panels">${panelsHtml}</div>
    </div>
  </div>

  <footer class="dg-footer">
    <p>Doble G Sports Group ${clubYLiga ? `· ${escapeHtml(clubYLiga)}` : ''}</p>
  </footer>
</div>
<script>
${script}
</script>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// CSS / JS embebidos (estáticos, sin datos de usuario)
// ---------------------------------------------------------------------------

const css = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #08090B;
    color: #F5F7FA;
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    position: relative;
  }
  .dg-bg {
    position: fixed;
    inset: 0;
    background: radial-gradient(1200px 600px at 15% -10%, rgba(34,197,94,0.16), transparent 60%);
    pointer-events: none;
    z-index: 0;
  }
  /* Aviso efímero solo en mobile: sugiere girar el teléfono para leer mejor.
     Pastilla estilo Doble G (tarjeta oscura + hairline, verde solo en el ícono).
     Aparece al abrir y se desvanece solo (~3.4s) con animación CSS pura. */
  .dg-rotate-hint { display: none; }
  .dg-rotate-ico { width: 17px; height: 17px; flex-shrink: 0; transform-origin: 50% 55%; }
  @media (max-width: 640px) {
    .dg-rotate-hint {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      position: fixed;
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 50;
      max-width: calc(100% - 28px);
      padding: 9px 15px 9px 12px;
      border-radius: 13px;
      background: #0F1114;
      border: 1px solid rgba(255,255,255,0.09);
      color: #C3C9D1;
      font-size: 12.5px;
      font-weight: 500;
      letter-spacing: 0.01em;
      line-height: 1.35;
      box-shadow: 0 14px 34px rgba(0,0,0,0.5);
      pointer-events: none;
      animation: dgRotateHint 3.4s cubic-bezier(0.22,1,0.36,1) forwards;
    }
    .dg-rotate-ico { animation: dgRotateIco 3.4s ease-in-out forwards; }
  }
  @keyframes dgRotateHint {
    0% { opacity: 0; transform: translate(-50%, -14px) scale(0.96); }
    10% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    80% { opacity: 1; transform: translate(-50%, 0) scale(1); }
    100% { opacity: 0; transform: translate(-50%, -10px) scale(0.98); visibility: hidden; }
  }
  @keyframes dgRotateIco {
    0%, 24% { transform: rotate(0deg); }
    38% { transform: rotate(-20deg); }
    54%, 100% { transform: rotate(0deg); }
  }
  @media (prefers-reduced-motion: reduce) and (max-width: 640px) {
    .dg-rotate-hint { animation: dgRotateHintFade 3.4s linear forwards; }
    .dg-rotate-ico { animation: none; }
  }
  @keyframes dgRotateHintFade {
    0% { opacity: 0; } 8% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; visibility: hidden; }
  }
  .dg-container {
    position: relative;
    z-index: 1;
    max-width: 1240px;
    margin: 0 auto;
    padding: 24px 24px 48px;
  }
  .dg-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }
  .dg-logo { height: 32px; width: auto; display: block; }
  .dg-header-badge {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8A9099;
  }
  .dg-liga-crest {
    height: 44px;
    width: auto;
    object-fit: contain;
    margin-inline-start: auto;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35));
  }
  .dg-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 20px;
  }
  /* Tablet / pantallas medianas: apila la barra lateral sobre el contenido y la
     centra, para que no quede un panel angosto al costado. */
  @media (max-width: 900px) {
    .dg-layout { grid-template-columns: 1fr; }
    .dg-rail { width: 100%; max-width: 560px; margin: 0 auto; }
  }
  /* Celular/tablet en HORIZONTAL: usa dos columnas a lo ancho de la pantalla,
     como en desktop (no la vista angosta apilada). Va DESPUÉS del bloque 900px
     para ganarle cuando ambos aplican. */
  @media (orientation: landscape) and (min-width: 640px) and (max-width: 1024px) {
    .dg-layout { grid-template-columns: 232px 1fr; }
    .dg-rail { width: auto; max-width: none; margin: 0; }
  }
  /* Mobile: menos padding, tipografía y tabs más compactas, tarjetas en 1 columna. */
  @media (max-width: 560px) {
    body { font-size: 14px; }
    .dg-container { padding: 16px 14px 40px; }
    .dg-panel-card { padding: 16px 14px; }
    .dg-rail { padding: 16px; }
    .dg-rail-head h2 { font-size: 15.5px; }
    .dg-photo-fallback { font-size: 22px; }
    .dg-header { margin-bottom: 14px; gap: 10px; }
    .dg-tabbar { margin-bottom: 16px; }
    .dg-tab { padding: 8px 10px; font-size: 12px; }
    .dg-cards-2col { grid-template-columns: 1fr; }
    .dg-wins { grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
    .dg-mainstats-grid { gap: 8px; }
  }
  .dg-rail, .dg-panel-card {
    background: #0F1114;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
  }
  .dg-rail { padding: 20px; height: fit-content; }
  .dg-rail-head {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  .dg-photo {
    width: 108px;
    height: 108px;
    border-radius: 999px;
    object-fit: cover;
    border: 3px solid rgba(255,255,255,0.08);
  }
  .dg-photo-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 800;
    color: #8A9099;
    background: rgba(255,255,255,0.04);
  }
  .dg-rail-head h2 {
    margin: 0 0 2px;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .dg-muted { color: #8A9099; margin: 0; font-size: 13px; }
  .dg-datalist { font-size: 13px; margin: 0 0 16px; }
  .dg-datarow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 0;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .dg-datarow:last-child { border-bottom: none; }
  .dg-datarow dt { margin: 0; color: #8A9099; flex-shrink: 0; }
  .dg-datarow dd {
    margin: 0;
    font-weight: 600;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dg-mainstats { margin-bottom: 16px; }
  .dg-mainstats h4 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8A9099;
    margin: 0 0 10px;
  }
  .dg-mainstats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .dg-stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
  }
  .dg-stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8A9099;
  }
  .dg-stat-value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
  .dg-tm-link {
    display: block;
    text-align: center;
    width: 100%;
    padding: 10px 16px;
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    color: #F5F7FA;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .dg-tm-link:hover { background: rgba(255,255,255,0.1); }
  .dg-panel-card { padding: 20px; min-width: 0; }
  .dg-tabbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 20px;
  }
  .dg-tab {
    appearance: none;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    padding: 10px 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: #8A9099;
    cursor: pointer;
    white-space: nowrap;
  }
  .dg-tab:hover { color: #F5F7FA; }
  .dg-tab.active { color: #22C55E; border-bottom-color: #22C55E; }
  .dg-panel { display: none; }
  .dg-panel.active { display: block; }
  .dg-panel-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8A9099;
    margin: 0 0 6px;
  }
  .dg-panel-title.dg-mt { margin-top: 24px; }
  .dg-subtitle { margin-bottom: 16px; font-size: 12px; }
  .dg-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 12px; }
  .dg-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #F5F7FA;
  }
  .dg-legend-dot { width: 9px; height: 9px; border-radius: 999px; flex-shrink: 0; }
  .dg-legend-bar { width: 3px; height: 13px; border-radius: 2px; flex-shrink: 0; }
  .dg-wins {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
    margin-top: 18px;
  }
  .dg-win-card {
    background: #14171B;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 12px;
    text-align: center;
  }
  .dg-win-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #F5F7FA;
  }
  .dg-win-value {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: #F5F7FA;
  }
  .dg-win-total { font-size: 12px; font-weight: 400; color: #8A9099; }
  .dg-win-label {
    margin: 2px 0 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8A9099;
  }
  .dg-gauge { margin: 4px 0 14px; }
  .dg-gauge svg { display: block; max-width: 200px; margin: 0 auto; }
  .dg-gauge-label {
    margin: -2px 0 0;
    text-align: center;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8A9099;
  }
  .dg-rating-cmp {
    margin: 6px 0 0;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.3;
    color: #22C55E;
  }
  .dg-result-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 999px;
    margin-inline-end: 6px;
    vertical-align: middle;
  }
  .dg-tr-list { display: flex; flex-direction: column; gap: 6px; }
  .dg-tr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border-radius: 10px;
    background: #14171B;
    font-size: 13px;
    color: #F5F7FA;
  }
  .dg-tr-teams { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; }
  .dg-tr-logo { width: 18px; height: 18px; object-fit: contain; border-radius: 3px; }
  .dg-tr-arrow { color: #8A9099; margin: 0 1px; }
  .dg-tr .dg-muted { font-size: 12px; font-variant-numeric: tabular-nums; }
  .dg-help {
    margin-top: 16px;
    border-radius: 12px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.5;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    color: #8A9099;
  }
  .dg-help-k { color: #22C55E; font-weight: 700; }
  .dg-help-h { margin-top: 6px; color: #C3C9D1; }
  .dg-help-h span { color: #8A9099; }
  .dg-note { margin: 6px 0 0; font-size: 13px; color: #F5F7FA; }
  .dg-inj-list { display: flex; flex-direction: column; gap: 6px; }
  .dg-inj {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 10px;
    background: #14171B;
    font-size: 13px;
    color: #F5F7FA;
  }
  .dg-inj .dg-muted { font-size: 12px; font-variant-numeric: tabular-nums; }
  .dg-evo-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .dg-evo-head .dg-panel-title { margin: 0; }
  .dg-seg {
    display: inline-flex;
    padding: 2px;
    border-radius: 10px;
    background: #14171B;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .dg-seg-btn {
    appearance: none;
    border: none;
    background: none;
    padding: 5px 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: #8A9099;
    cursor: pointer;
  }
  .dg-seg-btn.active { background: #22C55E; color: #08090B; }
  .dg-evo-chart { display: none; }
  .dg-evo-chart.active { display: block; }
  .dg-bars-narrow { display: none; }
  @media (max-width: 640px) {
    .dg-bars-wide { display: none; }
    .dg-bars-narrow { display: block; }
  }
  .dg-chart { width: 100%; max-width: 100%; overflow-x: auto; }
  .dg-chart svg { display: block; max-width: 100%; height: auto; }
  .dg-numbers { margin-top: 24px; }
  .dg-numbers h4 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8A9099;
    margin: 0 0 12px;
  }
  .dg-numbers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .dg-number-card {
    background: #0F1114;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 3px;
  }
  .dg-number-value {
    font-size: 26px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .dg-color-green .dg-number-value { color: #22C55E; }
  .dg-color-amber .dg-number-value { color: #FBBF24; }
  .dg-color-red .dg-number-value { color: #F87171; }
  .dg-color-neutral .dg-number-value { color: #8A9099; }
  .dg-number-rank { font-size: 11px; font-weight: 600; color: #8A9099; }
  .dg-number-label { font-size: 12px; color: #F5F7FA; line-height: 1.2; }
  .dg-scatter-block { margin-bottom: 24px; }
  .dg-scatter-block:last-child { margin-bottom: 0; }
  .dg-caption { font-size: 12px; color: #8A9099; margin: 8px 0 0; }
  .dg-empty { font-size: 13px; color: #8A9099; font-style: italic; }
  .dg-empty-box {
    text-align: center;
    padding: 48px 16px;
    border: 2px dashed rgba(255,255,255,0.1);
    border-radius: 16px;
  }
  .dg-video-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 14px;
    overflow: hidden;
    background: #000;
  }
  .dg-video-wrap iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .dg-video-wrap[data-yt] { cursor: pointer; }
  .dg-video-poster { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
  .dg-video-play {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 64px; height: 64px; border-radius: 50%;
    background: rgba(0,0,0,0.5); border: 2px solid rgba(255,255,255,0.9);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    transition: transform 0.15s ease, background 0.15s ease;
  }
  .dg-video-wrap[data-yt]:hover .dg-video-play { transform: translate(-50%, -50%) scale(1.08); background: rgba(0,0,0,0.65); }
  .dg-video-play::after {
    content: ''; margin-left: 4px;
    border-style: solid; border-width: 10px 0 10px 17px;
    border-color: transparent transparent transparent #fff;
  }
  .dg-video-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 10px 16px;
    border-radius: 12px;
    background: #FF0000;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
  }
  .dg-table-wrap { overflow-x: auto; }
  .dg-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .dg-table th {
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8A9099;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    white-space: nowrap;
  }
  .dg-table td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    white-space: nowrap;
  }
  .dg-table tr:last-child td { border-bottom: none; }
  .dg-cards-2col {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-top: 16px;
  }
  .dg-info-card {
    background: rgba(255,255,255,0.03);
    border-radius: 14px;
    padding: 12px 14px;
  }
  .dg-info-value { margin: 2px 0 0; font-weight: 700; font-variant-numeric: tabular-nums; }
  .dg-notes { font-size: 13px; line-height: 1.5; white-space: pre-line; color: #F5F7FA; }
  .dg-footer { margin-top: 32px; text-align: center; }
  .dg-footer p { margin: 0; font-size: 11px; color: #8A9099; }
`

const script = `
(function () {
  var tabs = document.querySelectorAll('.dg-tab');
  var panels = document.querySelectorAll('.dg-panel');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var id = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.classList.remove('active'); });
      panels.forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      var panel = document.querySelector('.dg-panel[data-panel="' + id + '"]');
      if (panel) panel.classList.add('active');
    });
  });

  // Portada de video: al tocar, reemplaza el thumbnail por el reproductor.
  document.querySelectorAll('.dg-video-wrap[data-yt]').forEach(function (w) {
    function play() {
      var id = w.getAttribute('data-yt');
      w.innerHTML = '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      w.removeAttribute('data-yt');
    }
    w.addEventListener('click', play);
    w.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); play(); } });
  });

  // Toggle Partido / Semanal / Mensual del gráfico de evolución de nivel.
  var segs = document.querySelectorAll('.dg-seg-btn');
  segs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var v = btn.getAttribute('data-evo');
      segs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-evo') === v); });
      document.querySelectorAll('.dg-evo-chart').forEach(function (c) {
        c.classList.toggle('active', c.getAttribute('data-evo') === v);
      });
    });
  });
})();
`

// ---------------------------------------------------------------------------
// exportInformeHTML: construye el HTML y dispara la descarga en el navegador
// ---------------------------------------------------------------------------

export function exportInformeHTML(opts: {
  informe: Informe
  stats: MetricStat[]
  matrix: Record<string, (number | null)[]>
  defs: MetricDef[]
  logoDataUrl?: string
  enrichment?: InformeEnrichment
  evolution?: EvolutionChartExport[]
  transfers?: PlayerTransfer[]
}): void {
  const html = buildInformeHtml(opts)
  const nombre = opts.informe.content.nombre || 'informe'
  const safeName = nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Informe_${safeName}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
