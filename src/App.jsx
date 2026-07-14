import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Home from './pages/home'
import Dashboard from './pages/dashboard'
import Flyers from './pages/flyers'
import Upload from './pages/upload'
import Profile from './pages/profile'
import MapPage from './pages/map'
import Calendar from './pages/calendar'
import UserProfile from './pages/userProfile'
import Admin from './pages/admin'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return null

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

// Admins and moderators can access the moderation dashboard;
// admin-only actions are gated inside the page itself.
function ModRoute({ children }) {
  const { isAuthenticated, isMod, loading } = useAuth()

  if (loading) return null

  if (!isAuthenticated || !isMod) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/flyers" replace />} />
          <Route path="/login" element={<Home />} />

          {/* Public routes — browsable without login */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/flyers" element={<Flyers />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/map" element={<ProtectedRoute><MapPage /></ProtectedRoute>} />
          <Route path="/profile/:uid" element={<UserProfile />} />

          {/* Auth-required routes */}
          <Route
            path="/upload"
            element={
              <ProtectedRoute>
                <Upload />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          {/* Admin/moderator route */}
          <Route
            path="/admin"
            element={
              <ModRoute>
                <Admin />
              </ModRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
