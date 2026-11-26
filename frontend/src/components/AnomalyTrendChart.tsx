import type { TrendPoint } from '../api/fleet'

interface AnomalyTrendChartProps {
  points: TrendPoint[]
  height?: number
}

export function AnomalyTrendChart({ points, height = 140 }: AnomalyTrendChartProps) {
  const width = 320
  const pad = { top: 16, right: 12, bottom: 28, left: 36 }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom

  const numeric = points.filter((p) => typeof p.anomaly_score === 'number')
  if (numeric.length === 0) {
    return (
      <p className="panel__subtitle" style={{ margin: 0 }}>
        Нет валидных точек anomaly_score (записи со сбоем пропущены).
      </p>
    )
  }

  const maxScore = Math.max(1, ...numeric.map((p) => p.anomaly_score as number))
  const step = numeric.length > 1 ? innerW / (numeric.length - 1) : 0

  const coords = numeric.map((p, index) => {
    const x = pad.left + step * index
    const y = pad.top + innerH - ((p.anomaly_score as number) / maxScore) * innerH
    return { x, y, p }
  })

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ')

  return (
    <figure style={{ margin: 0 }} aria-label="График anomaly_score">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img">
        <line
          x1={pad.left}
          y1={pad.top + innerH}
          x2={width - pad.right}
          y2={pad.top + innerH}
          stroke="var(--border)"
        />
        {coords.length > 1 ? (
          <polyline fill="none" stroke="var(--accent)" strokeWidth="2.5" points={polyline} />
        ) : null}
        {coords.map((c) => (
          <g key={c.p.session_id}>
            <circle cx={c.x} cy={c.y} r={5} fill="var(--accent)" />
            <title>
              {c.p.session_id}: {c.p.anomaly_score ?? '—'} ({c.p.status})
            </title>
          </g>
        ))}
        <text x={pad.left} y={height - 6} fill="var(--text-muted)" fontSize="10">
          сессии →
        </text>
        <text x={6} y={pad.top + 8} fill="var(--text-muted)" fontSize="10">
          score
        </text>
      </svg>
      <figcaption className="panel__subtitle" style={{ marginTop: '0.35rem' }}>
        До {numeric.length} валидных точек; сбои записи не интерполируются. Не прогноз отказа.
      </figcaption>
    </figure>
  )
}