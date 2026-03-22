import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase/config'

const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB

function extractYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
  ]
  for (const p of patterns) {
    const m = String(url).match(p)
    if (m) return m[1]
  }
  return null
}

export default function StatusComposer({
  currentUser,
  myAvatarUrl = '',
  forceExpand = false,
  onExpandedChange,
  showCreateBtn = false,
}) {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const displayName =
    currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Raver'

  useEffect(() => {
    if (forceExpand) {
      setExpanded(true)
      onExpandedChange?.(true)
    }
  }, [forceExpand, onExpandedChange])

  function setExpandedSafe(next) {
    setExpanded(next)
    onExpandedChange?.(next)
  }

  function handleImageSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      return
    }
    if (file.size > MAX_POST_IMAGE_SIZE) {
      setError('Image must be 10 MB or smaller.')
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
    setExpandedSafe(false)
    setText('')
    setYoutubeUrl('')
    setError('')
    handleRemoveImage()
  }

  async function handlePost() {
    if (!text.trim() && !imageFile && !youtubeUrl.trim()) return
    if (!currentUser?.uid) return
    setPosting(true)
    setError('')
    try {
      // Fetch latest avatar URL to store on the post
      let avatarUrl = myAvatarUrl
      if (!avatarUrl) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
          if (userSnap.exists()) avatarUrl = userSnap.data().avatarUrl || ''
        } catch (_) {
          /* non-fatal */
        }
      }

      // Upload image if attached
      let imageUrl = ''
      if (imageFile) {
        const fileRef = storageRef(
          storage,
          `posts/${currentUser.uid}/${Date.now()}_${imageFile.name}`,
        )
        await uploadBytes(fileRef, imageFile)
        imageUrl = await getDownloadURL(fileRef)
      }

      await addDoc(collection(db, 'posts'), {
        postType: 'status',
        text: text.trim(),
        imageUrl,
        youtubeUrl: youtubeUrl.trim(),
        uploadedBy: currentUser.uid,
        uploadedByName: displayName,
        uploadedByAvatar: avatarUrl,
        uploadedAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
      })

      setText('')
      setYoutubeUrl('')
      handleRemoveImage()
      setExpandedSafe(false)
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
        onClick={() => setExpandedSafe(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpandedSafe(true)
        }}
      >
        <div className="feed-compose-avatar">
          {myAvatarUrl
            ? <img src={myAvatarUrl} alt="" className="feed-post-avatar-img" />
            : displayName[0].toUpperCase()
          }
        </div>
        <div className="feed-compose-input">Drop a flyer or share what's happening...</div>
        {showCreateBtn && (
          <button
            type="button"
            className="upload-flyer-btn feed-compose-btn"
            onClick={(e) => { e.stopPropagation(); setExpandedSafe(true) }}
          >
            + Create post
          </button>
        )}
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
          {myAvatarUrl
            ? <img src={myAvatarUrl} alt="" className="feed-post-avatar-img" />
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

      <div className="feed-compose-youtube">
        <input
          className="feed-compose-youtube-input"
          type="url"
          placeholder="🎬 Paste a YouTube link (optional)"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          disabled={posting}
        />
        {youtubeUrl && extractYouTubeId(youtubeUrl) && (
          <div className="feed-compose-youtube-preview">
            <img
              src={`https://img.youtube.com/vi/${extractYouTubeId(youtubeUrl)}/mqdefault.jpg`}
              alt="Video preview"
            />
            <button
              type="button"
              className="feed-compose-youtube-remove"
              onClick={() => setYoutubeUrl('')}
              aria-label="Remove YouTube link"
            >
              ✕
            </button>
          </div>
        )}
      </div>
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
            disabled={posting || (!text.trim() && !imageFile && !youtubeUrl.trim())}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
