import { ManualSearchPanel } from '../components/ManualSearchPanel'
import { useI18n } from '../i18n/I18nContext'

interface ManualsViewProps {
  engineModel: string | null
}

export function ManualsView({ engineModel }: ManualsViewProps) {
  const { t } = useI18n()
  return (
    <>
      <header className="page-header page-header--compact">
        <h1>{t('nav.manuals')}</h1>
      </header>
      <ManualSearchPanel engineModel={engineModel} />
    </>
  )
}
