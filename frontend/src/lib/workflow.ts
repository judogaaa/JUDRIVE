import type { DiagnoseResponse } from '../api/types'

export type ManualSearchIntent = {
  id: number
  engineModel: string
  query: string
  autoOpenSingle?: boolean
}

export type ChatIntent = {
  id: number
  vehicleId: string
  sessionId: string
  message: string
  autoSend?: boolean
  /** @deprecated tickets review-only */
  analysisOnly?: boolean
}

const TOPICS: Record<string, string> = {
  F01: 'тепловые зазоры клапанного механизма',
  F02: 'давление масла система смазки',
  F03: 'перегрев система охлаждения охлаждающая жидкость',
  F04: 'ремень привода агрегатов натяжение',
  F05: 'генератор проверка',
  F06: 'сцепление проверка',
  F07: 'коробка передач проверка',
  F08: 'топливная система дизельного двигателя',
  F09: 'турбокомпрессор наддув',
  F10: 'компрессор насос гидроусилителя',
  F11: 'рециркуляция отработавших газов',
  F12: 'система зажигания',
  F13: 'система подачи топлива бензиновый двигатель',
  F14: 'цепь газораспределительного механизма натяжитель',
}

export function usableStatus(result: DiagnoseResponse): DiagnoseResponse['status'] {
  return result.signal_quality === 'bad' ? 'check_failed' : result.status
}

export function manualTopic(result: DiagnoseResponse | null | undefined): string {
  if (result && usableStatus(result) === 'anomaly') {
    return TOPICS[result.anomaly_type ?? ''] ?? 'осмотр двигателя техническое обслуживание'
  }
  return 'осмотр двигателя техническое обслуживание'
}

export function manualQueryFromDiagnosis(result: DiagnoseResponse): string {
  return manualTopic(result)
}

export function buildExplainDiagnosisMessage(result: DiagnoseResponse): string {
  const lines = [
    'Объясни результат диагностики простым языком для механика.',
    `status: ${result.status}`,
    `vehicle_id: ${result.vehicle_id}`,
    `session_id: ${result.session_id}`,
    result.engine_model ? `engine_model: ${result.engine_model}` : '',
    result.signal_quality ? `signal_quality: ${result.signal_quality}` : '',
    result.confidence != null ? `confidence: ${result.confidence}` : '',
    result.anomaly_type ? `anomaly_type: ${result.anomaly_type}` : '',
    result.anomaly_title ? `anomaly_title: ${result.anomaly_title}` : '',
    result.anomaly_score != null ? `anomaly_score: ${result.anomaly_score}` : '',
    result.description ? `description: ${result.description}` : '',
    'Не придумывай факт ремонта и не обещай срок отказа.',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildPrepareTicketMessage(result: DiagnoseResponse): string {
  return [
    'Подготовь черновик заявки по текущей диагностике.',
    'Сначала найди в руководстве подтверждённые источники (search_manuals), затем prepare_defect_ticket.',
    `vehicle_id: ${result.vehicle_id}`,
    `session_id: ${result.session_id}`,
    result.anomaly_type ? `anomaly_type: ${result.anomaly_type}` : '',
    result.anomaly_title ? `anomaly_title: ${result.anomaly_title}` : '',
    'urgency medium, если иное не следует из фактов.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildCheckFailedChatMessage(): string {
  return (
    'Запись непригодна для диагностики. ' +
    'Дай краткую инструкцию: как повторить акустическую запись и что проверить перед повторной сессией. ' +
    'Не ставь диагноз и не готовь заявку по этой проверке.'
  )
}

export function buildWhatToCheckMessage(result: DiagnoseResponse): string {
  if (usableStatus(result) === 'check_failed') return buildCheckFailedChatMessage()
  return 'По результату этой проверки: что проверить на машине в первую очередь и в каком порядке? Опирайся на руководство двигателя.'
}