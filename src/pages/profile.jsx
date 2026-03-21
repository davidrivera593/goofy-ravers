import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'

export default function Profile() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)

  // Profile fields
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Edit draft state
  const [draftName, setDraftName] = useState('')
  const [draftBio, setDraftBio] = useState('')

  // Posts
  const [posts, setPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load user profile doc from Firestore
  useEffect(() => {
    if (!currentUser) return

    const userDocRef = doc(db, 'users', currentUser.uid)
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setDisplayName(data.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio(data.bio || '')
      } else {
        // No profile doc yet — use auth defaults
        setDisplayName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio('')
      }
    })

    return () => unsubscribe()
  }, [currentUser])

  // Load this user's posts
  useEffect(() => {
    if (!currentUser) return

    const postsQuery = query(
      collection(db, 'flyers'),
      where('uploadedBy', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        setPosts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
        setIsLoadingPosts(false)
      },
      (err) => {
        console.error('Failed to load posts:', err)
        setIsLoadingPosts(false)
      },
    )

    return () => unsubscribe()
  }, [currentUser])

  function handleEditStart() {
    setDraftName(displayName)
    setDraftBio(bio)
    setIsEditing(true)
    setSaveMsg('')
  }

  function handleEditCancel() {
    setIsEditing(false)
    setSaveMsg('')
  }

  async function handleSave() {
    if (!currentUser || !draftName.trim()) return
    setIsSaving(true)
    setSaveMsg('')
    try {
      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          displayName: draftName.trim(),
          bio: draftBio.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setIsEditing(false)
      setSaveMsg('Profile saved.')
    } catch (err) {
      console.error('Failed to save profile:', err)
      setSaveMsg('Could not save. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const initials = displayName ? displayName[0].toUpperCase() : '?'

  return (
    <AppLayout user={currentUser}>
      {/* ── Profile header ── */}
      <div className="profile-header">
        <div className="profile-avatar-lg">{initials}</div>

        <div className="profile-info">
          {isEditing ? (
            <>
              <input
                className="profile-name-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Display name"
                maxLength={40}
              />
              <textarea
                className="profile-bio-input"
                value={draftBio}
                onChange={(e) => setDraftBio(e.target.value)}
                placeholder="Tell the scene about yourself..."
                rows={3}
                maxLength={200}
              />
              <div className="profile-edit-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={isSaving || !draftName.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleEditCancel}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="profile-name-row">
                <h1 className="profile-name">{displayName}</h1>
                <button
                  type="button"
                  className="profile-edit-btn"
                  onClick={handleEditStart}
                >
                  Edit profile
                </button>
              </div>
              {bio
                ? <p className="profile-bio">{bio}</p>
                : <p className="profile-bio profile-bio-empty">No bio yet — click Edit profile to add one.</p>
              }
            </>
          )}

          {saveMsg && (
            <p className="profile-save-msg">{saveMsg}</p>
          )}

          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{isLoadingPosts ? '—' : posts.length}</span>
              <span className="profile-stat-label">posts</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Personal posts ── */}
      <p className="section-label" style={{ marginTop: '40px' }}>Your posts</p>

      {isLoadingPosts && <p className="flyers-status">Loading your posts...</p>}

      {!isLoadingPosts && posts.length === 0 && (
        <div className="feed-empty">
          <div className="feed-empty-icon">🎴</div>
          <p className="feed-empty-title">No posts yet</p>
          <p className="feed-empty-sub">Upload your first flyer to populate your wall.</p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => navigate('/upload')}
          >
            Upload a flyer
          </button>
        </div>
      )}

      <div className="feed">
        {posts.map((post) => (
          <article key={post.id} className="feed-post">
            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt={post.title ? `${post.title} flyer` : 'Flyer'}
                className="feed-post-image"
              />
            )}

            <div className="feed-post-body">
              <div className="feed-post-header">
                <div className="feed-post-avatar">{initials}</div>
                <div>
                  <div className="feed-post-name">{displayName}</div>
                  {post.uploadedAt?.toDate && (
                    <div className="feed-post-date">
                      {post.uploadedAt.toDate().toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </div>
                  )}
                </div>
              </div>

              <h2 className="feed-post-title">{post.title || 'Untitled event'}</h2>

              <div className="feed-post-meta">
                {post.date && <span>📅 {post.date}</span>}
                {post.city && <span>📍 {post.city}</span>}
                {post.venue && <span>🏛 {post.venue}</span>}
              </div>

              {Array.isArray(post.genres) && post.genres.length > 0 && (
                <div className="feed-post-tags">
                  {post.genres.map((g) => (
                    <span key={g} className="feed-tag">#{g}</span>
                  ))}
                </div>
              )}

              {Array.isArray(post.djs) && post.djs.length > 0 && (
                <p className="feed-post-djs">🎧 {post.djs.join(', ')}</p>
              )}

              {post.description && (
                <p className="feed-post-desc">{post.description}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </AppLayout>
  )
}
