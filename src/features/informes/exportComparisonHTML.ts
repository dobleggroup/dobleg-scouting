import { radarSvg } from './chartSvg'
import { buildRadarSeries, type ComparisonRow, type WinCounts } from './comparisonInsight'
import type { Informe } from './types'

// Verde de marca — el mismo en los dos temas (es el que usa toda la plataforma).
// El acento del jugador 2 sí cambia con el tema (gris claro en oscuro, oscuro en claro).
const GREEN = '#22C55E'
const B_LIGHT = '#111827'
const B_DARK = '#E5E7EB'

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}

function safeDataUrl(v: string | null | undefined): string | null {
  return v && /^data:image\//i.test(v) ? v : null
}

function metaLine(parts: (string | undefined | null)[]): string {
  return parts.filter(Boolean).join(' · ')
}

function playerCardHtml(opts: {
  name: string; club: string; liga: string; edad: string; altura: string; pie: string
  contrato: string; posicion: string; rol: string; pj: string; minutos: string; goles: string; asistencias: string
  foto: string | null; accent: string; align: 'left' | 'right'
}): string {
  const fotoHtml = opts.foto
    ? `<img class="cmp-photo" src="${opts.foto}" alt="${escapeHtml(opts.name)}" />`
    : `<div class="cmp-photo cmp-photo-fallback">${escapeHtml(initials(opts.name))}</div>`
  const tiles = [
    { v: opts.pj, l: 'PJ' }, { v: opts.minutos, l: 'Min' }, { v: opts.goles, l: 'Goles' }, { v: opts.asistencias, l: 'Asist.' },
  ]
  return `<div class="cmp-card" style="border-left-color:${opts.accent}">
    <div class="cmp-card-head">
      ${fotoHtml}
      <div class="cmp-card-id">
        <p class="cmp-card-name" style="color:${opts.accent}">${escapeHtml(opts.name) || '—'}</p>
        <p class="cmp-card-meta">${escapeHtml(metaLine([opts.club, opts.liga]))}</p>
        <p class="cmp-card-meta2">${escapeHtml(metaLine([opts.edad ? `${opts.edad} años` : '', opts.altura ? `${opts.altura} m` : '', opts.pie]))}</p>
        ${opts.contrato ? `<p class="cmp-card-meta2">Contrato hasta <b>${escapeHtml(opts.contrato)}</b></p>` : ''}
        ${opts.posicion ? `<p class="cmp-card-meta2">Posición: <b>${escapeHtml(opts.posicion)}</b></p>` : ''}
        ${opts.rol ? `<p class="cmp-card-meta2">Rol: <b>${escapeHtml(opts.rol)}</b></p>` : ''}
      </div>
    </div>
    <div class="cmp-card-tiles">
      ${tiles.filter(t => t.v).map(t => `<div class="cmp-tile"><p class="cmp-tile-v">${escapeHtml(t.v)}</p><p class="cmp-tile-l">${escapeHtml(t.l)}</p></div>`).join('')}
    </div>
  </div>`
}

function barRowHtml(row: ComparisonRow): string {
  const aWin = row.winner === 'a'
  const bWin = row.winner === 'b'
  return `<div class="cmp-row">
    <div class="cmp-row-a">
      <span class="cmp-row-val${aWin ? ' win' : ''}">${escapeHtml(row.displayA)}</span>
      <div class="cmp-bar-track"><div class="cmp-bar cmp-bar-a${aWin ? ' win' : ''}" style="width:${row.pctA}%"></div></div>
    </div>
    <span class="cmp-row-label">${escapeHtml(row.label)}</span>
    <div class="cmp-row-b">
      <div class="cmp-bar-track"><div class="cmp-bar cmp-bar-b${bWin ? ' win' : ''}" style="width:${row.pctB}%"></div></div>
      <span class="cmp-row-val${bWin ? ' win' : ''}">${escapeHtml(row.displayB)}</span>
    </div>
  </div>`
}

export interface ComparisonHtmlOptions {
  informe: Informe
  rows: ComparisonRow[]
  insightText: string
  winCounts: WinCounts
  nameA: string
  nameB: string
  logoDataUrl?: string
  share?: { url: string; imageUrl: string | null }
}

export function buildComparisonHtml(opts: ComparisonHtmlOptions): string {
  const { informe, rows, insightText, winCounts, nameA, nameB } = opts
  const contentA = informe.content
  const b = informe.comparisonB
  const fotoA = safeDataUrl(informe.fotoDataUrl)
  const fotoB = safeDataUrl(informe.fotoComparadoDataUrl)
  const logoSafe = safeDataUrl(opts.logoDataUrl)

  const cardA = playerCardHtml({
    name: nameA, club: contentA.club, liga: contentA.liga, edad: contentA.edad,
    altura: contentA.altura ?? '', pie: contentA.pie ?? '', contrato: contentA.contrato,
    posicion: contentA.posicion, rol: contentA.rol, pj: contentA.pj, minutos: contentA.minutos,
    goles: contentA.goles, asistencias: contentA.asistencias, foto: fotoA, accent: 'var(--green)', align: 'left',
  })
  const cardB = playerCardHtml({
    name: nameB, club: b?.club ?? '', liga: b?.liga ?? '', edad: b?.edad ?? '',
    altura: b?.altura ?? '', pie: b?.pie ?? '', contrato: b?.contrato ?? '',
    posicion: b?.posicion ?? '', rol: b?.rol ?? '', pj: b?.pj ?? '', minutos: b?.minutos ?? '',
    goles: b?.goles ?? '', asistencias: b?.asistencias ?? '', foto: fotoB, accent: 'var(--b-accent)', align: 'right',
  })

  // Colores como var(--x) en vez de hex fijo: el SVG queda embebido inline en el
  // HTML y hereda el cascade de CSS, así el radar cambia de color solo al togglear
  // el tema (si fuera hex fijo, quedaría "pegado" al tema que estaba activo al exportar).
  const { axes, series } = buildRadarSeries(rows, nameA, nameB, 'var(--green)', 'var(--b-accent)')
  const radar = axes.length >= 3
    ? radarSvg({ axes, series, size: 460, gridColor: 'var(--track)', axisTextColor: 'var(--muted)' })
    : ''

  const barsHtml = rows.map(barRowHtml).join('')

  const summaryParts = [
    winCounts.winsA > 0 ? `<b style="color:var(--green)">${escapeHtml(nameA)}</b> supera en <b>${winCounts.winsA}</b> de ${rows.length} métricas` : '',
    winCounts.winsB > 0 ? `<b>${escapeHtml(nameB)}</b> en <b>${winCounts.winsB}</b>` : '',
    winCounts.ties > 0 ? `${winCounts.ties} empate${winCounts.ties === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')

  const ogTags = opts.share
    ? `<meta property="og:title" content="${escapeHtml(nameA)} vs ${escapeHtml(nameB)}" />
       <meta property="og:description" content="Comparativa · ${escapeHtml(informe.contextoComparacion)}" />
       <meta property="og:url" content="${escapeHtml(opts.share.url)}" />
       ${opts.share.imageUrl ? `<meta property="og:image" content="${escapeHtml(opts.share.imageUrl)}" /><meta name="twitter:card" content="summary_large_image" />` : ''}`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(nameA)} vs ${escapeHtml(nameB)} — Comparativa</title>
${ogTags}
<style>
  /* Oscuro por default (nuestra estética, como el resto de los informes) — claro
     es un toggle explícito, no depende de la preferencia del sistema. */
  :root {
    --bg:#08090B; --header:#000000; --card:#14171B; --border:rgba(255,255,255,0.08); --text:#F5F7FA; --muted:#8A9099;
    --track:rgba(255,255,255,0.10); --b-accent:${B_DARK}; --green:${GREEN};
  }
  :root[data-theme="light"] {
    --bg:#FFFFFF; --header:#111827; --card:#F7F8F9; --border:#E5E7EB; --text:#111827; --muted:#6B7280;
    --track:#E5E7EB; --b-accent:${B_LIGHT}; --green:${GREEN};
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font-family:"Segoe UI",system-ui,-apple-system,sans-serif; }
  .cmp-header { background:var(--header); color:#fff; padding:24px 32px; display:flex; align-items:center; justify-content:space-between; }
  .cmp-header img { height:32px; }
  .cmp-header h1 { margin:0; font-size:22px; font-weight:800; }
  .cmp-header p { margin:2px 0 0; font-size:13px; color:#9CA3AF; }
  .cmp-theme-btn { border:1px solid rgba(255,255,255,0.25); background:transparent; color:#fff; border-radius:10px; padding:6px 12px; font-size:12px; cursor:pointer; }
  .cmp-wrap { max-width:920px; margin:0 auto; padding:24px 20px 40px; }
  .cmp-cards { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; }
  @media (max-width:640px) { .cmp-cards { grid-template-columns:1fr; } }
  .cmp-card { background:var(--card); border:1px solid var(--border); border-left:4px solid; border-radius:14px; padding:16px; }
  .cmp-card-head { display:flex; gap:14px; align-items:flex-start; }
  .cmp-photo { width:64px; height:64px; border-radius:999px; object-fit:cover; flex-shrink:0; }
  .cmp-photo-fallback { display:flex; align-items:center; justify-content:center; background:var(--border); color:var(--muted); font-weight:800; font-size:18px; }
  .cmp-card-name { margin:0; font-size:17px; font-weight:800; }
  .cmp-card-meta { margin:2px 0 0; font-size:12.5px; color:var(--muted); font-weight:600; }
  .cmp-card-meta2 { margin:2px 0 0; font-size:12px; color:var(--muted); }
  .cmp-card-tiles { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:14px; }
  .cmp-tile { background:var(--bg); border:1px solid var(--border); border-radius:10px; text-align:center; padding:8px 4px; }
  .cmp-tile-v { margin:0; font-size:16px; font-weight:800; }
  .cmp-tile-l { margin:0; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  .cmp-section { display:grid; grid-template-columns:1.1fr 1fr; gap:24px; align-items:center; margin-bottom:28px; }
  @media (max-width:720px) { .cmp-section { grid-template-columns:1fr; } }
  .cmp-radar { width:100%; }
  .cmp-insight-title { margin:0 0 8px; font-size:15px; font-weight:800; }
  .cmp-insight-text { margin:0 0 14px; font-size:13.5px; line-height:1.6; color:var(--text); }
  .cmp-legend { display:flex; gap:16px; font-size:12.5px; font-weight:600; }
  .cmp-legend span { display:inline-flex; align-items:center; gap:6px; }
  .cmp-dot { width:10px; height:10px; border-radius:999px; display:inline-block; }
  .cmp-table { border-top:1px solid var(--border); padding-top:8px; }
  .cmp-row { display:grid; grid-template-columns:1fr 160px 1fr; align-items:center; gap:10px; padding:7px 0; }
  .cmp-row-a { display:grid; grid-template-columns:52px 1fr; align-items:center; gap:8px; }
  .cmp-row-b { display:grid; grid-template-columns:1fr 52px; align-items:center; gap:8px; }
  .cmp-row-val { font-size:13px; font-weight:600; color:var(--muted); text-align:right; }
  .cmp-row-b .cmp-row-val { text-align:left; }
  .cmp-row-val.win { color:var(--text); font-weight:800; }
  .cmp-row-label { font-size:12.5px; color:var(--muted); text-align:center; }
  .cmp-bar-track { height:8px; background:var(--track); border-radius:999px; overflow:hidden; }
  .cmp-bar { height:100%; border-radius:999px; background:var(--track); }
  .cmp-bar-a.win { background:var(--green); }
  .cmp-bar-b.win { background:var(--b-accent); }
  .cmp-row-b .cmp-bar-track { display:flex; justify-content:flex-end; }
  .cmp-row-b .cmp-bar-track .cmp-bar { flex-shrink:0; height:100%; }
  .cmp-footer { display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:16px; border-top:1px solid var(--border); font-size:12.5px; color:var(--muted); flex-wrap:wrap; gap:8px; }
</style>
</head>
<body>
  <div class="cmp-header">
    <div style="display:flex;align-items:center;gap:14px">
      ${logoSafe ? `<img src="${logoSafe}" alt="Doble G" />` : ''}
    </div>
    <div style="text-align:right">
      <h1>Comparativa</h1>
      <p>${escapeHtml(informe.contextoComparacion) || '&nbsp;'}</p>
    </div>
  </div>
  <button class="cmp-theme-btn" id="cmp-theme-toggle" style="position:fixed;top:16px;right:16px;z-index:10">🌓</button>
  <div class="cmp-wrap">
    <div class="cmp-cards">${cardA}${cardB}</div>
    <div class="cmp-section">
      <div class="cmp-radar">
        ${radar || '<p style="color:var(--muted);font-size:13px">Elegí al menos 3 métricas para el radar.</p>'}
        <div class="cmp-legend">
          <span><span class="cmp-dot" style="background:var(--green)"></span>${escapeHtml(nameA)}</span>
          <span><span class="cmp-dot" style="background:var(--b-accent)"></span>${escapeHtml(nameB)}</span>
        </div>
      </div>
      <div>
        <h3 class="cmp-insight-title">Perfil de rendimiento</h3>
        <p class="cmp-insight-text">${escapeHtml(insightText)}</p>
      </div>
    </div>
    <div class="cmp-table">${barsHtml}</div>
    <div class="cmp-footer">
      <span>${summaryParts}</span>
      <span>${escapeHtml(informe.contextoComparacion)}</span>
    </div>
  </div>
  <script>
    (function () {
      var KEY = 'cmp-theme';
      var btn = document.getElementById('cmp-theme-toggle');
      var stored = null;
      try { stored = localStorage.getItem(KEY); } catch (e) {}
      if (stored === 'light') document.documentElement.setAttribute('data-theme', 'light');
      btn.addEventListener('click', function () {
        var isLight = document.documentElement.getAttribute('data-theme') === 'light';
        var next = isLight ? 'dark' : 'light';
        if (next === 'dark') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', 'light');
        try { localStorage.setItem(KEY, next); } catch (e) {}
      });
    })();
  </script>
</body>
</html>`
}

/** Descarga el HTML autocontenido (se abre sin internet). */
export function exportComparisonHTML(opts: ComparisonHtmlOptions): void {
  const html = buildComparisonHtml(opts)
  const safeName = `${opts.nameA}_vs_${opts.nameB}`.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Comparacion_${safeName}.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
