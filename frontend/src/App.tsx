import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useRecorder } from './hooks/useRecorder'
import { sendWriting, transcribeAudioClip } from './services/api'
import type { ChatMessage, Correction, TutorLanguage, WritingFeedback } from './types/writing'

const copy = {
  en: {
    brand: 'English Writing Tutor', practice: 'Writing practice', language: 'Language',
    voiceOn: 'Voice on', voiceOff: 'Voice off', level: 'C1 · Advanced',
    eyebrow: "TODAY'S CONVERSATION", topic: 'A small moment from your week', newTopic: 'New topic',
    welcome: "Hi! I'm Maya, your writing tutor. Tell me about something you enjoyed this week. I'll help you express it naturally in English.",
    tutorRole: 'Maya · Writing tutor', you: 'You', reviewing: 'Reviewing your answer…',
    writeAnswer: 'Write your answer', placeholder: 'Type in English…', recording: 'Recording your clip…',
    transcribing: 'Transcribing your clip…', words: 'words · Shift + Enter for a new line',
    stopAndSend: 'Stop & send', audioClip: 'Audio clip', thinking: 'Thinking…', send: 'Send',
    liveFeedback: 'LIVE FEEDBACK', corrections: 'Your corrections', greatWriting: 'Great writing',
    ready: 'Ready when you are', emptyFeedback: 'Write a message and your grammar, vocabulary, and style suggestions will appear here.',
    goodWork: 'Nice work!', play: 'Play', playTitle: 'Play audio',
    contactError: 'The tutor could not be reached.', audioError: 'The audio clip could not be processed.',
    categories: { Grammar: 'Grammar', Vocabulary: 'Vocabulary', Style: 'Style' },
  },
  it: {
    brand: 'Tutor di scrittura italiana', practice: 'Pratica di scrittura', language: 'Lingua',
    voiceOn: 'Voce attiva', voiceOff: 'Voce disattivata', level: 'C1 · Avanzato',
    eyebrow: 'CONVERSAZIONE DI OGGI', topic: 'Un piccolo momento della tua settimana', newTopic: 'Nuovo argomento',
    welcome: 'Ciao! Sono Maya, la tua tutor di scrittura. Raccontami qualcosa che ti è piaciuto questa settimana. Ti aiuterò a esprimerlo in modo naturale in italiano.',
    tutorRole: 'Maya · Tutor di scrittura', you: 'Tu', reviewing: 'Sto rivedendo la tua risposta…',
    writeAnswer: 'Scrivi la tua risposta', placeholder: 'Scrivi in italiano…', recording: 'Registrazione in corso…',
    transcribing: 'Trascrizione in corso…', words: 'parole · Maiusc + Invio per andare a capo',
    stopAndSend: 'Interrompi e invia', audioClip: 'Clip audio', thinking: 'Sto pensando…', send: 'Invia',
    liveFeedback: 'FEEDBACK IN TEMPO REALE', corrections: 'Le tue correzioni', greatWriting: 'Ottima scrittura',
    ready: 'Quando vuoi', emptyFeedback: 'Scrivi un messaggio e qui appariranno i suggerimenti su grammatica, lessico e stile.',
    goodWork: 'Ottimo lavoro!', play: 'Ascolta', playTitle: 'Riproduci audio',
    contactError: 'Non è stato possibile contattare la tutor.', audioError: 'Non è stato possibile elaborare la clip audio.',
    categories: { Grammar: 'Grammatica', Vocabulary: 'Lessico', Style: 'Stile' },
  },
} as const

function getInitialMessages(language: TutorLanguage): ChatMessage[] {
  return [{ id: 1, author: 'tutor', text: copy[language].welcome }]
}

let activeAudio: HTMLAudioElement | null = null
let audioSequence = 0

function stopAudio() {
  audioSequence += 1
  activeAudio?.pause()
  activeAudio = null
}

async function playAudio(base64: string, sequence: number) {
  if (sequence !== audioSequence) return
  const audio = new Audio(`data:audio/mpeg;base64,${base64}`)
  activeAudio = audio
  await audio.play()
  await new Promise<void>((resolve) => {
    audio.addEventListener('ended', () => resolve(), { once: true })
    audio.addEventListener('error', () => resolve(), { once: true })
  })
}

async function playConversation(studentAudio: string, tutorAudio: string) {
  stopAudio()
  const sequence = audioSequence
  await playAudio(studentAudio, sequence)
  await playAudio(tutorAudio, sequence)
  if (sequence === audioSequence) activeAudio = null
}

function playSingleAudio(audioBase64: string) {
  stopAudio()
  void playAudio(audioBase64, audioSequence)
}

function App() {
  const messagesRef = useRef<HTMLDivElement>(null)
  const { isRecording, error: recorderError, startRecording, stopRecording } = useRecorder()
  const [language, setLanguage] = useState<TutorLanguage>('en')
  const [messages, setMessages] = useState<ChatMessage[]>(getInitialMessages('en'))
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [draft, setDraft] = useState('')
  const [encouragement, setEncouragement] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const text = copy[language]

  useEffect(() => { document.documentElement.lang = language }, [language])

  useEffect(() => {
    const messageList = messagesRef.current
    if (!messageList) return
    messageList.scrollTo({ top: messageList.scrollHeight, behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages, isSending])

  const resetConversation = (nextLanguage = language) => {
    stopAudio()
    setMessages(getInitialMessages(nextLanguage))
    setCorrections([])
    setEncouragement('')
    setDraft('')
    setError('')
  }

  const changeLanguage = (nextLanguage: TutorLanguage) => {
    setLanguage(nextLanguage)
    resetConversation(nextLanguage)
  }

  const addFeedback = (studentMessage: ChatMessage, feedback: WritingFeedback, playStudentAudio = true) => {
    setMessages((current) => [
      ...current.map((message) => message.id === studentMessage.id
        ? { ...message, audioBase64: feedback.studentAudioBase64 }
        : message),
      { id: Date.now() + 1, author: 'tutor', text: feedback.reply, audioBase64: feedback.tutorAudioBase64 },
    ])
    setCorrections(feedback.corrections)
    setEncouragement(feedback.encouragement)
    if (voiceEnabled && playStudentAudio) {
      void playConversation(feedback.studentAudioBase64, feedback.tutorAudioBase64)
    } else if (voiceEnabled) {
      playSingleAudio(feedback.tutorAudioBase64)
    }
  }

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const messageText = draft.trim()
    if (!messageText || isSending || isTranscribing) return
    const studentMessage: ChatMessage = { id: Date.now(), author: 'student', text: messageText }
    setMessages((current) => [...current, studentMessage])
    setDraft('')
    setError('')
    setIsSending(true)
    if (voiceEnabled) stopAudio()
    try {
      const feedback = await sendWriting(messageText, messages, language)
      addFeedback(studentMessage, feedback)
    } catch {
      setError(text.contactError)
    } finally {
      setIsSending(false)
    }
  }

  const handleAudioButton = async () => {
    if (isSending || isTranscribing) return
    if (!isRecording) {
      setError('')
      await startRecording()
      return
    }
    setError('')
    setIsTranscribing(true)
    if (voiceEnabled) stopAudio()
    try {
      const audio = await stopRecording()
      const transcript = await transcribeAudioClip(audio, language)
      const studentMessage: ChatMessage = { id: Date.now(), author: 'student', text: transcript }
      setMessages((current) => [...current, studentMessage])
      setIsTranscribing(false)
      setIsSending(true)
      const feedback = await sendWriting(transcript, messages, language)
      addFeedback(studentMessage, feedback, false)
    } catch {
      setError(text.audioError)
    } finally {
      setIsTranscribing(false)
      setIsSending(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={text.brand}>
          <span className="brand-mark">{language === 'en' ? 'W' : 'S'}</span>
          <span>{text.brand}</span>
        </a>
        <div className="session-pill"><span /> {text.practice}</div>
        <div className="topbar-actions">
          <label className="language-control">
            <span>{text.language}</span>
            <select value={language} onChange={(event) => changeLanguage(event.target.value as TutorLanguage)} disabled={isRecording || isSending || isTranscribing}>
              <option value="en">English</option>
              <option value="it">Italiano</option>
            </select>
          </label>
          <button className={`voice-button ${voiceEnabled ? 'active' : ''}`} type="button" onClick={() => setVoiceEnabled((current) => { if (current) stopAudio(); return !current })} aria-pressed={voiceEnabled}>
            <span aria-hidden="true">{voiceEnabled ? '◖))' : '◖×'}</span>
            {voiceEnabled ? text.voiceOn : text.voiceOff}
          </button>
          <button className="level-button" type="button">{text.level}</button>
        </div>
      </header>

      <section className="workspace" id="top">
        <div className="chat-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">{text.eyebrow}</p><h1>{text.topic}</h1></div>
            <button className="new-topic" type="button" onClick={() => resetConversation()}>{text.newTopic}</button>
          </div>

          <div className="messages" ref={messagesRef} aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.author}`} key={message.id}>
                <div className="avatar">{message.author === 'tutor' ? 'M' : text.you}</div>
                <div>
                  <div className="message-meta">
                    <p className="message-author">{message.author === 'tutor' ? text.tutorRole : text.you}</p>
                    {message.audioBase64 && (
                      <button className="replay-button" type="button" onClick={() => playSingleAudio(message.audioBase64!)} aria-label={text.playTitle} title={text.playTitle}>
                        <span aria-hidden="true">▶</span> {text.play}
                      </button>
                    )}
                  </div>
                  <p className="message-copy">{message.text}</p>
                </div>
              </article>
            ))}
            {isSending && (
              <article className="message tutor">
                <div className="avatar">M</div>
                <div><p className="message-author">{text.tutorRole}</p><p className="message-copy typing">{text.reviewing}</p></div>
              </article>
            )}
          </div>

          <form className="composer" onSubmit={sendMessage}>
            <label htmlFor="message">{text.writeAnswer}</label>
            <textarea id="message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder={text.placeholder} rows={4} autoFocus disabled={isSending || isTranscribing} />
            {(error || recorderError) && <p className="composer-error" role="alert">{error || recorderError}</p>}
            <div className="composer-footer">
              <span>{isRecording ? text.recording : isTranscribing ? text.transcribing : `${wordCount} ${text.words}`}</span>
              <div className="composer-actions">
                <button className={`audio-button ${isRecording ? 'recording' : ''}`} type="button" onClick={handleAudioButton} disabled={isSending || isTranscribing}>
                  <span aria-hidden="true">{isRecording ? '■' : '●'}</span>
                  {isRecording ? text.stopAndSend : isTranscribing ? text.transcribing : text.audioClip}
                </button>
                <button type="submit" disabled={!draft.trim() || isSending || isTranscribing || isRecording}>
                  {isSending ? text.thinking : text.send} <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        <aside className="feedback-panel">
          <div className="feedback-heading">
            <div><p className="eyebrow">{text.liveFeedback}</p><h2>{text.corrections}</h2></div>
            <span className="correction-count">{corrections.length}</span>
          </div>
          {corrections.length === 0 ? (
            <div className="empty-feedback">
              <div className="check-icon">✓</div>
              <h3>{encouragement ? text.greatWriting : text.ready}</h3>
              <p>{encouragement || text.emptyFeedback}</p>
            </div>
          ) : (
            <div className="corrections">
              {corrections.map((correction) => (
                <article className="correction-card" key={correction.original}>
                  <span className={`tag ${correction.category.toLowerCase()}`}>{text.categories[correction.category]}</span>
                  <p className="original">{correction.original}</p>
                  <p className="corrected"><span>→</span> {correction.corrected}</p>
                  <p className="explanation">{correction.explanation}</p>
                </article>
              ))}
              <div className="encouragement"><span>✦</span><p><strong>{text.goodWork}</strong> {encouragement}</p></div>
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

export default App
