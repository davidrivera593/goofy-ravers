import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase/config'
import AppLayout from '../components/AppLayout'

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'

  return (
    <AppLayout
      user={currentUser}
      title={
        <>
          Welcome back, <span style={{ color: 'var(--cyan)' }}>{displayName}</span>
        </>
      }
      subtitle="Your hub for the Arizona underground scene."
    >
      <p className="section-label">Explore</p>
      <div className="dashboard-grid">
        {CARDS.map((card) => (
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
    </AppLayout>
  )
}
