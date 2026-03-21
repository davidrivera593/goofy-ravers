import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from '../firebase/config'

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

	return (
		<main className="auth-page">
			<section className="auth-card auth-session">
				<h1>Dashboard</h1>
				<p>
					Welcome, <strong>{currentUser?.email ?? 'User'}</strong>
				</p>
				<button type="button" onClick={handleLogout} disabled={loading}>
					{loading ? 'Working...' : 'Logout'}
				</button>
			</section>
		</main>
	)
}
