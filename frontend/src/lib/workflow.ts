import type { DiagnoseResponse } from '../api/types'

export type ManualSearchIntent = {
  id: number
  engineModel: string
  query: string
  autoOpenSingle?: boolean
}

export type DiagnosisAction = 'explain' | 'next_checks' | 'prepare_ticket'

export type ChatIntent = {
  id: number
  vehicleId: string
  sessionId: string
  message: string
  autoSend?: boolean
  action?: DiagnosisAction
  evidenceId?: string
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
