import { useMemo, useState } from 'react'
import { Check, ChevronDown, CircleHelp, Search } from 'lucide-react'
import { FAQ_ITEMS, HELP_CARDS, type HelpTarget } from '../help/content'
import type { ThemeMode } from '../hooks/useTheme'
import { useI18n } from '../i18n/I18nContext'
import type { LocaleCode } from '../i18n/translations'

interface HelpViewProps {
  onNavigate: (view: Exclude<HelpTarget, 'settings'>, topic: string) => void
  onRestartOnboarding: () => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}

export function HelpView({ onNavigate, onRestartOnboarding, themeMode, onThemeChange }: HelpViewProps) {
  const { locale, setLocale, locales, localeLabels, t } = useI18n()
  const [query, setQuery] = useState('')

  const cards = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return HELP_CARDS
    return HELP_CARDS.filter((card) =>
      [t(card.titleKey), t(card.bodyKey), ...card.stepKeys.map((key) => t(key))]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [query, t])

  const faq = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return FAQ_ITEMS
    return FAQ_ITEMS.filter((item) =>
      [t(item.questionKey), t(item.answerKey)].join(' ').toLowerCase().includes(q),
    )
  }, [query, t])

  return (
    <div className="help-page">
      <header className="page-header page-header--compact help-header">
        <div>
          <h1>{t('help.title')}</h1>
          <p>{t('help.subtitle')}</p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onRestartOnboarding}>
          <CircleHelp size={17} aria-hidden />
          {t('help.restart')}
        </button>
      </header>

      <div className="help-search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('help.searchPlaceholder')}
          aria-label={t('help.searchPlaceholder')}
        />
      </div>

      <section className="help-grid" aria-label={t('help.title')}>
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <details key={card.id} name="help-topic" className="help-card">
              <summary className="help-card__summary">
                <span className="help-card__icon" aria-hidden>
                  <Icon size={20} />
                </span>
                <span className="help-card__heading">
                  <strong>{t(card.titleKey)}</strong>
                  <span>{t(card.bodyKey)}</span>
                </span>
                <ChevronDown size={18} className="help-card__chevron" aria-hidden />
              </summary>
              <div className="help-card__body">
                {card.stepKeys.length > 0 && (
                  <ol className="help-card__steps">
                    {card.stepKeys.map((key) => (
                      <li key={key}>
                        <Check size={15} aria-hidden />
                        <span>{t(key)}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {card.target === 'settings' ? (
                  <Preferences
                    locale={locale}
                    setLocale={setLocale}
                    locales={locales}
                    localeLabels={localeLabels}
                    themeMode={themeMode}
                    onThemeChange={onThemeChange}
                  />
                ) : (
                  <button type="button" className="btn btn--secondary" onClick={() => { if (card.target !== 'settings') onNavigate(card.target, card.id) }}>
                    {t('help.open')}
                  </button>
                )}
              </div>
            </details>
          )
        })}
      </section>

      {cards.length === 0 ? <p className="empty-state__text">{t('help.empty')}</p> : null}

      <section className="panel help-faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="panel__title">{t('help.faqTitle')}</h2>
        {faq.length ? (
          <div className="help-faq__list">
            {faq.map((item) => (
              <details key={item.id} className="help-faq__item">
                <summary>{t(item.questionKey)}</summary>
                <p>{t(item.answerKey)}</p>
              </details>
            ))}
          </div>
        ) : (
          <p className="empty-state__text">{t('help.empty')}</p>
        )}
      </section>
    </div>
  )
}

function Preferences({
  locale,
  setLocale,
  locales,
  localeLabels,
  themeMode,
  onThemeChange,
}: {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  locales: readonly LocaleCode[]
  localeLabels: Record<LocaleCode, string>
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}) {
  const { t } = useI18n()
  return (
    <div className="help-preferences">
      <div className="help-preferences__row">
        <span>{t('common.language')}</span>
        <select aria-label={t('common.language')} value={locale} onChange={(event) => setLocale(event.target.value as LocaleCode)}>
          {locales.map((code) => (
            <option key={code} value={code}>
              {localeLabels[code]}
            </option>
          ))}
        </select>
      </div>
      <div className="chip-row">
        {(['light', 'dark', 'system'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={themeMode === mode ? 'chip-button chip-button--on' : 'chip-button'}
            aria-pressed={themeMode === mode}
            onClick={() => onThemeChange(mode)}
          >
            {t(mode === 'light' ? 'theme.light' : mode === 'dark' ? 'theme.dark' : 'theme.system')}
          </button>
        ))}
      </div>
    </div>
  )
}
