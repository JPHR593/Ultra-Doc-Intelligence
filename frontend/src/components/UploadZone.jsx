import { useState, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { uploadDocument } from '../lib/api'
import styles from './UploadZone.module.css'

export default function UploadZone({ onUploaded }) {
  const [state, setState] = useState('idle') // idle | dragging | uploading | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const inputRef = useRef(null)

  const process = useCallback(async (file) => {
    setState('uploading')
    setError('')
    try {
      const data = await uploadDocument(file)
      setResult(data)
      setState('done')
      onUploaded(data)
    } catch (e) {
      setError(e.message)
      setState('error')
    }
  }, [onUploaded])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setState('idle')
    const file = e.dataTransfer.files[0]
    if (file) process(file)
  }, [process])

  const onChange = (e) => {
    const file = e.target.files[0]
    if (file) process(file)
  }

  return (
    <div
      className={`${styles.zone} ${styles[state]}`}
      onDragOver={(e) => { e.preventDefault(); if (state === 'idle') setState('dragging') }}
      onDragLeave={() => { if (state === 'dragging') setState('idle') }}
      onDrop={onDrop}
      onClick={() => state === 'idle' || state === 'error' ? inputRef.current?.click() : null}
    >
      <input ref={inputRef} type="file" accept=".pdf,.docx,.txt" onChange={onChange} style={{ display: 'none' }} />

      {state === 'idle' || state === 'dragging' ? (
        <div className={styles.content}>
          <div className={styles.icon}><Upload size={28} /></div>
          <p className={styles.title}>Drop your logistics document</p>
          <p className={styles.sub}>PDF · DOCX · TXT &nbsp;—&nbsp; or click to browse</p>
        </div>
      ) : state === 'uploading' ? (
        <div className={styles.content}>
          <div className={`${styles.icon} ${styles.spinning}`}><Loader size={28} /></div>
          <p className={styles.title}>Ingesting document…</p>
          <p className={styles.sub}>Parsing · chunking · embedding</p>
        </div>
      ) : state === 'done' ? (
        <div className={styles.content}>
          <div className={`${styles.icon} ${styles.success}`}><CheckCircle size={28} /></div>
          <p className={styles.title}>{result?.filename}</p>
          <p className={styles.sub}>{result?.chunks} semantic chunks · {result?.pages ?? 1} page(s)</p>
          <button className={styles.swap} onClick={(e) => { e.stopPropagation(); setState('idle'); setResult(null) }}>
            Upload another
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          <div className={`${styles.icon} ${styles.errIcon}`}><AlertCircle size={28} /></div>
          <p className={styles.title}>Upload failed</p>
          <p className={styles.sub}>{error}</p>
        </div>
      )}
    </div>
  )
}
