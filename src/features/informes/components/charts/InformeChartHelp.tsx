import { t, type Lang } from '@/features/informes/i18n'

interface InformeChartHelpProps {
  text: string
  highlights?: string[]
  lang: Lang
}

/** Mini-explicación breve al pie de un gráfico: cómo leerlo + en qué destaca el jugador. */
export default function InformeChartHelp({ text, highlights, lang }: InformeChartHelpProps) {
  return (
    <div
      className="mt-4 rounded-xl px-3 py-2.5 text-xs leading-relaxed"
      style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#8A9099' }}
    >
      <span style={{ color: '#22C55E', fontWeight: 700 }}>{t(lang, 'howToRead')} · </span>
      {text}
      {highlights && highlights.length > 0 && (
        <div className="mt-1.5" style={{ color: '#C3C9D1' }}>
          <span style={{ color: '#8A9099' }}>{t(lang, 'standsOut')}: </span>
          {highlights.join(' · ')}
        </div>
      )}
    </div>
  )
}
