import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables at startup
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase credentials. Copy .env.example to .env.local and add your Supabase URL and anon key.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage for 30 days
    persistSession: true,
    storageKey: 'scout-platform-auth',
    // Auto refresh token before expiry
    autoRefreshToken: true,
    // Detect session from URL (for OAuth redirects)
    detectSessionInUrl: true,
  }
})

// Types for database tables
export interface DbUser {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  created_at: string
}

export interface DbFormation {
  id: string
  name: string
  formation_type: string // "4-3-3", "4-4-2", etc.
  players: Record<string, string> // position -> player name
  created_by: string // user id
  created_by_name: string // user display name
  created_at: string
  updated_at: string
  is_public: boolean
}

export interface DbComment {
  id: string
  player_key: string
  text: string
  sentiment: 'positive' | 'neutral' | 'negative'
  created_by: string
  created_by_name: string
  created_at: string
}

export interface DbSeguimiento {
  id: string
  player_key: string
  player_name: string
  team: string | null
  league: string | null
  position: string | null
  age: number | null
  image_url: string | null
  added_by: string
  added_by_name: string | null
  source: 'ficha' | 'reporte' | 'manual'
  notes: string | null
  created_at: string
}

// ─── SEGUIMIENTO FUNCTIONS ───────────────────────────────────────────────────

export async function addToSeguimiento(
  player: {
    playerKey: string
    playerName: string
    team?: string
    league?: string
    position?: string
    age?: number
    imageUrl?: string
  },
  source: 'ficha' | 'reporte' | 'manual' = 'ficha',
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Debes iniciar sesión para agregar jugadores a seguimiento' }
  }

  const { error } = await supabase.from('seguimiento').upsert({
    player_key: player.playerKey,
    player_name: player.playerName,
    team: player.team || null,
    league: player.league || null,
    position: player.position || null,
    age: player.age || null,
    image_url: player.imageUrl || null,
    added_by: user.id,
    added_by_name: user.user_metadata?.full_name || user.email || null,
    source,
    notes: notes || null,
  }, {
    onConflict: 'player_key',
  })

  if (error) {
    console.error('Error adding to seguimiento:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function removeFromSeguimiento(playerKey: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('seguimiento')
    .delete()
    .eq('player_key', playerKey)

  if (error) {
    console.error('Error removing from seguimiento:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function isInSeguimiento(playerKey: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('seguimiento')
    .select('id')
    .eq('player_key', playerKey)
    .single()

  if (error || !data) return false
  return true
}

export async function getSeguimientoList(): Promise<DbSeguimiento[]> {
  const { data, error } = await supabase
    .from('seguimiento')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching seguimiento:', error)
    return []
  }

  return data || []
}
