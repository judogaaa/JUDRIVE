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

// Chromium ICU falls back to "M11" for uz/kk and to Russian for ky/tg.
// Explicit short months keep dates readable in every supported locale.
const SHORT_MONTHS: Partial<Record<LocaleCode, string[]>> = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'],
  kk: ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'],
  tg: ['янв.', 'фев.', 'мар.', 'апр.', 'май', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'ноя.', 'дек.'],
  ky: ['янв.', 'фев.', 'мар.', 'апр.', 'май', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'ноя.', 'дек.'],
}

export function formatSessionDateTime(locale: LocaleCode, value: string): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const months = SHORT_MONTHS[locale]
    if (months) {
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${day} ${months[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes}`
    }
    return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? 'ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return value
  }
}