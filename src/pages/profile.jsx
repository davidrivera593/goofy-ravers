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
import PostModal from '../components/PostModal'

const STATUS_COLLAPSE_CHARS = 180

function mergeByDate(a, b) {
  return [...a, ...b].sort((x, y) => {
    const tx = x.uploadedAt?.toMillis?.() ?? 0
    const ty = y.uploadedAt?.toMillis?.() ?? 0
    return ty - tx
  })
}

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

function PostHeader({ post, displayName, initials }) {
  const posterName = displayName || post.uploadedByName || 'Raver'
  const initial = initials || posterName[0].toUpperCase()
  return (
    <div className="feed-post-header">
      <div className="feed-post-avatar">{initial}</div>
      <div>
        <div className="feed-post-name">{posterName}</div>
        {post.uploadedAt?.toDate && (
          <div className="feed-post-date">
            {post.uploadedAt.toDate().toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FlyerPost({ post, onClick, displayName, initials }) {
  return (
    <article className="feed-post feed-post-clickable" onClick={onClick}>
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt={post.title ? `${post.title} flyer` : 'Flyer'}
          className="feed-post-image"
        />
      )}
      <div className="feed-post-body">
        <PostHeader post={post} displayName={displayName} initials={initials} />
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

function StatusPost({ post, onClick, displayName, initials }) {
  const isLong = post.text && post.text.length > STATUS_COLLAPSE_CHARS
  const displayText = isLong
    ? post.text.slice(0, STATUS_COLLAPSE_CHARS).trimEnd() + '…'
    : post.text
  return (
    <article className="feed-post feed-post-status feed-post-clickable" onClick={onClick}>
      <div className="feed-post-body">
        <PostHeader post={post} displayName={displayName} initials={initials} />
        {post.imageUrl && (
          <img src={post.imageUrl} alt="Post image" className="feed-post-status-image" />
        )}
        <div className="feed-post-status-text-wrap feed-post-status-collapsed">
          <p className="feed-post-status-text">{displayText}</p>
          {isLong && <div className="feed-post-status-fade" />}
        </div>
        <CardCounts post={post} />
      </div>
    </article>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [draftName, setDraftName] = useState('')
  const [draftBio, setDraftBio] = useState('')

  const [flyers, setFlyers] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null) // { id, col }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load user profile doc
  useEffect(() => {
    if (!currentUser) return
    const userDocRef = doc(db, 'users', currentUser.uid)
    return onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setDisplayName(data.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio(data.bio || '')
      } else {
        setDisplayName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio('')
      }
    })
  }, [currentUser])

  // Load user's flyers
  useEffect(() => {
    if (!currentUser) return
    const q = query(
      collection(db, 'flyers'),
      where('uploadedBy', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setFlyers(snap.docs.map((d) => ({ id: d.id, _col: 'flyers', ...d.data() })))
      setIsLoadingPosts(false)
    }, (err) => {
      console.error('Failed to load flyers:', err)
      setIsLoadingPosts(false)
    })
  }, [currentUser])

  // Load user's status posts
  useEffect(() => {
    if (!currentUser) return
    const q = query(
      collection(db, 'posts'),
      where('uploadedBy', '==', currentUser.uid),
      orderBy('uploadedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setStatusPosts(snap.docs.map((d) => ({ id: d.id, _col: 'posts', ...d.data() })))
    }, (err) => {
      console.error('Failed to load posts:', err)
    })
  }, [currentUser])

  const posts = mergeByDate(flyers, statusPosts)

  const liveSelectedPost = selectedPost
    ? posts.find((p) => p.id === selectedPost.id && p._col === selectedPost.col) ?? null
    : null

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
        { displayName: draftName.trim(), bio: draftBio.trim(), updatedAt: serverTimestamp() },
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

          {saveMsg && <p className="profile-save-msg">{saveMsg}</p>}

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
        {posts.map((post) => {
          const openModal = () => setSelectedPost({ id: post.id, col: post._col })
          return post.postType === 'status'
            ? <StatusPost key={post.id} post={post} onClick={openModal} displayName={displayName} initials={initials} />
            : <FlyerPost key={post.id} post={post} onClick={openModal} displayName={displayName} initials={initials} />
        })}
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
