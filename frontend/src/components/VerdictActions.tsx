import { BookOpen, ClipboardCopy, MessageSquare, FilePlus2, ListTree } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { useI18n } from '../i18n/I18nContext'

export interface VerdictActionsProps {
  result: DiagnoseResponse
  onExplain: () => void
  onWhatToCheck: () => void
  onSearchManual: () => void
  onPrepareTicket?: () => void
  onCopyPlan: () => void
  onOtherSession?: () => void
}

export function VerdictActions({
  result,
  onExplain,
  onWhatToCheck,
  onSearchManual,
  onPrepareTicket,
  onCopyPlan,
  onOtherSession,
}: VerdictActionsProps) {
  const { t } = useI18n()
  const failed = result.status === 'check_failed' || result.signal_quality === 'bad'
  const canTicket = result.status === 'anomaly' && !failed

  return (
    <div className="verdict-actions">
      <p className="verdict-actions__title">{t('verdict.actions.title')}</p>
      <div className="verdict-actions__grid">
        <button type="button" className="verdict-action" onClick={onExplain}>
          <MessageSquare size={16} aria-hidden />
          {t('verdict.action.explain')}
        </button>
        <button type="button" className="verdict-action" onClick={onWhatToCheck}>
          <ListTree size={16} aria-hidden />
          {t('chat.suggest2')}
        </button>
        {!failed ? (
          <button type="button" className="verdict-action" onClick={onSearchManual}>
            <BookOpen size={16} aria-hidden />
            {t('verdict.action.searchManual')}
          </button>
        ) : null}
        {canTicket && onPrepareTicket ? (
          <button type="button" className="verdict-action" onClick={onPrepareTicket}>
            <FilePlus2 size={16} aria-hidden />
            {t('chat.suggest3')}
          </button>
        ) : null}
        <button type="button" className="verdict-action" onClick={onCopyPlan}>
          <ClipboardCopy size={16} aria-hidden />
          {t('verdict.action.copyPlan')}
        </button>
        {failed && onOtherSession ? (
          <button type="button" className="verdict-action" onClick={onOtherSession}>
            <ListTree size={16} aria-hidden />
            {t('verdict.action.otherSession')}
          </button>
        ) : null}
      </div>
    </div>
  )
}