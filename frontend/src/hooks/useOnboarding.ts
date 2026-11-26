import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'judrive-onboarding'
const VERSION = 1
const LAST_STEP = 6

export type OnboardingStatus = 'in_progress' | 'completed' | 'skipped'

export type OnboardingState = {
  version: number
  status: OnboardingStatus
  step: number
  acknowledged: boolean
}

const INITIAL: OnboardingState = {
  version: VERSION,
  status: 'in_progress',
  step: 0,
  acknowledged: false,
}

function readState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return INITIAL
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    if (parsed.version !== VERSION) return INITIAL
    const status: OnboardingStatus =
      parsed.status === 'completed' || parsed.status === 'skipped' ? parsed.status : 'in_progress'
    const step = Math.max(0, Math.min(LAST_STEP, Number(parsed.step) || 0))
    return {
      version: VERSION,
      status,
      step,
      acknowledged: Boolean(parsed.acknowledged),
    }
  } catch {
    return INITIAL
  }
}

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(readState)
  const [open, setOpen] = useState(() => {
    const initial = readState()
    return initial.status === 'in_progress'
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* storage unavailable — onboarding still works in memory */
    }
  }, [state])

  const start = useCallback(() => {
    setState({ version: VERSION, status: 'in_progress', step: 0, acknowledged: false })
    setOpen(true)
  }, [])

  const next = useCallback(() => {
    setState((current) => ({ ...current, status: 'in_progress', step: Math.min(LAST_STEP, current.step + 1) }))
  }, [])

  const back = useCallback(() => {
    setState((current) => ({ ...current, status: 'in_progress', step: Math.max(0, current.step - 1) }))
  }, [])

  const setStep = useCallback((step: number) => {
    setState((current) => ({
      ...current,
      status: 'in_progress',
      step: Math.max(0, Math.min(LAST_STEP, step)),
    }))
  }, [])

  const setAcknowledged = useCallback((acknowledged: boolean) => {
    setState((current) => ({ ...current, acknowledged }))
  }, [])

  const skip = useCallback(() => {
    setState((current) => ({ ...current, status: 'skipped' }))
    setOpen(false)
  }, [])

  const close = useCallback(() => {
    // Closing without skipping keeps the current step and resumes on next visit.
    setOpen(false)
  }, [])

  const complete = useCallback(() => {
    setState((current) => ({ ...current, status: 'completed', step: LAST_STEP, acknowledged: true }))
    setOpen(false)
  }, [])

  return {
    open,
    state,
    lastStep: LAST_STEP,
    start,
    next,
    back,
    setStep,
    setAcknowledged,
    skip,
    close,
    complete,
  }
}
