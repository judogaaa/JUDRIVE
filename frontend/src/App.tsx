import { useEffect, useRef, useState } from 'react'
import { fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n/I18nContext'
import { ChiefMechanicView } from './views/ChiefMechanicView'
import { DiagnosisView } from './views/DiagnosisView'
import { FleetView } from './views/FleetView'
import { ManualsView } from './views/ManualsView'
import { TicketsView } from './views/TicketsView'
import type { ChatIntent, ManualSearchIntent } from './lib/workflow'

function latestSessionId(vehicle: VehicleSummary): string {
  const sessions = [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))
  return sessions[0]?.session_id ?? ''
}

export default function App() {
  const { t } = useI18n()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [view, setView] = useState<AppView>('diagnosis')
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [manualIntent, setManualIntent] = useState<ManualSearchIntent | null>(null)
  const [chatIntent, setChatIntent] = useState<ChatIntent | null>(null)
  const [ticketsVehicleFilter, setTicketsVehicleFilter] = useState<string | undefined>(undefined)
  const sequence = useRef(0)

  const currentEngine = vehicles.find((v) => v.vehicle_id === vehicleId)?.engine_model ?? null

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
        if (list.length > 0) {
          const first = list[0]
          setVehicleId(first.vehicle_id)
          setSessionId(latestSessionId(first))
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFleetError(err instanceof Error ? err.message : t('error.fleet'))
      })
    return () => {
      cancelled = true
    }
  }, [t])

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
    <WorkspaceShell view={view} onViewChange={setView} themeMode={themeMode} onThemeChange={setThemeMode}>
      <div hidden={view !== 'diagnosis'}>
        <DiagnosisView
          vehicles={vehicles}
          fleetError={fleetError}
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
  )
}