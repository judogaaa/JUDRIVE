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

export type TranslationKey =
  | 'app.caption'
  | 'nav.diagnosis'
  | 'nav.chief'
  | 'nav.fleet'
  | 'nav.tickets'
  | 'theme.cycle'
  | 'diag.title'
  | 'diag.subtitle'
  | 'diag.run'
  | 'diag.running'
  | 'chat.title'
  | 'chat.placeholder'
  | 'chat.send'
  | 'chat.processing'
  | 'chat.empty'
  | 'voice.record'
  | 'voice.stop'
  | 'voice.unavailable'
  | 'voice.editHint'
  | 'voice.transcribing'
  | 'voice.diagnosePhrase'
  | 'ticket.confirmTitle'
  | 'ticket.confirmBtn'
  | 'chief.title'
  | 'chief.subtitle'
  | 'chief.cat.normal'
  | 'chief.cat.attention'
  | 'chief.cat.quarantine'
  | 'chief.cat.quarantineRec'
  | 'chief.cat.quarantineConfirmed'

const ru: Record<TranslationKey, string> = {
  'app.caption': 'Цифровой механик',
  'nav.diagnosis': 'Диагностика',
  'nav.chief': 'Главный механик',
  'nav.fleet': 'Автопарк',
  'nav.tickets': 'Заявки',
  'theme.cycle': 'Тема',
  'diag.title': 'Диагностика',
  'diag.subtitle':
    'Выберите транспорт и сессию, получите вердикт ML, уточните в чате и подтвердите заявку при необходимости.',
  'diag.run': 'Получить результат диагностики',
  'diag.running': 'Запрос к Mock ML…',
  'chat.title': 'Чат с цифровым механиком',
  'chat.placeholder': 'Вопрос или команда механика…',
  'chat.send': 'Отправить',
  'chat.processing': 'Агент обрабатывает запрос…',
  'chat.empty': 'Задайте вопрос по выбранной машине и сессии.',
  'voice.record': 'Запись голоса',
  'voice.stop': 'Остановить',
  'voice.unavailable': 'Микрофон недоступен (нужен HTTPS или разрешение браузера).',
  'voice.editHint': 'Проверьте распознанный текст перед отправкой.',
  'voice.transcribing': 'Распознаём речь…',
  'voice.diagnosePhrase': 'Запусти диагностику',
  'ticket.confirmTitle': 'Черновик заявки ТОиР',
  'ticket.confirmBtn': 'Подтвердить и отправить заявку',
  'chief.title': 'Главный механик',
  'chief.subtitle':
    'Сводка по последней проверке (50 ТС). Карантин не выводится из одного score; рекомендация — до подтверждения.',
  'chief.cat.normal': 'Норма',
  'chief.cat.attention': 'Требует внимания',
  'chief.cat.quarantine': 'Карантин',
  'chief.cat.quarantineRec': 'Рекомендация карантина',
  'chief.cat.quarantineConfirmed': 'Карантин (подтверждено)',
}

const uz: Record<TranslationKey, string> = {
  ...ru,
  'app.caption': 'Raqamli mexanik',
  'nav.diagnosis': 'Diagnostika',
  'nav.chief': 'Bosh mexanik',
  'nav.fleet': 'Avtopark',
  'nav.tickets': 'Arizalar',
  'diag.title': 'Diagnostika',
  'diag.run': 'Diagnostika natijasini olish',
  'chat.title': 'Raqamli mexanik bilan chat',
  'chat.send': 'Yuborish',
  'voice.record': 'Ovoz yozish',
  'chief.title': 'Bosh mexanik',
  'chief.cat.normal': 'Norma',
  'chief.cat.attention': 'Diqqat talab qiladi',
  'chief.cat.quarantineRec': 'Karantin tavsiyasi',
}

const kk: Record<TranslationKey, string> = {
  ...ru,
  'nav.diagnosis': 'Диагностика',
  'nav.chief': 'Бас механик',
  'nav.fleet': 'Автопарк',
  'nav.tickets': 'Өтінімдер',
  'diag.run': 'Диагностика нәтижесін алу',
  'chat.send': 'Жіберу',
  'voice.record': 'Дыбыс жазу',
  'chief.cat.normal': 'Қалыпты',
  'chief.cat.attention': 'Назар аудару',
}

const tg: Record<TranslationKey, string> = {
  ...ru,
  'nav.diagnosis': 'Диагностика',
  'nav.chief': 'Механики калон',
  'nav.fleet': 'Автопарк',
  'nav.tickets': 'Дархостҳо',
  'chat.send': 'Ирсол',
  'voice.record': 'Сабти овоз',
}

const ky: Record<TranslationKey, string> = {
  ...ru,
  'nav.chief': 'Башкы механик',
  'nav.tickets': 'Арыздар',
  'chat.send': 'Жөнөтүү',
  'voice.record': 'Үн жазуу',
}

const hi: Record<TranslationKey, string> = {
  ...ru,
  'nav.diagnosis': 'निदान',
  'nav.chief': 'मुख्य मैकेनिक',
  'nav.fleet': 'बेड़ा',
  'nav.tickets': 'टिकट',
  'diag.run': 'निदान परिणाम प्राप्त करें',
  'chat.send': 'भेजें',
  'voice.record': 'आवाज़ रिकॉर्ड',
  'chief.cat.normal': 'सामान्य',
  'chief.cat.attention': 'ध्यान देने योग्य',
}

const bn: Record<TranslationKey, string> = {
  ...ru,
  'nav.diagnosis': 'নির্ণয়',
  'nav.chief': 'প্রধান মেকানিক',
  'nav.fleet': 'যানবাহন',
  'nav.tickets': 'টিকিট',
  'diag.run': 'নির্ণয় ফলাফল নিন',
  'chat.send': 'পাঠান',
  'voice.record': 'ভয়েস রেকর্ড',
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

export function translate(locale: LocaleCode, key: TranslationKey): string {
  const pack = TRANSLATIONS[locale] ?? TRANSLATIONS.ru
  return pack[key] ?? TRANSLATIONS.ru[key] ?? key
}