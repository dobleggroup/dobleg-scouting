import { radarSvg, barsSvg, scatterSvg } from './chartSvg'
import { radarData, barsData, scatterData } from './chartData'
import type { Informe, MetricStat, MetricDef } from './types'

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

function formatStatValue(stat: MetricStat): string {
  if (stat.value == null) return '—'
  return stat.def.unit === '%' ? `${stat.value.toFixed(0)}%` : stat.value.toFixed(2)
}

function safeDataUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /^data:image\//i.test(url) ? url : null
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
}): string {
  const { informe, stats, matrix, defs } = opts
  const { content } = informe

  const nombre = content.nombre || 'Sin nombre'
  const rolYPosicion = [content.posicion, content.rol].filter(Boolean).join(' · ')
  const clubYLiga = [content.club, content.liga].filter(Boolean).join(' · ')

  const logoSafe = safeDataUrl(opts.logoDataUrl)
  const fotoSafe = safeDataUrl(informe.fotoDataUrl)
  const transfermarktUrl = safeHttpUrl(content.transfermarktUrl)
  const youtubeId = safeYouTubeId(content.videoUrl)

  // ── Charts ──
  const radar = radarData(informe, stats, matrix, defs)
  const radarSvgStr = radarSvg({ axes: radar.axes, series: radar.series })

  const barsRows = barsData(stats, informe.charts.bar)
  const barsSvgStr = barsSvg({ rows: barsRows })

  const scatterBlocks = informe.charts.scatters.map(sc => {
    const data = scatterData(sc, matrix, defs, informe.protagonistIndex)
    return {
      caption: sc.caption,
      svg: scatterSvg({
        points: data.points,
        xLabel: data.xLabel,
        yLabel: data.yLabel,
        xMin: data.xMin,
        yMin: data.yMin,
      }),
    }
  })

  const numberCards = informe.charts.numbers
    .map(key => stats.find(s => s.def.key === key))
    .filter((s): s is MetricStat => !!s)

  const matches = content.ultimos5.filter(m => m.rival || m.resultado || m.rating || m.minutos)
  const comparables = content.comparables.filter(c => c.jugador || c.club || c.rating || c.delta)

  // ── Header / logo ──
  const logoHtml = logoSafe
    ? `<img class="dg-logo" src="${logoSafe}" alt="Doble G" />`
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
      { label: 'Rating', value: content.rating },
      { label: 'PJ', value: content.pj },
      { label: 'Minutos', value: content.minutos },
      { label: 'Goles', value: content.goles },
      { label: 'Asistencias', value: content.asistencias },
    ].filter(i => i.value !== '')
    if (items.length === 0) return ''
    return `
      <div class="dg-mainstats">
        <h4>Estadísticas principales</h4>
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

  const playerRailHtml = `
    <aside class="dg-rail">
      <div class="dg-rail-head">
        ${photoHtml}
        <div>
          <h2>${escapeHtml(nombre)}</h2>
          ${rolYPosicion ? `<p class="dg-muted">${escapeHtml(rolYPosicion)}</p>` : ''}
        </div>
      </div>
      <dl class="dg-datalist">
        ${dataRow('Club', content.club)}
        ${dataRow('Liga', content.liga)}
        ${dataRow('Edad', content.edad)}
        ${dataRow('País', content.nacionalidad)}
        ${dataRow('Contrato', content.contrato)}
        ${dataRow('Representante', content.representante)}
      </dl>
      ${mainStatsHtml}
      ${transfermarktHtml}
    </aside>`

  // ── Tabs / panels (derecha) ──
  const legendHtml = radar.series
    .map(
      s =>
        `<span class="dg-legend-item"><span class="dg-legend-dot" style="background:${s.color}"></span>${escapeHtml(s.name || 'Jugador')}</span>`,
    )
    .join('')

  const numberCardsHtml = numberCards.length
    ? `
      <div class="dg-numbers">
        <h4>Números clave</h4>
        <div class="dg-numbers-grid">
          ${numberCards
            .map(
              stat => `
            <div class="dg-number-card dg-color-${stat.color}">
              <span class="dg-number-value">${escapeHtml(formatStatValue(stat))}</span>
              <span class="dg-number-rank">${stat.rank != null ? `N°${stat.rank} de ${stat.total}` : 'Sin datos'}</span>
              <span class="dg-number-label">${escapeHtml(stat.def.label)}</span>
            </div>`,
            )
            .join('')}
        </div>
      </div>`
    : ''

  const radarPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">Radar comparativo</h3>
      <p class="dg-muted dg-subtitle">${escapeHtml(informe.contextoComparacion || 'Sin contexto de comparación definido')}</p>
      <div class="dg-legend">${legendHtml}</div>
      <div class="dg-chart">${radarSvgStr}</div>
      ${numberCardsHtml}
    </div>`

  const barsPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">Barras comparativas</h3>
      ${barsRows.length ? `<div class="dg-chart">${barsSvgStr}</div>` : '<p class="dg-empty">Sin métricas asignadas.</p>'}
    </div>`

  const scatterPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">Dispersión en el contexto</h3>
      ${
        scatterBlocks.length === 0
          ? '<p class="dg-empty">Sin scatter plots definidos.</p>'
          : scatterBlocks
              .map(
                b => `
          <div class="dg-scatter-block">
            <div class="dg-chart">${b.svg}</div>
            ${b.caption ? `<p class="dg-caption">${escapeHtml(b.caption)}</p>` : ''}
          </div>`,
              )
              .join('')
      }
    </div>`

  const videoPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">Video</h3>
      ${
        youtubeId
          ? `<div class="dg-video-wrap"><iframe src="https://www.youtube.com/embed/${youtubeId}" title="Video del jugador" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
          : '<p class="dg-empty dg-empty-box">Sin video cargado.</p>'
      }
    </div>`

  const carreraPanel = `
    <div class="dg-panel-inner">
      <h3 class="dg-panel-title">Últimos 5 partidos</h3>
      ${
        matches.length === 0
          ? '<p class="dg-empty">Sin partidos cargados.</p>'
          : `<div class="dg-table-wrap"><table class="dg-table">
              <thead><tr><th>Rival</th><th>Resultado</th><th>Rating</th><th>Minutos</th></tr></thead>
              <tbody>
                ${matches
                  .map(
                    m => `<tr>
                  <td>${escapeHtml(m.rival) || '—'}</td>
                  <td>${escapeHtml(m.resultado) || '—'}</td>
                  <td>${escapeHtml(m.rating) || '—'}</td>
                  <td>${escapeHtml(m.minutos) || '—'}</td>
                </tr>`,
                  )
                  .join('')}
              </tbody>
            </table></div>`
      }
      <div class="dg-cards-2col">
        <div class="dg-info-card"><p class="dg-muted">Contrato</p><p class="dg-info-value">${escapeHtml(content.contrato) || '—'}</p></div>
        <div class="dg-info-card"><p class="dg-muted">Valor de mercado</p><p class="dg-info-value">${escapeHtml(content.valorMercado) || '—'}</p></div>
      </div>
    </div>`

  const comparacionesPanel = `
    <div class="dg-panel-inner">
      ${
        content.hideComparables
          ? ''
          : `<h3 class="dg-panel-title">Comparables</h3>
            ${
              comparables.length === 0
                ? '<p class="dg-empty">Sin comparables cargados.</p>'
                : `<div class="dg-table-wrap"><table class="dg-table">
                    <thead><tr><th>Jugador</th><th>Club</th><th>Rating</th><th>Delta</th></tr></thead>
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
          ? `<h4 class="dg-panel-title dg-mt">Notas</h4><p class="dg-notes">${escapeHtml(content.comparaciones)}</p>`
          : ''
      }
    </div>`

  const tabs = [
    { id: 'radar', label: 'Radar', html: radarPanel },
    { id: 'bars', label: 'Barras', html: barsPanel },
    { id: 'scatter', label: 'Scatter', html: scatterPanel },
    { id: 'video', label: 'Video', html: videoPanel },
    { id: 'carrera', label: 'Carrera', html: carreraPanel },
    { id: 'comparaciones', label: 'Comparaciones', html: comparacionesPanel },
  ]

  const tabBarHtml = tabs
    .map(
      (t, i) =>
        `<button type="button" class="dg-tab${i === 0 ? ' active' : ''}" data-tab="${t.id}">${escapeHtml(t.label)}</button>`,
    )
    .join('')

  const panelsHtml = tabs
    .map((t, i) => `<section class="dg-panel${i === 0 ? ' active' : ''}" data-panel="${t.id}">${t.html}</section>`)
    .join('')

  const title = `Informe — ${nombre}`

  return `<!doctype html>
<html lang="es">
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
<div class="dg-container">
  <header class="dg-header">
    ${logoHtml}
    <span class="dg-header-badge">Informe de Scouting</span>
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
  .dg-container {
    position: relative;
    z-index: 1;
    max-width: 1000px;
    margin: 0 auto;
    padding: 24px 20px 48px;
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
  .dg-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    gap: 20px;
  }
  @media (max-width: 720px) {
    .dg-layout { grid-template-columns: 1fr; }
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
    gap: 2px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    margin-bottom: 20px;
    overflow-x: auto;
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
