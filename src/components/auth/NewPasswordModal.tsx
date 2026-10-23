import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'

/** Al volver del mail de "Olvidé mi contraseña": elegir la contraseña nueva. */
export default function NewPasswordModal() {
  const { passwordRecovery, updatePassword } = useAuth()
  const { t } = useLanguage()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!passwordRecovery) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t('auth.minimo6Caracteres')); return }
    if (password !== repeat) { setError(t('auth.contrasenasNoCoinciden')); return }
    setSaving(true)
    const { error } = await updatePassword(password)
    setSaving(false)
    if (error) setError(t('auth.errorConexion'))
  }

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50">
      <form onSubmit={handleSave} className="w-full max-w-sm bg-white dark:bg-apple-gray-900 rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-apple-gray-900 dark:text-white">{t('auth.nuevaContrasenaTitulo')}</h2>
          <p className="text-sm text-apple-gray-500 dark:text-apple-gray-400 mt-1">{t('auth.nuevaContrasenaTexto')}</p>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder={t('auth.contrasenaNueva')}
          autoFocus
          minLength={6}
          className="input-apple w-full"
          required
        />
        <input
          type="password"
          value={repeat}
          onChange={e => setRepeat(e.target.value)}
          placeholder={t('auth.repetirContrasena')}
          minLength={6}
          className="input-apple w-full"
          required
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl bg-brand-green text-white font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors"
        >
          {saving ? t('auth.procesando') : t('auth.guardarContrasena')}
        </button>
      </form>
    </div>
  )
}
