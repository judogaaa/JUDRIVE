import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { fetchDiagnosis, fetchVehicleDiagnosisHistory } from '../api/client'
import type { TrendPoint } from '../api/fleet'
import type { DiagnoseResponse, SessionSummary, VehicleSummary } from '../api/types'
import { AgentChat } from '../components/AgentChat'
import { SessionChooser } from '../components/SessionChooser'
import { VehicleHistoryPanel } from '../components/VehicleHistoryPanel'
import { VehiclePicker } from '../components/VehiclePicker'
import { VerdictCard } from '../components/VerdictCard'
import { useI18n } from '../i18n/I18nContext'
import { formatSessionDateTime } from '../lib/formatLocale'
import { latestSessionId } from '../lib/vehicle'
import type { ChatIntent, ManualSearchIntent } from '../lib/workflow'
import {
  buildExplainDiagnosisMessage,
  buildPrepareTicketMessage,
  buildWhatToCheckMessage,
  manualQueryFromDiagnosis,
  usableStatus,
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
  const [copyHint, setCopyHint] = useState(false)
  const [result, setResult] = useState<DiagnoseResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [trendError, setTrendError] = useState<string | null>(null)
  const [sessionChooserOpen, setSessionChooserOpen] = useState(false)
  const requestGen = useRef(0)
  const tRef = useRef(t)
  tRef.current = t

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId) ?? null,
    [vehicleId, vehicles],
  )
  const sessions = selectedVehicle?.sessions ?? []
  const contextKey = `${vehicleId}:${sessionId}`
  // Guard the render itself: an effect-based reset still leaves one paint with old state.
  const activeResult =
    result && result.vehicle_id === vehicleId && result.session_id === sessionId ? result : null

  const resetVerdict = useCallback(() => {
    requestGen.current += 1
    setResult(null)
    setError(null)
    setLoading(false)
  }, [])

  // A different vehicle/session must never show the previous verdict, chart or error.
  useEffect(() => {
    resetVerdict()
    setSessionChooserOpen(false)
  }, [contextKey, resetVerdict])

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
          setTrendError(err instanceof Error ? err.message : tRef.current('error.unknown'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [vehicleId])

  // Keep the pair valid if the fleet data arrives after the initial render.
  useEffect(() => {
    if (!selectedVehicle) return
    if (selectedVehicle.sessions.some((session) => session.session_id === sessionId)) return
    const latest = latestSessionId(selectedVehicle)
    if (latest) onSessionChange(latest)
  }, [onSessionChange, selectedVehicle, sessionId])

  const onVehicleSelect = (nextId: string) => {
    onVehicleChange(nextId)
    const vehicle = vehicles.find((row) => row.vehicle_id === nextId)
    if (vehicle) {
      const latest = latestSessionId(vehicle)
      if (latest) onSessionChange(latest)
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
      setError(err instanceof Error ? err.message : tRef.current('error.unknown'))
    } finally {
      if (gen === requestGen.current) setLoading(false)
    }
  }, [sessionId, vehicleId])

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
      setCopyHint(true)
      window.setTimeout(() => setCopyHint(false), 2200)
    } catch {
      /* clipboard blocked */
    }
  }, [activeResult, t])

  const verdictActions = useMemo(() => {
    if (!activeResult) return null
    const effective = usableStatus(activeResult)
    return {
      onExplain: () =>
        onChatIntent({
          id: Date.now(),
          vehicleId,
          sessionId,
          message: buildExplainDiagnosisMessage(activeResult),
          autoSend: true,
        }),
      onWhatToCheck: () =>
        onChatIntent({
          id: Date.now(),
          vehicleId,
          sessionId,
          message: buildWhatToCheckMessage(activeResult),
          autoSend: true,
        }),
      onSearchManual:
        effective === 'check_failed'
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
        effective === 'anomaly'
          ? () =>
              onChatIntent({
                id: Date.now(),
                vehicleId,
                sessionId,
                message: buildPrepareTicketMessage(activeResult),
                autoSend: true,
              })
          : undefined,
      onCopyPlan: () => void copyVerdictPlan(),
      onOtherSession: () => setSessionChooserOpen(true),
      onRetry: () => void runDiagnosis(),
    }
  }, [activeResult, copyVerdictPlan, engineModel, onChatIntent, onOpenManuals, runDiagnosis, sessionId, vehicleId])

  return (
    <div className="diag-page">
      <header className="diag-page__header">
        <div>
          <p className="eyebrow">{t('app.caption')}</p>
          <h1>{t('diag.title')}</h1>
          <p className="diag-page__lead">{t('diag.subtitle')}</p>
        </div>
        {activeSession ? (
          <div className="diag-page__context" title={t('history.title')}>
            <span>{t('history.selected')}</span>
            <strong>{activeSession.session_id}</strong>
            <span>{formatSessionDateTime(locale, activeSession.checked_at)}</span>
          </div>
        ) : null}
      </header>

      {fleetError ? (
        <p className="panel__error" role="alert">
          {fleetError}
        </p>
      ) : null}

      <section className="diag-controls" aria-label={t('diag.title')}>
        <VehiclePicker vehicles={vehicles} selectedId={vehicleId} onSelect={onVehicleSelect} />

        <label className="field diag-session-field">
          <span>{t('diag.check')}</span>
          <select
            ref={sessionRef}
            aria-label={t('diag.check')}
            value={sessionId}
            onChange={(event) => onSessionSelect(event.target.value)}
            disabled={!selectedVehicle}
          >
            {sortedSessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id}
              </option>
            ))}
          </select>
          <span className="field__hint">
            {activeSession
              ? `${activeSession.session_id} · ${formatSessionDateTime(locale, activeSession.checked_at)}`
              : t('history.subtitle')}
          </span>
        </label>

        <div className="diag-run">
          <span className="field__label" aria-hidden>
            &nbsp;
          </span>
          <button
            type="button"
            className="btn btn--primary btn--block diag-run__button"
            disabled={loading || !vehicleId || !sessionId}
            onClick={() => void runDiagnosis()}
          >
            <Play size={18} aria-hidden />
            {loading ? t('diag.running') : t('diag.run')}
          </button>
          <span className="field__hint">{loading ? '' : t('diag.runHint')}</span>
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
            {copyHint ? (
              <p className="diag-copy-hint" role="status">
                {t('common.copied')}
              </p>
            ) : null}
          </section>

          <section className="diag-history">
            <VehicleHistoryPanel
              sessions={sortedSessions}
              activeSessionId={sessionId}
              onSelectSession={onSessionSelect}
              trendPoints={trendPoints}
              trendError={trendError}
            />
          </section>

          {!activeResult && !loading && !error ? (
            <section className="diag-steps" aria-label={t('diag.workflow')}>
              <p className="diag-steps__title">{t('diag.workflow')}</p>
              <ol>
                <li>
                  <span>1</span>
                  {t('diag.step.select')}
                </li>
                <li>
                  <span>2</span>
                  {t('diag.step.run')}
                </li>
                <li>
                  <span>3</span>
                  {t('diag.step.review')}
                </li>
                <li>
                  <span>4</span>
                  {t('diag.step.act')}
                </li>
              </ol>
            </section>
          ) : null}
        </div>

        <section className="diag-chat">
          {vehicleId && sessionId ? (
            <AgentChat
              key={contextKey}
              vehicleId={vehicleId}
              sessionId={sessionId}
              diagnoseResult={activeResult}
              onDiagnoseCommand={() => void runDiagnosis()}
              chatIntent={chatIntent}
              onChatIntentConsumed={onChatIntentConsumed}
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
