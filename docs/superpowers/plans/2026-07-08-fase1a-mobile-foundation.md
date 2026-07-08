# Fase 1·A — Cimientos mobile + Navegación + Piezas reutilizables (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar los cimientos mobile de la app (safe-area, viewport, piezas reutilizables) y la navegación (hamburguesa pulida + barra inferior liquid glass con auto-ocultar), sin cambiar el desktop.

**Architecture:** Todo mobile-first con clases responsive; el desktop se preserva bajo `lg:`. La barra inferior es un componente nuevo montado en `Layout`, visible sólo en mobile (`lg:hidden`), cuya visibilidad la maneja un hook de dirección de scroll (lógica pura testeada). Las piezas reutilizables (contenedor de página, hoja mobile) se crean acá para aplicarse a las páginas en el plan siguiente (Parte B).

**Tech Stack:** React 18, Vite 7, Tailwind CSS, react-router-dom, Vitest (sin @testing-library → se testea lógica pura).

## Global Constraints

- **No romper desktop:** estilos base = mobile; el desktop va bajo `lg:` (breakpoint 1024px). La barra inferior es `lg:hidden`. El layout de desktop debe quedar visualmente idéntico.
- **Build verde siempre:** `npm run build` (corre `tsc && vite build`) debe pasar al final de cada task.
- **Tests verdes:** `npm run test` (corre `vitest run`) debe pasar.
- **Estética actual:** reusar tokens existentes `apple-gray-*`, `brand-green` (definidos en `src/index.css`). No introducir paleta nueva.
- **Capacitor-ready:** nada de rutas absolutas a assets nuevas; respetar `env(safe-area-inset-*)`.
- **Reduced motion:** toda animación respeta `prefers-reduced-motion` (`motion-reduce:` de Tailwind).
- **Destinos de la barra inferior (fijos):** Inicio=`/`, Calendario=`/calendario`, Jugadores=`/interno`, Seguimiento=`/seguimiento-gg`, Reporte=`/evaluar`.

---

### Task 1: Cimientos CSS (viewport + safe-area)

**Files:**
- Modify: `index.html` (meta viewport)
- Modify: `src/index.css` (utilidades safe-area, dentro de `@layer utilities`)

**Interfaces:**
- Produces: clases utilitarias `pt-safe`, `pb-safe`, `pl-safe`, `pr-safe`, `pb-bottomnav` usadas por tasks posteriores.

- [ ] **Step 1: Agregar `viewport-fit=cover` al meta viewport**

En `index.html`, reemplazar la línea del viewport por:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Agregar utilidades safe-area a `src/index.css`**

Al final de `src/index.css`, agregar:

```css
@layer utilities {
  .pt-safe { padding-top: env(safe-area-inset-top); }
  .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
  .pl-safe { padding-left: env(safe-area-inset-left); }
  .pr-safe { padding-right: env(safe-area-inset-right); }
  /* Espacio inferior para que el contenido no quede tapado por la barra flotante
     (alto de la barra ~4.5rem + safe-area). Sólo se usa en mobile. */
  .pb-bottomnav { padding-bottom: calc(env(safe-area-inset-bottom) + 4.75rem); }
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add index.html src/index.css
git commit -m "feat(mobile): viewport-fit cover + utilidades safe-area"
```

---

### Task 2: Hook `useMediaQuery` / `useIsMobile`

**Files:**
- Create: `src/hooks/useMediaQuery.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): boolean` y `useIsMobile(): boolean` (true por debajo de 1024px).

- [ ] **Step 1: Crear el hook**

`src/hooks/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react'

/** Suscribe a una media query y devuelve si matchea. SSR-safe. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/** Mobile = por debajo del breakpoint `lg` de Tailwind (1024px). */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 1024px)')
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila sin errores (el hook aún no se usa; TypeScript no marca exports sin usar).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useMediaQuery.ts
git commit -m "feat(mobile): hook useMediaQuery/useIsMobile"
```

---

### Task 3: Lógica de auto-ocultar (pura + hook de scroll)

**Files:**
- Create: `src/hooks/scrollVisibility.ts`
- Create: `src/hooks/scrollVisibility.test.ts`
- Create: `src/hooks/useHideOnScrollDown.ts`

**Interfaces:**
- Produces: `nextNavVisibility(p: { lastY: number; currentY: number; visible: boolean; threshold?: number }): boolean` y `useHideOnScrollDown(): boolean`.

- [ ] **Step 1: Escribir el test que falla**

`src/hooks/scrollVisibility.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { nextNavVisibility } from './scrollVisibility'

describe('nextNavVisibility', () => {
  it('cerca del tope siempre visible', () => {
    expect(nextNavVisibility({ lastY: 0, currentY: 4, visible: false })).toBe(true)
  })
  it('bajando (más que el umbral) oculta', () => {
    expect(nextNavVisibility({ lastY: 100, currentY: 140, visible: true })).toBe(false)
  })
  it('subiendo (más que el umbral) muestra', () => {
    expect(nextNavVisibility({ lastY: 300, currentY: 250, visible: false })).toBe(true)
  })
  it('movimiento menor al umbral no cambia el estado', () => {
    expect(nextNavVisibility({ lastY: 200, currentY: 203, visible: false })).toBe(false)
    expect(nextNavVisibility({ lastY: 200, currentY: 203, visible: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- scrollVisibility`
Expected: FAIL ("nextNavVisibility is not a function" / módulo no encontrado).

- [ ] **Step 3: Implementar la lógica pura**

`src/hooks/scrollVisibility.ts`:

```ts
/**
 * Decide si la barra inferior debe estar visible según el scroll.
 * - Cerca del tope: siempre visible.
 * - Bajando más que el umbral: ocultar.
 * - Subiendo más que el umbral: mostrar.
 * - Movimiento chico: mantener el estado actual.
 */
export function nextNavVisibility(p: {
  lastY: number
  currentY: number
  visible: boolean
  threshold?: number
}): boolean {
  const threshold = p.threshold ?? 6
  if (p.currentY <= 8) return true
  if (p.currentY > p.lastY + threshold) return false
  if (p.currentY < p.lastY - threshold) return true
  return p.visible
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- scrollVisibility`
Expected: PASS (4 tests).

- [ ] **Step 5: Implementar el hook**

`src/hooks/useHideOnScrollDown.ts`:

```ts
import { useEffect, useRef, useState } from 'react'
import { nextNavVisibility } from './scrollVisibility'

/**
 * Devuelve si la barra inferior debe mostrarse. Se oculta mientras se scrollea
 * hacia abajo; reaparece al scrollear hacia arriba o al frenar (idle ~160ms).
 * Escucha el scroll de la ventana (el body scrollea a nivel documento).
 */
export function useHideOnScrollDown(): boolean {
  const [visible, setVisible] = useState(true)
  const lastY = useRef(0)
  const idle = useRef<number | undefined>(undefined)

  useEffect(() => {
    lastY.current = window.scrollY
    let ticking = false

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          const currentY = window.scrollY
          setVisible(v => nextNavVisibility({ lastY: lastY.current, currentY, visible: v }))
          lastY.current = currentY
          ticking = false
        })
      }
      window.clearTimeout(idle.current)
      idle.current = window.setTimeout(() => setVisible(true), 160)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.clearTimeout(idle.current)
    }
  }, [])

  return visible
}
```

- [ ] **Step 6: Verificar build + tests**

Run: `npm run build && npm run test -- scrollVisibility`
Expected: build OK, tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/scrollVisibility.ts src/hooks/scrollVisibility.test.ts src/hooks/useHideOnScrollDown.ts
git commit -m "feat(mobile): logica de auto-ocultar barra inferior + hook de scroll"
```

---

### Task 4: Destinos de la barra + detección de activo (pura)

**Files:**
- Create: `src/components/layout/bottomNavItems.ts`
- Create: `src/components/layout/bottomNavItems.test.ts`

**Interfaces:**
- Produces: `BottomNavItem` (interface `{ key, label, to }`), `BOTTOM_NAV_ITEMS: BottomNavItem[]`, `activeNavKey(pathname, items): string | null`.

- [ ] **Step 1: Escribir el test que falla**

`src/components/layout/bottomNavItems.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BOTTOM_NAV_ITEMS, activeNavKey } from './bottomNavItems'

describe('activeNavKey', () => {
  it('inicio sólo matchea la raíz exacta', () => {
    expect(activeNavKey('/', BOTTOM_NAV_ITEMS)).toBe('inicio')
    expect(activeNavKey('/interno', BOTTOM_NAV_ITEMS)).not.toBe('inicio')
  })
  it('jugadores matchea /interno y sus subrutas', () => {
    expect(activeNavKey('/interno', BOTTOM_NAV_ITEMS)).toBe('jugadores')
    expect(activeNavKey('/interno/detalle', BOTTOM_NAV_ITEMS)).toBe('jugadores')
  })
  it('mapea el resto de destinos', () => {
    expect(activeNavKey('/calendario', BOTTOM_NAV_ITEMS)).toBe('calendario')
    expect(activeNavKey('/seguimiento-gg', BOTTOM_NAV_ITEMS)).toBe('seguimiento')
    expect(activeNavKey('/evaluar', BOTTOM_NAV_ITEMS)).toBe('reporte')
  })
  it('ruta desconocida devuelve null', () => {
    expect(activeNavKey('/comparacion', BOTTOM_NAV_ITEMS)).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm run test -- bottomNavItems`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar**

`src/components/layout/bottomNavItems.ts`:

```ts
export interface BottomNavItem {
  key: string
  label: string
  to: string
}

export const BOTTOM_NAV_ITEMS: BottomNavItem[] = [
  { key: 'inicio', label: 'Inicio', to: '/' },
  { key: 'calendario', label: 'Calendario', to: '/calendario' },
  { key: 'jugadores', label: 'Jugadores', to: '/interno' },
  { key: 'seguimiento', label: 'Seguimiento', to: '/seguimiento-gg' },
  { key: 'reporte', label: 'Reporte', to: '/evaluar' },
]

/**
 * Devuelve la key del destino activo según la ruta. '/' matchea sólo exacto;
 * el resto matchea por prefijo (para subrutas). Gana el prefijo más largo.
 */
export function activeNavKey(pathname: string, items: BottomNavItem[]): string | null {
  let best: { key: string; len: number } | null = null
  for (const item of items) {
    const matches =
      item.to === '/'
        ? pathname === '/'
        : pathname === item.to || pathname.startsWith(item.to + '/')
    if (matches && (!best || item.to.length > best.len)) {
      best = { key: item.key, len: item.to.length }
    }
  }
  return best?.key ?? null
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm run test -- bottomNavItems`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/bottomNavItems.ts src/components/layout/bottomNavItems.test.ts
git commit -m "feat(mobile): destinos barra inferior + deteccion de activo (testeado)"
```

---

### Task 5: Componente `LiquidGlassBottomNav`

**Files:**
- Create: `src/components/layout/LiquidGlassBottomNav.tsx`

**Interfaces:**
- Consumes: `BOTTOM_NAV_ITEMS`, `activeNavKey` (Task 4).
- Produces: `default export function LiquidGlassBottomNav({ visible }: { visible: boolean })`.

- [ ] **Step 1: Crear el componente**

`src/components/layout/LiquidGlassBottomNav.tsx`:

```tsx
import { NavLink, useLocation } from 'react-router-dom'
import { BOTTOM_NAV_ITEMS, activeNavKey } from './bottomNavItems'

const ICONS: Record<string, JSX.Element> = {
  inicio: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 11l9-8 9 8M5 10v10a1 1 0 001 1h3v-6h6v6h3a1 1 0 001-1V10" />
    </svg>
  ),
  calendario: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  jugadores: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M17 20h5v-1a4 4 0 00-4-4h-1m-6 5H2v-1a4 4 0 014-4h4a4 4 0 014 4v1zM9 11a3 3 0 100-6 3 3 0 000 6zm8-2a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
    </svg>
  ),
  seguimiento: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
    </svg>
  ),
  reporte: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
}

/**
 * Barra inferior flotante estilo "liquid glass". Sólo mobile (`lg:hidden`).
 * `visible=false` la desliza fuera de pantalla. Respeta safe-area y reduced-motion.
 */
export default function LiquidGlassBottomNav({ visible }: { visible: boolean }) {
  const { pathname } = useLocation()
  const active = activeNavKey(pathname, BOTTOM_NAV_ITEMS)

  return (
    <div
      className={`lg:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none pb-safe transition-transform duration-300 ease-out motion-reduce:transition-none ${
        visible ? 'translate-y-0' : 'translate-y-[160%]'
      }`}
    >
      <nav
        className="pointer-events-auto mx-3 mb-2 flex items-stretch justify-between gap-1 rounded-2xl border border-white/40 dark:border-white/10 bg-white/70 dark:bg-apple-gray-900/60 px-2 py-1.5 shadow-lg shadow-black/10 backdrop-blur-xl"
        aria-label="Navegación principal"
      >
        {BOTTOM_NAV_ITEMS.map(item => {
          const isActive = active === item.key
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-medium transition-colors ${
                isActive
                  ? 'text-brand-green'
                  : 'text-apple-gray-500 dark:text-apple-gray-400 hover:text-apple-gray-700 dark:hover:text-apple-gray-200'
              }`}
            >
              <span className={`transition-transform ${isActive ? 'scale-110' : ''}`}>{ICONS[item.key]}</span>
              <span className="truncate max-w-full">{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/LiquidGlassBottomNav.tsx
git commit -m "feat(mobile): barra inferior liquid glass (componente)"
```

---

### Task 6: Integrar la barra inferior en `Layout`

**Files:**
- Modify: `src/components/layout/Layout.tsx`

**Interfaces:**
- Consumes: `useHideOnScrollDown` (Task 3), `LiquidGlassBottomNav` (Task 5).

- [ ] **Step 1: Importar hook y componente**

En `src/components/layout/Layout.tsx`, agregar a los imports del tope:

```tsx
import LiquidGlassBottomNav from './LiquidGlassBottomNav'
import { useHideOnScrollDown } from '@/hooks/useHideOnScrollDown'
```

- [ ] **Step 2: Llamar el hook al tope del componente**

Justo después de `const { user, loading } = useAuth()`, agregar (los hooks deben llamarse antes de los early return):

```tsx
  const bottomNavVisible = useHideOnScrollDown()
```

- [ ] **Step 3: Reservar espacio inferior en el contenido y montar la barra**

En el `return` autenticado, reemplazar el bloque `<main>…</main>` y el `<Footer />` por:

```tsx
      <main className="flex-1 pb-bottomnav lg:pb-0">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="w-6 h-6 border-2 border-brand-green border-t-transparent rounded-full animate-spin opacity-60" />
          </div>
        }>
          <div className="animate-fade-in">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <Footer />
      <LiquidGlassBottomNav visible={bottomNavVisible} />
```

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 5: Control visual (mobile + desktop)**

Run: `npm run dev` y abrir `http://localhost:5173`.
- A 390px de ancho: la barra liquid glass aparece abajo con los 5 destinos; al scrollear hacia abajo desaparece; al frenar o subir, reaparece; el destino activo se resalta en verde; el contenido no queda tapado por la barra.
- A ancho desktop (≥1024px): la barra NO aparece y el layout se ve idéntico a antes.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Layout.tsx
git commit -m "feat(mobile): montar barra inferior con auto-ocultar en Layout"
```

---

### Task 7: Pulir el drawer hamburguesa (safe-area + cerrar deslizando)

**Files:**
- Create: `src/hooks/useSwipeToClose.ts`
- Modify: `src/components/layout/Navbar.tsx` (panel mobile, ~línea 401)

**Interfaces:**
- Produces: `useSwipeToClose(onClose: () => void): { onTouchStart, onTouchMove, onTouchEnd }` (handlers para el panel).

- [ ] **Step 1: Crear el hook de swipe**

`src/hooks/useSwipeToClose.ts`:

```ts
import { useRef } from 'react'

/**
 * Handlers para cerrar un panel deslizándolo hacia la derecha (el drawer entra
 * desde la derecha). Si el gesto horizontal supera 60px hacia la derecha, cierra.
 */
export function useSwipeToClose(onClose: () => void) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    },
    onTouchMove: (_e: React.TouchEvent) => {
      /* no-op: la decisión se toma al soltar */
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current
      if (dx > 60 && Math.abs(dx) > Math.abs(dy)) onClose()
      startX.current = null
      startY.current = null
    },
  }
}
```

- [ ] **Step 2: Aplicar swipe + safe-area al panel mobile**

En `src/components/layout/Navbar.tsx`:

1. Agregar al import del tope: `import { useSwipeToClose } from '@/hooks/useSwipeToClose'`
2. Dentro del componente, donde se cierra el menú mobile (existe un setter tipo `setMobileMenuOpen(false)` / equivalente), crear los handlers:

```tsx
  const swipe = useSwipeToClose(() => setMobileMenuOpen(false))
```

(Usar el nombre real del setter que cierra el menú mobile en este archivo.)

3. En el div del **panel mobile** (el que tiene las clases `fixed top-14 right-0 bottom-0 z-40 w-72 …`, ~línea 401), agregar los handlers y las clases de safe-area:

```tsx
        {...swipe}
        // y sumar a su className existente:  pb-safe
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Control visual (mobile)**

Run: `npm run dev`, a 390px: abrir el menú hamburguesa; deslizar hacia la derecha lo cierra; el contenido del panel respeta la barra inferior del teléfono (safe-area). Desktop sin cambios.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSwipeToClose.ts src/components/layout/Navbar.tsx
git commit -m "feat(mobile): drawer con cerrar-deslizando + safe-area"
```

---

### Task 8: Piezas reutilizables (`PageContainer`, `MobileSheet`)

**Files:**
- Create: `src/components/layout/PageContainer.tsx`
- Create: `src/components/ui/MobileSheet.tsx`

**Interfaces:**
- Consumes: `useIsMobile` (Task 2).
- Produces: `PageContainer` (wrapper de página con padding mobile consistente) y `MobileSheet` (modal → hoja full-screen en mobile, modal centrado en desktop).

- [ ] **Step 1: Crear `PageContainer`**

`src/components/layout/PageContainer.tsx`:

```tsx
import type { ReactNode } from 'react'

/**
 * Contenedor estándar de página: padding mobile cómodo, ancho máximo en desktop.
 * Se aplica a cada página en la Parte B para consistencia.
 */
export default function PageContainer({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`w-full max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 ${className}`}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Crear `MobileSheet`**

`src/components/ui/MobileSheet.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { useIsMobile } from '@/hooks/useMediaQuery'

/**
 * Envoltorio de modal responsive:
 * - Mobile: hoja a pantalla completa que sube desde abajo, con manija y safe-area.
 * - Desktop: modal centrado clásico.
 * No decide el contenido; sólo el "contenedor". `open=false` no renderiza nada.
 */
export default function MobileSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
}) {
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={
          isMobile
            ? 'relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-apple-gray-900 pb-safe shadow-2xl'
            : 'relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-apple-gray-900 shadow-2xl'
        }
      >
        {isMobile && (
          <div className="sticky top-0 flex justify-center pt-2 pb-1 bg-white dark:bg-apple-gray-900">
            <span className="h-1.5 w-10 rounded-full bg-apple-gray-300 dark:bg-apple-gray-700" />
          </div>
        )}
        {title && (
          <div className="px-5 pt-2 pb-3 text-base font-semibold text-apple-gray-900 dark:text-white">
            {title}
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/PageContainer.tsx src/components/ui/MobileSheet.tsx
git commit -m "feat(mobile): piezas reutilizables PageContainer y MobileSheet"
```

---

## Self-Review

**Cobertura del spec (Parte A):**
- Cimientos (safe-area, viewport, no-scroll-horizontal, targets 44px, Capacitor-ready) → Tasks 1, 5 (min-h-[44px]), utilidades.
- Navegación hamburguesa pulida → Task 7. Barra inferior liquid glass con auto-ocultar y 5 destinos → Tasks 3–6.
- Piezas reutilizables (contenedor, hoja mobile) → Task 8. *(Tabla→tarjetas y gráficos responsive se aplican por página en la Parte B, usando `useIsMobile` y `MobileSheet`.)*
- No romper desktop / build verde / control visual → Global Constraints + steps de verificación en cada task.

**Fuera de alcance (Parte B, próximo plan):** adaptación página por página (rondas 1–4), incluyendo tabla→tarjetas en `PlayerTable` y gráficos responsive por página, reusando `useIsMobile`, `PageContainer`, `MobileSheet` y el patrón de filtros bottom-sheet ya existente (`MobileFilterPanel`).

**Placeholders:** ninguno (Task 7 referencia el nombre real del setter del menú mobile, a leer en `Navbar.tsx` durante la ejecución; el resto es código completo).

**Consistencia de tipos:** `nextNavVisibility`, `activeNavKey`, `BOTTOM_NAV_ITEMS`, `useHideOnScrollDown`, `useIsMobile`, `useSwipeToClose` usados con las mismas firmas donde se consumen.

## Notas para la Parte B

Cada página se adapta con el mismo patrón: envolver en `PageContainer`, reemplazar tablas por tarjetas en mobile (`useIsMobile`), modales por `MobileSheet`, filtros por bottom-sheet, y asegurar gráficos sin scroll horizontal. Rondas: (1) Inicio, Scout Externo, Scout Interno, Ficha; (2) Seguimiento GG/Datos, Oportunidades, Informes, Reporte; (3) Comparación, Radar, Dispersión, Formación, Similares; (4) Evaluaciones, Calendario, Análisis Completo, Trabajos, Panel Interno.
