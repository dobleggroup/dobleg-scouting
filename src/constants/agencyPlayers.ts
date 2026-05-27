export interface AgencyPlayer {
  shortName: string
  fullName: string
  image: string | null
  contractEnd: string | null
  marketValue: string | null
  team: string
  apiTeamId: number | null
  isReserve: boolean
}

export const AGENCY_PLAYERS: AgencyPlayer[] = [
  { shortName: 'G. Prestianni', fullName: 'Gianluca Prestianni', image: 'https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcTxU7jrcPvBo4o89PTXnHZlGY56xc2X-rPYWCUBnkTIh6OQTQ', contractEnd: '30/06/2029', marketValue: '€12.00m', team: 'Benfica', apiTeamId: 211, isReserve: false },
  { shortName: 'J. Paradela', fullName: 'José Paradela', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS9GNEuUHCWeaSQKtbkKrreYrK_ff-_uqJ_XKcXh-63o7-8Yw', contractEnd: '30/06/2029', marketValue: '€9.00m', team: 'Cruz Azul', apiTeamId: 2295, isReserve: false },
  { shortName: 'L. Orellano', fullName: 'Luca Orellano', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcTt7O2crtnBWvWOKe425SVmYxdMe_2Z4RowyMQA2bl1AdBqoA', contractEnd: null, marketValue: '€8.00m', team: 'Monterrey', apiTeamId: 2282, isReserve: false },
  { shortName: 'M. Palacios', fullName: 'Matías Palacios', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcSxrDN9XYs6U4e-l794ud5TnO9SufmqTPdIkv2ri3RlnWYkwg', contractEnd: '31/12/2026', marketValue: '€2.00m', team: 'Al Ain', apiTeamId: 2865, isReserve: false },
  { shortName: 'J. Palacios', fullName: 'Julián Palacios', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcQJxq3RZzOpKDnn4VlT9M8rGYpNJ0dYFc7nRpTB5D_OCi5wrQ', contractEnd: '31/12/2026', marketValue: '€1.50m', team: 'Unión Santa Fe', apiTeamId: 441, isReserve: false },
  { shortName: 'J. López', fullName: 'Julián López', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcR06ZxgTLDKhTeyGv2BZ8E6SIiUE14T7F_eTpFhz8Rja7XmHw', contractEnd: '31/12/2026', marketValue: '€1.20m', team: 'Defensa y Justicia', apiTeamId: 442, isReserve: false },
  { shortName: 'A. Steimbach', fullName: 'Alexis Steimbach', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcQr_My0D5s71XBbpmycFbmouMZRlDXQzXTec_rwZlxc6iqK3Q', contractEnd: '31/12/2026', marketValue: '€1.00m', team: 'Gimnasia La Plata', apiTeamId: 434, isReserve: false },
  { shortName: 'C. Bravo', fullName: 'Claudio Bravo', image: 'https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcRoALNfMMbFmfQPzTnBQWX5HYDQXE3xtaoYKbHQU23fCXYf-w', contractEnd: '31/12/2029', marketValue: '€800k', team: 'Argentinos Juniors', apiTeamId: 458, isReserve: false },
  { shortName: 'M. Carabajal', fullName: 'Mateo Carabajal', image: 'https://img.a.transfermarkt.technology/portrait/header/578757-1739213760.png?lm=1', contractEnd: '31/12/2027', marketValue: '€700k', team: 'Independiente del Valle', apiTeamId: 1153, isReserve: false },
  { shortName: 'M. Vera', fullName: 'Mauricio Vera', image: 'https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcSHFjZ591GzSnBG525pUcTExQgvHYyltJKa_nRsLERsiHgtlw', contractEnd: '31/12/2026', marketValue: '€600k', team: 'Nacional', apiTeamId: 2356, isReserve: false },
  { shortName: 'F. Watson', fullName: 'Franco Watson', image: 'https://img.a.transfermarkt.technology/portrait/header/654733-1677162423.JPG?lm=1', contractEnd: '31/12/2027', marketValue: '€600k', team: 'Lanús', apiTeamId: 446, isReserve: false },
  { shortName: 'M. Espindola', fullName: 'Matías Espíndola', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS1N9vJgD-2W3N7xXyVN_vQzc1kald8Fj2FKbMCF9lZT0psjQ', contractEnd: '31/12/2026', marketValue: '€500k', team: 'Deportivo Maldonado', apiTeamId: 2370, isReserve: false },
  { shortName: 'P. Guajardo', fullName: 'Paolo Guajardo', image: 'https://img.a.transfermarkt.technology/portrait/header/882846-1773086173.jpg?lm=1', contractEnd: '31/12/2027', marketValue: '€500k', team: 'Audax Italiano', apiTeamId: 2329, isReserve: false },
  { shortName: 'J. Díaz', fullName: 'Juan Ignacio Díaz', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMMbiNBpx9abyfSTWqxKbpFPpPUh-kumH4y96vBvgUxWpvxA', contractEnd: null, marketValue: '€450k', team: 'Universidad Católica', apiTeamId: 2994, isReserve: false },
  { shortName: 'Á. López', fullName: 'Álvaro López', image: 'https://img.a.transfermarkt.technology/portrait/header/683807-1776452426.jpeg?lm=1', contractEnd: '31/12/2026', marketValue: '€450k', team: 'Albion', apiTeamId: 2378, isReserve: false },
  { shortName: 'A. Mulet', fullName: 'Agustín Mulet', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcTJi9w69HxCZKetEwoweuzr6QlEXgHDlpxPXImEKpKxB-AUKg', contractEnd: '30/06/2026', marketValue: '€300k', team: 'CD Olimpia', apiTeamId: 1051, isReserve: false },
  { shortName: 'N. Watson', fullName: 'Nicolás Watson', image: 'https://img.a.transfermarkt.technology/portrait/header/697045-1771011330.JPG?lm=1', contractEnd: '31/12/2026', marketValue: '€300k', team: 'Deportivo Riestra', apiTeamId: 476, isReserve: false },
  { shortName: 'M. Kabalin', fullName: 'Matías Kabalin', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcSpMwjO8JilujyCPgoA4EuZMb47MGT3F826CRKYNgAk__0mrw', contractEnd: '31/12/2026', marketValue: '€250k', team: 'Ferro Carril Oeste', apiTeamId: 470, isReserve: false },
  { shortName: 'A. Massaccesi', fullName: 'Agustín Massaccesi', image: null, contractEnd: '31/12/2026', marketValue: '€250k', team: 'Instituto', apiTeamId: 478, isReserve: false },
  { shortName: 'I. Erquiaga', fullName: 'Iván Erquiaga', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcRLy5FdX5SvVylOGfBs4v4r_rC_cNtlygXgM5WGbMhit-iOyQ', contractEnd: '31/12/2027', marketValue: '€250k', team: 'Instituto', apiTeamId: 478, isReserve: false },
  { shortName: 'M. Enrique', fullName: 'Marcos Enrique', image: null, contractEnd: '31/12/2026', marketValue: '€200k', team: 'Patronato', apiTeamId: 444, isReserve: false },
  { shortName: 'J. Ginzo', fullName: 'Juan Martín Ginzo', image: 'https://img.a.transfermarkt.technology/portrait/header/1029486-1772241954.jpeg?lm=1', contractEnd: '31/07/2027', marketValue: '€200k', team: 'Deportivo Maldonado', apiTeamId: 2370, isReserve: false },
  { shortName: 'J. Farías', fullName: 'Juan Farías', image: 'https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcSeyo5gGMiLddj8cHb_6EZ_CJGpDJC-WFa566-GM39W22fDcg', contractEnd: null, marketValue: '€150k', team: 'Atlético Tucumán', apiTeamId: 455, isReserve: false },
  { shortName: 'N. Leguizamón', fullName: 'Nicolás Leguizamón', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcQeiIZQqDWF9nZhEPfh1Y0WJTs1OFRuv-QGk0NEs4RElokHAw', contractEnd: null, marketValue: '€125k', team: 'Deportivo Cuenca', apiTeamId: 1154, isReserve: false },
  { shortName: 'M. Sanabria', fullName: 'Mario Sanabria', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcTvZuQnpOfVdtMn6NL50S41G0RzQqp63nUguMH2FfcbZ9DB6Q', contractEnd: '31/12/2026', marketValue: '€100k', team: 'Chacarita Juniors', apiTeamId: 447, isReserve: false },
  { shortName: 'S. Echeverría', fullName: 'Santiago Echeverría', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcTtZsHEGQRjOrsXhBK3eByEIrY9wMSo-t_g0r0FeJEPKt5JcA', contractEnd: null, marketValue: '€75k', team: 'Bolívar', apiTeamId: 3702, isReserve: false },
  { shortName: 'J. Postigo', fullName: 'Joaquin Postigo', image: null, contractEnd: '31/12/2026', marketValue: '€75k', team: 'Quilmes', apiTeamId: 480, isReserve: false },
  { shortName: 'D. Mastrángelo', fullName: 'Diego Mastrángelo', image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3rOhvSjrXANyVmPAGDkjOPTid9lbwS5OGVjnB4lHe6rlzkA', contractEnd: '31/12/2026', marketValue: '€75k', team: 'Gimnasia La Plata', apiTeamId: 434, isReserve: true },
  { shortName: 'F. Paradela', fullName: 'Federico Paradela', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcS8105jO1m0aDXDfCWOOsYjAw31izl4OjZp4O035Zc3PRMYQA', contractEnd: '31/12/2026', marketValue: '€75k', team: 'Gimnasia Jujuy', apiTeamId: 479, isReserve: false },
  { shortName: 'B. Centeno', fullName: 'Bruno Centeno', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcQrXW5EJJwbfRNL1c7M_Blul3no8gLbc8sCh459MbUaawxTvw', contractEnd: null, marketValue: '€50k', team: 'Deportivo Maldonado', apiTeamId: 2370, isReserve: false },
  { shortName: 'F. Lo Celso', fullName: 'Francesco Lo Celso', image: 'https://img.a.transfermarkt.technology/portrait/header/642757-1638750271.JPG?lm=1', contractEnd: '31/12/2026', marketValue: '€25k', team: 'Estudiantes Río Cuarto', apiTeamId: 2424, isReserve: false },
  { shortName: 'Gonzalo González', fullName: 'Gonzalo González', image: 'https://encrypted-tbn2.gstatic.com/images?q=tbn:ANd9GcTuKilxrc1i5zJfFS3hEXFA4YhCx64fAMPL1FG3RM-mD_Ypbg', contractEnd: '31/12/2026', marketValue: null, team: 'Gimnasia La Plata', apiTeamId: 434, isReserve: false },
  { shortName: 'L. Minniti', fullName: 'Luciano Minniti', image: null, contractEnd: '31/12/2028', marketValue: null, team: 'Tigre', apiTeamId: 452, isReserve: true },
  { shortName: 'A. Melano', fullName: 'Agustín Melano', image: 'https://encrypted-tbn3.gstatic.com/images?q=tbn:ANd9GcQI0lcQIHGis9Sa6VDh2h8FANIarYviSQSNpUcOLYYuPpzl2w', contractEnd: '31/12/2026', marketValue: null, team: 'Belgrano', apiTeamId: 440, isReserve: true },
  { shortName: 'F. Paradela', fullName: 'Francesco Paradela', image: null, contractEnd: null, marketValue: null, team: 'Gimnasia La Plata', apiTeamId: 434, isReserve: true },
  { shortName: 'M. Isopi', fullName: 'Mauro Isopi', image: null, contractEnd: null, marketValue: null, team: 'Platense', apiTeamId: 1064, isReserve: true },
  { shortName: 'T. Valdecantos', fullName: 'Tomás Valdecantos', image: 'https://encrypted-tbn1.gstatic.com/images?q=tbn:ANd9GcR40YiqK6AdAQ-O3cU6kajD5P8SZGbDdGbF7kU1f7KuCUzxOw', contractEnd: null, marketValue: null, team: 'Al Ain', apiTeamId: 2865, isReserve: true },
]

export function getUniqueTeamIds(): number[] {
  const ids = new Set<number>()
  for (const p of AGENCY_PLAYERS) {
    if (p.apiTeamId && !p.isReserve) ids.add(p.apiTeamId)
  }
  return Array.from(ids)
}

export function getPlayersByTeamId(teamId: number): AgencyPlayer[] {
  return AGENCY_PLAYERS.filter(p => p.apiTeamId === teamId)
}

export function getTotalPortfolioValue(): number {
  let total = 0
  for (const p of AGENCY_PLAYERS) {
    if (!p.marketValue) continue
    const raw = p.marketValue.replace('€', '').trim()
    if (raw.endsWith('m')) total += parseFloat(raw) * 1_000_000
    else if (raw.endsWith('k')) total += parseFloat(raw) * 1_000
  }
  return total
}

export function formatPortfolioValue(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`
  return `€${value}`
}

export function getExpiringContracts(monthsThreshold = 8): AgencyPlayer[] {
  const now = new Date()
  return AGENCY_PLAYERS.filter(p => {
    if (!p.contractEnd) return false
    const [d, m, y] = p.contractEnd.split('/')
    const end = new Date(+y, +m - 1, +d)
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30)
    return diff > 0 && diff <= monthsThreshold
  })
}

export function getUniqueLeagues(): number {
  const teams = new Set(AGENCY_PLAYERS.map(p => p.team))
  return teams.size
}
