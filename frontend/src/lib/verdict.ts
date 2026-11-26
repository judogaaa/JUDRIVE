import type { DiagnoseResponse } from '../api/types'

export function formatMetric(value: number | null): string {
  if (value === null || value === undefined) {
    return '—'
  }
  return value.toFixed(2)
}

const SIGNAL_LABELS: Record<DiagnoseResponse['signal_quality'], string> = {
  good: 'Хорошее',
  warning: 'С помехами',
  bad: 'Непригодна',
}

export function verdictCopy(result: DiagnoseResponse) {
  if (result.status === 'normal') {
    return {
      title: 'В пределах нормы',
      lead: 'Признаков отклонения в записи не найдено по результату ML-модели.',
      footnote:
        'Норма не означает гарантию исправности двигателя. При сомнениях проведите осмотр по руководству.',
      signalQuality: SIGNAL_LABELS[result.signal_quality],
      action: '',
    }
  }

  if (result.status === 'check_failed') {
    return {
      title: 'Запись непригодна',
      lead: 'Диагностика по этой записи недоступна — повторите акустическую запись.',
      footnote: '',
      signalQuality: SIGNAL_LABELS[result.signal_quality],
      action: 'Не ставьте диагноз и не оформляйте заявку по этой сессии.',
    }
  }

  return {
    title: 'Возможное отклонение',
    lead: 'ML-сервис зафиксировал отклонение; трактуйте вывод как осторожную гипотезу, не как подтверждённый ремонт.',
    footnote:
      'Confidence — уверенность модели в классификации, а не вероятность поломки. Anomaly score не является сроком до отказа.',
    signalQuality: SIGNAL_LABELS[result.signal_quality],
    action: '',
  }
}