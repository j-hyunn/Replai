export const maxDuration = 60;

import { getUser } from "@/lib/supabase/auth.server";
import { getUserDocuments } from "@/lib/supabase/queries/documents";
import { getUserSessions } from "@/lib/supabase/queries/sessions";
import { getSubmittedResume, getSubmittedResumes } from "@/lib/supabase/queries/master-resume";
import StartInterviewButton from "@/components/common/StartInterviewButton";
import SessionTable from "@/components/interview/SessionTable";
import NoResumeDialog from "@/components/interview/NoResumeDialog";

type SearchParams = Promise<{ submittedResumeId?: string }>;

export default async function InterviewPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const user = await getUser();
  const userId = user!.id;

  const [documents, sessions, allSubmittedResumes] = await Promise.all([
    getUserDocuments(userId),
    getUserSessions(userId),
    getSubmittedResumes(userId).catch(() => []),
  ]);

  const hasResume = documents.some((d) => d.type === "resume");

  // Submitted resumes summary for dialog dropdown
  const submittedResumes = allSubmittedResumes.map((r) => ({
    id: r.id,
    company_name: r.company_name,
    position: r.position,
    jd_text: r.jd_text,
  }));

  // Load submitted resume for JD prefill if param is present
  let prefillJd: { company_name: string; position: string; jd_text: string } | null = null;
  let pinnedSubmittedResumeId: string | null = null;
  if (searchParams.submittedResumeId) {
    const submitted = await getSubmittedResume(searchParams.submittedResumeId);
    if (submitted && submitted.user_id === userId) {
      pinnedSubmittedResumeId = submitted.id;
      prefillJd = {
        company_name: submitted.company_name,
        position: submitted.position,
        jd_text: submitted.jd_text,
      };
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">모의 인터뷰</h1>
          <p className="text-base text-muted-foreground">
            {hasResume
              ? "JD와 페르소나를 설정하고 면접을 시작하세요."
              : "이력서를 먼저 업로드해야 면접을 시작할 수 있습니다."}
          </p>
        </div>
        <StartInterviewButton
          hasResume={hasResume}
          documents={documents}
          prefillJd={prefillJd}
          submittedResumeId={pinnedSubmittedResumeId}
          submittedResumes={submittedResumes}
        />
      </div>

      {!hasResume && <NoResumeDialog />}

      {/* Interview history */}
      {sessions.length === 0 ? (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">면접 기록</h2>
          <p className="text-base text-muted-foreground py-8 text-center">
            아직 면접 기록이 없습니다.
          </p>
        </div>
      ) : (
        <SessionTable sessions={sessions} />
      )}
    </div>
  );
}
