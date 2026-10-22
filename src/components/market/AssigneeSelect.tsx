import { useEffect, useState } from 'react'
import { fetchTeamMembers } from '@/services/marketService'
import { useLanguage } from '@/context/LanguageContext'
import type { TeamMember } from '@/types/market'

/** `members` opcional: en listas con muchas filas (ofrecidos de una búsqueda) se pasa ya cargado para no pedirlo una vez por fila. */
export default function AssigneeSelect({ value, onChange, members: preloaded }: { value: number | null; onChange: (id: number, name: string) => void; members?: TeamMember[] }) {
  const { t } = useLanguage()
  const [fetched, setFetched] = useState<TeamMember[]>([])
  const members = preloaded ?? fetched

  useEffect(() => {
    if (preloaded) return
    fetchTeamMembers().then(setFetched).catch(() => setFetched([]))
  }, [preloaded])

  return (
    <select
      value={value ?? ''}
      onChange={e => {
        const id = Number(e.target.value)
        const member = members.find(m => m.id === id)
        if (member) onChange(member.id, member.name)
      }}
      className="input-apple text-sm w-full"
    >
      <option value="" disabled>{t('mercado.elegirResponsable')}</option>
      {members.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  )
}
