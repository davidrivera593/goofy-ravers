import { Component, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { auth, db } from '../firebase/config'
import AppLayout from '../components/AppLayout'
import './chat_styles.css'

const PROXY_URL = 'https://us-central1-goofy-ravers-c868f.cloudfunctions.net/claudeProxy'

const LAYOUT_PRESETS = [
  {
    id: 'full-bleed',
    name: 'Full Bleed Poster',
    format: '18×24" / A2',
    desc: 'Centered hero text, gradient bg, lineup below, date strip at bottom.',
    fonts: ['Syne 800', 'Space Mono'],
    colors: ['#f5e214', '#1427f5', '#080a0f'],
  },
  {
    id: 'split-grid',
    name: 'Split Grid',
    format: '1:1 Square',
    desc: 'Left: visual or photo. Right: event info in bold stacked type.',
    fonts: ['Syne 700', 'Helvetica Neue'],
    colors: ['#ffffff', '#000000', '#f5e214'],
  },
  {
    id: 'story',
    name: 'Story / Reel',
    format: '9:16 Vertical',
    desc: 'Top: big artist name. Middle: key visual. Bottom: date, venue, CTA.',
    fonts: ['Syne 800', 'Space Mono'],
    colors: ['#1427f5', '#f5e214', '#ffffff'],
  },
  {
    id: 'layered',
    name: 'Layered Stack',
    format: 'Square / Poster',
    desc: 'Overlapping heavy type at varied opacities. One accent. Texture overlay.',
    fonts: ['Syne 800 Italic', 'Impact'],
    colors: ['#f5a214', '#080a0f', 'rgba(255,255,255,0.15)'],
  },
  {
    id: 'minimal',
    name: 'Minimal Dark',
    format: 'Any',
    desc: 'One graphic element, lots of negative space. Mono type. Thin rule lines.',
    fonts: ['Space Mono', 'Inter Light'],
    colors: ['#e8edf5', '#080a0f', 'rgba(255,255,255,0.2)'],
  },
  {
    id: 'mosaic',
    name: 'Grid Mosaic',
    format: 'Square / Banner',
    desc: 'Artist photos in 3-col grid with color overlays. Event name as hero text.',
    fonts: ['Syne 800', 'Space Mono'],
    colors: ['#1427f5', '#f5e214', '#f5a214'],
  },
]

const SUGGESTIONS = [
  'What fonts work best for a techno flyer?',
  'How do I create a glitch effect in Photopea?',
  'Suggest a color palette for a jungle rave flyer',
  'How do I set up bleed for print in Photopea?',
  'What pixel dimensions should a square Instagram post be?',
]

function buildSystemPrompt(flyers) {
  const context = flyers.length
    ? flyers.slice(0, 12).map(f =>
        `• ${f.title || 'Untitled'} @ ${f.venue || '?'}, ${f.city || '?'} | Genres: ${(f.genres || []).join(', ')} | DJs: ${(f.djs || []).join(', ')}`
      ).join('\n')
    : 'No flyers uploaded yet.'

  return `You are a rave and electronic music event flyer design expert for the Goofy Ravers community — an AZ underground rave scene.

CORE EXPERTISE:
- Rave/EDM flyer aesthetics: techno, house, jungle, drum & bass, psytrance visual styles
- Photopea (free browser-based Photoshop): layers, masks, blend modes, filters, smart objects, text effects, export settings
- Typography: Syne (heavy display for headlines), Space Mono (techy mono), Impact, Helvetica Neue Condensed, Bebas Neue
- Rave color palettes: neon yellow (#f5e214), electric blue (#1427f5), amber (#f5a214) on dark (#080a0f). Also: magenta, acid green, UV purple, hot pink
- Layout principles: visual hierarchy, bleed/safe zones, negative space, grid systems, rule of thirds, contrast ratios
- Print vs web: 300dpi/CMYK for print, 72dpi/RGB for web — how to configure both in Photopea
- Effects: halftone, scanlines, noise/grain textures, glitch/datamosh, chromatic aberration, VHS look, UV reactive design

LAYOUT TEMPLATES AVAILABLE (shown in the UI reference panel):
1. Full Bleed Poster — centered hero text, gradient/art background, lineup below, date strip at bottom
2. Split Grid — left: visual/photo, right: event info in stacked bold type
3. Story/Reel — 9:16 vertical: big artist name top, key visual middle, CTA at bottom
4. Layered Stack — overlapping heavy type at varied opacities, one accent color, texture overlay
5. Minimal Dark — one graphic element, lots of negative space, mono type, thin rule lines
6. Grid Mosaic — artist photos in 3-col grid with color overlays, event name as hero overlay

COMMUNITY FLYERS CONTEXT (recently uploaded, for design continuity):
${context}

RESPONSE STYLE:
Be specific, practical, and opinionated. Give exact hex codes, Photopea menu paths (e.g. "Image > Canvas Size"), font weights, and pixel dimensions. Keep responses concise and actionable for rave designers who know the basics but want to level up their craft.`
}

// ── Wireframe preview components ──────────────────────────────────────

function WireframeFull() {
  return (
    <div className="wf wf-full-bleed">
      <div className="wf-bar wf-bar-title" />
      <div className="wf-center-block" />
      <div className="wf-bar wf-bar-lineup" />
      <div className="wf-bar wf-bar-date" />
    </div>
  )
}

function WireframeSplit() {
  return (
    <div className="wf wf-split">
      <div className="wf-half wf-half-img" />
      <div className="wf-half wf-half-text">
        <div className="wf-line wf-line-lg" />
        <div className="wf-line" />
        <div className="wf-line wf-line-sm" />
        <div className="wf-line wf-line-sm" />
      </div>
    </div>
  )
}

function WireframeStory() {
  return (
    <div className="wf wf-story">
      <div className="wf-bar wf-bar-title" />
      <div className="wf-story-img" />
      <div className="wf-bar wf-bar-lineup" />
      <div className="wf-story-cta" />
    </div>
  )
}

function WireframeLayered() {
  return (
    <div className="wf wf-layered">
      <div className="wf-layer wf-layer-1" />
      <div className="wf-layer wf-layer-2" />
      <div className="wf-layer wf-layer-3" />
    </div>
  )
}

function WireframeMinimal() {
  return (
    <div className="wf wf-minimal">
      <div className="wf-rule" />
      <div className="wf-minimal-symbol" />
      <div className="wf-line wf-line-mono" />
      <div className="wf-rule" />
    </div>
  )
}

function WireframeMosaic() {
  return (
    <div className="wf wf-mosaic">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className={`wf-cell wf-cell-${i % 3}`} />
      ))}
      <div className="wf-mosaic-overlay" />
    </div>
  )
}

function LayoutWireframe({ id }) {
  switch (id) {
    case 'full-bleed': return <WireframeFull />
    case 'split-grid':  return <WireframeSplit />
    case 'story':       return <WireframeStory />
    case 'layered':     return <WireframeLayered />
    case 'minimal':     return <WireframeMinimal />
    case 'mosaic':      return <WireframeMosaic />
    default:            return <div className="wf" />
  }
}

class MarkdownRenderBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.content !== this.props.content && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return <pre className="chat-msg-fallback">{this.props.content}</pre>
    }
    return this.props.children
  }
}

// ── Main component ────────────────────────────────────────────────────

export default function Chat() {
  const [currentUser, setCurrentUser] = useState(null)
  const [flyers, setFlyers] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeLayout, setActiveLayout] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => onAuthStateChanged(auth, setCurrentUser), [])

  useEffect(() => {
    async function loadFlyers() {
      try {
        const q = query(collection(db, 'flyers'), orderBy('uploadedAt', 'desc'), limit(20))
        const snap = await getDocs(q)
        setFlyers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (e) {
        console.error('Failed to load flyers for context:', e)
      }
    }
    loadFlyers()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function send(text) {
    const content = (text ?? input).trim()
    if (!content || isLoading) return

    setInput('')
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setIsLoading(true)

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          system: buildSystemPrompt(flyers),
          max_tokens: 1000,
          model: 'claude-sonnet-4-6',
        }),
      })
      const data = await res.json()
      const reply = extractAssistantText(data)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠ Connection error. Check your network and try again.' },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function onLayoutClick(layout) {
    setActiveLayout(layout.id)
    send(
      `Walk me through designing a "${layout.name}" layout (${layout.format}) for a rave flyer in Photopea. Give specific steps, recommended fonts (${layout.fonts.join(', ')}), hex color choices, layer order, and any key effects.`
    )
  }

  const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'You'
  const initials = displayName[0].toUpperCase()

  return (
    <AppLayout user={currentUser}>
      <div className="chat-layout">

        {/* ── Chat column ───────────────────────────────────────── */}
        <div className="chat-col">
          <div className="chat-col-header">
            <div>
              <p className="section-label" style={{ marginBottom: 2 }}>Design Bot</p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
                {flyers.length} flyer{flyers.length !== 1 ? 's' : ''} loaded as context
              </p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                className="chat-clear-btn"
                onClick={() => { setMessages([]); setActiveLayout(null) }}
              >
                Clear chat
              </button>
            )}
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">🎨</div>
                <h2 className="chat-empty-title">Rave Flyer Design Assistant</h2>
                <p className="chat-empty-sub">
                  Ask about typography, colors, Photopea techniques — or click a layout on the right to get step-by-step design guidance.
                </p>
                <div className="chat-suggestions">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" className="chat-suggestion" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => {
              const safeContent = toSafeText(msg.content)
              const assistantMarkdown = normalizeAssistantMarkdown(safeContent)

              return (
                <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                  <div className="chat-msg-avatar">
                    {msg.role === 'user' ? initials : 'AI'}
                  </div>
                  <div className="chat-msg-bubble">
                    {msg.role === 'assistant' ? (
                      <MarkdownRenderBoundary content={assistantMarkdown}>
                        <div className="chat-msg-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {assistantMarkdown}
                          </ReactMarkdown>
                        </div>
                      </MarkdownRenderBoundary>
                    ) : (
                      safeContent
                    )}
                  </div>
                </div>
              )
            })}

            {isLoading && (
              <div className="chat-msg chat-msg-assistant">
                <div className="chat-msg-avatar">AI</div>
                <div className="chat-msg-bubble chat-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <div className="chat-input-area">
            <textarea
              className="chat-textarea"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about rave flyer design, Photopea, fonts, colors… (Shift+Enter for newline)"
              rows={3}
            />
            <button
              type="button"
              className="chat-send-btn"
              onClick={() => send()}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? '…' : 'Send ↑'}
            </button>
          </div>
        </div>

        {/* ── Layouts column ───────────────────────────────────── */}
        <div className="layouts-col">
          <div className="layouts-col-header">
            <p className="section-label" style={{ marginBottom: 2 }}>Layout References</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)' }}>
              Click any layout to get design tips
            </p>
          </div>

          <div className="layouts-list">
            {LAYOUT_PRESETS.map(layout => (
              <button
                key={layout.id}
                type="button"
                className={`layout-card${activeLayout === layout.id ? ' layout-card-active' : ''}`}
                onClick={() => onLayoutClick(layout)}
              >
                <div className="layout-wireframe">
                  <LayoutWireframe id={layout.id} />
                </div>
                <div className="layout-info">
                  <div className="layout-name">{layout.name}</div>
                  <div className="layout-format">{layout.format}</div>
                  <div className="layout-desc">{layout.desc}</div>
                  <div className="layout-chips">
                    {layout.colors.map((c, i) => (
                      <span
                        key={i}
                        className="chip-color"
                        style={{ background: c }}
                        title={c}
                      />
                    ))}
                    {layout.fonts.map(f => (
                      <span key={f} className="chip-font">{f}</span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </AppLayout>
  )
}

function extractAssistantText(payload) {
  const textFromContent = payload?.content

  if (Array.isArray(textFromContent)) {
    const parts = textFromContent
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        return ''
      })
      .filter(Boolean)
    return parts.join('\n\n') || 'No response.'
  }

  if (typeof textFromContent === 'string') {
    return textFromContent
  }

  if (typeof payload?.text === 'string') {
    return payload.text
  }

  if (typeof payload?.message === 'string') {
    return payload.message
  }

  return 'No response.'
}

function toSafeText(value) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function normalizeAssistantMarkdown(text) {
  if (!text) return ''

  let normalized = text

  // If the whole response is wrapped in a markdown fence, unwrap it.
  normalized = normalized.replace(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i, '$1')

  // Claude/proxies sometimes escape markdown punctuation; unescape common tokens.
  normalized = normalized.replace(/\\([*_`~\[\]()#+\-.!>])/g, '$1')

  return normalized
}
