import { supabase } from '@/lib/supabase'

/** True si la cuenta que entró todavía tiene que ver el tutorial de actividad. Ante un error, no lo muestra. */
export async function isActivityTutorialPending(): Promise<boolean> {
  const { data, error } = await supabase.rpc('activity_tutorial_pending')
  if (error) return false
  return data === true
}

/** Lo marca como visto: no vuelve a aparecer en ningún dispositivo. */
export async function finishActivityTutorial(): Promise<void> {
  await supabase.rpc('activity_tutorial_finish')
}
