import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { Onboarding } from './components/Onboarding'
import { useOnboarding } from './hooks/useOnboarding'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n/I18nContext'
import { HelpView } from './views/HelpView'
import { ChiefLogin, ChiefMechanicView } from './views/ChiefMechanicView'
import { DiagnosisView } from './views/DiagnosisView'
import { FleetView } from './views/FleetView'
import { ManualsView } from './views/ManualsView'
import { TicketsView } from './views/TicketsView'
import type { ChatIntent, ManualSearchIntent } from './lib/workflow'
import { latestSessionId } from './lib/vehicle'
import { resolveErrorMessage } from './lib/i18nError'

type VehicleTarget = { vehicleId: string; sessionId: string; engineModel: string }

export default function App() {
  const { t } = useI18n()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const onboarding = useOnboarding()
  const helpDestination = useRef<string | null>(null)
  const [view, setView] = useState<AppView>('diagnosis')
  const [visited, setVisited] = useState<AppView[]>(['diagnosis'])
  const [diagnosisOrigin, setDiagnosisOrigin] = useState<AppView | null>(null)
  const [manualOrigin, setManualOrigin] = useState<AppView | null>(null)
  const [manualEngine, setManualEngine] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState<VehicleTarget | null>(null)
  const [manualRevision, setManualRevision] = useState(0)
  const scrollPositions = useRef<Partial<Record<AppView, number>>>({})
  const navigate = (next: AppView) => {
    if (next === view) return
    scrollPositions.current[view] = window.scrollY
    setVisited((current) => current.includes(next) ? current : [...current, next])
    setView(next)
  }
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  useEffect(() => {
    const request = new AbortController()
    const checkSession = () => fetch('/api/auth/session', { signal: request.signal, cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => { if (!request.signal.aborted) setAuthenticated(body.authenticated === true) })
      .catch(() => { if (!request.signal.aborted) setAuthenticated(false) })
    void checkSession()
    window.addEventListener('judrive-auth-change', checkSession)
    window.addEventListener('focus', checkSession)
    return () => {
      window.removeEventListener('judrive-auth-change', checkSession)
      window.removeEventListener('focus', checkSession)
      request.abort()
    }
  }, [view])
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [fleetRevision, setFleetRevision] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [manualIntent, setManualIntent] = useState<ManualSearchIntent | null>(null)
  const [chatIntent, setChatIntent] = useState<ChatIntent | null>(null)
  const [linkedTicket, setLinkedTicket] = useState<string | undefined>(undefined)
  const [ticketsVehicleFilter, setTicketsVehicleFilter] = useState<string | undefined>(undefined)
  const consumeLinkedTicket = useCallback(() => setLinkedTicket(undefined), [])
  const consumeTicketFilter = useCallback(() => setTicketsVehicleFilter(undefined), [])
  const sequence = useRef(0)
  const selectionRef = useRef({ vehicleId: '', sessionId: '' })
  useEffect(() => { selectionRef.current = { vehicleId, sessionId } }, [vehicleId, sessionId])
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])

  const currentEngine = vehicles.find((v) => v.vehicle_id === vehicleId)?.engine_model ?? null
  const currentTarget = currentEngine && vehicleId && sessionId ? { vehicleId, sessionId, engineModel: currentEngine } : null
  const manualChatTarget = manualTarget ?? currentTarget

  useEffect(() => {
    window.scrollTo({ top: scrollPositions.current[view] ?? 0, behavior: 'auto' })
  }, [view])

  useEffect(() => {
    const target = helpDestination.current
    helpDestination.current = null
    if (target) document.getElementById(target)?.focus()
  }, [view])

  const openManuals = (intent: Omit<ManualSearchIntent, 'id'> | string, target = currentTarget) => {
    const engine = typeof intent === 'string' ? currentEngine : intent.engineModel
    const query = typeof intent === 'string' ? intent : intent.query
    if (!engine) return
    setManualOrigin(view)
    setManualEngine(engine)
    setManualTarget(target)
    setManualRevision((value) => value + 1)
    setManualIntent(query.trim() ? {
      id: ++sequence.current,
      engineModel: engine,
      query,
      autoOpenSingle: typeof intent !== 'string' ? intent.autoOpenSingle : false,
    } : null)
    navigate('manuals')
  }

  const askInChat = (message: string, evidenceId: string, evidenceLabel: string, target: VehicleTarget) => {
    const vid = target.vehicleId
    const sid = target.sessionId
    if (!vid || !sid || !message.trim()) return
    setVehicleId(vid)
    setSessionId(sid)
    setChatIntent({
      id: ++sequence.current,
      vehicleId: vid,
      sessionId: sid,
      message,
      autoSend: false,
      evidenceId,
      evidenceLabel,
    })
    setDiagnosisOrigin(view)
    helpDestination.current = 'diagnosis-chat'
    navigate('diagnosis')
  }

  useEffect(() => {
    if (authenticated !== true) {
      // oxlint-disable-next-line react/set-state-in-effect -- Clear protected fleet state as soon as authentication changes.
      setVehicles([])
      setVehicleId('')
      setSessionId('')
      setFleetError(null)
      return
    }
    let cancelled = false
    fetchVehicles()
      .then((list) => {
        if (cancelled) return
        setVehicles(list)
        setFleetError(null)
        // Initial selection only. Changing language must not reset the mechanic's context.
        if (!selectionRef.current.vehicleId && list.length > 0) {
          const first = list[0]
          setVehicleId(first.vehicle_id)
          setSessionId(latestSessionId(first))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFleetError(resolveErrorMessage(tRef.current, err, 'error.fleet'))
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, fleetRevision])

  const retryFleet = () => {
    setFleetError(null)
    setFleetRevision((value) => value + 1)
  }

  const openDiagnosisForVehicle = (id: string, sessionOverride?: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.vehicle_id === id)
    setSessionId(sessionOverride ?? (vehicle ? latestSessionId(vehicle) : ''))
    setDiagnosisOrigin(view)
    navigate('diagnosis')
  }

  const openTicketsForVehicle = (id: string, ticketId?: string) => {
    setLinkedTicket(ticketId)
    setTicketsVehicleFilter(id)
    navigate('tickets')
  }

  return (
    <>
      <WorkspaceShell modalOpen={onboarding.open} view={view} onViewChange={navigate} themeMode={themeMode} onThemeChange={setThemeMode}>
        {authenticated === false && ['diagnosis', 'fleet', 'manuals', 'tickets'].includes(view) && (
          <details className="panel" open={view !== 'diagnosis'}>
            <summary>{t('auth.submit')}</summary>
            <ChiefLogin onSuccess={() => setAuthenticated(true)} />
          </details>
        )}
        <div hidden={view !== 'diagnosis'}>
          {diagnosisOrigin && diagnosisOrigin !== 'diagnosis' && (
            <button type="button" className="btn btn--secondary context-return" onClick={() => navigate(diagnosisOrigin)}>
              ← {t(`nav.${diagnosisOrigin}`)}
            </button>
          )}
          <DiagnosisView
            vehicles={vehicles}
            documentsAuthorized={authenticated === true}
            fleetError={fleetError}
            onRetryFleet={retryFleet}
            vehicleId={vehicleId}
            sessionId={sessionId}
            onVehicleChange={setVehicleId}
            onSessionChange={setSessionId}
            onOpenManuals={(intent) => openManuals(intent)}
            onChatIntent={(intent) => {
              setVehicleId(intent.vehicleId)
              setSessionId(intent.sessionId)
              setChatIntent(intent)
            }}
            chatIntent={chatIntent}
            onChatIntentConsumed={() => setChatIntent(null)}
            onOpenTicket={(ticketId) => openTicketsForVehicle(vehicleId, ticketId)}
          />
        </div>
        {view === 'help' ? (
          <HelpView
            onNavigate={(target, topic) => {
              const destinations: Record<string, string> = {
                chat: 'diagnosis-chat', voice: 'diagnosis-chat', history: 'diagnosis-history',
              }
              helpDestination.current = destinations[topic] ?? null
              navigate(target)
            }}
            onRestartOnboarding={onboarding.start}
            themeMode={themeMode}
            onThemeChange={setThemeMode}
          />
        ) : null}
        {authenticated && visited.includes('manuals') ? (
          <div hidden={view !== 'manuals'}>
            <ManualsView
              key={manualRevision}
              engineModel={manualEngine ?? currentEngine}
              isVisible={view === 'manuals'}
              chatEngineModel={manualChatTarget?.engineModel ?? null}
              vehicleContext={manualChatTarget ?? undefined}
              chatTargetLabel={manualChatTarget ? `${manualChatTarget.vehicleId} · ${manualChatTarget.sessionId}` : undefined}
              searchIntent={manualIntent}
              onSearchIntentConsumed={() => setManualIntent(null)}
              onAskInChat={(text, engine, evidenceId, evidenceLabel) => {
                if (manualChatTarget && engine === manualChatTarget.engineModel) askInChat(text, evidenceId, evidenceLabel, manualChatTarget)
              }}
              onBack={manualOrigin ? () => navigate(manualOrigin) : undefined}
              backLabel={manualOrigin ? t(`nav.${manualOrigin}`) : undefined}
            />
          </div>
        ) : null}
        {visited.includes('chief') ? (
          <div hidden={view !== 'chief'}>
            <ChiefMechanicView
              onOpenDiagnosis={openDiagnosisForVehicle}
              onOpenTickets={openTicketsForVehicle}
            />
          </div>
        ) : null}
        {visited.includes('fleet') ? (
          <div hidden={view !== 'fleet'}>
            <FleetView
              vehicles={vehicles}
              fleetError={fleetError}
              onRetryFleet={retryFleet}
              onOpenManuals={(vehicle) => openManuals({ engineModel: vehicle.engine_model, query: '' }, {
                vehicleId: vehicle.vehicle_id, sessionId: latestSessionId(vehicle), engineModel: vehicle.engine_model,
              })}
              onOpenDiagnosis={openDiagnosisForVehicle}
              onOpenTickets={openTicketsForVehicle}
            />
          </div>
        ) : null}
        {authenticated && visited.includes('tickets') ? (
          <div hidden={view !== 'tickets'}>
            <TicketsView
              isVisible={view === 'tickets'}
              engineForVehicle={(id) => vehicles.find((vehicle) => vehicle.vehicle_id === id)?.engine_model ?? ''}
              filterVehicleId={ticketsVehicleFilter}
              linkedTicketId={linkedTicket}
              onLinkedTicketConsumed={consumeLinkedTicket}
              onFilterConsumed={consumeTicketFilter}
              onOpenDiagnosis={openDiagnosisForVehicle}
            />
          </div>
        ) : null}
      </WorkspaceShell>
      <Onboarding
        open={onboarding.open}
        step={onboarding.state.step}
        acknowledged={onboarding.state.acknowledged}
        onNext={onboarding.next}
        onBack={onboarding.back}
        onAcknowledge={onboarding.setAcknowledged}
        onStart={() => {
          if (onboarding.state.step !== onboarding.lastStep || !onboarding.state.acknowledged) return
          onboarding.complete()
        }}
      />
    </>
  )
}