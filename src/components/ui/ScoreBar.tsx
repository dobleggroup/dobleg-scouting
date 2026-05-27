export type ScoreScale = '100' | '10'

interface ScoreBarProps {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  posAvg?: number | null
  scale?: ScoreScale
}

function threshold(val100: number, scale: ScoreScale): number {
  return scale === '10' ? val100 / 10 : val100
}

function getScoreColor(score: number, scale: ScoreScale = '100'): { text: string; bg: string; bar: string; glow: string; isElite?: boolean } {
  if (score >= threshold(80, scale)) return {
    text: 'text-emerald-400',
    bg: 'bg-emerald-400/15',
    bar: 'bg-gradient-to-r from-emerald-400 via-green-300 to-emerald-400',
    glow: 'shadow-lg shadow-emerald-400/30',
    isElite: true
  }
  if (score >= threshold(55, scale)) return {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    bar: 'bg-gradient-to-r from-emerald-500 to-green-500',
    glow: 'shadow-emerald-500/20'
  }
  if (score >= threshold(35, scale)) return {
    text: 'text-amber-500',
    bg: 'bg-amber-500/10',
    bar: 'bg-gradient-to-r from-amber-500 to-yellow-400',
    glow: 'shadow-amber-500/20'
  }
  if (score >= threshold(20, scale)) return {
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

export function getScoreColorClass(score: number | null, scale: ScoreScale = '100'): string {
  if (score === null) return 'text-apple-gray-400'
  if (score >= threshold(80, scale)) return 'text-emerald-400'
  if (score >= threshold(55, scale)) return 'text-emerald-500'
  if (score >= threshold(35, scale)) return 'text-amber-500'
  if (score >= threshold(20, scale)) return 'text-orange-500'
  return 'text-red-500'
}

export function getScoreBgClass(score: number | null, scale: ScoreScale = '100'): string {
  if (score === null) return 'bg-apple-gray-400/10'
  if (score >= threshold(80, scale)) return 'bg-emerald-400/20'
  if (score >= threshold(55, scale)) return 'bg-emerald-500/15'
  if (score >= threshold(35, scale)) return 'bg-amber-500/15'
  if (score >= threshold(20, scale)) return 'bg-orange-500/15'
  return 'bg-red-500/15'
}

export function getRelativeScoreColorClass(score: number | null, posAvg: number | null, scale: ScoreScale = '100'): string {
  if (score === null) return 'text-apple-gray-400'
  if (score >= threshold(80, scale)) return 'text-emerald-400'
  if (posAvg !== null) {
    const avg = scale === '10' && posAvg > 10 ? posAvg / 10 : posAvg
    if (score >= avg) return 'text-emerald-500'
    if (score >= avg * 0.85) return 'text-amber-500'
    if (score >= avg * 0.70) return 'text-orange-500'
    return 'text-red-500'
  }
  return getScoreColorClass(score, scale)
}

export function getRelativeScoreBgClass(score: number | null, posAvg: number | null, scale: ScoreScale = '100'): string {
  if (score === null) return 'bg-apple-gray-400/10'
  if (score >= threshold(80, scale)) return 'bg-emerald-400/20'
  if (posAvg !== null) {
    const avg = scale === '10' && posAvg > 10 ? posAvg / 10 : posAvg
    if (score >= avg) return 'bg-emerald-500/15'
    if (score >= avg * 0.85) return 'bg-amber-500/15'
    if (score >= avg * 0.70) return 'bg-orange-500/15'
    return 'bg-red-500/15'
  }
  return getScoreBgClass(score, scale)
}

export default function ScoreBar({ score, size = 'md', showLabel = true, posAvg, scale = '100' }: ScoreBarProps) {
  if (score === null) {
    return <span className="text-apple-gray-400 text-sm">—</span>
  }

  const colors = getScoreColor(score, scale)
  const pct = scale === '10' ? ((score - 1) / 9) * 100 : score
  const clampedScore = Math.max(0, Math.min(100, pct))
  const isElite = score >= threshold(80, scale)

  if (size === 'sm') {
    const textColor = posAvg != null ? getRelativeScoreColorClass(score, posAvg, scale) : colors.text
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
          <span>{scale === '10' ? '1' : '0'}</span>
          <span>{scale === '10' ? '5' : '50'}</span>
          <span>{scale === '10' ? '10' : '100'}</span>
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
