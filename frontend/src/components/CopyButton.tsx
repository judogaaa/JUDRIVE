import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useI18n } from '../i18n/I18nContext'

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('error')
    }
  }
  return (
    <div className="copy-action">
      <button type="button" className="btn btn--secondary" onClick={() => void copy()}>
        {state === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
        {t(state === 'copied' ? 'action.copied' : 'action.copy')}
      </button>
      {state === 'error' ? <textarea readOnly className="copy-fallback" aria-label={t('action.copy')} value={text} onFocus={(e) => e.currentTarget.select()} /> : null}
    </div>
  )
}
