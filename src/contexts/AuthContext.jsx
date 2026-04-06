import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../firebase/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [userDoc, setUserDoc] = useState(null)
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      if (!firebaseUser) {
        setUserDoc(null)
        setRole('user')
        setLoading(false)
      }
    })
    return () => unsubscribe()
  }, [])

  // Subscribe to user doc in Firestore for role + profile data
  useEffect(() => {
    if (!user?.uid) return

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setUserDoc(data)
          setRole(data.role || 'user')

          // If user is banned, sign them out immediately
          if (data.banned) {
            signOut(auth)
          }
        } else {
          setUserDoc(null)
          setRole('user')
        }
        setLoading(false)
      },
      () => {
        // On error, still resolve loading
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [user?.uid])

  const isAuthenticated = Boolean(user)
  const isAdmin = role === 'admin'
  const isMod = role === 'moderator' || role === 'admin'

  return (
    <AuthContext.Provider
      value={{ user, userDoc, role, loading, isAuthenticated, isAdmin, isMod }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
