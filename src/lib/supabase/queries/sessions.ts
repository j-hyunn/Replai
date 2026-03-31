import { createClient } from '@/lib/supabase/server'

export type SessionStatus = 'in_progress' | 'completed' | 'abandoned'
export type Persona = 'explorer' | 'pressure'

export interface InterviewSession {
  id: string
  user_id: string
  title: string | null
  jd_text: string | null
  persona: Persona | null
  duration_minutes: number | null
  remaining_seconds: number | null
  resume_ids: string[] | null
  analysis_json: Record<string, unknown> | null
  adk_session_id: string | null
  started_at: string | null
  ended_at: string | null
  status: SessionStatus | null
  created_at: string
}

export interface CreateSessionInput {
  user_id: string
  title?: string
  jd_text: string
  persona: Persona
  duration_minutes: number
  status?: SessionStatus
  resume_ids?: string[]
}

export interface UpdateSessionInput {
  started_at?: string
  ended_at?: string
  status?: SessionStatus
  remaining_seconds?: number | null
  analysis_json?: Record<string, unknown>
  adk_session_id?: string
}

/**
 * Creates a new interview session.
 */
export async function createSession(input: CreateSessionInput): Promise<InterviewSession> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_sessions')
    .insert(input)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to create session: ${error.message}. Please try starting the interview again.`
    )
  }

  return data
}

/**
 * Returns a single session by ID.
 * Only returns the session if it belongs to the current user (enforced by RLS).
 */
export async function getSession(sessionId: string): Promise<InterviewSession | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Row not found
    throw new Error(
      `Failed to load session: ${error.message}. Please refresh the page.`
    )
  }

  return data
}

/**
 * Updates an existing session (e.g., started_at, ended_at, status).
 */
export async function updateSession(
  sessionId: string,
  input: UpdateSessionInput
): Promise<InterviewSession> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_sessions')
    .update(input)
    .eq('id', sessionId)
    .select()
    .single()

  if (error) {
    throw new Error(
      `Failed to update session: ${error.message}. Please try again.`
    )
  }

  return data
}

/**
 * Deletes multiple sessions by ID.
 * RLS ensures only the owner's sessions are deleted.
 */
export async function deleteSessions(sessionIds: string[]): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('interview_sessions')
    .delete()
    .in('id', sessionIds)

  if (error) {
    throw new Error(
      `Failed to delete sessions: ${error.message}. Please try again.`
    )
  }
}

/**
 * Returns the most recent 10 sessions for the given user.
 * History is capped at 10 sessions per the MVP spec.
 */
export async function getUserSessions(userId: string): Promise<InterviewSession[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    throw new Error(
      `Failed to load session history: ${error.message}. Please refresh the page.`
    )
  }

  return data
}
