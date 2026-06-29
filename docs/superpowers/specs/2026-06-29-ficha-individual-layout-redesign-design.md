# Rediseño del layout de la ficha individual

**Fecha:** 2026-06-29
**Archivo principal afectado:** `src/pages/PlayerDetailPage.tsx`
**Estado:** Aprobado, listo para plan de implementación

## Problema

Las fichas individuales "pierden espacio". Hoy:

- La grilla raíz es `grid-cols-1 lg:grid-cols-12` con una **columna izquierda angosta** (`col-span-4`) que apila header del jugador, panel Score GG, distribución de posiciones, timeline, accesos rápidos y comentarios; y una **columna derecha** (`col-span-8`) con un rail de tabs angosto (`md:w-12 xl:w-auto`) + contenido.
- Las tabs ya son verticales en desktop, pero muestran **solo el ícono** hasta pantallas muy anchas (`xl:block`), por lo que la navegación se siente escondida.
- El header del jugador y el panel Score GG quedan comprimidos en la columna angosta, desaprovechando el ancho disponible.

## Objetivo

Un layout unificado para **todos los jugadores** (de agencia y normales), estético, prolijo, funcional y responsive. Desktop-first, con adaptación correcta a tablet, mobile y apps.

## Diseño aprobado (Layout B)

### Estructura general

Tres zonas:

1. **Rail full-height a la izquierda** — navegación principal de toda la ficha.
2. **Hero arriba a la derecha** — fila full-width con perfil (izq) + panel Score GG (der).
3. **Contenido de la tab activa** — debajo del hero, ocupa todo el ancho del área derecha.

```
┌──────────┬─────────────────────────────────────────┐
│  RAIL    │  ┌───────────────┐  ┌─────────────────┐  │
│  General │  │  PERFIL        │  │  SCORE GG       │  │
│  Métricas│  │  foto + datos  │  │  gauge 1–10     │  │
│  Físico  │  └───────────────┘  │  6.3            │  │
│  Salud   │                     │  Posiciones     │  │
│  Psico…  │  ┌───────────────────────────────────┐  │
│  Coach…  │  │  CONTENIDO DE LA TAB ACTIVA        │  │
│  ──────  │  │                                    │  │
│ 📄🔗▶💬  │  │                                    │  │
└──────────┴──┴────────────────────────────────────┴──┘
```

### 1. Rail de tabs (izquierda)

- Vertical, **sticky** al hacer scroll.
- Cada tab: ícono + texto (en desktop). Estado activo `bg-brand-green text-white`, inactivo `text-apple-gray-500 hover:bg-apple-gray-50` (se conserva el sistema actual de estilos).
- Las tabs marcadas como `internal` en `tabsConfig` (Valor, Rendimiento evolutivo, Físico, Salud, Fisioterapia, Nutrición, Neurociencia, Psicología, Coaching) **solo aparecen para jugadores de agencia**. Los jugadores normales ven solo las no-internal (General, Métricas). Esta lógica de filtrado ya existe y se mantiene.
- **Al pie del rail** (separado por borde superior): barra de acciones con íconos — Exportar PDF, Transfermarkt, Wyscout (video), Comentarios (💬). Estos botones hoy viven en "accesos rápidos" de la columna izquierda.

### 2. Hero (arriba a la derecha)

Fila full-width sobre el contenido, dividida en dos:

- **Perfil (izquierda, ~60%)**: foto/avatar, nombre + `ScoutsGGBadge`, equipo, posición, liga, y bio (edad / altura / pie). Mantiene el diseño visual actual del `player-header-card` (header decorativo con gradiente, avatar solapado), reacomodado al nuevo ancho.
- **Panel Score GG (derecha, ~40%)**: `GaugeScore` (escala 1–10 cuando hay dato de Supabase, 1–100 fallback) + score numérico + etiqueta cualitativa ("Sobre el promedio") + comparación de posición ("Promedio VI: 4.3 (+2.0)") + **distribución de Posiciones** (VI 74%, EXT 19%, DEL 5%, VC 2%) integrada debajo del gauge. Para internos con métricas subjetivas, "Evaluación Scout" se conserva dentro de este panel.

### 3. Contenido

El contenido de la tab activa (`player-tab-content`) ocupa todo el ancho del área derecha, debajo del hero.

### Reubicación de extras

| Extra (hoy en columna izquierda) | Nuevo lugar |
|---|---|
| Distribución de Posiciones | Dentro del panel Score GG, debajo del gauge |
| Timeline de scoring (Score Scout Timeline) | Pestaña **General** (overview) |
| Widgets Doble G (`DobleGWidget`) y Tracking (`TrackingWidget`) | Pestaña **General** (overview) |
| Editor manual de fixtures (solo DG sin `apiTeamId`) | Pestaña **Físico/Rendimiento** |
| Accesos rápidos (PDF, Transfermarkt, Wyscout) | Barra de acciones al pie del rail |
| Comentarios | Panel deslizable (slide-over) abierto con botón 💬 |

## Comportamiento responsive

- **Desktop (`lg+`)**: rail con ícono + texto; hero perfil | Score GG lado a lado.
- **Tablet (`md`)**: el rail colapsa a **solo íconos** (tooltip al tocar/hover); el hero sigue lado a lado.
- **Mobile (`< md`)**: todo se apila verticalmente → perfil → Score GG → **barra de tabs horizontal deslizable** (scroll horizontal) → contenido.

## Alcance técnico

- Cambios concentrados en `src/pages/PlayerDetailPage.tsx`: reestructurar la grilla raíz (`lg:grid-cols-12` con sidebar `col-span-4` + main `col-span-8`) hacia el esquema rail full-height + hero + contenido.
- Ajustes menores de posicionamiento/contenedor en los componentes que se mueven: `GaugeScore` (sin cambios internos, solo ubicación), timeline, `DobleGWidget`, `TrackingWidget`, editor de fixtures, panel de comentarios (pasa a slide-over).
- **No** se toca la capa de datos, los servicios, ni la lógica de scoring (Score GG, Supabase, API-Football).
- Se reutilizan las clases y utilidades Tailwind existentes (`card-apple`, `bg-brand-green`, breakpoints `md`/`lg`/`xl`).

## Riesgos y precauciones

- **Archivo grande (~2.800 líneas)**: el reordenado del JSX debe hacerse con cuidado para no romper la estructura ni el estado de tabs.
- **IDs usados por el export a PDF / html2canvas**: preservar `player-header-card`, `player-score-card`, `player-tab-content`, `player-tab-content` por tab (`tab-content-general`, `tab-content-metrics`, etc.) y cualquier `data-tab`. El export a PDF debe seguir funcionando idéntico tras el rediseño.
- **Filtrado de tabs internal**: verificar que jugadores normales no vean tabs de agencia tras el cambio.
- **Score GG en escala correcta**: respetar la lógica actual de escala 1–10 (Supabase) vs 1–100 (fallback) y `higherIsBetter`.

## Criterios de éxito

- Mismo layout para jugadores de agencia y normales.
- Rail de tabs a la izquierda con texto visible en desktop, íconos en tablet, barra horizontal en mobile.
- Perfil + Score GG (con Posiciones) en una fila full-width arriba a la derecha.
- Acciones al pie del rail; comentarios en slide-over.
- Export a PDF sigue funcionando.
- Sin errores de TypeScript ni de build (`npm run build`).
- Responsive correcto en desktop / tablet / mobile.
