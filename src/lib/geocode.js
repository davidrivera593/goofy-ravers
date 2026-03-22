import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Deterministic Firestore doc ID for a venue+city pair so we never geocode twice
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normalizeVenueName(venue) {
  return String(venue || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

const GENERIC_VENUE_WORDS = new Set([
  'venue',
  'warehouse',
  'the warehouse',
  'theater',
  'theatre',
  'club',
  'bar',
  'hall',
  'center',
  'centre',
  'studio',
  'gallery',
])

function isGenericVenueName(venue) {
  const n = normalizeVenueName(venue)
  return GENERIC_VENUE_WORDS.has(n)
}

function locationDocId(venue, city, address) {
  const base = `geo_${slugify(venue)}_${slugify(city)}`
  if (address && isGenericVenueName(venue)) {
    return `${base}_${slugify(address).slice(0, 40)}`
  }
  return base
}

function haversineDistanceMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

async function forwardGeocode(queryText, { limit = 1, proximity, types } = {}) {
  if (!MAPBOX_TOKEN) {
    console.error('Missing VITE_MAPBOX_TOKEN for geocoding.')
    return []
  }

  const queryStr = encodeURIComponent(queryText)
  const params = new URLSearchParams({
    country: 'US',
    limit: String(limit),
    access_token: MAPBOX_TOKEN,
  })

  // Bias toward Phoenix by default (kept from previous behavior)
  params.set('proximity', proximity || '-112.074,33.448')

  if (types) params.set('types', types)

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${queryStr}.json?${params.toString()}`
  const res = await fetch(url)
  const json = await res.json()
  return json.features || []
}

/**
 * Returns { lat, lng, docId } for a venue+city string.
 * Checks the Firestore `locations` cache first.
 * If not cached, calls the Mapbox Geocoding API and saves the result.
 * Returns null if geocoding fails or no result is found.
 */
export async function geocodeVenue(venue, city, opts = {}) {
  const address = typeof opts === 'string' ? opts : opts?.address
  const docId = locationDocId(venue, city, address)
  const ref = doc(db, 'locations', docId)

  // 1. Cache check — cheap Firestore read
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    return { lat: data.lat, lng: data.lng, docId }
  }

  try {
    const venueQuery = `${venue}, ${city}, Arizona`
    const addressQuery = address ? `${address}, ${city}, Arizona` : ''

    let chosen = null
    let geocodeSource = 'venue'
    let geocodeQuery = venueQuery
    let addressLatLng = null

    if (addressQuery) {
      const addrFeatures = await forwardGeocode(addressQuery, {
        limit: 1,
        types: 'address',
      })
      const addrFeature = addrFeatures[0]
      if (addrFeature?.center?.length === 2) {
        const [addrLng, addrLat] = addrFeature.center
        addressLatLng = { lng: addrLng, lat: addrLat }

        const poiFeatures = await forwardGeocode(venueQuery, {
          limit: 5,
          types: 'poi',
          proximity: `${addrLng},${addrLat}`,
        })

        if (poiFeatures.length > 0) {
          let best = poiFeatures[0]
          let bestDist = Infinity
          for (const f of poiFeatures) {
            if (!f?.center?.length) continue
            const [lng, lat] = f.center
            const dist = haversineDistanceMeters(addressLatLng, { lng, lat })
            if (dist < bestDist) {
              bestDist = dist
              best = f
            }
          }
          chosen = best
          geocodeSource = 'poi_near_address'
          geocodeQuery = `${venueQuery} (near ${addressQuery})`
        } else {
          // If we can locate the address but not a POI, pin the address itself.
          chosen = addrFeature
          geocodeSource = 'address'
          geocodeQuery = addressQuery
        }
      }
    }

    if (!chosen) {
      const features = await forwardGeocode(venueQuery, {
        limit: 1,
        types: 'poi',
      })
      chosen = features[0]
      geocodeSource = 'venue'
      geocodeQuery = venueQuery
    }

    if (!chosen?.center?.length) return null

    const [lng, lat] = chosen.center

    // 3. Cache result in Firestore
    await setDoc(ref, {
      lat,
      lng,
      name: venue,
      description: '',
      type: 'venue',
      addedBy: 'system',
      addedByName: 'Flyer Bot',
      geocodeQuery,
      geocodeSource,
      geocodePlaceName: chosen.place_name || '',
      linkedCity: city,
      linkedVenue: venue,
      linkedAddress: address || '',
      vibeCheck: null,
      vibeCheckedAt: null,
      createdAt: serverTimestamp(),
    })

    return { lat, lng, docId }
  } catch (err) {
    console.error('Geocode error for', venue, city, err)
    return null
  }
}
