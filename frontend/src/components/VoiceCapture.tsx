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
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [micOk, setMicOk] = useState(true)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicOk(false)
    }
    return () => {
      mountedRef.current = false
      const recorder = recorderRef.current
      recorderRef.current = null
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
    setTranscribing(true)
    try {
      const text = await transcribeAudio(blob, locale)
      if (mountedRef.current) setDraft(text)
    } catch (err: unknown) {
      if (mountedRef.current) setError(resolveErrorMessage(t, err, 'error.stt'))
    } finally {
      if (mountedRef.current) setTranscribing(false)
    }
  }

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }, [])

  const startRecording = async () => {
    setError(null)
    setDraft('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: preferMimeType() })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (!mountedRef.current) return
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void runTranscribe(blob)
      }
      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setMicOk(false)
      setError(t('voice.unavailable'))
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
            disabled={disabled || !micOk || transcribing}
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
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
          <button type="button" className="btn btn--primary" disabled={!draft.trim()} onClick={apply}>
            {t('chat.send')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function preferMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return 'audio/mp4'
}