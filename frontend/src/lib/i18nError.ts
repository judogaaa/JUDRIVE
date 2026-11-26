import type { TranslationKey } from '../i18n/keys'

export const I18N_ERROR_PREFIX = '@i18n:'

export function i18nError(key: TranslationKey, status?: number): Error {
  if (status != null) {
    return new Error(`${I18N_ERROR_PREFIX}${key}:${status}`)
  }
  return new Error(`${I18N_ERROR_PREFIX}${key}`)
}

export function resolveErrorMessage(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  err: unknown,
  fallback: TranslationKey,
): string {
  if (err instanceof Error) {
    if (err.message.startsWith(I18N_ERROR_PREFIX)) {
      const rest = err.message.slice(I18N_ERROR_PREFIX.length)
      const [key, status] = rest.split(':')
      if (status) {
        return t(key as TranslationKey, { status: Number(status) || status })
      }
      return t(key as TranslationKey)
    }
    return err.message
  }
  return t(fallback)
}