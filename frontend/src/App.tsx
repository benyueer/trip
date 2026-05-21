import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PlanningListPage from './pages/PlanningListPage'
import TripDetailPage from './pages/TripDetailPage'
import { AgentPanel } from './components/AgentPanel'

function App() {
  return (
    <BrowserRouter>
      <div className="flex w-screen h-screen overflow-hidden">
        <div className="flex-1 min-w-0">
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
