import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { FUNCTIONS_BASE } from '@/lib/apiBase'
import { getMyClubId } from '@/services/userProfileService'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  /** undefined = todavía resolviendo tras el login; null = sin fila en user_profiles (sin acceso); string = club_id real. */
  clubId: string | null | undefined
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signInWithApple: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  /** Elimina la cuenta del usuario y su sesión (requisito de Apple/Google). */
  deleteAccount: () => Promise<{ error: Error | null }>
  userDisplayName: string
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [clubId, setClubId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    // `onAuthStateChange` ya dispara un evento inicial con la sesión vigente
    // apenas se suscribe (además del INITIAL_SESSION/SIGNED_IN normal), así que
    // pedir `getMyClubId` también acá duplicaba la consulta a user_profiles en
    // cada carga de la app. Se guarda el id del usuario ya resuelto por
    // `getSession` para no repetirla si `onAuthStateChange` trae la misma sesión.
    let resolvedForUserId: string | null = null

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        resolvedForUserId = session.user.id
        getMyClubId(session.user.id).then(setClubId)
      } else {
        setClubId(undefined)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        if (session.user.id === resolvedForUserId) return
        resolvedForUserId = session.user.id
        getMyClubId(session.user.id).then(setClubId)
      } else {
        resolvedForUserId = null
        setClubId(undefined)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    })
    return { error: error as Error | null }
  }

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // This enables automatic account linking by email
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    })
    return { error: error as Error | null }
  }

  const signInWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: window.location.origin,
      }
    })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // Elimina la cuenta vía función serverless (usa service role para borrar el
  // usuario de Supabase Auth) y cierra sesión. Requisito de las tiendas.
  const deleteAccount = async (): Promise<{ error: Error | null }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return { error: new Error('No hay sesión activa') }

      const res = await fetch(`${FUNCTIONS_BASE}/delete-account`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({} as { error?: string }))
        return { error: new Error(body.error || 'No se pudo eliminar la cuenta') }
      }

      await supabase.auth.signOut()
      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  }

  // Get display name from user metadata or email
  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  return (
    <AuthContext.Provider value={{ user, session, loading, clubId, signIn, signUp, signInWithGoogle, signInWithApple, signOut, deleteAccount, userDisplayName }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
