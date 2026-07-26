"use server";

import { getUser } from "@/lib/supabase/auth.server";
import { createSession, deleteSessions, updateSession } from "@/lib/supabase/queries/sessions";
import type { Persona } from "@/lib/supabase/queries/sessions";

interface CreateInterviewSessionInput {
  title: string;
  jdText: string;
  persona: Persona;
  durationMinutes: number;
  resumeIds: string[];
  submittedResumeId?: string | null;
}

export async function updateSessionStatusAction(
  sessionId: string,
  status: "in_progress" | "completed" | "abandoned"
): Promise<void> {
  const user = await getUser();
  if (!user) return;

  await updateSession(sessionId, { status });
}

export async function saveRemainingSecondsAction(
  sessionId: string,
  remainingSeconds: number | null
): Promise<void> {
  const user = await getUser();
  if (!user) return;

  await updateSession(sessionId, { remaining_seconds: remainingSeconds });
}

export async function saveAnalysisAction(
  sessionId: string,
  analysisJson: Record<string, unknown>
): Promise<void> {
  const user = await getUser();
  if (!user) return;

  await updateSession(sessionId, { analysis_json: analysisJson });
}

export async function deleteInterviewSessionsAction(
  sessionIds: string[]
): Promise<{ success: true } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  try {
    await deleteSessions(sessionIds);
    return { success: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다." };
  }
}

export async function createInterviewSessionAction(
  input: CreateInterviewSessionInput
): Promise<{ sessionId: string } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  try {
    const session = await createSession({
      user_id: user.id,
      title: input.title,
      jd_text: input.jdText,
      persona: input.persona,
      duration_minutes: input.durationMinutes,
      resume_ids: input.resumeIds,
      submitted_resume_id: input.submittedResumeId ?? null,
      status: "in_progress",
    });
    return { sessionId: session.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다." };
  }
}
