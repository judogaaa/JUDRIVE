import { useEffect, useState } from 'react'
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
  }, [])

  const openDiagnosisForVehicle = (id: string, sessionOverride?: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.vehicle_id === id)
    setSessionId(sessionOverride ?? (vehicle ? latestSessionId(vehicle) : ''))
    setView('diagnosis')
  }

  const openManualsWithIntent = (intent: ManualSearchIntent) => {
    setManualIntent(intent)
    setView('manuals')
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
          onOpenManuals={openManualsWithIntent}
          onChatIntent={setChatIntent}
          chatIntent={chatIntent}
          onChatIntentConsumed={() => setChatIntent(null)}
        />
      </div>
      {view === 'manuals' ? (
        <ManualsView
          engineModel={vehicles.find((v) => v.vehicle_id === vehicleId)?.engine_model ?? null}
          searchIntent={manualIntent}
          onSearchIntentConsumed={() => setManualIntent(null)}
        />
      ) : null}
      {view === 'chief' ? <ChiefMechanicView onOpenDiagnosis={openDiagnosisForVehicle} /> : null}
      {view === 'fleet' ? (
        <FleetView vehicles={vehicles} fleetError={fleetError} onOpenDiagnosis={(id) => openDiagnosisForVehicle(id)} />
      ) : null}
      {view === 'tickets' ? (
        <TicketsView filterVehicleId={ticketsVehicleFilter} onFilterConsumed={() => setTicketsVehicleFilter(undefined)} />
      ) : null}
    </WorkspaceShell>
  )
}