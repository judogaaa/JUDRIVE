import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, Radio, RotateCcw } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { formatMetric } from '../lib/verdict'
import { usableStatus } from '../lib/workflow'
import { VerdictActions, type VerdictActionsProps } from './VerdictActions'

interface VerdictCardProps {
  result: DiagnoseResponse | null
  loading: boolean
  error: string | null
  vehicleId?: string
  actions?: Omit<VerdictActionsProps, 'result'> | null
  onRetry?: () => void
}

export function VerdictCard({ result, loading, error, vehicleId, actions, onRetry }: VerdictCardProps) {
  const { t } = useI18n()

  const signalLabel = (quality: DiagnoseResponse['signal_quality']) => {
    if (quality === 'good') return t('verdict.signal.good')
    if (quality === 'warning') return t('verdict.signal.warning')
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
        {onRetry ? (
          <div className="verdict-card__error-action">
            <button type="button" className="btn btn--secondary" onClick={onRetry}>
              <RotateCcw size={16} aria-hidden />
              {t('history.retry')}
            </button>
          </div>
        ) : null}
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

  const effective = usableStatus(result)
  const StatusIcon = effective === 'normal' ? CheckCircle2 : effective === 'anomaly' ? AlertTriangle : HelpCircle

  const titleKey: TranslationKey =
    effective === 'normal'
      ? 'verdict.normal.title'
      : effective === 'check_failed'
        ? 'verdict.failed.title'
        : 'verdict.anomaly.title'
  const leadKey: TranslationKey =
    effective === 'normal'
      ? 'verdict.normal.lead'
      : effective === 'check_failed'
        ? 'verdict.failed.lead'
        : 'verdict.anomaly.lead'
  const footnoteKey: TranslationKey | null =
    effective === 'normal'
      ? 'verdict.normal.footnote'
      : effective === 'anomaly'
        ? 'verdict.anomaly.footnote'
        : null

  const steps = stepKeys(effective)

  return (
    <section className={`verdict-card verdict-card--${effective}`} aria-live="polite">
      <header className="verdict-card__header">
        <div className="verdict-card__status-icon" aria-hidden>
          <StatusIcon size={22} />
        </div>
        <div className="verdict-card__heading">
          <p className="verdict-card__eyebrow">{t('verdict.eyebrow')}</p>
          {vehicleId ? (
            <p className="verdict-card__context">
              {vehicleId} · {result.session_id}
            </p>
          ) : null}
        </div>
      </header>

      <h2 className="verdict-card__title">{t(titleKey)}</h2>
      <p className="verdict-card__lead">{t(leadKey)}</p>

      {effective === 'check_failed' ? (
        <>
          {result.description ? (
            <dl className="verdict-card__reason">
              <dt>{t('verdict.failed.reason')}</dt>
              <dd>{result.description}</dd>
            </dl>
          ) : null}
          <p className="verdict-card__notice">{t('verdict.failed.action')}</p>
        </>
      ) : (
        <>
          {result.description ? <p className="verdict-card__body">{result.description}</p> : null}
          <dl className="verdict-card__meta">
            {result.engine_model ? (
              <div>
                <dt>{t('verdict.engine')}</dt>
                <dd>{result.engine_model}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t('verdict.signal')}</dt>
              <dd>{signalLabel(result.signal_quality)}</dd>
            </div>
            <div>
              <dt>{t('verdict.confidence')}</dt>
              <dd>{formatMetric(result.confidence)}</dd>
            </div>
            {effective === 'anomaly' ? (
              <div>
                <dt>{t('verdict.type')}</dt>
                <dd>
                  {result.anomaly_type} — {result.anomaly_title}
                  <span className="verdict-card__metric-sub">
                    {t('verdict.score')}: {formatMetric(result.anomaly_score)}
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
          {result.signal_quality === 'warning' ? (
            <p className="verdict-card__quality">{t('verdict.signal.warningNote')}</p>
          ) : null}
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

      {actions ? (
        <VerdictActions
          result={result}
          onExplain={actions.onExplain}
          onWhatToCheck={actions.onWhatToCheck}
          onSearchManual={actions.onSearchManual}
          onPrepareTicket={actions.onPrepareTicket}
          onCopyPlan={actions.onCopyPlan}
          onOtherSession={actions.onOtherSession}
          onRetry={actions.onRetry}
        />
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
