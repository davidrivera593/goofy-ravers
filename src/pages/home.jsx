import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const googleProvider = new GoogleAuthProvider()

export default function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [pendingGoogleUser, setPendingGoogleUser] = useState(null)
  const [googleUsername, setGoogleUsername] = useState('')
  const suppressRedirect = useRef(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (currentUser && !suppressRedirect.current) navigate('/dashboard', { replace: true })
  }, [currentUser, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage('')
    setIsSuccess(false)

    if (mode === 'signup' && !username.trim()) {
      setMessage('Please choose a username.')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    try {
      setLoading(true)
      if (mode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password)
        await setDoc(doc(db, 'users', user.uid), {
          displayName: username.trim(),
          bio: '',
          avatarUrl: '',
          createdAt: serverTimestamp(),
        })
        setMessage('Account created.')
      } else {
        await signInWithEmailAndPassword(auth, email, password)
        setMessage('Logged in.')
      }
      setIsSuccess(true)
      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setMessage('')
    setIsSuccess(false)
    try {
      setLoading(true)
      suppressRedirect.current = true
      const result = await signInWithPopup(auth, googleProvider)
      const snap = await getDoc(doc(db, 'users', result.user.uid))
      if (snap.exists()) {
        // Existing user — allow the redirect
        suppressRedirect.current = false
        navigate('/dashboard', { replace: true })
      } else {
        // New Google user — show username prompt
        setPendingGoogleUser(result.user)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleUsernameSubmit(e) {
    e.preventDefault()
    if (!googleUsername.trim()) return
    setLoading(true)
    setMessage('')
    try {
      await setDoc(doc(db, 'users', pendingGoogleUser.uid), {
        displayName: googleUsername.trim(),
        bio: '',
        avatarUrl: '',
        createdAt: serverTimestamp(),
      })
      suppressRedirect.current = false
      setPendingGoogleUser(null)
      setGoogleUsername('')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  if (pendingGoogleUser) {
    return (
      <main className="auth-page">
        <div className="auth-grid" />
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">GR</div>
            <span className="auth-logo-text">Goofy Ravers</span>
          </div>

          <h1>One last step</h1>
          <p className="auth-subtitle">Choose a username for your profile.</p>

          <form className="auth-form" onSubmit={handleGoogleUsernameSubmit}>
            <label>
              Username
              <input
                type="text"
                autoComplete="username"
                placeholder="Choose a username"
                value={googleUsername}
                onChange={(e) => setGoogleUsername(e.target.value)}
                maxLength={40}
                required
                autoFocus
              />
            </label>
            <button type="submit" className="btn-primary" disabled={loading || !googleUsername.trim()}>
              {loading ? 'Saving...' : 'Continue'}
            </button>
          </form>

          {message && <p className="auth-message">{message}</p>}
        </div>
      </main>
    )
  }

  if (currentUser) {
    return (
      <main className="auth-page">
        <div className="auth-grid" />

        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-mark">GR</div>
            <span className="auth-logo-text">Goofy Ravers</span>
          </div>

          <h1>Redirecting...</h1>
          <p className="auth-subtitle">Taking you to your dashboard.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <div className="auth-grid" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">GR</div>
          <span className="auth-logo-text">Goofy Ravers</span>
        </div>

        <h1>{mode === 'login' ? 'Welcome back' : 'Join the scene'}</h1>
        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Sign in to access the AZ rave network.'
            : 'Create an account to find events near you.'}
        </p>

        <button
          type="button"
          className="btn-secondary"
          onClick={handleGoogleAuth}
          disabled={loading}
          style={{ marginBottom: '16px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="auth-divider">or</div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label>
              Username
              <input
                type="text"
                autoComplete="username"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={40}
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {mode === 'signup' && (
            <label>
              Confirm Password
              <input
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="auth-mode-toggle"
          onClick={() => {
            setMode((prevMode) => (prevMode === 'login' ? 'signup' : 'login'))
            setUsername('')
            setMessage('')
            setIsSuccess(false)
          }}
          disabled={loading}
        >
          {mode === 'login'
            ? <>No account? <span>Sign up free →</span></>
            : <>Already have one? <span>Sign in →</span></>}
        </button>

        {message && (
          <p className={`auth-message${isSuccess ? ' success' : ''}`}>{message}</p>
        )}
      </div>
    </main>
  )
}
