import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import PostModal from '../components/PostModal'
import StatusComposer from '../components/StatusComposer'

/**
 * TODO: add upcoming events sidebar or above/below feed with calendar view and list view
 */

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

function normalize(v) {
  return String(v || '').toLowerCase().trim()
}

function postMatchesQuery(post, q) {
  const query = normalize(q)
  if (!query) return true

  const chunks = [
    post.postType,
    post.uploadedByName,
    post.title,
    post.venue,
    post.city,
    post.address,
    post.description,
    post.text,
    Array.isArray(post.djs) ? post.djs.join(' ') : '',
    Array.isArray(post.genres) ? post.genres.join(' ') : '',
  ]

  const haystack = normalize(chunks.filter(Boolean).join(' '))
  return haystack.includes(query)
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
  const [searchQuery, setSearchQuery] = useState('')

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
  const filteredPosts = searchQuery.trim()
    ? posts.filter((p) => postMatchesQuery(p, searchQuery))
    : posts

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
      {currentUser && (
        <StatusComposer
          currentUser={currentUser}
          myAvatarUrl={avatarCache[currentUser.uid] || ''}
        />
      )}

      <div className="filter-bar" role="region" aria-label="Feed search">
        <input
          className="filter-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search feed (title, venue, city, DJs, status text...)"
        />
        <button
          type="button"
          className="btn-secondary filter-pill"
          onClick={() => setSearchQuery('')}
          disabled={!searchQuery.trim()}
        >
          Clear
        </button>
      </div>

      {!isLoadingPosts && (
        <p className="flyers-status">
          Showing {filteredPosts.length} of {posts.length}
        </p>
      )}

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

      {!isLoadingPosts && posts.length > 0 && filteredPosts.length === 0 && (
        <p className="flyers-status">No matches. Try a different search.</p>
      )}

      <div className="feed">
        {filteredPosts.map((post) => {
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
