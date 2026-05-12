import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import { PDFBuilderProvider } from '@/context/PDFBuilderContext'

const PDFBuilderModal = lazy(() => import('@/components/pdf/PDFBuilderModal'))
const PDFAddedToast = lazy(() => import('@/components/pdf/AddToReportButton').then(m => ({ default: m.PDFAddedToast })))

const HomePage = lazy(() => import('@/pages/HomePage'))
const ExternalScoutingPage = lazy(() => import('@/pages/ExternalScoutingPage'))
const InternalScoutingPage = lazy(() => import('@/pages/InternalScoutingPage'))
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage'))
const PlayerDetailPage = lazy(() => import('@/pages/PlayerDetailPage'))
const ComparisonPage = lazy(() => import('@/pages/ComparisonPage'))
const FormationPage = lazy(() => import('@/pages/FormationPage'))
const SimilarPlayersPage = lazy(() => import('@/pages/SimilarPlayersPage'))
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const ScoutingWorksPage = lazy(() => import('@/pages/ScoutingWorksPage'))
const ScatterChartPage = lazy(() => import('@/pages/ScatterChartPage'))
const ScoutEvaluationPage = lazy(() => import('@/pages/ScoutEvaluationPage'))
const EvaluationsAdminPage = lazy(() => import('@/pages/EvaluationsAdminPage'))
const RadarAnalysisPage = lazy(() => import('@/pages/RadarAnalysisPage'))
const ScoutTrackingGGPage = lazy(() => import('@/pages/ScoutTrackingGGPage'))
const BusquedaPage = lazy(() => import('@/pages/BusquedaPage'))

export default function App() {
  return (
    <PDFBuilderProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/scouting" element={<ExternalScoutingPage />} />
            <Route path="/interno" element={<InternalScoutingPage />} />
            <Route path="/panel-interno" element={<DashboardPage />} />
            <Route path="/seguimiento" element={<MonitoringPage />} />
            <Route path="/oportunidades" element={<OpportunitiesPage />} />
            <Route path="/similares" element={<SimilarPlayersPage />} />
            <Route path="/jugador/:id" element={<PlayerDetailPage />} />
            <Route path="/comparacion" element={<ComparisonPage />} />
            <Route path="/formacion" element={<FormationPage />} />
            <Route path="/dispersion" element={<ScatterChartPage />} />
            <Route path="/evaluar" element={<ScoutEvaluationPage />} />
            <Route path="/evaluaciones" element={<EvaluationsAdminPage />} />
            <Route path="/radar" element={<RadarAnalysisPage />} />
            <Route path="/trabajos-scouting" element={<ScoutingWorksPage />} />
            <Route path="/scouts-gg" element={<ScoutTrackingGGPage />} />
            <Route path="/analisis-completo" element={<BusquedaPage />} />
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
