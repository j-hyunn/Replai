"use server";

import { getUser } from "@/lib/supabase/auth.server";
import { createSession, deleteSessions, updateSession } from "@/lib/supabase/queries/sessions";
import type { Persona } from "@/lib/supabase/queries/sessions";
import { getMasterResume, getSubmittedResume } from "@/lib/supabase/queries/master-resume";
import { hasMasterResumeContent } from "@/lib/utils/masterResumeContent";

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
    // A session must have at least one resume source, and a submitted resume
    // reference must belong to the caller — otherwise the interview would run
    // with no context (or someone else's).
    let submittedResumeId: string | null = null;
    if (input.submittedResumeId) {
      const submitted = await getSubmittedResume(input.submittedResumeId);
      if (!submitted || submitted.user_id !== user.id) {
        return {
          error:
            "선택한 제출용 이력서를 찾을 수 없습니다. 서류 관리에서 이력서를 다시 선택해주세요.",
        };
      }
      submittedResumeId = submitted.id;
    }

    if (input.resumeIds.length === 0 && !submittedResumeId) {
      const masterResume = await getMasterResume(user.id).catch(() => null);
      if (!hasMasterResumeContent(masterResume)) {
        return {
          error:
            "면접에 사용할 이력서가 없습니다. 서류 관리에서 마스터 이력서를 작성하거나 이력서 파일을 업로드해주세요.",
        };
      }
    }

    const session = await createSession({
      user_id: user.id,
      title: input.title,
      jd_text: input.jdText,
      persona: input.persona,
      duration_minutes: input.durationMinutes,
      resume_ids: input.resumeIds,
      submitted_resume_id: submittedResumeId,
      status: "in_progress",
    });
    return { sessionId: session.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다." };
  }
}
