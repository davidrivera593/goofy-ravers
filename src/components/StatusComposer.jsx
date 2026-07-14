import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore'
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { db, storage } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import { callClaude } from '../lib/claude'
import { mentionInText } from '../lib/mentions'

const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_POST_IMAGES = 4
const MAX_CLAUDE_IMAGE_SIZE = 3.5 * 1024 * 1024 // stay under the API's 5 MB base64 cap

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Find the "@fragment" being typed at the caret, if any
function getMentionFragment(text, caret) {
  const upToCaret = text.slice(0, caret)
  const atIndex = upToCaret.lastIndexOf('@')
  if (atIndex === -1) return null
  // '@' must be at start of text or preceded by whitespace
  if (atIndex > 0 && !/\s/.test(upToCaret[atIndex - 1])) return null
  const fragment = upToCaret.slice(atIndex + 1)
  if (fragment.includes('\n')) return null
  if (fragment.length > 30) return null
  return { atIndex, fragment }
}

export default function StatusComposer({
  currentUser,
  myAvatarUrl = '',
  forceExpand = false,
  onExpandedChange,
  showCreateBtn = false,
}) {
  const navigate = useNavigate()
  const { userDoc } = useAuth()
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState([]) // [{ file, preview }]
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [useClaude, setUseClaude] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postingStage, setPostingStage] = useState('') // '' | 'uploading' | 'parsing'
  const [error, setError] = useState('')

  // Mentions
  const [allUsers, setAllUsers] = useState(null) // null = not loaded yet
  const [mentionSuggestions, setMentionSuggestions] = useState([])
  const [mentionFragment, setMentionFragment] = useState(null)
  const [taggedUsers, setTaggedUsers] = useState([]) // [{ uid, name }]

  // Prefer the chosen username from Firestore — never fall back to the email
  const displayName = userDoc?.displayName || currentUser?.displayName || 'Raver'

  useEffect(() => {
    if (forceExpand) {
      setExpanded(true)
      onExpandedChange?.(true)
    }
  }, [forceExpand, onExpandedChange])

  // Load the user directory once the composer opens (used for @mentions)
  useEffect(() => {
    if (!expanded || allUsers !== null) return
    getDocs(collection(db, 'users'))
      .then((snap) => {
        setAllUsers(
          snap.docs
            .map((d) => ({ uid: d.id, ...d.data() }))
            .filter((u) => u.displayName && !u.banned),
        )
      })
      .catch(() => setAllUsers([]))
  }, [expanded, allUsers])

  function setExpandedSafe(next) {
    setExpanded(next)
    onExpandedChange?.(next)
  }

  function handleImageSelect(e) {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    let err = ''
    const additions = []
    for (const file of files) {
      if (images.length + additions.length >= MAX_POST_IMAGES) {
        err = `You can attach up to ${MAX_POST_IMAGES} images.`
        break
      }
      if (!file.type.startsWith('image/')) {
        err = 'Only image files are allowed.'
        continue
      }
      if (file.size > MAX_POST_IMAGE_SIZE) {
        err = 'Each image must be 10 MB or smaller.'
        continue
      }
      additions.push({ file, preview: URL.createObjectURL(file) })
    }
    if (additions.length > 0) setImages((prev) => [...prev, ...additions])
    setError(err)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRemoveImage(index) {
    const removed = images[index]
    if (removed) URL.revokeObjectURL(removed.preview)
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  function handleRemoveAllImages() {
    images.forEach((img) => URL.revokeObjectURL(img.preview))
    setImages([])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleCancel() {
    setExpandedSafe(false)
    setText('')
    setYoutubeUrl('')
    setError('')
    setUseClaude(false)
    setTaggedUsers([])
    setMentionSuggestions([])
    setMentionFragment(null)
    handleRemoveAllImages()
  }

  function handleTextChange(e) {
    const value = e.target.value
    setText(value)
    updateMentionSuggestions(value, e.target.selectionStart)
  }

  function updateMentionSuggestions(value, caret) {
    const frag = getMentionFragment(value, caret ?? value.length)
    setMentionFragment(frag)
    if (!frag || !Array.isArray(allUsers)) {
      setMentionSuggestions([])
      return
    }
    const needle = frag.fragment.toLowerCase()
    const matches = allUsers
      .filter((u) => u.uid !== currentUser?.uid)
      .filter((u) => u.displayName.toLowerCase().startsWith(needle))
      .slice(0, 5)
    setMentionSuggestions(matches)
  }

  function handleMentionSelect(user) {
    if (!mentionFragment) return
    const caret = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, mentionFragment.atIndex)
    const after = text.slice(caret)
    const inserted = `@${user.displayName} `
    setText(before + inserted + after)
    setTaggedUsers((prev) =>
      prev.some((t) => t.uid === user.uid) ? prev : [...prev, { uid: user.uid, name: user.displayName }],
    )
    setMentionSuggestions([])
    setMentionFragment(null)
    // Restore focus after React re-renders the textarea
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        const pos = (before + inserted).length
        el.setSelectionRange(pos, pos)
      }
    })
  }

  // Ask Claude to tag the post — tags only, no summaries
  async function parsePostWithClaude(finalText, firstImage) {
    const content = []
    if (firstImage && firstImage.size <= MAX_CLAUDE_IMAGE_SIZE) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: firstImage.type,
          data: await fileToBase64(firstImage),
        },
      })
    }
    content.push({
      type: 'text',
      text: `You are tagging a post on an Arizona underground rave and electronic music community feed. Analyze the post${content.length ? ' text and attached image' : ' text'} and return ONLY a valid JSON object — no markdown, no backticks, no explanation:
{
  "tags": ["up to 5 short lowercase topic or genre tags, e.g. techno, house, dnb, warehouse, lineup"]
}

Post text:
${finalText || '(no text — image only)'}`,
    })

    const raw = await callClaude({
      messages: [{ role: 'user', content }],
      model: 'claude-opus-4-8',
      max_tokens: 256,
    })
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    return Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 5)
      : []
  }

  async function handlePost() {
    const finalText = text.trim()
    if (!finalText && images.length === 0 && !youtubeUrl.trim()) return
    if (!currentUser?.uid) return
    setPosting(true)
    setError('')
    try {
      // Fetch latest avatar URL to store on the post
      let avatarUrl = myAvatarUrl || userDoc?.avatarUrl || ''
      if (!avatarUrl) {
        try {
          const userSnap = await getDoc(doc(db, 'users', currentUser.uid))
          if (userSnap.exists()) avatarUrl = userSnap.data().avatarUrl || ''
        } catch {
          /* non-fatal */
        }
      }

      // Upload all attached images in parallel
      setPostingStage('uploading')
      const imageUrls = await Promise.all(
        images.map(async (img, i) => {
          const fileRef = storageRef(
            storage,
            `posts/${currentUser.uid}/${Date.now()}_${i}_${img.file.name}`,
          )
          await uploadBytes(fileRef, img.file)
          return getDownloadURL(fileRef)
        }),
      )

      // Keep only tags whose @name still appears in the final text
      const activeTags = taggedUsers.filter((t) => mentionInText(finalText, t.name))

      // Optional Claude tagging — non-fatal if it fails
      let claudeTags = []
      if (useClaude) {
        setPostingStage('parsing')
        try {
          claudeTags = await parsePostWithClaude(finalText, images[0]?.file)
        } catch (err) {
          console.error('Claude parse failed (posting anyway):', err)
        }
      }

      await addDoc(collection(db, 'posts'), {
        postType: 'status',
        text: finalText,
        imageUrl: imageUrls[0] || '', // kept for older readers of this field
        imageUrls,
        youtubeUrl: youtubeUrl.trim(),
        uploadedBy: currentUser.uid,
        uploadedByName: displayName,
        uploadedByAvatar: avatarUrl,
        uploadedAt: serverTimestamp(),
        likes: [],
        commentCount: 0,
        taggedUsers: activeTags,
        taggedUserIds: activeTags.map((t) => t.uid),
        claudeParsed: useClaude,
        claudeTags,
      })

      setText('')
      setYoutubeUrl('')
      setUseClaude(false)
      setTaggedUsers([])
      handleRemoveAllImages()
      setExpandedSafe(false)
    } catch (err) {
      console.error('Failed to post:', err)
      setError('Could not post. Try again.')
    } finally {
      setPosting(false)
      setPostingStage('')
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
        <div className="feed-compose-textarea-wrap">
          <textarea
            ref={textareaRef}
            className="feed-compose-textarea"
            placeholder="What's happening in the scene? Use @ to tag someone."
            rows={3}
            value={text}
            onChange={handleTextChange}
            onClick={(e) => updateMentionSuggestions(text, e.target.selectionStart)}
            onKeyUp={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
                updateMentionSuggestions(text, e.target.selectionStart)
              }
            }}
            autoFocus
            maxLength={1000}
          />
          {mentionSuggestions.length > 0 && (
            <div className="feed-compose-mentions" role="listbox" aria-label="Tag a user">
              {mentionSuggestions.map((u) => (
                <button
                  key={u.uid}
                  type="button"
                  className="feed-compose-mention-item"
                  onClick={() => handleMentionSelect(u)}
                >
                  <span className="feed-compose-mention-avatar">
                    {u.avatarUrl
                      ? <img src={u.avatarUrl} alt="" />
                      : u.displayName[0].toUpperCase()
                    }
                  </span>
                  @{u.displayName}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {images.length > 0 && (
        <div className="feed-compose-image-grid">
          {images.map((img, i) => (
            <div key={img.preview} className="feed-compose-image-preview feed-compose-image-cell">
              <img src={img.preview} alt={`Attachment ${i + 1} preview`} />
              <button
                type="button"
                className="feed-compose-image-remove"
                onClick={() => handleRemoveImage(i)}
                aria-label={`Remove image ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
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

      <label
        className="feed-compose-claude-row"
        onClick={() => !posting && setUseClaude((v) => !v)}
      >
        <span
          role="switch"
          aria-checked={useClaude}
          tabIndex={0}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !posting) {
              e.preventDefault()
              setUseClaude((v) => !v)
            }
          }}
          className={`feed-toggle-track${useClaude ? ' feed-toggle-track--on' : ''}`}
        >
          <span className={`feed-toggle-thumb${useClaude ? ' feed-toggle-thumb--on' : ''}`} />
        </span>
        <span className="feed-compose-claude-label">
          ✨ Let Claude parse this post (auto-tags)
        </span>
      </label>

      <div className="feed-compose-actions">
        <div className="feed-compose-actions-left">
          <button
            type="button"
            className="feed-compose-photo-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={posting || images.length >= MAX_POST_IMAGES}
            title="Add photos"
          >
            📷 Photos ({images.length}/{MAX_POST_IMAGES})
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
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
            disabled={posting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handlePost}
            disabled={posting || (!text.trim() && images.length === 0 && !youtubeUrl.trim())}
          >
            {posting
              ? postingStage === 'parsing' ? 'Claude is reading…' : 'Posting…'
              : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
