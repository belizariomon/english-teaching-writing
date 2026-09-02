import OpenAI, { toFile } from 'openai';

type HistoryMessage = {
  author: 'tutor' | 'student';
  text: string;
};

export type TutorLanguage = 'en' | 'it';

const languageSettings = {
  en: {
    name: 'English',
    transcriptionCode: 'en',
  },
  it: {
    name: 'Italian',
    transcriptionCode: 'it',
  },
} as const;

export type WritingFeedback = {
  reply: string;
  corrections: Array<{
    original: string;
    corrected: string;
    explanation: string;
    category: 'Grammar' | 'Vocabulary' | 'Style';
  }>;
  encouragement: string;
  studentAudioBase64: string;
  tutorAudioBase64: string;
};

function getInstructions(language: TutorLanguage): string {
  const languageName = languageSettings[language].name;

  return `You are Maya, a warm and concise ${languageName} writing tutor for a learner at CEFR C1 level.

Continue the conversation naturally in ${languageName} and respond to the meaning of the student's latest message. Use nuanced, idiomatic ${languageName} and ask one thought-provoking follow-up question that encourages a developed answer.

Identify genuine grammar, vocabulary, cohesion, register, or style issues in the latest student message only. Correct it as ${languageName}; never translate it into another language. At C1, pay attention to precision, collocations, natural phrasing, sentence variety, discourse markers, and appropriate register. Do not invent errors or replace a valid phrase merely because another option exists. Keep the student's intended meaning and voice.

Corrections must be short, specific excerpts rather than rewriting the entire message. If the writing is correct, return an empty corrections array.

Write the reply, correction explanations, and encouragement entirely in ${languageName}. Use advanced but natural language and explain subtle distinctions when useful. Return only the requested JSON.`;
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  return new OpenAI({ apiKey });
}

const feedbackSchema = {
  type: 'object' as const,
  properties: {
    reply: { type: 'string' as const },
    corrections: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          original: { type: 'string' as const },
          corrected: { type: 'string' as const },
          explanation: { type: 'string' as const },
          category: {
            type: 'string' as const,
            enum: ['Grammar', 'Vocabulary', 'Style'],
          },
        },
        required: ['original', 'corrected', 'explanation', 'category'],
        additionalProperties: false,
      },
    },
    encouragement: { type: 'string' as const },
  },
  required: ['reply', 'corrections', 'encouragement'],
  additionalProperties: false,
};

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string,
  language: TutorLanguage,
): Promise<string> {
  const openai = getOpenAIClient();
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm';
  const file = await toFile(audioBuffer, `recording.${extension}`, {
    type: mimeType || 'audio/webm',
  });
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'gpt-4o-mini-transcribe',
    language: languageSettings[language].transcriptionCode,
  });

  const text = transcription.text.trim();
  if (!text) throw new Error('The audio transcription is empty');
  return text;
}

export async function getWritingFeedback(
  message: string,
  history: HistoryMessage[],
  language: TutorLanguage,
): Promise<WritingFeedback> {
  const openai = getOpenAIClient();
  const recentHistory = history
    .filter(
      (item) =>
        (item.author === 'tutor' || item.author === 'student') &&
        typeof item.text === 'string',
    )
    .slice(-10)
    .map((item) => ({
      role:
        item.author === 'tutor' ? ('assistant' as const) : ('user' as const),
      content: item.text.slice(0, 4000),
    }));

  const response = await openai.responses.create({
    model: 'gpt-4o-mini',
    instructions: getInstructions(language),
    input: [...recentHistory, { role: 'user', content: message }],
    text: {
      format: {
        type: 'json_schema',
        name: 'writing_feedback',
        schema: feedbackSchema,
        strict: true,
      },
    },
  });

  if (!response.output_text) {
    throw new Error('The tutor returned an empty response');
  }

  const feedback = JSON.parse(response.output_text) as Omit<
    WritingFeedback,
    'studentAudioBase64' | 'tutorAudioBase64'
  >;
  const [studentSpeech, tutorSpeech] = await Promise.all([
    openai.audio.speech.create({
      model: 'tts-1',
      voice: 'onyx',
      input: message,
      response_format: 'mp3',
    }),
    openai.audio.speech.create({
      model: 'tts-1',
      voice: 'shimmer',
      input: feedback.reply,
      response_format: 'mp3',
    }),
  ]);

  const [studentAudio, tutorAudio] = await Promise.all([
    studentSpeech.arrayBuffer(),
    tutorSpeech.arrayBuffer(),
  ]);

  return {
    ...feedback,
    studentAudioBase64: Buffer.from(studentAudio).toString('base64'),
    tutorAudioBase64: Buffer.from(tutorAudio).toString('base64'),
  };
}
