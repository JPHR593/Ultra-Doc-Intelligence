import { useState } from 'react'
import { FileSearch, Github, Zap } from 'lucide-react'
import UploadZone from './components/UploadZone'
import ChatPanel from './components/ChatPanel'
import ExtractionPanel from './components/ExtractionPanel'
import styles from './App.module.css'

export default function App() {
  const [doc, setDoc] = useState(null)
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className={styles.app}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <FileSearch size={20} strokeWidth={1.5} />
          <span className={styles.logoText}>Ultra Doc&#x2011;Intelligence</span>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.tag}>TMS AI Layer</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.ghLink}
            aria-label="GitHub"
          >
            <Github size={16} strokeWidth={1.5} />
          </a>
        </div>
      </header>

      <main className={styles.main}>
        {/* Left column */}
        <aside className={styles.sidebar}>
          {/* Brand block */}
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>
              Ask your logistics<br />
              <em>documents anything.</em>
            </h1>
            <p className={styles.heroSub}>
              Upload a Rate Confirmation, BOL, or Invoice —
              then query it with natural language. Grounded answers,
              source citations, and confidence scores every time.
            </p>
          </div>

          {/* Upload */}
          <section className={styles.section}>
            <label className={styles.sectionLabel}>Document</label>
            <UploadZone onUploaded={setDoc} />
          </section>

          {/* Pipeline badges */}
          <div className={styles.badges}>
            <Badge label="Hybrid search" sub="dense + BM25" />
            <Badge label="Cross-encoder" sub="reranking" />
            <Badge label="3-signal" sub="confidence" />
          </div>

          {/* Stack info */}
          <div className={styles.stack}>
            <p className={styles.stackTitle}>Stack</p>
            <div className={styles.stackItems}>
              <StackItem name="FastAPI" role="backend" />
              <StackItem name="Qdrant" role="vector store" />
              <StackItem name="text-embedding-3-small" role="embeddings" />
              <StackItem name="Claude Sonnet" role="Q&amp;A" />
              <StackItem name="GPT-4o-mini" role="extraction" />
            </div>
          </div>
        </aside>

        {/* Right column */}
        <div className={styles.workspace}>
          {!doc ? (
            <div className={styles.placeholder}>
              <div className={styles.placeholderInner}>
                <FileSearch size={40} strokeWidth={1} className={styles.placeholderIcon} />
                <p className={styles.placeholderTitle}>No document loaded</p>
                <p className={styles.placeholderSub}>Upload a document on the left to get started.</p>
              </div>
            </div>
          ) : (
            <div className={styles.workspaceFilled}>
              {/* Tabs */}
              <div className={styles.tabs}>
                <button
                  className={`${styles.tab} ${activeTab === 'chat' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('chat')}
                >
                  Ask Questions
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'extract' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('extract')}
                >
                  <Zap size={13} />
                  Structured Extract
                </button>
              </div>

              {/* Panel */}
              <div className={styles.panelWrap}>
                {activeTab === 'chat' ? (
                  <ChatPanel docId={doc.doc_id} filename={doc.filename} />
                ) : (
                  <ExtractionPanel docId={doc.doc_id} />
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function Badge({ label, sub }) {
  return (
    <div className={styles.badge}>
      <span className={styles.badgeLabel}>{label}</span>
      <span className={styles.badgeSub}>{sub}</span>
    </div>
  )
}

function StackItem({ name, role }) {
  return (
    <div className={styles.stackItem}>
      <span className={styles.stackName}>{name}</span>
      <span className={styles.stackRole}>{role}</span>
    </div>
  )
}
