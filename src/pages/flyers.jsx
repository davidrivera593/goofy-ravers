import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'

export default function Flyers() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [flyers, setFlyers] = useState([])
  const [isLoadingFlyers, setIsLoadingFlyers] = useState(true)
  const [flyersError, setFlyersError] = useState('')
  const [selectedFlyer, setSelectedFlyer] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const flyersQuery = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'))

    const unsubscribe = onSnapshot(
      flyersQuery,
      (snapshot) => {
        const nextFlyers = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          // Only show flyer-type docs — exclude any legacy status posts
          .filter((doc) => !doc.postType || doc.postType === 'flyer')

        setFlyers(nextFlyers)
        setFlyersError('')
        setIsLoadingFlyers(false)
      },
      (error) => {
        console.error('Failed to load flyers:', error)
        setFlyers([])
        setFlyersError('Could not load flyers right now.')
        setIsLoadingFlyers(false)
      },
    )

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!selectedFlyer) {
      return undefined
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setSelectedFlyer(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFlyer])

  return (
    <AppLayout
      user={currentUser}
      title="Flyers"
      headerAction={
        <button type="button" className="upload-flyer-btn" aria-label="Upload flyer" onClick={() => navigate('/upload')}>
          Upload your flyer
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M14 3.5V8h4" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M12 18v-6m0 0-2 2m2-2 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      }
      subtitle="Browse uploaded event flyers from AZ organizers."
    >
      <p className="section-label">Latest uploads</p>

      {isLoadingFlyers && <p className="flyers-status">Loading flyers...</p>}
      {flyersError && <p className="flyers-status flyers-status-error">{flyersError}</p>}

      <section className="dashboard-grid">
        {!isLoadingFlyers && !flyersError && flyers.length === 0 && (
          <article className="dash-card flyer-card-empty" style={{ cursor: 'default' }}>
            <div className="dash-card-icon">🎴</div>
            <div className="dash-card-title">No flyers yet</div>
            <div className="dash-card-desc">Upload the first flyer to populate this board.</div>
          </article>
        )}

        {flyers.map((flyer) => (
          <article
            key={flyer.id}
            className="dash-card flyer-card"
            role="button"
            tabIndex={0}
            onClick={() => setSelectedFlyer(flyer)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setSelectedFlyer(flyer)
              }
            }}
          >
            {flyer.imageUrl ? (
              <img
                src={flyer.imageUrl}
                alt={flyer.title ? `${flyer.title} flyer` : 'Uploaded flyer'}
                className="flyer-card-image"
              />
            ) : (
              <div className="flyer-card-image flyer-card-image-fallback">No Image</div>
            )}

            <div className="flyer-card-body">
              <div className="dash-card-title">{flyer.title || 'Untitled event'}</div>
              <div className="dash-card-desc">
                {[flyer.date, flyer.city].filter(Boolean).join(' • ') || 'Date and city not available'}
              </div>

              {flyer.venue && <div className="flyer-meta">Venue: {flyer.venue}</div>}
              {Array.isArray(flyer.genres) && flyer.genres.length > 0 && (
                <div className="flyer-meta">Genres: {flyer.genres.join(', ')}</div>
              )}
              {Array.isArray(flyer.djs) && flyer.djs.length > 0 && (
                <div className="flyer-meta">DJs: {flyer.djs.join(', ')}</div>
              )}
            </div>
          </article>
        ))}
      </section>

      {selectedFlyer && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Flyer details"
          onClick={() => setSelectedFlyer(null)}
        >
          <div className="flyer-detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="flyer-detail-media-wrap">
              {selectedFlyer.imageUrl ? (
                <img
                  src={selectedFlyer.imageUrl}
                  alt={selectedFlyer.title ? `${selectedFlyer.title} flyer` : 'Uploaded flyer'}
                  className="flyer-detail-image"
                />
              ) : (
                <div className="flyer-detail-image flyer-card-image-fallback">No Image</div>
              )}
            </div>

            <div className="flyer-detail-content">
              <div className="flyer-detail-head">
                <div>
                  <p className="section-label">Flyer Details</p>
                  <h2 className="flyer-detail-title">{selectedFlyer.title || 'Untitled event'}</h2>
                </div>
                <button
                  type="button"
                  className="upload-modal-close"
                  onClick={() => setSelectedFlyer(null)}
                  aria-label="Close flyer details"
                >
                  x
                </button>
              </div>

              <p className="flyer-detail-subtitle">
                {[selectedFlyer.date, selectedFlyer.city].filter(Boolean).join(' • ') || 'Date and city not available'}
              </p>

              <div className="flyer-detail-grid">
                <div className="flyer-detail-row">
                  <span className="flyer-detail-label">Venue</span>
                  <span>{selectedFlyer.venue || 'Not provided'}</span>
                </div>
                <div className="flyer-detail-row">
                  <span className="flyer-detail-label">Genres</span>
                  <span>
                    {Array.isArray(selectedFlyer.genres) && selectedFlyer.genres.length > 0
                      ? selectedFlyer.genres.join(', ')
                      : 'Not provided'}
                  </span>
                </div>
                <div className="flyer-detail-row">
                  <span className="flyer-detail-label">DJs</span>
                  <span>
                    {Array.isArray(selectedFlyer.djs) && selectedFlyer.djs.length > 0
                      ? selectedFlyer.djs.join(', ')
                      : 'Not provided'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}