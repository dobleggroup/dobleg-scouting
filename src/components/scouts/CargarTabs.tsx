import { NavLink } from 'react-router-dom'

// Las tres páginas de "Cargar actividad": se pasa de una a otra sin abrir el menú
// (sobre todo en el celular, donde la barra de abajo lleva a Cargar reporte).
const TABS = [
  { to: '/cargar-reporte', label: 'Reporte' },
  { to: '/cargar-reunion', label: 'Reunión' },
  { to: '/cargar-viaje', label: 'Viaje' },
]

export default function CargarTabs() {
  return (
    <div className="grid grid-cols-3 p-1 rounded-xl bg-apple-gray-100 dark:bg-apple-gray-800">
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `text-center py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-white dark:bg-apple-gray-700 text-apple-gray-900 dark:text-white shadow-sm'
                : 'text-apple-gray-600 dark:text-apple-gray-300 hover:text-apple-gray-900 dark:hover:text-white'
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}
