import { useEffect, useRef, useState } from 'react'
import { fetchVehicles } from './api/client'
import type { VehicleSummary } from './api/types'
import { WorkspaceShell, type AppView } from './components/shell/WorkspaceShell'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n/I18nContext'
import type { ChatIntent, ManualIntent } from './lib/workflow'
import { ChiefMechanicView } from './views/ChiefMechanicView'
import { DiagnosisView } from './views/DiagnosisView'
import { FleetView } from './views/FleetView'
import { ManualsView } from './views/ManualsView'
import { TicketsView } from './views/TicketsView'

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
  const [manualIntent, setManualIntent] = useState<ManualIntent | null>(null)
  const [chatIntent, setChatIntent] = useState<ChatIntent | null>(null)
  const sequence = useRef(0)
  const currentEngine = vehicles.find((v) => v.vehicle_id === vehicleId)?.engine_model ?? null

  const openManuals = (query: string) => {
    if (!currentEngine) return
    setManualIntent({ id: ++sequence.current, engine: currentEngine, query })
    setView('manuals')
  }

  const askInChat = (text: string) => {
    if (!vehicleId || !sessionId) return
    setChatIntent({ id: ++sequence.current, vehicleId, sessionId, text })
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
  }, [])

  const openDiagnosisForVehicle = (id: string, sessionOverride?: string) => {
    setVehicleId(id)
    const vehicle = vehicles.find((v) => v.vehicle_id === id)
    setSessionId(sessionOverride ?? (vehicle ? latestSessionId(vehicle) : ''))
    setView('diagnosis')
  }

  return (
    <WorkspaceShell view={view} onViewChange={(next) => { setManualIntent(null); setView(next) }} themeMode={themeMode} onThemeChange={setThemeMode}>
      <div hidden={view !== 'diagnosis'}>
        <DiagnosisView
          key={JSON.stringify([vehicleId, sessionId])}
          vehicles={vehicles}
          fleetError={fleetError}
          vehicleId={vehicleId}
          sessionId={sessionId}
          onVehicleChange={setVehicleId}
          onSessionChange={setSessionId}
          onOpenManuals={openManuals}
          onAskInChat={askInChat}
          chatIntent={chatIntent}
          onIntentHandled={(id) => setChatIntent((prev) => prev?.id === id ? null : prev)}
        />
      </div>
      {view === 'manuals' ? (
        <ManualsView key={manualIntent?.id ?? 'library'} engineModel={currentEngine} intent={manualIntent} onAskInChat={askInChat} onBack={() => setView('diagnosis')} />
      ) : null}
      {view === 'chief' ? <ChiefMechanicView onOpenDiagnosis={openDiagnosisForVehicle} /> : null}
      {view === 'fleet' ? (
        <FleetView vehicles={vehicles} fleetError={fleetError} onOpenDiagnosis={openDiagnosisForVehicle} />
      ) : null}
      {view === 'tickets' ? <TicketsView onOpenDiagnosis={openDiagnosisForVehicle} /> : null}
    </WorkspaceShell>
  )
}