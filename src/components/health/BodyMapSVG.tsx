import React, { useState } from 'react'

export interface InjuryMark {
  zone: string
  severity: 'leve' | 'moderada' | 'grave'
  label?: string
}

interface Zone {
  id: string
  name: string
  view: 'front' | 'back'
  cx: number
  cy: number
  d: string[]
}

const SEVERITY_COLOR: Record<string, string> = {
  leve: '#facc15',
  moderada: '#f97316',
  grave: '#ef4444',
}

// ─── Proportions reference ────────────────────────────────────────────────────
// Coordinate space: 100 × 268 per view
// Shoulders:  x=22–78  (56 wide)
// Waist:      x=31–69  (38 wide)
// Hips:       x=25–75  (50 wide)
// Each thigh: ~17 wide, gap between legs ~14
//   L thigh outer=25, inner=42   R thigh outer=75, inner=58
// Knee:       ~14 wide
// Shin:       ~12 wide

const ZONES: Zone[] = [
  // ── FRONT ──────────────────────────────────────────────────────────────────
  { id: 'cabeza',        name: 'Cabeza',                        view: 'front', cx: 50, cy: 18,
    d: ['M50,4 C43,4 37,10 37,18 C37,26 43,32 50,32 C57,32 63,26 63,18 C63,10 57,4 50,4 Z'] },
  { id: 'cuello_front',  name: 'Cuello',                        view: 'front', cx: 50, cy: 38,
    d: ['M44,32 C43,36 43,40 43,44 C43,46 46,47 50,47 C54,47 57,46 57,44 C57,40 57,36 56,32 Z'] },
  { id: 'hombro_izq',    name: 'Hombro izquierdo',              view: 'front', cx: 20, cy: 55,
    d: ['M22,47 C16,47 10,51 8,57 C6,63 8,71 13,73 C18,75 24,73 26,67 C28,61 26,51 22,47 Z'] },
  { id: 'hombro_der',    name: 'Hombro derecho',                view: 'front', cx: 80, cy: 55,
    d: ['M78,47 C84,47 90,51 92,57 C94,63 92,71 87,73 C82,75 76,73 74,67 C72,61 74,51 78,47 Z'] },
  { id: 'biceps_izq',    name: 'Bíceps izquierdo',              view: 'front', cx: 11, cy: 82,
    d: ['M8,72 C5,76 4,84 5,92 C6,100 10,102 14,100 C18,98 20,90 19,82 C18,74 14,70 10,72 Z'] },
  { id: 'biceps_der',    name: 'Bíceps derecho',                view: 'front', cx: 89, cy: 82,
    d: ['M92,72 C95,76 96,84 95,92 C94,100 90,102 86,100 C82,98 80,90 81,82 C82,74 86,70 90,72 Z'] },
  { id: 'antebrazo_izq', name: 'Antebrazo izquierdo',           view: 'front', cx: 9, cy: 113,
    d: ['M5,102 C3,110 4,122 7,130 C9,136 14,136 17,132 C20,126 20,114 17,104 C14,98 8,98 5,102 Z'] },
  { id: 'antebrazo_der', name: 'Antebrazo derecho',             view: 'front', cx: 91, cy: 113,
    d: ['M95,102 C97,110 96,122 93,130 C91,136 86,136 83,132 C80,126 80,114 83,104 C86,98 92,98 95,102 Z'] },
  { id: 'pectoral_izq',  name: 'Pectoral izquierdo',            view: 'front', cx: 37, cy: 68,
    d: ['M26,56 C24,66 27,74 30,80 C36,84 44,82 48,78 C52,74 52,66 50,60 C48,54 40,52 34,52 C30,52 27,54 26,56 Z'] },
  { id: 'pectoral_der',  name: 'Pectoral derecho',              view: 'front', cx: 63, cy: 68,
    d: ['M74,56 C76,66 73,74 70,80 C64,84 56,82 52,78 C48,74 48,66 50,60 C52,54 60,52 66,52 C70,52 73,54 74,56 Z'] },
  { id: 'abdomen',       name: 'Abdomen',                       view: 'front', cx: 50, cy: 100,
    d: ['M40,82 C38,90 38,102 38,112 C38,120 40,126 44,128 C47,129 50,129 50,129 C50,129 53,129 56,128 C60,126 62,120 62,112 C62,102 62,90 60,82 C56,80 52,80 50,80 C48,80 44,80 40,82 Z'] },
  { id: 'oblicuo_izq',   name: 'Oblicuo izquierdo',             view: 'front', cx: 30, cy: 102,
    d: ['M26,80 C24,90 23,102 24,114 C25,122 28,130 32,132 C34,130 36,122 38,112 C40,102 40,90 38,80 C35,78 29,78 26,80 Z'] },
  { id: 'oblicuo_der',   name: 'Oblicuo derecho',               view: 'front', cx: 70, cy: 102,
    d: ['M74,80 C76,90 77,102 76,114 C75,122 72,130 68,132 C66,130 64,122 62,112 C60,102 60,90 62,80 C65,78 71,78 74,80 Z'] },
  // ── Legs FRONT ─ proportional: outer L=25, inner L=42, gap=16, inner R=58, outer R=75
  { id: 'cuadriceps_izq', name: 'Cuádriceps izquierdo',         view: 'front', cx: 33, cy: 174,
    d: ['M25,152 C23,164 22,180 24,196 C25,204 28,210 33,210 C38,210 42,204 43,194 C44,180 42,164 41,154 C39,148 36,146 33,148 C30,148 27,148 25,152 Z'] },
  { id: 'cuadriceps_der', name: 'Cuádriceps derecho',           view: 'front', cx: 67, cy: 174,
    d: ['M75,152 C77,164 78,180 76,196 C75,204 72,210 67,210 C62,210 58,204 57,194 C56,180 58,164 59,154 C61,148 64,146 67,148 C70,148 73,148 75,152 Z'] },
  { id: 'rodilla_izq',   name: 'Rodilla izquierda',             view: 'front', cx: 33, cy: 213,
    d: ['M23,208 C22,213 23,220 26,222 C29,224 37,224 40,222 C43,220 44,213 43,208 C39,210 36,212 33,212 C30,212 26,210 23,208 Z'] },
  { id: 'rodilla_der',   name: 'Rodilla derecha',               view: 'front', cx: 67, cy: 213,
    d: ['M77,208 C78,213 77,220 74,222 C71,224 63,224 60,222 C57,220 56,213 57,208 C61,210 64,212 67,212 C70,212 74,210 77,208 Z'] },
  { id: 'tibia_izq',     name: 'Tibia / Espinilla izquierda',   view: 'front', cx: 32, cy: 238,
    d: ['M24,224 C23,234 23,246 25,254 C26,260 29,262 33,260 C37,258 39,252 39,242 C39,232 38,224 36,222 C34,222 28,222 26,224 Z'] },
  { id: 'tibia_der',     name: 'Tibia / Espinilla derecha',     view: 'front', cx: 68, cy: 238,
    d: ['M76,224 C77,234 77,246 75,254 C74,260 71,262 67,260 C63,258 61,252 61,242 C61,232 62,224 64,222 C66,222 72,222 74,224 Z'] },

  // ── BACK ───────────────────────────────────────────────────────────────────
  { id: 'cuello_back',      name: 'Cuello (posterior)',          view: 'back',  cx: 50, cy: 38,
    d: ['M44,32 C43,36 43,40 43,44 C43,46 46,47 50,47 C54,47 57,46 57,44 C57,40 57,36 56,32 Z'] },
  { id: 'trapecio',         name: 'Trapecio',                   view: 'back',  cx: 50, cy: 60,
    d: ['M30,47 C26,55 28,63 30,70 C36,74 44,75 50,73 C56,75 64,74 70,70 C72,63 74,55 70,47 C64,51 56,53 50,53 C44,53 36,51 30,47 Z'] },
  { id: 'deltoides_post_izq', name: 'Deltoides posterior izquierdo', view: 'back', cx: 21, cy: 56,
    d: ['M22,47 C16,49 10,53 8,59 C6,65 8,73 13,75 C18,77 24,75 26,69 C28,63 26,53 22,47 Z'] },
  { id: 'deltoides_post_der', name: 'Deltoides posterior derecho',   view: 'back', cx: 79, cy: 56,
    d: ['M78,47 C84,49 90,53 92,59 C94,65 92,73 87,75 C82,77 76,75 74,69 C72,63 74,53 78,47 Z'] },
  { id: 'triceps_izq',      name: 'Tríceps izquierdo',          view: 'back',  cx: 11, cy: 84,
    d: ['M8,74 C5,78 4,86 5,94 C6,102 10,104 14,102 C18,100 20,92 19,84 C18,76 14,72 10,74 Z'] },
  { id: 'triceps_der',      name: 'Tríceps derecho',            view: 'back',  cx: 89, cy: 84,
    d: ['M92,74 C95,78 96,86 95,94 C94,102 90,104 86,102 C82,100 80,92 81,84 C82,76 86,72 90,74 Z'] },
  { id: 'dorsal_izq',       name: 'Dorsal izquierdo',           view: 'back',  cx: 30, cy: 92,
    d: ['M26,72 C22,82 20,96 22,110 C24,120 28,128 34,130 C38,128 40,118 40,106 C40,92 40,80 38,72 C34,70 28,70 26,72 Z'] },
  { id: 'dorsal_der',       name: 'Dorsal derecho',             view: 'back',  cx: 70, cy: 92,
    d: ['M74,72 C78,82 80,96 78,110 C76,120 72,128 66,130 C62,128 60,118 60,106 C60,92 60,80 62,72 C66,70 72,70 74,72 Z'] },
  { id: 'lumbar',           name: 'Zona lumbar',                view: 'back',  cx: 50, cy: 118,
    d: ['M38,106 C37,112 37,120 38,128 C40,134 44,138 50,138 C56,138 60,134 62,128 C63,120 63,112 62,106 C58,104 52,102 50,102 C48,102 42,104 38,106 Z'] },
  { id: 'gluteo_izq',       name: 'Glúteo izquierdo',           view: 'back',  cx: 35, cy: 150,
    d: ['M25,140 C23,148 23,158 27,165 C30,170 36,172 41,170 C46,168 47,160 46,152 C45,144 40,138 35,137 C31,137 27,137 25,140 Z'] },
  { id: 'gluteo_der',       name: 'Glúteo derecho',             view: 'back',  cx: 65, cy: 150,
    d: ['M75,140 C77,148 77,158 73,165 C70,170 64,172 59,170 C54,168 53,160 54,152 C55,144 60,138 65,137 C69,137 73,137 75,140 Z'] },
  // ── Legs BACK ─ same proportions as front
  { id: 'isquio_izq',       name: 'Isquiotibial izquierdo',     view: 'back',  cx: 33, cy: 180,
    d: ['M25,168 C23,178 22,192 24,204 C26,212 29,216 33,214 C38,212 42,204 43,194 C44,182 42,170 39,166 C36,164 30,164 27,166 Z'] },
  { id: 'isquio_der',       name: 'Isquiotibial derecho',       view: 'back',  cx: 67, cy: 180,
    d: ['M75,168 C77,178 78,192 76,204 C74,212 71,216 67,214 C62,212 58,204 57,194 C56,182 58,170 61,166 C64,164 70,164 73,166 Z'] },
  { id: 'gemelo_izq',       name: 'Gemelo izquierdo',           view: 'back',  cx: 32, cy: 234,
    d: ['M25,222 C23,232 23,246 25,254 C27,260 30,262 34,260 C38,258 40,250 40,238 C40,226 38,220 35,218 C32,218 27,218 25,222 Z'] },
  { id: 'gemelo_der',       name: 'Gemelo derecho',             view: 'back',  cx: 68, cy: 234,
    d: ['M75,222 C77,232 77,246 75,254 C73,260 70,262 66,260 C62,258 60,250 60,238 C60,226 62,220 65,218 C68,218 73,218 75,222 Z'] },
]

// ─── Muscle lines ─────────────────────────────────────────────────────────────
const FRONT_MUSCLE_LINES = [
  'M50,47 L50,82',                                  // sternum
  'M44,47 C38,49 30,51 22,51',                      // clavicle L
  'M56,47 C62,49 70,51 78,51',                      // clavicle R
  'M26,58 C32,74 40,82 50,82',                      // pec arc L
  'M74,58 C68,74 60,82 50,82',                      // pec arc R
  'M40,88 Q50,88 60,88',                            // abs row 1
  'M39,96 Q50,96 61,96',                            // abs row 2
  'M40,104 Q50,104 60,104',                         // abs row 3
  'M41,112 Q50,112 59,112',                         // abs row 4
  'M50,82 L50,130',                                 // linea alba
  'M32,140 C38,148 44,152 50,150',                  // hip crease L
  'M68,140 C62,148 56,152 50,150',                  // hip crease R
  'M25,196 C27,204 30,208 33,212',                  // VMO L
  'M75,196 C73,204 70,208 67,212',                  // VMO R
  'M8,80 C10,76 14,74 17,78',                       // bicep peak L
  'M92,80 C90,76 86,74 83,78',                      // bicep peak R
  'M14,58 C16,62 18,68 18,74',                      // deltoid L
  'M86,58 C84,62 82,68 82,74',                      // deltoid R
]

const BACK_MUSCLE_LINES = [
  'M50,47 L50,140',                                 // spine
  'M44,47 C40,53 32,60 28,70',                      // trap L
  'M56,47 C60,53 68,60 72,70',                      // trap R
  'M28,70 C36,74 44,75 50,73',                      // trap bottom L
  'M72,70 C64,74 56,75 50,73',                      // trap bottom R
  'M30,75 C32,86 34,96 32,106',                     // scapula L
  'M70,75 C68,86 66,96 68,106',                     // scapula R
  'M30,84 L40,90',                                  // infraspinatus L
  'M70,84 L60,90',                                  // infraspinatus R
  'M50,138 L50,170',                                // glute division
  'M25,162 C30,168 39,172 46,170',                  // glute crease L
  'M75,162 C70,168 61,172 54,170',                  // glute crease R
  'M26,200 C28,206 31,210 34,214',                  // hamstring sep L
  'M74,200 C72,206 69,210 66,214',                  // hamstring sep R
  'M25,228 C27,234 31,236 33,240',                  // calf sep L
  'M75,228 C73,234 69,236 67,240',                  // calf sep R
  'M14,60 C16,66 18,72 18,78',                      // rear delt L
  'M86,60 C84,66 82,72 82,78',                      // rear delt R
]

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  injuries?: InjuryMark[]
  onZoneClick?: (zoneId: string) => void
  interactive?: boolean
  className?: string
}

export default function BodyMapSVG({
  injuries = [],
  onZoneClick,
  interactive = false,
  className = '',
}: Props) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null)
  const injuryMap = new Map(injuries.map(i => [i.zone, i]))

  function handleMouseEnter(zone: Zone, evt: React.MouseEvent<SVGElement>) {
    setHoveredZone(zone.id)
    const rect = (evt.currentTarget.closest('svg') as SVGSVGElement).getBoundingClientRect()
    setTooltip({ x: evt.clientX - rect.left, y: evt.clientY - rect.top - 12, label: zone.name })
  }
  function handleMouseLeave() { setHoveredZone(null); setTooltip(null) }
  function handleClick(zone: Zone) { if (interactive && onZoneClick) onZoneClick(zone.id) }

  function renderView(view: 'front' | 'back', xOffset: number) {
    const muscleLines = view === 'front' ? FRONT_MUSCLE_LINES : BACK_MUSCLE_LINES
    const zones = ZONES.filter(z => z.view === view)

    return (
      <g transform={`translate(${xOffset}, 0)`}>
        {/* ── Head ── */}
        <ellipse cx="37" cy="18" rx="3" ry="4"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500" strokeWidth="0.6" />
        <ellipse cx="63" cy="18" rx="3" ry="4"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500" strokeWidth="0.6" />
        <ellipse cx="50" cy="18" rx="14" ry="16"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500" strokeWidth="0.8" />

        {/* ── Neck ── */}
        <path d="M44,31 L43,47 L57,47 L56,31 Z"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="0.6" strokeLinejoin="round" />

        {/* ── Left arm ── */}
        <path d="M22,47 C15,49 8,55 6,63 L4,76 L4,108 L8,134 C10,139 15,141 19,139 L21,135 L21,108 L21,76 L21,61 Z"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="0.8" strokeLinejoin="round" />
        {/* ── Right arm ── */}
        <path d="M78,47 C85,49 92,55 94,63 L96,76 L96,108 L92,134 C90,139 85,141 81,139 L79,135 L79,108 L79,76 L79,61 Z"
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="0.8" strokeLinejoin="round" />

        {/* ── Torso + legs (single path with proper proportions) ──
             Key measurements:
               Shoulders   x=22–78 (56w)
               Waist       x=31–69 (38w) at y≈118
               Hips        x=25–75 (50w) at y≈140
               L thigh     x=25–42 (17w) · R thigh x=58–75 (17w) · gap=16
               Knee        ~14w
               Shin        ~12w
        */}
        <path
          d={`
            M22,47
            L22,80
            Q25,102 31,118
            Q27,130 25,140
            Q24,146 25,152
            L24,188
            Q23,202 26,210
            L26,220
            L27,256
            Q27,262 31,265
            L39,265
            Q41,265 41,261
            L39,222
            Q39,214 40,210
            L41,188
            Q41,160 42,152
            Q45,145 50,143
            Q55,145 58,152
            Q59,160 59,188
            L60,210
            Q61,214 61,222
            L59,261
            Q59,265 61,265
            L69,265
            Q73,265 73,262
            L74,256
            L74,220
            Q77,210 74,202
            Q76,196 75,188
            L75,152
            Q76,146 75,140
            Q73,130 69,118
            Q75,102 78,80
            L78,47
            Z
          `}
          className="fill-slate-200 dark:fill-slate-600 stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="0.8" strokeLinejoin="round"
        />

        {/* ── Muscle definition lines ── */}
        <g className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="0.55"
          fill="none" strokeLinecap="round">
          {muscleLines.map((d, i) => <path key={i} d={d} />)}
        </g>

        {/* ── Interactive zone overlays ── */}
        {zones.map(zone => {
          const isHovered = hoveredZone === zone.id
          const injury = injuryMap.get(zone.id)
          const isInjured = !!injury
          return (
            <g key={zone.id}
              onMouseEnter={e => handleMouseEnter(zone, e)}
              onMouseLeave={handleMouseLeave}
              onClick={() => handleClick(zone)}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
            >
              {zone.d.map((d, i) => (
                <path key={i} d={d}
                  fill={isInjured ? SEVERITY_COLOR[injury.severity]
                    : isHovered && interactive ? 'rgba(99,102,241,0.18)' : 'transparent'}
                  className={isHovered && interactive
                    ? 'stroke-indigo-400 dark:stroke-indigo-300' : 'stroke-transparent'}
                  strokeWidth={isHovered && interactive ? '1' : '0'}
                  fillOpacity={isInjured ? 0.38 : 1}
                  style={{ transition: 'fill 0.15s, opacity 0.15s' }}
                />
              ))}
              {isInjured && (
                <circle cx={zone.cx} cy={zone.cy} r="4.5"
                  fill={SEVERITY_COLOR[injury.severity]}
                  stroke="white" strokeWidth="1.2"
                  style={{ filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.3))' }}
                />
              )}
            </g>
          )
        })}

        {/* View label */}
        <text x="50" y="276" textAnchor="middle"
          className="fill-slate-400 dark:fill-slate-500"
          fontSize="6.5" fontWeight="600" letterSpacing="1.5"
          style={{ fontFamily: 'system-ui, sans-serif' }}>
          {view === 'front' ? 'FRENTE' : 'ESPALDA'}
        </text>
      </g>
    )
  }

  return (
    <div className={`relative select-none ${className}`}>
      <svg viewBox="0 0 220 282" className="w-full max-w-xs mx-auto h-auto"
        style={{ overflow: 'visible' }} xmlns="http://www.w3.org/2000/svg">

        {renderView('front', 5)}

        <line x1="110" y1="8" x2="110" y2="268"
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth="0.8" strokeDasharray="3,3" />

        {renderView('back', 115)}

        {tooltip && (
          <foreignObject
            x={Math.min(tooltip.x - 40, 140)}
            y={Math.max(tooltip.y - 30, 0)}
            width="90" height="28"
            style={{ overflow: 'visible', pointerEvents: 'none' }}
          >
            <div style={{
              background: 'rgba(15,23,42,0.92)', color: '#f8fafc',
              fontSize: '9px', fontWeight: 600, padding: '4px 8px',
              borderRadius: '6px', whiteSpace: 'nowrap',
              fontFamily: 'system-ui, sans-serif',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)', lineHeight: '1.3',
            }}>
              {tooltip.label}
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  )
}
