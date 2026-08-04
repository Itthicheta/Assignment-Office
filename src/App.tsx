import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { useI18n } from './lib/i18n'
import Layout from './components/Layout'
import Login from './pages/Login'
import MyTasks from './pages/MyTasks'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Team from './pages/Team'
import Routines from './pages/Routines'
import CalendarPage from './pages/CalendarPage'

export default function App() {
  const { session, loading } = useAuth()
  const { t } = useI18n()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">{t('loading')}</div>
  }

  if (!session) return <Login />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MyTasks />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/team" element={<Team />} />
        <Route path="/routines" element={<Routines />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
