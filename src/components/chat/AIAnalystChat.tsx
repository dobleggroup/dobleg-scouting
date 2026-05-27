import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '@/context/DataContext'
import { POSITION_MAP, FILTER_POSITION_MAP } from '@/constants/scoring'
import { getRelativeScoreColorClass, getRelativeScoreBgClass } from '@/components/ui/ScoreBar'
import { useScoreLookup } from '@/hooks/usePlayerStats'
import { normalizeName } from '@/utils/scoring'
import type { EnrichedPlayer } from '@/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  players?: EnrichedPlayer[]
}

interface SearchCriteria {
  position?: string
  minAge?: number
  maxAge?: number
  league?: string
  metrics?: { name: string; priority: 'high' | 'medium' }[]
  minScore?: number
}

interface SuggestedQuestion {
  text: string
  category: 'help' | 'search'
}

const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { text: '¿Cómo busco un jugador?', category: 'help' },
  { text: '¿Cómo veo las métricas de un jugador?', category: 'help' },
  { text: '¿Qué es el Score GG?', category: 'help' },
  { text: 'Busco un 9 goleador sub-23', category: 'search' },
  { text: '¿Cómo comparo dos jugadores?', category: 'help' },
  { text: 'Extremo gambeteador de Argentina', category: 'search' },
]

// Help responses for app navigation
const HELP_RESPONSES: Record<string, string> = {
  'buscar_jugador': `**¿Cómo buscar un jugador?**

1. Andá a **Scouting Externo** o **Scouting Interno** en el menú lateral
2. Usá la **barra de búsqueda** arriba para escribir el nombre
3. También podés filtrar por **posición**, **liga** o **edad** usando los filtros

💡 **Tip:** Hacé clic en cualquier jugador de la tabla para ver su ficha completa.`,

  'metricas': `**¿Cómo ver las métricas de un jugador?**

1. Buscá al jugador y hacé clic en su nombre
2. En su ficha, andá a la pestaña **"Métricas"**
3. Ahí vas a ver:
   - **Gráfico radar** comparando vs promedio de la liga
   - **Métricas detalladas** con percentiles
   - Podés **personalizar las métricas** del radar

💡 **Tip:** Pasá el mouse sobre el radar para ver los valores exactos.`,

  'score_gg': `**¿Qué es el Score GG?**

El **Score GG** es una puntuación de 0-100 que calcula el rendimiento general del jugador según su posición.

📊 **Cómo se calcula:**
- Compara las métricas clave del jugador vs otros de su posición
- Cada posición tiene métricas diferentes (ej: goles para delanteros, duelos para defensores)

🏷️ **Rangos:**
- **80+** = Elite (top del ranking)
- **55-79** = Buen nivel
- **35-54** = Regular
- **<35** = Por debajo del promedio`,

  'comparar': `**¿Cómo comparar dos jugadores?**

1. Andá a **"Comparación"** en el menú lateral
2. Seleccioná el **primer jugador** en el dropdown izquierdo
3. Seleccioná el **segundo jugador** en el dropdown derecho
4. Vas a ver un radar superpuesto y una tabla comparativa

💡 **Tip:** Podés comparar jugadores de distintas ligas y posiciones.`,

  'seguimiento': `**¿Cómo funciona el Seguimiento?**

La sección **Seguimiento** te permite crear listas de jugadores que querés monitorear.

📋 **Funciones:**
- Agregá jugadores a una lista personalizada
- Definí la posición en la que lo estás evaluando
- Agregá notas y comentarios
- Seguí su evolución en el tiempo

Para agregar un jugador, buscalo y usá el botón **"Agregar a seguimiento"**.`,

  'fichas_internas': `**¿Qué tienen las fichas de jugadores internos?**

Los jugadores **internos** (de tu club) tienen pestañas adicionales:

📁 **Pestañas exclusivas:**
- **Valor**: Historial de valor de mercado
- **Rendimiento**: Evolución partido a partido
- **Físico**: Datos GPS y físicos
- **Salud**: Historial de lesiones
- **Fisioterapia, Nutrición, Neurociencia, Psicología, Coaching**

Los jugadores **externos** solo tienen General y Métricas.`,

  'filtros': `**¿Cómo usar los filtros?**

En las tablas de Scouting podés filtrar por:

🔍 **Filtros disponibles:**
- **Posición**: CB, LB, RB, CM, CAM, LW, RW, ST, etc.
- **Liga**: Argentina, Colombia, Uruguay, etc.
- **Edad**: Rango mínimo y máximo
- **Minutos**: Filtrar por minutos jugados

Los filtros se combinan entre sí para refinar tu búsqueda.`,

  'exportar': `**¿Cómo exportar información?**

Podés exportar fichas de jugadores a **PDF**:

1. Abrí la ficha del jugador
2. Hacé clic en el botón **"Exportar PDF"** arriba a la derecha
3. Elegí el tema (claro/oscuro) y las secciones a incluir
4. Descargá el PDF

💡 También podés agregar jugadores a un **Informe** para exportar varios juntos.`,

  'general': `**¡Hola! Soy tu asistente de la plataforma Scout.**

Puedo ayudarte con:

🔍 **Buscar jugadores** - Decime qué perfil buscás
📊 **Explicarte métricas** - Score GG, radar, percentiles
🧭 **Navegar la app** - Cómo usar cada sección
📋 **Comparar jugadores** - Cómo funciona

**Preguntame lo que necesites** o elegí una de las sugerencias de abajo.`
}

// Detect if the message is asking for help
function detectHelpIntent(message: string): string | null {
  const msg = message.toLowerCase()

  // Greetings
  if (/^(hola|hey|buenas|buen día|que tal|hi|hello)/.test(msg) && msg.length < 20) {
    return 'general'
  }

  // How to search
  if ((msg.includes('cómo') || msg.includes('como') || msg.includes('donde') || msg.includes('dónde')) &&
      (msg.includes('busco') || msg.includes('buscar') || msg.includes('encuentro') || msg.includes('encontrar'))) {
    if (msg.includes('jugador')) return 'buscar_jugador'
  }

  // Metrics
  if (msg.includes('métrica') || msg.includes('metrica') || msg.includes('radar') ||
      ((msg.includes('cómo') || msg.includes('como')) && msg.includes('veo') && !msg.includes('jugador'))) {
    return 'metricas'
  }

  // Score GG
  if (msg.includes('score') || msg.includes('gg') || msg.includes('puntuación') || msg.includes('puntaje') ||
      msg.includes('puntuacion')) {
    return 'score_gg'
  }

  // Compare
  if (msg.includes('compar') || msg.includes('versus') || msg.includes(' vs ')) {
    if (msg.includes('cómo') || msg.includes('como') || msg.includes('donde') || msg.includes('puedo')) {
      return 'comparar'
    }
  }

  // Seguimiento
  if (msg.includes('seguimiento') || msg.includes('lista') || msg.includes('monitorear') || msg.includes('watchlist')) {
    return 'seguimiento'
  }

  // Internal players
  if (msg.includes('interno') || msg.includes('ficha') || msg.includes('pestaña') || msg.includes('tab')) {
    if (msg.includes('qué tiene') || msg.includes('que tiene') || msg.includes('diferencia')) {
      return 'fichas_internas'
    }
  }

  // Filters
  if (msg.includes('filtro') || msg.includes('filtrar')) {
    return 'filtros'
  }

  // Export
  if (msg.includes('exportar') || msg.includes('pdf') || msg.includes('descargar') || msg.includes('informe')) {
    return 'exportar'
  }

  // Help / what can you do
  if (msg.includes('ayuda') || msg.includes('help') || msg.includes('qué puedo') || msg.includes('que puedo') ||
      msg.includes('qué hacés') || msg.includes('que haces') || msg.includes('funciones')) {
    return 'general'
  }

  return null
}

// AI logic to parse user intent
function parseUserIntent(message: string): { type: string; criteria: SearchCriteria } {
  const msg = message.toLowerCase()
  const criteria: SearchCriteria = {}

  // Position detection
  if (msg.includes('9') || msg.includes('delantero') || msg.includes('goleador') || msg.includes('centrodelantero')) {
    criteria.position = 'Delantero'
  } else if (msg.includes('extremo') || msg.includes('wing') || msg.includes('puntero')) {
    criteria.position = 'Extremo'
  } else if (msg.includes('lateral')) {
    criteria.position = 'Lateral'
    if (msg.includes('derecho')) criteria.position = 'Lateral Derecho'
    if (msg.includes('izquierdo')) criteria.position = 'Lateral Izquierdo'
  } else if (msg.includes('central') && (msg.includes('defensor') || msg.includes('defensa') || msg.includes('zaguero'))) {
    criteria.position = 'Defensor Central'
  } else if (msg.includes('volante') || msg.includes('mediocampista') || msg.includes('medio')) {
    if (msg.includes('interno') || msg.includes('ofensivo') || msg.includes('enganche')) {
      criteria.position = 'Volante interno'
    } else {
      criteria.position = 'Volante central'
    }
  }

  // Age detection
  const ageMatch = msg.match(/(\d+)\s*(años|años|año)/)
  if (ageMatch) {
    const age = parseInt(ageMatch[1])
    if (msg.includes('menor') || msg.includes('joven') || msg.includes('sub') || msg.includes('menos')) {
      criteria.maxAge = age
    } else if (msg.includes('mayor') || msg.includes('más')) {
      criteria.minAge = age
    } else {
      // Assume max age if just age mentioned
      criteria.maxAge = age
    }
  }

  // Metric priorities
  const metrics: SearchCriteria['metrics'] = []

  // Aerial/header keywords
  if (msg.includes('cabeza') || msg.includes('aéreo') || msg.includes('altura') || msg.includes('arriba') || msg.includes('aereo')) {
    metrics.push({ name: 'Duelos aéreos ganados, %', priority: 'high' })
  }

  // Dribbling keywords
  if (msg.includes('gambeta') || msg.includes('regate') || msg.includes('dribl') || msg.includes('encar')) {
    metrics.push({ name: 'Gambetas completadas/90', priority: 'high' })
    metrics.push({ name: 'Gambetas completadas, %', priority: 'medium' })
  }

  // Goal keywords
  if (msg.includes('gol') || msg.includes('definición') || msg.includes('definicion') || msg.includes('definidor')) {
    metrics.push({ name: 'Goles', priority: 'high' })
    metrics.push({ name: 'xG', priority: 'medium' })
  }

  // Pass/playmaker keywords
  if (msg.includes('pase') || msg.includes('asist') || msg.includes('creativo') || msg.includes('jugada')) {
    metrics.push({ name: 'Pases progresivos exitosos/90', priority: 'high' })
    metrics.push({ name: 'xA/90', priority: 'high' })
    metrics.push({ name: 'Jugadas claves/90', priority: 'medium' })
  }

  // Defensive keywords
  if (msg.includes('defens') || msg.includes('recuper') || msg.includes('quite') || msg.includes('robo')) {
    metrics.push({ name: 'Duelos defensivos ganados, %', priority: 'high' })
    metrics.push({ name: 'Interceptaciones/90', priority: 'medium' })
    metrics.push({ name: 'Entradas/90', priority: 'medium' })
  }

  // Duels keywords
  if (msg.includes('duelo') || msg.includes('físico') || msg.includes('fuerte') || msg.includes('potente')) {
    metrics.push({ name: 'Duelos ganados, %', priority: 'high' })
  }

  // Attack keywords
  if (msg.includes('ataque') || msg.includes('ofensivo') || msg.includes('profundidad')) {
    metrics.push({ name: 'Acciones de ataque exitosas/90', priority: 'high' })
    metrics.push({ name: 'Ataque en profundidad/90', priority: 'medium' })
  }

  // Cross keywords
  if (msg.includes('centro') || msg.includes('centrar')) {
    metrics.push({ name: 'Centros precisos/90', priority: 'high' })
  }

  if (metrics.length > 0) criteria.metrics = metrics

  // Score threshold
  if (msg.includes('elite') || msg.includes('top') || msg.includes('mejor')) {
    criteria.minScore = 65
  } else if (msg.includes('buen') || msg.includes('destac')) {
    criteria.minScore = 55
  }

  // League detection
  if (msg.includes('argentin')) criteria.league = 'Argentina'
  if (msg.includes('colombia')) criteria.league = 'Colombia'
  if (msg.includes('uruguay')) criteria.league = 'Uruguay'
  if (msg.includes('chile')) criteria.league = 'Chile'
  if (msg.includes('paraguay')) criteria.league = 'Paraguay'

  return { type: 'search', criteria }
}

function searchPlayers(players: EnrichedPlayer[], criteria: SearchCriteria): EnrichedPlayer[] {
  let results = players.filter(p => p.minutesPlayed >= 300) // Minimum minutes

  // Filter by position
  if (criteria.position) {
    results = results.filter(p => {
      const rawPos = (p['Posición específica'] || p['Posición'])?.trim() ?? ''
      const posKey = POSITION_MAP[rawPos] ?? rawPos
      return posKey.toLowerCase().includes(criteria.position!.toLowerCase()) ||
             rawPos.toLowerCase().includes(criteria.position!.toLowerCase())
    })
  }

  // Filter by age
  if (criteria.minAge) {
    results = results.filter(p => p.ageNum >= criteria.minAge!)
  }
  if (criteria.maxAge) {
    results = results.filter(p => p.ageNum <= criteria.maxAge!)
  }

  // Filter by league
  if (criteria.league) {
    results = results.filter(p => p.Liga?.toLowerCase().includes(criteria.league!.toLowerCase()))
  }

  // Filter by score
  if (criteria.minScore) {
    results = results.filter(p => (p.ggScore ?? 0) >= criteria.minScore!)
  }

  // Score and sort by metrics
  if (criteria.metrics && criteria.metrics.length > 0) {
    results = results.map(p => {
      let metricScore = 0
      for (const metric of criteria.metrics!) {
        const val = p[metric.name]
        const numVal = typeof val === 'number' ? val : parseFloat(String(val ?? '0').replace(',', '.')) || 0
        const weight = metric.priority === 'high' ? 2 : 1
        metricScore += numVal * weight
      }
      return { ...p, _metricScore: metricScore }
    }).sort((a, b) => (b as any)._metricScore - (a as any)._metricScore)
  } else {
    // Sort by ggScore if no specific metrics
    results = results.sort((a, b) => (b.ggScore ?? 0) - (a.ggScore ?? 0))
  }

  return results.slice(0, 8)
}

function generateResponse(criteria: SearchCriteria, results: EnrichedPlayer[]): string {
  if (results.length === 0) {
    return 'No encontré jugadores que coincidan exactamente con esos criterios. Probá ser menos específico o cambiar la posición.\n\n**Tip:** Podés buscar por posición (9, extremo, lateral), edad (menor de 23), liga (argentina), o características (gambeteador, goleador, aéreo).'
  }

  let response = ''

  // Build context description
  const parts: string[] = []
  if (criteria.position) parts.push(`**${criteria.position}**`)
  if (criteria.maxAge) parts.push(`menores de ${criteria.maxAge} años`)
  if (criteria.minAge) parts.push(`mayores de ${criteria.minAge} años`)
  if (criteria.league) parts.push(`de ${criteria.league}`)

  // Build friendly metric names
  const metricExplanations: string[] = []
  const metricDetails: string[] = []
  if (criteria.metrics?.length) {
    for (const m of criteria.metrics) {
      let friendlyName = m.name
        .replace('/90', ' por 90 min')
        .replace(', %', ' (%)')
        .replace('Duelos aéreos ganados', 'juego aéreo')
        .replace('Duelos ganados', 'duelos')
        .replace('Duelos defensivos ganados', 'defensa en duelos')
        .replace('Gambetas completadas', 'gambeta')
        .replace('Pases progresivos exitosos', 'pases en profundidad')
        .replace('Jugadas claves', 'creación de juego')
        .replace('Interceptaciones', 'recuperación')
        .replace('Acciones de ataque exitosas', 'contribución ofensiva')
        .replace('Centros precisos', 'centros')
        .replace('Ataque en profundidad', 'profundidad')

      if (m.priority === 'high') {
        metricExplanations.push(friendlyName.toLowerCase())
        metricDetails.push(`• **${friendlyName}**: los primeros tienen mejor rendimiento en esta métrica`)
      }
    }
  }

  if (parts.length > 0) {
    response = `Encontré **${results.length} jugadores** ${parts.join(', ')}.\n\n`
  } else {
    response = `Encontré **${results.length} jugadores** que podrían interesarte.\n\n`
  }

  // Explain ordering with more detail
  if (metricExplanations.length > 0) {
    response += `📊 **¿Por qué este orden?**\n`
    response += `Analicé ${metricExplanations.slice(0, 3).join(', ')} según lo que pediste.\n`
    response += `El #1 es quien mejor combina esas características.\n\n`
  } else if (criteria.minScore) {
    response += `📊 **¿Por qué este orden?**\n`
    response += `Filtré jugadores con Score GG ${criteria.minScore}+ y los ordené del mejor al peor.\n`
    response += `El Score GG considera todas las métricas importantes de su posición.\n\n`
  } else {
    response += `📊 **Ordenados por Score GG**\n`
    response += `El Score evalúa el rendimiento general considerando las métricas clave de cada posición.\n\n`
  }

  // Add score legend for context
  response += '🏷️ **Score:** 80+ elite · 55-79 bueno · 35-54 regular\n\n'
  response += '👆 Tocá cualquier jugador para ver su ficha completa.'

  return response
}

export default function AIAnalystChat() {
  const navigate = useNavigate()
  const { external, internal, positionAverages } = useData()
  const { lookup: scoreLookup } = useScoreLookup()
  const allPlayers = useMemo(() => [...external, ...internal], [external, internal])

  function getSupabaseScore(player: EnrichedPlayer): number | null {
    const entry = scoreLookup.get(normalizeName(player.Jugador))
    return entry?.score ?? null
  }

  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isHidden, setIsHidden] = useState(() => {
    try { return localStorage.getItem('ai_chat_hidden') === 'true' } catch { return false }
  })
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: '¡Hola! Soy tu **asistente de la plataforma Scout**.\n\nPuedo ayudarte a:\n🔍 **Buscar jugadores** según perfil específico\n🧭 **Navegar la app** y usar cada función\n📊 **Entender métricas** como Score GG, radar, etc.\n\n**¿En qué te puedo ayudar?**'
    }
  ])
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = useCallback((customMessage?: string) => {
    const messageText = customMessage || input.trim()
    if (!messageText || isTyping) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsTyping(true)
    setShowSuggestions(false)

    // Simulate AI thinking
    setTimeout(() => {
      // First check if it's a help question
      const helpIntent = detectHelpIntent(userMessage.content)

      if (helpIntent) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: HELP_RESPONSES[helpIntent] || HELP_RESPONSES['general']
        }
        setMessages(prev => [...prev, assistantMessage])
        setIsTyping(false)
        return
      }

      // Otherwise, treat as player search
      const { criteria } = parseUserIntent(userMessage.content)
      const results = searchPlayers(allPlayers, criteria)
      const response = generateResponse(criteria, results)

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        players: results
      }

      setMessages(prev => [...prev, assistantMessage])
      setIsTyping(false)
    }, 600)
  }, [input, isTyping, allPlayers])

  const handlePlayerClick = (player: EnrichedPlayer) => {
    const encoded = encodeURIComponent(player.Jugador)
    navigate(`/jugador/${encoded}?source=${player.source}`)
    setIsOpen(false)
  }

  const toggleHidden = () => {
    const newValue = !isHidden
    setIsHidden(newValue)
    localStorage.setItem('ai_chat_hidden', String(newValue))
    if (newValue) setIsOpen(false)
  }

  if (isHidden) {
    return (
      <button
        onClick={toggleHidden}
        className="fixed bottom-4 right-4 w-10 h-10 bg-apple-gray-200 dark:bg-apple-gray-700 rounded-full flex items-center justify-center text-apple-gray-500 dark:text-apple-gray-400 hover:bg-apple-gray-300 dark:hover:bg-apple-gray-600 transition-colors shadow-lg z-50"
        title="Mostrar Asistente Scout"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    )
  }

  return (
    <>
      {/* Chat toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 w-14 h-14 bg-brand-green rounded-full flex items-center justify-center text-white shadow-lg hover:bg-green-400 transition-all hover:scale-105 z-50 group"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span className="absolute -top-8 right-0 bg-apple-gray-800 dark:bg-apple-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Asistente Scout
          </span>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className={`fixed bottom-4 right-4 w-96 bg-white dark:bg-apple-gray-800 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col transition-all ${
          isMinimized ? 'h-14' : 'h-[500px]'
        }`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand-green text-white">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="font-semibold text-sm">Asistente Scout</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isMinimized ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                </svg>
              </button>
              <button
                onClick={toggleHidden}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
                title="Ocultar chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-brand-green text-white rounded-2xl rounded-br-md'
                        : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-800 dark:text-white rounded-2xl rounded-bl-md'
                    } px-4 py-2.5`}>
                      <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{
                        __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      }} />

                      {/* Player results */}
                      {msg.players && msg.players.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {msg.players.map((p, i) => {
                            const normPos = FILTER_POSITION_MAP[p['Posición']] ?? ''
                            const posAvg = normPos ? (positionAverages[normPos] ?? null) : null
                            const displayScore = getSupabaseScore(p)
                            const scoreColor = displayScore !== null ? getRelativeScoreColorClass(displayScore, posAvg, '10') : 'text-apple-gray-400'
                            const scoreBg = displayScore !== null ? getRelativeScoreBgClass(displayScore, posAvg, '10') : 'bg-apple-gray-400/10'
                            const isElite = (displayScore ?? 0) >= 8.0

                            return (
                              <button
                                key={`${p.Jugador}-${i}`}
                                onClick={() => handlePlayerClick(p)}
                                className="w-full flex items-center gap-2 p-2 bg-white dark:bg-apple-gray-800/80 hover:bg-apple-gray-50 dark:hover:bg-apple-gray-700/80 rounded-lg transition-colors text-left shadow-sm"
                              >
                                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 text-apple-gray-500 dark:text-apple-gray-400 text-2xs font-bold">
                                  {i + 1}
                                </div>
                                {p.Imagen ? (
                                  <img src={p.Imagen} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-apple-gray-200 dark:bg-apple-gray-600 flex items-center justify-center text-xs font-bold text-apple-gray-600 dark:text-apple-gray-300">
                                    {p.Jugador.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-xs truncate text-apple-gray-800 dark:text-white">{p.Jugador}</p>
                                  <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400 truncate">{p.Equipo} · {p.ageNum} años</p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-0.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${scoreBg} ${scoreColor} ${isElite ? 'shadow-sm shadow-emerald-400/40' : ''}`}>
                                    {displayScore?.toFixed(1) ?? '—'}
                                    {isElite && <span className="ml-0.5 text-2xs">★</span>}
                                  </span>
                                  <p className="text-2xs text-apple-gray-500 dark:text-apple-gray-400">{p.marketValueFormatted}</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Suggested questions */}
                {showSuggestions && messages.length === 1 && (
                  <div className="space-y-2">
                    <p className="text-2xs text-apple-gray-400 uppercase tracking-wide font-medium">Preguntas sugeridas</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUESTIONS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSend(q.text)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all hover:scale-105 ${
                            q.category === 'help'
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                          }`}
                        >
                          {q.category === 'help' ? '❓ ' : '🔍 '}{q.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-apple-gray-100 dark:bg-apple-gray-700 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-apple-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-apple-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-apple-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-apple-gray-200 dark:border-apple-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Preguntá lo que necesites..."
                    className="flex-1 px-4 py-2 bg-apple-gray-100 dark:bg-apple-gray-700 rounded-xl text-sm text-apple-gray-800 dark:text-white placeholder-apple-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-green"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isTyping}
                    className="w-10 h-10 bg-brand-green rounded-xl flex items-center justify-center text-white disabled:opacity-50 hover:bg-green-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
