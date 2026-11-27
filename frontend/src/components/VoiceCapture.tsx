import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { transcribeAudio } from '../api/voice'
import { useI18n } from '../i18n/I18nContext'
import { resolveErrorMessage } from '../lib/i18nError'

interface VoiceCaptureProps {
  onText: (text: string) => void
  disabled?: boolean
  compact?: boolean
}

export function VoiceCapture({ onText, disabled, compact }: VoiceCaptureProps) {
  const { locale, t } = useI18n()
  const [starting, setStarting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const micOk = typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder !== 'undefined'
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startingRef = useRef(false)
  const transcriptionRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const recorder = recorderRef.current
      recorderRef.current = null
      transcriptionRef.current?.abort()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* already stopped */
        }
      }
    }
  }, [])

  const runTranscribe = async (blob: Blob) => {
    const request = new AbortController()
    transcriptionRef.current = request
    setTranscribing(true)
    try {
      const text = await transcribeAudio(blob, locale, request.signal)
      if (!request.signal.aborted) setDraft(text)
    } catch (error: unknown) {
      if (!request.signal.aborted) setError(resolveErrorMessage(t, error, 'error.unknown'))
    } finally {
      if (!request.signal.aborted) setTranscribing(false)
    }
  }

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder?.state === 'recording') recorder.stop()
  }, [])

  const startRecording = async () => {
    if (startingRef.current || recorderRef.current) return
    startingRef.current = true
    setStarting(true)
    setError(null)
    setDraft('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const mimeType = preferMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (streamRef.current === stream) streamRef.current = null
        if (recorderRef.current === recorder) recorderRef.current = null
        if (!mountedRef.current) return
        setRecording(false)
        if (chunks.length) void runTranscribe(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
        else setError(t('error.unknown'))
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (mountedRef.current) setError(t('voice.unavailable'))
    } finally {
      startingRef.current = false
      if (mountedRef.current) setStarting(false)
    }
  }

  const apply = () => {
    if (draft.trim()) onText(draft.trim())
    setDraft('')
  }

  return (
    <div className={compact ? 'voice-box voice-box--compact' : 'voice-box'}>
      <div className="voice-actions">
        {recording ? (
          <button type="button" className="btn btn--secondary" onClick={stopRecording} disabled={transcribing}>
            <Square size={16} aria-hidden />
            {t('voice.stop')}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--secondary"
            disabled={disabled || !micOk || starting || transcribing}
            onClick={() => void startRecording()}
          >
            <Mic size={16} aria-hidden />
            {t('voice.record')}
          </button>
        )}
        {transcribing ? <span className="panel__subtitle">{t('voice.transcribing')}</span> : null}
      </div>
      {!micOk ? <p className="panel__error">{t('voice.unavailable')}</p> : null}
      {error ? <p className="panel__error">{error}</p> : null}
      {draft ? (
        <div className="voice-editor">
          <p className="panel__subtitle">{t('voice.editHint')}</p>
          <textarea aria-label={t('voice.editHint')} value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
          <button type="button" className="btn btn--primary" disabled={!draft.trim()} onClick={apply}>
            {t('chat.send')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function preferMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
    .find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}
