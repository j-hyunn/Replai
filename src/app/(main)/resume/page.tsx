export const maxDuration = 60;

import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/auth.server";
import { getUserDocuments } from "@/lib/supabase/queries/documents";
import { getMasterResume, getSubmittedResumes } from "@/lib/supabase/queries/master-resume";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import DocumentSection from "@/components/resume/DocumentSection";
import MasterResumeCard from "@/components/resume/master/MasterResumeCard";
import SubmittedResumeCard from "@/components/resume/submitted/SubmittedResumeCard";
import GenerateResumeButton from "@/components/resume/submitted/GenerateResumeButton";

export default async function ResumePage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const userId = user.id;

  const [documents, masterResume, submittedResumes] = await Promise.all([
    getUserDocuments(userId),
    getMasterResume(userId),
    getSubmittedResumes(userId),
  ]);

  const resumes = documents.filter((d) => d.type === "resume");
  const portfolios = documents.filter((d) => d.type === "portfolio");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 space-y-10">
      <div>
        <h1 className="text-2xl font-bold">서류 관리</h1>
        <p className="text-base text-muted-foreground mt-1">
          마스터 이력서를 작성하고, JD에 맞는 제출용 이력서를 생성하세요.
        </p>
      </div>

      {/* 1. Master Resume */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">마스터 이력서</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              모든 경력과 경험을 한 곳에 정리하는 기준 이력서
            </p>
          </div>
          {!masterResume && (
            <Button size="sm" asChild>
              <Link href="/resume/master">
                <PlusIcon className="size-4 mr-1" />
                생성하기
              </Link>
            </Button>
          )}
        </div>
        {masterResume ? (
          <MasterResumeCard masterResume={masterResume} />
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-base text-muted-foreground">
            아직 마스터 이력서가 없습니다
          </div>
        )}
      </section>

      {/* 2. Submitted Resumes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">제출용 이력서</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              마스터 이력서를 기반으로 JD에 맞는 이력서를 자동 생성합니다.
            </p>
          </div>
          <GenerateResumeButton hasMasterResume={masterResume !== null} />
        </div>
        {submittedResumes.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-base text-muted-foreground">
            아직 제출용 이력서가 없습니다
          </div>
        ) : (
          <div className="space-y-2">
            {submittedResumes.map((sr) => (
              <SubmittedResumeCard key={sr.id} resume={sr} />
            ))}
          </div>
        )}
      </section>

      {/* 3. Resume / Career documents */}
      <DocumentSection
        type="resume"
        title="이력서 / 경력기술서"
        description="PDF · 최대 10MB"
        documents={resumes}
      />

      {/* 4. Portfolio */}
      <DocumentSection
        type="portfolio"
        title="포트폴리오"
        description="PDF · 최대 20MB"
        documents={portfolios}
      />
    </div>
  );
}
