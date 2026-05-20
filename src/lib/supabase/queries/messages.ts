import { createClient } from '@/lib/supabase/server'

export type MessageRole = 'interviewer' | 'user'

// `kind` carries the semantic intent of a message. It replaces the legacy
// `[모범 답안]` / `[질문 건너뛰기]` markers that used to live inside `content`.
//
//  - 'interviewer': an interviewer question or closing
//  - 'answer':      a real user answer
//  - 'hint_shown':  the user opened the hint (model answer); `content` is the
//                   hint text itself, not the user's own answer
//  - 'skipped':     the user explicitly skipped this question; `content` is ''
export type MessageKind = 'interviewer' | 'answer' | 'hint_shown' | 'skipped'

export interface InterviewMessage {
  id: string
  session_id: string
  role: MessageRole
  content: string | null
  depth: number
  question_id: string | null
  kind: MessageKind
  created_at: string
}

export interface CreateMessageInput {
  session_id: string
  role: MessageRole
  content: string
  kind: MessageKind
  depth?: number
  question_id?: string
}

/**
 * Saves a single message to the conversation history.
 * Called after each user answer and each interviewer question.
 */
export async function createMessage(input: CreateMessageInput): Promise<InterviewMessage> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_messages')
    .insert({
      depth: 0,
      question_id: null,
      ...input,
    })
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to save message: ${error.message}. Your answer may not have been recorded — please try again.`
    )
  }

  return data
}

/**
 * Returns all messages for a given session, ordered chronologically.
 * Only accessible if the session belongs to the current user (enforced by RLS).
 */
export async function getSessionMessages(sessionId: string): Promise<InterviewMessage[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(
      `Failed to load conversation: ${error.message}. Please refresh the page.`
    )
  }

  return data
}
