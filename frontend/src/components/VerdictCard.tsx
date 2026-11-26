import { AlertTriangle, BookOpen, CalendarClock, CheckCircle2, HelpCircle, Loader2, MessageSquare, Radio, RotateCcw } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'
import { formatMetric } from '../lib/verdict'
import { manualTopic, usableStatus } from '../lib/workflow'
import { CopyButton } from './CopyButton'

interface VerdictCardProps {
  result: DiagnoseResponse | null
  loading: boolean
  error: string | null
  vehicleId?: string
  onChooseSession: () => void
  onOpenManuals: (query: string) => void
  onAskInChat: (text: string) => void
  onRetry: () => void
}

export function VerdictCard({ result, loading, error, vehicleId, onChooseSession, onOpenManuals, onAskInChat, onRetry }: VerdictCardProps) {
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
        <button type="button" className="btn btn--secondary" onClick={onRetry}><RotateCcw size={16} />{t('history.retry')}</button>
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

  const status = usableStatus(result)
  const StatusIcon =
    status === 'normal' ? CheckCircle2 : status === 'anomaly' ? AlertTriangle : HelpCircle

  const titleKey: TranslationKey =
    status === 'normal'
      ? 'verdict.normal.title'
      : status === 'check_failed'
        ? 'verdict.failed.title'
        : 'verdict.anomaly.title'
  const leadKey: TranslationKey =
    status === 'normal'
      ? 'verdict.normal.lead'
      : status === 'check_failed'
        ? 'verdict.failed.lead'
        : 'verdict.anomaly.lead'
  const footnoteKey: TranslationKey | null =
    status === 'normal'
      ? 'verdict.normal.footnote'
      : status === 'anomaly'
        ? 'verdict.anomaly.footnote'
        : null

  const steps = stepKeys(status)
  const topic = manualTopic(result)
  const checklist = [
    `${result.vehicle_id} · ${result.session_id} · ${result.engine_model ?? ''}`,
    t(titleKey), t(leadKey),
    ...(status === 'check_failed' ? [t('verdict.failed.action')] : status === 'anomaly' ? [`${result.anomaly_type ?? ''} — ${result.anomaly_title ?? ''}`] : []),
    ...steps.map((key, i) => `${i + 1}. ${t(key)}`),
  ].join('\n')

  return (
    <section className={`verdict-card verdict-card--${status}`} aria-live="polite">
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

      {status === 'check_failed' ? (
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
              {status === 'anomaly' ? (
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
            {steps.map((key) => <li key={key}>{t(key)}</li>)}
          </ol>
          <div className="workflow-actions">
            {status === 'check_failed' ? (
              <button type="button" className="btn btn--primary" onClick={onChooseSession}><CalendarClock size={17} />{t('action.chooseCheck')}</button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => onOpenManuals(topic)}><BookOpen size={17} />{t('action.findManual')}</button>
            )}
            <button type="button" className="btn btn--secondary" onClick={() => onAskInChat(`${checklist}\n\n${t(status === 'check_failed' ? 'action.askFailed' : 'action.askPlan')}`)}><MessageSquare size={17} />{t('action.toChat')}</button>
            <CopyButton key={result.session_id} text={checklist} />
          </div>
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