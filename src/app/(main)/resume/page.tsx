export const maxDuration = 60;

import { getUser } from "@/lib/supabase/auth.server";
import { getUserDocuments } from "@/lib/supabase/queries/documents";
import ResumePageHeader from "@/components/resume/ResumePageHeader";
import DocumentSection from "@/components/resume/DocumentSection";
import GitLinkSection from "@/components/resume/GitLinkSection";

export default async function ResumePage() {
  const user = await getUser();
  const userId = user!.id;

  const documents = await getUserDocuments(userId);
  const resumes = documents.filter((d) => d.type === "resume");
  const portfolios = documents.filter((d) => d.type === "portfolio");
  const gitDocs = documents.filter((d) => d.type === "git");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-10">
      <ResumePageHeader />

      <DocumentSection
        type="resume"
        title="이력서 / 경력기술서"
        description="PDF · 최대 10MB"
        documents={resumes}
      />

      <DocumentSection
        type="portfolio"
        title="포트폴리오"
        description="PDF · 최대 20MB"
        documents={portfolios}
      />

      <GitLinkSection documents={gitDocs} />
    </div>
  );
}
