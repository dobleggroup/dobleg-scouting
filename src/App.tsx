import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import ExternalScoutingPage from '@/pages/ExternalScoutingPage'
import InternalScoutingPage from '@/pages/InternalScoutingPage'
import MonitoringPage from '@/pages/MonitoringPage'
import PlayerDetailPage from '@/pages/PlayerDetailPage'
import ComparisonPage from '@/pages/ComparisonPage'
import FormationPage from '@/pages/FormationPage'
import SimilarPlayersPage from '@/pages/SimilarPlayersPage'
import OpportunitiesPage from '@/pages/OpportunitiesPage'
import DashboardPage from '@/pages/DashboardPage'
import ScoutingWorksPage from '@/pages/ScoutingWorksPage'
import ScatterChartPage from '@/pages/ScatterChartPage'
import ScoutEvaluationPage from '@/pages/ScoutEvaluationPage'
import EvaluationsAdminPage from '@/pages/EvaluationsAdminPage'
import RadarAnalysisPage from '@/pages/RadarAnalysisPage'
import ScoutTrackingGGPage from '@/pages/ScoutTrackingGGPage'
import BusquedaPage from '@/pages/BusquedaPage'
import { PDFBuilderProvider } from '@/context/PDFBuilderContext'
import PDFBuilderModal from '@/components/pdf/PDFBuilderModal'
import { PDFAddedToast } from '@/components/pdf/AddToReportButton'

export default function App() {
  return (
    <PDFBuilderProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ExternalScoutingPage />} />
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
        <PDFBuilderModal />
        <PDFAddedToast />
      </BrowserRouter>
    </PDFBuilderProvider>
  )
}
