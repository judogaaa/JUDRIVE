import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiResponseError, fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { Onboarding } from './components/Onboarding'
import { resetOnboardingForLogin, useOnboarding } from './hooks/useOnboarding'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n/I18nContext'
import { HelpView } from './views/HelpView'
import { DashboardView } from './views/DashboardView'
import { readRole, type SessionRole } from './api/auth'
import { LoginView } from './views/LoginView'
import { ChiefMechanicView } from './views/ChiefMechanicView'
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
  const [role, setRole] = useState<SessionRole | null | undefined>(undefined)
  // The invitation fragment is never sent to the web server as part of a URL.
  const [juryToken, setJuryToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('jury'))
  useEffect(() => {
    const clearFragment = () => window.history.replaceState(null, '', window.location.pathname + window.location.search)
    if (juryToken && window.location.hash.startsWith('#jury=')) clearFragment()
    const receiveInvitation = () => {
      const token = new URLSearchParams(window.location.hash.slice(1)).get('jury')
      if (token) {
        setJuryToken(token)
        clearFragment()
      }
    }
    window.addEventListener('hashchange', receiveInvitation)
    return () => window.removeEventListener('hashchange', receiveInvitation)
  }, [juryToken])
  const [logoutError, setLogoutError] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const authSequence = useRef(0)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const revision = ++authSequence.current
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10_000) })
        if (!response.ok) throw new Error()
        const session = readRole(await response.json())
        if (!cancelled && revision === authSequence.current) setRole(session)
      } catch {
        // A temporary connection problem does not terminate an existing session.
        if (!cancelled && revision === authSequence.current) setRole((current) => current ?? null)
      }
    }
    void check()
    const recheck = () => { void check() }
    window.addEventListener('focus', recheck)
    window.addEventListener('judrive-auth-change', recheck)
    return () => {
      cancelled = true
      window.removeEventListener('focus', recheck)
      window.removeEventListener('judrive-auth-change', recheck)
    }
  }, [])

  const logout = async () => {
    setLoggingOut(true)
    setLogoutError(false)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error()
      ++authSequence.current
      setRole(null)
    } catch {
      setLogoutError(true)
    } finally {
      setLoggingOut(false)
    }
  }

  if (!role || (role === 'demo' && juryToken)) {
    return <LoginView checking={role === undefined} juryToken={juryToken} themeMode={themeMode} onThemeChange={setThemeMode}
      onSuccess={(next) => { resetOnboardingForLogin(); ++authSequence.current; setRole(next) }} />
  }

  return <Workspace key={role} role={role} themeMode={themeMode} setThemeMode={setThemeMode}
    onLogout={() => void logout()} loggingOut={loggingOut} logoutError={logoutError ? t('error.network') : null} />
}

type WorkspaceProps = {
  role: SessionRole
  themeMode: ReturnType<typeof useTheme>['mode']
  setThemeMode: ReturnType<typeof useTheme>['setMode']
  onLogout: () => void
  loggingOut: boolean
  logoutError: string | null
}

function Workspace({ role, themeMode, setThemeMode, onLogout, loggingOut, logoutError }: WorkspaceProps) {
  const { t } = useI18n()
  const chief = role === 'chief'
  const onboarding = useOnboarding()
  const helpDestination = useRef<string | null>(null)
  const [view, setView] = useState<AppView>('dashboard')
  const [visited, setVisited] = useState<AppView[]>(['dashboard'])
  const [diagnosisOrigin, setDiagnosisOrigin] = useState<AppView | null>(null)
  const [manualOrigin, setManualOrigin] = useState<AppView | null>(null)
  const [manualEngine, setManualEngine] = useState<string | null>(null)
  const [manualTarget, setManualTarget] = useState<VehicleTarget | null>(null)
  const [manualRevision, setManualRevision] = useState(0)
  const scrollPositions = useRef<Partial<Record<AppView, number>>>({})
  const navigate = (next: AppView) => {
    if (next === view || !chief && (next === 'chief' || next === 'manuals' || next === 'tickets')) return
    scrollPositions.current[view] = window.scrollY
    setVisited((current) => current.includes(next) ? current : [...current, next])
    setView(next)
  }
  const [fleetLoaded, setFleetLoaded] = useState(false)
  const [fleetRestricted, setFleetRestricted] = useState(false)
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
    let cancelled = false
    fetchVehicles()
      .then((list) => {
        if (cancelled) return
        setVehicles(list)
        setFleetLoaded(true)
        setFleetRestricted(false)
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
        if (!chief && err instanceof ApiResponseError && err.status === 403) {
          // A private production fleet is intentionally unavailable to public demo sessions.
          setFleetRestricted(true)
          setFleetLoaded(false)
          setFleetError(null)
          return
        }
        setFleetRestricted(false)
        setFleetError(resolveErrorMessage(tRef.current, err, 'error.fleet'))
      })
    return () => {
      cancelled = true
    }
  }, [chief, fleetRevision])

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
      <WorkspaceShell modalOpen={onboarding.open} view={view} onViewChange={navigate} themeMode={themeMode}
        onThemeChange={setThemeMode} chief={chief} onLogout={onLogout} loggingOut={loggingOut}>
        {logoutError && <p role="alert" className="panel__error">{logoutError}</p>}
        {fleetRestricted && (view === 'dashboard' || view === 'diagnosis' || view === 'fleet') && (
          <div className="workspace-dashboard">
            <header className="page-header">
              <h1>{t(`nav.${view}`)}</h1>
              <p>{t('dashboard.demoNote')}</p>
            </header>
            <section className="panel" aria-label={t('auth.demoLabel')}>
              <h2>{t('auth.demoLabel')}</h2>
              <p>{t('dashboard.demoFleetUnavailable')}</p>
              <div className="workspace-dashboard__actions">
                <button type="button" className="btn btn--primary" onClick={onLogout} disabled={loggingOut}>
                  {t('auth.logout')}
                </button>
                <button type="button" className="btn btn--secondary" onClick={onboarding.start}>
                  {t('help.restart')}
                </button>
              </div>
            </section>
          </div>
        )}
        {!fleetRestricted && view === 'dashboard' && (
          <DashboardView vehicles={vehicles} fleetLoaded={fleetLoaded} chief={chief} fleetError={fleetError} onRetry={retryFleet}
            onNavigate={navigate} onOpenDiagnosis={openDiagnosisForVehicle}
            onOpenTicket={openTicketsForVehicle}
            onOpenChat={() => { helpDestination.current = 'diagnosis-chat'; navigate('diagnosis') }} />
        )}
        {!fleetRestricted && visited.includes('diagnosis') && <div hidden={view !== 'diagnosis'}>
          {diagnosisOrigin && diagnosisOrigin !== 'diagnosis' && (
            <button type="button" className="btn btn--secondary context-return" onClick={() => navigate(diagnosisOrigin)}>
              ← {t(`nav.${diagnosisOrigin}`)}
            </button>
          )}
          <DiagnosisView
            vehicles={vehicles}
            documentsAuthorized={chief}
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
        </div>}
        {view === 'help' ? (
          <HelpView
            chief={chief}
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
        {chief && visited.includes('manuals') ? (
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
        {chief && visited.includes('chief') ? (
          <div hidden={view !== 'chief'}>
            <ChiefMechanicView
              onOpenDiagnosis={openDiagnosisForVehicle}
              onOpenTickets={openTicketsForVehicle}
            />
          </div>
        ) : null}
        {!fleetRestricted && visited.includes('fleet') ? (
          <div hidden={view !== 'fleet'}>
            <FleetView
              vehicles={vehicles}
              fleetError={fleetError}
              onRetryFleet={retryFleet}
              onOpenManuals={chief ? (vehicle) => openManuals({ engineModel: vehicle.engine_model, query: '' }, {
                vehicleId: vehicle.vehicle_id, sessionId: latestSessionId(vehicle), engineModel: vehicle.engine_model,
              }) : undefined}
              onOpenDiagnosis={openDiagnosisForVehicle}
              onOpenTickets={chief ? openTicketsForVehicle : undefined}
            />
          </div>
        ) : null}
        {chief && visited.includes('tickets') ? (
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
        onSkip={onboarding.skip}
        onAcknowledge={onboarding.setAcknowledged}
        onStart={() => {
          if (onboarding.state.step !== onboarding.lastStep || !onboarding.state.acknowledged) return
          onboarding.complete()
        }}
      />
    </>
  )
}