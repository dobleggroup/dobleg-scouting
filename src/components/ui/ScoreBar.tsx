interface ScoreBarProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  posAvg?: number | null
}

function getScoreColor(score: number): { text: string; bg: string; bar: string; glow: string; isElite?: boolean } {
  // 80+ elite green (special), 55-79 green, 35-54 yellow, 20-34 orange, 0-19 red
  if (score >= 80) return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-400/15',
    bar: 'bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-400',
    glow: 'shadow-lg shadow-emerald-400/30',
    isElite: true
  }
  if (score >= 55) return {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    bar: 'bg-gradient-to-r from-emerald-500 to-green-500',
    glow: 'shadow-emerald-500/20'
  }
  if (score >= 35) return {
    text: 'text-amber-500',
    bg: 'bg-amber-500/10',
    bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
    glow: 'shadow-amber-500/20'
  }
  if (score >= 20) return {
    text: 'text-orange-500',
    bg: 'bg-orange-500/10',
    bar: 'bg-gradient-to-r from-orange-500 to-orange-400',
    glow: 'shadow-orange-500/20'
  }
  return {
    text: 'text-red-500',
    bg: 'bg-red-500/10',
    bar: 'bg-gradient-to-r from-red-500 to-red-400',
    glow: 'shadow-red-500/20'
  }
}

// Export for use in other components
export function getScoreColorClass(score: number | null): string {
  if (score === null) return 'text-apple-gray-400'
  if (score >= 80) return 'text-emerald-400'
  if (score >= 55) return 'text-emerald-500'
  if (score >= 35) return 'text-amber-500'
  if (score >= 20) return 'text-orange-500'
  return 'text-red-500'
}

export function getScoreBgClass(score: number | null): string {
  if (score === null) return 'bg-apple-gray-400/10'
  if (score >= 80) return 'bg-emerald-400/20'
  if (score >= 55) return 'bg-emerald-500/15'
  if (score >= 35) return 'bg-amber-500/15'
  if (score >= 20) return 'bg-orange-500/15'
  return 'bg-red-500/15'
}

// Position-relative color: green if score >= posAvg, else degraded scale
export function getRelativeScoreColorClass(score: number | null, posAvg: number | null): string {
  if (score === null) return 'text-apple-gray-400'
  if (score >= 80) return 'text-emerald-400'
  if (posAvg !== null) {
    if (score >= posAvg) return 'text-emerald-500'
    if (score >= posAvg * 0.85) return 'text-amber-500'
    if (score >= posAvg * 0.70) return 'text-orange-500'
    return 'text-red-500'
  }
  return getScoreColorClass(score)
}

export function getRelativeScoreBgClass(score: number | null, posAvg: number | null): string {
  if (score === null) return 'bg-apple-gray-400/10'
  if (score >= 80) return 'bg-emerald-400/20'
  if (posAvg !== null) {
    if (score >= posAvg) return 'bg-emerald-500/15'
    if (score >= posAvg * 0.85) return 'bg-amber-500/15'
    if (score >= posAvg * 0.70) return 'bg-orange-500/15'
    return 'bg-red-500/15'
  }
  return getScoreBgClass(score)
}

export default function ScoreBar({ score, size = 'md', showLabel = true, posAvg }: ScoreBarProps) {
  if (score === null) {
    return <span className="text-apple-gray-400 text-sm">—</span>
  }

  const colors = getScoreColor(score)
  const clampedScore = Math.max(0, Math.min(100, score))
  const isElite = score >= 80

  if (size === 'sm') {
    const textColor = posAvg != null ? getRelativeScoreColorClass(score, posAvg) : colors.text
    return (
      <span className={`font-semibold text-sm tabular-nums ${textColor} ${isElite ? 'drop-shadow-[0_0_4px_rgba(52,211,153,0.5)]' : ''}`}>
        {score.toFixed(1)}
        {isElite && <span className="ml-0.5 text-2xs">★</span>}
      </span>
    )
  }

  if (size === 'lg') {
    return (
      <div className="space-y-3">
        <div className="flex items-end justify-between">
          <span className="text-sm text-apple-gray-500 dark:text-apple-gray-400">Score GG</span>
          <span className={`text-4xl font-bold tabular-nums ${colors.text}`}>
            {score.toFixed(1)}
          </span>
        </div>
        <div className="relative">
          <div className="w-full h-2 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.bar} rounded-full transition-all duration-700 ease-apple shadow-lg ${colors.glow}`}
              style={{ width: `${clampedScore}%` }}
            />
          </div>
          {/* Tick marks */}
          <div className="absolute inset-x-0 top-0 h-2 flex justify-between pointer-events-none">
            <div className="w-px h-full bg-apple-gray-300 dark:bg-apple-gray-600 opacity-50" />
            <div className="w-px h-full bg-apple-gray-300 dark:bg-apple-gray-600 opacity-50" />
            <div className="w-px h-full bg-apple-gray-300 dark:bg-apple-gray-600 opacity-50" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-apple-gray-400">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[110px]">
      {showLabel && (
        <span className={`text-sm font-semibold w-10 text-right tabular-nums ${colors.text}`}>
          {score.toFixed(1)}
        </span>
      )}
      <div className="flex-1 h-1.5 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colors.bar} rounded-full transition-all duration-500 ease-apple`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
    </div>
  )
}
