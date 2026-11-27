import { useState } from 'react'
import {
  Activity,
  BookOpen,
  Bus,
  ChevronRight,
  ClipboardList,
  CircleHelp,
  MessageSquare,
  Monitor,
  Moon,
  Sun,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { readRole, type SessionRole } from '../api/auth'
import type { ThemeMode } from '../hooks/useTheme'
import { useI18n } from '../i18n/I18nContext'
import type { TranslationKey } from '../i18n/translations'

const FEATURES: { icon: LucideIcon; labelKey: TranslationKey }[] = [
  { icon: Activity, labelKey: 'nav.diagnosis' },
  { icon: MessageSquare, labelKey: 'chat.title' },
  { icon: BookOpen, labelKey: 'nav.manuals' },
  { icon: ClipboardList, labelKey: 'nav.tickets' },
  { icon: Bus, labelKey: 'nav.fleet' },
  { icon: CircleHelp, labelKey: 'nav.help' },
]

const THEMES: { id: ThemeMode; icon: LucideIcon; labelKey: TranslationKey }[] = [
  { id: 'light', icon: Sun, labelKey: 'theme.light' },
  { id: 'dark', icon: Moon, labelKey: 'theme.dark' },
  { id: 'system', icon: Monitor, labelKey: 'theme.system' },
]

export function LoginView({
  checking,
  themeMode,
  onThemeChange,
  onSuccess,
}: {
  checking: boolean
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  onSuccess: (role: SessionRole) => void
}) {
  const { t, locale, setLocale, locales, localeLabels } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        if (response.status === 503) setError(t('auth.unavailable'))
        else if (response.status === 429) setError(t('auth.locked'))
        else setError(t('auth.error'))
        return
      }
      const role = readRole(await response.json())
      if (!role) throw new Error()
      onSuccess(role)
    } catch {
      setError(t('auth.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <header className="login-page__top">
        <div className="login-brand">
          <span className="login-brand__icon" aria-hidden>
            <Truck size={22} strokeWidth={2.2} />
          </span>
          <span>
            <strong>JUDRIVE</strong>
            <small>{t('app.caption')}</small>
          </span>
        </div>
        <div className="login-preferences">
          <label className="login-locale">
            <span className="sr-only">{t('common.language')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as never)}>
              {locales.map((code) => (
                <option key={code} value={code}>
                  {localeLabels[code]}
                </option>
              ))}
            </select>
          </label>
          <div className="login-theme" role="group" aria-label={t('theme.system')}>
            {THEMES.map(({ id, icon: Icon, labelKey }) => (
              <button
                key={id}
                type="button"
                className={themeMode === id ? 'login-theme__button login-theme__button--on' : 'login-theme__button'}
                aria-label={t(labelKey)}
                aria-pressed={themeMode === id}
                title={t(labelKey)}
                onClick={() => onThemeChange(id)}
              >
                <Icon size={16} aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="login-layout">
        <section className="login-hero" aria-labelledby="login-product-title">
          <p className="eyebrow">{t('app.caption')}</p>
          <h1 id="login-product-title">JUDRIVE</h1>
          <p className="login-hero__lead">{t('onboarding.step.1.body')}</p>
          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, labelKey }) => (
              <li key={labelKey}>
                <span className="login-feature__icon" aria-hidden>
                  <Icon size={17} />
                </span>
                {t(labelKey)}
              </li>
            ))}
          </ul>
          <div className="login-stack" aria-label="JUDRIVE stack">
            <span>Mock ML</span>
            <span>GigaChat-3-Ultra</span>
            <span>RAG</span>
            <span>Mock ТОиР</span>
          </div>
        </section>

        <section className="login-card panel" aria-labelledby="login-title">
          {checking ? (
            <div className="login-checking" role="status">
              <span className="login-checking__dot" aria-hidden />
              {t('chief.loading')}
            </div>
          ) : (
            <>
              <div className="login-card__head">
                <p className="eyebrow">JUDRIVE</p>
                <h2 id="login-title">{t('auth.title')}</h2>
              </div>
              <p className="auth-hint" role="note">
                {t('auth.demoLabel')}{' · '}
                {t('auth.user')}: <strong>123</strong>
                <span aria-hidden> · </span>
                {t('auth.password')}: <strong>123</strong>
              </p>
              <form
                className="login-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!busy && username && password) void submit()
                }}
              >
                <label className="field">
                  <span>{t('auth.user')}</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </label>
                <label className="field">
                  <span>{t('auth.password')}</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                {error ? <p className="panel__error" role="alert">{error}</p> : null}
                <button type="submit" className="btn btn--primary login-submit" disabled={busy || !username || !password}>
                  {busy ? t('chief.loading') : t('auth.submit')}
                  <ChevronRight size={17} aria-hidden />
                </button>
              </form>
              <p className="login-card__note">{t('onboarding.step.7.point.1')} · {t('onboarding.step.7.point.2')}</p>
            </>
          )}
        </section>
      </main>

      <footer className="login-page__footer">
        <span>JUDRIVE · ИИкузница 2026</span>
        <span>Mock ML · Mock ТОиР · PDF RAG</span>
      </footer>
    </div>
  )
}
