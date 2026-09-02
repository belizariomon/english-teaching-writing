import { Router } from 'express'
import multer from 'multer'
import {
  getWritingFeedback,
  transcribeAudio,
  type TutorLanguage,
} from '../services/writing-tutor.js'

type IncomingMessage = {
  author: 'tutor' | 'student'
  text: string
}

export const writingRouter = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

function readLanguage(value: unknown): TutorLanguage | null {
  return value === 'en' || value === 'it' ? value : null
}

writingRouter.post('/writing', async (request, response) => {
  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
    return
  }

  const message = typeof request.body?.message === 'string'
    ? request.body.message.trim()
    : ''
  const history = Array.isArray(request.body?.history)
    ? request.body.history as IncomingMessage[]
    : []
  const language = readLanguage(request.body?.language)

  if (!language) {
    response.status(400).json({ error: 'A supported language is required' })
    return
  }

  if (!message) {
    response.status(400).json({ error: 'A message is required' })
    return
  }

  if (message.length > 4000) {
    response.status(400).json({ error: 'The message is too long' })
    return
  }

  try {
    const result = await getWritingFeedback(message, history, language)
    response.json(result)
  } catch (error) {
    console.error('[writing]', error)
    response.status(502).json({
      error: error instanceof Error ? error.message : 'OpenAI request failed',
    })
  }
})

writingRouter.post(
  '/writing/transcribe',
  upload.single('audio'),
  async (request, response) => {
    if (!process.env.OPENAI_API_KEY) {
      response.status(500).json({ error: 'OPENAI_API_KEY is not configured' })
      return
    }

    if (!request.file) {
      response.status(400).json({ error: 'An audio clip is required' })
      return
    }

    const language = readLanguage(request.body?.language)
    if (!language) {
      response.status(400).json({ error: 'A supported language is required' })
      return
    }

    try {
      const transcript = await transcribeAudio(
        request.file.buffer,
        request.file.mimetype,
        language,
      )
      response.json({ transcript })
    } catch (error) {
      console.error('[writing/transcribe]', error)
      response.status(502).json({
        error: error instanceof Error ? error.message : 'Transcription failed',
      })
    }
  },
)
