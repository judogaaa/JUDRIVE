import type { DiagnoseResponse } from '../api/types'

export type ManualSearchIntent = {
  id: number
  engineModel: string
  query: string
  autoOpenSingle?: boolean
}

export type ChatIntent = {
  id: number
  message: string
  autoSend?: boolean
}

export function manualQueryFromDiagnosis(result: DiagnoseResponse): string {
  if (result.status === 'anomaly') {
    const title = result.anomaly_title?.trim()
    if (title) return `проверка ${title}`
    if (result.anomaly_type) return `диагностика ${result.anomaly_type}`
    return 'порядок диагностики двигателя'
  }
  return 'общий осмотр двигателя'
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
  if (result.status === 'check_failed') return buildCheckFailedChatMessage()
  return 'По результату этой проверки: что проверить на машине в первую очередь и в каком порядке? Опирайся на руководство двигателя.'
}