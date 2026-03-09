import { useEffect, useState } from 'react'

interface GaugeScoreProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  animated?: boolean
  comparisonScore?: number | null  // e.g., league average
  comparisonLabel?: string
}

// Get color based on score ranges
function getScoreColor(score: number): string {
  if (score >= 80) return '#10B981'  // emerald-500 - Elite
  if (score >= 65) return '#22C55E'  // green-500 - Muy bueno
  if (score >= 50) return '#84CC16'  // lime-500 - Bueno
  if (score >= 35) return '#EAB308'  // yellow-500 - Promedio
  if (score >= 20) return '#F97316'  // orange-500 - Bajo
  return '#EF4444'                   // red-500 - Crítico
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Elite'
  if (score >= 65) return 'Muy Bueno'
  if (score >= 50) return 'Bueno'
  if (score >= 35) return 'Promedio'
  if (score >= 20) return 'Bajo'
  return 'Crítico'
}

function getScoreDescription(score: number): string {
  if (score >= 80) return 'Rendimiento excepcional'
  if (score >= 65) return 'Rendimiento destacado'
  if (score >= 50) return 'Rendimiento sólido'
  if (score >= 35) return 'Rendimiento regular'
  if (score >= 20) return 'Necesita mejorar'
  return 'Rendimiento bajo'
}

// SVG arc path helper
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, startDeg)
  const end = polarToCartesian(cx, cy, r, endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
}

export default function GaugeScore({
  score,
  size = 'lg',
  showLabel = true,
  animated = true,
  comparisonScore,
  comparisonLabel = 'Promedio'
}: GaugeScoreProps) {
  const [displayValue, setDisplayValue] = useState(animated ? 0 : (score ?? 0))

  useEffect(() => {
    if (!animated || score === null) {
      setDisplayValue(score ?? 0)
      return
    }

    const duration = 1200
    const startTime = Date.now()
    const startValue = 0
    const endValue = score

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Easing: ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(startValue + (endValue - startValue) * eased)

      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }, [score, animated])

  if (score === null) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-apple-gray-400">
        <svg className="w-12 h-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">Sin datos suficientes</p>
      </div>
    )
  }

  const clampedValue = Math.max(0, Math.min(100, displayValue))
  const color = getScoreColor(score)
  const label = getScoreLabel(score)
  const description = getScoreDescription(score)

  // Gauge dimensions based on size - cy positioned to leave room for score below arc
  const config = {
    sm: { width: 160, height: 145, cx: 80, cy: 70, r: 48, strokeW: 7, fontSize: 20, labelSize: 10 },
    md: { width: 220, height: 195, cx: 110, cy: 90, r: 62, strokeW: 9, fontSize: 28, labelSize: 12 },
    lg: { width: 280, height: 260, cx: 140, cy: 105, r: 78, strokeW: 9, fontSize: 40, labelSize: 14 },
  }

  const { width, height, cx, cy, r, strokeW, fontSize, labelSize } = config[size]
  const startDeg = 135
  const endDeg = 405
  const valueDeg = startDeg + (clampedValue / 100) * 270

  // Comparison needle angle
  const comparisonDeg = comparisonScore !== null && comparisonScore !== undefined
    ? startDeg + (Math.max(0, Math.min(100, comparisonScore)) / 100) * 270
    : null

  // Color gradient zones (very subtle background)
  const zones = [
    { start: 0, end: 20, color: '#EF4444' },
    { start: 20, end: 35, color: '#F97316' },
    { start: 35, end: 50, color: '#EAB308' },
    { start: 50, end: 65, color: '#84CC16' },
    { start: 65, end: 80, color: '#22C55E' },
    { start: 80, end: 100, color: '#10B981' },
  ]

  return (
    <div className="flex flex-col items-center w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxWidth: `${width}px` }}
      >
        <defs>
          {/* Glow filter for the active arc */}
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Gradient for the active arc */}
          <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.8" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>

          {/* Inner shadow for depth */}
          <filter id="inner-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feOffset dx="0" dy="2" />
            <feGaussianBlur stdDeviation="3" result="offset-blur" />
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
            <feFlood floodColor="black" floodOpacity="0.15" result="color" />
            <feComposite operator="in" in="color" in2="inverse" result="shadow" />
            <feComposite operator="over" in="shadow" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* Background circle decoration */}
        <circle
          cx={cx}
          cy={cy}
          r={r + strokeW + 8}
          fill="none"
          className="stroke-apple-gray-100 dark:stroke-apple-gray-800"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.5"
        />

        {/* Colored zone backgrounds (very subtle) */}
        {zones.map((zone, i) => {
          const zoneStartDeg = startDeg + (zone.start / 100) * 270
          const zoneEndDeg = startDeg + (zone.end / 100) * 270
          return (
            <path
              key={i}
              d={arcPath(cx, cy, r, zoneStartDeg, zoneEndDeg)}
              stroke={zone.color}
              strokeWidth={strokeW + 20}
              fill="none"
              strokeLinecap="butt"
              opacity={0.06}
            />
          )
        })}

        {/* Main track (background arc) */}
        <path
          d={arcPath(cx, cy, r, startDeg, endDeg)}
          className="stroke-apple-gray-200 dark:stroke-apple-gray-700"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
          filter="url(#inner-shadow)"
        />

        {/* Value arc (animated) */}
        {clampedValue > 0 && (
          <path
            d={arcPath(cx, cy, r, startDeg, valueDeg)}
            stroke={color}
            strokeWidth={strokeW}
            fill="none"
            strokeLinecap="round"
            style={{
              filter: 'url(#gauge-glow)',
              transition: animated ? 'none' : 'd 0.5s ease-out',
            }}
          />
        )}

        {/* Tick marks with labels */}
        {[0, 25, 50, 75, 100].map(v => {
          const deg = startDeg + (v / 100) * 270
          const inner = polarToCartesian(cx, cy, r + strokeW / 2 + 4, deg)
          const outer = polarToCartesian(cx, cy, r + strokeW / 2 + 12, deg)
          const labelPos = polarToCartesian(cx, cy, r + strokeW / 2 + 24, deg)
          return (
            <g key={v}>
              <line
                x1={inner.x.toFixed(2)}
                y1={inner.y.toFixed(2)}
                x2={outer.x.toFixed(2)}
                y2={outer.y.toFixed(2)}
                className="stroke-apple-gray-300 dark:stroke-apple-gray-600"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-apple-gray-400 dark:fill-apple-gray-500"
                fontSize={size === 'lg' ? 12 : 9}
                fontWeight="500"
              >
                {v}
              </text>
            </g>
          )
        })}

        {/* Comparison marker (if provided) */}
        {comparisonDeg !== null && (
          <>
            {/* Comparison line */}
            {(() => {
              const compInner = polarToCartesian(cx, cy, r - strokeW / 2 - 6, comparisonDeg)
              const compOuter = polarToCartesian(cx, cy, r + strokeW / 2 + 6, comparisonDeg)
              return (
                <line
                  x1={compInner.x}
                  y1={compInner.y}
                  x2={compOuter.x}
                  y2={compOuter.y}
                  stroke="#6B7280"
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.8}
                />
              )
            })()}
          </>
        )}

        {/* Center decorative elements */}
        <circle
          cx={cx}
          cy={cy}
          r={size === 'lg' ? 18 : size === 'md' ? 14 : 10}
          className="fill-apple-gray-100 dark:fill-apple-gray-800"
        />
        <circle
          cx={cx}
          cy={cy}
          r={size === 'lg' ? 14 : size === 'md' ? 10 : 7}
          className="fill-white dark:fill-apple-gray-900"
          style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
        />

        {/* Needle */}
        {(() => {
          const needleAngle = startDeg + (clampedValue / 100) * 270
          const needleRad = ((needleAngle - 90) * Math.PI) / 180
          const needleLen = r - (size === 'lg' ? 15 : 10)

          const needleTip = {
            x: cx + needleLen * Math.cos(needleRad),
            y: cy + needleLen * Math.sin(needleRad),
          }

          const baseRadius = size === 'lg' ? 6 : 4
          const baseAngle1 = needleRad + Math.PI / 2
          const baseAngle2 = needleRad - Math.PI / 2
          const base1 = {
            x: cx + baseRadius * Math.cos(baseAngle1),
            y: cy + baseRadius * Math.sin(baseAngle1),
          }
          const base2 = {
            x: cx + baseRadius * Math.cos(baseAngle2),
            y: cy + baseRadius * Math.sin(baseAngle2),
          }

          return (
            <>
              <polygon
                points={`${needleTip.x.toFixed(2)},${needleTip.y.toFixed(2)} ${base1.x.toFixed(2)},${base1.y.toFixed(2)} ${base2.x.toFixed(2)},${base2.y.toFixed(2)}`}
                fill={color}
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
              />
              <circle cx={cx} cy={cy} r={size === 'lg' ? 6 : 4} fill={color} />
              <circle cx={cx} cy={cy} r={size === 'lg' ? 3 : 2} fill="white" opacity="0.5" />
            </>
          )
        })()}

        {/* Score value display */}
        <text
          x={cx}
          y={cy + r + (size === 'lg' ? 50 : size === 'md' ? 40 : 32)}
          textAnchor="middle"
          fontSize={fontSize}
          fontWeight="800"
          fill={color}
          className="tabular-nums"
          style={{
            fontFamily: 'SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif',
            letterSpacing: '-0.03em',
          }}
        >
          {Math.round(displayValue)}
        </text>
      </svg>

      {/* Labels below the gauge */}
      {showLabel && size !== 'sm' && (
        <div className="flex flex-col items-center mt-2 text-center">
          {/* Quality label badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-2"
            style={{ backgroundColor: `${color}15` }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span
              className="text-sm font-bold uppercase tracking-wider"
              style={{ color }}
            >
              {label}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400">
            {description}
          </p>

          {/* Comparison indicator */}
          {comparisonScore !== null && comparisonScore !== undefined && (
            <div className="mt-3 flex items-center gap-2 text-xs text-apple-gray-400">
              <div className="w-3 h-0.5 bg-gray-500 rounded" />
              <span>{comparisonLabel}: {comparisonScore.toFixed(1)}</span>
              {score > comparisonScore ? (
                <span className="text-emerald-500 font-medium">
                  (+{(score - comparisonScore).toFixed(1)})
                </span>
              ) : score < comparisonScore ? (
                <span className="text-orange-500 font-medium">
                  ({(score - comparisonScore).toFixed(1)})
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mini version for tables/lists
export function GaugeScoreMini({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="text-apple-gray-400 text-sm">—</span>
  }

  const color = getScoreColor(score)
  const label = getScoreLabel(score)

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-10 h-10 flex items-center justify-center"
      >
        <svg viewBox="0 0 40 40" className="w-full h-full">
          {/* Background circle */}
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            className="stroke-apple-gray-200 dark:stroke-apple-gray-700"
            strokeWidth="4"
          />
          {/* Progress arc */}
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 100.53} 100.53`}
            transform="rotate(-90 20 20)"
            style={{ transition: 'stroke-dasharray 0.5s ease-out' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums"
          style={{ color }}
        >
          {Math.round(score)}
        </span>
      </div>
      <span
        className="text-2xs font-semibold uppercase tracking-wide"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  )
}
