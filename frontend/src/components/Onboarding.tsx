import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Check, LockKeyhole, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { ONBOARDING_STEPS } from '../help/content'
import type { LocaleCode } from '../i18n/translations'

interface OnboardingProps {
  open: boolean
  step: number
  acknowledged: boolean
  onNext: () => void
  onBack: () => void
  onAcknowledge: (value: boolean) => void
  onStart: () => void
}

export function Onboarding({
  open,
  step,
  acknowledged,
  onNext,
  onBack,
  onAcknowledge,
  onStart,
}: OnboardingProps) {
  const { t, locale, setLocale, locales, localeLabels } = useI18n()
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const last = step === ONBOARDING_STEPS.length - 1
  const canFinish = last && acknowledged
  const finishRef = useRef<(() => void) | null>(null)
  finishRef.current = canFinish ? onStart : null

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    headingRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finishRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], summary'),
      ).filter((node) => node.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])

  useEffect(() => {
    // The next button can become disabled on the final slide; keep focus inside.
    if (open && (!dialogRef.current?.contains(document.activeElement) ||
      (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled))) {
      headingRef.current?.focus()
    }
  }, [open, step, canFinish])

  if (!open) return null

  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0]
  const Icon = current.icon

  return (
    <div className="onboarding" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('onboarding.title')} tabIndex={-1}>
      <div className="onboarding__backdrop" />
      <section className="onboarding__panel">
        <header className="onboarding__head">
          <div>
            <p className="eyebrow">{t('onboarding.title')}</p>
            <h2 id="onboarding-title" ref={headingRef} tabIndex={-1}>{t(current.titleKey)}</h2>
          </div>
          <div className="onboarding__tools">
            <select aria-label={t('common.language')} value={locale} onChange={(event) => setLocale(event.target.value as LocaleCode)}>
              {locales.map((code) => <option key={code} value={code}>{localeLabels[code]}</option>)}
            </select>
            <button type="button" className="icon-btn onboarding__close" aria-label={t('onboarding.close')} title={canFinish ? t('onboarding.close') : t('onboarding.required')} disabled={!canFinish} onClick={onStart}>
              <X size={18} aria-hidden />
            </button>
          </div>
        </header>

        <div className="onboarding__progress" aria-label={t('onboarding.progress', { current: step + 1, total: ONBOARDING_STEPS.length })}>
          <div className="onboarding__progress-bar" role="progressbar" aria-valuemin={1} aria-valuemax={ONBOARDING_STEPS.length} aria-valuenow={step + 1}>
            <span style={{ width: `${((step + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
          </div>
          <span>{t('onboarding.progress', { current: step + 1, total: ONBOARDING_STEPS.length })}</span>
        </div>

        <div className="onboarding__body">
          <div className="onboarding__visual" aria-hidden>
            <span className="onboarding__visual-icon">
              <Icon size={30} />
            </span>
            <StepPreview stepId={current.id} />
          </div>
          <p className="onboarding__lead">{t(current.bodyKey)}</p>
          <ul className="onboarding__points">
            {current.pointKeys.map((key) => (
              <li key={key}>
                <Check size={15} aria-hidden />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        {last ? (
          <label className="onboarding__ack">
            <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} />
            <span>{t('onboarding.ack')}</span>
          </label>
        ) : null}

        <footer className="onboarding__actions">
          {!canFinish && <span className="onboarding__hint"><LockKeyhole size={14} aria-hidden />{t('onboarding.required')}</span>}
          <div className="onboarding__nav">
            {step > 0 ? (
              <button type="button" className="btn btn--secondary" onClick={onBack}>
                <ArrowLeft size={16} aria-hidden />
                {t('onboarding.back')}
              </button>
            ) : null}
            {last ? (
              <button type="button" className="btn btn--primary" disabled={!canFinish} onClick={onStart}>
                {t('onboarding.start')}
              </button>
            ) : (
              <button type="button" className="btn btn--primary" onClick={onNext}>
                {t('onboarding.next')}
                <ArrowRight size={16} aria-hidden />
              </button>
            )}
          </div>
        </footer>

      </section>
    </div>
  )
}

function StepPreview({ stepId }: { stepId: string }) {
  const { t } = useI18n()
  if (stepId === 'diagnosis') return (
    <div className="onboarding-preview onboarding-preview--statuses">
      <span className="badge badge--normal">{t('verdict.normal.title')}</span>
      <span className="badge badge--attention">{t('verdict.anomaly.title')}</span>
      <span className="badge badge--attention">{t('verdict.failed.title')}</span>
    </div>
  )
  const topics = {
    welcome: ['nav.diagnosis', 'nav.manuals', 'nav.tickets'],
    chat: ['chat.suggest1', 'verdict.action.searchManual'],
    manuals: ['ticket.pdfPage', 'source.fit'],
    tickets: ['tickets.statusCreated', 'ticket.confirmedId'],
    fleet: ['nav.fleet', 'nav.chief'],
    ready: ['common.language', 'theme.light', 'theme.dark', 'theme.system'],
  } as const
  const labels = topics[stepId as keyof typeof topics] ?? topics.welcome
  return <div className="onboarding-preview">{labels.map((key) => <span className="onboarding-preview__tag" key={key}>{t(key)}</span>)}</div>
}
