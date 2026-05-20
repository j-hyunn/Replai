import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/auth.server";
import { getSession } from "@/lib/supabase/queries/sessions";
import { getReport } from "@/lib/supabase/queries/reports";
import type { ReportJson } from "@/lib/supabase/queries/reports";
import { Button } from "@/components/ui/button";
import GenerateReportButton from "@/components/report/GenerateReportButton";
import ReportView from "@/components/report/ReportView";

interface ReportPageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { sessionId } = await params;

  const user = await getUser();
  if (!user) redirect("/login");

  const session = await getSession(sessionId);
  if (!session || session.user_id !== user.id) notFound();

  const report = await getReport(sessionId);

  if (!report || !report.report_json) {
    return (
      <div className="w-full rounded-xl border bg-card flex flex-col items-center justify-center gap-6 text-center px-4 py-12">
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">피드백 리포트 생성</h1>
          <p className="text-sm text-muted-foreground">
            면접 대화를 분석해 점수와 피드백을 생성합니다. 1~2분 정도 소요될 수 있어요.
          </p>
        </div>
        <GenerateReportButton sessionId={sessionId} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/interview">면접 목록으로</Link>
        </Button>
      </div>
    );
  }

  const data: ReportJson = report.report_json;

  return <ReportView data={data} createdAt={report.created_at} sessionId={sessionId} />;
}
