import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore'
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

function getCountdownLabel(dateStr) {
  if (!dateStr) return null
  const eventDate = new Date(dateStr + 'T23:59:59')
  const now = new Date()
  const diffMs = eventDate - now
  if (diffMs < 0) return null
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

function PostHeader({ post, name, avatar }) {
  return (
    <div className="feed-post-header">
      <div className="feed-post-avatar">
        {avatar
          ? <img src={avatar} alt="" className="feed-post-avatar-img" />
          : (name || 'R')[0].toUpperCase()
        }
      </div>
      <div>
        <div className="feed-post-name">{name}</div>
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

function FlyerPost({ post, onClick, name, avatar }) {
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
        <PostHeader post={post} name={name} avatar={avatar} />
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

function StatusPost({ post, onClick, name, avatar }) {
  const isLong = post.text && post.text.length > STATUS_COLLAPSE_CHARS
  const displayText = isLong
    ? post.text.slice(0, STATUS_COLLAPSE_CHARS).trimEnd() + '…'
    : post.text
  return (
    <article className="feed-post feed-post-status feed-post-clickable" onClick={onClick}>
      <div className="feed-post-body">
        <PostHeader post={post} name={name} avatar={avatar} />
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

export default function UserProfile() {
  const { uid } = useParams()
  const [currentUser, setCurrentUser] = useState(null)
  const [profileName, setProfileName] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileAvatar, setProfileAvatar] = useState('')
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)

  const [flyers, setFlyers] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u))
    return () => unsub()
  }, [])

  // Load profile user's doc
  useEffect(() => {
    if (!uid) return
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data()
        setProfileName(d.displayName || 'Raver')
        setProfileBio(d.bio || '')
        setProfileAvatar(d.avatarUrl || '')
      } else {
        setProfileName('Raver')
        setProfileBio('')
        setProfileAvatar('')
      }
      setIsLoadingProfile(false)
    }, (err) => {
      console.error('Failed to load profile:', err)
      setIsLoadingProfile(false)
    })
  }, [uid])

  // Load profile user's flyers
  useEffect(() => {
    if (!uid) return
    const q = query(
      collection(db, 'flyers'),
      where('uploadedBy', '==', uid),
      orderBy('uploadedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setFlyers(snap.docs.map((d) => ({ id: d.id, _col: 'flyers', ...d.data() })))
      setIsLoadingPosts(false)
    }, (err) => {
      console.error('Failed to load flyers:', err)
      setIsLoadingPosts(false)
    })
  }, [uid])

  // Load profile user's status posts
  useEffect(() => {
    if (!uid) return
    const q = query(
      collection(db, 'posts'),
      where('uploadedBy', '==', uid),
    )
    return onSnapshot(q, (snap) => {
      setStatusPosts(snap.docs.map((d) => ({ id: d.id, _col: 'posts', ...d.data() })))
    }, (err) => {
      console.error('Failed to load posts:', err)
    })
  }, [uid])

  const posts = mergeByDate(flyers, statusPosts)

  const liveSelectedPost = selectedPost
    ? posts.find((p) => p.id === selectedPost.id && p._col === selectedPost.col) ?? null
    : null

  const initials = profileName ? profileName[0].toUpperCase() : '?'

  if (isLoadingProfile) {
    return (
      <AppLayout user={currentUser}>
        <p className="flyers-status">Loading profile...</p>
      </AppLayout>
    )
  }

  return (
    <AppLayout user={currentUser}>
      {/* Profile header */}
      <div className="profile-header">
        <div className="profile-avatar-lg">
          {profileAvatar
            ? <img src={profileAvatar} alt="Avatar" className="profile-avatar-img" />
            : initials
          }
        </div>
        <div className="profile-info">
          <div className="profile-name-row">
            <h1 className="profile-name">{profileName}</h1>
          </div>
          {profileBio
            ? <p className="profile-bio" style={{ whiteSpace: 'pre-wrap' }}>{profileBio}</p>
            : <p className="profile-bio profile-bio-empty">No bio yet.</p>
          }
          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{isLoadingPosts ? '—' : posts.length}</span>
              <span className="profile-stat-label">posts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      <p className="section-label" style={{ marginTop: '40px' }}>Posts</p>

      {isLoadingPosts && <p className="flyers-status">Loading posts...</p>}

      {!isLoadingPosts && posts.length === 0 && (
        <div className="feed-empty">
          <div className="feed-empty-icon">🎴</div>
          <p className="feed-empty-title">No posts yet</p>
        </div>
      )}

      <div className="feed">
        {posts.map((post) => {
          const openModal = () => setSelectedPost({ id: post.id, col: post._col })
          return post.postType === 'status'
            ? <StatusPost key={post.id} post={post} onClick={openModal} name={profileName} avatar={profileAvatar} />
            : <FlyerPost key={post.id} post={post} onClick={openModal} name={profileName} avatar={profileAvatar} />
        })}
      </div>

      {liveSelectedPost && (
        <PostModal
          post={liveSelectedPost}
          collection={liveSelectedPost._col}
          currentUser={currentUser}
          avatarCache={{ [uid]: profileAvatar }}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </AppLayout>
  )
}
