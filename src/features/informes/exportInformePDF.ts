import type { jsPDF as JsPdfType } from 'jspdf'

/**
 * Exporta un Informe a PDF. Captura cada sección (`[data-informe-section]`) por
 * separado con `html2canvas` — la misma librería probada del resto de la app —
 * y las pagina colocando cada bloque ENTERO, pasando a una hoja nueva cuando no
 * entra en lo que queda. Un bloque más alto que una hoja se rebana (única forma
 * de no perder contenido). Capturar por sección evita mapear coordenadas
 * DOM→canvas (que recortaba arriba/abajo) y evita el bug de html-to-image que
 * dejaba tablas en blanco.
 */
export async function exportInformePDF(opts: {
  rootEl: HTMLElement
  nombre: string
  isDark: boolean
  logoDataUrl?: string
}): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const { jsPDF } = await import('jspdf')

  const bg = opts.isDark ? '#0F1114' : '#ffffff'
  const sections = Array.from(opts.rootEl.querySelectorAll<HTMLElement>('[data-informe-section]'))
  const targets = sections.length ? sections : [opts.rootEl]

  const pdf: JsPdfType = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const usableW = pageW - margin * 2
  const GAP = 14

  // Dimensiones reales del logo (respeta aspect ratio), estampado en cada página.
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
  const contentTop = margin + headerH
  const availPt = pageH - contentTop - margin

  let cursorY = contentTop
  let started = false

  function paintPage() {
    pdf.setFillColor(bg)
    pdf.rect(0, 0, pageW, pageH, 'F')
    if (opts.logoDataUrl && logoW > 0 && logoH > 0) {
      pdf.addImage(opts.logoDataUrl, 'PNG', margin, margin, logoW, logoH)
    }
  }
  function newPage() {
    pdf.addPage()
    paintPage()
    cursorY = contentTop
  }
  paintPage()
  started = true

  for (const el of targets) {
    if (el.offsetWidth === 0 || el.offsetHeight === 0) continue

    // Respiro arriba/abajo: html2canvas recorta los ascendentes/descendentes del
    // texto que queda pegado al borde del elemento (el nombre del jugador arriba,
    // la última línea de un bloque abajo). Agregamos padding vertical al elemento
    // (está oculto fuera de pantalla, no se ve) y lo restauramos al terminar.
    const prevCss = el.style.cssText
    const cs = getComputedStyle(el)
    el.style.paddingTop = `${parseFloat(cs.paddingTop || '0') + 12}px`
    el.style.paddingBottom = `${parseFloat(cs.paddingBottom || '0') + 12}px`
    const w = el.offsetWidth
    const h = el.offsetHeight
    const scale = Math.max(1, Math.min(2, 16000 / h))

    let c: HTMLCanvasElement
    try {
      c = await html2canvas(el, {
        scale,
        backgroundColor: bg,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: w,
        height: h,
        windowWidth: w,
        windowHeight: h,
      })
    } finally {
      el.style.cssText = prevCss
    }
    if (c.width === 0 || c.height === 0) continue

    const imgW = usableW
    const imgH = imgW * (c.height / c.width)

    if (imgH <= availPt) {
      // Cabe en una página: se coloca entero (nunca se parte entre hojas).
      if (cursorY + imgH > pageH - margin && cursorY > contentTop) newPage()
      pdf.addImage(c.toDataURL('image/png'), 'PNG', margin, cursorY, imgW, imgH)
      cursorY += imgH + GAP
      continue
    }

    // Bloque más alto que una hoja entera: se rebana en franjas de alto = página.
    if (cursorY > contentTop) newPage()
    const pxPerPt = c.width / imgW
    const slicePx = Math.max(1, Math.floor(availPt * pxPerPt))
    for (let y = 0; y < c.height; y += slicePx) {
      const hPx = Math.min(slicePx, c.height - y)
      const slice = document.createElement('canvas')
      slice.width = c.width
      slice.height = hPx
      const ctx = slice.getContext('2d')
      if (!ctx) break
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, slice.width, hPx)
      ctx.drawImage(c, 0, y, c.width, hPx, 0, 0, c.width, hPx)
      const hPt = hPx / pxPerPt
      if (cursorY + hPt > pageH - margin && cursorY > contentTop) newPage()
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, cursorY, imgW, hPt)
      cursorY += hPt + GAP
    }
  }

  if (!started) paintPage()
  pdf.save(`Informe_${opts.nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}.pdf`)
}
