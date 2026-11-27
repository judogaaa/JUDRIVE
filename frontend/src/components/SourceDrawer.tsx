import { lazy, Suspense } from 'react'
import type { DocumentScope, ManualSearchHit } from '../api/manuals'
import type { RecentPage } from '../lib/manuals'
import { useI18n } from '../i18n/I18nContext'

const LazySourceViewer = lazy(() =>
  import('./SourceViewer').then((module) => ({ default: module.SourceViewer })),
)

interface SourceDrawerProps {
  hit: ManualSearchHit | null
  scope: DocumentScope
  onClose: () => void
  onRecentChange?: (pages: RecentPage[]) => void
}

/**
 * PDF.js is loaded only when a mechanic actually opens a source.
 * This keeps the initial workspace bundle free of the viewer dependency.
 */
export function SourceDrawer({ hit, scope, onClose, onRecentChange }: SourceDrawerProps) {
  if (!hit) return null
  return (
    <Suspense fallback={<SourceLoading hit={hit} onClose={onClose} />}>
      <LazySourceViewer hit={hit} scope={scope} onClose={onClose} onRecentChange={onRecentChange} />
    </Suspense>
  )
}

function SourceLoading({ hit, onClose }: { hit: ManualSearchHit; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <div className="source-drawer" role="dialog" aria-modal="true" aria-label={hit.manual_title}>
      <div className="source-drawer__backdrop" onClick={onClose} />
      <div className="source-drawer__panel">
        <div className="pdf-status" role="status">
          {t('insight.loading')}
        </div>
      </div>
    </div>
  )
}
