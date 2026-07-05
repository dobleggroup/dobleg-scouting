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

  const bg = opts.isDark ? '#0f0f11' : '#ffffff'
  const sections = Array.from(opts.rootEl.querySelectorAll<HTMLElement>('[data-informe-section]'))
  const targets = sections.length ? sections : [opts.rootEl]

  const pdf: JsPdfType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const usableW = pageW - margin * 2
  const headerH = opts.logoDataUrl ? 40 : 0
  let cursorY = margin + headerH

  function addHeader() {
    pdf.setFillColor(bg)
    pdf.rect(0, 0, pageW, pageH, 'F')
    if (opts.logoDataUrl) pdf.addImage(opts.logoDataUrl, 'PNG', margin, margin, 80, 24)
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
