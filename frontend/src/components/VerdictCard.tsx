import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Radio } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { formatMetric, verdictCopy } from '../lib/verdict'

interface VerdictCardProps {
  result: DiagnoseResponse | null
  loading: boolean
  error: string | null
}

export function VerdictCard({ result, loading, error }: VerdictCardProps) {
  if (loading) {
    return (
      <section className="verdict-card verdict-card--loading" aria-live="polite">
        <div className="verdict-card__status-icon" aria-hidden>
          <Loader2 size={22} className="spin-slow" />
        </div>
        <p className="verdict-card__eyebrow">Диагностика</p>
        <h2 className="verdict-card__title">Получаем результат…</h2>
        <p className="verdict-card__hint">Запрос уходит в Mock ML через backend JUDRIVE.</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="verdict-card verdict-card--error" role="alert">
        <div className="verdict-card__status-icon" aria-hidden>
          <AlertTriangle size={22} />
        </div>
        <p className="verdict-card__eyebrow">Ошибка</p>
        <h2 className="verdict-card__title">Не удалось получить результат</h2>
        <p className="verdict-card__body">{error}</p>
      </section>
    )
  }

  if (!result) {
    return (
      <section className="verdict-card verdict-card--empty">
        <div className="verdict-card__status-icon" aria-hidden>
          <Radio size={22} />
        </div>
        <p className="verdict-card__eyebrow">Диагностика</p>
        <h2 className="verdict-card__title">Запустите проверку</h2>
        <p className="verdict-card__hint">
          Выберите машину и сессию, затем нажмите «Получить результат диагностики».
        </p>
      </section>
    )
  }

  const copy = verdictCopy(result)
  const StatusIcon =
    result.status === 'normal' ? CheckCircle2 : result.status === 'anomaly' ? AlertTriangle : HelpCircle

  return (
    <section className={`verdict-card verdict-card--${result.status}`} aria-live="polite">
      <div className="verdict-card__status-icon" aria-hidden>
        <StatusIcon size={22} />
      </div>
      <p className="verdict-card__eyebrow">Вердикт</p>
      <h2 className="verdict-card__title">{copy.title}</h2>
      <p className="verdict-card__lead">{copy.lead}</p>

      {result.status === 'check_failed' ? (
        <p className="verdict-card__action">{copy.action}</p>
      ) : (
        <>
          {result.engine_model ? (
            <dl className="verdict-card__meta">
              <div>
                <dt>Двигатель</dt>
                <dd>{result.engine_model}</dd>
              </div>
              <div>
                <dt>Качество записи</dt>
                <dd>{copy.signalQuality}</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{formatMetric(result.confidence)}</dd>
              </div>
              {result.status === 'anomaly' ? (
                <>
                  <div>
                    <dt>Тип</dt>
                    <dd>
                      {result.anomaly_type} — {result.anomaly_title}
                    </dd>
                  </div>
                  <div>
                    <dt>Anomaly score</dt>
                    <dd>{formatMetric(result.anomaly_score)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          ) : null}
          <p className="verdict-card__body">{result.description}</p>
          {copy.footnote ? <p className="verdict-card__footnote">{copy.footnote}</p> : null}
        </>
      )}
    </section>
  )
}