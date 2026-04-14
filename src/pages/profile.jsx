import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/AppLayout'
import PostModal from '../components/PostModal'
import StatusComposer from '../components/StatusComposer'

const STATUS_COLLAPSE_CHARS = 180

function mergeByDate(a, b) {
  return [...a, ...b].sort((x, y) => {
    const tx = x.uploadedAt?.toMillis?.() ?? 0
    const ty = y.uploadedAt?.toMillis?.() ?? 0
    return ty - tx
  })
}

function extractYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
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

function PostHeader({ post, displayName, initials, avatarUrl }) {
  const posterName = displayName || post.uploadedByName || 'Raver'
  const initial = initials || posterName[0].toUpperCase()
  const avatar = avatarUrl || post.uploadedByAvatar || ''
  return (
    <div className="feed-post-header">
      <div className="feed-post-avatar">
        {avatar
          ? <img src={avatar} alt="" className="feed-post-avatar-img" />
          : initial
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

function FlyerPost({ post, onClick, displayName, initials, avatarUrl }) {
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
        <PostHeader post={post} displayName={displayName} initials={initials} avatarUrl={avatarUrl} />
        <h2 className="feed-post-title">{post.title}</h2>
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

function StatusPost({ post, onClick, displayName, initials, avatarUrl }) {
  const isLong = post.text && post.text.length > STATUS_COLLAPSE_CHARS
  const displayText = isLong
    ? post.text.slice(0, STATUS_COLLAPSE_CHARS).trimEnd() + '…'
    : post.text
  const ytVideoId = extractYouTubeId(post.youtubeUrl)
  return (
    <article className="feed-post feed-post-status feed-post-clickable" onClick={onClick}>
      <div className="feed-post-body">
        <PostHeader post={post} displayName={displayName} initials={initials} avatarUrl={avatarUrl} />
        {post.imageUrl && (
          <img src={post.imageUrl} alt="Post image" className="feed-post-status-image" />
        )}
        {!post.imageUrl && ytVideoId && (
          <div className="feed-post-youtube-thumb">
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/hqdefault.jpg`}
              alt="YouTube video thumbnail"
            />
            <div className="feed-post-youtube-play">▶</div>
          </div>
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

const PAGE_SIZE = 10

export default function Profile() {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [favoriteTrackUrl, setFavoriteTrackUrl] = useState('')
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const [draftName, setDraftName] = useState('')
  const [draftBio, setDraftBio] = useState('')
  const [draftFavoriteTrackUrl, setDraftFavoriteTrackUrl] = useState('')
  const [trackSearch, setTrackSearch] = useState('')

  const [flyers, setFlyers] = useState([])
  const [statusPosts, setStatusPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)
  const [selectedPost, setSelectedPost] = useState(null) // { id, col }
  const [composeOpen, setComposeOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Load user profile doc
  useEffect(() => {
    if (!currentUser) return
    const userDocRef = doc(db, 'users', currentUser.uid)
    return onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setDisplayName(data.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio(data.bio || '')
        setAvatarUrl(data.avatarUrl || '')
        setFavoriteTrackUrl(data.favoriteTrackUrl || '')
      } else {
        setDisplayName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver')
        setBio('')
        setAvatarUrl('')
        setFavoriteTrackUrl('')
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
    setDraftFavoriteTrackUrl(favoriteTrackUrl)
    setTrackSearch('')
    setIsEditing(true)
    setSaveMsg('')
  }

  function handleEditCancel() {
    setIsEditing(false)
    setSaveMsg('')
  }

  function isSoundCloudUrl(url) {
    if (!url) return false
    try {
      const u = new URL(url)
      const h = u.hostname.toLowerCase()
      return (
        h === 'soundcloud.com' ||
        h.endsWith('.soundcloud.com') ||
        h === 'on.soundcloud.com' ||
        h === 'm.soundcloud.com'
      )
    } catch {
      return false
    }
  }

  function getSoundCloudPlayerSrc(trackUrl) {
    if (!trackUrl || !isSoundCloudUrl(trackUrl)) return ''
    const url = encodeURIComponent(trackUrl)
    return `https://w.soundcloud.com/player/?url=${url}&color=%23f5e214&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=false`
  }

  async function handleSave() {
    if (!currentUser || !draftName.trim()) return
    setIsSaving(true)
    setSaveMsg('')
    try {
      const cleanedTrackUrl = draftFavoriteTrackUrl.trim()
      if (cleanedTrackUrl && !isSoundCloudUrl(cleanedTrackUrl)) {
        setSaveMsg('Please paste a valid SoundCloud track URL.')
        setIsSaving(false)
        return
      }

      const newName = draftName.trim()

      await setDoc(
        doc(db, 'users', currentUser.uid),
        {
          displayName: newName,
          bio: draftBio.trim(),
          favoriteTrackUrl: cleanedTrackUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      // Propagate new name to all existing posts and flyers
      if (newName !== displayName) {
        const batch = writeBatch(db)
        ;[...flyers, ...statusPosts].forEach((post) => {
          batch.update(doc(db, post._col, post.id), { uploadedByName: newName })
        })
        await batch.commit()
      }

      setIsEditing(false)
      setSaveMsg('Profile saved.')
    } catch (err) {
      console.error('Failed to save profile:', err)
      setSaveMsg('Could not save. Try again.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) {
      setSaveMsg('Image too large. Max 5 MB.')
      return
    }
    setAvatarUploading(true)
    setSaveMsg('')
    try {
      const fileRef = storageRef(storage, `avatars/${currentUser.uid}`)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)
      await setDoc(
        doc(db, 'users', currentUser.uid),
        { avatarUrl: url, updatedAt: serverTimestamp() },
        { merge: true },
      )
      setSaveMsg('Avatar updated!')
    } catch (err) {
      console.error('Avatar upload failed:', err)
      setSaveMsg('Upload failed. Try again.')
    } finally {
      setAvatarUploading(false)
    }
  }

  const initials = displayName ? displayName[0].toUpperCase() : '?'
  const yearJoined = currentUser?.metadata?.creationTime
    ? new Date(currentUser.metadata.creationTime).getFullYear()
    : null

  const playerSrc = getSoundCloudPlayerSrc(
    isEditing ? draftFavoriteTrackUrl.trim() : favoriteTrackUrl.trim(),
  )

  return (
    <AppLayout user={currentUser}>
      {/* ── Profile header ── */}
      <div className="profile-header">
        <label className="profile-avatar-lg profile-avatar-upload" title="Change avatar">
          {avatarUrl
            ? <img src={avatarUrl} alt="Avatar" className="profile-avatar-img" />
            : initials
          }
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            disabled={avatarUploading}
            className="profile-avatar-file-input"
          />
          <span className="profile-avatar-overlay">
            {avatarUploading ? '…' : '📷'}
          </span>
        </label>
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
                maxLength={500}
              />

              <div className="profile-track-edit">
                <label className="profile-track-label" htmlFor="favoriteTrackUrl">
                  Favorite SoundCloud track
                </label>
                <input
                  id="favoriteTrackUrl"
                  className="profile-track-input"
                  value={draftFavoriteTrackUrl}
                  onChange={(e) => setDraftFavoriteTrackUrl(e.target.value)}
                  placeholder="Paste a SoundCloud track URL"
                  disabled={isSaving}
                />

                <div className="profile-track-search">
                  <input
                    className="profile-track-search-input"
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder="Search SoundCloud (opens new tab)"
                    disabled={isSaving}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      const q = encodeURIComponent(trackSearch.trim() || draftName.trim() || displayName)
                      window.open(`https://soundcloud.com/search/sounds?q=${q}`, '_blank', 'noreferrer')
                    }}
                    disabled={isSaving}
                  >
                    Search
                  </button>
                </div>

                {playerSrc && (
                  <div className="profile-track-embed">
                    <iframe
                      title="SoundCloud player preview"
                      width="100%"
                      height="166"
                      scrolling="no"
                      frameBorder="no"
                      allow="autoplay"
                      loading="lazy"
                      src={playerSrc}
                    />
                  </div>
                )}
              </div>

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

              {playerSrc && (
                <div className="profile-track-view">
                  <p className="section-label" style={{ margin: '10px 0 8px' }}>
                    Favorite track
                  </p>
                  <div className="profile-track-embed">
                    <iframe
                      title="SoundCloud player"
                      width="100%"
                      height="166"
                      scrolling="no"
                      frameBorder="no"
                      allow="autoplay"
                      loading="lazy"
                      src={playerSrc}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {saveMsg && <p className="profile-save-msg">{saveMsg}</p>}

          <div className="profile-stats">
            <div className="profile-stat">
              <span className="profile-stat-value">{isLoadingPosts ? '—' : posts.length}</span>
              <span className="profile-stat-label">posts</span>
            </div>
            {yearJoined && (
              <div className="profile-stat">
                <span className="profile-stat-value">{yearJoined}</span>
                <span className="profile-stat-label">joined</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Personal posts ── */}
      <div className="dashboard-header-top" style={{ marginTop: '56px', marginBottom: '20px', paddingTop: '24px' }}>
        <p className="section-label" style={{ margin: 0 }}>Your posts</p>
      </div>

      {currentUser && (
        <StatusComposer
          currentUser={currentUser}
          myAvatarUrl={avatarUrl}
          forceExpand={composeOpen}
          showCreateBtn={true}
          onExpandedChange={(open) => {
            if (!open) setComposeOpen(false)
          }}
        />
      )}

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
        {posts.slice(0, visibleCount).map((post) => {
          const openModal = () => setSelectedPost({ id: post.id, col: post._col })
          return post.postType === 'status'
            ? <StatusPost key={post.id} post={post} onClick={openModal} displayName={displayName} initials={initials} avatarUrl={avatarUrl} />
            : <FlyerPost key={post.id} post={post} onClick={openModal} displayName={displayName} initials={initials} avatarUrl={avatarUrl} />
        })}
      </div>

      {visibleCount < posts.length && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      )}

      {liveSelectedPost && (
        <PostModal
          post={liveSelectedPost}
          collection={liveSelectedPost._col}
          currentUser={currentUser}
          avatarCache={{ [currentUser?.uid]: avatarUrl }}
          onClose={() => setSelectedPost(null)}
        />
      )}
    </AppLayout>
  )
}
