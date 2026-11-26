export function vehicleModelLabel(make: string, model: string | null | undefined): string {
  const brand = make.trim()
  const name = (model ?? '').trim()
  if (!name || name === brand || name.toLowerCase().startsWith(brand.toLowerCase())) {
    return name || brand
  }
  return `${brand} ${name}`
}
