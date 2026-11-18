import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { finishActivityTutorial, isActivityTutorialPending } from '@/services/activityTutorialService'

/**
 * Tutorial obligatorio de "cargar actividad": oscurece la pantalla y deja a la
 * vista solo los botones del menú que hay que conocer. No se puede saltear.
 *
 * Le aparece a todos una sola vez; al tocar "Entendido" queda guardado en `activity_tutorial_done`
 * y no vuelve a salir. Con `?tutorial=1` en la dirección se ve de prueba, sin guardar nada.
 */

type Target = 'cargar' | 'seguimiento' | 'mercado'

interface Step {
  title: string
  text?: string
  /** Botones del menú a resaltar. Sin targets = tarjeta al centro. */
  targets?: Target[]
  /** Qué se carga y cuándo (paso de Cargar actividad). */
  items?: { label: string; when: string }[]
}

const STEPS: Step[] = [
  {
    title: 'Hola, {name}',
    text: 'Te mostramos dónde cargar lo que hacés. Es un minuto.',
  },
  {
    title: 'Desde hoy, cargá acá',
    targets: ['cargar'],
    items: [
      { label: 'Reporte', when: 'Viste un partido' },
      { label: 'Reunión', when: 'Te juntaste con alguien' },
      { label: 'Viaje', when: 'Viajaste por trabajo' },
    ],
  },
  {
    title: 'Lo demás se cuenta solo',
    text: 'Lo que hacés en Seguimiento y Mercado ya queda registrado.',
    targets: ['seguimiento', 'mercado'],
  },
]

const TARGET_NAME: Record<Target, string> = {
  cargar: 'Cargar actividad',
  seguimiento: 'Seguimiento',
  mercado: 'Mercado',
}

const PAD = 8
const CARD_W = 360
/** Siempre se dibujan dos huecos para que pasen de un botón al otro con movimiento. */
const HOLES = 2

interface Box { top: number; left: number; width: number; height: number }

function isOnScreen(el: Element): DOMRect | null {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return null
  return r
}

function firstVisible(selector: string): DOMRect | null {
  for (const el of Array.from(document.querySelectorAll(selector))) {
    const rect = isOnScreen(el)
    if (rect) return rect
  }
  return null
}

/**
 * Los botones visibles para ese paso: los del menú de arriba o de la barra de abajo.
 * Los que no se ven en esta pantalla se muestran con el botón ☰ (una sola vez).
 */
function findTargets(targets: Target[]): { boxes: Box[]; viaMenu: Target[] } {
  const boxes: Box[] = []
  const viaMenu: Target[] = []
  for (const t of targets) {
    const rect = firstVisible(`[data-tour="${t}"]`)
    if (rect) boxes.push(pad(rect))
    else viaMenu.push(t)
  }
  if (viaMenu.length) {
    const menu = firstVisible('[data-tour="menu"]')
    if (menu) boxes.push(pad(menu))
  }
  return { boxes, viaMenu }
}

function pad(r: DOMRect): Box {
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

function menuHint(targets: Target[]): string {
  const names = targets.map(t => TARGET_NAME[t])
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names[names.length - 1]}` : names[0]
  return `Tocá el menú ☰ y entrá en ${list}.`
}

function firstName(full: string): string {
  const n = full.trim().split(/\s+/)[0] ?? ''
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : ''
}

export default function ActivityTutorial() {
  const { search } = useLocation()
  const { user, userDisplayName } = useAuth()
  const forced = new URLSearchParams(search).get('tutorial') === '1'
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [holes, setHoles] = useState<Box[]>([])
  const [viaMenu, setViaMenu] = useState<Target[]>([])
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight })

  const userId = user?.id ?? null
  useEffect(() => {
    if (!userId) return
    if (forced) { setStep(0); setOpen(true); return }
    let cancelled = false
    isActivityTutorialPending().then(pending => {
      if (!cancelled && pending) { setStep(0); setOpen(true) }
    })
    return () => { cancelled = true }
  }, [forced, userId])

  const finish = () => {
    setOpen(false)
    if (!forced) void finishActivityTutorial()
  }

  const current = STEPS[step]

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight })
    if (!current?.targets) { setHoles([]); setViaMenu([]); return }
    const found = findTargets(current.targets)
    setHoles(found.boxes.slice(0, HOLES))
    setViaMenu(found.viaMenu)
  }, [current])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, measure])

  // Sin scroll de fondo mientras dura el tutorial; arranca arriba para que se vea el menú.
  useEffect(() => {
    if (!open) return
    window.scrollTo({ top: 0 })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open || !current) return null

  const last = step === STEPS.length - 1
  const name = firstName(userDisplayName)
  const title = current.title.replace('{name}', name).replace(/, $/, '')
  const cardW = Math.min(CARD_W, viewport.w - 32)

  // Huecos: alrededor de cada botón. Los que sobran se cierran en el centro (o sobre el primero),
  // así en los pasos sin botón queda todo oscuro y entre pasos los huecos se deslizan.
  const center: Box = { top: viewport.h / 2, left: viewport.w / 2, width: 0, height: 0 }
  const drawn: Box[] = Array.from({ length: HOLES }, (_, i) => {
    if (holes[i]) return holes[i]
    const anchor = holes[0]
    return anchor ? { top: anchor.top + anchor.height / 2, left: anchor.left + anchor.width / 2, width: 0, height: 0 } : center
  })

  // Tarjeta: debajo de los botones si están arriba, encima si están abajo. Al centro si no hay
  // botones o si quedan uno arriba y otro abajo (celular).
  let cardStyle: React.CSSProperties = { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
  let arrow: { left: number; side: 'top' | 'bottom' } | null = null
  if (holes.length) {
    const top = Math.min(...holes.map(h => h.top))
    const bottom = Math.max(...holes.map(h => h.top + h.height))
    const leftEdge = Math.min(...holes.map(h => h.left))
    const rightEdge = Math.max(...holes.map(h => h.left + h.width))
    const allTop = bottom < viewport.h / 2
    const allBottom = top > viewport.h / 2
    if (allTop || allBottom) {
      const centerX = (leftEdge + rightEdge) / 2
      const left = Math.max(16, Math.min(centerX - cardW / 2, viewport.w - cardW - 16))
      cardStyle = allTop ? { top: bottom + 16, left } : { bottom: viewport.h - top + 16, left }
      if (holes.length === 1) arrow = { left: Math.max(20, Math.min(centerX - left, cardW - 20)), side: allTop ? 'top' : 'bottom' }
    }
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      {/* Fondo oscuro con huecos que dejan ver los botones; también bloquea los clics */}
      <svg className="absolute inset-0 h-full w-full animate-fade-in" aria-hidden="true">
        <defs>
          <mask id="activity-tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {drawn.map((b, i) => (
              <rect key={i} rx={16} fill="black" className="tutorial-hole" style={{ x: b.left, y: b.top, width: b.width, height: b.height } as React.CSSProperties} />
            ))}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.8)" mask="url(#activity-tutorial-mask)" />
      </svg>
      {holes.map((b, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="absolute rounded-2xl pointer-events-none ring-2 ring-brand-green tutorial-pulse transition-all duration-500 ease-apple motion-reduce:transition-none"
          style={b}
        />
      ))}

      {/* Tarjeta del paso */}
      <div className="absolute" style={cardStyle}>
        <div key={step} style={{ width: cardW }} className="tutorial-card relative rounded-2xl bg-white dark:bg-apple-gray-800 shadow-2xl border border-apple-gray-100 dark:border-apple-gray-700 p-6">
          {arrow && (
            <span
              aria-hidden="true"
              className={`absolute w-4 h-4 rotate-45 bg-white dark:bg-apple-gray-800 border-apple-gray-100 dark:border-apple-gray-700 ${
                arrow.side === 'top' ? '-top-2 border-l border-t' : '-bottom-2 border-r border-b'
              }`}
              style={{ left: arrow.left - 8 }}
            />
          )}

          <h2 id="tutorial-title" className="text-xl font-bold text-apple-gray-900 dark:text-white">{title}</h2>
          {current.text && <p className="mt-2 text-base leading-relaxed text-apple-gray-700 dark:text-apple-gray-200">{current.text}</p>}

          {current.items && (
            <ul className="mt-3 space-y-2">
              {current.items.map(it => (
                <li key={it.label} className="flex items-center gap-3 rounded-xl bg-apple-gray-50 dark:bg-apple-gray-900/60 px-3 py-2">
                  <span className="min-w-[4.5rem] rounded-lg bg-brand-green/15 px-2.5 py-1 text-center text-sm font-semibold text-apple-gray-900 dark:text-white">{it.label}</span>
                  <span className="text-sm text-apple-gray-700 dark:text-apple-gray-200">{it.when}</span>
                </li>
              ))}
            </ul>
          )}

          {viaMenu.length > 0 && (
            <p className="mt-3 text-sm font-medium text-brand-green">{menuHint(viaMenu)}</p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex gap-1.5" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-brand-green' : 'w-2 bg-apple-gray-300 dark:bg-apple-gray-600'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="rounded-xl px-4 py-2.5 text-base font-medium text-apple-gray-600 dark:text-apple-gray-300 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700 transition-colors"
                >
                  Atrás
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => (last ? finish() : setStep(s => s + 1))}
                className="rounded-xl bg-brand-green px-5 py-2.5 text-base font-semibold text-gray-900 hover:brightness-95 transition"
              >
                {step === 0 ? 'Empezar' : last ? 'Entendido' : 'Siguiente'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
