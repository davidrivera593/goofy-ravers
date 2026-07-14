import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'

// Usernames must be human handles, never email addresses.
export function validateUsername(name) {
  const trimmed = String(name || '').trim()
  if (trimmed.length < 2) return 'Username must be at least 2 characters.'
  if (trimmed.length > 40) return 'Username must be 40 characters or fewer.'
  if (trimmed.includes('@')) return 'Username cannot contain "@" or be an email address.'
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(trimmed)) {
    return 'Username can only use letters, numbers, spaces, dots, dashes, and underscores.'
  }
  return ''
}

export async function isUsernameTaken(name, ownUid = null) {
  const trimmed = name.trim()
  // Newer docs carry displayNameLower; older docs predate the field, so also
  // check for an exact displayName match to cover them.
  const queries = [
    query(collection(db, 'users'), where('displayNameLower', '==', trimmed.toLowerCase()), limit(1)),
    query(collection(db, 'users'), where('displayName', '==', trimmed), limit(1)),
  ]
  const snaps = await Promise.all(queries.map((q) => getDocs(q)))
  return snaps.some((snap) => snap.docs.some((d) => d.id !== ownUid))
}
