// Las nacionalidades vienen de los proveedores en inglés, y a veces el mismo país
// con dos nombres ("Czechia" y "Czech Republic", "Turkey" y "Türkiye"). En el
// filtro se muestran en castellano y una opción junta todas sus variantes.

const NATIONALITY_ES: Record<string, string> = {
  Albania: 'Albania',
  Algeria: 'Argelia',
  Angola: 'Angola',
  Argentina: 'Argentina',
  Armenia: 'Armenia',
  Australia: 'Australia',
  Austria: 'Austria',
  Azerbaijan: 'Azerbaiyán',
  Belarus: 'Bielorrusia',
  Belgium: 'Bélgica',
  Benin: 'Benín',
  Bolivia: 'Bolivia',
  'Bosnia and Herzegovina': 'Bosnia y Herzegovina',
  Brazil: 'Brasil',
  Bulgaria: 'Bulgaria',
  'Burkina Faso': 'Burkina Faso',
  Burundi: 'Burundi',
  Cameroon: 'Camerún',
  Canada: 'Canadá',
  'Cape Verde': 'Cabo Verde',
  'Central African Republic': 'República Centroafricana',
  Chile: 'Chile',
  Colombia: 'Colombia',
  Comoros: 'Comoras',
  Congo: 'Congo',
  'Congo DR': 'RD del Congo',
  'Costa Rica': 'Costa Rica',
  "Côte d'Ivoire": 'Costa de Marfil',
  'Ivory Coast': 'Costa de Marfil',
  Croatia: 'Croacia',
  Cuba: 'Cuba',
  'Curaçao': 'Curazao',
  Cyprus: 'Chipre',
  'Czech Republic': 'Chequia',
  Czechia: 'Chequia',
  Denmark: 'Dinamarca',
  'Dominican Republic': 'República Dominicana',
  Ecuador: 'Ecuador',
  Egypt: 'Egipto',
  'El Salvador': 'El Salvador',
  England: 'Inglaterra',
  'Equatorial Guinea': 'Guinea Ecuatorial',
  Estonia: 'Estonia',
  'Faroe Islands': 'Islas Feroe',
  Finland: 'Finlandia',
  France: 'Francia',
  'French Guiana': 'Guayana Francesa',
  Gabon: 'Gabón',
  Gambia: 'Gambia',
  Georgia: 'Georgia',
  Germany: 'Alemania',
  Ghana: 'Ghana',
  Gibraltar: 'Gibraltar',
  'Great Britain': 'Gran Bretaña',
  Greece: 'Grecia',
  Guadeloupe: 'Guadalupe',
  Guinea: 'Guinea',
  'Guinea-Bissau': 'Guinea-Bisáu',
  Haiti: 'Haití',
  Honduras: 'Honduras',
  Hungary: 'Hungría',
  Iceland: 'Islandia',
  Iran: 'Irán',
  Iraq: 'Irak',
  Israel: 'Israel',
  Italy: 'Italia',
  Jamaica: 'Jamaica',
  Japan: 'Japón',
  Jordan: 'Jordania',
  Kazakhstan: 'Kazajistán',
  Kenya: 'Kenia',
  'Korea Republic': 'Corea del Sur',
  'South Korea': 'Corea del Sur',
  Kosovo: 'Kosovo',
  Latvia: 'Letonia',
  Lebanon: 'Líbano',
  Liechtenstein: 'Liechtenstein',
  Lithuania: 'Lituania',
  Luxembourg: 'Luxemburgo',
  Mali: 'Malí',
  Malta: 'Malta',
  Martinique: 'Martinica',
  Mauritania: 'Mauritania',
  Mexico: 'México',
  Moldova: 'Moldavia',
  Monaco: 'Mónaco',
  Montenegro: 'Montenegro',
  Morocco: 'Marruecos',
  Mozambique: 'Mozambique',
  Netherlands: 'Países Bajos',
  'New Zealand': 'Nueva Zelanda',
  Nigeria: 'Nigeria',
  'North Macedonia': 'Macedonia del Norte',
  'Northern Ireland': 'Irlanda del Norte',
  Norway: 'Noruega',
  Pakistan: 'Pakistán',
  Panama: 'Panamá',
  Paraguay: 'Paraguay',
  Peru: 'Perú',
  Philippines: 'Filipinas',
  Poland: 'Polonia',
  Portugal: 'Portugal',
  'Republic of Ireland': 'Irlanda',
  Ireland: 'Irlanda',
  Romania: 'Rumania',
  Russia: 'Rusia',
  'San Marino': 'San Marino',
  'Saudi Arabia': 'Arabia Saudita',
  Scotland: 'Escocia',
  Senegal: 'Senegal',
  Serbia: 'Serbia',
  Slovakia: 'Eslovaquia',
  Slovenia: 'Eslovenia',
  'South Africa': 'Sudáfrica',
  Spain: 'España',
  Suriname: 'Surinam',
  Sweden: 'Suecia',
  Switzerland: 'Suiza',
  Syria: 'Siria',
  Tanzania: 'Tanzania',
  Thailand: 'Tailandia',
  Togo: 'Togo',
  Tunisia: 'Túnez',
  Turkey: 'Turquía',
  'Türkiye': 'Turquía',
  Ukraine: 'Ucrania',
  'United Arab Emirates': 'Emiratos Árabes Unidos',
  Uruguay: 'Uruguay',
  USA: 'Estados Unidos',
  Uzbekistan: 'Uzbekistán',
  Venezuela: 'Venezuela',
  Wales: 'Gales',
  Yemen: 'Yemen',
  Zambia: 'Zambia',
  Zimbabwe: 'Zimbabue',
}

export function nationalityEs(raw: string): string {
  return NATIONALITY_ES[raw] ?? raw
}

export interface NationalityOption {
  /** Nombre en castellano, lo que se ve y se guarda en el filtro. */
  label: string
  /** Todas las variantes del proveedor que significan ese país. */
  values: string[]
}

/**
 * Agrupa las nacionalidades por su nombre en castellano, respetando el orden de
 * entrada (de la base vienen las más frecuentes primero). Argentina va primero.
 */
export function groupNationalities(raw: string[]): NationalityOption[] {
  const byLabel = new Map<string, NationalityOption>()
  for (const value of raw) {
    const label = nationalityEs(value)
    const option = byLabel.get(label)
    if (option) option.values.push(value)
    else byLabel.set(label, { label, values: [value] })
  }
  const options = [...byLabel.values()]
  const rank = (o: NationalityOption) => (o.label === 'Argentina' ? 0 : 1)
  return options.sort((a, b) => rank(a) - rank(b))
}
