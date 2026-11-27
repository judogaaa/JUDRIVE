import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchDiagnosis, fetchVehicleDiagnosisHistory } from '../api/client'
import type { TrendPoint } from '../api/fleet'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { RelatedManuals } from '../components/RelatedManuals'
import { AgentChat } from '../components/AgentChat'
import { SessionChooser } from '../components/SessionChooser'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VehiclePicker } from '../components/VehiclePicker'
import { VerdictCard } from '../components/VerdictCard'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { resolveErrorMessage } from '../lib/i18nError'
import { latestSessionId } from '../lib/vehicle'
import type { ChatIntent, ManualSearchIntent } from '../lib/workflow'
import {
  manualQueryFromDiagnosis,
  usableStatus,
} from '../lib/workflow'

interface DiagnosisViewProps {
  documentsAuthorized: boolean
  vehicles: VehicleSummary[]
  fleetError: string | null
  onRetryFleet?: () => void
  onOpenTicket?: (ticketId: string) => void
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
  documentsAuthorized,
  vehicles,
  fleetError,
  onRetryFleet,
  onOpenTicket,
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
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<{ vehicleId: string; points: TrendPoint[] }>({
    vehicleId: '',
    points: [],
  })
  const [trendError, setTrendError] = useState<string | null>(null)
  const [sessionChooserOpen, setSessionChooserOpen] = useState(false)
  const requestGen = useRef(0)
  const trendGen = useRef(0)
  const inFlightRef = useRef<AbortController | null>(null)
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )
  const sessions = selectedVehicle?.sessions ?? []
  const contextKey = `${vehicleId}:${sessionId}`
  const trendPoints = trendData.vehicleId === vehicleId ? trendData.points : []
  // Guard the render itself: an effect-based reset still leaves one paint with old state.
  const activeResult =
    result && result.vehicle_id === vehicleId && result.session_id === sessionId ? result : null

  const resetVerdict = useCallback(() => {
    requestGen.current += 1
    inFlightRef.current?.abort()
    inFlightRef.current = null
    setResult(null)
    setCopyMessage(null)
    setError(null)
    setLoading(false)
  }, [])

  // A different vehicle/session must never show the previous verdict, chart or error.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Cancel the previous request and reset the old verdict on external navigation.
    resetVerdict()
    setSessionChooserOpen(false)
  }, [contextKey, resetVerdict])

  useEffect(() => {
    const generation = ++trendGen.current
    // oxlint-disable-next-line react/set-state-in-effect -- Clear the previous request state before fetching for another vehicle.
    setTrendError(null)
    // Hide the previous vehicle's chart immediately, even before the new request settles.
    setTrendData({ vehicleId: '', points: [] })
    if (!vehicleId) return
    const controller = new AbortController()
    fetchVehicleDiagnosisHistory(vehicleId, controller.signal)
      .then((points) => {
        if (generation !== trendGen.current || controller.signal.aborted) return
        setTrendData({ vehicleId, points })
      })
      .catch((err: unknown) => {
        if (generation !== trendGen.current || controller.signal.aborted) return
        setTrendData({ vehicleId, points: [] })
        setTrendError(resolveErrorMessage(tRef.current, err, 'error.unknown'))
      })
    return () => {
      controller.abort()
    }
  }, [vehicleId])

  useEffect(() => {
    if (!copyMessage) return
    const timer = window.setTimeout(() => setCopyMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [copyMessage])

  // Keep the pair valid if the fleet data arrives after the initial render.
  useEffect(() => {
    if (!selectedVehicle) return
    if (selectedVehicle.sessions.some((session) => session.session_id === sessionId)) return
    const latest = latestSessionId(selectedVehicle)
    if (latest !== sessionId) onSessionChange(latest)
  }, [onSessionChange, selectedVehicle, sessionId])

  const onVehicleSelect = (nextId: string) => {
    onVehicleChange(nextId)
    const vehicle = vehicles.find((row) => row.vehicle_id === nextId)
    onSessionChange(vehicle ? latestSessionId(vehicle) : '')
    resetVerdict()
  }

  const onSessionSelect = (nextSession: string) => {
    onSessionChange(nextSession)
    resetVerdict()
  }

  const runDiagnosis = useCallback(async () => {
    if (!selectedVehicle?.sessions.some((session) => session.session_id === sessionId)) return
    if (inFlightRef.current) return
    const controller = new AbortController()
    inFlightRef.current = controller
    const gen = ++requestGen.current
    const pair = `${vehicleId}:${sessionId}`
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchDiagnosis(vehicleId, sessionId, controller.signal)
      if (gen !== requestGen.current) return
      if (`${response.vehicle_id}:${response.session_id}` !== pair) {
        setError(tRef.current('error.unknown'))
        return
      }
      setResult(response)
    } catch (err: unknown) {
      if (gen !== requestGen.current) return
      setError(resolveErrorMessage(tRef.current, err, 'error.unknown'))
    } finally {
      if (gen === requestGen.current) {
        inFlightRef.current = null
        setLoading(false)
      }
    }
  }, [selectedVehicle, sessionId, vehicleId])

  const sortedSessions: SessionSummary[] = [...sessions].sort((a, b) =>
    b.checked_at.localeCompare(a.checked_at),
  )
  const activeSession = sortedSessions.find((session) => session.session_id === sessionId) ?? null
  const engineModel = selectedVehicle?.engine_model ?? activeResult?.engine_model ?? null

  const copyVerdictPlan = useCallback(async () => {
    if (!activeResult) return
    const effective = usableStatus(activeResult)
    const stepKeys =
      effective === 'normal'
        ? ['verdict.steps.normal.1', 'verdict.steps.normal.2']
        : effective === 'anomaly'
          ? ['verdict.steps.anomaly.1', 'verdict.steps.anomaly.2', 'verdict.steps.anomaly.3']
          : ['verdict.steps.failed.1', 'verdict.steps.failed.2']
    const body = [
      t(
        effective === 'normal'
          ? 'verdict.normal.title'
          : effective === 'anomaly'
            ? 'verdict.anomaly.title'
            : 'verdict.failed.title',
      ),
      `${activeResult.vehicle_id} · ${activeResult.session_id}`,
      activeResult.engine_model ? `${t('verdict.engine')}: ${activeResult.engine_model}` : '',
      effective === 'check_failed' && activeResult.description
        ? `${t('verdict.failed.reason')}: ${activeResult.description}`
        : '',
      effective === 'anomaly' && activeResult.anomaly_title
        ? `${t('verdict.type')}: ${activeResult.anomaly_type} — ${activeResult.anomaly_title}`
        : '',
      ...stepKeys.map((key) => t(key as 'verdict.steps.normal.1')),
    ]
      .filter(Boolean)
      .join('\n')
    try {
      await navigator.clipboard.writeText(body)
      setCopyMessage(t('common.copied'))
    } catch {
      setCopyMessage(t('error.unknown'))
    }
  }, [activeResult, t])

  const verdictActions = useMemo(() => {
    if (!activeResult) return null
    const effective = usableStatus(activeResult)
    return {
      onExplain: !documentsAuthorized ? undefined : () =>
        onChatIntent({
          id: Date.now(),
          vehicleId,
          sessionId,
          message: t('verdict.action.explain'),
          action: 'explain',
          autoSend: true,
        }),
      onWhatToCheck: !documentsAuthorized ? undefined : () =>
        onChatIntent({
          id: Date.now(),
          vehicleId,
          sessionId,
          message: t(effective === 'check_failed' ? 'action.askFailed' : 'action.askPlan'),
          action: 'next_checks',
          autoSend: true,
        }),
      onSearchManual:
        !documentsAuthorized || effective === 'check_failed'
          ? undefined
          : () => {
              if (!engineModel) return
              onOpenManuals({
                id: Date.now(),
                engineModel,
                query: manualQueryFromDiagnosis(activeResult),
                autoOpenSingle: true,
              })
            },
      onPrepareTicket:
        documentsAuthorized && effective === 'anomaly' && (activeResult.confidence ?? 0) >= 0.50
          ? () =>
              onChatIntent({
                id: Date.now(),
                vehicleId,
                sessionId,
                message: t('chat.suggest3'),
                action: 'prepare_ticket',
                autoSend: true,
              })
          : undefined,
      onCopyPlan: () => void copyVerdictPlan(),
      onOtherSession: sortedSessions.length > 1 ? () => setSessionChooserOpen(true) : undefined,
    }
  }, [activeResult, copyVerdictPlan, documentsAuthorized, engineModel, onChatIntent, onOpenManuals, sessionId, sortedSessions.length, t, vehicleId])

  return (
    <div className="diag-page">
      <header className="diag-page__header">
        <div>
          <h1>{t('diag.title')}</h1>
          <p className="diag-page__lead">{t('diag.subtitle')}</p>
        </div>
      </header>

      {fleetError ? (
        <div className="panel__error" role="alert">
          <span>{fleetError}</span>
          {onRetryFleet ? (
            <button type="button" className="btn btn--secondary" onClick={onRetryFleet}>
              {t('history.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="diag-controls" aria-label={t('diag.title')}>
        <VehiclePicker vehicles={vehicles} selectedId={vehicleId} onSelect={onVehicleSelect} />

        <label className="field diag-session-field">
          <span>{t('diag.check')}</span>
          <select
            aria-label={t('diag.check')}
            value={sessionId}
            onChange={(event) => onSessionSelect(event.target.value)}
            disabled={!sortedSessions.length}
          >
            {sortedSessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id} · {formatSessionDateTime(locale, session.checked_at)}
              </option>
            ))}
          </select>
        </label>

        <div className="diag-run">
          <button
            type="button"
            className="btn btn--primary btn--block diag-run__button"
            disabled={loading || !activeSession}
            aria-busy={loading}
            onClick={() => void runDiagnosis()}
          >
            <Play size={18} aria-hidden />
            {loading ? t('diag.running') : t('diag.run')}
          </button>
        </div>
      </section>

      <div className="diag-main">
        <div className="diag-primary">
          <section className="diag-result" aria-live="polite">
            <VerdictCard
              result={activeResult}
              loading={loading}
              error={error}
              vehicleId={vehicleId}
              actions={verdictActions}
              onRetry={() => void runDiagnosis()}
            />
            {copyMessage ? (
              <p className="diag-copy-hint" role="status">
                {copyMessage}
              </p>
            ) : null}
          </section>

          {documentsAuthorized && activeResult && usableStatus(activeResult) === 'anomaly' && engineModel ? (
            <RelatedManuals key={contextKey} vehicleId={vehicleId} sessionId={sessionId} engineModel={engineModel} query={manualQueryFromDiagnosis(activeResult)} />
          ) : null}
          <section className="diag-history" id="diagnosis-history" tabIndex={-1}>
            <VehicleHistoryPanel
              sessions={sortedSessions}
              activeSessionId={sessionId}
              onSelectSession={onSessionSelect}
              trendPoints={trendPoints}
              trendError={trendError}
            />
          </section>
        </div>

        <section className="diag-chat" id="diagnosis-chat" tabIndex={-1}>
          {activeSession && documentsAuthorized ? (
            <AgentChat
              engineModel={engineModel ?? ''}
              key={contextKey}
              vehicleId={vehicleId}
              sessionId={sessionId}
              diagnoseResult={activeResult}
              onDiagnoseCommand={() => void runDiagnosis()}
              chatIntent={chatIntent}
              onChatIntentConsumed={onChatIntentConsumed}
              onOpenTicket={onOpenTicket}
              onOpenHistory={() => document.getElementById('diagnosis-history')?.focus()}
              onChooseSession={sortedSessions.length > 1 ? () => setSessionChooserOpen(true) : undefined}
              onOpenManuals={(query) => {
                if (!engineModel) return
                onOpenManuals({
                  id: Date.now(),
                  engineModel,
                  query,
                  autoOpenSingle: false,
                })
              }}
            />
          ) : (
            <div className="panel empty-state">
              <p className="empty-state__title">{t('diag.selectPrompt')}</p>
            </div>
          )}
        </section>
      </div>

      <SessionChooser
        open={sessionChooserOpen}
        sessions={sortedSessions}
        activeSessionId={sessionId}
        onSelect={onSessionSelect}
        onClose={() => setSessionChooserOpen(false)}
      />
    </div>
  )
}
