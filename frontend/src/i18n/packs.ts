import type { TranslationKey } from './keys'
import { bn } from './locales/bn'
import { hi } from './locales/hi'
import { kk } from './locales/kk'
import { ky } from './locales/ky'
import { ru } from './locales/ru'
import { tg } from './locales/tg'
import { uz } from './locales/uz'

export const SUPPORTED_LOCALES = ['ru', 'uz', 'kk', 'tg', 'ky', 'hi', 'bn'] as const
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_LABELS: Record<LocaleCode, string> = {
  ru: 'Русский',
  uz: "O'zbekcha",
  kk: 'Қазақша',
  tg: 'Тоҷикӣ',
  ky: 'Кыргызча',
  hi: 'हिन्दी',
  bn: 'বাংলা',
}

export const TRANSLATIONS: Record<LocaleCode, Record<TranslationKey, string>> = {
  ru,
  uz,
  kk,
  tg,
  ky,
  hi,
  bn,
}