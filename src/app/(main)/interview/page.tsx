export const maxDuration = 60;

import { getUser } from "@/lib/supabase/auth.server";
import { getUserDocuments } from "@/lib/supabase/queries/documents";
import { getUserSessions } from "@/lib/supabase/queries/sessions";
import StartInterviewButton from "@/components/common/StartInterviewButton";
import SessionTable from "@/components/interview/SessionTable";
import NoResumeDialog from "@/components/interview/NoResumeDialog";

export default async function InterviewPage() {
  const user = await getUser();
  const userId = user!.id;

  const [documents, sessions] = await Promise.all([
    getUserDocuments(userId),
    getUserSessions(userId),
  ]);

  const hasResume = documents.some((d) => d.type === "resume");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">모의 인터뷰</h1>
          <p className="text-sm text-muted-foreground">
            {hasResume
              ? "JD와 페르소나를 설정하고 면접을 시작하세요."
              : "이력서를 먼저 업로드해야 면접을 시작할 수 있습니다."}
          </p>
        </div>
        <StartInterviewButton hasResume={hasResume} documents={documents} />
      </div>

      {!hasResume && <NoResumeDialog />}

      {/* Interview history */}
      {sessions.length === 0 ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">면접 기록</h2>
          <p className="text-sm text-muted-foreground py-8 text-center">
            아직 면접 기록이 없습니다.
          </p>
        </div>
      ) : (
        <SessionTable sessions={sessions} />
      )}
    </div>
  );
}
