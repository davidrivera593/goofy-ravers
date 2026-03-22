import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '../firebase/config'
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

function getCountdownLabel(dateStr) {
  if (!dateStr) return null
  const eventDate = new Date(dateStr + 'T23:59:59')
  const now = new Date()
  const diffMs = eventDate - now
  if (diffMs < 0) return null // past event
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'TONIGHT'
  if (diffDays === 1) return 'TOMORROW'
  if (diffDays <= 7) return `${diffDays} DAYS AWAY`
  return null
}

function CardCounts({ post }) {
  const likeCount = Array.isArray(post.likes) ? post.likes.length : 0
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : 0
  const goingCount = Array.isArray(post.going) ? post.going.length : 0
  return (
    <div className="feed-post-counts">
      <span className="feed-post-count">♥ {likeCount}</span>
      <span className="feed-post-count">💬 {commentCount}</span>
      {post.postType !== 'status' && (
        <span className="feed-post-count">✋ {goingCount}</span>
      )}
    </div>
  )
}

function PostHeader({ post, avatarCache }) {
  const posterName = post.uploadedByName || 'Raver'
  const avatar = post.uploadedByAvatar || (avatarCache && avatarCache[post.uploadedBy]) || ''
  return (
    <div className="feed-post-header">
      <div className="feed-post-avatar">
        {avatar
          ? <img src={avatar} alt="" className="feed-post-avatar-img" />
          : posterName[0].toUpperCase()
        }
      </div>
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

function FlyerPost({ post, onClick, avatarCache }) {
  const countdown = getCountdownLabel(post.date)
  return (
    <article className="feed-post feed-post-clickable" onClick={onClick}>
      {post.imageUrl && (
        <div className="feed-post-image-wrap">
          <img
            src={post.imageUrl}
            alt={post.title ? `${post.title} flyer` : 'Flyer'}
            className="feed-post-image"
          />
          {countdown && (
            <span className={`feed-post-countdown${countdown === 'TONIGHT' ? ' tonight' : ''}`}>
              {countdown}
            </span>
          )}
        </div>
      )}
      <div className="feed-post-body">
        <PostHeader post={post} avatarCache={avatarCache} />
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

function StatusPost({ post, onClick, avatarCache }) {
  const isLong = post.text && post.text.length > STATUS_COLLAPSE_CHARS
  const displayText = isLong
    ? post.text.slice(0, STATUS_COLLAPSE_CHARS).trimEnd() + '…'
    : post.text
  return (
    <article className="feed-post feed-post-status feed-post-clickable" onClick={onClick}>
      <div className="feed-post-body">
        <PostHeader post={post} avatarCache={avatarCache} />
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

// ── Status composer ──────────────────────────────────────────────────────────
const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB

function StatusComposer({ currentUser, avatarCache }) {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const displayName =
    currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'
  const myAvatar = (avatarCache && avatarCache[currentUser?.uid]) || ''

  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      return
    }
    if (file.size > MAX_POST_IMAGE_SIZE) {
      setError('Image must be 5 MB or smaller.')
      return
    }
    setError('')
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleRemoveImage() {
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleCancel() {
    setExpanded(false)
    setText('')
    setError('')
    handleRemoveImage()
  }

  async function handlePost() {
    if (!text.trim() && !imageFile) return
    setPosting(true)
    setError('')
    try {
      // Fetch latest avatar URL to store on the post
      let avatarUrl = myAvatar
      if (!avatarUrl && currentUser?.uid) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
          if (userSnap.exists()) avatarUrl = userSnap.data().avatarUrl || ''
        } catch (_) { /* non-fatal */ }
      }

      // Upload image if attached
      let imageUrl = ''
      if (imageFile) {
        const fileRef = storageRef(storage, `posts/${currentUser.uid}/${Date.now()}_${imageFile.name}`)
        await uploadBytes(fileRef, imageFile)
        imageUrl = await getDownloadURL(fileRef)
      }

      await addDoc(collection(db, 'posts'), {
        postType: 'status',
        text: text.trim(),
        imageUrl,
        uploadedBy: currentUser.uid,
        uploadedByName: displayName,
        uploadedByAvatar: avatarUrl,
        uploadedAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
      })
      setText('')
      handleRemoveImage()
      setExpanded(false)
    } catch (err) {
      console.error('Failed to post:', err)
      setError('Could not post. Try again.')
    } finally {
      setPosting(false)
    }
  }

  if (!expanded) {
    return (
      <div
        className="feed-compose"
        onClick={() => setExpanded(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(true) }}
      >
        <div className="feed-compose-avatar">
          {myAvatar
            ? <img src={myAvatar} alt="" className="feed-post-avatar-img" />
            : displayName[0].toUpperCase()
          }
        </div>
        <div className="feed-compose-input">Drop a flyer or share what's happening...</div>
        <button
          type="button"
          className="upload-flyer-btn feed-compose-btn"
          onClick={(e) => { e.stopPropagation(); navigate('/upload') }}
        >
          Upload flyer
        </button>
      </div>
    )
  }

  return (
    <div className="feed-compose feed-compose-expanded">
      <div className="feed-compose-top">
        <div className="feed-compose-avatar">
          {myAvatar
            ? <img src={myAvatar} alt="" className="feed-post-avatar-img" />
            : displayName[0].toUpperCase()
          }
        </div>
        <textarea
          className="feed-compose-textarea"
          placeholder="What's happening in the scene?"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          maxLength={1000}
        />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="feed-compose-image-preview">
          <img src={imagePreview} alt="Attachment preview" />
          <button
            type="button"
            className="feed-compose-image-remove"
            onClick={handleRemoveImage}
            aria-label="Remove image"
          >
            ✕
          </button>
        </div>
      )}

      {error && <p className="feed-compose-error">{error}</p>}
      <div className="feed-compose-actions">
        <div className="feed-compose-actions-left">
          <button
            type="button"
            className="feed-compose-photo-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={posting}
            title="Add a photo"
          >
            📷 Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />
          <button
            type="button"
            className="feed-compose-flyer-link"
            onClick={() => navigate('/upload')}
          >
            + Upload a flyer instead
          </button>
        </div>
        <div className="feed-compose-actions-right">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePost}
            disabled={posting || (!text.trim() && !imageFile)}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [flyers, setFlyers] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null) // { id, col }
  const [avatarCache, setAvatarCache] = useState({}) // uid → avatarUrl

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Listen to all user docs for avatar URLs
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      const cache = {}
      snap.docs.forEach((d) => {
        const data = d.data()
        if (data.avatarUrl) cache[d.id] = data.avatarUrl
      })
      setAvatarCache(cache)
    }, (err) => {
      console.error('Failed to load user avatars:', err)
    })
  }, [])

  // Live feed — flyers collection
  useEffect(() => {
    const q = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setFlyers(snap.docs.map((d) => ({ id: d.id, _col: 'flyers', ...d.data() })))
      setIsLoadingPosts(false)
    }, (err) => {
      console.error('Failed to load flyers:', err)
      setIsLoadingPosts(false)
    })
  }, [])

  // Live feed — status posts collection
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('uploadedAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setStatusPosts(snap.docs.map((d) => ({ id: d.id, _col: 'posts', ...d.data() })))
    }, (err) => {
      console.error('Failed to load posts:', err)
    })
  }, [])

  const posts = mergeByDate(flyers, statusPosts)

  // Derive the live post from state so likes update in real time
  const liveSelectedPost = selectedPost
    ? posts.find((p) => p.id === selectedPost.id && p._col === selectedPost.col) ?? null
    : null

  return (
    <AppLayout
      user={currentUser}
      title="Feed"
      subtitle="What's happening in the AZ underground scene."
      headerAction={
        <button
          type="button"
          className="upload-flyer-btn"
          onClick={() => navigate('/upload')}
        >
          + New post
        </button>
      }
    >
      {currentUser && <StatusComposer currentUser={currentUser} avatarCache={avatarCache} />}

      <p className="section-label" style={{ marginTop: '32px' }}>Latest posts</p>

      {isLoadingPosts && <p className="flyers-status">Loading feed...</p>}

      {!isLoadingPosts && posts.length === 0 && (
        <div className="feed-empty">
          <div className="feed-empty-icon">🎴</div>
          <p className="feed-empty-title">Nothing here yet</p>
          <p className="feed-empty-sub">Be the first to post a flyer.</p>
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
            ? <StatusPost key={post.id} post={post} onClick={openModal} avatarCache={avatarCache} />
            : <FlyerPost key={post.id} post={post} onClick={openModal} avatarCache={avatarCache} />
        })}
      </div>

      {liveSelectedPost && (
        <PostModal
          post={liveSelectedPost}
          collection={liveSelectedPost._col}
          currentUser={currentUser}
          avatarCache={avatarCache}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </AppLayout>
  )
}
