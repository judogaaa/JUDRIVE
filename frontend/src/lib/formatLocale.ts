import type { LocaleCode } from '../i18n/translations'

const INTL_LOCALE: Record<LocaleCode, string> = {
  ru: 'ru-RU',
  uz: 'uz-UZ',
  kk: 'kk-KZ',
  tg: 'tg-TJ',
  ky: 'ky-KG',
  hi: 'hi-IN',
  bn: 'bn-BD',
}

export function formatSessionDateTime(locale: LocaleCode, value: string): string {
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? 'ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}