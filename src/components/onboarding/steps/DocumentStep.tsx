"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import DocumentSection from "@/components/resume/DocumentSection";
import GitLinkSection from "@/components/resume/GitLinkSection";
import AddDocumentDialog from "@/components/resume/AddDocumentDialog";
import { saveProfileAction } from "@/app/(main)/profile/actions";
import type { SaveProfileInput } from "@/app/(main)/profile/actions";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface DocumentStepProps {
  documents: UserDocument[];
  pendingProfile: SaveProfileInput | null;
  onBack: () => void;
}

export default function DocumentStep({ documents, pendingProfile, onBack }: DocumentStepProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const resumeDocs = documents.filter((d) => d.type === "resume");
  const portfolioDocs = documents.filter((d) => d.type === "portfolio");
  const gitDocs = documents.filter((d) => d.type === "git");

  function handleFinish() {
    startTransition(async () => {
      if (pendingProfile) {
        const result = await saveProfileAction(pendingProfile);
        if (result.error) {
          toast.error(result.error);
          return;
        }
      }
      router.push("/interview");
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PlusIcon className="size-3.5" />
          문서 추가
        </Button>
      </div>

      <DocumentSection
        type="resume"
        title="이력서 / 경력기술서"
        description="PDF · 최대 10MB"
        documents={resumeDocs}
      />

      <DocumentSection
        type="portfolio"
        title="포트폴리오"
        description="PDF · 최대 20MB"
        documents={portfolioDocs}
      />

      <GitLinkSection documents={gitDocs} />

      <AddDocumentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => router.refresh()}
      />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" onClick={onBack}>
          ← 이전
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={handleFinish} disabled={isPending}>
            건너뛰기
          </Button>
          <Button onClick={handleFinish} disabled={isPending}>
            {isPending ? "저장 중..." : "완료"}
          </Button>
        </div>
      </div>
    </div>
  );
}
