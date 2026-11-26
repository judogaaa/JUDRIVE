import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Radio } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { formatMetric } from '../lib/verdict'

interface VerdictCardProps {
  result: DiagnoseResponse | null
  loading: boolean
  error: string | null
  vehicleId?: string
}

export function VerdictCard({ result, loading, error, vehicleId }: VerdictCardProps) {
  const { t } = useI18n()

  const signalLabel = (q: DiagnoseResponse['signal_quality']) => {
    if (q === 'good') return t('verdict.signal.good')
    if (q === 'warning') return t('verdict.signal.warning')
    return t('verdict.signal.bad')
  }

  const stepKeys = (status: DiagnoseResponse['status'] | null): TranslationStep[] => {
    if (status === 'normal') return ['verdict.steps.normal.1', 'verdict.steps.normal.2']
    if (status === 'anomaly') return ['verdict.steps.anomaly.1', 'verdict.steps.anomaly.2', 'verdict.steps.anomaly.3']
    if (status === 'check_failed') return ['verdict.steps.failed.1', 'verdict.steps.failed.2']
    return []
  }

  if (loading) {
    return (
      <section className="verdict-card verdict-card--loading" aria-live="polite">
        <div className="verdict-card__status-icon" aria-hidden>
          <Loader2 size={22} className="spin-slow" />
        </div>
        <p className="verdict-card__eyebrow">{t('verdict.eyebrow')}</p>
        <h2 className="verdict-card__title">{t('verdict.loading.title')}</h2>
        <p className="verdict-card__hint">{t('verdict.loading.hint')}</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="verdict-card verdict-card--error" role="alert">
        <div className="verdict-card__status-icon" aria-hidden>
          <AlertTriangle size={22} />
        </div>
        <p className="verdict-card__eyebrow">{t('verdict.eyebrow.error')}</p>
        <h2 className="verdict-card__title">{t('verdict.error.title')}</h2>
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
        <p className="verdict-card__eyebrow">{t('verdict.eyebrow')}</p>
        <h2 className="verdict-card__title">{t('verdict.empty.title')}</h2>
        <p className="verdict-card__hint">{t('verdict.empty.hint')}</p>
      </section>
    )
  }

  const StatusIcon =
    result.status === 'normal' ? CheckCircle2 : result.status === 'anomaly' ? AlertTriangle : HelpCircle

  const titleKey: TranslationKey =
    result.status === 'normal'
      ? 'verdict.normal.title'
      : result.status === 'check_failed'
        ? 'verdict.failed.title'
        : 'verdict.anomaly.title'
  const leadKey: TranslationKey =
    result.status === 'normal'
      ? 'verdict.normal.lead'
      : result.status === 'check_failed'
        ? 'verdict.failed.lead'
        : 'verdict.anomaly.lead'
  const footnoteKey: TranslationKey | null =
    result.status === 'normal'
      ? 'verdict.normal.footnote'
      : result.status === 'anomaly'
        ? 'verdict.anomaly.footnote'
        : null

  const steps = stepKeys(result.status)

  return (
    <section className={`verdict-card verdict-card--${result.status}`} aria-live="polite">
      {vehicleId ? (
        <p className="verdict-card__context">
          {vehicleId} · {result.session_id}
        </p>
      ) : null}
      <div className="verdict-card__status-icon" aria-hidden>
        <StatusIcon size={22} />
      </div>
      <p className="verdict-card__eyebrow">{t('verdict.eyebrow')}</p>
      <h2 className="verdict-card__title">{t(titleKey)}</h2>
      <p className="verdict-card__lead">{t(leadKey)}</p>

      {result.status === 'check_failed' ? (
        <p className="verdict-card__action">{t('verdict.failed.action')}</p>
      ) : (
        <>
          {result.engine_model ? (
            <dl className="verdict-card__meta">
              <div>
                <dt>{t('verdict.engine')}</dt>
                <dd>{result.engine_model}</dd>
              </div>
              <div>
                <dt>{t('verdict.signal')}</dt>
                <dd>{signalLabel(result.signal_quality)}</dd>
              </div>
              <div>
                <dt>{t('verdict.confidence')}</dt>
                <dd>{formatMetric(result.confidence)}</dd>
              </div>
              {result.status === 'anomaly' ? (
                <>
                  <div>
                    <dt>{t('verdict.type')}</dt>
                    <dd>
                      {result.anomaly_type} — {result.anomaly_title}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('verdict.score')}</dt>
                    <dd>{formatMetric(result.anomaly_score)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          ) : null}
          {result.description ? <p className="verdict-card__body">{result.description}</p> : null}
          {footnoteKey ? <p className="verdict-card__footnote">{t(footnoteKey)}</p> : null}
        </>
      )}

      {steps.length ? (
        <div className="verdict-card__steps">
          <p className="verdict-card__steps-title">{t('verdict.steps.title')}</p>
          <ol>
            {steps.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}

type TranslationStep =
  | 'verdict.steps.normal.1'
  | 'verdict.steps.normal.2'
  | 'verdict.steps.anomaly.1'
  | 'verdict.steps.anomaly.2'
  | 'verdict.steps.anomaly.3'
  | 'verdict.steps.failed.1'
  | 'verdict.steps.failed.2'