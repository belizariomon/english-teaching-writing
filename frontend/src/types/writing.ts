export type ChatMessage = {
  id: number
  author: 'tutor' | 'student'
  text: string
  audioBase64?: string
}

export type TutorLanguage = 'en' | 'it'

export type Correction = {
  original: string
  corrected: string
  explanation: string
  category: 'Grammar' | 'Vocabulary' | 'Style'
}

export type WritingFeedback = {
  reply: string
  corrections: Correction[]
  encouragement: string
  studentAudioBase64: string
  tutorAudioBase64: string
}
