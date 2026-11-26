import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchDiagnosis, fetchVehicleDiagnosisHistory } from '../api/client'
import type { TrendPoint } from '../api/fleet'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VerdictCard } from '../components/VerdictCard'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { vehicleModelLabel } from '../lib/vehicleLabel'
import type { ChatIntent, ManualSearchIntent } from '../lib/workflow'
import {
  buildExplainDiagnosisMessage,
  buildPrepareTicketMessage,
  buildWhatToCheckMessage,
  manualQueryFromDiagnosis,
} from '../lib/workflow'

interface DiagnosisViewProps {
  vehicles: VehicleSummary[]
  fleetError: string | null
  vehicleId: string
  sessionId: string
  onVehicleChange: (id: string) => void
  onSessionChange: (id: string) => void
  onOpenManuals: (intent: ManualSearchIntent) => void
  onChatIntent: (intent: ChatIntent) => void
  chatIntent: ChatIntent | null
  onChatIntentConsumed: () => void
}

export function DiagnosisView({
  vehicles,
  fleetError,
  vehicleId,
  sessionId,
  onVehicleChange,
  onSessionChange,
  onOpenManuals,
  onChatIntent,
  chatIntent,
  onChatIntentConsumed,
}: DiagnosisViewProps) {
  const { t, locale } = useI18n()
  const sessionRef = useRef<HTMLSelectElement | null>(null)
  const [vehicleQuery, setVehicleQuery] = useState('')
  const [copyHint, setCopyHint] = useState(false)
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [trendError, setTrendError] = useState<string | null>(null)

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )

  const sessions = selectedVehicle?.sessions ?? []

  const vehicleOptions = useMemo(() => {
    const q = vehicleQuery.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter((v) => {
      const hay = [v.vehicle_id, v.garage_no, v.make, v.model ?? '', v.engine_model].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [vehicleQuery, vehicles])

  const requestGen = useMemo(() => ({ current: 0 }), [])

  const resetVerdict = useCallback(() => {
    requestGen.current += 1
    setResult(null)
    setError(null)
    setLoading(false)
  }, [requestGen])

  useEffect(() => {
    if (!vehicleId) {
      setTrendPoints([])
      setTrendError(null)
      return
    }
    let cancelled = false
    setTrendError(null)
    fetchVehicleDiagnosisHistory(vehicleId)
      .then((points) => {
        if (!cancelled) setTrendPoints(points)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTrendPoints([])
          setTrendError(err instanceof Error ? err.message : t('error.unknown'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId, t])

  const onVehicleSelect = (nextId: string) => {
    onVehicleChange(nextId)
    const vehicle = vehicles.find((v) => v.vehicle_id === nextId)
    if (vehicle) {
      const latest = [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))[0]
      if (latest) onSessionChange(latest.session_id)
    }
    resetVerdict()
  }

  const onSessionSelect = (nextSession: string) => {
    onSessionChange(nextSession)
    resetVerdict()
  }

  const runDiagnosis = useCallback(async () => {
    if (!vehicleId || !sessionId) return
    const gen = ++requestGen.current
    const pair = `${vehicleId}:${sessionId}`
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchDiagnosis(vehicleId, sessionId)
      if (gen !== requestGen.current) return
      if (`${response.vehicle_id}:${response.session_id}` !== pair) return
      setResult(response)
    } catch (err: unknown) {
      if (gen !== requestGen.current) return
      setError(err instanceof Error ? err.message : t('error.unknown'))
    } finally {
      if (gen === requestGen.current) setLoading(false)
    }
  }, [requestGen, sessionId, t, vehicleId])

  const sortedSessions: SessionSummary[] = [...sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))

  const modelLabel = selectedVehicle ? vehicleModelLabel(selectedVehicle.make, selectedVehicle.model) : ''
  const plateValue = selectedVehicle ? `${selectedVehicle.vehicle_id} · ${modelLabel}` : ''
  const activeSession = sortedSessions.find((session) => session.session_id === sessionId) ?? null
  const engineModel = selectedVehicle?.engine_model ?? result?.engine_model ?? null

  const copyVerdictPlan = useCallback(async () => {
    if (!result) return
    const stepKeys =
      result.status === 'normal'
        ? ['verdict.steps.normal.1', 'verdict.steps.normal.2']
        : result.status === 'anomaly'
          ? ['verdict.steps.anomaly.1', 'verdict.steps.anomaly.2', 'verdict.steps.anomaly.3']
          : ['verdict.steps.failed.1', 'verdict.steps.failed.2']
    const body = [
      t(
        result.status === 'normal'
          ? 'verdict.normal.title'
          : result.status === 'anomaly'
            ? 'verdict.anomaly.title'
            : 'verdict.failed.title',
      ),
      result.vehicle_id,
      result.session_id,
      result.engine_model ? `${t('verdict.engine')}: ${result.engine_model}` : '',
      result.anomaly_title ? `${result.anomaly_type}: ${result.anomaly_title}` : '',
      ...stepKeys.map((key) => t(key as 'verdict.steps.normal.1')),
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(body)
      setCopyHint(true)
      window.setTimeout(() => setCopyHint(false), 2200)
    } catch {
      /* clipboard blocked */
    }
  }, [result, t])

  const verdictActions = useMemo(() => {
    if (!result) return null
    return {
      onExplain: () =>
        onChatIntent({ id: Date.now(), message: buildExplainDiagnosisMessage(result), autoSend: true }),
      onWhatToCheck: () =>
        onChatIntent({ id: Date.now(), message: buildWhatToCheckMessage(result), autoSend: true }),
      onSearchManual: () => {
        if (!engineModel) return
        onOpenManuals({
          id: Date.now(),
          engineModel,
          query: manualQueryFromDiagnosis(result),
          autoOpenSingle: true,
        })
      },
      onPrepareTicket:
        result.status === 'anomaly' && result.signal_quality !== 'bad'
          ? () => onChatIntent({ id: Date.now(), message: buildPrepareTicketMessage(result), autoSend: true })
          : undefined,
      onCopyPlan: () => void copyVerdictPlan(),
      onOtherSession:
        result.status === 'check_failed'
          ? () => {
              sessionRef.current?.focus()
              sessionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          : undefined,
    }
  }, [copyVerdictPlan, engineModel, onChatIntent, onOpenManuals, result])

  return (
    <div className="diag-page">
      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : (
        <div className="diag-split">
          <section className="diag-col" aria-label={t('diag.title')}>
            <div className="field vehicle-combo">
              <span>{t('diag.vehicle')}</span>
              <input
                value={vehicleQuery || plateValue}
                onChange={(e) => setVehicleQuery(e.target.value)}
                onFocus={() => {
                  if (!vehicleQuery && plateValue) setVehicleQuery('')
                }}
                placeholder={t('diag.filterPlaceholder')}
                aria-label={t('diag.search')}
                role="combobox"
                aria-expanded={vehicleQuery.trim().length > 0}
              />
              {vehicleQuery.trim() ? (
                <ul className="vehicle-combo__list" role="listbox">
                  {vehicleOptions.slice(0, 8).map((v) => (
                    <li key={v.vehicle_id}>
                      <button
                        type="button"
                        onClick={() => {
                          onVehicleSelect(v.vehicle_id)
                          setVehicleQuery('')
                        }}
                      >
                        {v.vehicle_id} · {v.garage_no} · {vehicleModelLabel(v.make, v.model)} · {v.engine_model}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {selectedVehicle ? (
                <p className="diag-toolbar__hint">
                  {modelLabel} · {t('diag.garage')} {selectedVehicle.garage_no} · {selectedVehicle.engine_model}
                </p>
              ) : null}
            </div>
            <label className="field">
              <span>{t('diag.check')}</span>
              <select ref={sessionRef} value={sessionId} onChange={(e) => onSessionSelect(e.target.value)}>
                {sortedSessions.map((s) => (
                  <option key={s.session_id} value={s.session_id}>
                    {s.session_id} · {formatSessionDateTime(locale, s.checked_at)}
                  </option>
                ))}
              </select>
              {activeSession ? (
                <p className="session-indicator">
                  <span className="session-indicator__mark">{t('history.selected')}</span>
                  {activeSession.session_id} · {formatSessionDateTime(locale, activeSession.checked_at)}
                </p>
              ) : null}
            </label>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={loading || !vehicleId || !sessionId}
              onClick={() => void runDiagnosis()}
            >
              <Play size={18} aria-hidden />
              {loading ? t('diag.running') : t('diag.run')}
            </button>
            <VerdictCard
              result={result}
              loading={loading}
              error={error}
              vehicleId={vehicleId}
              actions={verdictActions}
            />
            {copyHint ? <p className="panel__subtitle diag-copy-hint">{t('common.copied')}</p> : null}
            <VehicleHistoryPanel
              sessions={sortedSessions}
              activeSessionId={sessionId}
              onSelectSession={onSessionSelect}
              trendPoints={trendPoints}
              trendError={trendError}
            />
          </section>
          <section className="diag-col diag-col--chat">
            {vehicleId && sessionId ? (
              <AgentChat
                vehicleId={vehicleId}
                sessionId={sessionId}
                diagnoseResult={result}
                onDiagnoseCommand={() => void runDiagnosis()}
                chatIntent={chatIntent}
                onChatIntentConsumed={onChatIntentConsumed}
              />
            ) : null}
          </section>
        </div>
      )}
    </div>
  )
}
