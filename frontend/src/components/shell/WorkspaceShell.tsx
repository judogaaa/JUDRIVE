import type { ReactNode } from 'react'
import { Activity, Bus, ClipboardList, LayoutDashboard, Moon, Sun, Truck } from 'lucide-react'
import type { ThemeMode } from '../../hooks/useTheme'
import { useI18n } from '../../i18n/I18nContext'
import type { LocaleCode } from '../../i18n/translations'

export type AppView = 'diagnosis' | 'chief' | 'fleet' | 'tickets'

interface WorkspaceShellProps {
  view: AppView
  onViewChange: (view: AppView) => void
  themeMode: ThemeMode
  onThemeCycle: () => void
  children: ReactNode
}

export function WorkspaceShell({ view, onViewChange, themeMode, onThemeCycle, children }: WorkspaceShellProps) {
  const { t, locale, setLocale, locales, localeLabels } = useI18n()
  const NAV: { id: AppView; label: string; icon: typeof Activity }[] = [
    { id: 'diagnosis', label: t('nav.diagnosis'), icon: Activity },
    { id: 'chief', label: t('nav.chief'), icon: LayoutDashboard },
    { id: 'fleet', label: t('nav.fleet'), icon: Bus },
    { id: 'tickets', label: t('nav.tickets'), icon: ClipboardList },
  ]
  const ThemeIcon = themeMode === 'dark' ? Moon : Sun
  const themeLabel =
    themeMode === 'system' ? 'Системная тема' : themeMode === 'dark' ? 'Тёмная тема' : 'Светлая тема'

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="shell-brand">
          <BrandIcon />
          <div>
            <p className="shell-brand__title">JUDRIVE</p>
            <p className="shell-brand__caption">{t('app.caption')}</p>
          </div>
        </div>
        <div className="shell-toolbar">
          <label className="lang-select">
            <span className="sr-only">Язык</span>
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleCode)}
              aria-label="Язык интерфейса"
            >
              {locales.map((code) => (
                <option key={code} value={code}>
                  {localeLabels[code]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="icon-btn" onClick={onThemeCycle} aria-label={themeLabel} title={themeLabel}>
            <ThemeIcon size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </header>

      <nav className="shell-nav-mobile" aria-label="Разделы">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={view === id ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => onViewChange(id)}
          >
            <Icon size={18} aria-hidden />
            {label}
          </button>
        ))}
      </nav>

      <div className="shell-body">
        <nav className="shell-nav" aria-label="Разделы">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={view === id ? 'nav-item nav-item--active' : 'nav-item'}
              onClick={() => onViewChange(id)}
            >
              <Icon size={18} aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  )
}

function BrandIcon() {
  return (
    <span className="shell-brand__icon" aria-hidden>
      <Truck size={20} strokeWidth={2.2} />
    </span>
  )
}