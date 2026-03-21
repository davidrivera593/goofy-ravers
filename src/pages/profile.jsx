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

// ── Merge + sort helper ────────────────────────────────────────────
function mergeByDate(a, b) {
  return [...a, ...b].sort((x, y) => {
    const xMs = x.uploadedAt?.toMillis?.() ?? 0
    const yMs = y.uploadedAt?.toMillis?.() ?? 0
    return yMs - xMs
  })
}
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import PostModal from '../components/PostModal'

// ── Shared post header (avatar + name + date) ─────────────────────
function PostHeader({ name, uploadedAt }) {
  return (
    <div className="feed-post-header">
      <div className="feed-post-avatar">{name[0].toUpperCase()}</div>
      <div>
        <div className="feed-post-name">{name}</div>
        {uploadedAt?.toDate && (
          <div className="feed-post-date">
            {uploadedAt.toDate().toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared card footer: like + comment counts ─────────────────────
function CardCounts({ post }) {
  const likeCount = Array.isArray(post.likes) ? post.likes.length : 0
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : 0
  return (
    <div className="feed-post-counts">
      <span className="feed-post-count">♥ {likeCount}</span>
      <span className="feed-post-count">💬 {commentCount}</span>
    </div>
  )
}

// ── Flyer post card ────────────────────────────────────────────────
function FlyerPost({ post, displayName, onClick }) {
  const posterName = post.uploadedByName || displayName || 'Raver'
  return (
    <article className="feed-post feed-post-clickable" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
    >
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt={post.title ? `${post.title} flyer` : 'Flyer'}
          className="feed-post-image"
        />
      )}
      <div className="feed-post-body">
        <PostHeader name={posterName} uploadedAt={post.uploadedAt} />
        <h2 className="feed-post-title">{post.title || 'Untitled event'}</h2>
        <div className="feed-post-meta">
          {post.date && <span>📅 {post.date}</span>}
          {post.city && <span>📍 {post.city}</span>}
          {post.venue && <span>🏛 {post.venue}</span>}
        </div>
        {Array.isArray(post.genres) && post.genres.length > 0 && (
          <div className="feed-post-tags">
            {post.genres.map((g) => <span key={g} className="feed-tag">#{g}</span>)}
          </div>
        )}
        {Array.isArray(post.djs) && post.djs.length > 0 && (
          <p className="feed-post-djs">🎧 {post.djs.join(', ')}</p>
        )}
        {post.description && (
          <p className="feed-post-desc">{post.description}</p>
        )}
        <CardCounts post={post} />
      </div>
    </article>
  )
}

// ── Status post card ───────────────────────────────────────────────
const STATUS_COLLAPSE_CHARS = 180

function StatusPost({ post, displayName, onClick }) {
  const posterName = post.uploadedByName || displayName || 'Raver'
  const isLong = post.text && post.text.length > STATUS_COLLAPSE_CHARS
  const displayText = isLong
    ? post.text.slice(0, STATUS_COLLAPSE_CHARS).trimEnd() + '…'
    : post.text

  return (
    <article className="feed-post feed-post-status feed-post-clickable" onClick={onClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.() }}
    >
      <div className="feed-post-body">
        <PostHeader name={posterName} uploadedAt={post.uploadedAt} />
        <div className="feed-post-status-text-wrap feed-post-status-collapsed">
          <p className="feed-post-status-text">{displayText}</p>
          {isLong && <div className="feed-post-status-fade" />}
        </div>
        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="Status image"
            className="feed-post-status-image"
          />
        )}
        {Array.isArray(post.tags) && post.tags.length > 0 && (
          <div className="feed-post-tags">
            {post.tags.map((t) => <span key={t} className="feed-tag">#{t}</span>)}
          </div>
        )}
        <CardCounts post={post} />
      </div>
    </article>
  )
}

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

  // Posts — from both collections
  const [flyerPosts, setFlyerPosts] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [loadingFlyers, setLoadingFlyers] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null) // { post, collection }

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

  // Load this user's flyers
  useEffect(() => {
    if (!currentUser) return

    const q = query(
      collection(db, 'flyers'),
      where('uploadedBy', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFlyerPosts(snapshot.docs.map((d) => ({ id: d.id, _col: 'flyers', ...d.data() })))
        setLoadingFlyers(false)
      },
      (err) => {
        console.error('Failed to load flyer posts:', err)
        setLoadingFlyers(false)
      },
    )

    return () => unsubscribe()
  }, [currentUser])

  // Load this user's status posts
  useEffect(() => {
    if (!currentUser) return

    const q = query(
      collection(db, 'posts'),
      where('uploadedBy', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setStatusPosts(snapshot.docs.map((d) => ({ id: d.id, _col: 'posts', ...d.data() })))
        setLoadingStatus(false)
      },
      (err) => {
        console.error('Failed to load status posts:', err)
        setLoadingStatus(false)
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

  const isLoadingPosts = loadingFlyers || loadingStatus
  const posts = mergeByDate(flyerPosts, statusPosts)
  const initials = displayName ? displayName[0].toUpperCase() : '?'

  // Derive live post so likes update in real-time without reopening
  const liveSelectedPost = selectedPost
    ? posts.find((p) => p.id === selectedPost.id && p._col === selectedPost.col) ?? null
    : null

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
                rows={5}
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
                ? <p className="profile-bio" style={{ whiteSpace: 'pre-wrap' }}>{bio}</p>
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
            {currentUser?.metadata?.creationTime && (
              <div className="profile-stat">
                <span className="profile-stat-value">
                  {new Date(currentUser.metadata.creationTime).getFullYear()}
                </span>
                <span className="profile-stat-label">joined</span>
              </div>
            )}
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
        {posts.map((post) =>
          post.postType === 'status'
            ? <StatusPost key={`${post._col}-${post.id}`} post={post} displayName={displayName}
                onClick={() => setSelectedPost({ id: post.id, col: post._col })} />
            : <FlyerPost key={`${post._col}-${post.id}`} post={post} displayName={displayName}
                onClick={() => setSelectedPost({ id: post.id, col: post._col })} />,
        )}
      </div>

      {liveSelectedPost && (
        <PostModal
          post={liveSelectedPost}
          collection={liveSelectedPost._col}
          currentUser={currentUser}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </AppLayout>
  )
}
