import { Link } from 'react-router-dom'

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A mention must not continue into a longer word ("@DJ Nova" ≠ "@DJ Novak")
const MENTION_BOUNDARY = '(?![A-Za-z0-9_])'

/** True when `@name` appears in `text` as a whole mention (case-insensitive). */
export function mentionInText(text, name) {
  if (!text || !name) return false
  return new RegExp(`@${escapeRegExp(name)}${MENTION_BOUNDARY}`, 'i').test(text)
}

/**
 * Render post text with @mentions of tagged users as profile links.
 * `taggedUsers` is the array of { uid, name } stored on the post.
 * Returns an array of strings and <Link> elements.
 */
export function renderTextWithMentions(text, taggedUsers, { onLinkClick } = {}) {
  if (!text) return text
  const tagged = Array.isArray(taggedUsers)
    ? taggedUsers.filter((t) => t?.uid && t?.name)
    : []
  if (tagged.length === 0) return text

  // Longest names first so "@DJ Nova X" wins over "@DJ Nova"
  const sorted = [...tagged].sort((a, b) => b.name.length - a.name.length)
  const pattern = new RegExp(
    `@(${sorted.map((t) => escapeRegExp(t.name)).join('|')})${MENTION_BOUNDARY}`,
    'gi',
  )
  const byLowerName = new Map(sorted.map((t) => [t.name.toLowerCase(), t]))

  const parts = []
  let lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    const tag = byLowerName.get(match[1].toLowerCase())
    if (!tag) continue
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    parts.push(
      <Link
        key={`${tag.uid}-${match.index}`}
        to={`/profile/${tag.uid}`}
        className="feed-mention-link"
        onClick={(e) => {
          e.stopPropagation()
          onLinkClick?.()
        }}
      >
        @{tag.name}
      </Link>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
