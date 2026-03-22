import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import PostModal from '../components/PostModal'
import './calendar.css'

const CITIES = ['All', 'Phoenix', 'Tucson', 'Flagstaff', 'Tempe', 'Scottsdale', 'Mesa', 'Other']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function parseLocalDate(dateStr) {
  if (!dateStr) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function formatEventDate(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isUpcoming(dateStr) {
  const d = parseLocalDate(dateStr)
  if (!d) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d >= today
}

function isSameDay(date, y, m, day) {
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === day
}

// ── Mini Calendar ─────────────────────────────────────────────────
function MiniCalendar({ year, month, eventDates, onDayClick, selectedDay }) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="cal-mini">
      <div className="cal-mini-day-names">
        {DAYS.map(d => (
          <span key={d} className="cal-mini-day-name">{d}</span>
        ))}
      </div>
      <div className="cal-mini-cells">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const hasEvent = eventDates.some(ed => isSameDay(ed, year, month, day))
          const isToday = isSameDay(today, year, month, day)
          const isSelected = selectedDay === day
          const cls = [
            'cal-mini-cell',
            isSelected  ? 'cal-mini-cell--selected'  : '',
            isToday     ? 'cal-mini-cell--today'      : '',
            hasEvent && !isSelected ? 'cal-mini-cell--has-event' : '',
          ].filter(Boolean).join(' ')
          return (
            <button key={day} type="button" onClick={() => onDayClick(day)} className={cls}>
              {day}
              {hasEvent && <span className="cal-mini-dot" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Event Card ────────────────────────────────────────────────────
function EventCard({ flyer, onClick }) {
  const genres = Array.isArray(flyer.genres) ? flyer.genres : []
  const djs = Array.isArray(flyer.djs) ? flyer.djs : []

  return (
    <article className="cal-card" onClick={onClick}>
      <div className="cal-card-accent" />

      {flyer.imageUrl ? (
        <div className="cal-card-img">
          <img src={flyer.imageUrl} alt={flyer.title || 'Event'} />
        </div>
      ) : (
        <div className="cal-card-placeholder">🎧</div>
      )}

      <div className="cal-card-body">
        <span className="cal-card-date">{formatEventDate(flyer.date)}</span>

        <div className="cal-card-info">
          <h3 className="cal-card-title">{flyer.title || 'Untitled event'}</h3>
          <div className="cal-card-meta">
            {flyer.venue && <span>🏛 {flyer.venue}</span>}
            {flyer.city  && <span>📍 {flyer.city}</span>}
          </div>
        </div>

        {genres.length > 0 && (
          <div className="cal-card-genres">
            {genres.map(g => <span key={g} className="cal-card-genre">#{g}</span>)}
          </div>
        )}

        {djs.length > 0 && (
          <p className="cal-card-djs">🎧 {djs.join(', ')}</p>
        )}
      </div>
    </article>
  )
}

// ── Main Page ─────────────────────────────────────────────────────
export default function Calendar() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [flyers, setFlyers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [cityFilter, setCityFilter] = useState('All')
  const [showPast, setShowPast] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedFlyer, setSelectedFlyer] = useState(null)

  const now = new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setCurrentUser(u))
    return () => unsub()
  }, [])

  useEffect(() => {
    const q = query(collection(db, 'flyers'), orderBy('date', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setFlyers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setIsLoading(false)
    }, err => {
      console.error('Calendar load error:', err)
      setIsLoading(false)
    })
    return () => unsub()
  }, [])

  const eventDatesThisMonth = useMemo(() => {
    return flyers
      .filter(f => {
        const d = parseLocalDate(f.date)
        return d && d.getFullYear() === calYear && d.getMonth() === calMonth
      })
      .map(f => parseLocalDate(f.date))
      .filter(Boolean)
  }, [flyers, calYear, calMonth])

  const filtered = useMemo(() => {
    return flyers.filter(f => {
      if (!f.date) return false
      if (!showPast && !isUpcoming(f.date)) return false
      if (cityFilter !== 'All' && f.city !== cityFilter) return false
      if (selectedDay !== null) {
        const d = parseLocalDate(f.date)
        return d && d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === selectedDay
      }
      return true
    })
  }, [flyers, cityFilter, showPast, selectedDay, calYear, calMonth])

  const grouped = useMemo(() => {
    if (cityFilter !== 'All') return { [cityFilter]: filtered }
    return filtered.reduce((acc, f) => {
      const city = f.city || 'Other'
      if (!acc[city]) acc[city] = []
      acc[city].push(f)
      return acc
    }, {})
  }, [filtered, cityFilter])

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
    setSelectedDay(null)
  }

  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
    setSelectedDay(null)
  }

  return (
    <AppLayout user={currentUser} title="Calendar" subtitle="Upcoming events in the Arizona underground scene.">
      <div className="cal-layout">

        {/* ── Sidebar ── */}
        <aside className="cal-sidebar">

          <div className="cal-month-nav">
            <button type="button" className="cal-month-btn" onClick={prevMonth}>‹</button>
            <span className="cal-month-label">{MONTHS[calMonth]} {calYear}</span>
            <button type="button" className="cal-month-btn" onClick={nextMonth}>›</button>
          </div>

          <MiniCalendar
            year={calYear}
            month={calMonth}
            eventDates={eventDatesThisMonth}
            onDayClick={day => setSelectedDay(prev => prev === day ? null : day)}
            selectedDay={selectedDay}
          />

          {selectedDay && (
            <button type="button" className="cal-clear-btn" onClick={() => setSelectedDay(null)}>
              ✕ Clear day filter
            </button>
          )}

          <div className="cal-filter-section">
            <p className="cal-filter-label">Filter by city</p>
            <div className="cal-filter-chips">
              {CITIES.map(city => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setCityFilter(city)}
                  className={`cal-filter-chip${cityFilter === city ? ' cal-filter-chip--active' : ''}`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <label className="cal-toggle-row">
            <span className="cal-toggle-label">Show past events</span>
            <div
              role="switch"
              aria-checked={showPast}
              tabIndex={0}
              onClick={() => setShowPast(p => !p)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowPast(p => !p) }}
              className={`cal-toggle-track${showPast ? ' cal-toggle-track--on' : ''}`}
            >
              <span className={`cal-toggle-thumb${showPast ? ' cal-toggle-thumb--on' : ''}`} />
            </div>
          </label>
        </aside>

        {/* ── Events list ── */}
        <div className="cal-events">
          {isLoading && <p className="cal-loading">Loading events...</p>}

          {!isLoading && filtered.length === 0 && (
            <div className="cal-empty">
              <span className="cal-empty-icon">📅</span>
              <p className="cal-empty-title">
                {selectedDay
                  ? `No events on ${MONTHS[calMonth]} ${selectedDay}`
                  : cityFilter !== 'All'
                    ? `No upcoming events in ${cityFilter}`
                    : 'No upcoming events'}
              </p>
              <p className="cal-empty-sub">Be the first to upload a flyer for this time period.</p>
              <button type="button" className="btn-primary" onClick={() => navigate('/upload')}>
                Upload a flyer
              </button>
            </div>
          )}

          {!isLoading && Object.entries(grouped).map(([city, events]) => (
            <div key={city} className="cal-city-group">
              <div className="cal-city-header">
                <span className="cal-city-name">📍 {city}</span>
                <span className="cal-city-count">{events.length} event{events.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="cal-card-list">
                {events.map(flyer => (
                  <EventCard key={flyer.id} flyer={flyer} onClick={() => setSelectedFlyer(flyer)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedFlyer && (
        <PostModal
          post={selectedFlyer}
          collection="flyers"
          currentUser={currentUser}
          onClose={() => setSelectedFlyer(null)}
        />
      )}
    </AppLayout>
  )
}
