import type { jsPDF as JsPdfType } from 'jspdf'

/**
 * Exporta un Informe a PDF de alta fidelidad, capturando cada sección
 * (`[data-informe-section]`) por separado con `html-to-image` y paginando
 * en jsPDF sin partir ningún bloque entre páginas.
 */
export async function exportInformePDF(opts: {
  rootEl: HTMLElement
  nombre: string
  isDark: boolean
  logoDataUrl?: string
}): Promise<void> {
  const { toPng } = await import('html-to-image')
  const { jsPDF } = await import('jspdf')

  const bg = opts.isDark ? '#0F1114' : '#ffffff'
  const sections = Array.from(opts.rootEl.querySelectorAll<HTMLElement>('[data-informe-section]'))
  const targets = sections.length ? sections : [opts.rootEl]

  const pdf: JsPdfType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const usableW = pageW - margin * 2

  // Calcular las dimensiones reales del logo una sola vez (respeta el aspect ratio).
  let logoW = 0
  let logoH = 0
  if (opts.logoDataUrl) {
    try {
      const props = pdf.getImageProperties(opts.logoDataUrl)
      if (props.width > 0 && props.height > 0) {
        logoH = 22
        logoW = logoH * (props.width / props.height)
      }
    } catch {
      logoW = 0
      logoH = 0
    }
  }
  const headerH = logoH > 0 ? logoH + 14 : 0
  let cursorY = margin + headerH

  function addHeader() {
    pdf.setFillColor(bg)
    pdf.rect(0, 0, pageW, pageH, 'F')
    if (opts.logoDataUrl && logoW > 0 && logoH > 0) {
      pdf.addImage(opts.logoDataUrl, 'PNG', margin, margin, logoW, logoH)
    }
  }
  addHeader()

  for (const el of targets) {
    const dataUrl = await toPng(el, {
      pixelRatio: 3,
      backgroundColor: bg,
      skipFonts: true,
      filter: (n) =>
        !(
          n instanceof HTMLImageElement &&
          (n.getAttribute('src') || '').startsWith('http') &&
          !(n.getAttribute('src') || '').startsWith(window.location.origin)
        ),
    })
    const imgW = usableW
    const imgH = (el.offsetHeight / el.offsetWidth) * imgW
    if (cursorY + imgH > pageH - margin && cursorY > margin + headerH) {
      pdf.addPage()
      addHeader()
      cursorY = margin + headerH
    }
    pdf.addImage(dataUrl, 'PNG', margin, cursorY, imgW, imgH)
    cursorY += imgH + 16
  }

  pdf.save(`Informe_${opts.nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}.pdf`)
}
