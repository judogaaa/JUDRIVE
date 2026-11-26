import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight, Check, CircleHelp, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'
import { ONBOARDING_STEPS } from '../help/content'

interface OnboardingProps {
  open: boolean
  step: number
  acknowledged: boolean
  onNext: () => void
  onBack: () => void
  onSkip: () => void
  onClose: () => void
  onAcknowledge: (value: boolean) => void
  onStart: () => void
}

export function Onboarding({
  open,
  step,
  acknowledged,
  onNext,
  onBack,
  onSkip,
  onClose,
  onAcknowledge,
  onStart,
}: OnboardingProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], summary'),
      ).filter((node) => node.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
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

  if (!open) return null

  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0]
  const last = step === ONBOARDING_STEPS.length - 1
  const Icon = current.icon

  return (
    <div className="onboarding" ref={dialogRef} role="dialog" aria-modal="true" aria-label={t('onboarding.title')} tabIndex={-1}>
      <div className="onboarding__backdrop" />
      <section className="onboarding__panel">
        <header className="onboarding__head">
          <div>
            <p className="eyebrow">{t('onboarding.title')}</p>
            <h2 id="onboarding-title">{t(current.titleKey)}</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" aria-label={t('onboarding.close')} onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
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
                {t(key)}
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
          <button type="button" className="ghost-button" onClick={onSkip}>
            {t('onboarding.skip')}
          </button>
          <div className="onboarding__nav">
            {step > 0 ? (
              <button type="button" className="btn btn--secondary" onClick={onBack}>
                <ArrowLeft size={16} aria-hidden />
                {t('onboarding.back')}
              </button>
            ) : null}
            {last ? (
              <button type="button" className="btn btn--primary" disabled={!acknowledged} onClick={onStart}>
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

        <p className="onboarding__hint">
          <CircleHelp size={14} aria-hidden />
          {t('nav.help')}
        </p>
      </section>
    </div>
  )
}

function StepPreview({ stepId }: { stepId: string }) {
  const { t } = useI18n()
  if (stepId === 'diagnosis') {
    return (
      <div className="onboarding-preview onboarding-preview--statuses">
        <span className="badge badge--normal">{t('verdict.normal.title')}</span>
        <span className="badge badge--attention">{t('verdict.anomaly.title')}</span>
        <span className="badge badge--attention">{t('verdict.failed.title')}</span>
      </div>
    )
  }
  if (stepId === 'chat') {
    return (
      <div className="onboarding-preview onboarding-preview--chat">
        <span>{t('chat.status.anomaly')}</span>
        <strong>{t('verdict.action.searchManual')}</strong>
      </div>
    )
  }
  if (stepId === 'manuals') {
    return (
      <div className="onboarding-preview onboarding-preview--pdf">
        <FileBadge />
        <span>PDF 34</span>
        <span>{t('source.fit')}</span>
      </div>
    )
  }
  if (stepId === 'tickets') {
    return (
      <div className="onboarding-preview onboarding-preview--ticket">
        <span className="badge badge--normal">{t('tickets.statusCreated')}</span>
        <strong>TKT</strong>
      </div>
    )
  }
  if (stepId === 'fleet') {
    return (
      <div className="onboarding-preview onboarding-preview--fleet">
        <strong>50</strong>
        <span>{t('chief.tab.queue')}</span>
      </div>
    )
  }
  if (stepId === 'ready') {
    return (
      <div className="onboarding-preview onboarding-preview--settings">
        <span>Русский</span>
        <span>O‘zbekcha</span>
        <span>हिन्दी</span>
      </div>
    )
  }
  return <div className="onboarding-preview onboarding-preview--welcome">{t('diag.workflow')}</div>
}

function FileBadge() {
  return <span className="onboarding-preview__file" aria-hidden>PDF</span>
}
