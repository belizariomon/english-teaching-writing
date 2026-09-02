import type { ChatMessage, TutorLanguage, WritingFeedback } from '../types/writing'

const apiUrl = import.meta.env.VITE_API_URL || ''

export async function sendWriting(
  message: string,
  history: ChatMessage[],
  language: TutorLanguage,
): Promise<WritingFeedback> {
  const response = await fetch(`${apiUrl}/api/writing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: history.map(({ author, text }) => ({ author, text })),
      language,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || 'No se pudo obtener la respuesta del tutor')
  }

  return response.json() as Promise<WritingFeedback>
}

export async function transcribeAudioClip(
  audio: Blob,
  language: TutorLanguage,
): Promise<string> {
  const formData = new FormData()
  const extension = audio.type.includes('mp4') ? 'm4a' : 'webm'
  formData.append('audio', audio, `recording.${extension}`)
  formData.append('language', language)

  const response = await fetch(`${apiUrl}/api/writing/transcribe`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error || 'No se pudo procesar el clip de audio')
  }

  const body = await response.json() as { transcript: string }
  return body.transcript
}
