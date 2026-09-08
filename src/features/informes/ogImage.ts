// Tarjeta de preview (Open Graph) del informe compartido: 1200x630, dibujada en
// canvas al momento de compartir y subida junto al HTML.
//
// Criterio de diseño: en WhatsApp esta imagen se ve a ~400px de ancho, en un
// teléfono y de paso. Todo lo que no se lea a ese tamaño no va. De ahí que sea
// foto grande + nombre enorme + una sola línea de contexto, sobre el fondo de
// marca. Sin números ni gráficos: eso está adentro del informe.

const W = 1200
const H = 630

// Paleta de marca (misma que el informe y el preview).
const BG = '#08090B'
const CARD = '#14171B'
const TEXT = '#F5F7FA'
const MUTED = '#8A9099'
const GREEN = '#22C55E'

export interface OgCardInput {
  nombre: string
  club: string
  posicion: string
  edad?: string
  liga?: string
  fotoDataUrl?: string | null
  logoDataUrl?: string | null
}

/** Iniciales para cuando el informe no trae foto (mismo criterio que el preview). */
export function initialsFor(nombre: string): string {
  const parts = nombre.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '')
  return parts.join('') || '?'
}

/** Línea de contexto bajo el nombre: "Monterrey · EXT · 26 años · Liga MX". */
export function subtitleLine(input: Pick<OgCardInput, 'club' | 'posicion' | 'edad' | 'liga'>): string {
  const edad = input.edad?.trim()
  return [
    input.club?.trim(),
    input.posicion?.trim(),
    edad ? `${edad} años` : '',
    input.liga?.trim(),
  ]
    .filter(Boolean)
    .join('  ·  ')
}

/** Achica la tipografía hasta que el texto entre; devuelve el tamaño elegido. */
export function fitFontSize(
  measure: (size: number) => number,
  maxWidth: number,
  start: number,
  min: number,
): number {
  let size = start
  while (size > min && measure(size) > maxWidth) size -= 2
  return size
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Dibuja la imagen recortada al cuadro, tipo object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  // Chrome 99+; si no está, el texto simplemente sale sin tracking extra.
  try { (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = value } catch { /* noop */ }
}

/**
 * Dibuja la tarjeta y la devuelve como JPEG. Null si el entorno no tiene canvas
 * (tests, SSR): el llamador comparte igual, sólo sin imagen de preview.
 */
export async function buildOgImageBlob(input: OgCardInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // ── Fondo: negro de marca + dos resplandores verdes (como el informe) ──
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(150, -80, 0, 150, -80, 780)
  glow.addColorStop(0, 'rgba(34,197,94,0.20)')
  glow.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const glow2 = ctx.createRadialGradient(W + 60, H + 80, 0, W + 60, H + 80, 620)
  glow2.addColorStop(0, 'rgba(34,197,94,0.10)')
  glow2.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)

  // ── Logo de la agencia ──
  const logo = input.logoDataUrl ? await loadImage(input.logoDataUrl) : null
  if (logo) {
    const h = 46
    const w = (logo.width / logo.height) * h
    ctx.drawImage(logo, 72, 50, w, h)
  } else {
    ctx.fillStyle = TEXT
    ctx.font = '700 32px "Segoe UI", system-ui, sans-serif'
    setLetterSpacing(ctx, '0.06em')
    ctx.fillText('DOBLE G', 72, 86)
    setLetterSpacing(ctx, '0px')
  }

  // ── Foto del jugador (o iniciales) ──
  // Bloque centrado verticalmente: sin esto el contenido se apelmaza arriba y el
  // tercio de abajo queda vacío, que a tamaño de burbuja se lee como descuido.
  const PX = 72, PY = 152, PS = 340
  const foto = input.fotoDataUrl ? await loadImage(input.fotoDataUrl) : null
  ctx.save()
  roundedRect(ctx, PX, PY, PS, PS, 30)
  ctx.clip()
  if (foto) {
    drawCover(ctx, foto, PX, PY, PS, PS)
  } else {
    ctx.fillStyle = CARD
    ctx.fillRect(PX, PY, PS, PS)
    ctx.fillStyle = GREEN
    ctx.font = '700 104px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initialsFor(input.nombre), PX + PS / 2, PY + PS / 2)
    ctx.textAlign = 'start'
    ctx.textBaseline = 'alphabetic'
  }
  ctx.restore()
  // Borde sutil sobre la foto para despegarla del fondo.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  roundedRect(ctx, PX + 1, PY + 1, PS - 2, PS - 2, 29)
  ctx.stroke()

  // ── Bloque de texto ──
  const TX = PX + PS + 56          // 468
  const maxTextW = W - TX - 72     // 660

  // Eyebrow verde
  ctx.fillStyle = GREEN
  ctx.font = '700 24px "Segoe UI", system-ui, sans-serif'
  setLetterSpacing(ctx, '0.22em')
  ctx.fillText('INFORME', TX, PY + 62)
  setLetterSpacing(ctx, '0px')

  // Nombre: lo más grande que entre en una línea.
  const nombre = input.nombre.trim() || 'Informe'
  const nameSize = fitFontSize(
    size => {
      ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`
      return ctx.measureText(nombre).width
    },
    maxTextW,
    76,
    40,
  )
  ctx.font = `700 ${nameSize}px "Segoe UI", system-ui, sans-serif`
  setLetterSpacing(ctx, '-0.02em')
  ctx.fillStyle = TEXT
  ctx.fillText(nombre, TX, PY + 158)
  setLetterSpacing(ctx, '0px')

  // Regla verde corta: separa nombre de contexto sin meter una caja más.
  ctx.fillStyle = GREEN
  ctx.fillRect(TX, PY + 192, 64, 3)

  // Contexto: club · posición · edad · liga
  const sub = subtitleLine(input)
  if (sub) {
    const subSize = fitFontSize(
      size => {
        ctx.font = `400 ${size}px "Segoe UI", system-ui, sans-serif`
        return ctx.measureText(sub).width
      },
      maxTextW,
      30,
      20,
    )
    ctx.font = `400 ${subSize}px "Segoe UI", system-ui, sans-serif`
    ctx.fillStyle = MUTED
    ctx.fillText(sub, TX, PY + 248)
  }

  // ── Pie: ancla la composición y evita el vacío del tercio inferior ──
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(72, 552, W - 144, 1)
  ctx.fillStyle = MUTED
  ctx.font = '600 19px "Segoe UI", system-ui, sans-serif'
  setLetterSpacing(ctx, '0.18em')
  ctx.fillText('DOBLE G SPORTS GROUP', 72, 590)
  setLetterSpacing(ctx, '0px')

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}

export interface OgComparisonInput {
  a: { nombre: string; club?: string; fotoDataUrl?: string | null }
  b: { nombre: string; club?: string; fotoDataUrl?: string | null }
  logoDataUrl?: string | null
}

/** Apellido (última palabra) para que el nombre entre grande bajo cada foto. */
export function shortName(nombre: string): string {
  const parts = nombre.trim().split(/\s+/)
  return parts[parts.length - 1] || nombre
}

/**
 * Tarjeta de preview (Open Graph) para un informe de Comparación 1v1: dos fotos
 * lado a lado con un "VS" en el medio, en vez de una sola foto + nombre grande.
 * Mismo criterio que `buildOgImageBlob`: se lee de un vistazo a ~400px de ancho.
 */
export async function buildComparisonOgImageBlob(input: OgComparisonInput): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, -100, 0, W / 2, -100, 800)
  glow.addColorStop(0, 'rgba(34,197,94,0.18)')
  glow.addColorStop(1, 'rgba(34,197,94,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ── Logo / marca (arriba, centrado) ──
  const logo = input.logoDataUrl ? await loadImage(input.logoDataUrl) : null
  if (logo) {
    const h = 40
    const w = (logo.width / logo.height) * h
    ctx.drawImage(logo, (W - w) / 2, 44, w, h)
  } else {
    ctx.fillStyle = TEXT
    ctx.font = '700 28px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    setLetterSpacing(ctx, '0.06em')
    ctx.fillText('DOBLE G', W / 2, 72)
    setLetterSpacing(ctx, '0px')
    ctx.textAlign = 'start'
  }

  // Eyebrow verde
  ctx.fillStyle = GREEN
  ctx.font = '700 22px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  setLetterSpacing(ctx, '0.22em')
  ctx.fillText('COMPARACIÓN', W / 2, 128)
  setLetterSpacing(ctx, '0px')

  // ── Dos fotos cuadradas simétricas, con "VS" en el medio ──
  const PS = 340, PY = 172
  const gap = 90
  const leftX = W / 2 - gap / 2 - PS
  const rightX = W / 2 + gap / 2

  async function drawPlayer(x: number, player: { nombre: string; club?: string; fotoDataUrl?: string | null }) {
    const foto = player.fotoDataUrl ? await loadImage(player.fotoDataUrl) : null
    ctx!.save()
    roundedRect(ctx!, x, PY, PS, PS, 28)
    ctx!.clip()
    if (foto) {
      drawCover(ctx!, foto, x, PY, PS, PS)
    } else {
      ctx!.fillStyle = CARD
      ctx!.fillRect(x, PY, PS, PS)
      ctx!.fillStyle = GREEN
      ctx!.font = '700 100px "Segoe UI", system-ui, sans-serif'
      ctx!.textAlign = 'center'
      ctx!.textBaseline = 'middle'
      ctx!.fillText(initialsFor(player.nombre), x + PS / 2, PY + PS / 2)
      ctx!.textBaseline = 'alphabetic'
    }
    ctx!.restore()
    ctx!.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx!.lineWidth = 2
    roundedRect(ctx!, x + 1, PY + 1, PS - 2, PS - 2, 27)
    ctx!.stroke()

    // Nombre debajo de la foto, centrado sobre el ancho de la foto.
    const name = shortName(player.nombre) || 'Informe'
    const nameSize = fitFontSize(size => {
      ctx!.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`
      return ctx!.measureText(name).width
    }, PS, 44, 26)
    ctx!.font = `700 ${nameSize}px "Segoe UI", system-ui, sans-serif`
    ctx!.fillStyle = TEXT
    ctx!.fillText(name, x + PS / 2, PY + PS + 48)

    if (player.club) {
      ctx!.font = '400 20px "Segoe UI", system-ui, sans-serif'
      ctx!.fillStyle = MUTED
      ctx!.fillText(player.club.trim(), x + PS / 2, PY + PS + 76)
    }
    ctx!.textAlign = 'start'
  }

  await drawPlayer(leftX, input.a)
  await drawPlayer(rightX, input.b)

  // "VS" central, sobre un círculo para que se lea despegado de ambas fotos.
  const vsCx = W / 2, vsCy = PY + PS / 2
  ctx.beginPath()
  ctx.arc(vsCx, vsCy, 44, 0, Math.PI * 2)
  ctx.fillStyle = BG
  ctx.fill()
  ctx.strokeStyle = GREEN
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.fillStyle = GREEN
  ctx.font = '700 32px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('VS', vsCx, vsCy + 2)
  ctx.textAlign = 'start'
  ctx.textBaseline = 'alphabetic'

  // ── Pie ──
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fillRect(72, 552, W - 144, 1)
  ctx.fillStyle = MUTED
  ctx.font = '600 18px "Segoe UI", system-ui, sans-serif'
  ctx.textAlign = 'center'
  setLetterSpacing(ctx, '0.18em')
  ctx.fillText('DOBLE G SPORTS GROUP', W / 2, 588)
  setLetterSpacing(ctx, '0px')
  ctx.textAlign = 'start'

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}
