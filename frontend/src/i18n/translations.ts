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
  | 'diag.search'
  | 'diag.vehicle'
  | 'diag.check'
  | 'diag.sideTitle'
  | 'fleet.title'
  | 'fleet.subtitle'
  | 'tickets.title'
  | 'tickets.subtitle'
  | 'tickets.empty'
  | 'tickets.loading'
  | 'theme.system'
  | 'theme.light'
  | 'theme.dark'
  | 'diag.filterPlaceholder'
  | 'diag.vehiclePassport'
  | 'diag.workflow'
  | 'diag.step.select'
  | 'diag.step.run'
  | 'diag.step.review'
  | 'diag.step.act'
  | 'diag.garage'
  | 'diag.engine'
  | 'verdict.eyebrow'
  | 'verdict.eyebrow.error'
  | 'verdict.loading.title'
  | 'verdict.loading.hint'
  | 'verdict.empty.title'
  | 'verdict.empty.hint'
  | 'verdict.error.title'
  | 'verdict.engine'
  | 'verdict.signal'
  | 'verdict.confidence'
  | 'verdict.type'
  | 'verdict.score'
  | 'verdict.normal.title'
  | 'verdict.normal.lead'
  | 'verdict.normal.footnote'
  | 'verdict.anomaly.title'
  | 'verdict.anomaly.lead'
  | 'verdict.anomaly.footnote'
  | 'verdict.failed.title'
  | 'verdict.failed.lead'
  | 'verdict.failed.action'
  | 'verdict.signal.good'
  | 'verdict.signal.warning'
  | 'verdict.signal.bad'
  | 'verdict.steps.title'
  | 'verdict.steps.normal.1'
  | 'verdict.steps.normal.2'
  | 'verdict.steps.anomaly.1'
  | 'verdict.steps.anomaly.2'
  | 'verdict.steps.anomaly.3'
  | 'verdict.steps.failed.1'
  | 'verdict.steps.failed.2'
  | 'chat.roleUser'
  | 'chat.roleAgent'
  | 'chat.suggest1'
  | 'chat.suggest2'
  | 'chat.suggest3'
  | 'chat.contextEmpty'
  | 'chat.status.normal'
  | 'chat.status.anomaly'
  | 'chat.status.check_failed'
  | 'ticket.confirmedId'
  | 'history.title'
  | 'history.subtitle'
  | 'manual.title'
  | 'manual.query'
  | 'manual.search'
  | 'manual.searching'
  | 'manual.hintNoVehicle'
  | 'manual.hintEngine'
  | 'manual.refusalTitle'
  | 'manual.openSource'
  | 'manual.queryPlaceholder'
  | 'chief.loading'
  | 'chief.queueTitle'
  | 'chief.queueHint'
  | 'chief.quarantineCardHint'
  | 'chief.analyticsTitle'
  | 'chief.warningsTitle'
  | 'chief.filtersTitle'
  | 'chief.stat.status'
  | 'chief.stat.engine'
  | 'chief.stat.anomaly'
  | 'fleet.searchLabel'
  | 'fleet.searchPlaceholder'
  | 'error.unknown'
  | 'error.fleet'
  | 'error.chatOpen'
  | 'error.agent'
  | 'error.source'
  | 'error.dashboard'
  | 'error.tickets'

const ru: Record<TranslationKey, string> = {
  'app.caption': 'Цифровой механик',
  'nav.diagnosis': 'Диагностика',
  'nav.chief': 'Главный механик',
  'nav.fleet': 'Автопарк',
  'nav.tickets': 'Заявки',
  'theme.cycle': 'Тема',
  'diag.title': 'Диагностика',
  'diag.subtitle': 'Выберите машину и проверку. Спросите механика в чате. Заявку отправляет только кнопка подтверждения.',
  'diag.run': 'Получить результат диагностики',
  'diag.running': 'Получаем результат…',
  'diag.search': 'Поиск',
  'diag.vehicle': 'Машина',
  'diag.check': 'Проверка',
  'diag.sideTitle': 'Контекст',
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
  'fleet.title': 'Автопарк',
  'fleet.subtitle': 'Все машины. Нажмите строку, чтобы открыть диагностику.',
  'tickets.title': 'Заявки',
  'tickets.subtitle': 'Отправленные заявки после вашего подтверждения.',
  'tickets.empty': 'Пока нет подтверждённых заявок. Подготовьте черновик в чате.',
  'tickets.loading': 'Загрузка…',
  'theme.system': 'Системная тема',
  'theme.light': 'Светлая тема',
  'theme.dark': 'Тёмная тема',
  'diag.filterPlaceholder': 'Фильтр списка…',
  'diag.vehiclePassport': 'Паспорт ТС',
  'diag.workflow': 'Шаги диагностики',
  'diag.step.select': 'Машина и проверка',
  'diag.step.run': 'Результат ML',
  'diag.step.review': 'Вердикт',
  'diag.step.act': 'Чат и заявка',
  'diag.garage': 'Гараж',
  'diag.engine': 'Двигатель',
  'verdict.eyebrow': 'Вердикт',
  'verdict.eyebrow.error': 'Ошибка',
  'verdict.loading.title': 'Получаем результат…',
  'verdict.loading.hint': 'Обрабатываем запись проверки…',
  'verdict.empty.title': 'Запустите проверку',
  'verdict.empty.hint': 'Нажмите «Получить результат диагностики» после выбора машины и сессии.',
  'verdict.error.title': 'Не удалось получить результат',
  'verdict.engine': 'Двигатель',
  'verdict.signal': 'Качество записи',
  'verdict.confidence': 'Уверенность модели',
  'verdict.type': 'Тип отклонения',
  'verdict.score': 'Показатель отклонения',
  'verdict.normal.title': 'В пределах нормы',
  'verdict.normal.lead': 'Признаков отклонения в записи не найдено.',
  'verdict.normal.footnote':
    'Норма не гарантирует исправность. При сомнениях — осмотр по руководству в чате.',
  'verdict.anomaly.title': 'Возможное отклонение',
  'verdict.anomaly.lead':
    'ML зафиксировал отклонение — это гипотеза для проверки, не подтверждённый ремонт.',
  'verdict.anomaly.footnote':
    'Уверенность модели — не вероятность поломки. Показатель отклонения — не срок до отказа.',
  'verdict.failed.title': 'Запись непригодна',
  'verdict.failed.lead': 'По этой сессии диагностика недоступна — нужна повторная запись.',
  'verdict.failed.action': 'Не ставьте диагноз и не отправляйте заявку по этой проверке.',
  'verdict.signal.good': 'Хорошее',
  'verdict.signal.warning': 'С помехами',
  'verdict.signal.bad': 'Непригодна',
  'verdict.steps.title': 'Что делать дальше',
  'verdict.steps.normal.1': 'Уточните процедуру осмотра в чате или поиске по руководству.',
  'verdict.steps.normal.2': 'Заявку оформляют только при подтверждённом отклонении.',
  'verdict.steps.anomaly.1': 'Спросите механика в чате: что проверить и в каком порядке.',
  'verdict.steps.anomaly.2': 'Найдите процедуру в руководстве с цитатой и страницей PDF.',
  'verdict.steps.anomaly.3': 'Черновик заявки — только после источников и вашего подтверждения.',
  'verdict.steps.failed.1': 'Повторите акустическую запись на машине.',
  'verdict.steps.failed.2': 'Выберите новую сессию и снова получите результат.',
  'chat.roleUser': 'Вы',
  'chat.roleAgent': 'Механик',
  'chat.suggest1': 'Объясни результат диагностики и что делать дальше',
  'chat.suggest2': 'Найди процедуру проверки по руководству',
  'chat.suggest3': 'Подготовь черновик заявки с источниками',
  'chat.contextEmpty': 'Сначала получите результат диагностики.',
  'chat.status.normal': 'Последний вердикт: норма',
  'chat.status.anomaly': 'Последний вердикт: отклонение',
  'chat.status.check_failed': 'Последний вердикт: запись непригодна',
  'ticket.confirmedId': 'Номер заявки',
  'history.title': 'История проверок',
  'history.subtitle': 'Переключите сессию — вердикт обновится после нового запроса.',
  'manual.title': 'Поиск по руководству',
  'manual.query': 'Запрос',
  'manual.search': 'Найти в РЭ/РК',
  'manual.searching': 'Ищем…',
  'manual.hintNoVehicle': 'Выберите машину — поиск только по её двигателю.',
  'manual.hintEngine': 'Поиск только по руководствам для',
  'manual.refusalTitle': 'Недостаточно данных в руководствах',
  'manual.openSource': 'Открыть источник',
  'manual.queryPlaceholder': 'Например: момент затяжки болтов',
  'chief.loading': 'Загрузка аналитики…',
  'chief.queueTitle': 'Очередь внимания',
  'chief.queueHint': 'Сначала машины, которые нужно разобрать в первую очередь.',
  'chief.quarantineCardHint': 'Рекомендация до решения специалиста или подтверждённая заявка',
  'chief.analyticsTitle': 'Аналитика проверок',
  'chief.warningsTitle': 'Ранние предупреждения',
  'chief.filtersTitle': 'Фильтры и список',
  'chief.stat.status': 'По статусу',
  'chief.stat.engine': 'По двигателю (сессии)',
  'chief.stat.anomaly': 'Типы отклонений',
  'fleet.searchLabel': 'Поиск по парку',
  'fleet.searchPlaceholder': 'Например B418HK98 или ЯМЗ-536',
  'error.unknown': 'Неизвестная ошибка',
  'error.fleet': 'Не удалось загрузить автопарк',
  'error.chatOpen': 'Не удалось открыть чат',
  'error.agent': 'Ошибка агента',
  'error.source': 'Не удалось открыть источник',
  'error.dashboard': 'Ошибка сводки',
  'error.tickets': 'Ошибка загрузки',
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