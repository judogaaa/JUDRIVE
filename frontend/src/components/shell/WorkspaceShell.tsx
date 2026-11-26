import type { ReactNode } from 'react'
import { Activity, Bus, ClipboardList, LayoutDashboard, Moon, Sun, Truck } from 'lucide-react'
import type { ThemeMode } from '../../hooks/useTheme'

export type AppView = 'diagnosis' | 'chief' | 'fleet' | 'tickets'

interface WorkspaceShellProps {
  view: AppView
  onViewChange: (view: AppView) => void
  themeMode: ThemeMode
  onThemeCycle: () => void
  children: ReactNode
}

const NAV: { id: AppView; label: string; icon: typeof Activity }[] = [
  { id: 'diagnosis', label: 'Диагностика', icon: Activity },
  { id: 'chief', label: 'Главный механик', icon: LayoutDashboard },
  { id: 'fleet', label: 'Автопарк', icon: Bus },
  { id: 'tickets', label: 'Заявки', icon: ClipboardList },
]

export function WorkspaceShell({ view, onViewChange, themeMode, onThemeCycle, children }: WorkspaceShellProps) {
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
            <p className="shell-brand__caption">Цифровой механик</p>
          </div>
        </div>
        <div className="shell-toolbar">
          <span className="lang-pill" title="Полная локализация — этап 06">
            RU
          </span>
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