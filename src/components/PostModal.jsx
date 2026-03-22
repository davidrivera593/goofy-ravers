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

export default function PostModal({ post, collection: colName, currentUser, avatarCache = {}, onClose }) {
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  const liked = currentUser && Array.isArray(post.likes) && post.likes.includes(currentUser.uid)
  const likeCount = Array.isArray(post.likes) ? post.likes.length : 0
  const isGoing = currentUser && Array.isArray(post.going) && post.going.includes(currentUser.uid)
  const goingCount = Array.isArray(post.going) ? post.going.length : 0
  const isFlyer = post.postType !== 'status'

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Close on ESC
  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Real-time comments
  useEffect(() => {
    const q = query(
      collection(db, colName, post.id, 'comments'),
      orderBy('createdAt', 'asc'),
    )
    return onSnapshot(q, (snap) => {
      setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    })
  }, [colName, post.id])

  async function handleLike() {
    if (!currentUser) return
    const postRef = doc(db, colName, post.id)
    try {
      await updateDoc(postRef, {
        likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      })
    } catch (err) {
      console.error('Like failed:', err)
    }
  }

  async function handleGoing() {
    if (!currentUser) return
    const postRef = doc(db, colName, post.id)
    try {
      await updateDoc(postRef, {
        going: isGoing ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid),
      })
    } catch (err) {
      console.error('Going toggle failed:', err)
    }
  }

  async function handleComment(e) {
    e.preventDefault()
    if (!commentText.trim() || !currentUser) return
    setSubmitting(true)
    try {
      const posterName =
        currentUser.displayName || currentUser.email?.split('@')[0] || 'Raver'
      const postDocRef = doc(db, colName, post.id)
      await addDoc(collection(db, colName, post.id, 'comments'), {
        text: commentText.trim(),
        authorId: currentUser.uid,
        authorName: posterName,
        authorAvatar: avatarCache[currentUser.uid] || '',
        createdAt: serverTimestamp(),
      })
      await updateDoc(postDocRef, { commentCount: increment(1) })
      setCommentText('')
    } catch (err) {
      console.error('Comment failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const posterName = post.uploadedByName || 'Raver'
  const posterAvatar = post.uploadedByAvatar || avatarCache[post.uploadedBy] || ''
  const hasImage = Boolean(post.imageUrl)

  const rightPanel = (
    <div className="post-modal-right">
      {/* Post content */}
      <div className="post-modal-content">
        <button className="post-modal-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="post-modal-header">
          <div className="post-modal-avatar">
            {posterAvatar
              ? <img src={posterAvatar} alt="" className="post-modal-avatar-img" />
              : posterName[0].toUpperCase()
            }
          </div>
          <div>
            <div className="post-modal-name">{posterName}</div>
            {post.uploadedAt?.toDate && (
              <div className="post-modal-date">
                {post.uploadedAt.toDate().toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </div>
            )}
          </div>
        </div>

        {post.postType === 'status' ? (
          <p className="post-modal-status-text">{post.text}</p>
        ) : (
          <>
            {post.title && <h2 className="post-modal-title">{post.title}</h2>}
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
        )}
      </div>

      {/* Actions */}
      <div className="post-modal-actions">
        <button
          className={`post-modal-like-btn${liked ? ' liked' : ''}`}
          onClick={handleLike}
          disabled={!currentUser}
          aria-label={liked ? 'Unlike' : 'Like'}
        >
          {liked ? '♥' : '♡'}
          <span>{likeCount}</span>
        </button>
        {isFlyer && (
          <button
            className={`post-modal-going-btn${isGoing ? ' going' : ''}`}
            onClick={handleGoing}
            disabled={!currentUser}
            aria-label={isGoing ? 'Not going' : "I'm going"}
          >
            ✋
            <span>{goingCount} going</span>
          </button>
        )}
      </div>

      {/* Comments list */}
      <div className="post-modal-comments">
        {comments.length === 0 && (
          <p className="post-modal-no-comments">No comments yet. Be the first!</p>
        )}
        {comments.map((c) => {
          const cAvatar = c.authorAvatar || avatarCache[c.authorId] || ''
          return (
          <div key={c.id} className="post-modal-comment">
            <div className="post-modal-comment-avatar">
              {cAvatar
                ? <img src={cAvatar} alt="" className="post-modal-comment-avatar-img" />
                : (c.authorName || 'R')[0].toUpperCase()
              }
            </div>
            <div className="post-modal-comment-body">
              <span className="post-modal-comment-author">{c.authorName || 'Raver'}</span>
              <p className="post-modal-comment-text">{c.text}</p>
            </div>
          </div>
          )
        })}
      </div>

      {/* Comment composer */}
      {currentUser && (
        <form className="post-modal-compose" onSubmit={handleComment}>
          <div className="post-modal-compose-avatar">
            {avatarCache[currentUser.uid]
              ? <img src={avatarCache[currentUser.uid]} alt="" className="post-modal-comment-avatar-img" />
              : (currentUser.displayName || currentUser.email || 'R')[0].toUpperCase()
            }
          </div>
          <input
            ref={inputRef}
            className="post-modal-compose-input"
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            maxLength={500}
          />
          <button
            type="submit"
            className="post-modal-compose-submit"
            disabled={submitting || !commentText.trim()}
          >
            Post
          </button>
        </form>
      )}
    </div>
  )

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <div
        className={`post-modal${hasImage ? ' post-modal-has-image' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasImage && (
          <div className="post-modal-left">
            <img
              src={post.imageUrl}
              alt={post.title || 'Post image'}
              className="post-modal-image"
            />
          </div>
        )}
        {rightPanel}
      </div>
    </div>
  )
}
