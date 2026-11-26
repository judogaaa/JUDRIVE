import { useEffect, useId, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

export function HelpTip({ text }: { text: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span className="help-tip" ref={rootRef}>
      <button
        type="button"
        className="help-tip__button"
        aria-label={t('help.tip.label')}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp size={13} aria-hidden />
      </button>
      {open ? (
        <span className="help-tip__popover" role="tooltip" id={id}>
          {text}
        </span>
      ) : null}
    </span>
  )
}
