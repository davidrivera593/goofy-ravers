import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/home'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/flyers" element={<Flyers />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/map" element={<Map />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/profile" element={<Profile />} />
      </Routes>
    </BrowserRouter>
  )
}