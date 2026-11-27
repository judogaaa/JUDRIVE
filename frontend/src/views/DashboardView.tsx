import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Bus, ClipboardList, MessageSquare } from 'lucide-react'
import { fetchFleetDashboard } from '../api/fleet'
import { fetchTickets, type TicketSubmission } from '../api/tickets'
import type { VehicleSummary } from '../api/types'
import type { AppView } from '../components/shell/WorkspaceShell'
import { useI18n } from '../i18n/I18nContext'

interface DashboardProps {
  vehicles: VehicleSummary[]
  chief: boolean
  fleetLoaded: boolean
  fleetError: string | null
  onRetry: () => void
  onNavigate: (view: AppView) => void
  onOpenDiagnosis: (vehicleId: string, sessionId: string) => void
  onOpenTicket: (vehicleId: string, ticketId: string) => void
  onOpenChat: () => void
}

export function DashboardView({ vehicles, chief, fleetLoaded, fleetError, onRetry, onNavigate, onOpenDiagnosis, onOpenTicket, onOpenChat }: DashboardProps) {
  const { t, locale } = useI18n()
  const [warnings, setWarnings] = useState<number | null>(null)
  const [tickets, setTickets] = useState<TicketSubmission[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!chief) return
    let active = true
    void Promise.allSettled([fetchFleetDashboard(), fetchTickets()]).then(([fleet, journal]) => {
      if (!active) return
      setWarnings(fleet.status === 'fulfilled' ? fleet.value.early_warnings_fleet.length : null)
      setTickets(journal.status === 'fulfilled' ? journal.value : null)
      setFailed(fleet.status === 'rejected' || journal.status === 'rejected')
    })
    return () => { active = false }
  }, [chief, revision])

  const stats = [
    { label: t('nav.fleet'), value: vehicles.length, icon: Bus, target: 'fleet' },
    { label: t('dashboard.checks'), value: vehicles.reduce((sum, vehicle) => sum + vehicle.sessions.length, 0), icon: Activity, target: 'diagnosis' },
    { label: t('verdict.normal.title'), value: vehicles.filter((vehicle) => vehicle.latest_status === 'normal' && vehicle.latest_signal_quality !== 'warning').length, icon: Activity, target: 'fleet' },
    { label: t('chief.cat.attention'), value: vehicles.filter((vehicle) => vehicle.latest_status === 'anomaly' || vehicle.latest_status === 'check_failed' || vehicle.latest_signal_quality === 'warning').length, icon: AlertTriangle, target: 'fleet' },
    ...(chief ? [{ label: t('chief.warningsTitle'), value: warnings, icon: AlertTriangle, target: 'chief' as const }] : []),
  ] as const
  const recent = vehicles.flatMap((vehicle) => {
    const session = vehicle.sessions.find((item) => item.session_id === vehicle.latest_session_id)
    return session ? [{ vehicle, session }] : []
  }).sort((a, b) => b.session.checked_at.localeCompare(a.session.checked_at)).slice(0, 5)
  const publishedTickets = tickets?.flatMap((item) => item.ticket_id ? [{ ...item, ticket_id: item.ticket_id }] : []).slice(0, 5)

  return (
    <div className="workspace-dashboard">
      <header className="page-header">
        <h1>{t('nav.dashboard')}</h1>
        <p>{chief ? t('chief.subtitle') : t('dashboard.demoNote')}</p>
        <div className="workspace-dashboard__actions">
          <button type="button" className="btn btn--primary" onClick={() => onNavigate('diagnosis')}>
            <Activity size={18} aria-hidden />{t('action.backDiagnosis')}
          </button>
          {chief && <button type="button" className="btn btn--secondary" onClick={onOpenChat}>
            <MessageSquare size={18} aria-hidden />{t('chat.title')}
          </button>}
        </div>
      </header>
      {fleetError || failed ? (
        <p className="panel__error" role="alert">
          {fleetError ?? t('error.dashboard')}{' '}
          <button type="button" className="btn btn--secondary" onClick={() => { onRetry(); setRevision((value) => value + 1) }}>
            {t('history.retry')}
          </button>
        </p>
      ) : null}
      <section className="workspace-dashboard__stats" aria-label={t('nav.dashboard')}>
        {stats.map(({ label, value, icon: Icon, target }) => (
          <button type="button" key={label} className="summary-card" onClick={() => onNavigate(target)}>
            <Icon size={20} aria-hidden />
            <strong className="summary-card__value">{value === null || (!fleetLoaded || fleetError) && target !== 'chief' ? '—' : value}</strong>
            <span>{label}</span>
          </button>
        ))}
      </section>
      <div className="workspace-dashboard__details">
        <section className="panel">
          <h2>{t('dashboard.recentChecks')}</h2>
          {recent.length ? <ul>{recent.map(({ vehicle, session }) => (
            <li key={vehicle.vehicle_id}>
              <button type="button" className="queue-row" onClick={() => onOpenDiagnosis(vehicle.vehicle_id, session.session_id)}>
                <strong>{vehicle.vehicle_id}</strong>
                <span>{new Date(session.checked_at).toLocaleDateString(locale)}</span>
                <span>{t(vehicle.latest_status === 'anomaly' ? 'verdict.anomaly.title' :
                  vehicle.latest_status === 'check_failed' ? 'verdict.failed.title' :
                    vehicle.latest_status === 'normal' ? 'verdict.normal.title' : 'dashboard.emptyChecks')}</span>
              </button>
            </li>
          ))}</ul> : <p>{t(fleetError ? 'error.fleet' : fleetLoaded ? 'dashboard.emptyChecks' : 'chief.loading')}</p>}
        </section>
        {chief && (
          <section className="panel">
            <h2><ClipboardList size={18} aria-hidden />{t('tickets.title')}</h2>
            {publishedTickets?.length ? (
              <ul>{publishedTickets.map((ticket) => (
                <li key={ticket.local_id}>
                  <button type="button" className="queue-row" onClick={() => onOpenTicket(ticket.vehicle_id, ticket.ticket_id)}>
                    <strong>{ticket.ticket_id}</strong><span>{ticket.vehicle_id}</span>
                  </button>
                </li>
              ))}</ul>
            ) : <p>{t(tickets ? 'tickets.empty' : failed ? 'error.dashboard' : 'chief.loading')}</p>}
          </section>
        )}
      </div>
    </div>
  )
}
