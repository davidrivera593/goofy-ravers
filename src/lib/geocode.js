import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// Deterministic Firestore doc ID for a venue+city pair so we never geocode twice
function locationDocId(venue, city) {
  const slug = (s) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `geo_${slug(venue)}_${slug(city)}`
}

/**
 * Returns { lat, lng, docId } for a venue+city string.
 * Checks the Firestore `locations` cache first.
 * If not cached, calls the Mapbox Geocoding API and saves the result.
 * Returns null if geocoding fails or no result is found.
 */
export async function geocodeVenue(venue, city) {
  const docId = locationDocId(venue, city)
  const ref = doc(db, 'locations', docId)

  // 1. Cache check — cheap Firestore read
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const data = snap.data()
    return { lat: data.lat, lng: data.lng, docId }
  }

  // 2. Geocode via Mapbox — biased toward Phoenix, AZ
  const queryStr = encodeURIComponent(`${venue}, ${city}, Arizona`)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${queryStr}.json?country=US&proximity=-112.074,33.448&limit=1&access_token=${MAPBOX_TOKEN}`

  try {
    const res = await fetch(url)
    const json = await res.json()
    const feature = json.features?.[0]
    if (!feature) return null

    const [lng, lat] = feature.center

    // 3. Cache result in Firestore
    await setDoc(ref, {
      lat,
      lng,
      name: venue,
      description: '',
      type: 'venue',
      addedBy: 'system',
      addedByName: 'Flyer Bot',
      geocodeQuery: `${venue}, ${city}, Arizona`,
      linkedCity: city,
      linkedVenue: venue,
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
