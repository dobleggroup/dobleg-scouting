import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { EnrichedPlayer, MarketValueHistoryEntry } from '@/types'
import { POSITION_MAP, DISPLAY_METRICS, DISPLAY_POSITION_MAP } from '@/constants/scoring'
import type { PDFTheme } from '@/components/ui/ExportPDFModal'

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface PlayerExportConfig {
  playerName: string
  sections: string[]
  source: 'externo' | 'interno' | 'seguimiento'
}

export interface FullExportData {
  player: EnrichedPlayer
  source: 'externo' | 'interno' | 'seguimiento'
  sections: string[]
  theme?: PDFTheme
  positionAverageScore?: number | null
  subjectiveGroups?: { tipo: string; averageScore: number }[]
  marketValueHistory?: MarketValueHistoryEntry[]
  metricPercentiles?: Record<string, number>
  radarData?: { metric: string; value: number; average: number }[]
}

// ─── COLORS ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number]

interface ColorPalette {
  bg: RGB
  card: RGB
  cardLight: RGB
  brand: RGB
  text: RGB
  textSecondary: RGB
  gray: RGB
  grayDark: RGB
  red: RGB
  orange: RGB
  yellow: RGB
  border: RGB
}

const DARK_COLORS: ColorPalette = {
  bg: [17, 17, 17],
  card: [28, 28, 30],
  cardLight: [44, 44, 46],
  brand: [34, 197, 94],
  text: [255, 255, 255],
  textSecondary: [200, 200, 200],
  gray: [156, 163, 175],
  grayDark: [107, 114, 128],
  red: [239, 68, 68],
  orange: [249, 115, 22],
  yellow: [234, 179, 8],
  border: [55, 55, 60],
}

const LIGHT_COLORS: ColorPalette = {
  bg: [255, 255, 255],
  card: [248, 250, 252],
  cardLight: [241, 245, 249],
  brand: [34, 197, 94],
  text: [15, 23, 42],
  textSecondary: [51, 65, 85],
  gray: [100, 116, 139],
  grayDark: [71, 85, 105],
  red: [220, 38, 38],
  orange: [234, 88, 12],
  yellow: [202, 138, 4],
  border: [226, 232, 240],
}

// Legacy alias for backwards compatibility
const C = DARK_COLORS

function scoreColor(s: number, colors: ColorPalette): RGB {
  if (s >= 70) return colors.brand
  if (s >= 50) return colors.yellow
  if (s >= 30) return colors.orange
  return colors.red
}

function scoreLabel(s: number): string {
  if (s >= 70) return 'EXCELENTE'
  if (s >= 50) return 'BUENO'
  if (s >= 30) return 'REGULAR'
  return 'BAJO'
}

function footLabel(f?: string): string {
  if (!f) return '—'
  const l = f.toLowerCase()
  if (l === 'derecho' || l === 'right') return 'Diestro'
  if (l === 'izquierdo' || l === 'left') return 'Zurdo'
  if (l === 'ambos' || l === 'both') return 'Ambos'
  return f
}

function posLabel(p?: string): string {
  if (!p) return '—'
  if (DISPLAY_POSITION_MAP[p]) return DISPLAY_POSITION_MAP[p]
  for (const sep of [',', '/']) {
    if (p.includes(sep)) {
      for (const part of p.split(sep).map(s => s.trim())) {
        if (DISPLAY_POSITION_MAP[part]) return DISPLAY_POSITION_MAP[part]
      }
    }
  }
  return p
}

// ─── CAPTURE HELPER ───────────────────────────────────────────────────────────

async function captureElement(id: string, scale = 2, theme: PDFTheme = 'dark'): Promise<HTMLCanvasElement | null> {
  const el = document.getElementById(id)
  if (!el) {
    console.warn(`[PDF] Element #${id} not found`)
    return null
  }

  // Ensure element is visible
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    console.warn(`[PDF] Element #${id} has no dimensions`)
    return null
  }

  const bgColor = theme === 'light' ? '#ffffff' : '#111111'

  try {
    const canvas = await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: bgColor,
      onclone: (doc) => {
        if (theme === 'dark') {
          doc.documentElement.classList.add('dark')
          // Force dark styles
          const style = doc.createElement('style')
          style.textContent = `
            * { color-scheme: dark !important; }
            .dark\\:bg-apple-gray-800 { background-color: #1c1c1e !important; }
            .dark\\:bg-apple-gray-900 { background-color: #111111 !important; }
            .dark\\:text-white { color: #ffffff !important; }
          `
          doc.head.appendChild(style)
        } else {
          doc.documentElement.classList.remove('dark')
          // Force light styles
          const style = doc.createElement('style')
          style.textContent = `
            * { color-scheme: light !important; }
            .bg-apple-gray-800, .dark\\:bg-apple-gray-800 { background-color: #f8fafc !important; }
            .bg-apple-gray-900, .dark\\:bg-apple-gray-900 { background-color: #ffffff !important; }
            .dark\\:text-white { color: #0f172a !important; }
            .text-white { color: #0f172a !important; }
            .dark\\:text-apple-gray-400 { color: #64748b !important; }
            .recharts-text { fill: #0f172a !important; }
            .recharts-cartesian-grid-horizontal line,
            .recharts-cartesian-grid-vertical line { stroke: #e2e8f0 !important; }
          `
          doc.head.appendChild(style)
        }
      },
    })
    console.log(`[PDF] Captured #${id}: ${canvas.width}x${canvas.height}`)
    return canvas
  } catch (e) {
    console.error(`[PDF] Capture error for #${id}:`, e)
    return null
  }
}

// Map tab names to content IDs
const TAB_CONTENT_IDS: Record<string, string> = {
  'General': 'tab-content-general',
  'Radar': 'tab-content-radar',
  'Valor': 'tab-content-valor',
  'Evolución': 'tab-content-evolution',
  'Métricas': 'tab-content-metrics',
}

// Helper to click tab and wait for content to render
async function switchToTab(tabName: string): Promise<string | null> {
  const tab = document.querySelector(`[data-tab="${tabName}"]`) as HTMLElement
  if (!tab) {
    console.warn(`[PDF] Tab "${tabName}" not found`)
    return null
  }

  // Dispatch proper click event
  tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))

  // Wait for React to re-render and charts to animate
  await new Promise(r => setTimeout(r, 1000))

  const contentId = TAB_CONTENT_IDS[tabName]
  console.log(`[PDF] Switched to ${tabName}, looking for #${contentId}`)

  return contentId
}

// ─── LOGO LOADING ─────────────────────────────────────────────────────────────

async function loadLogo(theme: PDFTheme): Promise<string | null> {
  const logoPath = theme === 'light' ? '/brand/logo-black.png' : '/brand/logo-white.png'
  try {
    const response = await fetch(logoPath)
    if (!response.ok) return null
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    console.warn('[PDF] Could not load logo')
    return null
  }
}

// ─── PDF CLASS ────────────────────────────────────────────────────────────────

class PDF {
  doc: jsPDF
  W: number
  H: number
  M: number
  y: number
  colors: ColorPalette
  theme: PDFTheme
  logoBase64: string | null = null

  constructor(theme: PDFTheme = 'dark') {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    this.W = this.doc.internal.pageSize.getWidth()
    this.H = this.doc.internal.pageSize.getHeight()
    this.M = 12
    this.y = 0
    this.theme = theme
    this.colors = theme === 'light' ? LIGHT_COLORS : DARK_COLORS
    this.fillBg()
  }

  async loadLogo() {
    this.logoBase64 = await loadLogo(this.theme)
  }

  fillBg() {
    this.doc.setFillColor(...this.colors.bg)
    this.doc.rect(0, 0, this.W, this.H, 'F')
  }

  newPage() {
    this.doc.addPage()
    this.fillBg()
    this.y = 0
  }

  needsNewPage(h: number): boolean {
    return this.y + h > this.H - 15
  }

  header(name: string) {
    const C = this.colors

    // Green top bar
    this.doc.setFillColor(...C.brand)
    this.doc.rect(0, 0, this.W, 3, 'F')

    // Logo or text branding
    const headerY = 12
    if (this.logoBase64) {
      try {
        this.doc.addImage(this.logoBase64, 'PNG', this.M, 6, 28, 8)
      } catch {
        this.doc.setFontSize(8)
        this.doc.setTextColor(...C.grayDark)
        this.doc.text('Doble G Sports Group', this.M, headerY)
      }
    } else {
      this.doc.setFontSize(8)
      this.doc.setTextColor(...C.grayDark)
      this.doc.text('Doble G Sports Group', this.M, headerY)
    }

    // Player name centered
    this.doc.setFontSize(8)
    this.doc.setTextColor(...C.text)
    this.doc.text(name, this.W / 2, headerY, { align: 'center' })

    // Date
    this.doc.setTextColor(...C.grayDark)
    this.doc.text(new Date().toLocaleDateString('es-AR'), this.W - this.M, headerY, { align: 'right' })

    // Separator line
    this.doc.setDrawColor(...C.border)
    this.doc.setLineWidth(0.2)
    this.doc.line(this.M, 16, this.W - this.M, 16)

    this.y = 22
  }

  footer(cur: number, total: number) {
    const C = this.colors
    this.doc.setFontSize(7)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text(`${cur} / ${total}`, this.W / 2, this.H - 5, { align: 'center' })

    // Brand footer
    this.doc.setFontSize(6)
    this.doc.text('Doble G Sports Group', this.M, this.H - 5)
  }

  card(x: number, y: number, w: number, h: number) {
    const C = this.colors
    this.doc.setFillColor(...C.card)
    this.doc.roundedRect(x, y, w, h, 3, 3, 'F')
    // Subtle border for light mode
    if (this.theme === 'light') {
      this.doc.setDrawColor(...C.border)
      this.doc.setLineWidth(0.3)
      this.doc.roundedRect(x, y, w, h, 3, 3, 'S')
    }
  }

  sectionTitle(t: string) {
    const C = this.colors
    if (this.needsNewPage(15)) {
      this.newPage()
    }
    this.doc.setFillColor(...C.brand)
    this.doc.rect(this.M, this.y, 3, 7, 'F')
    this.doc.setFontSize(12)
    this.doc.setTextColor(...C.text)
    this.doc.text(t, this.M + 6, this.y + 5)
    this.y += 12
  }

  // Player info card
  playerInfo(p: EnrichedPlayer) {
    const C = this.colors
    const h = 38
    this.card(this.M, this.y, this.W - this.M * 2, h)

    const x = this.M + 6

    // Name
    this.doc.setFontSize(16)
    this.doc.setTextColor(...C.text)
    this.doc.text(p.Jugador, x, this.y + 10)

    // Team · Position
    this.doc.setFontSize(9)
    this.doc.setTextColor(...C.gray)
    this.doc.text(`${p.Equipo || '—'}  ·  ${posLabel(p['Posición específica'] || p['Posición'])}  ·  ${p.Liga || ''}`, x, this.y + 17)

    // Stats row
    const stats = [
      { l: 'Edad', v: String(p.Edad || '—') },
      { l: 'Altura', v: p.Altura ? `${p.Altura}cm` : '—' },
      { l: 'Pie', v: footLabel(p.Pie) },
      { l: 'Partidos', v: String(p['Partidos jugados'] || '—') },
      { l: 'Minutos', v: p.minutesPlayed?.toLocaleString() || '—' },
    ]
    const sw = (this.W - this.M * 2 - 12) / stats.length
    stats.forEach((s, i) => {
      const cx = this.M + 6 + i * sw + sw / 2
      this.doc.setFontSize(7)
      this.doc.setTextColor(...C.grayDark)
      this.doc.text(s.l, cx, this.y + 26, { align: 'center' })
      this.doc.setFontSize(9)
      this.doc.setTextColor(...C.text)
      this.doc.text(s.v, cx, this.y + 33, { align: 'center' })
    })

    this.y += h + 6
  }

  // Score gauge
  scoreGauge(score: number | null, avg?: number | null) {
    const C = this.colors
    const h = 52
    this.card(this.M, this.y, this.W - this.M * 2, h)

    const cx = this.W / 2
    const gaugeY = this.y + 26
    const r = 18

    // Title
    this.doc.setFontSize(8)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text('SCORE GG', cx, this.y + 9, { align: 'center' })

    if (score === null) {
      this.doc.setFontSize(10)
      this.doc.setTextColor(...C.gray)
      this.doc.text('Sin datos', cx, gaugeY, { align: 'center' })
      this.y += h + 6
      return
    }

    // Arc segments
    const start = Math.PI
    const segs = [
      { s: 0, e: 0.3, c: C.red },
      { s: 0.3, e: 0.5, c: C.orange },
      { s: 0.5, e: 0.7, c: C.yellow },
      { s: 0.7, e: 1, c: C.brand },
    ]
    this.doc.setLineWidth(4)
    segs.forEach(seg => {
      this.doc.setDrawColor(...seg.c)
      const a1 = start + seg.s * Math.PI
      const a2 = start + seg.e * Math.PI
      for (let i = 0; i < 12; i++) {
        const t1 = a1 + (i / 12) * (a2 - a1)
        const t2 = a1 + ((i + 1) / 12) * (a2 - a1)
        this.doc.line(
          cx + Math.cos(t1) * r, gaugeY + Math.sin(t1) * r,
          cx + Math.cos(t2) * r, gaugeY + Math.sin(t2) * r
        )
      }
    })

    // Needle
    const angle = start + (score / 100) * Math.PI
    const needleColor = this.theme === 'light' ? C.text : [255, 255, 255] as RGB
    this.doc.setDrawColor(...needleColor)
    this.doc.setLineWidth(1.2)
    this.doc.line(cx, gaugeY, cx + Math.cos(angle) * r * 0.65, gaugeY + Math.sin(angle) * r * 0.65)
    this.doc.setFillColor(...needleColor)
    this.doc.circle(cx, gaugeY, 1.5, 'F')

    // Score value
    const col = scoreColor(score, C)
    this.doc.setFontSize(16)
    this.doc.setTextColor(...col)
    this.doc.text(score.toFixed(1), cx, gaugeY + r + 6, { align: 'center' })

    // Label
    this.doc.setFontSize(7)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text(scoreLabel(score), cx, gaugeY + r + 11, { align: 'center' })

    // Comparison
    if (avg !== null && avg !== undefined) {
      this.doc.setFontSize(7)
      this.doc.text(`Promedio: ${avg.toFixed(1)}`, cx, this.y + h - 3, { align: 'center' })
    }

    this.y += h + 6
  }

  // Scout eval circles
  scoutEval(groups: { tipo: string; averageScore: number }[]) {
    const C = this.colors
    if (!groups || groups.length === 0) return

    const h = 32
    this.card(this.M, this.y, this.W - this.M * 2, h)

    this.doc.setFontSize(7)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text('EVALUACIÓN SCOUT', this.M + 6, this.y + 7)

    const circleY = this.y + 20
    const spacing = (this.W - this.M * 2) / (groups.length + 1)

    groups.forEach((g, i) => {
      const cx = this.M + spacing * (i + 1)
      const radius = 7
      const col = scoreColor(g.averageScore, C)

      // Background
      this.doc.setDrawColor(...C.cardLight)
      this.doc.setLineWidth(2)
      this.doc.circle(cx, circleY, radius, 'S')

      // Progress
      const prog = g.averageScore / 100
      this.doc.setDrawColor(...col)
      const startA = -Math.PI / 2
      for (let j = 0; j < 16 * prog; j++) {
        const a1 = startA + (j / 16) * 2 * Math.PI
        const a2 = startA + ((j + 1) / 16) * 2 * Math.PI
        this.doc.line(
          cx + Math.cos(a1) * radius, circleY + Math.sin(a1) * radius,
          cx + Math.cos(a2) * radius, circleY + Math.sin(a2) * radius
        )
      }

      // Score
      this.doc.setFontSize(7)
      this.doc.setTextColor(...col)
      this.doc.text(String(Math.round(g.averageScore)), cx, circleY + 2, { align: 'center' })

      // Label
      this.doc.setFontSize(6)
      this.doc.setTextColor(...C.grayDark)
      this.doc.text(g.tipo.charAt(0).toUpperCase() + g.tipo.slice(1), cx, circleY + radius + 5, { align: 'center' })
    })

    this.y += h + 6
  }

  // Contract info
  contractInfo(p: EnrichedPlayer) {
    const C = this.colors
    const h = 24
    this.card(this.M, this.y, this.W - this.M * 2, h)

    const mid = this.W / 2

    // Value
    this.doc.setFontSize(7)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text('VALOR DE MERCADO', this.M + 6, this.y + 8)
    this.doc.setFontSize(12)
    this.doc.setTextColor(...C.brand)
    this.doc.text(p.marketValueFormatted || '—', this.M + 6, this.y + 17)

    // Contract
    this.doc.setFontSize(7)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text('VENCIMIENTO CONTRATO', mid + 6, this.y + 8)
    const cc = p.contractStatus === 'critical' ? C.orange : p.contractStatus === 'warning' ? C.yellow : C.text
    this.doc.setFontSize(12)
    this.doc.setTextColor(...cc)
    let ct = p['Vencimiento contrato'] || '—'
    if (p.monthsRemaining !== null) ct += ` (${p.monthsRemaining}m)`
    this.doc.text(ct, mid + 6, this.y + 17)

    this.y += h + 6
  }

  // Add captured image
  addImage(canvas: HTMLCanvasElement, maxH?: number) {
    const maxW = this.W - this.M * 2
    const mH = maxH ?? (this.H - this.y - 15)
    const ratio = canvas.width / canvas.height

    let w = maxW
    let h = w / ratio

    if (h > mH) {
      h = mH
      w = h * ratio
    }

    const x = this.M + (maxW - w) / 2
    this.doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, this.y, w, h)
    this.y += h + 5
  }

  // Metrics table
  metricsTable(p: EnrichedPlayer, posKey: string, percs: Record<string, number>) {
    const C = this.colors
    const mets = DISPLAY_METRICS[posKey] ?? DISPLAY_METRICS['_default']
    const colW = (this.W - this.M * 2 - 6) / 2
    let startY = this.y

    for (let i = 0; i < mets.length; i++) {
      const row = Math.floor(i / 2)
      const col = i % 2
      const rowY = startY + row * 8

      if (rowY > this.H - 15) {
        this.newPage()
        this.header(p.Jugador)
        startY = this.y
      }

      const m = mets[i]
      const x = this.M + col * (colW + 6)
      const v = p[m]
      const num = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
      const disp = isNaN(num) ? '—' : num.toFixed(m.includes('jugados') ? 0 : 2)
      const pct = percs[m]

      // Label
      this.doc.setFontSize(7)
      this.doc.setTextColor(...C.grayDark)
      const lbl = m.length > 22 ? m.slice(0, 21) + '..' : m
      this.doc.text(lbl, x, rowY)

      // Value
      this.doc.setFontSize(8)
      this.doc.setTextColor(...C.text)
      this.doc.text(disp, x + 50, rowY)

      // Percentile
      if (pct !== undefined) {
        const bx = x + 60
        const bw = colW - 70
        this.doc.setFillColor(...C.cardLight)
        this.doc.roundedRect(bx, rowY - 2.5, bw, 2.5, 0.8, 0.8, 'F')
        this.doc.setFillColor(...scoreColor(pct, C))
        this.doc.roundedRect(bx, rowY - 2.5, bw * (pct / 100), 2.5, 0.8, 0.8, 'F')
        this.doc.setFontSize(6)
        this.doc.setTextColor(...scoreColor(pct, C))
        this.doc.text(`P${Math.round(pct)}`, bx + bw + 3, rowY)
      }
    }

    this.y = startY + Math.ceil(mets.length / 2) * 8 + 6
  }

  save(name: string) {
    const total = this.doc.internal.pages.length - 1
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i)
      this.footer(i, total)
    }
    this.doc.save(name)
  }
}

// ─── MAIN EXPORT FUNCTION ─────────────────────────────────────────────────────

export async function exportPlayerToPdfFull(data: FullExportData): Promise<void> {
  const { player, source, sections, theme = 'light', positionAverageScore, subjectiveGroups, marketValueHistory, metricPercentiles } = data

  const pdf = new PDF(theme)
  await pdf.loadLogo()

  const rawPos = player['Posición específica']?.trim() || player['Posición']?.trim() || ''
  const posKey = POSITION_MAP[rawPos] || ''

  // Store original tab to restore later
  const originalTab = document.querySelector('[data-tab].bg-white, [data-tab].dark\\:bg-apple-gray-700')?.getAttribute('data-tab') || 'General'

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1: Overview
  // ═══════════════════════════════════════════════════════════════════════════
  pdf.header(player.Jugador)

  if (sections.includes('header') || sections.includes('general')) {
    pdf.playerInfo(player)
    pdf.scoreGauge(player.ggScore, positionAverageScore)

    if (subjectiveGroups && subjectiveGroups.length > 0 && sections.includes('scout')) {
      pdf.scoutEval(subjectiveGroups)
    }

    pdf.contractInfo(player)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2: Radar (captured from DOM)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sections.includes('radar')) {
    console.log('[PDF] Switching to Radar tab...')
    const radarContentId = await switchToTab('Radar')
    if (radarContentId) {
      // Try specific ID first, then fallback to main content
      let radarCanvas = await captureElement(radarContentId, 2.5, theme)
      if (!radarCanvas) {
        console.log('[PDF] Trying player-tab-content fallback...')
        radarCanvas = await captureElement('player-tab-content', 2.5, theme)
      }
      if (radarCanvas) {
        pdf.newPage()
        pdf.header(player.Jugador)
        pdf.sectionTitle('Análisis Radar')
        pdf.addImage(radarCanvas, 180)
      } else {
        console.warn('[PDF] Failed to capture radar')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3: Market Value (captured from DOM)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sections.includes('valor') && source === 'interno') {
    console.log('[PDF] Switching to Valor tab...')
    const valorContentId = await switchToTab('Valor')
    if (valorContentId) {
      let valorCanvas = await captureElement(valorContentId, 2.5, theme)
      if (!valorCanvas) {
        valorCanvas = await captureElement('player-tab-content', 2.5, theme)
      }
      if (valorCanvas) {
        pdf.newPage()
        pdf.header(player.Jugador)
        pdf.sectionTitle('Valor de Mercado')
        pdf.addImage(valorCanvas, 180)
      } else {
        console.warn('[PDF] Failed to capture valor')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4: Evolution (captured from DOM)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sections.includes('evolution') && source === 'interno') {
    console.log('[PDF] Switching to Evolución tab...')
    const evoContentId = await switchToTab('Evolución')
    if (evoContentId) {
      let evoCanvas = await captureElement(evoContentId, 2.5, theme)
      if (!evoCanvas) {
        evoCanvas = await captureElement('player-tab-content', 2.5, theme)
      }
      if (evoCanvas) {
        pdf.newPage()
        pdf.header(player.Jugador)
        pdf.sectionTitle('Evolución por Partido')
        pdf.addImage(evoCanvas, 220)
      } else {
        console.warn('[PDF] Failed to capture evolution')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5: Metrics
  // ═══════════════════════════════════════════════════════════════════════════
  if (sections.includes('metrics')) {
    pdf.newPage()
    pdf.header(player.Jugador)
    pdf.sectionTitle('Métricas Detalladas')
    pdf.metricsTable(player, posKey, metricPercentiles || {})
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Restore original tab and save
  // ═══════════════════════════════════════════════════════════════════════════
  if (originalTab) {
    const tab = document.querySelector(`[data-tab="${originalTab}"]`) as HTMLElement
    if (tab) tab.click()
  }

  const safeName = player.Jugador.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]/g, '').replace(/\s+/g, '_')
  const themeSuffix = theme === 'dark' ? '_dark' : ''
  pdf.save(`${safeName}_Scout_Report${themeSuffix}.pdf`)

  console.log('[PDF] Export complete!')
}

// Legacy exports
export async function exportPlayerToPdfAdvanced(config: PlayerExportConfig): Promise<void> {
  console.log('Use exportPlayerToPdfFull', config)
}
export async function exportTableToPdf(title: string): Promise<void> {
  console.log('Table export:', title)
}
