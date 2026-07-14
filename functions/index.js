const { setGlobalOptions } = require('firebase-functions')
const { onRequest } = require('firebase-functions/v2/https')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const Anthropic = require('@anthropic-ai/sdk')
const admin = require('firebase-admin')

admin.initializeApp()

const CLAUDE_API_KEY = defineSecret('CLAUDE_API_KEY')

setGlobalOptions({ maxInstances: 10 })

// Models the proxy is allowed to run — keeps clients from burning credits
// on arbitrary expensive models.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-opus-4-8',
])
const MAX_TOKENS_CAP = 2048

// ── Claude AI Proxy ───────────────────────────────────────────────
exports.claudeProxy = onRequest(
  { secrets: [CLAUDE_API_KEY], cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' })
      return
    }

    // Require a signed-in user — this endpoint spends API credits.
    const authHeader = req.headers.authorization || ''
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!idToken) {
      res.status(401).json({ error: 'Sign in required.' })
      return
    }
    let decoded
    try {
      decoded = await admin.auth().verifyIdToken(idToken)
    } catch {
      res.status(401).json({ error: 'Invalid auth token.' })
      return
    }

    // Banned users cannot use the proxy — fail closed if the lookup fails
    try {
      const userDoc = await admin.firestore().doc(`users/${decoded.uid}`).get()
      if (userDoc.exists && userDoc.data().banned) {
        res.status(403).json({ error: 'Account suspended.' })
        return
      }
    } catch (err) {
      console.error('Ban check failed:', err)
      res.status(503).json({ error: 'Could not verify account. Try again.' })
      return
    }

    const { messages, system, max_tokens = 1000, model = 'claude-opus-4-8' } = req.body || {}

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array is required.' })
      return
    }
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: 'Model not allowed.' })
      return
    }

    try {
      const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() })
      const response = await client.messages.create({
        model,
        max_tokens: Math.min(Number(max_tokens) || 1000, MAX_TOKENS_CAP),
        system,
        messages,
      })
      res.json(response)
    } catch (err) {
      console.error('Claude proxy error:', err)
      const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500
      res.status(status).json({ error: err?.message || 'Claude request failed.' })
    }
  }
)

// ── Set User Role (Admin Only) ───────────────────────────────────
exports.setUserRole = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.')
  }

  // Verify caller is admin
  const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get()
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can change roles.')
  }

  const { targetUid, newRole } = request.data
  if (!targetUid || !['user', 'moderator'].includes(newRole)) {
    throw new HttpsError(
      'invalid-argument',
      'Provide a valid targetUid and newRole (user or moderator).'
    )
  }

  // Prevent demoting yourself
  if (targetUid === callerUid) {
    throw new HttpsError('failed-precondition', 'Cannot change your own role.')
  }

  // Prevent demoting another admin
  const targetDoc = await admin.firestore().doc(`users/${targetUid}`).get()
  if (targetDoc.exists && targetDoc.data().role === 'admin') {
    throw new HttpsError('failed-precondition', 'Cannot change the role of an admin.')
  }

  await admin.firestore().doc(`users/${targetUid}`).set(
    { role: newRole },
    { merge: true }
  )

  return { success: true, targetUid, newRole }
})

// ── Ban / Unban User (Admin Only) ────────────────────────────────
exports.banUser = onCall(async (request) => {
  const callerUid = request.auth?.uid
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.')
  }

  // Verify caller is admin
  const callerDoc = await admin.firestore().doc(`users/${callerUid}`).get()
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can ban users.')
  }

  const { targetUid, banned } = request.data
  if (!targetUid || typeof banned !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Provide a valid targetUid and banned boolean.')
  }

  // Prevent banning yourself
  if (targetUid === callerUid) {
    throw new HttpsError('failed-precondition', 'Cannot ban yourself.')
  }

  // Prevent banning another admin
  const targetDoc = await admin.firestore().doc(`users/${targetUid}`).get()
  if (targetDoc.exists && targetDoc.data().role === 'admin') {
    throw new HttpsError('failed-precondition', 'Cannot ban an admin.')
  }

  // Update Firestore user doc
  await admin.firestore().doc(`users/${targetUid}`).set(
    {
      banned: banned,
      bannedAt: banned ? admin.firestore.FieldValue.serverTimestamp() : null,
    },
    { merge: true }
  )

  // Disable/enable the Firebase Auth account to prevent re-login
  await admin.auth().updateUser(targetUid, { disabled: banned })

  return { success: true, targetUid, banned }
})
