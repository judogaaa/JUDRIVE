import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LOCALE_LABELS, SUPPORTED_LOCALES, translate, type LocaleCode, type TranslationKey } from './translations'

const STORAGE_KEY = 'judrive-locale'

type I18nContextValue = {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  t: (key: TranslationKey) => string
  locales: typeof SUPPORTED_LOCALES
  localeLabels: typeof LOCALE_LABELS
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && SUPPORTED_LOCALES.includes(saved as LocaleCode)) return saved as LocaleCode
    return 'ru'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale === 'tg' ? 'tg' : locale
  }, [locale])

  const setLocale = useCallback((code: LocaleCode) => {
    setLocaleState(code)
  }, [])

  const t = useCallback((key: TranslationKey) => translate(locale, key), [locale])

  const value = useMemo(
    () => ({ locale, setLocale, t, locales: SUPPORTED_LOCALES, localeLabels: LOCALE_LABELS }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n вне I18nProvider')
  return ctx
}