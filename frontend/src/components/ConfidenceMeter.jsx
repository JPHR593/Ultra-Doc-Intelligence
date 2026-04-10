import styles from './ConfidenceMeter.module.css'

export default function ConfidenceMeter({ score, breakdown }) {
  const pct = Math.round(score * 100)
  const level = score >= 0.7 ? 'high' : score >= 0.45 ? 'mid' : 'low'
  const label = score >= 0.7 ? 'High confidence' : score >= 0.45 ? 'Moderate' : 'Low confidence'

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span className={`${styles.badge} ${styles[level]}`}>{label}</span>
        <span className={styles.pct}>{pct}%</span>
      </div>
      <div className={styles.bar}>
        <div className={`${styles.fill} ${styles[level]}`} style={{ width: `${pct}%` }} />
      </div>
      {breakdown && (
        <div className={styles.breakdown}>
          <Signal label="Retrieval" value={breakdown.retrieval_similarity} />
          <Signal label="Rerank" value={breakdown.rerank_score} />
          <Signal label="Coverage" value={breakdown.answer_coverage} />
        </div>
      )}
    </div>
  )
}

function Signal({ label, value }) {
  const pct = Math.round((value ?? 0) * 100)
  return (
    <div className={styles.signal}>
      <span className={styles.sigLabel}>{label}</span>
      <div className={styles.sigBar}>
        <div className={styles.sigFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.sigVal}>{pct}%</span>
    </div>
  )
}
