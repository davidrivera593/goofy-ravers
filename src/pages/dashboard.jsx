import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'

export default function Dashboard() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [isLoadingPosts, setIsLoadingPosts] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  // Load all users' posts — community feed
  useEffect(() => {
    const postsQuery = query(
      collection(db, 'flyers'),
      orderBy('uploadedAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      postsQuery,
      (snapshot) => {
        setPosts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setIsLoadingPosts(false)
      },
      (err) => {
        console.error('Failed to load feed:', err)
        setIsLoadingPosts(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'

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
      {/* ── Create post prompt ── */}
      <div
        className="feed-compose"
        onClick={() => navigate('/upload')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/upload') }}
      >
        <div className="feed-compose-avatar">{displayName[0].toUpperCase()}</div>
        <div className="feed-compose-input">Drop a flyer or share what's happening...</div>
        <button
          type="button"
          className="upload-flyer-btn feed-compose-btn"
          onClick={(e) => { e.stopPropagation(); navigate('/upload') }}
        >
          Upload flyer
        </button>
      </div>

      {/* ── Community feed ── */}
      <p className="section-label" style={{ marginTop: '32px' }}>Latest posts</p>

      {isLoadingPosts && (
        <p className="flyers-status">Loading feed...</p>
      )}

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
          const posterName = post.uploadedByName || 'Raver'
          return (
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
                  <div className="feed-post-avatar">{posterName[0].toUpperCase()}</div>
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
          )
        })}
      </div>
    </AppLayout>
  )
}
