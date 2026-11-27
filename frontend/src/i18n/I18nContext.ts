import { createContext, useContext } from 'react'
import type { TranslationKey } from './keys'
import type { LOCALE_LABELS, SUPPORTED_LOCALES, LocaleCode } from './translations'

type I18nContextValue = {
  locale: LocaleCode
  setLocale: (code: LocaleCode) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  locales: typeof SUPPORTED_LOCALES
  localeLabels: typeof LOCALE_LABELS
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n вне I18nProvider')
  return ctx
}
