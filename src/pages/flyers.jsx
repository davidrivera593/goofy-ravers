import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/AppLayout'

const CITIES = ['Phoenix', 'Tucson', 'Flagstaff', 'Tempe', 'Scottsdale', 'Mesa', 'Other']

function normalizeText(s) {
  return String(s || '').toLowerCase().trim()
}

function isUpcoming(dateStr) {
  if (!dateStr) return false
  // dateStr is expected YYYY-MM-DD
  const eventDate = new Date(`${dateStr}T23:59:59`)
  const now = new Date()
  return eventDate >= now
}

function flyerSearchHaystack(flyer) {
  const parts = [
    flyer.title,
    flyer.venue,
    flyer.city,
    flyer.address,
    flyer.description,
    Array.isArray(flyer.genres) ? flyer.genres.join(' ') : flyer.genres,
    Array.isArray(flyer.djs) ? flyer.djs.join(' ') : flyer.djs,
  ]
  return normalizeText(parts.filter(Boolean).join(' '))
}

function GenreDropdown({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  const selected = Array.isArray(value) ? value : []
  const label =
    selected.length === 0
      ? 'Genres'
      : selected.length <= 2
        ? `Genres: ${selected.join(', ')}`
        : `Genres: ${selected.length} selected`

  useEffect(() => {
    if (!open) return undefined

    function onDocDown(e) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDocDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggleGenre(g) {
    const next = selected.includes(g)
      ? selected.filter((x) => x !== g)
      : [...selected, g]
    onChange(next)
  }

  return (
    <div className="filter-dropdown" ref={rootRef}>
      <button
        type="button"
        className={`filter-dropdown-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="filter-dropdown-label">{label}</span>
        <span className="filter-dropdown-caret">▾</span>
      </button>

      {open && (
        <div className="filter-dropdown-panel" role="listbox" aria-label="Genres">
          {options.length === 0 ? (
            <div className="filter-dropdown-empty">No genres yet</div>
          ) : (
            options.map((g) => (
              <label key={g} className="filter-dropdown-item">
                <input
                  type="checkbox"
                  checked={selected.includes(g)}
                  onChange={() => toggleGenre(g)}
                />
                <span>{g}</span>
              </label>
            ))
          )}

          <div className="filter-dropdown-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Flyers() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const [flyers, setFlyers] = useState([])
  const [isLoadingFlyers, setIsLoadingFlyers] = useState(true)
  const [flyersError, setFlyersError] = useState('')
  const [selectedFlyer, setSelectedFlyer] = useState(null)

  const [search, setSearch] = useState('')
  const [venueSearch, setVenueSearch] = useState('')
  const [city, setCity] = useState('')
  const [genres, setGenres] = useState([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [upcomingOnly, setUpcomingOnly] = useState(false)
  const [sortBy, setSortBy] = useState('uploaded_desc')

  useEffect(() => {
    const flyersQuery = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'))

    const unsubscribe = onSnapshot(
      flyersQuery,
      (snapshot) => {
        const nextFlyers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

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

  const filteredFlyers = useMemo(() => {
    const q = normalizeText(search)
    const venueQ = normalizeText(venueSearch)
    const cityNorm = normalizeText(city)

    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null
    const genreNorms = Array.isArray(genres)
      ? genres.map((g) => normalizeText(g)).filter(Boolean)
      : []

    const filtered = flyers.filter((f) => {
      if (!f.title?.trim()) return false
      if (cityNorm && normalizeText(f.city) !== cityNorm) return false
      if (upcomingOnly && !isUpcoming(f.date)) return false

      if (from || to) {
        if (!f.date) return false
        const d = new Date(`${f.date}T12:00:00`)
        if (from && d < from) return false
        if (to && d > to) return false
      }

      if (venueQ) {
        const v = normalizeText(f.venue)
        if (!v.includes(venueQ)) return false
      }

      if (genreNorms.length > 0) {
        const flyerGenres = Array.isArray(f.genres)
          ? f.genres.map((g) => normalizeText(g)).filter(Boolean)
          : []
        const matches = genreNorms.some((g) => flyerGenres.includes(g))
        if (!matches) return false
      }

      if (q) {
        const hay = flyerSearchHaystack(f)
        if (!hay.includes(q)) return false
      }
      return true
    })

    const sorted = [...filtered]
    const getUploadedMillis = (f) => f.uploadedAt?.toMillis?.() ?? 0
    const getDateMillis = (f) => (f.date ? new Date(`${f.date}T12:00:00`).getTime() : Infinity)

    if (sortBy === 'uploaded_asc') {
      sorted.sort((a, b) => getUploadedMillis(a) - getUploadedMillis(b))
    } else if (sortBy === 'date_asc') {
      sorted.sort((a, b) => getDateMillis(a) - getDateMillis(b))
    } else if (sortBy === 'date_desc') {
      sorted.sort((a, b) => getDateMillis(b) - getDateMillis(a))
    } else {
      // uploaded_desc
      sorted.sort((a, b) => getUploadedMillis(b) - getUploadedMillis(a))
    }

    return sorted
  }, [flyers, search, venueSearch, city, genres, dateFrom, dateTo, upcomingOnly, sortBy])

  const genreOptions = useMemo(() => {
    const set = new Set()
    for (const f of flyers) {
      if (!Array.isArray(f.genres)) continue
      for (const g of f.genres) {
        const n = normalizeText(g)
        if (n) set.add(n)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [flyers])

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

      <div className="filter-bar" role="region" aria-label="Flyer filters">
        <input
          className="filter-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, venue, DJs, genres…"
          aria-label="Search flyers"
        />

        <input
          className="filter-input filter-input-venue"
          value={venueSearch}
          onChange={(e) => setVenueSearch(e.target.value)}
          placeholder="Venue only"
          aria-label="Search by venue"
        />

        <select
          className="filter-select"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label="Filter by city"
        >
          <option value="">All cities</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <GenreDropdown options={genreOptions} value={genres} onChange={setGenres} />

        <input
          className="filter-select filter-date"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label="From date"
        />
        <input
          className="filter-select filter-date"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label="To date"
        />

        <button
          type="button"
          className={`btn-secondary filter-pill${upcomingOnly ? ' active' : ''}`}
          onClick={() => setUpcomingOnly((v) => !v)}
          aria-pressed={upcomingOnly}
        >
          Upcoming
        </button>

        <select
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort"
        >
          <option value="uploaded_desc">Newest</option>
          <option value="uploaded_asc">Oldest</option>
          <option value="date_asc">Upcoming soonest</option>
          <option value="date_desc">Event date latest</option>
        </select>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setSearch('')
            setVenueSearch('')
            setCity('')
            setGenres([])
            setDateFrom('')
            setDateTo('')
            setUpcomingOnly(false)
            setSortBy('uploaded_desc')
          }}
          disabled={!search && !venueSearch && !city && genres.length === 0 && !dateFrom && !dateTo && !upcomingOnly && sortBy === 'uploaded_desc'}
        >
          Clear
        </button>
      </div>

      {isLoadingFlyers && <p className="flyers-status">Loading flyers...</p>}
      {flyersError && <p className="flyers-status flyers-status-error">{flyersError}</p>}

      {!isLoadingFlyers && !flyersError && (
        <p className="flyers-status">
          Showing {filteredFlyers.length} of {flyers.length}
        </p>
      )}

      <section className="dashboard-grid">
        {!isLoadingFlyers && !flyersError && flyers.length === 0 && (
          <article className="dash-card flyer-card-empty" style={{ cursor: 'default' }}>
            <div className="dash-card-icon">🎴</div>
            <div className="dash-card-title">No flyers yet</div>
            <div className="dash-card-desc">Upload the first flyer to populate this board.</div>
          </article>
        )}

        {!isLoadingFlyers && !flyersError && flyers.length > 0 && filteredFlyers.length === 0 && (
          <article className="dash-card flyer-card-empty" style={{ cursor: 'default' }}>
            <div className="dash-card-icon">🔎</div>
            <div className="dash-card-title">No matches</div>
            <div className="dash-card-desc">Try clearing filters or searching something else.</div>
          </article>
        )}

        {filteredFlyers.map((flyer) => (
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
              <div className="dash-card-title">{flyer.title}</div>
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
                  <h2 className="flyer-detail-title">{selectedFlyer.title}</h2>
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