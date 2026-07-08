# Fase 1 — Base mobile + adaptar cada página (lista para Capacitor)

**Fecha:** 2026-07-08
**Estado:** Diseño aprobado, pendiente de revisión final del usuario
**Autor:** Marcos + Claude

## Contexto y objetivo

La plataforma de scouting (Scout Platform / Doble G, React 18 + Vite 7 + Tailwind)
hoy funciona bien en desktop y tiene soporte mobile parcial (navbar con drawer,
panel de filtros mobile, algunas tablas responsive). El objetivo a futuro es que
sea una **app publicada en Google Play y App Store** (vía **Capacitor**, decidido
con el usuario — no TWA, no reescribir en React Native), centrada en una
experiencia para los dueños de la agencia (inicio con partidos de hoy,
notificaciones de gol/asistencia).

Ese objetivo se divide en fases independientes:

- **Fase 1 (este spec):** convertir cada página a mobile, prolijo y estético, y
  dejar los cimientos listos para envolver con Capacitor. Sin romper nada del
  desktop actual.
- **Fase 2 (futuro):** Inicio de dueños (partidos de hoy / quién juega / resultados).
- **Fase 3 (futuro):** notificaciones push nativas (gol / asistencia / arranque).

Capacitor entra como paso posterior a la Fase 1 (envuelve el mismo código). El
usuario ya tiene cuentas de Apple Developer y Google Play y una Mac del trabajo,
así que la publicación no tiene bloqueos operativos.

## No-objetivos (fuera de alcance de la Fase 1)

- No es un rediseño: se mantiene la estética actual (grises Apple + verde Doble G).
- No se toca el layout de desktop — debe quedar visualmente idéntico a hoy.
- No incluye Inicio de dueños, notificaciones, ni el setup de Capacitor (fases siguientes).
- No se agregan features nuevas de datos; es adaptación de UI.

## Arquitectura de la Fase 1

### 1. Cimientos mobile (Capacitor-ready)

- **Safe-area:** respetar notch y barra inferior con `env(safe-area-inset-*)` en
  barra superior, drawer y contenido. `viewport-fit=cover` en el meta viewport.
- **Viewport / gestos:** meta viewport correcto, sin zoom accidental, sin
  overscroll raro, `touch-action` afinado. **Nunca scroll horizontal** en ninguna
  página (contenedores anchos scrollean dentro de su propio contenedor).
- **Objetivos táctiles:** mínimo 44×44px en todo lo tocable.
- **Rutas de assets relativas** para que ande dentro del contexto de Capacitor.
- **Estética intacta:** se reusan los tokens actuales (apple-gray, brand-green).

### 2. Navegación

Conviven dos mecanismos:

**a) Menú hamburguesa (existente, pulido).** Se mantiene el patrón actual
(barra superior + panel deslizable) con TODAS las páginas. Mejoras: cerrar
deslizando, resaltado de ruta activa, animación suave, targets grandes, respeto
del safe-area.

**b) Barra inferior "liquid glass" (nueva).** Barra flotante, translúcida (vidrio
esmerilado: `backdrop-blur`, translucidez, borde/brillo sutil, esquinas
redondeadas tipo píldora), fija abajo, respetando safe-area. Cinco destinos
principales:

| Botón | Ruta |
|---|---|
| Inicio | `/` |
| Calendario | `/calendario` |
| Jugadores | `/interno` |
| Seguimiento | `/seguimiento-gg` |
| Reporte | `/evaluar` |

- **Auto-ocultar:** se esconde (se desliza hacia abajo) al scrollear hacia abajo;
  reaparece al frenar el scroll o scrollear hacia arriba. Implementado con un
  listener de dirección de scroll + `transform: translateY`. Respeta
  `prefers-reduced-motion` (sin animación → sólo aparece/desaparece).
- **Sólo mobile:** visible en viewports chicos; oculta en desktop (`lg:hidden`).
- **Estado activo:** resalta el destino de la ruta actual.
- No reemplaza al hamburguesa; es adicional para acceso rápido con el pulgar.

### 3. Piezas mobile reutilizables

El set compartido que después se aplica a todas las páginas (enfoque A):

- **Tabla → tarjetas:** en mobile, las listas de jugadores (y similares) se
  renderizan como tarjetas tocables; en desktop siguen siendo tabla, igual que hoy.
  Se estandariza sobre lo que `PlayerTable` ya hace parcialmente.
- **Filtros → panel deslizable inferior (bottom sheet):** se estandariza el
  `MobileFilterPanel` existente como patrón único para páginas con filtros.
- **Modal → pantalla completa en mobile:** los modales se vuelven hojas de alto
  completo con manija para deslizar/cerrar; en desktop siguen como modal centrado.
- **Contenedor de página:** paddings, headers y scroll consistentes en mobile.
- **Gráficos responsive:** radar/dispersión/barras entran bien y scrollean dentro
  de su contenedor cuando hace falta.

### 4. Orden de adaptación de páginas

Por rondas, de lo más usado a lo menos; cada ronda probada antes de seguir:

1. **Ronda 1 (núcleo diario):** Inicio, Scout Externo, Scout Interno, Ficha de jugador.
2. **Ronda 2 (agencia):** Seguimiento (GG y Datos), Oportunidades, Informes, Reporte/Evaluar.
3. **Ronda 3 (análisis):** Comparación, Radar/Detector, Dispersión, Formación, Similares.
4. **Ronda 4 (resto):** Evaluaciones, Calendario, Análisis Completo, Trabajos, Panel Interno.

(La barra inferior toca páginas de varias rondas — su navegación se implementa en
los cimientos, independientemente del orden de adaptación de cada página.)

### 5. Garantía de no romper nada + verificación

- **Mobile-first con clases responsive:** los estilos base son mobile; el desktop
  se preserva bajo `md:`/`lg:`. El desktop debe quedar idéntico por diseño.
- **Verificación por página:** `npm run build` en verde + control visual a 390px
  (mobile) y a ancho de desktop (captura con las herramientas de navegador).
- **Commits por ronda:** nada se sube si rompe el build. Cada ronda es su(s)
  propio(s) commit(s).

## Criterios de éxito

- Cada página es usable, prolija y estética en mobile (390px) sin scroll horizontal.
- El desktop queda visualmente idéntico a hoy.
- La barra inferior liquid glass funciona (auto-ocultar, 5 destinos, estado activo)
  y convive con el hamburguesa.
- El build compila sin errores en todo momento.
- Los cimientos quedan listos para envolver con Capacitor sin retrabajo.

## Riesgos y notas

- **Consistencia:** mitigada por el enfoque A (piezas compartidas primero).
- **Regresión de desktop:** mitigada por mobile-first + control visual a ambos anchos.
- **Aprobación en tiendas:** es tema de Fase 2/3 (Capacitor + features nativas);
  la Fase 1 sólo deja el terreno listo.
