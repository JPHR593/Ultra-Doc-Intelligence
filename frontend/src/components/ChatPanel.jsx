import { useState, useRef, useEffect } from 'react'
import { Send, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { askQuestion } from '../lib/api'
import ConfidenceMeter from './ConfidenceMeter'
import styles from './ChatPanel.module.css'

const EXAMPLE_QUESTIONS = [
  'What is the shipping date?',
  'What is the booking date?',
  'What is the reference ID?',
  'Who is the dispatcher?',
  'What is the commodity being shipped?',
  'What is the quantity?',
  'What is the delivery date?',
  'What is the shipping time?',
  'What is the delivery time?',
  'Give me a brief summary of this document.',
  'What is the contact email or phone number?',
  'Are there any special instructions?',
  'What are the RC instructions?',
  'What is the truck number?',
  'What is the trailer number?',
  'What is the carrier rate?',
  'Who is the consignee?',
  'What equipment type is required?',
  'Who is the driver?',
  'What is the weight of the shipment?',
]

export default function ChatPanel({ docId, filename }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (question) => {
    const q = (question || input).trim()
    if (!q || loading) return
    setInput('')
    setLoading(true)

    const userMsg = { role: 'user', text: q, id: Date.now() }
    setMessages(prev => [...prev, userMsg])

    try {
      const data = await askQuestion(docId, q)
      setMessages(prev => [...prev, { role: 'assistant', id: Date.now() + 1, ...data }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'error', id: Date.now() + 1, text: e.message
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.docLabel}>{filename}</span>
      </div>

      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Ask anything about this document</p>
            <div className={styles.chips}>
              {EXAMPLE_QUESTIONS.map(q => (
                <button key={q} className={styles.chip} onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <Message key={msg.id} msg={msg} />
        ))}

        {loading && (
          <div className={styles.thinking}>
            <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="Ask a question about the document…"
          disabled={loading}
        />
        <button className={styles.sendBtn} onClick={() => send()} disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

function Message({ msg }) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  if (msg.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0d0e10', marginBottom: '4px', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>You</div>
        <div style={{ background: '#0d0e10', color: '#ffffff', borderRadius: '12px 12px 3px 12px', padding: '0.625rem 0.875rem', fontSize: '0.875rem', lineHeight: 1.5 }}>
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'error') {
    return (
      <div className={styles.errorMsg}>
        <AlertTriangle size={14} /> {msg.text}
      </div>
    )
  }

  const notFound = msg.guardrail_triggered

  return (
    <div className={`${styles.assistantMsg} ${notFound ? styles.notFound : ''}`} style={{ animation: 'fadeUp 0.3s var(--ease)' }}>
      <p className={styles.answerText}>{msg.answer}</p>

      {!notFound && (
        <>
          <div className={styles.confidenceSection}>
            <ConfidenceMeter score={msg.confidence} breakdown={msg.confidence_breakdown} />
          </div>

          {msg.sources?.length > 0 && (
            <div className={styles.sources}>
              <button className={styles.sourcesToggle} onClick={() => setSourcesOpen(o => !o)}>
                {sourcesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {msg.sources.length} supporting excerpt{msg.sources.length !== 1 ? 's' : ''}
              </button>
              {sourcesOpen && (
                <div className={styles.sourcesList}>
                  {msg.sources.map((s, i) => (
                    <div key={i} className={styles.sourceItem}>
                      <span className={styles.sourceNum}>#{s.chunk_index + 1}</span>
                      <span className={styles.sourceText}>{s.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
