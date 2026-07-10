interface SparklineProps {
  values: number[]
}

export default function Sparkline({ values }: SparklineProps) {
  if (values.length < 2) return null
  const w = 60
  const h = 18
  const min = Math.min(...values)
  const max = Math.max(...values)
  const rng = max - min || 1
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / rng) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="1.5" />
    </svg>
  )
}
