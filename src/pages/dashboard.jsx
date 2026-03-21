import { useEffect, useState } from 'react'
import { useNavigate, NavLink } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase/config'

const NAV_LINKS = [
  { label: 'Flyers', path: '/flyers' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Map', path: '/map' },
  { label: 'Chat', path: '/chat' },
]

const CARDS = [
  {
    icon: '🎴',
    title: 'Flyer Board',
    desc: 'Browse uploaded flyers from AZ organizers. AI-parsed dates and details.',
    path: '/flyers',
  },
  {
    icon: '📅',
    title: 'Event Calendar',
    desc: 'Upcoming raves sorted by city — Phoenix, Tucson, Flagstaff.',
    path: '/calendar',
  },
  {
    icon: '📍',
    title: 'Venue Map',
    desc: 'Find venues around AZ with contact info and upcoming bookings.',
    path: '/map',
  },
  {
    icon: '🤖',
    title: 'AI Assistant',
    desc: 'Get flyer copy, social posts, and event ideas from the rave AI.',
    path: '/chat',
  },
]

const TAGS = [
  'techno', 'house', 'dnb', 'phoenix', 'tucson', 'warehouse', 'underground',
  'psytrance', 'ambient', 'dubstep', 'flagstaff', 'desert rave', 'techno',
  'house', 'dnb', 'phoenix', 'tucson', 'warehouse', 'underground',
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  async function handleLogout() {
    try {
      setLoading(true)
      await signOut(auth)
      navigate('/', { replace: true })
    } finally {
      setLoading(false)
    }
  }

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'
  const initials = displayName[0].toUpperCase()

  return (
    <div className="dashboard">
      {/* Navbar */}
      <nav className="dashboard-nav">
        <a className="nav-logo" href="/dashboard">
          <div className="nav-logo-mark">GR</div>
          <span className="nav-logo-text">GOOFY RAVERS</span>
        </a>

        <div className="nav-links">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        <div className="nav-right">
          <div className="nav-user">
            <div className="nav-avatar">{initials}</div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
              {displayName}
            </span>
          </div>
          <button className="btn-logout" onClick={handleLogout} disabled={loading}>
            {loading ? '...' : 'Sign out'}
          </button>
        </div>
      </nav>

      {/* Body */}
      <div className="dashboard-body">
        <div className="dashboard-header">
          <h1>Welcome back, <span style={{ color: 'var(--cyan)' }}>{displayName}</span></h1>
          <p>Your hub for the Arizona underground scene.</p>
        </div>

        {/* Feature cards */}
        <p className="section-label">Explore</p>
        <div className="dashboard-grid">
          {CARDS.map(card => (
            <div
              key={card.path}
              className="dash-card"
              onClick={() => navigate(card.path)}
            >
              <div className="dash-card-icon">{card.icon}</div>
              <div className="dash-card-title">{card.title}</div>
              <div className="dash-card-desc">{card.desc}</div>
              <div className="dash-card-arrow">→</div>
            </div>
          ))}
        </div>

        {/* Ticker */}
        <p className="section-label" style={{ marginTop: '40px' }}>Arizona scene tags</p>
        <div className="ticker">
          <div className="ticker-inner">
            {TAGS.map((tag, i) => (
              <span key={i} className="ticker-tag">#{tag}</span>
            ))}
          </div>
          <div className="ticker-inner" aria-hidden>
            {TAGS.map((tag, i) => (
              <span key={i} className="ticker-tag">#{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
