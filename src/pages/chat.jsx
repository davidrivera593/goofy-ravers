import { Component, useEffect, useRef, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { db } from '../firebase/config'
import { useAuth } from '../contexts/AuthContext'
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
  'Design a layout for a gabber warehouse rave flyer',
  'What fonts work best for a happyhardcore flyer?',
  'How do I create a glitch effect in Photopea?',
  'Suggest a color palette for a jungle rave flyer',
  'What pixel dimensions should a square Instagram post be?',
]

const BLOCK_COLORS = {
  title: 'var(--cyan)',
  image: 'var(--magenta)',
  text: 'var(--text-dim)',
  lineup: 'var(--amber, #f5a214)',
  footer: 'var(--surface2)',
}

function WireframeCanvas({ blocks }) {
  return (
    <svg
      viewBox="0 0 100 178"
      className="w-full"
      style={{ aspectRatio: '9/16', maxHeight: '100%' }}
    >
      <rect x="0" y="0" width="100" height="178" fill="var(--bg2)" rx="2" />
      {blocks.map((block, i) => {
        const color = BLOCK_COLORS[block.type] || 'var(--text-dim)'
        return (
          <g key={i}>
            <rect
              x={block.x}
              y={block.y}
              width={block.width}
              height={block.height}
              fill="none"
              stroke={color}
              strokeWidth="0.5"
              strokeDasharray="2 1"
              rx="1"
            />
            <text
              x={block.x + block.width / 2}
              y={block.y + block.height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fill={color}
              style={{ fontSize: `${block.fontSize / 3}px`, fontFamily: 'var(--mono)' }}
            >
              {block.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

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
Be specific, practical, and opinionated. Give exact hex codes, Photopea menu paths (e.g. "Image > Canvas Size"), font weights, and pixel dimensions. Keep responses concise and actionable for rave designers who know the basics but want to level up their craft.

LAYOUT GENERATION:
When the user asks for a flyer layout, composition wireframe, or arrangement, respond with LAYOUT: followed by a JSON array on the FIRST line, then a brief explanation on the next line. Do NOT wrap the JSON in markdown code fences.
The wireframe canvas is 9:16 portrait. Coordinates map to a 100×178 grid (width 0-100, height 0-178).
Each block must have: type ("title"|"image"|"text"|"lineup"|"footer"), label (short text like "EVENT NAME"), x, y, width, height, fontSize (8-24).
Example:
LAYOUT:[{"type":"title","label":"EVENT NAME","x":10,"y":8,"width":80,"height":18,"fontSize":20},{"type":"image","label":"KEY VISUAL","x":5,"y":30,"width":90,"height":60,"fontSize":14},{"type":"lineup","label":"DJ LINEUP","x":10,"y":95,"width":80,"height":22,"fontSize":12},{"type":"footer","label":"DATE • VENUE • TICKETS","x":10,"y":155,"width":80,"height":16,"fontSize":10}]
Keep layouts bold and dynamic — this is rave design. When the user asks to adjust or change the layout, respond with a new LAYOUT: directive containing the full updated array.`
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
  const { user: currentUser } = useAuth()
  const [flyers, setFlyers] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeLayout, setActiveLayout] = useState(null)
  const [layoutBlocks, setLayoutBlocks] = useState([])
  const bottomRef = useRef(null)

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
      const layoutParsed = parseLayoutFromResponse(reply)
      if (layoutParsed) {
        setLayoutBlocks(layoutParsed.blocks)
        setMessages(prev => [...prev, { role: 'assistant', content: layoutParsed.explanation }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
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

        {/* ── Wireframe canvas ─────────────────────────────────── */}
        <div className="wireframe-col">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 }}>
            <p className="section-label" style={{ marginBottom: 4 }}>Wireframe Preview</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--mono)', margin: 0 }}>
              9:16 flyer canvas
            </p>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
            {layoutBlocks.length > 0 ? (
              <WireframeCanvas blocks={layoutBlocks} />
            ) : (
              <div style={{ textAlign: 'center', padding: '0 16px' }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>📐</p>
                <p style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--text-dim)', fontFamily: 'var(--mono)', margin: 0 }}>
                  Describe your flyer to generate a layout wireframe
                </p>
              </div>
            )}
          </div>
        </div>

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
                onClick={() => { setMessages([]); setActiveLayout(null); setLayoutBlocks([]) }}
              >
                Clear chat
              </button>
            )}
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">🎨</div>
                <h2 className="chat-empty-title">Meet our Goofy Raver bot - tailored for <a href="https://www.photopea.com" target="_blank" rel="noopener noreferrer">PhotoPea</a></h2>
                <p className="chat-empty-sub">
                  Ask about typography, colors, Photopea techniques — or describe a flyer to generate a wireframe layout on the left. Click a layout on the right for step-by-step guidance.
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

function parseLayoutFromResponse(text) {
  if (!text) return null
  const lines = text.split('\n')
  const firstLine = lines[0].trim()
  if (!firstLine.startsWith('LAYOUT:')) return null
  try {
    const jsonStr = firstLine.slice(7).trim()
    const blocks = JSON.parse(jsonStr)
    if (!Array.isArray(blocks)) return null
    const explanation = lines.slice(1).join('\n').trim() || "Here's your suggested layout! Describe changes and I'll update it."
    return { blocks, explanation }
  } catch {
    return null
  }
}
