const { setGlobalOptions } = require('firebase-functions')
const { onRequest } = require('firebase-functions/v2/https')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const Anthropic = require('@anthropic-ai/sdk')
const admin = require('firebase-admin')

admin.initializeApp()

const CLAUDE_API_KEY = defineSecret('CLAUDE_API_KEY')

setGlobalOptions({ maxInstances: 10 })

// ── Claude AI Proxy ───────────────────────────────────────────────
exports.claudeProxy = onRequest(
  { secrets: [CLAUDE_API_KEY], cors: true },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed')
      return
    }

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() })

    const { messages, system, max_tokens = 1000, model = 'claude-sonnet-4-20250514' } = req.body

    const response = await client.messages.create({
      model,
      max_tokens,
      system,
      messages,
    })

    res.json(response)
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
