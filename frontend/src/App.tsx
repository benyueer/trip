import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PlanningListPage from './pages/PlanningListPage'
import TripDetailPage from './pages/TripDetailPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path='/' element={<PlanningListPage />} />
        <Route path='/trip/:id' element={<TripDetailPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
