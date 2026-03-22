import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const NAV_LINKS = [
  { label: 'Flyers', path: '/flyers' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Map', path: '/map' },
  { label: 'Chat', path: '/chat' },
]

export default function AppLayout({ title, subtitle, headerAction, user, children }) {
  const navigate = useNavigate()
  const [avatarUrl, setAvatarUrl] = useState('')

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Raver'
  const initials = displayName[0].toUpperCase()

  // Listen to user doc for avatar
  useEffect(() => {
    if (!user?.uid) { setAvatarUrl(''); return }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        setAvatarUrl(snap.data().avatarUrl || '')
      }
    })
  }, [user?.uid])

  async function handleLogout() {
    await signOut(auth)
    navigate('/', { replace: true })
  }

  return (
    <div className="dashboard">
      <nav className="dashboard-nav">
        <Link className="nav-logo" to="/dashboard">
          <div className="nav-logo-mark">GR</div>
          <span className="nav-logo-text">GOOFY RAVERS</span>
        </Link>

        <div className="nav-links">
          {NAV_LINKS.map((link) => (
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
          <button className="nav-user" onClick={() => navigate('/profile')}>
            <div className="nav-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="nav-avatar-img" />
                : initials
              }
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
              {displayName}
            </span>
          </button>
          <button className="btn-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        {(title || subtitle) && (
          <div className="dashboard-header">
            {title && (
              <div className="dashboard-header-top">
                <h1>{title}</h1>
                {headerAction}
              </div>
            )}
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
