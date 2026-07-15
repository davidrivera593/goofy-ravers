/**
 * Soft, self-serve "Organizer" badge shown next to a user's name.
 * Purely an identity signal — it grants no permissions. Any user can turn it
 * on for themselves; mods/admins can revoke it if it's abused.
 */
export default function OrganizerBadge({ show, size = 'sm' }) {
  if (!show) return null
  return (
    <span
      className={`organizer-badge organizer-badge-${size}`}
      title="Identifies as an event organizer"
    >
      <span className="organizer-badge-dot" />
      Organizer
    </span>
  )
}
