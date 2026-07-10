import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './appContext'
import HomeScreen from './features/home/HomeScreen'
import PerformanceScreen from './features/perf/PerformanceScreen'
import Onboarding from './features/profile/Onboarding'
import ProfileScreen from './features/profile/ProfileScreen'
import JoinFlow from './features/record/JoinFlow'
import StartTagFlow from './features/record/StartTagFlow'
import TagDetailScreen from './features/tag/TagDetailScreen'

function Gate() {
  const { profile, profileLoaded } = useApp()
  if (!profileLoaded) return null
  if (!profile) return <Onboarding />
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="/start" element={<StartTagFlow />} />
      <Route path="/t/:tagId" element={<TagDetailScreen />} />
      <Route path="/join/:tagId/:part" element={<JoinFlow />} />
      <Route path="/p/:perfId" element={<PerformanceScreen />} />
      <Route path="/profile" element={<ProfileScreen />} />
      <Route path="*" element={<HomeScreen />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AppProvider>
  )
}
