import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'

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

const REPORT_REASONS = ['Spam', 'Inappropriate', 'Harassment', 'Other']

export default function PostModal({ post, collection: colName, currentUser, avatarCache = {}, onClose }) {
  const navigate = useNavigate()
  const { isMod, isAdmin } = useAuth()
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [displayText, setDisplayText] = useState(post.text || '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [reported, setReported] = useState(false)
  const inputRef = useRef(null)

  const liked = currentUser && Array.isArray(post.likes) && post.likes.includes(currentUser.uid)
  const likeCount = Array.isArray(post.likes) ? post.likes.length : 0
  const isGoing = currentUser && Array.isArray(post.going) && post.going.includes(currentUser.uid)
  const goingCount = Array.isArray(post.going) ? post.going.length : 0
  const isFlyer = post.postType !== 'status'
  const isOwner = currentUser?.uid === post.uploadedBy
  const canModerate = isMod || isAdmin
  const canDelete = isOwner || canModerate
  const canEdit = isOwner // Only the owner can edit

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

  async function handleSaveEdit() {
    if (!editText.trim()) return
    try {
      await updateDoc(doc(db, colName, post.id), { text: editText.trim() })
      setDisplayText(editText.trim())
      setIsEditing(false)
    } catch (err) {
      console.error('Edit failed:', err)
    }
  }

  async function handleDelete() {
    if (!currentUser || !canDelete) return
    setDeleting(true)
    try {
      // Delete all comments in the subcollection
      const commentsSnap = await getDocs(collection(db, colName, post.id, 'comments'))
      const deletePromises = commentsSnap.docs.map((d) => deleteDoc(d.ref))
      await Promise.all(deletePromises)

      // Try to delete the image from Storage if it exists
      if (post.imageUrl) {
        try {
          const imageRef = storageRef(storage, post.imageUrl)
          await deleteObject(imageRef)
        } catch {
          // Image may not exist in storage or URL format may differ — ignore
        }
      }

      // Delete the post document
      await deleteDoc(doc(db, colName, post.id))
      onClose()
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  async function handleReport() {
    if (!currentUser || !reportReason) return
    try {
      await addDoc(collection(db, 'reports'), {
        contentId: post.id,
        contentType: isFlyer ? 'flyer' : 'post',
        collectionPath: colName,
        reason: reportReason,
        reportedBy: currentUser.uid,
        reportedAt: serverTimestamp(),
        contentOwnerId: post.uploadedBy,
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null,
      })
      setReported(true)
      setShowReport(false)
    } catch (err) {
      console.error('Report failed:', err)
    }
  }

  const posterName = post.uploadedByName || 'Raver'
  const posterAvatar = post.uploadedByAvatar || avatarCache[post.uploadedBy] || ''
  const ytVideoId = extractYouTubeId(post.youtubeUrl)
  const hasImage = Boolean(post.imageUrl) || Boolean(ytVideoId)

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
            {post.uploadedBy
              ? <Link to={`/profile/${post.uploadedBy}`} className="post-modal-name post-modal-name-link" onClick={onClose}>{posterName}</Link>
              : <div className="post-modal-name">{posterName}</div>
            }
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
          isEditing ? (
            <div className="post-modal-inline-edit">
              <textarea
                className="post-modal-edit-textarea"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                maxLength={500}
                autoFocus
              />
              <div className="post-modal-edit-actions">
                <button type="button" className="post-modal-edit-cancel" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="button" className="post-modal-edit-save" onClick={handleSaveEdit} disabled={!editText.trim()}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="post-modal-status-text">{displayText}</p>
          )
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

        {/* Edit — owner only */}
        {canEdit && (
          <button
            className="post-modal-edit-btn"
            onClick={() => {
              if (isFlyer) {
                onClose()
                navigate(`/upload?edit=${post.id}`)
              } else {
                setEditText(post.text || '')
                setIsEditing(true)
              }
            }}
            aria-label="Edit"
          >
            ✏ Edit
          </button>
        )}

        {/* Delete — owner or mod/admin */}
        {canDelete && (
          <>
            {confirmDelete ? (
              <div className="post-modal-delete-confirm">
                <span className="post-modal-delete-confirm-text">Delete this post?</span>
                <button
                  className="post-modal-delete-yes"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Yes, delete'}
                </button>
                <button
                  className="post-modal-delete-no"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="post-modal-delete-btn"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete"
              >
                🗑 Delete
              </button>
            )}
          </>
        )}

        {/* Report — authenticated users, not the owner */}
        {currentUser && !isOwner && !reported && (
          <button
            className="post-modal-report-btn"
            onClick={() => setShowReport(!showReport)}
            aria-label="Report"
            style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '13px' }}
          >
            🚩 Report
          </button>
        )}
        {reported && (
          <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '12px', fontFamily: 'var(--mono)' }}>
            Reported
          </span>
        )}
      </div>

      {/* Report reason picker */}
      {showReport && (
        <div className="post-modal-report" style={{
          padding: '8px 16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
          borderTop: '1px solid var(--border)',
        }}>
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              className={reportReason === r ? 'feed-tag active' : 'feed-tag'}
              onClick={() => setReportReason(r)}
              style={{
                cursor: 'pointer',
                background: reportReason === r ? 'var(--cyan)' : 'var(--surface-2)',
                color: reportReason === r ? '#000' : 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
              }}
            >
              {r}
            </button>
          ))}
          <button
            onClick={handleReport}
            disabled={!reportReason}
            style={{
              background: reportReason ? 'var(--magenta)' : 'var(--surface-2)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: reportReason ? 'pointer' : 'default',
              opacity: reportReason ? 1 : 0.5,
            }}
          >
            Submit
          </button>
        </div>
      )}

      {/* Sign-in CTA for unauthenticated visitors */}
      {!currentUser && (
        <div style={{
          padding: '12px 16px',
          textAlign: 'center',
          borderTop: '1px solid var(--border)',
          fontFamily: 'var(--mono)',
          fontSize: '13px',
          opacity: 0.8,
        }}>
          <Link to="/" style={{ color: 'var(--cyan)' }}>Sign in</Link> to like, comment, and RSVP
        </div>
      )}

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
            placeholder="Add a comment..."
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
            {post.imageUrl
              ? <img src={post.imageUrl} alt={post.title || 'Post image'} className="post-modal-image" />
              : <div className="post-modal-youtube">
                  <iframe
                    src={`https://www.youtube.com/embed/${ytVideoId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="YouTube video"
                  />
                </div>
            }
          </div>
        )}
        {rightPanel}
      </div>
    </div>
  )
}
