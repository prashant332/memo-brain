import { useState, useEffect, useRef, useCallback } from 'react'

export const VoiceState = {
  IDLE:      'idle',
  LISTENING: 'listening',
  ERROR:     'error',
}

export function useVoiceInput({ onResult, onInterim, onError } = {}) {
  const SpeechRecognition =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null
  const isSupported = Boolean(SpeechRecognition)

  const [voiceState, setVoiceState] = useState(VoiceState.IDLE)
  const recognitionRef = useRef(null)

  // Callback refs to avoid recreating the recognition instance on every render
  const onResultRef  = useRef(onResult)
  const onInterimRef = useRef(onInterim)
  const onErrorRef   = useRef(onError)
  useEffect(() => { onResultRef.current  = onResult  }, [onResult])
  useEffect(() => { onInterimRef.current = onInterim }, [onInterim])
  useEffect(() => { onErrorRef.current   = onError   }, [onError])

  useEffect(() => {
    if (!isSupported) return
    const recognition = new SpeechRecognition()
    recognition.lang            = document.documentElement.lang || 'en-US'
    recognition.interimResults  = true
    recognition.maxAlternatives = 1
    recognition.continuous      = false

    recognition.onstart = () => setVoiceState(VoiceState.LISTENING)

    recognition.onresult = (event) => {
      let interim = '', final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final   += event.results[i][0].transcript
        else                          interim += event.results[i][0].transcript
      }
      if (interim) onInterimRef.current?.(interim)
      if (final)   onResultRef.current?.(final.trim())
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        setVoiceState(VoiceState.IDLE)
        return
      }
      const messages = {
        'not-allowed':         'Microphone access denied. Please allow it in your browser settings.',
        'audio-capture':       'No microphone found. Please connect a microphone.',
        'network':             'Network error during speech recognition. Please try again.',
        'service-not-allowed': 'Speech recognition not allowed. Check browser settings.',
      }
      setVoiceState(VoiceState.ERROR)
      onErrorRef.current?.(messages[event.error] ?? `Speech error: ${event.error}`)
      setTimeout(() => setVoiceState(VoiceState.IDLE), 4000)
    }

    recognition.onend = () => {
      setVoiceState((prev) => prev === VoiceState.ERROR ? prev : VoiceState.IDLE)
    }

    recognitionRef.current = recognition
    return () => { try { recognition.abort() } catch {} }
  }, [isSupported])

  const startListening = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return
    if (voiceState === VoiceState.LISTENING) return
    try { recognitionRef.current.start() } catch (e) { console.warn(e) }
  }, [isSupported, voiceState])

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop() } catch (e) { console.warn(e) }
  }, [])

  const toggle = useCallback(() => {
    voiceState === VoiceState.LISTENING ? stopListening() : startListening()
  }, [voiceState, startListening, stopListening])

  return { isSupported, voiceState, startListening, stopListening, toggle }
}
