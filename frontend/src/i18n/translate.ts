import type { TranslationKey } from './keys'
import { TRANSLATIONS, type LocaleCode } from './packs'

export function translate(
  locale: LocaleCode,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const pack = TRANSLATIONS[locale] ?? TRANSLATIONS.ru
  let text = pack[key] ?? TRANSLATIONS.ru[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}