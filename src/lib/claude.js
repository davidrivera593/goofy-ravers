const CLAUDE_PROXY_URL = 'https://us-central1-goofy-ravers-c868f.cloudfunctions.net/claudeProxy'

export async function callClaude({ messages, system, max_tokens = 512 }) {
  const response = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      messages, 
      system, 
      max_tokens,
      model: 'claude-haiku-4-5-20251001',
    }),
  })

  const data = await response.json()
  return data.content?.[0]?.text ?? ''
}