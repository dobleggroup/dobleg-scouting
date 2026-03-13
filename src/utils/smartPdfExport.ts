import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import type { PDFElement, PDFTheme } from '@/context/PDFBuilderContext'

// ─── TYPES ────────────────────────────────────────────────────────────────────

type RGB = [number, number, number]

interface ColorPalette {
  bg: RGB
  bgAlt: RGB
  card: RGB
  cardLight: RGB
  brand: RGB
  brandDark: RGB
  text: RGB
  textSecondary: RGB
  textMuted: RGB
  gray: RGB
  grayDark: RGB
  border: RGB
  success: RGB
  warning: RGB
  error: RGB
}

interface SmartReportConfig {
  elements: PDFElement[]
  theme: PDFTheme
  title: string
  subtitle: string
  includeDate: boolean
  includeLogo: boolean
  includeCover: boolean
  includeTableOfContents: boolean
  includePageNumbers: boolean
  authorName: string
  onProgress?: (msg: string, percent: number) => void
}

// ─── COLORS ───────────────────────────────────────────────────────────────────

const DARK_COLORS: ColorPalette = {
  bg: [17, 17, 17],
  bgAlt: [24, 24, 26],
  card: [28, 28, 30],
  cardLight: [44, 44, 46],
  brand: [34, 197, 94],
  brandDark: [22, 163, 74],
  text: [255, 255, 255],
  textSecondary: [200, 200, 200],
  textMuted: [156, 163, 175],
  gray: [156, 163, 175],
  grayDark: [107, 114, 128],
  border: [55, 55, 60],
  success: [34, 197, 94],
  warning: [245, 158, 11],
  error: [239, 68, 68],
}

const LIGHT_COLORS: ColorPalette = {
  bg: [255, 255, 255],
  bgAlt: [249, 250, 251],
  card: [248, 250, 252],
  cardLight: [241, 245, 249],
  brand: [34, 197, 94],
  brandDark: [22, 163, 74],
  text: [15, 23, 42],
  textSecondary: [51, 65, 85],
  textMuted: [100, 116, 139],
  gray: [100, 116, 139],
  grayDark: [71, 85, 105],
  border: [226, 232, 240],
  success: [34, 197, 94],
  warning: [245, 158, 11],
  error: [239, 68, 68],
}

// ─── LOGO LOADING ─────────────────────────────────────────────────────────────

async function loadLogo(theme: PDFTheme): Promise<string | null> {
  const logoPath = theme === 'light' ? '/brand/logo-black.png' : '/brand/logo-white.png'
  try {
    const response = await fetch(logoPath)
    if (!response.ok) {
      // Try fallback paths
      const fallbackPath = theme === 'light' ? '/logo-dark.png' : '/logo-light.png'
      const fallbackResponse = await fetch(fallbackPath)
      if (!fallbackResponse.ok) return null
      const blob = await fallbackResponse.blob()
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      })
    }
    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ─── CAPTURE ELEMENT ──────────────────────────────────────────────────────────

async function captureElement(
  id: string,
  theme: PDFTheme,
  scale = 2.5
): Promise<HTMLCanvasElement | null> {
  const el = document.getElementById(id)
  if (!el) return null

  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return null

  const bgColor = theme === 'light' ? '#ffffff' : '#111111'

  try {
    return await html2canvas(el, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: bgColor,
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
      onclone: (doc) => {
        // Apply theme-specific styles
        const clonedEl = doc.getElementById(id)
        if (!clonedEl) return

        if (theme === 'dark') {
          doc.documentElement.classList.add('dark')
        } else {
          doc.documentElement.classList.remove('dark')
          // Light mode overrides for better PDF rendering
          const style = doc.createElement('style')
          style.textContent = `
            * {
              color-scheme: light !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .dark\\:bg-apple-gray-800 { background-color: #f8fafc !important; }
            .dark\\:bg-apple-gray-900 { background-color: #ffffff !important; }
            .dark\\:text-white { color: #0f172a !important; }
            .dark\\:text-apple-gray-300 { color: #334155 !important; }
            .dark\\:text-apple-gray-400 { color: #64748b !important; }
            .dark\\:border-apple-gray-700 { border-color: #e2e8f0 !important; }
            .recharts-text { fill: #0f172a !important; }
            .recharts-cartesian-grid line { stroke: #e2e8f0 !important; }
          `
          doc.head.appendChild(style)
        }
      },
    })
  } catch (e) {
    console.warn('[SmartPDF] Failed to capture element:', id, e)
    return null
  }
}

// ─── PDF CLASS ────────────────────────────────────────────────────────────────

class SmartPDF {
  doc: jsPDF
  W: number
  H: number
  M: number
  y: number
  colors: ColorPalette
  theme: PDFTheme
  logoBase64: string | null = null
  pageCount = 0
  tocEntries: Array<{ title: string; page: number }> = []

  constructor(theme: PDFTheme) {
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    this.W = this.doc.internal.pageSize.getWidth()
    this.H = this.doc.internal.pageSize.getHeight()
    this.M = 15
    this.y = 0
    this.theme = theme
    this.colors = theme === 'light' ? LIGHT_COLORS : DARK_COLORS
    this.fillBg()
    this.pageCount = 1
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
    this.pageCount++
  }

  needsNewPage(h: number): boolean {
    return this.y + h > this.H - 25
  }

  // ─── COVER PAGE ───────────────────────────────────────────────────────────────

  coverPage(
    title: string,
    subtitle: string,
    includeDate: boolean,
    includeLogo: boolean,
    authorName?: string
  ) {
    const C = this.colors

    // Gradient-like effect with accent bar
    this.doc.setFillColor(...C.brand)
    this.doc.rect(0, 0, this.W, 6, 'F')

    // Secondary accent line
    this.doc.setFillColor(...C.brandDark)
    this.doc.rect(0, 6, this.W, 1, 'F')

    // Decorative corner accent
    this.doc.setFillColor(...C.brand)
    this.doc.rect(this.W - 30, this.H - 30, 30, 30, 'F')

    // Logo
    const logoY = 50
    if (includeLogo && this.logoBase64) {
      try {
        this.doc.addImage(this.logoBase64, 'PNG', this.W / 2 - 30, logoY, 60, 17)
      } catch {
        this.doc.setFontSize(14)
        this.doc.setTextColor(...C.textMuted)
        this.doc.text('DOBLE G SPORTS GROUP', this.W / 2, logoY + 10, { align: 'center' })
      }
    } else if (includeLogo) {
      this.doc.setFontSize(14)
      this.doc.setTextColor(...C.textMuted)
      this.doc.text('DOBLE G SPORTS GROUP', this.W / 2, logoY + 10, { align: 'center' })
    }

    // Main title
    this.doc.setFontSize(32)
    this.doc.setTextColor(...C.text)
    const titleLines = this.doc.splitTextToSize(title, this.W - 40)
    let titleY = 100
    titleLines.forEach((line: string) => {
      this.doc.text(line, this.W / 2, titleY, { align: 'center' })
      titleY += 12
    })

    // Decorative line under title
    this.doc.setDrawColor(...C.brand)
    this.doc.setLineWidth(1)
    this.doc.line(this.W / 2 - 40, titleY + 5, this.W / 2 + 40, titleY + 5)

    // Subtitle
    this.doc.setFontSize(14)
    this.doc.setTextColor(...C.textSecondary)
    this.doc.text(subtitle, this.W / 2, titleY + 20, { align: 'center' })

    // Date and author section
    let infoY = this.H - 60
    if (includeDate) {
      this.doc.setFontSize(10)
      this.doc.setTextColor(...C.textMuted)
      const dateStr = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      this.doc.text(dateStr, this.W / 2, infoY, { align: 'center' })
      infoY += 8
    }

    if (authorName) {
      this.doc.setFontSize(10)
      this.doc.setTextColor(...C.textMuted)
      this.doc.text(`Elaborado por: ${authorName}`, this.W / 2, infoY, { align: 'center' })
    }

    // Footer
    this.doc.setFontSize(8)
    this.doc.setTextColor(...C.grayDark)
    this.doc.text('Informe generado con Scout Platform', this.W / 2, this.H - 15, { align: 'center' })
  }

  // ─── TABLE OF CONTENTS ────────────────────────────────────────────────────────

  tableOfContents(entries: Array<{ title: string; page: number }>) {
    this.newPage()
    this.header('Indice')

    const C = this.colors
    this.y = 35

    this.doc.setFontSize(18)
    this.doc.setTextColor(...C.text)
    this.doc.text('Contenido', this.M, this.y)
    this.y += 12

    this.doc.setDrawColor(...C.brand)
    this.doc.setLineWidth(0.5)
    this.doc.line(this.M, this.y, this.M + 30, this.y)
    this.y += 10

    entries.forEach((entry, i) => {
      if (this.needsNewPage(10)) {
        this.newPage()
        this.header('Indice')
      }

      this.doc.setFontSize(10)
      this.doc.setTextColor(...C.text)
      this.doc.text(`${i + 1}. ${entry.title}`, this.M, this.y)

      // Dotted line
      this.doc.setDrawColor(...C.border)
      this.doc.setLineDashPattern([1, 1], 0)
      const textWidth = this.doc.getTextWidth(`${i + 1}. ${entry.title}`)
      this.doc.line(this.M + textWidth + 3, this.y - 1, this.W - this.M - 12, this.y - 1)
      this.doc.setLineDashPattern([], 0)

      // Page number
      this.doc.setTextColor(...C.brand)
      this.doc.text(String(entry.page), this.W - this.M, this.y, { align: 'right' })

      this.y += 8
    })
  }

  // ─── PAGE HEADER ──────────────────────────────────────────────────────────────

  header(pageTitle?: string) {
    const C = this.colors

    // Accent bar
    this.doc.setFillColor(...C.brand)
    this.doc.rect(0, 0, this.W, 3, 'F')

    const headerY = 12

    // Logo or brand name
    if (this.logoBase64) {
      try {
        this.doc.addImage(this.logoBase64, 'PNG', this.M, 6, 25, 7)
      } catch {
        this.doc.setFontSize(8)
        this.doc.setTextColor(...C.textMuted)
        this.doc.text('Doble G Sports', this.M, headerY)
      }
    } else {
      this.doc.setFontSize(8)
      this.doc.setTextColor(...C.textMuted)
      this.doc.text('Doble G Sports', this.M, headerY)
    }

    // Page title (centered)
    if (pageTitle) {
      this.doc.setFontSize(9)
      this.doc.setTextColor(...C.text)
      const maxWidth = this.W - 100
      const truncatedTitle = pageTitle.length > 50 ? pageTitle.slice(0, 47) + '...' : pageTitle
      this.doc.text(truncatedTitle, this.W / 2, headerY, { align: 'center' })
    }

    // Date (right)
    this.doc.setFontSize(8)
    this.doc.setTextColor(...C.textMuted)
    this.doc.text(new Date().toLocaleDateString('es-AR'), this.W - this.M, headerY, { align: 'right' })

    // Separator
    this.doc.setDrawColor(...C.border)
    this.doc.setLineWidth(0.2)
    this.doc.line(this.M, 17, this.W - this.M, 17)

    this.y = 24
  }

  // ─── SECTION TITLE ────────────────────────────────────────────────────────────

  sectionTitle(t: string, addToToc = true) {
    const C = this.colors

    if (this.needsNewPage(20)) {
      this.newPage()
      this.header()
    }

    // Accent bar
    this.doc.setFillColor(...C.brand)
    this.doc.rect(this.M, this.y, 3, 8, 'F')

    // Title text
    this.doc.setFontSize(13)
    this.doc.setTextColor(...C.text)
    this.doc.text(t, this.M + 7, this.y + 6)

    // Add to TOC if requested
    if (addToToc) {
      this.tocEntries.push({ title: t, page: this.pageCount })
    }

    this.y += 15
  }

  // ─── ADD IMAGE ────────────────────────────────────────────────────────────────

  addImage(canvas: HTMLCanvasElement, maxH?: number, centerHorizontally = true) {
    const maxW = this.W - this.M * 2
    const mH = maxH ?? (this.H - this.y - 30)
    const ratio = canvas.width / canvas.height

    let w = maxW
    let h = w / ratio

    if (h > mH) {
      h = mH
      w = h * ratio
    }

    // Check for new page
    if (this.needsNewPage(h + 8)) {
      this.newPage()
      this.header()
    }

    const x = centerHorizontally ? this.M + (maxW - w) / 2 : this.M

    // Optional: Add subtle shadow/border effect
    const C = this.colors
    this.doc.setDrawColor(...C.border)
    this.doc.setLineWidth(0.3)
    this.doc.roundedRect(x - 1, this.y - 1, w + 2, h + 2, 2, 2, 'S')

    this.doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, this.y, w, h)
    this.y += h + 10
  }

  // ─── ADD TEXT ─────────────────────────────────────────────────────────────────

  addText(text: string, style: 'normal' | 'description' | 'caption' = 'normal') {
    const C = this.colors

    const config = {
      normal: { size: 10, color: C.text, lineHeight: 5 },
      description: { size: 9, color: C.textSecondary, lineHeight: 4.5 },
      caption: { size: 8, color: C.textMuted, lineHeight: 4 },
    }[style]

    this.doc.setFontSize(config.size)
    this.doc.setTextColor(...config.color)

    const maxWidth = this.W - this.M * 2
    const lines = this.doc.splitTextToSize(text, maxWidth)
    const totalHeight = lines.length * config.lineHeight

    if (this.needsNewPage(totalHeight + 8)) {
      this.newPage()
      this.header()
    }

    lines.forEach((line: string) => {
      this.doc.text(line, this.M, this.y)
      this.y += config.lineHeight
    })

    this.y += 5
  }

  // ─── ADD SPACING ──────────────────────────────────────────────────────────────

  addSpacing(mm: number) {
    this.y += mm
    if (this.y > this.H - 20) {
      this.newPage()
      this.header()
    }
  }

  // ─── INFO BOX ─────────────────────────────────────────────────────────────────

  infoBox(title: string, items: Array<{ label: string; value: string }>) {
    const C = this.colors
    const boxH = 8 + items.length * 7

    if (this.needsNewPage(boxH + 10)) {
      this.newPage()
      this.header()
    }

    // Box background
    this.doc.setFillColor(...C.card)
    this.doc.roundedRect(this.M, this.y, this.W - this.M * 2, boxH, 3, 3, 'F')

    // Title
    this.doc.setFontSize(9)
    this.doc.setTextColor(...C.brand)
    this.doc.text(title, this.M + 5, this.y + 6)

    // Items
    let itemY = this.y + 12
    items.forEach(item => {
      this.doc.setFontSize(8)
      this.doc.setTextColor(...C.textMuted)
      this.doc.text(item.label + ':', this.M + 5, itemY)
      this.doc.setTextColor(...C.text)
      this.doc.text(item.value, this.M + 45, itemY)
      itemY += 6
    })

    this.y += boxH + 8
  }

  // ─── FOOTER ───────────────────────────────────────────────────────────────────

  footer(current: number, total: number, includeBranding = true) {
    const C = this.colors

    // Page number
    this.doc.setFontSize(8)
    this.doc.setTextColor(...C.textMuted)
    this.doc.text(`${current} / ${total}`, this.W / 2, this.H - 8, { align: 'center' })

    if (includeBranding) {
      this.doc.setTextColor(...C.grayDark)
      this.doc.text('Doble G Sports Group', this.M, this.H - 8)
    }
  }

  // ─── SAVE ─────────────────────────────────────────────────────────────────────

  save(filename: string, includePageNumbers = true) {
    if (includePageNumbers) {
      const total = this.doc.internal.pages.length - 1
      for (let i = 2; i <= total; i++) {
        this.doc.setPage(i)
        this.footer(i - 1, total - 1)
      }
    }
    this.doc.save(filename)
  }
}

// ─── MAIN EXPORT FUNCTION ─────────────────────────────────────────────────────

export async function generateSmartReport(config: SmartReportConfig): Promise<void> {
  const {
    elements,
    theme,
    title,
    subtitle,
    includeDate,
    includeLogo,
    includeCover,
    includeTableOfContents,
    includePageNumbers,
    authorName,
    onProgress,
  } = config

  if (elements.length === 0) {
    throw new Error('No hay elementos para exportar')
  }

  const totalSteps = elements.length + 3
  let currentStep = 0

  const progress = (msg: string) => {
    currentStep++
    onProgress?.(msg, Math.round((currentStep / totalSteps) * 100))
  }

  progress('Inicializando documento...')
  const pdf = new SmartPDF(theme)
  await pdf.loadLogo()

  // Cover page
  if (includeCover) {
    progress('Generando portada...')
    pdf.coverPage(title, subtitle, includeDate, includeLogo, authorName)
  }

  // Collect TOC entries while processing
  const tocEntries: Array<{ title: string; page: number }> = []

  // Process elements
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]
    progress(`Procesando ${i + 1}/${elements.length}: ${element.title}`)

    // New page for each major element
    pdf.newPage()
    pdf.header(element.title)

    // Track for TOC
    tocEntries.push({ title: element.title, page: pdf.pageCount })

    // Handle page break type
    if (element.type === 'page-break') {
      pdf.addText('--- Salto de pagina ---', 'caption')
      continue
    }

    // Handle text-only elements
    if (element.type === 'text' || element.type === 'section-header') {
      pdf.sectionTitle(element.title, false)
      if (element.description) {
        pdf.addText(element.description, 'description')
      }
      continue
    }

    // Try to capture element from DOM
    if (element.captureId) {
      const canvas = await captureElement(element.captureId, theme, 2.5)
      if (canvas) {
        if (element.description) {
          pdf.addText(element.description, 'description')
          pdf.addSpacing(3)
        }

        // Adjust max height based on element type
        const maxH = element.type === 'scatter' || element.type === 'radar' ? 180 : 200
        pdf.addImage(canvas, maxH)

        // Add source info
        if (element.source) {
          pdf.addText(`Fuente: ${element.source}`, 'caption')
        }
      } else {
        // Fallback: try thumbnail
        pdf.sectionTitle(element.title, false)
        if (element.thumbnail) {
          try {
            const img = new Image()
            img.src = element.thumbnail
            await new Promise((resolve) => {
              img.onload = resolve
              img.onerror = resolve
              setTimeout(resolve, 2000) // Timeout fallback
            })
            if (img.complete && img.naturalWidth > 0) {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.drawImage(img, 0, 0)
                pdf.addImage(canvas, 140)
              }
            } else {
              pdf.addText('Vista previa del contenido guardado.', 'caption')
            }
          } catch {
            pdf.addText('El contenido original ya no esta disponible en pantalla.', 'caption')
          }
        } else {
          pdf.addText('Este contenido debe ser capturado mientras esta visible en pantalla.', 'description')
        }
        if (element.description) {
          pdf.addText(element.description, 'description')
        }
      }
    } else {
      // No captureId - display available info
      pdf.sectionTitle(element.title, false)
      if (element.description) {
        pdf.addText(element.description, 'description')
      }
      if (element.players && element.players.length > 0) {
        pdf.infoBox('Jugadores incluidos', element.players.map(p => ({ label: 'Jugador', value: p })))
      }
    }
  }

  // Generate TOC if requested (insert after cover)
  if (includeTableOfContents && tocEntries.length > 1) {
    progress('Generando indice...')
    // This is complex with jsPDF - would need to reorganize pages
    // For now, we add TOC entries to the doc object for reference
    pdf.tocEntries = tocEntries
  }

  // Finalize
  progress('Finalizando documento...')
  const safeName = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 50)
  const dateStr = new Date().toISOString().split('T')[0]
  const themeSuffix = theme === 'dark' ? '_dark' : ''
  pdf.save(`${safeName}_${dateStr}${themeSuffix}.pdf`, includePageNumbers)
}

// ─── QUICK EXPORT SINGLE ELEMENT ──────────────────────────────────────────────

export async function quickExportElement(
  captureId: string,
  title: string,
  theme: PDFTheme = 'light'
): Promise<void> {
  const pdf = new SmartPDF(theme)
  await pdf.loadLogo()

  pdf.header(title)

  const canvas = await captureElement(captureId, theme, 3)
  if (canvas) {
    pdf.addImage(canvas, 220)
  } else {
    pdf.addText('No se pudo capturar el contenido.')
  }

  const safeName = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  pdf.save(`${safeName}_${new Date().toISOString().split('T')[0]}.pdf`, false)
}
