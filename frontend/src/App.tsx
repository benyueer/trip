import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PlanningListPage from './pages/PlanningListPage'
import TripDetailPage from './pages/TripDetailPage'
import { AgentPanel } from './components/AgentPanel'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<PlanningListPage />} />
        <Route path='/trip/:id' element={<TripDetailPage />} />
      </Routes>
      <AgentPanel />
    </BrowserRouter>
  )
}

export default App
