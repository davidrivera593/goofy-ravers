import { useEffect, useRef, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { Map as MapGL, Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import { geocodeVenue } from '../lib/geocode'
import { callClaude } from '../lib/claude'
import './map_styles.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const INITIAL_VIEW = {
  longitude: -111.9,
  latitude: 33.5,
  zoom: 8,
}

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11'

export default function MapPage() {
  const [currentUser, setCurrentUser] = useState(null)
  const [locations, setLocations] = useState([])
  const [flyers, setFlyers] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [draftPin, setDraftPin] = useState(null)
  const [pinMode, setPinMode] = useState(false)
  const [draftForm, setDraftForm] = useState({
    type: 'spot',
    name: '',
    description: '',
  })
  const [pinSaving, setPinSaving] = useState(false)
  const [pinError, setPinError] = useState('')
  const [linkedFlyers, setLinkedFlyers] = useState([])
  const [vibeCheck, setVibeCheck] = useState('')
  const [vibeLoading, setVibeLoading] = useState(false)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [mapReady, setMapReady] = useState(false)
  const geocodeRequestedRef = useRef(new Set())

  // Auth
  useEffect(() => {
    return onAuthStateChanged(auth, setCurrentUser)
  }, [])

  // Subscribe to locations collection
  useEffect(() => {
    const q = query(collection(db, 'locations'))
    return onSnapshot(
      q,
      (snap) => {
        setLocations(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => {
        console.error('Locations listener error:', err)
      },
    )
  }, [])

  // Subscribe to flyers collection
  useEffect(() => {
    const q = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => {
        setFlyers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => {
        console.error('Flyers listener error:', err)
      },
    )
  }, [])

  // Lazy geocode flyers (deduped)
  useEffect(() => {
    const toGeocode = flyers
      .filter((f) => f.venue && f.city && f.city !== 'Other')
      .map((f) => ({
        venue: String(f.venue || '').trim(),
        city: String(f.city || '').trim(),
        address: String(f.address || '').trim(),
      }))
      .filter((x) => x.venue && x.city)

    for (const item of toGeocode) {
      const key = `${item.venue.toLowerCase()}|${item.city.toLowerCase()}|${item.address.toLowerCase()}`
      if (geocodeRequestedRef.current.has(key)) continue
      geocodeRequestedRef.current.add(key)

      geocodeVenue(item.venue, item.city, { address: item.address }).catch(
        console.error,
      )
    }
  }, [flyers])

  // When a location is selected, find linked flyers and trigger vibe check
  useEffect(() => {
    if (!selectedLocation) {
      setLinkedFlyers([])
      setVibeCheck('')
      setVibeLoading(false)
      return
    }

    if (selectedLocation.linkedVenue && selectedLocation.linkedCity) {
      const linked = flyers.filter(
        (f) =>
          f.venue?.toLowerCase() === selectedLocation.linkedVenue?.toLowerCase() &&
          f.city?.toLowerCase() === selectedLocation.linkedCity?.toLowerCase(),
      )
      setLinkedFlyers(linked)
    } else {
      setLinkedFlyers([])
    }

    if (selectedLocation.vibeCheck) {
      setVibeCheck(selectedLocation.vibeCheck)
      setVibeLoading(false)
    } else {
      generateVibeCheck(selectedLocation)
    }
  }, [selectedLocation, flyers])

  async function generateVibeCheck(location) {
    setVibeLoading(true)
    setVibeCheck('')
    try {
      const text = await callClaude({
        system:
          'You are a guide to the Arizona underground rave and electronic music scene. Write vivid, poetic, scene-specific content.',
        messages: [
          {
            role: 'user',
            content: `Write a 2-3 sentence "vibe check" for this location from an underground rave/electronic music scene perspective. Focus on the neighborhood energy, character, and why the scene gravitates here. Be poetic and local.

Location: ${location.name}
City: ${location.linkedCity || 'Arizona'}
Type: ${location.type}
${location.description ? `Notes: ${location.description}` : ''}

Respond with ONLY the vibe check text. No preamble, no quotes.`,
          },
        ],
        max_tokens: 200,
      })

      setVibeCheck(text)
      setVibeLoading(false)

      await updateDoc(doc(db, 'locations', location.id), {
        vibeCheck: text,
        vibeCheckedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Vibe check error:', err)
      setVibeLoading(false)
      setVibeCheck('Vibes unavailable right now.')
    }
  }

  const handleMarkerClick = useCallback((loc, e) => {
    e.originalEvent?.stopPropagation()
    setSelectedLocation(loc)
    setDraftPin(null)
    setPinMode(false)
    setPinError('')
  }, [])

  function getShiftKey(evt) {
    return Boolean(evt?.originalEvent?.shiftKey || evt?.srcEvent?.shiftKey)
  }

  function getLngLat(evt) {
    const ll = evt?.lngLat
    if (!ll) return null
    // react-map-gl / mapbox can provide either an object {lng,lat} or an array [lng,lat]
    if (Array.isArray(ll) && ll.length === 2) {
      return { lng: ll[0], lat: ll[1] }
    }
    if (typeof ll.lng === 'number' && typeof ll.lat === 'number') {
      return { lng: ll.lng, lat: ll.lat }
    }
    return null
  }

  const handleMapClick = useCallback(
    (e) => {
      // Create pins intentionally: Shift+Click (desktop) or pinMode (mobile)
      const wantsPin = pinMode || getShiftKey(e)
      if (!wantsPin) return

      const lngLat = getLngLat(e)
      if (!lngLat) return

      if (!currentUser) {
        setPinError('You must be logged in to drop a pin.')
        return
      }

      setSelectedLocation(null)
      setVibeCheck('')
      setVibeLoading(false)
      setLinkedFlyers([])
      setPinError('')

      setDraftPin({ lng: lngLat.lng, lat: lngLat.lat })
      setDraftForm({ type: 'spot', name: '', description: '' })
      setPinMode(false)
    },
    [currentUser, pinMode],
  )

  async function saveDraftPin() {
    if (!currentUser) {
      setPinError('You must be logged in to drop a pin.')
      return
    }
    if (!draftPin) return
    if (!draftForm.name.trim()) {
      setPinError('Name is required.')
      return
    }

    setPinSaving(true)
    setPinError('')

    try {
      const addedByName =
        currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver'

      const payload = {
        lat: draftPin.lat,
        lng: draftPin.lng,
        name: draftForm.name.trim(),
        description: draftForm.description.trim(),
        type: draftForm.type,
        addedBy: currentUser.uid,
        addedByName,
        geocodeQuery: null,
        geocodeSource: 'manual',
        geocodePlaceName: '',
        linkedCity: null,
        linkedVenue: null,
        linkedAddress: null,
        vibeCheck: null,
        vibeCheckedAt: null,
        createdAt: serverTimestamp(),
      }

      const ref = await addDoc(collection(db, 'locations'), payload)
      setDraftPin(null)
      setSelectedLocation({ id: ref.id, ...payload })
    } catch (err) {
      console.error('Save pin error:', err)
      const msg = String(err?.message || '')
      if (msg.toLowerCase().includes('missing or insufficient permissions')) {
        setPinError('Firestore rules blocked saving this pin (missing permissions).')
      } else {
        setPinError('Could not save pin. Please try again.')
      }
    } finally {
      setPinSaving(false)
    }
  }

  return (
    <AppLayout
      user={currentUser}
      title="Map"
      subtitle="Arizona underground rave venues and spots."
    >
      <div className="map-page">
        <div className="map-container">
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <MapGL
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              onLoad={() => setMapReady(true)}
              onClick={handleMapClick}
              mapboxAccessToken={MAPBOX_TOKEN}
              mapStyle={MAP_STYLE}
              style={{ position: 'absolute', inset: 0 }}
            >
              <NavigationControl position="top-right" />

              {mapReady &&
                locations.map((loc) => (
                  <Marker
                    key={loc.id}
                    longitude={loc.lng}
                    latitude={loc.lat}
                    anchor="bottom"
                    onClick={(e) => handleMarkerClick(loc, e)}
                  >
                    <div
                      className={`map-marker map-marker-${loc.type}`}
                      title={loc.name}
                    >
                      {loc.type === 'venue'
                        ? '◆'
                        : loc.type === 'event'
                          ? '★'
                          : '●'}
                    </div>
                  </Marker>
                ))}

              {mapReady && draftPin && (
                <Marker
                  longitude={draftPin.lng}
                  latitude={draftPin.lat}
                  anchor="bottom"
                  onClick={(e) => e.originalEvent?.stopPropagation()}
                >
                  <div
                    className={`map-marker map-marker-${draftForm.type} map-marker-draft`}
                    title="New pin"
                  >
                    ＋
                  </div>
                </Marker>
              )}
            </MapGL>
          </div>

          {/* Side panel */}
          {draftPin && (
            <aside className="map-panel">
              <div className="map-panel-header">
                <div>
                  <span
                    className={`map-panel-type-badge map-panel-type-${draftForm.type}`}
                  >
                    new {draftForm.type}
                  </span>
                  <h2 className="map-panel-title">Drop a pin</h2>
                  <p className="map-panel-meta">Shift+Click places it</p>
                </div>
                <button
                  className="map-panel-close"
                  onClick={() => {
                    setDraftPin(null)
                    setPinMode(false)
                    setPinError('')
                  }}
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>

              <div className="map-add-body">
                {pinError && <p className="map-add-error">{pinError}</p>}

                <div className="map-add-form">
                  <label>
                    Type
                    <select
                      value={draftForm.type}
                      onChange={(e) =>
                        setDraftForm((p) => ({ ...p, type: e.target.value }))
                      }
                      disabled={pinSaving}
                    >
                      <option value="spot">Spot</option>
                      <option value="venue">Venue</option>
                      <option value="event">Event</option>
                    </select>
                  </label>

                  <label>
                    Name
                    <input
                      type="text"
                      placeholder="e.g. Warehouse spot"
                      value={draftForm.name}
                      onChange={(e) =>
                        setDraftForm((p) => ({ ...p, name: e.target.value }))
                      }
                      disabled={pinSaving}
                    />
                  </label>

                  <label>
                    Notes (optional)
                    <input
                      type="text"
                      placeholder="Cross streets, vibe notes…"
                      value={draftForm.description}
                      onChange={(e) =>
                        setDraftForm((p) => ({ ...p, description: e.target.value }))
                      }
                      disabled={pinSaving}
                    />
                  </label>
                </div>

                <div className="map-add-actions">
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setDraftPin(null)
                      setPinMode(false)
                      setPinError('')
                    }}
                    disabled={pinSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={saveDraftPin}
                    disabled={pinSaving || !draftForm.name.trim()}
                  >
                    {pinSaving ? 'Saving…' : 'Save pin'}
                  </button>
                </div>
              </div>
            </aside>
          )}

          {selectedLocation && !draftPin && (
            <aside className="map-panel">
              <div className="map-panel-header">
                <div>
                  <span
                    className={`map-panel-type-badge map-panel-type-${selectedLocation.type}`}
                  >
                    {selectedLocation.type}
                  </span>
                  <h2 className="map-panel-title">{selectedLocation.name}</h2>
                  <p className="map-panel-meta">
                    Added by {selectedLocation.addedByName}
                  </p>
                </div>
                <button
                  className="map-panel-close"
                  onClick={() => setSelectedLocation(null)}
                  aria-label="Close panel"
                >
                  ✕
                </button>
              </div>

              {selectedLocation.description && (
                <p className="map-panel-desc">
                  {selectedLocation.description}
                </p>
              )}

              {/* Claude vibe check */}
              <div className="map-panel-vibe">
                <p className="section-label">Vibe Check ✦</p>
                {vibeLoading ? (
                  <p className="map-panel-vibe-loading">
                    Claude is reading the vibes…
                  </p>
                ) : (
                  <p className="map-panel-vibe-text">{vibeCheck}</p>
                )}
              </div>

              {/* Linked flyer events */}
              {linkedFlyers.length > 0 && (
                <div className="map-panel-events">
                  <p className="section-label">Events Here</p>
                  {linkedFlyers.map((flyer) => (
                    <div key={flyer.id} className="map-panel-event-card">
                      {flyer.imageUrl && (
                        <img
                          src={flyer.imageUrl}
                          alt={flyer.title}
                          className="map-panel-event-img"
                        />
                      )}
                      <div className="map-panel-event-info">
                        <div className="map-panel-event-title">
                          {flyer.title}
                        </div>
                        <div className="map-panel-event-meta">
                          {[flyer.date, flyer.city]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {linkedFlyers.length === 0 && !vibeLoading && (
                <p className="map-panel-no-events">
                  No flyers linked to this spot yet.
                </p>
              )}
            </aside>
          )}
        </div>

        {/* Legend */}
        <div className="map-legend">
          <button
            type="button"
            className={`btn-secondary map-legend-pin-btn${pinMode ? ' active' : ''}`}
            onClick={() => {
              setPinError('')
              setDraftPin(null)
              setSelectedLocation(null)
              setPinMode((v) => !v)
            }}
          >
            {pinMode ? 'Tap map to place…' : 'Drop pin'}
          </button>
          <span className="map-legend-item">Shift+Click also works</span>
          <span className="map-legend-item">
            <span className="map-legend-dot map-legend-venue">◆</span> Venue
          </span>
          <span className="map-legend-item">
            <span className="map-legend-dot map-legend-spot">●</span> Spot
          </span>
          <span className="map-legend-item">
            <span className="map-legend-dot map-legend-event">★</span> Event
            Pin
          </span>
        </div>
      </div>
    </AppLayout>
  )
}
