import { useEffect, useState, useCallback } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
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
  const [linkedFlyers, setLinkedFlyers] = useState([])
  const [vibeCheck, setVibeCheck] = useState('')
  const [vibeLoading, setVibeLoading] = useState(false)
  const [viewState, setViewState] = useState(INITIAL_VIEW)
  const [mapReady, setMapReady] = useState(false)

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

  // Lazy geocode flyers
  useEffect(() => {
    const toGeocode = flyers.filter(
      (f) => f.venue && f.city && f.city !== 'Other',
    )
    for (const flyer of toGeocode) {
      geocodeVenue(flyer.venue, flyer.city).catch(console.error)
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
  }, [])

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
            </MapGL>
          </div>

          {/* Side panel */}
          {selectedLocation && (
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
                          {flyer.title || 'Untitled event'}
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
