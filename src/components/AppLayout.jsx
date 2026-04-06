import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

// Links visible to everyone
const PUBLIC_LINKS = [
  { label: 'Flyers', path: '/flyers' },
  { label: 'Calendar', path: '/calendar' },
  { label: 'Map', path: '/map' },
]

// Links visible only to authenticated users
const AUTH_LINKS = [
  { label: 'Design with GARB', path: '/chat' },
  { label: 'Upload flyer', path: '/upload' },
]

export default function AppLayout({ title, subtitle, headerAction, user, children }) {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [avatarUrl, setAvatarUrl] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const isLoggedIn = Boolean(user)
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Raver'
  const initials = isLoggedIn ? displayName[0].toUpperCase() : '?'

  // Build nav links based on auth state
  const navLinks = [
    ...PUBLIC_LINKS,
    ...(isLoggedIn ? AUTH_LINKS : []),
    ...(isAdmin ? [{ label: 'Admin', path: '/admin' }] : []),
  ]

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
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {isLoggedIn ? (
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
        ) : (
          <div className="nav-right">
            <Link to="/" className="btn-logout" style={{ textDecoration: 'none' }}>
              Sign in
            </Link>
          </div>
        )}

        {/* Hamburger — mobile only */}
        <button
          className="nav-hamburger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className={`nav-hamburger-icon${menuOpen ? ' open' : ''}`}>
            <span /><span /><span />
          </span>
        </button>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setMenuOpen(false)} />
      )}
      <div className={`mobile-menu${menuOpen ? ' mobile-menu-open' : ''}`}>
        {isLoggedIn ? (
          <div className="mobile-menu-user" onClick={() => { navigate('/profile'); setMenuOpen(false) }}>
            <div className="nav-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="" className="nav-avatar-img" />
                : initials
              }
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text-h)' }}>
              {displayName}
            </span>
          </div>
        ) : (
          <div className="mobile-menu-user" onClick={() => { navigate('/'); setMenuOpen(false) }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text-h)' }}>
              Sign in / Sign up
            </span>
          </div>
        )}

        <div className="mobile-menu-links">
          {navLinks.map((link) => (
            <NavLink
              key={link.path}
              to={link.path}
              className={({ isActive }) => `mobile-menu-link${isActive ? ' active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </div>

        {isLoggedIn && (
          <button className="mobile-menu-signout" onClick={handleLogout}>
            Sign out
          </button>
        )}
      </div>

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
