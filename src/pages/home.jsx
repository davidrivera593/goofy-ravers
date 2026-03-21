import { useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from '../firebase/config'

const googleProvider = new GoogleAuthProvider()

export default function Home() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })

    return () => unsubscribe()
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    if (mode === 'signup' && password !== confirmPassword) {
      setMessage('Passwords do not match.')
      return
    }

    try {
      setLoading(true)

      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email, password)
        setMessage('Account created successfully.')
      } else {
        await signInWithEmailAndPassword(auth, email, password)
        setMessage('Logged in successfully.')
      }

      setPassword('')
      setConfirmPassword('')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    try {
      setLoading(true)
      await signOut(auth)
      setMessage('Logged out successfully.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleAuth() {
    setMessage('')

    try {
      setLoading(true)
      await signInWithPopup(auth, googleProvider)
      setMessage('Signed in with Google successfully.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>{mode === 'login' ? 'Login' : 'Sign Up'}</h1>

        {currentUser ? (
          <div className="auth-session">
            <p>
              Signed in as <strong>{currentUser.email}</strong>
            </p>
            <button type="button" onClick={handleLogout} disabled={loading}>
              {loading ? 'Working...' : 'Logout'}
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {mode === 'signup' && (
              <>
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </>
            )}

            <button type="submit" disabled={loading}>
              {loading
                ? 'Working...'
                : mode === 'login'
                  ? 'Login'
                  : 'Create Account'}
            </button>

            <button type="button" onClick={handleGoogleAuth} disabled={loading}>
              Continue with Google
            </button>
          </form>
        )}

        <button
          type="button"
          className="auth-mode-toggle"
          onClick={() => {
            setMode((prevMode) => (prevMode === 'login' ? 'signup' : 'login'))
            setMessage('')
          }}
          disabled={loading || Boolean(currentUser)}
        >
          {mode === 'login'
            ? "Need an account? Switch to Sign Up"
            : 'Already have an account? Switch to Login'}
        </button>

        {message && <p className="auth-message">{message}</p>}
      </section>
    </main>
  )
}