import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage'
import { auth, db, storage } from '../firebase/config'
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
function FlyerPost({ post, onClick }) {
  const posterName = post.uploadedByName || 'Raver'
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

function StatusPost({ post, onClick }) {
  const posterName = post.uploadedByName || 'Raver'
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

// ── Inline status composer ─────────────────────────────────────────
function StatusComposer({ currentUser, displayName, onCancel }) {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [isPosting, setIsPosting] = useState(false)
  const [error, setError] = useState('')

  function handleImage(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function removeImage() {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handlePost() {
    if (!text.trim() || !currentUser) return
    setIsPosting(true)
    setError('')
    try {
      let imageUrl = null
      if (imageFile) {
        const storageRef = ref(storage, `statuses/${currentUser.uid}/${Date.now()}_${imageFile.name}`)
        const task = uploadBytesResumable(storageRef, imageFile)
        imageUrl = await new Promise((resolve, reject) => {
          task.on('state_changed', null, reject, async () => {
            resolve(await getDownloadURL(task.snapshot.ref))
          })
        })
      }

      // Status posts go to the 'posts' collection — separate from flyers
      await addDoc(collection(db, 'posts'), {
        postType: 'status',
        text: text.trim(),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        imageUrl,
        uploadedBy: currentUser.uid,
        uploadedByName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver',
        uploadedAt: serverTimestamp(),
      })

      setText('')
      setTags('')
      removeImage()
      onCancel()
    } catch (err) {
      console.error('Failed to post status:', err)
      setError('Could not post. Try again.')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className="feed-compose feed-compose-expanded">
      <div className="feed-compose-top">
        <div className="feed-compose-avatar">{displayName[0].toUpperCase()}</div>
        <textarea
          className="feed-compose-textarea"
          placeholder="What's happening in the AZ scene?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
        />
      </div>

      {imagePreview && (
        <div className="feed-compose-image-preview-wrap">
          <img src={imagePreview} alt="Preview" className="feed-compose-image-preview" />
          <button type="button" className="feed-compose-image-remove" onClick={removeImage}>✕</button>
        </div>
      )}

      <input
        className="feed-compose-tags-input"
        type="text"
        placeholder="Tags (comma separated) — e.g. techno, phoenix"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />

      {error && <p className="feed-compose-error">{error}</p>}

      <div className="feed-compose-actions">
        <div className="feed-compose-actions-left">
          <button
            type="button"
            className="feed-compose-image-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
          >
            📎 Photo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImage}
          />
          <button
            type="button"
            className="feed-compose-flyer-link"
            onClick={() => navigate('/upload')}
          >
            Upload a flyer instead →
          </button>
        </div>
        <div className="feed-compose-actions-right">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isPosting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePost}
            disabled={!text.trim() || isPosting}
          >
            {isPosting ? 'Posting...' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Merge + sort two snapshot arrays by uploadedAt desc ────────────
function mergeByDate(flyers, statusPosts) {
  return [...flyers, ...statusPosts].sort((a, b) => {
    const aMs = a.uploadedAt?.toMillis?.() ?? 0
    const bMs = b.uploadedAt?.toMillis?.() ?? 0
    return bMs - aMs
  })
}

// ── Dashboard ──────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [flyers, setFlyers] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [loadingFlyers, setLoadingFlyers] = useState(true)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [isComposing, setIsComposing] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null) // { post, collection }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load flyers collection (community feed)
  useEffect(() => {
    const q = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setFlyers(snapshot.docs.map((doc) => ({ id: doc.id, _col: 'flyers', ...doc.data() })))
        setLoadingFlyers(false)
      },
      (err) => {
        console.error('Failed to load flyers feed:', err)
        setLoadingFlyers(false)
      },
    )
    return () => unsubscribe()
  }, [])

  // Load posts collection (status updates)
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('uploadedAt', 'desc'))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setStatusPosts(snapshot.docs.map((doc) => ({ id: doc.id, _col: 'posts', ...doc.data() })))
        setLoadingStatus(false)
      },
      (err) => {
        console.error('Failed to load status feed:', err)
        setLoadingStatus(false)
      },
    )
    return () => unsubscribe()
  }, [])

  const isLoading = loadingFlyers || loadingStatus
  const posts = mergeByDate(flyers, statusPosts)
  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'

  // Always derive live post from feed state so likes update in real-time
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
          + Upload flyer
        </button>
      }
    >
      {/* ── Compose area ── */}
      {isComposing ? (
        <StatusComposer
          currentUser={currentUser}
          displayName={displayName}
          onCancel={() => setIsComposing(false)}
        />
      ) : (
        <div className="feed-compose" onClick={() => setIsComposing(true)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsComposing(true) }}
        >
          <div className="feed-compose-avatar">{displayName[0].toUpperCase()}</div>
          <div className="feed-compose-input">What's happening?</div>
          <button
            type="button"
            className="upload-flyer-btn feed-compose-btn"
            onClick={(e) => { e.stopPropagation(); navigate('/upload') }}
          >
            Upload flyer
          </button>
        </div>
      )}

      {/* ── Community feed ── */}
      <p className="section-label" style={{ marginTop: '32px' }}>Latest posts</p>

      {isLoading && <p className="flyers-status">Loading feed...</p>}

      {!isLoading && posts.length === 0 && (
        <div className="feed-empty">
          <div className="feed-empty-icon">🎴</div>
          <p className="feed-empty-title">Nothing here yet</p>
          <p className="feed-empty-sub">Be the first to post.</p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '16px' }}
            onClick={() => setIsComposing(true)}
          >
            Write something
          </button>
        </div>
      )}

      <div className="feed">
        {posts.map((post) =>
          post.postType === 'status'
            ? <StatusPost key={`${post._col}-${post.id}`} post={post}
                onClick={() => setSelectedPost({ id: post.id, col: post._col })} />
            : <FlyerPost key={`${post._col}-${post.id}`} post={post}
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
