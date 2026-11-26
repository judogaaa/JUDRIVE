import type { VehicleSummary } from '../api/types'

export function displayVehicleModel(make: string, model: string | null): string {
  const brand = make.trim()
  const name = model?.trim() ?? ''
  if (!name) return brand
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name
  return `${brand} ${name}`
}

/** @deprecated use displayVehicleModel */
export const vehicleModelLabel = displayVehicleModel

/**
 * Latin/Cyrillic lookalikes are folded to one common character so a plate typed
 * with the wrong keyboard layout still finds its vehicle: МАЗ = MAZ, В418НК98 = B418HK98.
 */
const LOOKALIKES: Record<string, string> = {
  а: 'a',
  в: 'b',
  с: 'c',
  е: 'e',
  н: 'h',
  к: 'k',
  м: 'm',
  о: 'o',
  р: 'p',
  т: 't',
  у: 'y',
  х: 'x',
  з: 'z',
  і: 'i',
  ї: 'i',
  є: 'e',
  ғ: 'g',
  қ: 'k',
  ң: 'n',
  ө: 'o',
  ұ: 'u',
  ү: 'u',
  һ: 'h',
  ё: 'е',
  й: 'и',
}

export function foldSearch(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((char) => LOOKALIKES[char] ?? char)
    .join('')
    .replace(/[\s\-_.·]+/g, '')
}

export function matchesVehicle(vehicle: VehicleSummary, query: string): boolean {
  const fields = [
    vehicle.vehicle_id,
    vehicle.garage_no,
    vehicle.make,
    vehicle.model ?? '',
    vehicle.engine_model,
    vehicle.vehicle_type,
  ]
  const haystack = foldSearch(fields.join(' '))
  return query
    .trim()
    .split(/\s+/)
    .every((word) => haystack.includes(foldSearch(word)))
}

export function latestSessionId(vehicle: VehicleSummary): string {
  const sessions = [...vehicle.sessions].sort((a, b) => b.checked_at.localeCompare(a.checked_at))
  return sessions[0]?.session_id ?? ''
}
