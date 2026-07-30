import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/auth.server";
import { getSubmittedResume } from "@/lib/supabase/queries/master-resume";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon, MessageSquareIcon } from "lucide-react";
import SubmittedResumeViewer, { PrintButton } from "@/components/resume/submitted/SubmittedResumeViewer";

type PageParams = Promise<{ id: string }>;

export default async function SubmittedResumePage(props: { params: PageParams }) {
  const { id } = await props.params;
  const user = await getUser();
  if (!user) redirect('/login');

  const resume = await getSubmittedResume(id);
  if (!resume || resume.user_id !== user.id) notFound();

  const createdLabel = new Date(resume.created_at).toLocaleDateString('ko-KR');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/resume">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{resume.company_name} · {resume.position}</h1>
            <p className="text-sm text-muted-foreground">{createdLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/interview?submittedResumeId=${resume.id}`}>
              <MessageSquareIcon className="size-3.5 mr-1" />
              면접 준비
            </Link>
          </Button>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resume content */}
        <div className="lg:col-span-2">
          <SubmittedResumeViewer contentMd={resume.content_md} content_json={resume.content_json} />
        </div>

        {/* Analysis panel */}
        <div className="space-y-4">
          {resume.analysis_json.keyword_mapping.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-base font-semibold">JD 키워드 매핑</h3>
              <div className="space-y-1.5">
                {resume.analysis_json.keyword_mapping.map((kw, i) => (
                  <div key={i} className="text-sm">
                    <Badge variant="secondary" className="text-xs mr-1">{kw.keyword}</Badge>
                    <span className="text-muted-foreground">{kw.found_in}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resume.analysis_json.highlights.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-base font-semibold">강조 포인트</h3>
              <div className="space-y-2">
                {resume.analysis_json.highlights.map((h, i) => (
                  <div key={i} className="text-sm space-y-0.5">
                    <p className="font-medium">{h.item}</p>
                    <p className="text-muted-foreground">{h.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {resume.analysis_json.missing_items.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2">
              <h3 className="text-base font-semibold">보완 권고</h3>
              <div className="space-y-2">
                {resume.analysis_json.missing_items.map((m, i) => (
                  <div key={i} className="text-sm space-y-0.5">
                    <p className="font-medium text-amber-600 dark:text-amber-400">{m.item}</p>
                    <p className="text-muted-foreground">{m.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
