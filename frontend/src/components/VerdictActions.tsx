import { BookOpen, ClipboardCopy, FilePlus2, ListTree, MessageSquare } from 'lucide-react'
import type { DiagnoseResponse } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { usableStatus } from '../lib/workflow'

export interface VerdictActionsProps {
  result: DiagnoseResponse
  onExplain: () => void
  onWhatToCheck: () => void
  onSearchManual?: () => void
  onPrepareTicket?: () => void
  onCopyPlan: () => void
  onOtherSession?: () => void
  onRetry?: () => void
}

type Action = {
  id: string
  label: string
  icon: typeof BookOpen
  onClick?: () => void
  primary?: boolean
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
  const effective = usableStatus(result)
  const actions: Action[] = []

  if (effective === 'check_failed') {
    if (onOtherSession) {
      actions.push({
        id: 'other-session',
        label: t('verdict.action.chooseOther'),
        icon: ListTree,
        onClick: onOtherSession,
        primary: true,
      })
    }
    actions.push({
      id: 'repeat-recording',
      label: t('action.askFailed'),
      icon: MessageSquare,
      onClick: onWhatToCheck,
    })
    actions.push({
      id: 'copy-plan',
      label: t('verdict.action.copyRecommendations'),
      icon: ClipboardCopy,
      onClick: onCopyPlan,
    })
  } else {
    if (effective === 'anomaly' && onPrepareTicket) {
      actions.push({
        id: 'prepare-ticket',
        label: t('chat.suggest3'),
        icon: FilePlus2,
        onClick: onPrepareTicket,
        primary: true,
      })
    } else if (onSearchManual) {
      actions.push({
        id: 'search-manual',
        label: t('verdict.action.searchManual'),
        icon: BookOpen,
        onClick: onSearchManual,
        primary: true,
      })
    }
    if (onSearchManual && !actions.some((action) => action.id === 'search-manual')) {
      actions.push({
        id: 'search-manual',
        label: t('verdict.action.searchManual'),
        icon: BookOpen,
        onClick: onSearchManual,
      })
    }
    actions.push({
      id: 'explain',
      label: t('verdict.action.explain'),
      icon: MessageSquare,
      onClick: onExplain,
    })
    actions.push({
      id: 'what-to-check',
      label: t('chat.suggest2'),
      icon: ListTree,
      onClick: onWhatToCheck,
    })
    actions.push({
      id: 'copy-plan',
      label: t('verdict.action.copyPlan'),
      icon: ClipboardCopy,
      onClick: onCopyPlan,
    })
  }

  const primary = actions.find((action) => action.primary)
  const secondary = actions.filter((action) => action !== primary)
  const PrimaryIcon = primary?.icon

  return (
    <div className="verdict-actions">
      <p className="verdict-actions__title">{t('verdict.actions.title')}</p>
      {primary?.onClick && PrimaryIcon ? (
        <button type="button" className="btn btn--primary btn--block verdict-actions__primary" onClick={primary.onClick}>
          <PrimaryIcon size={18} aria-hidden />
          {primary.label}
        </button>
      ) : null}
      <div className="verdict-actions__grid">
        {secondary.map(({ id, label, icon: Icon, onClick }) => (
          <button key={id} type="button" className="verdict-action" onClick={onClick}>
            <Icon size={16} aria-hidden />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
