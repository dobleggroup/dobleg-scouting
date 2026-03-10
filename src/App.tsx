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
import ScatterChartPage from '@/pages/ScatterChartPage'
import ScoutEvaluationPage from '@/pages/ScoutEvaluationPage'
import EvaluationsAdminPage from '@/pages/EvaluationsAdminPage'
import RadarAnalysisPage from '@/pages/RadarAnalysisPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ExternalScoutingPage />} />
          <Route path="/interno" element={<InternalScoutingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
