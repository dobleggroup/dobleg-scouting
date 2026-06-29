# Rediseño del layout de la ficha individual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `PlayerDetailPage.tsx` a un layout con rail de tabs full-height a la izquierda y un "hero" arriba a la derecha (perfil | Score GG), liberando ancho para el contenido.

**Architecture:** Reestructuración del JSX de la grilla raíz de `src/pages/PlayerDetailPage.tsx`. Se pasa de `grid lg:grid-cols-12` (sidebar 4 + main 8) a `flex` con un `<aside>` rail vertical (navegación de tabs + acciones al pie) y una columna derecha que contiene el hero (header del jugador + panel Score GG lado a lado) y el contenido de la tab activa. Los extras de la columna izquierda se reubican (Posiciones → panel Score GG; timeline y widgets → tab General; fixtures → tab Físico; comentarios → slide-over).

**Tech Stack:** React 18 + TypeScript, Vite 7, Tailwind CSS. Recharts. Sin framework de tests.

## Global Constraints

- **No romper IDs usados por export PDF / html2canvas:** preservar `player-detail-container`, `player-header-card`, `player-score-card`, `player-tab-content`, y los `id="tab-content-*"` de cada tab, además de `data-tab` y `captureId="player-detail-container"`.
- **Mismo layout para todos los jugadores** (agencia y normales). El filtrado de tabs `internal` se mantiene como está (jugadores normales no ven tabs de agencia).
- **No tocar** la capa de datos, servicios ni la lógica de scoring (Score GG, escala 1–10 Supabase vs 1–100 fallback, `higherIsBetter`).
- **Reutilizar** clases Tailwind existentes (`card-apple`, `bg-brand-green`, breakpoints `md`/`lg`/`xl`).
- **Verificación sin tests unitarios:** cada tarea termina con `npm run build` en verde + chequeo visual en `npm run dev` (desktop, y reduciendo el ancho del browser para tablet/mobile).
- **Commits frecuentes**, uno por tarea.

---

## Estructura actual (referencia, `src/pages/PlayerDetailPage.tsx`)

```
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">          // 1012  raíz
  <div className="lg:col-span-4 space-y-5">                       // 1014  sidebar izq
    <div id="player-header-card"> … </div>                        // 1016-1220 perfil
    <div id="player-score-card"> … </div>                         // 1223-1303 Score GG + Evaluación Scout
    {posDist && <div className="card-apple p-4"><PositionBar/></div>} // 1305-1314 Posiciones
    <ScoreScoutTimeline … />                                      // 1317  timeline
    <div className="card-apple p-4 space-y-2"> … acciones … </div> // 1319-1380 DobleGWidget, TrackingWidget, Transfermarkt, Wyscout, AddToReportButton, Exportar PDF
    {needsManualFixtures && <ManualFixturesEditor … />}           // 1382
    <div className="card-apple p-5"><PlayerComments … /></div>    // 1384-1387 comentarios
  </div>
  <div className="lg:col-span-8">                                 // 1390  main
    <div className="flex flex-col md:flex-row gap-4">             // 1392
      <div className="shrink-0 md:w-12 xl:w-auto"> … nav tabs … </div> // 1394-1438 rail tabs
      <div className="flex-1 card-apple p-6 min-w-0" id="player-tab-content"> … contenido … </div> // 1440+
    </div>
  </div>
</div>
```

---

## File Structure

- **Modify:** `src/pages/PlayerDetailPage.tsx` — único archivo. Reorganización de JSX dentro del bloque `1012`–cierre de la grilla.

No se crean archivos nuevos en este plan.

---

### Task 1: Esqueleto rail + columna derecha + hero

Reestructura la grilla raíz: rail a la izquierda con la navegación de tabs, columna derecha con hero (perfil | Score GG) arriba y el contenido de la tab debajo. Los extras restantes (Posiciones, timeline, acciones, fixtures, comentarios) se reubican **temporalmente** al final de la columna derecha para no perder nada; se acomodan en tareas siguientes.

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx:1012-1441` (apertura de grilla, sidebar izq, apertura de main/tab area)

**Interfaces:**
- Consumes: variables y JSX ya existentes (`tabs`, `activeTab`, `setActiveTab`, bloques `player-header-card`, `player-score-card`, etc.).
- Produces: nueva estructura de contenedores; el bloque `id="player-tab-content"` y todos los `id` se preservan.

- [ ] **Step 1:** Reemplazar la apertura de la grilla raíz (línea 1012) y el contenedor del sidebar izquierdo (1013-1014) por la nueva estructura flex. Cambiar:

```tsx
      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left sidebar - Player info & Score */}
        <div className="lg:col-span-4 space-y-5">
```

por:

```tsx
      {/* Main content layout: rail izquierdo + columna derecha */}
      <div className="flex flex-col md:flex-row gap-4 lg:gap-6">
        {/* RAIL - navegación de tabs (full-height) */}
        <aside className="shrink-0 md:w-14 xl:w-52">
          <div className="md:sticky md:top-4 flex flex-col gap-3">
            {/* La <nav> de tabs se mueve aquí en el Step siguiente */}
            <div id="rail-tabs-placeholder" />
          </div>
        </aside>

        {/* COLUMNA DERECHA */}
        <div className="flex-1 min-w-0 space-y-4 lg:space-y-6">
          {/* HERO: perfil + Score GG */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 lg:gap-6 items-start">
```

- [ ] **Step 2:** Dejar el bloque `player-header-card` (1016-1220) como primer hijo del hero (perfil). Inmediatamente después del cierre de `player-header-card`, el siguiente hijo del hero debe ser el `player-score-card` (actual 1223-1303). **Quitar** del medio el comentario y mantener ambos como las dos columnas del grid del hero. Cerrar el grid del hero `</div>` justo después del cierre de `player-score-card`.

- [ ] **Step 3:** Cortar el bloque de la navegación de tabs (1394-1438, el `<div className="shrink-0 md:w-12 xl:w-auto"> … </nav></div></div>`) y pegarlo dentro del `<aside>` del rail, reemplazando `<div id="rail-tabs-placeholder" />`. Ajustar el contenedor exterior del nav a vertical full-height:

```tsx
            <nav className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2 flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible">
              {tabs.map((tab, index) => { /* … contenido existente del map sin cambios … */ })}
            </nav>
```

(El `.map` interno y los botones se mantienen tal cual; solo cambia el contenedor de `<div className="shrink-0 …"><div className="md:sticky …"><nav className="flex md:flex-col …">` a este `<nav>` único dentro del `<aside>`.)

- [ ] **Step 4:** El contenedor de contenido `<div className="flex-1 card-apple p-6 min-w-0" id="player-tab-content">` (1440-1441) queda como hijo directo de la columna derecha, **debajo** del hero. Quitar el wrapper intermedio `<div className="lg:col-span-8"><div className="flex flex-col md:flex-row gap-4">` que envolvía main+tabs (ya no aplica). Asegurar que el `id="player-tab-content"` se conserva.

- [ ] **Step 5:** Reubicar **temporalmente** al final de la columna derecha (después del cierre de `player-tab-content`) los bloques que estaban en el sidebar izquierdo y todavía no tienen su lugar definitivo: Posiciones (1305-1314), `ScoreScoutTimeline` (1317), card de acciones (1319-1380), `ManualFixturesEditor` (1382), comentarios (1384-1387). Envolverlos en `<div className="space-y-4">…</div>`. (Se reacomodan en Tasks 2-4.)

- [ ] **Step 6:** Verificar que toda la grilla cierra correctamente (contar `<div>`/`</div>`; el cierre de la grilla raíz que estaba en ~1388/~final debe quedar balanceado).

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: compila sin errores de TypeScript ni de bundle.

- [ ] **Step 8: Chequeo visual**

Run: `npm run dev` → abrir una ficha interna (`/jugador/...`).
Expected: rail de tabs a la izquierda; perfil y Score GG lado a lado arriba; contenido de la tab debajo a todo el ancho; los extras (timeline, acciones, comentarios) visibles al final (aún sin acomodar). Cambiar de tab funciona.

- [ ] **Step 9: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "refactor(ficha): layout rail izq + hero perfil/Score GG (scaffold)"
```

---

### Task 2: Rail responsive + barra de acciones al pie

Pulir el rail: texto visible en desktop (`xl`), solo íconos en tablet (`md`), barra horizontal deslizable en mobile. Mover las acciones (Transfermarkt, Wyscout, AddToReport, Exportar PDF) al pie del rail.

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx` (bloque `<aside>` del rail y card de acciones reubicada en Task 1 Step 5)

**Interfaces:**
- Consumes: `tabs`, `activeTab`, `player.Transfermkt`, `monitoringPlayer?.WyscoutVideo`, `setShowExportModal`, `AddToReportButton`.
- Produces: rail con footer de acciones; la card de acciones original deja de existir como bloque suelto.

- [ ] **Step 1:** En los botones del `.map` de tabs, ajustar la visibilidad del label para el nuevo rail: el label debe verse en `xl` (texto) y ocultarse en `md` (solo ícono, con el tooltip ya existente), y verse en mobile junto al ícono. Confirmar las clases del `<span>` del label:

```tsx
<span className="text-xs font-medium hidden xl:inline whitespace-nowrap">{tab.label}</span>
<span className="text-2xs font-medium md:hidden whitespace-nowrap">{tab.label}</span>
```

(En `md` queda solo ícono + tooltip; en `xl` ícono + texto; en mobile la nav es horizontal con ícono + texto chico.)

- [ ] **Step 2:** Dentro del `<aside>`, debajo del `<nav>` de tabs, agregar el footer de acciones. Mover aquí los `<a>` de Transfermarkt (1333-1345), Wyscout (1346-1359), el `<AddToReportButton …/>` (1360-1368) y el botón Exportar PDF (1369-1379), tomados de la card de acciones reubicada en Task 1. Envolverlos así:

```tsx
            {/* Acciones al pie del rail */}
            <div className="bg-white dark:bg-apple-gray-800 rounded-xl shadow-apple dark:shadow-apple-dark p-1.5 xl:p-2 flex md:flex-col gap-1 mt-auto">
              {/* Transfermarkt, Wyscout, AddToReportButton, Exportar PDF — bloques movidos aquí.
                  En md (solo íconos) ocultar el texto con `hidden xl:inline` en los <span> internos. */}
            </div>
```

- [ ] **Step 3:** En cada acción movida, envolver el texto en `<span className="hidden xl:inline">…</span>` para que en `md` (rail angosto) quede solo el ícono, igual que las tabs. Mantener los `href`, `onClick` y `svg` existentes.

- [ ] **Step 4:** Eliminar la card de acciones vieja (el `<div className="card-apple p-4 space-y-2">`) si quedó vacía tras mover `DobleGWidget`/`TrackingWidget` no — esos dos NO se mueven aquí (van a General en Task 3). Mantener `DobleGWidget` y `TrackingWidget` temporalmente en la zona de extras del final de la columna derecha.

- [ ] **Step 5: Build** — `npm run build` → sin errores.

- [ ] **Step 6: Chequeo visual** — `npm run dev`: en desktop el rail muestra ícono+texto y al pie las acciones con texto; achicando el browser a ~tablet el rail queda solo íconos con tooltip y las acciones solo íconos; a ~mobile la nav de tabs pasa a barra horizontal deslizable. Exportar PDF abre el modal; el PDF sale igual que antes (verificar que `player-detail-container` sigue capturando).

- [ ] **Step 7: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat(ficha): rail responsive (icono/texto) + acciones al pie"
```

---

### Task 3: Reubicar Posiciones, timeline y widgets

Posiciones (`PositionBar`) entra dentro del panel Score GG. `ScoreScoutTimeline`, `DobleGWidget` y `TrackingWidget` pasan a la parte superior de la tab **General**. `ManualFixturesEditor` pasa a la tab **Físico**.

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx` (panel `player-score-card`, tab General `id="tab-content-general"` ~1444, tab Físico `id="tab-content-gps"` ~1956)

**Interfaces:**
- Consumes: `supabaseDetail?.player?.position_distribution`, `selectedPosition`, `setSelectedPosition`, `PositionBar`, `ScoreScoutTimeline`, `DobleGWidget`, `TrackingWidget`, `ManualFixturesEditor`, `needsManualFixtures`, `source`, `apiIdParam`.
- Produces: zona de extras del final de la columna derecha (creada en Task 1) queda vacía y se elimina.

- [ ] **Step 1:** Mover el bloque de Posiciones (el `{supabaseDetail?.player?.position_distribution && (<div className="card-apple p-4"><PositionBar …/></div>)}`) **dentro** del `player-score-card`, justo después del cierre del `<GaugeScore … />` y antes del bloque de "Evaluación Scout". Quitar el wrapper `card-apple p-4` (ya está dentro de la card del Score GG); dejar solo:

```tsx
              {supabaseDetail?.player?.position_distribution && Object.keys(supabaseDetail.player.position_distribution).length > 0 && (
                <div className="mt-4 pt-4 border-t border-apple-gray-100 dark:border-apple-gray-700">
                  <PositionBar
                    distribution={supabaseDetail.player.position_distribution}
                    selectedPosition={selectedPosition ?? supabaseDetail.player.primary_position}
                    onSelectPosition={setSelectedPosition}
                  />
                </div>
              )}
```

- [ ] **Step 2:** Al inicio del contenido de la tab General (dentro de `<div className="space-y-6 animate-fade-in" id="tab-content-general">`, ~1445), agregar `ScoreScoutTimeline` + un bloque de widgets:

```tsx
                <ScoreScoutTimeline playerId={player.id || player.Jugador} playerName={player.Jugador} />
                <div className="card-apple p-4 space-y-2">
                  <DobleGWidget player={player} apiPlayerId={apiIdParam ? Number(apiIdParam) : null} />
                  {source !== 'interno' && (
                    <TrackingWidget
                      playerName={player.Jugador}
                      playerDbId={player.id || null}
                      playerClub={player.Equipo || undefined}
                      playerPosition={player['Posición'] || undefined}
                    />
                  )}
                </div>
```

- [ ] **Step 3:** Mover `{needsManualFixtures && <ManualFixturesEditor playerName={player.Jugador} />}` al inicio del contenido de la tab Físico (`id="tab-content-gps"`, ~1956).

- [ ] **Step 4:** Borrar la zona de extras temporal del final de la columna derecha (creada en Task 1 Step 5) ahora que Posiciones, timeline, widgets y fixtures fueron reubicados. (Comentarios sigue ahí hasta Task 4.)

- [ ] **Step 5: Build** — `npm run build` → sin errores.

- [ ] **Step 6: Chequeo visual** — `npm run dev`: Posiciones aparece dentro del panel Score GG bajo el gauge; la tab General arranca con el timeline y los widgets Doble G/Tracking; la tab Físico muestra el editor de fixtures (si aplica, p. ej. jugador DG sin equipo API).

- [ ] **Step 7: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat(ficha): Posiciones en panel Score GG; timeline/widgets en General; fixtures en Fisico"
```

---

### Task 4: Comentarios en panel deslizable (slide-over)

Los comentarios dejan de ocupar una card fija y pasan a un slide-over que se abre con un botón 💬 en el footer del rail.

**Files:**
- Modify: `src/pages/PlayerDetailPage.tsx` (estado nuevo, botón en footer del rail, slide-over, bloque de comentarios reubicado)

**Interfaces:**
- Consumes: `PlayerComments`, `player`, `useState` (ya importado).
- Produces: estado `showComments`; el slide-over renderiza `<PlayerComments player={player} />`.

- [ ] **Step 1:** Agregar estado junto a los otros `useState` del componente (cerca de `showExportModal`):

```tsx
  const [showComments, setShowComments] = useState(false)
```

- [ ] **Step 2:** En el footer de acciones del rail (Task 2), agregar el botón que abre los comentarios, con el mismo patrón visual que las otras acciones (texto oculto en `md`):

```tsx
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800/50 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700/50 transition-colors group"
                aria-label="Comentarios"
              >
                <span className="hidden xl:inline text-sm text-apple-gray-700 dark:text-apple-gray-300">Comentarios</span>
                <svg className="w-4 h-4 text-apple-gray-400 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
```

- [ ] **Step 3:** Borrar la card de comentarios fija (el `<div className="card-apple p-5"><PlayerComments player={player} /></div>` que quedó en la zona de extras) y agregar el slide-over al final del JSX del componente, antes del cierre del contenedor `player-detail-container` (o junto a los otros modales como `showExportModal`):

```tsx
        {showComments && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowComments(false)} />
            <div className="relative w-full max-w-md h-full bg-white dark:bg-apple-gray-900 shadow-2xl overflow-y-auto animate-slide-in-right">
              <div className="flex items-center justify-between p-4 border-b border-apple-gray-100 dark:border-apple-gray-700">
                <h3 className="font-semibold text-apple-gray-800 dark:text-white">Comentarios</h3>
                <button onClick={() => setShowComments(false)} className="p-1.5 rounded-lg hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" aria-label="Cerrar">
                  <svg className="w-5 h-5 text-apple-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5">
                <PlayerComments player={player} />
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 4:** Si `animate-slide-in-right` no existe en la config de Tailwind/CSS del proyecto, usar `transition` simple o quitar la clase de animación (no es bloqueante). Verificar en `tailwind.config` / `index.css` si hay una animación equivalente y usarla; si no, dejar el panel sin animación.

- [ ] **Step 5: Build** — `npm run build` → sin errores.

- [ ] **Step 6: Chequeo visual** — `npm run dev`: el botón 💬 en el rail abre el panel de comentarios desde la derecha; se cierra con la X o tocando el fondo; agregar/ver comentarios sigue funcionando.

- [ ] **Step 7: Commit**

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "feat(ficha): comentarios en panel deslizable abierto desde el rail"
```

---

### Task 5: QA responsive final + verificación de export PDF

Repaso de los tres breakpoints y confirmación de que el export PDF y el filtrado de tabs internas no se rompieron.

**Files:**
- Modify (solo si hace falta ajustar): `src/pages/PlayerDetailPage.tsx`

- [ ] **Step 1: Build de producción** — `npm run build` → sin errores ni warnings nuevos de TS.

- [ ] **Step 2: Desktop** — `npm run dev`, ancho ≥1280px: rail con ícono+texto, hero perfil|Score GG lado a lado, contenido a todo el ancho. Probar varias tabs (General, Métricas, Físico, Salud, Psicología, Coaching).

- [ ] **Step 3: Tablet** — ancho ~768-1024px: rail solo íconos + tooltips; hero sigue lado a lado o se apila si no entra; sin scroll horizontal roto.

- [ ] **Step 4: Mobile** — ancho ~375px: todo apilado (perfil → Score GG → barra de tabs horizontal deslizable → contenido); acciones accesibles; slide-over de comentarios ocupa la pantalla.

- [ ] **Step 5: Jugador normal (no agencia)** — abrir una ficha de externo no-agencia: solo deben verse las tabs no-`internal` (General, Métricas). Confirmar que no aparecen tabs de agencia.

- [ ] **Step 6: Export PDF** — abrir el modal de exportar y generar el PDF; confirmar que sale igual que antes (los IDs `player-detail-container`/`player-header-card`/`player-score-card` se preservaron).

- [ ] **Step 7:** Si algún breakpoint necesita ajuste (gaps, apilado del hero en `lg`, ancho del rail), corregir con utilidades Tailwind y re-verificar.

- [ ] **Step 8: Commit** (si hubo ajustes)

```bash
git add src/pages/PlayerDetailPage.tsx
git commit -m "fix(ficha): ajustes responsive finales del rediseño de layout"
```

---

## Self-Review (cobertura del spec)

- Rail full-height con texto/íconos/horizontal → Tasks 1, 2, 5. ✓
- Acciones al pie del rail → Task 2. ✓
- Hero perfil | Score GG → Task 1. ✓
- Posiciones dentro del panel Score GG → Task 3. ✓
- Timeline + widgets en General; fixtures en Físico → Task 3. ✓
- Comentarios en slide-over → Task 4. ✓
- Responsive desktop/tablet/mobile → Tasks 2, 5. ✓
- Mismo layout agencia/normales + filtrado de tabs internas → Task 5 Step 5. ✓
- Export PDF intacto (IDs) → Global Constraints + Task 5 Step 6. ✓
