import { useEffect, useRef, useState } from 'react'
import { fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { Onboarding } from './components/Onboarding'
import { useOnboarding } from './hooks/useOnboarding'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n/I18nContext'
import { HelpView } from './views/HelpView'
import { ChiefMechanicView } from './views/ChiefMechanicView'
import { DiagnosisView } from './views/DiagnosisView'
import { FleetView } from './views/FleetView'
import { ManualsView } from './views/ManualsView'
import { TicketsView } from './views/TicketsView'
import type { ChatIntent, ManualSearchIntent } from './lib/workflow'
import { latestSessionId } from './lib/vehicle'
import { resolveErrorMessage } from './lib/i18nError'

export default function App() {
  const { t } = useI18n()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const onboarding = useOnboarding()
  const [view, setView] = useState<AppView>('diagnosis')
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [fleetRevision, setFleetRevision] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [manualIntent, setManualIntent] = useState<ManualSearchIntent | null>(null)
  const [chatIntent, setChatIntent] = useState<ChatIntent | null>(null)
  const [ticketsVehicleFilter, setTicketsVehicleFilter] = useState<string | undefined>(undefined)
  const sequence = useRef(0)
  const selectionRef = useRef({ vehicleId: '', sessionId: '' })
  selectionRef.current = { vehicleId, sessionId }
  const tRef = useRef(t)
  tRef.current = t

  const currentEngine = vehicles.find((v) => v.vehicle_id === vehicleId)?.engine_model ?? null

  useEffect(() => {
    // Keep the new section anchored at its title; diagnosis context lives in state.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [view])

  const openManuals = (intent: Omit<ManualSearchIntent, 'id'> | string) => {
    const engine = typeof intent === 'string' ? currentEngine : intent.engineModel
    const query = typeof intent === 'string' ? intent : intent.query
    if (!engine || !query.trim()) return
    setManualIntent({
      id: ++sequence.current,
      engineModel: engine,
      query,
      autoOpenSingle: typeof intent !== 'string' ? intent.autoOpenSingle : false,
    })
    setView('manuals')
  }

  const askInChat = (message: string, autoSend = true, target?: { vehicleId: string; sessionId: string }) => {
    const vid = target?.vehicleId ?? vehicleId
    const sid = target?.sessionId ?? sessionId
    if (!vid || !sid || !message.trim()) return
    setVehicleId(vid)
    setSessionId(sid)
    setChatIntent({
      id: ++sequence.current,
      vehicleId: vid,
      sessionId: sid,
      message,
      autoSend,
    })
    setView('diagnosis')
  }

  useEffect(() => {
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
  }, [fleetRevision])

  const retryFleet = () => {
    setFleetError(null)
    setFleetRevision((value) => value + 1)
  }

  const openDiagnosisForVehicle = (id: string, sessionOverride?: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.vehicle_id === id)
    setSessionId(sessionOverride ?? (vehicle ? latestSessionId(vehicle) : ''))
    setView('diagnosis')
  }

  const openTicketsForVehicle = (id: string) => {
    setTicketsVehicleFilter(id)
    setView('tickets')
  }

  return (
    <>
      <WorkspaceShell modalOpen={onboarding.open} view={view} onViewChange={setView} themeMode={themeMode} onThemeChange={setThemeMode}>
        <div hidden={view !== 'diagnosis'}>
          <DiagnosisView
            vehicles={vehicles}
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
          />
        </div>
        {view === 'help' ? (
          <HelpView
            onNavigate={setView}
            onRestartOnboarding={onboarding.start}
            themeMode={themeMode}
            onThemeChange={setThemeMode}
          />
        ) : null}
        {view === 'manuals' ? (
          <ManualsView
            engineModel={currentEngine}
            searchIntent={manualIntent}
            onSearchIntentConsumed={() => setManualIntent(null)}
            onAskInChat={(text) => askInChat(text, false)}
            onBack={() => setView('diagnosis')}
          />
        ) : null}
        {view === 'chief' ? (
          <ChiefMechanicView
            onOpenDiagnosis={openDiagnosisForVehicle}
            onOpenTickets={openTicketsForVehicle}
          />
        ) : null}
        {view === 'fleet' ? (
          <FleetView
            vehicles={vehicles}
            fleetError={fleetError}
            onRetryFleet={retryFleet}
            onOpenDiagnosis={openDiagnosisForVehicle}
            onOpenTickets={openTicketsForVehicle}
          />
        ) : null}
        {view === 'tickets' ? (
          <TicketsView
            filterVehicleId={ticketsVehicleFilter}
            onFilterConsumed={() => setTicketsVehicleFilter(undefined)}
            onOpenDiagnosis={openDiagnosisForVehicle}
          />
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
          setView('diagnosis')
        }}
      />
    </>
  )
}