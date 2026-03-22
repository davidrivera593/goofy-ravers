import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { auth, db, storage } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import './upload_styles.css'
import { callClaude } from '../lib/claude'

const CITIES = ['Phoenix', 'Tucson', 'Flagstaff', 'Tempe', 'Scottsdale', 'Mesa', 'Other']
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024

const EMPTY_FORM = {
  title: '',
  date: '',
  venue: '',
  address: '',
  city: '',
  genres: '',
  djs: '',
  description: '',
}

export default function Upload() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [currentUser, setCurrentUser] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [status, setStatus] = useState('idle') // idle | parsing | uploading | done | error
  const [errorMsg, setErrorMsg] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setCurrentUser(user))
    return () => unsubscribe()
  }, [])

  function handleFile(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Only image files are allowed.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImageFile(null)
      setImagePreview(null)
      setErrorMsg('Image must be 2 MB or smaller.')
      setStatus('error')
      return
    }
    setErrorMsg('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    parseWithClaude(file)
  }

  function handleFileInput(e) {
    handleFile(e.target.files?.[0])
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  // ── Claude AI parser ──────────────────────────────────────────────
  // Converts image to base64 then sends to Claude via Firebase Function proxy.
  // Fills in the form fields automatically.
  async function parseWithClaude(file) {
    setStatus('parsing')
    try {
      const base64 = await fileToBase64(file)

      const text = await callClaude({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: file.type,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `You are parsing event flyers for an Arizona underground rave and electronic music platform. The cities we operate in are: Phoenix, Tucson, Flagstaff, Tempe, Scottsdale, Mesa.

Venue/location hints: venue names often include words like Venue, Warehouse, Theater/Theatre. Treat those as strong signals of the venue name (not the event title). If the flyer includes a street address or cross streets, extract it.

Extract event details from this flyer and return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "title": "the event or night name (not the venue name) or empty string",
  "date": "date in YYYY-MM-DD format — if no year is listed assume ${new Date().getFullYear()} — or empty string",
  "venue": "the physical venue or club name or empty string",
  "address": "street address and/or cross streets (e.g. '123 W Example St' or '7th St & Roosevelt') or empty string",
  "city": "must be exactly one of: Phoenix, Tucson, Flagstaff, Tempe, Scottsdale, Mesa, Other — or empty string",
  "genres": "comma-separated music genres (e.g. techno, house, dnb, psytrance) or empty string",
  "djs": "comma-separated performer and DJ names exactly as written on the flyer or empty string",
  "description": "any additional details from the flyer such as ticket info, age restrictions, dress code, promoter notes, or other text not captured by the other fields — or empty string"
}`,
              },
            ],
          },
        ],
      })

      const clean = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)

      setForm({
        title: parsed.title ?? '',
        date: parsed.date ?? '',
        venue: parsed.venue ?? '',
        address: parsed.address ?? '',
        city: parsed.city ?? '',
        genres: parsed.genres ?? '',
        djs: parsed.djs ?? '',
        description: parsed.description ?? '',
      })
      setStatus('idle')
    } catch (err) {
      console.error('Claude parse error:', err)
      // Non-fatal — user can fill in manually
      setStatus('idle')
    }
  }

  // ── Submit ────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault()

    const validationError = validateFlyerForm({ form, imageFile, currentUser })
    if (validationError) {
      setErrorMsg(validationError)
      setStatus('error')
      return
    }

    try {
      setErrorMsg('')
      setStatus('uploading')
      setUploadProgress(0)

      // 1. Upload image to Firebase Storage
      const storageRef = ref(storage, `flyers/${currentUser.uid}/${Date.now()}_${imageFile.name}`)
      const uploadTask = uploadBytesResumable(storageRef, imageFile)

      const imageUrl = await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snap) => {
            setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100))
          },
          reject,
          async () => {
            setUploadProgress(100)
            const url = await getDownloadURL(uploadTask.snapshot.ref)
            resolve(url)
          },
        )
      })

      // Fetch user avatar to store on the flyer
      let avatarUrl = ''
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
        if (userSnap.exists()) avatarUrl = userSnap.data().avatarUrl || ''
      } catch { /* non-fatal */ }

      const payload = buildFlyerPayload({ form, currentUser, imageUrl, avatarUrl })

      // 2. Write Firestore document with schema and wait for Firebase response
      const docRef = await addDoc(collection(db, 'flyers'), payload)

      if (!docRef?.id) {
        throw new Error('Firebase did not return a document id.')
      }

      // 3. Verify document exists before routing
      const savedDoc = await getDoc(doc(db, 'flyers', docRef.id))
      if (!savedDoc.exists()) {
        throw new Error('Upload finished but Firestore document was not found.')
      }

      setStatus('done')
      navigate('/flyers', { replace: true })
    } catch (err) {
      console.error(err)
      setErrorMsg(err?.message || 'Upload failed. Please try again.')
      setStatus('error')
    }
  }

  function handleField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <AppLayout
      user={currentUser}
      title="Upload Flyer"
      subtitle="Drop your flyer image — Claude will auto-fill the details."
    >
      <div className="upload-page">
        <form className="upload-form" onSubmit={handleSubmit}>

          {/* ── Drop zone ── */}
          <div
            className={`drop-zone${isDragging ? ' dragging' : ''}${imagePreview ? ' has-image' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            {imagePreview ? (
              <>
                <button
                  type="button"
                  className="btn-secondary drop-zone-reupload"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  Choose different image
                </button>

                <a
                  href={imagePreview}
                  target="_blank"
                  rel="noreferrer"
                  className="drop-zone-preview-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={imagePreview}
                    alt="Flyer preview"
                    className="drop-zone-preview"
                  />
                </a>
              </>
            ) : (
              <div className="drop-zone-empty">
                <span className="drop-zone-icon">🎴</span>
                <p className="drop-zone-label">Drop flyer image here</p>
                <p className="drop-zone-sub">JPG, PNG, WEBP · Max 2 MB · Click or drag</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          {/* ── Status banner ── */}
          {status === 'parsing' && (
            <div className="upload-banner parsing">
              <span className="upload-banner-dot" />
              Claude is reading your flyer...
            </div>
          )}
          {status === 'uploading' && (
            <div className="upload-banner uploading">
              <div className="upload-progress-bar">
                <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              Uploading... {uploadProgress}%
            </div>
          )}
          {status === 'done' && (
            <div className="upload-banner done">✓ Uploaded! Redirecting to flyers...</div>
          )}
          {errorMsg && (
            <div className="upload-banner error">{errorMsg}</div>
          )}

          {/* ── Form fields ── */}
          {imagePreview && (
            <div className="upload-fields">
              <p className="section-label" style={{ marginBottom: '20px' }}>
                {status === 'parsing' ? 'Claude is filling these in...' : 'Review & edit details'}
              </p>

              <div className="upload-fields-grid">
                <div className="upload-field">
                  <label className="upload-field-label" htmlFor="title">Event title</label>
                  <input
                    id="title"
                    className="upload-field-input"
                    type="text"
                    placeholder="e.g. Desert Frequencies Vol. 3"
                    value={form.title}
                    onChange={(e) => handleField('title', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field">
                  <label className="upload-field-label" htmlFor="date">Date</label>
                  <input
                    id="date"
                    className="upload-field-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => handleField('date', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field">
                  <label className="upload-field-label" htmlFor="venue">Venue</label>
                  <input
                    id="venue"
                    className="upload-field-input"
                    type="text"
                    placeholder="e.g. The Van Buren"
                    value={form.venue}
                    onChange={(e) => handleField('venue', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field">
                  <label className="upload-field-label" htmlFor="address">
                    Address <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    id="address"
                    className="upload-field-input"
                    type="text"
                    placeholder="e.g. 123 W Sample St or 7th St & Roosevelt"
                    value={form.address}
                    onChange={(e) => handleField('address', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field">
                  <label className="upload-field-label" htmlFor="city">City</label>
                  <select
                    id="city"
                    className="upload-field-input"
                    value={form.city}
                    onChange={(e) => handleField('city', e.target.value)}
                    disabled={status === 'parsing'}
                  >
                    <option value="">Select city</option>
                    {CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="upload-field upload-field-full">
                  <label className="upload-field-label" htmlFor="genres">
                    Genres <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(comma separated)</span>
                  </label>
                  <input
                    id="genres"
                    className="upload-field-input"
                    type="text"
                    placeholder="e.g. techno, house, dnb"
                    value={form.genres}
                    onChange={(e) => handleField('genres', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field upload-field-full">
                  <label className="upload-field-label" htmlFor="djs">
                    DJs <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(comma separated)</span>
                  </label>
                  <input
                    id="djs"
                    className="upload-field-input"
                    type="text"
                    placeholder="e.g. DJ Stingray, Surgeon"
                    value={form.djs}
                    onChange={(e) => handleField('djs', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>

                <div className="upload-field upload-field-full">
                  <label className="upload-field-label" htmlFor="description">
                    Description <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    id="description"
                    className="upload-field-input upload-field-textarea"
                    placeholder="Ticket info, age restrictions, dress code, promoter notes..."
                    value={form.description}
                    onChange={(e) => handleField('description', e.target.value)}
                    disabled={status === 'parsing'}
                  />
                </div>
              </div>

              <div className="upload-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate('/flyers')}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={
                    status === 'parsing' ||
                    status === 'uploading' ||
                    status === 'done' ||
                    !imageFile ||
                    !form.title.trim() ||
                    !form.date.trim() ||
                    !form.city.trim()
                  }
                >
                  {status === 'uploading' ? `Uploading ${uploadProgress}%` : 'Submit flyer'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </AppLayout>
  )
}

// ── Helpers ───────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function validateFlyerForm({ form, imageFile, currentUser }) {
  if (!currentUser) return 'You must be logged in to upload a flyer.'
  if (!imageFile) return 'Please select a flyer image first.'
  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) return 'Image must be 2 MB or smaller.'
  if (!form.title.trim()) return 'Event title is required.'
  if (!form.date.trim()) return 'Event date is required.'
  if (!form.city.trim()) return 'City is required.'

  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (!datePattern.test(form.date.trim())) {
    return 'Date must be in YYYY-MM-DD format.'
  }

  return ''
}

function buildFlyerPayload({ form, currentUser, imageUrl, avatarUrl }) {
  return {
    imageUrl,
    uploadedBy: currentUser.uid,
    uploadedByName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver',
    uploadedByAvatar: avatarUrl || '',
    uploadedAt: serverTimestamp(),
    title: form.title.trim(),
    date: form.date.trim(),
    venue: form.venue.trim(),
    address: form.address.trim(),
    city: form.city.trim(),
    genres: form.genres
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
    djs: form.djs
      .split(',')
      .map((dj) => dj.trim())
      .filter(Boolean),
    description: form.description.trim(),
    parsed: form.title.trim() !== '',
  }
}
