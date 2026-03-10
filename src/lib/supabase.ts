import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://qgwmxjjumauortbwvivu.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFnd214amp1bWF1b3J0Ynd2aXZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI4ODAsImV4cCI6MjA4ODY1ODg4MH0.sDJ6P9bOa-VrjpxZgD_umuIPFiGsonVs0bQtzdYw37E'

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
