import { useState } from 'react'
import { Zap, Download } from 'lucide-react'
import { extractStructured } from '../lib/api'
import styles from './ExtractionPanel.module.css'

const FIELD_LABELS = {
  shipment_id:       'Shipment ID',
  shipper:           'Shipper',
  consignee:         'Consignee',
  pickup_datetime:   'Pickup',
  delivery_datetime: 'Delivery',
  equipment_type:    'Equipment',
  mode:              'Mode',
  rate:              'Rate',
  currency:          'Currency',
  weight:            'Weight',
  carrier_name:      'Carrier',
}

export default function ExtractionPanel({ docId }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const run = async () => {
    setState('loading')
    setError('')
    try {
      const data = await extractStructured(docId)
      setResult(data)
      setState('done')
    } catch (e) {
      setError(e.message)
      setState('error')
    }
  }

  const download = () => {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.extraction, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'extraction.json'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Structured Extraction</p>
          <p className={styles.sub}>Extract shipment fields as JSON</p>
        </div>
        <div className={styles.actions}>
          {state === 'done' && (
            <button className={styles.dlBtn} onClick={download}>
              <Download size={13} /> Export
            </button>
          )}
          <button
            className={styles.runBtn}
            onClick={run}
            disabled={state === 'loading'}
          >
            {state === 'loading' ? (
              <span className={styles.spinner} />
            ) : (
              <Zap size={14} />
            )}
            {state === 'loading' ? 'Extracting…' : state === 'done' ? 'Re-run' : 'Extract'}
          </button>
        </div>
      </div>

      {state === 'idle' && (
        <div className={styles.idle}>
          <p>Click <strong>Extract</strong> to pull structured shipment data from the document.</p>
        </div>
      )}

      {state === 'error' && (
        <div className={styles.errBox}>{error}</div>
      )}

      {state === 'done' && result && (
        <div className={styles.results}>
          <div className={styles.completeness}>
            <div className={styles.compBar}>
              <div
                className={styles.compFill}
                style={{ width: `${Math.round((result.fields_found / result.total_fields) * 100)}%` }}
              />
            </div>
            <span className={styles.compLabel}>
              {result.fields_found}/{result.total_fields} fields found
            </span>
          </div>

          <div className={styles.grid}>
            {Object.entries(result.extraction).map(([key, val]) => (
              <div key={key} className={`${styles.cell} ${val == null ? styles.missing : ''}`}>
                <span className={styles.fieldName}>{FIELD_LABELS[key] || key}</span>
                <span className={styles.fieldVal}>
                  {val != null ? String(val) : <span className={styles.null}>—</span>}
                </span>
              </div>
            ))}
          </div>

          <details className={styles.rawJson}>
            <summary>Raw JSON</summary>
            <pre>{JSON.stringify(result.extraction, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  )
}
