import { useCallback, useEffect, useState } from 'react'
import { ONBOARDING_STEPS } from '../help/content'

const STORAGE_KEY = 'judrive-onboarding'
const VERSION = 1
const LAST_STEP = ONBOARDING_STEPS.length - 1

type OnboardingState = {
  version: number
  status: 'in_progress' | 'completed' | 'dismissed'
  step: number
  acknowledged: boolean
}

const INITIAL: OnboardingState = { version: VERSION, status: 'in_progress', step: 0, acknowledged: false }

function readState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    if (parsed.version !== VERSION) return INITIAL
    if (parsed.status === 'dismissed') return { ...INITIAL, status: 'dismissed' }
    // Previously skipped or corrupt completion is not an acknowledgement.
    if (parsed.status === 'completed' && parsed.step === LAST_STEP && parsed.acknowledged === true) {
      return { ...INITIAL, status: 'completed', step: LAST_STEP, acknowledged: true }
    }
    if (parsed.status !== 'in_progress') return INITIAL
    const step = typeof parsed.step === 'number' && Number.isInteger(parsed.step)
      ? Math.max(0, Math.min(LAST_STEP, parsed.step)) : 0
    return { ...INITIAL, step, acknowledged: step === LAST_STEP && parsed.acknowledged === true }
  } catch {
    return INITIAL
  }
}

// A successful explicit login starts a new introduction. Reloading an
// existing session still restores its current step or completion.
export function resetOnboardingForLogin() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* in-memory fallback */ }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(readState)
  const open = state.status === 'in_progress'

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* in-memory fallback */ }
  }, [state])

  const start = useCallback(() => setState({ ...INITIAL }), [])
  const next = useCallback(() => setState((current) => ({ ...current, step: Math.min(LAST_STEP, current.step + 1), acknowledged: false })), [])
  const back = useCallback(() => setState((current) => ({ ...current, step: Math.max(0, current.step - 1), acknowledged: false })), [])
  const setAcknowledged = useCallback((acknowledged: boolean) => setState((current) => ({ ...current, acknowledged: current.step === LAST_STEP && acknowledged })), [])
  // All exit paths share one guarded state transition, including keyboard close.
  const complete = useCallback(() => setState((current) => current.step === LAST_STEP && current.acknowledged
    ? { ...current, status: 'completed' } : current), [])

  const skip = useCallback(() => setState({ ...INITIAL, status: 'dismissed' }), [])

  return { open, state, skip, lastStep: LAST_STEP, start, next, back, setAcknowledged, complete }
}
