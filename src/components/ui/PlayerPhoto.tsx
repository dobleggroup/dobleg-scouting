import { useState } from 'react'

const sizes = {
  xs: 'w-5 h-5',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-20 h-20',
  xl: 'w-[104px] h-[104px]',
} as const

const roundedMap = {
  full: 'rounded-full',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  lg: 'rounded-lg',
} as const

export function PlayerPhoto({ src, name, size = 'md', className = '', rounded = 'full' }: {
  src?: string | null
  name?: string
  size?: keyof typeof sizes
  className?: string
  rounded?: 'full' | 'xl' | '2xl' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const s = sizes[size]
  const r = roundedMap[rounded]

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? ''}
        className={`${s} ${r} object-cover bg-apple-gray-100 dark:bg-apple-gray-800 flex-shrink-0 ${className}`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div className={`${s} ${r} bg-apple-gray-200 dark:bg-apple-gray-700 flex items-center justify-center flex-shrink-0 ${className}`}>
      <svg viewBox="0 0 36 36" className="w-[60%] h-[60%] text-apple-gray-400 dark:text-apple-gray-500">
        <circle cx="18" cy="13" r="6" fill="currentColor" />
        <path d="M6 34c0-7.732 5.373-14 12-14s12 6.268 12 14" fill="currentColor" />
      </svg>
    </div>
  )
}

export function TeamLogo({ src, className = 'w-5 h-5' }: { src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) return null

  return (
    <img
      src={src}
      alt=""
      className={`object-contain flex-shrink-0 ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
