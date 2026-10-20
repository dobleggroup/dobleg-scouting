import type { ReactNode } from 'react'
import type { Conclusion } from '../conclusions'

const TONE = {
  positive: { box: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200', icon: '▲', iconCls: 'text-emerald-600 dark:text-emerald-400' },
  negative: { box: 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200', icon: '▼', iconCls: 'text-red-600 dark:text-red-400' },
  neutral: { box: 'bg-apple-gray-50 dark:bg-apple-gray-700/40 text-apple-gray-700 dark:text-apple-gray-200', icon: '•', iconCls: 'text-apple-gray-400' },
} as const

/** Frases de conclusión con su color. `who` antepone el nombre (para listas de toda la agencia). */
export default function ConclusionList({ items, who, empty }: {
  items: Array<Conclusion & { who?: string; onClick?: () => void; lead?: ReactNode }>
  who?: boolean
  empty?: string
}) {
  if (!items.length) {
    return <p className="text-sm text-apple-gray-400 dark:text-apple-gray-500">{empty ?? 'Todavía no hay datos suficientes para sacar conclusiones claras.'}</p>
  }
  return (
    <ul className="space-y-2">
      {items.map((c, i) => {
        const t = TONE[c.tone]
        const Tag = c.onClick ? 'button' : 'div'
        return (
          <li key={i}>
            <Tag
              onClick={c.onClick}
              className={`w-full text-left flex gap-2.5 px-3 py-2.5 rounded-apple text-sm leading-snug ${t.box} ${c.onClick ? 'hover:brightness-95 dark:hover:brightness-110 transition' : ''}`}
            >
              <span className={`shrink-0 text-xs mt-0.5 ${t.iconCls}`}>{t.icon}</span>
              {c.lead && <span className="shrink-0">{c.lead}</span>}
              <span>
                {who && c.who && <span className="font-semibold">{c.who}. </span>}
                {c.text}
              </span>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
