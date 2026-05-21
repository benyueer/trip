import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PlanningListPage from './pages/PlanningListPage'
import TripDetailPage from './pages/TripDetailPage'
import { AgentPanel } from './components/AgentPanel'
import { useTripStore } from './store'

function App() {
  const isAgentPanelOpen = useTripStore((s) => s.isAgentPanelOpen)

  return (
    <BrowserRouter>
      <div className="flex w-screen h-screen overflow-hidden">
        <div className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${isAgentPanelOpen ? 'mr-[420px]' : ''}`}>
          <Routes>
            <Route path='/' element={<PlanningListPage />} />
            <Route path='/trip/:id' element={<TripDetailPage />} />
          </Routes>
        </div>
        <AgentPanel />
      </div>
    </BrowserRouter>
  )
}

export default App
