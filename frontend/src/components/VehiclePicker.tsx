import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, Truck, X } from 'lucide-react'
import type { VehicleSummary } from '../api/types'
import { useI18n } from '../i18n/I18nContext'
import { displayVehicleModel, matchesVehicle } from '../lib/vehicle'

interface VehiclePickerProps {
  vehicles: VehicleSummary[]
  selectedId: string
  onSelect: (vehicleId: string) => void
}

export function VehiclePicker({ vehicles, selectedId, onSelect }: VehiclePickerProps) {
  const { t } = useI18n()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const selected = vehicles.find((vehicle) => vehicle.vehicle_id === selectedId) ?? null
  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return vehicles
    return vehicles.filter((vehicle) => matchesVehicle(vehicle, q))
  }, [query, vehicles])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  const updateQuery = (value: string) => {
    setQuery(value)
    const matching = vehicles.filter((vehicle) => matchesVehicle(vehicle, value))
    setActive(Math.max(0, matching.findIndex((vehicle) => vehicle.vehicle_id === selectedId)))
  }

  const openPicker = () => {
    updateQuery('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open || !filtered[active]) return
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [active, filtered, listId, open])

  const choose = (vehicle: VehicleSummary) => {
    onSelect(vehicle.vehicle_id)
    setQuery('')
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || !filtered.length && event.key !== 'Escape') return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, filtered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActive(Math.max(filtered.length - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const target = filtered[active]
      if (target) choose(target)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div className="vehicle-picker" ref={rootRef}>
      <span className="field__label">{t('diag.vehicle')}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={!vehicles.length}
        className={open ? 'vehicle-picker__trigger vehicle-picker__trigger--open' : 'vehicle-picker__trigger'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => open ? setOpen(false) : openPicker()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openPicker()
          }
        }}
      >
        <span className="vehicle-picker__trigger-icon" aria-hidden>
          <Truck size={18} />
        </span>
        <span className="vehicle-picker__trigger-text">
          {selected ? (
            <>
              <strong>{selected.vehicle_id}</strong>
              <span>{displayVehicleModel(selected.make, selected.model)}</span>
            </>
          ) : (
            <span>{t('diag.filterPlaceholder')}</span>
          )}
        </span>
        <ChevronDown size={18} className="vehicle-picker__chevron" aria-hidden />
      </button>

      {open ? (
        <div className="vehicle-picker__popover">
          <div className="vehicle-picker__search">
            <Search size={17} aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-label={t('diag.search')}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              value={query}
              placeholder={t('diag.vehicleSearchPlaceholder')}
              onChange={(event) => updateQuery(event.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            {query ? (
              <button
                type="button"
                className="vehicle-picker__clear"
                aria-label={t('diag.clearSearch')}
                title={t('diag.clearSearch')}
                onClick={() => {
                  updateQuery('')
                  inputRef.current?.focus()
                }}
              >
                <X size={16} aria-hidden />
              </button>
            ) : null}
          </div>

          <div className="vehicle-picker__meta">
            <span>{t('fleet.count', { shown: filtered.length, total: vehicles.length })}</span>
            <span>{t('diag.vehicleSearchHint')}</span>
          </div>

          <ul className="vehicle-picker__list" id={listId} role="listbox" aria-label={t('diag.vehicle')}>
            {filtered.length === 0 ? (
              <li className="vehicle-picker__empty">{t('fleet.empty', { query: query.trim() })}</li>
            ) : (
              filtered.map((vehicle, index) => {
                const isSelected = vehicle.vehicle_id === selectedId
                return (
                  <li key={vehicle.vehicle_id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-${index}`}
                      aria-selected={isSelected}
                      className={
                        index === active
                          ? 'vehicle-option vehicle-option--active'
                          : isSelected
                            ? 'vehicle-option vehicle-option--selected'
                            : 'vehicle-option'
                      }
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(vehicle)}
                    >
                      <span className="vehicle-option__plate">{vehicle.vehicle_id}</span>
                      <span className="vehicle-option__garage">{vehicle.garage_no}</span>
                      <span className="vehicle-option__model">{displayVehicleModel(vehicle.make, vehicle.model)}</span>
                      <span className="vehicle-option__engine">{vehicle.engine_model}</span>
                      <span className="vehicle-option__check" aria-hidden>
                        {isSelected ? <Check size={16} /> : null}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}

      {selected ? (
        <div className="vehicle-summary" aria-live="polite">
          <span className="vehicle-summary__item">
            <span>{t('diag.vehiclePassport')}</span>
            {displayVehicleModel(selected.make, selected.model)}
          </span>
          <span className="vehicle-summary__item">
            <span>{t('diag.garage')}</span>
            {selected.garage_no}
          </span>
          <span className="vehicle-summary__item">
            <span>{t('diag.engine')}</span>
            {selected.engine_model}
          </span>
          <span className="vehicle-summary__item">
            <span>{t('fleet.col.sessions')}</span>
            {selected.sessions.length}
          </span>
        </div>
      ) : null}
    </div>
  )
}
