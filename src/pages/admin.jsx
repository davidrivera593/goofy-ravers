import { useEffect, useRef, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { db, functions, storage } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
import AppLayout from '../components/AppLayout'

const setUserRoleFn = httpsCallable(functions, 'setUserRole')
const banUserFn = httpsCallable(functions, 'banUser')

export default function Admin() {
  const { user: currentUser, isAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [reports, setReports] = useState([])
  const [reportsError, setReportsError] = useState('')
  const [reportContent, setReportContent] = useState({}) // reportId → content doc
  const [actionLoading, setActionLoading] = useState({}) // id → true
  // Moderators only see the reports tab; user management is admin-only
  const [activeTab, setActiveTab] = useState(isAdmin ? 'users' : 'reports')
  const fetchedContentIds = useRef(new Set())

  // Subscribe to all users (admin-only tab)
  useEffect(() => {
    if (!isAdmin) return
    return onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(
        snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
      )
    })
  }, [isAdmin])

  // Subscribe to pending reports.
  // No orderBy here — a where + orderBy combo needs a composite index and
  // fails silently if it's missing. Sort client-side instead.
  useEffect(() => {
    const q = query(collection(db, 'reports'), where('status', '==', 'pending'))
    return onSnapshot(q, (snap) => {
      const reps = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0))
      setReports(reps)
      setReportsError('')

      // Load referenced content for each report
      reps.forEach(async (r) => {
        if (fetchedContentIds.current.has(r.id)) return
        fetchedContentIds.current.add(r.id)
        try {
          const contentDoc = await getDoc(doc(db, r.collectionPath, r.contentId))
          if (contentDoc.exists()) {
            setReportContent((prev) => ({ ...prev, [r.id]: { id: contentDoc.id, ...contentDoc.data() } }))
          }
        } catch {
          // Content may have been deleted
        }
      })
    }, (err) => {
      console.error('Failed to load reports:', err)
      setReportsError('Could not load reports. Check your permissions and try again.')
    })
  }, [])

  async function handleSetRole(targetUid, newRole) {
    setActionLoading((prev) => ({ ...prev, [targetUid]: true }))
    try {
      await setUserRoleFn({ targetUid, newRole })
    } catch (err) {
      console.error('Set role failed:', err)
      alert(err.message)
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUid]: false }))
    }
  }

  async function handleBan(targetUid, banned) {
    const action = banned ? 'ban' : 'unban'
    if (!confirm(`Are you sure you want to ${action} this user?`)) return
    setActionLoading((prev) => ({ ...prev, [targetUid]: true }))
    try {
      await banUserFn({ targetUid, banned })
    } catch (err) {
      console.error('Ban failed:', err)
      alert(err.message)
    } finally {
      setActionLoading((prev) => ({ ...prev, [targetUid]: false }))
    }
  }

  async function handleDismissReport(reportId) {
    try {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'dismissed',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Dismiss failed:', err)
    }
  }

  async function handleDeleteContent(report) {
    if (!confirm('Delete this content? This cannot be undone.')) return
    try {
      const contentRef = doc(db, report.collectionPath, report.contentId)

      // Delete comments subcollection so it doesn't orphan
      try {
        const commentsSnap = await getDocs(collection(db, report.collectionPath, report.contentId, 'comments'))
        await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)))
      } catch {
        // Content may already be gone
      }

      // Delete any attached images from Storage
      const content = reportContent[report.id]
      const imageUrls = [
        ...(Array.isArray(content?.imageUrls) ? content.imageUrls : []),
        ...(content?.imageUrl ? [content.imageUrl] : []),
      ]
      await Promise.all(
        [...new Set(imageUrls)].map((url) =>
          deleteObject(storageRef(storage, url)).catch(() => {})
        )
      )

      await deleteDoc(contentRef)
      await updateDoc(doc(db, 'reports', report.id), {
        status: 'actioned',
        reviewedBy: currentUser.uid,
        reviewedAt: serverTimestamp(),
      })
    } catch (err) {
      console.error('Delete content failed:', err)
    }
  }

  const tabStyle = (tab) => ({
    padding: '8px 20px',
    background: activeTab === tab ? 'var(--cyan)' : 'var(--surface-2)',
    color: activeTab === tab ? '#000' : 'var(--text)',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    fontWeight: activeTab === tab ? 700 : 400,
  })

  return (
    <AppLayout title={isAdmin ? 'Admin Dashboard' : 'Moderation'} user={currentUser}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {isAdmin && (
          <button style={tabStyle('users')} onClick={() => setActiveTab('users')}>
            Users ({users.length})
          </button>
        )}
        <button style={tabStyle('reports')} onClick={() => setActiveTab('reports')}>
          Reports ({reports.length})
        </button>
      </div>

      {/* ── Users Tab ─────────────────────────────────────────────── */}
      {activeTab === 'users' && isAdmin && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--mono)', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>User</th>
                <th style={{ padding: '8px' }}>Role</th>
                <th style={{ padding: '8px' }}>Status</th>
                <th style={{ padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.uid === currentUser?.uid
                const loading = actionLoading[u.uid]
                return (
                  <tr key={u.uid} style={{ borderBottom: '1px solid var(--border)', opacity: u.banned ? 0.5 : 1 }}>
                    <td style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', fontSize: '12px', flexShrink: 0,
                      }}>
                        {u.avatarUrl
                          ? <img src={u.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (u.displayName || '?')[0].toUpperCase()
                        }
                      </div>
                      <span>{u.displayName || 'Unnamed'}</span>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        background: u.role === 'admin' ? 'var(--magenta)' : u.role === 'moderator' ? 'var(--cyan)' : 'var(--surface-2)',
                        color: u.role === 'admin' ? '#fff' : u.role === 'moderator' ? '#000' : 'var(--text)',
                      }}>
                        {u.role || 'user'}
                      </span>
                    </td>
                    <td style={{ padding: '8px' }}>
                      {u.banned ? <span style={{ color: '#f44' }}>Banned</span> : 'Active'}
                    </td>
                    <td style={{ padding: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {!isSelf && u.role !== 'admin' && (
                        <>
                          {u.role === 'moderator' ? (
                            <button
                              onClick={() => handleSetRole(u.uid, 'user')}
                              disabled={loading}
                              style={actionBtnStyle('#f44')}
                            >
                              Remove Mod
                            </button>
                          ) : (
                            <button
                              onClick={() => handleSetRole(u.uid, 'moderator')}
                              disabled={loading}
                              style={actionBtnStyle('var(--cyan)')}
                            >
                              Make Mod
                            </button>
                          )}
                          {u.banned ? (
                            <button
                              onClick={() => handleBan(u.uid, false)}
                              disabled={loading}
                              style={actionBtnStyle('var(--cyan)')}
                            >
                              Unban
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBan(u.uid, true)}
                              disabled={loading}
                              style={actionBtnStyle('#f44')}
                            >
                              Ban
                            </button>
                          )}
                        </>
                      )}
                      {isSelf && <span style={{ opacity: 0.5, fontSize: '11px' }}>You</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reports Tab ───────────────────────────────────────────── */}
      {activeTab === 'reports' && (
        <div>
          {reportsError && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: '#f44', textAlign: 'center', padding: '20px 0' }}>
              {reportsError}
            </p>
          )}
          {!reportsError && reports.length === 0 && (
            <p style={{ fontFamily: 'var(--mono)', fontSize: '14px', opacity: 0.6, textAlign: 'center', padding: '40px 0' }}>
              No pending reports
            </p>
          )}
          {reports.map((r) => {
            const content = reportContent[r.id]
            return (
              <div key={r.id} style={{
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '12px',
                background: 'var(--surface)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px',
                      padding: '2px 8px', borderRadius: '4px',
                      background: 'var(--surface-2)', marginRight: '8px',
                    }}>
                      {r.contentType}
                    </span>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '11px',
                      padding: '2px 8px', borderRadius: '4px',
                      background: '#f44', color: '#fff',
                    }}>
                      {r.reason}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', opacity: 0.5 }}>
                    {r.reportedAt?.toDate?.()?.toLocaleDateString() || ''}
                  </span>
                </div>

                {content ? (
                  <div style={{
                    padding: '8px 12px', borderRadius: '6px',
                    background: 'var(--surface-2)', marginBottom: '12px',
                    fontFamily: 'var(--sans)', fontSize: '13px',
                  }}>
                    {content.title && <strong>{content.title}</strong>}
                    {content.text && <p style={{ margin: '4px 0 0' }}>{content.text.slice(0, 200)}</p>}
                    <p style={{ margin: '4px 0 0', opacity: 0.5, fontSize: '11px' }}>
                      by {content.uploadedByName || 'Unknown'}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontFamily: 'var(--mono)', fontSize: '12px', opacity: 0.5, marginBottom: '12px' }}>
                    Content unavailable — it may have already been deleted.
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleDismissReport(r.id)}
                    style={actionBtnStyle('var(--surface-2)')}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleDeleteContent(r)}
                    style={actionBtnStyle('#f44')}
                  >
                    Delete Content
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppLayout>
  )
}

function actionBtnStyle(bg) {
  return {
    background: bg,
    color: bg === 'var(--cyan)' ? '#000' : '#fff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: 'var(--mono)',
    cursor: 'pointer',
  }
}
