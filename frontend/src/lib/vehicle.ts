import type { VehicleSummary } from '../api/types'

export function displayVehicleModel(make: string, model: string | null): string {
  const brand = make.trim()
  const name = model?.trim() ?? ''
  if (!name) return brand
  if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name
  return `${brand} ${name}`
}

// Vehicle plates are often entered using the visually equivalent keyboard alphabet.
const plateLetters: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[авекмнорстух]/g, (ch) => plateLetters[ch]).replace(/[\s-]+/g, '')
}

export function matchesVehicle(vehicle: VehicleSummary, query: string): boolean {
  const fields = [vehicle.vehicle_id, vehicle.garage_no, vehicle.make, vehicle.model ?? '', vehicle.engine_model, vehicle.vehicle_type]
  const haystack = fold(fields.join(' '))
  return query.trim().split(/\s+/).every((word) => haystack.includes(fold(word)))
}
