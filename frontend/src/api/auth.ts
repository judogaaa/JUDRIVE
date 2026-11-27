export type SessionRole = 'chief' | 'demo'

export function readRole(body: { role?: unknown }): SessionRole | null {
  return body.role === 'chief' || body.role === 'demo' ? body.role : null
}
