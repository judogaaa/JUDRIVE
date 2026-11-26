import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Activity, BookOpen, Bus, Check, ClipboardList, ChevronDown, Globe, LayoutDashboard, Monitor, Moon, Sun, Truck } from 'lucide-react'
import type { ThemeMode } from '../../hooks/useTheme'
import { useI18n } from '../../i18n/I18nContext'
import type { LocaleCode } from '../../i18n/translations'

export type AppView = 'diagnosis' | 'chief' | 'fleet' | 'tickets' | 'manuals'

interface WorkspaceShellProps {
  view: AppView
  onViewChange: (view: AppView) => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  children: ReactNode
}

export function WorkspaceShell({ view, onViewChange, themeMode, onThemeChange, children }: WorkspaceShellProps) {
  const { t, locale, setLocale, locales, localeLabels } = useI18n()
  const [langOpen, setLangOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)
  const langId = useId()
  const themeId = useId()

  const NAV: { id: AppView; label: string; icon: typeof Activity }[] = [
    { id: 'diagnosis', label: t('nav.diagnosis'), icon: Activity },
    { id: 'manuals', label: t('nav.manuals'), icon: BookOpen },
    { id: 'chief', label: t('nav.chief'), icon: LayoutDashboard },
    { id: 'fleet', label: t('nav.fleet'), icon: Bus },
    { id: 'tickets', label: t('nav.tickets'), icon: ClipboardList },
  ]

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (langRef.current && !langRef.current.contains(target)) setLangOpen(false)
      if (themeRef.current && !themeRef.current.contains(target)) setThemeOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLangOpen(false)
        setThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const themeOptions: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: t('theme.light'), icon: Sun },
    { id: 'dark', label: t('theme.dark'), icon: Moon },
    { id: 'system', label: t('theme.system'), icon: Monitor },
  ]
  const ThemeIcon = themeOptions.find((o) => o.id === themeMode)?.icon ?? Sun

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
          <div className="menu" ref={langRef}>
            <button
              type="button"
              className="menu-trigger"
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-controls={langId}
              onClick={() => {
                setLangOpen((v) => !v)
                setThemeOpen(false)
              }}
            >
              <Globe size={16} aria-hidden />
              <span>{localeLabels[locale]}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
            {langOpen ? (
              <ul className="menu-panel" id={langId} role="listbox" aria-label={t('common.language')}>
                {locales.map((code) => (
                  <li key={code}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={code === locale}
                      className="menu-item"
                      onClick={() => {
                        setLocale(code as LocaleCode)
                        setLangOpen(false)
                      }}
                    >
                      <span>{localeLabels[code]}</span>
                      {code === locale ? <Check size={14} aria-hidden /> : <span className="menu-item__spacer" />}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="menu" ref={themeRef}>
            <button
              type="button"
              className="icon-btn"
              aria-haspopup="menu"
              aria-expanded={themeOpen}
              aria-controls={themeId}
              aria-label={themeOptions.find((o) => o.id === themeMode)?.label}
              onClick={() => {
                setThemeOpen((v) => !v)
                setLangOpen(false)
              }}
            >
              <ThemeIcon size={18} strokeWidth={2} aria-hidden />
            </button>
            {themeOpen ? (
              <ul className="menu-panel menu-panel--theme" id={themeId} role="menu">
                {themeOptions.map(({ id, label, icon: Icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={themeMode === id}
                      className="menu-item"
                      onClick={() => {
                        onThemeChange(id)
                        setThemeOpen(false)
                      }}
                    >
                      <Icon size={16} aria-hidden />
                      <span>{label}</span>
                      {themeMode === id ? <Check size={14} aria-hidden /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="shell-nav-mobile" aria-label={t('common.sections')}>
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
        <nav className="shell-nav" aria-label={t('common.sections')}>
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
