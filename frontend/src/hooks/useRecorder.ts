import { useRef, useState } from 'react'

export function useRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    setIsRecording(false)
  }

  const startRecording = async () => {
    setError('')
    chunksRef.current = []

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Tu navegador no permite grabar audio.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
      const mimeType = mimeTypes.find(MediaRecorder.isTypeSupported) ?? ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      streamRef.current = stream
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.start()
      setIsRecording(true)
    } catch (recordingError) {
      cleanup()
      setError(
        recordingError instanceof Error
          ? recordingError.message
          : 'No se pudo acceder al micrófono.',
      )
    }
  }

  const stopRecording = () => new Promise<Blob>((resolve, reject) => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      reject(new Error('No hay una grabación activa.'))
      return
    }

    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      })
      cleanup()
      chunksRef.current = []
      blob.size ? resolve(blob) : reject(new Error('La grabación está vacía.'))
    }, { once: true })
    recorder.stop()
  })

  return { isRecording, error, startRecording, stopRecording }
}
