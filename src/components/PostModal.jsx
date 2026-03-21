import { useEffect, useRef, useState } from 'react'
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'

// ── Shared post header (avatar + name + date) ──────────────────────
function ModalPostHeader({ name, uploadedAt }) {
  return (
    <div className="post-modal-header">
      <div className="post-modal-avatar">{name[0].toUpperCase()}</div>
      <div>
        <div className="post-modal-name">{name}</div>
        {uploadedAt?.toDate && (
          <div className="post-modal-date">
            {uploadedAt.toDate().toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PostModal({ post, collection: colName, currentUser, onClose }) {
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const commentsEndRef = useRef(null)

  const posterName = post.uploadedByName || 'Raver'
  const isFlyer = post.postType !== 'status'
  const likes = Array.isArray(post.likes) ? post.likes : []
  const isLiked = currentUser ? likes.includes(currentUser.uid) : false
  const postDocRef = doc(db, colName, post.id)

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Escape key closes modal
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Real-time comments subscription
  useEffect(() => {
    const commentsQuery = query(
      collection(db, colName, post.id, 'comments'),
      orderBy('createdAt', 'asc'),
    )
    const unsub = onSnapshot(commentsQuery, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [colName, post.id])

  // Auto-scroll comments to bottom when new ones arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments])

  async function handleLike() {
    if (!currentUser) return
    try {
      await updateDoc(postDocRef, {
        likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      })
    } catch (err) {
      console.error('Like failed:', err)
    }
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!commentText.trim() || !currentUser) return
    setIsPosting(true)
    try {
      await addDoc(collection(db, colName, post.id, 'comments'), {
        text: commentText.trim(),
        authorId: currentUser.uid,
        authorName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver',
        createdAt: serverTimestamp(),
      })
      // Keep commentCount in sync on the post doc so cards can show it
      await updateDoc(postDocRef, { commentCount: increment(1) })
      setCommentText('')
    } catch (err) {
      console.error('Comment failed:', err)
    } finally {
      setIsPosting(false)
    }
  }

  const hasImage = Boolean(post.imageUrl)

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`post-modal${hasImage ? ' post-modal-has-image' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button type="button" className="post-modal-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Left: image (only if there's an image) */}
        {hasImage && (
          <div className="post-modal-left">
            <img
              src={post.imageUrl}
              alt={post.title ? `${post.title} flyer` : 'Post image'}
              className="post-modal-image"
            />
          </div>
        )}

        {/* Right: content + likes + comments */}
        <div className="post-modal-right">
          {/* Post content */}
          <div className="post-modal-content">
            <ModalPostHeader name={posterName} uploadedAt={post.uploadedAt} />

            {isFlyer ? (
              <>
                <h2 className="post-modal-title">{post.title || 'Untitled event'}</h2>
                <div className="post-modal-meta">
                  {post.date && <span>📅 {post.date}</span>}
                  {post.city && <span>📍 {post.city}</span>}
                  {post.venue && <span>🏛 {post.venue}</span>}
                </div>
                {Array.isArray(post.genres) && post.genres.length > 0 && (
                  <div className="post-modal-tags">
                    {post.genres.map((g) => <span key={g} className="feed-tag">#{g}</span>)}
                  </div>
                )}
                {Array.isArray(post.djs) && post.djs.length > 0 && (
                  <p className="post-modal-djs">🎧 {post.djs.join(', ')}</p>
                )}
                {post.description && (
                  <p className="post-modal-desc">{post.description}</p>
                )}
              </>
            ) : (
              <>
                <p className="post-modal-status-text">{post.text}</p>
                {Array.isArray(post.tags) && post.tags.length > 0 && (
                  <div className="post-modal-tags">
                    {post.tags.map((t) => <span key={t} className="feed-tag">#{t}</span>)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Like button */}
          <div className="post-modal-actions">
            <button
              type="button"
              className={`post-modal-like-btn${isLiked ? ' liked' : ''}`}
              onClick={handleLike}
              disabled={!currentUser}
              title={isLiked ? 'Unlike' : 'Like'}
            >
              {isLiked ? '♥' : '♡'}
              <span>{likes.length > 0 ? likes.length : ''}</span>
            </button>
          </div>

          {/* Comments */}
          <div className="post-modal-comments">
            {comments.length === 0 && (
              <p className="post-modal-no-comments">No comments yet — be the first.</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="post-modal-comment">
                <div className="post-modal-comment-avatar">
                  {(c.authorName || '?')[0].toUpperCase()}
                </div>
                <div className="post-modal-comment-body">
                  <span className="post-modal-comment-author">{c.authorName}</span>
                  <span className="post-modal-comment-text">{c.text}</span>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>

          {/* Comment composer */}
          {currentUser ? (
            <form className="post-modal-compose" onSubmit={handleComment}>
              <div className="post-modal-compose-avatar">
                {(currentUser.displayName || currentUser.email || '?')[0].toUpperCase()}
              </div>
              <input
                className="post-modal-compose-input"
                type="text"
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                maxLength={300}
              />
              <button
                type="submit"
                className="post-modal-compose-submit"
                disabled={!commentText.trim() || isPosting}
              >
                Post
              </button>
            </form>
          ) : (
            <p className="post-modal-no-comments" style={{ padding: '12px 16px' }}>
              Sign in to like and comment.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
