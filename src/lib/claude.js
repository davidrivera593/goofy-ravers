import { auth } from '../firebase/config'

const CLAUDE_PROXY_URL = 'https://us-central1-goofy-ravers-c868f.cloudfunctions.net/claudeProxy'

export async function callClaude({
  messages,
  system,
  max_tokens = 512,
  model = 'claude-haiku-4-5-20251001',
}) {
  const headers = { 'Content-Type': 'application/json' }
  const user = auth.currentUser
  if (user) {
    headers.Authorization = `Bearer ${await user.getIdToken()}`
  }

  const response = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages, system, max_tokens, model }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error || `Claude request failed (${response.status})`)
  }
  return data?.content?.[0]?.text ?? ''
}
