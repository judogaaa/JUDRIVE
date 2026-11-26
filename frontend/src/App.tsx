import { useEffect, useState } from 'react'
import { fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { useTheme } from './hooks/useTheme'
import { DiagnosisView } from './views/DiagnosisView'
import { FleetView } from './views/FleetView'
import { TicketsView } from './views/TicketsView'

export default function App() {
  const { mode: themeMode, cycle: onThemeCycle } = useTheme()
  const [view, setView] = useState<AppView>('diagnosis')
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([])
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState('')
  const [sessionId, setSessionId] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchVehicles()
      .then((list) => {
        if (cancelled) return
        setVehicles(list)
        if (list.length > 0) {
          setVehicleId(list[0].vehicle_id)
          setSessionId(list[0].sessions[0]?.session_id ?? '')
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setFleetError(err instanceof Error ? err.message : 'Не удалось загрузить автопарк')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openDiagnosisForVehicle = (id: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.vehicle_id === id)
    setSessionId(vehicle?.sessions[0]?.session_id ?? '')
    setView('diagnosis')
  }

  return (
    <WorkspaceShell view={view} onViewChange={setView} themeMode={themeMode} onThemeCycle={onThemeCycle}>
      {view === 'diagnosis' ? (
        <DiagnosisView
          vehicles={vehicles}
          fleetError={fleetError}
          vehicleId={vehicleId}
          sessionId={sessionId}
          onVehicleChange={setVehicleId}
          onSessionChange={setSessionId}
        />
      ) : null}
      {view === 'fleet' ? (
        <FleetView vehicles={vehicles} fleetError={fleetError} onOpenDiagnosis={openDiagnosisForVehicle} />
      ) : null}
      {view === 'tickets' ? <TicketsView /> : null}
    </WorkspaceShell>
  )
}