import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import { PDFBuilderProvider } from '@/context/PDFBuilderContext'
import { supabase } from '@/lib/supabase'

const PDFBuilderModal = lazy(() => import('@/components/pdf/PDFBuilderModal'))
const PDFAddedToast = lazy(() => import('@/components/pdf/AddToReportButton').then(m => ({ default: m.PDFAddedToast })))

const HomePage = lazy(() => import('@/pages/HomePage'))
const MarketPage = lazy(() => import('@/pages/MarketPage'))
const MarketContactsPage = lazy(() => import('@/pages/MarketContactsPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const GpsUploadPage = lazy(() => import('@/pages/GpsUploadPage'))
const OptaHubPage = lazy(() => import('@/pages/opta/OptaHubPage'))
const OptaPlayerPage = lazy(() => import('@/pages/opta/OptaPlayerPage'))
const OptaComparePage = lazy(() => import('@/pages/opta/OptaComparePage'))
const OptaMatchPage = lazy(() => import('@/pages/opta/OptaMatchPage'))
const OptaTeamPage = lazy(() => import('@/pages/opta/OptaTeamPage'))
const OptaValuePage = lazy(() => import('@/pages/opta/OptaValuePage'))
const TableroPage = lazy(() => import('@/pages/TableroPage'))
const WyscoutUploadPage = lazy(() => import('@/pages/WyscoutUploadPage'))
const ExternalScoutingPage = lazy(() => import('@/pages/ExternalScoutingPage'))
const InternalScoutingPage = lazy(() => import('@/pages/InternalScoutingPage'))
const InternalClassificationPage = lazy(() => import('@/pages/InternalClassificationPage'))
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage'))
const PlayerDetailPage = lazy(() => import('@/pages/PlayerDetailPage'))
const FormationPage = lazy(() => import('@/pages/FormationPage'))
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage'))
const CoachesListPage = lazy(() => import('@/pages/CoachesListPage'))
const CoachDetailPage = lazy(() => import('@/pages/CoachDetailPage'))
const CoachOptaTestPage = lazy(() => import('@/pages/CoachOptaTestPage'))
const CoachMatchDetailPage = lazy(() => import('@/pages/CoachMatchDetailPage'))
const ScoutEvaluationPage = lazy(() => import('@/pages/ScoutEvaluationPage'))
const EvaluationsAdminPage = lazy(() => import('@/pages/EvaluationsAdminPage'))
const ScoutTrackingGGPage = lazy(() => import('@/pages/ScoutTrackingGGPage'))
const DebutantesPage = lazy(() => import('@/pages/DebutantesPage'))
const InformesPage = lazy(() => import('@/pages/InformesPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))
const AdminAccesosPage = lazy(() => import('@/pages/AdminAccesosPage'))

// Sólo super-admins ven /admin/accesos -- cualquier otra cuenta recibe la
// misma pantalla de "no encontrado" que cualquier ruta inexistente.
function AdminRoute({ children }: { children: ReactNode }) {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    supabase.rpc('is_super_admin').then(({ data }) => setAllowed(!!data))
  }, [])
  if (allowed === undefined) return null
  if (!allowed) return <NotFoundPage />
  return <>{children}</>
}

export default function App() {
  return (
    <PDFBuilderProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/rendimiento-individual" element={<TableroPage />} />
            <Route path="/tablero" element={<Navigate to="/rendimiento-individual" replace />} />
            <Route path="/carga-wyscout" element={<WyscoutUploadPage />} />
            <Route path="/carga-gps" element={<GpsUploadPage />} />
            <Route path="/mercado" element={<MarketPage />} />
            <Route path="/mercado/contactos" element={<MarketContactsPage />} />
            <Route path="/scouting" element={<ExternalScoutingPage />} />
            <Route path="/opta" element={<OptaHubPage />} />
            <Route path="/opta/jugador/:id" element={<OptaPlayerPage />} />
            <Route path="/opta/comparar" element={<OptaComparePage />} />
            <Route path="/opta/partido/:id" element={<OptaMatchPage />} />
            <Route path="/opta/equipo/:id" element={<OptaTeamPage />} />
            <Route path="/opta/valor" element={<OptaValuePage />} />
            <Route path="/interno" element={<InternalScoutingPage />} />
            <Route path="/clasificacion-interna" element={<InternalClassificationPage />} />
            <Route path="/seguimiento-datos" element={<MonitoringPage />} />
            <Route path="/oportunidades" element={<OpportunitiesPage />} />
            <Route path="/debutantes" element={<DebutantesPage />} />
            <Route path="/entrenadores" element={<CoachesListPage />} />
            <Route path="/entrenadores/ponzio-opta" element={<CoachOptaTestPage />} />
            <Route path="/entrenadores/:coachKey" element={<CoachDetailPage />} />
            <Route path="/entrenadores/:coachKey/partido/:fixtureId" element={<CoachMatchDetailPage />} />
            {/* Páginas ocultas para siempre (sin una buena API no sirven): redirigen a Inicio */}
            <Route path="/similares" element={<Navigate to="/" replace />} />
            <Route path="/jugador/:id" element={<PlayerDetailPage />} />
            <Route path="/comparacion" element={<Navigate to="/" replace />} />
            <Route path="/formacion" element={<FormationPage />} />
            <Route path="/dispersion" element={<Navigate to="/" replace />} />
            <Route path="/evaluar" element={<ScoutEvaluationPage />} />
            <Route path="/evaluaciones" element={<EvaluationsAdminPage />} />
            <Route path="/radar" element={<Navigate to="/" replace />} />
            <Route path="/trabajos-scouting" element={<Navigate to="/" replace />} />
            <Route path="/seguimiento-gg" element={<ScoutTrackingGGPage />} />
            <Route path="/analisis-completo" element={<Navigate to="/" replace />} />
            <Route path="/informes" element={<InformesPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/admin/accesos" element={<AdminRoute><AdminAccesosPage /></AdminRoute>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        <Suspense fallback={null}>
          <PDFBuilderModal />
          <PDFAddedToast />
        </Suspense>
      </BrowserRouter>
    </PDFBuilderProvider>
  )
}
