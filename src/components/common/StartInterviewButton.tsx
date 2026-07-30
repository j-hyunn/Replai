"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import NewInterviewDialog from "@/components/interview/NewInterviewDialog";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface PrefillJd {
  company_name: string;
  position: string;
  jd_text: string;
}

interface SubmittedResumeSummary {
  id: string;
  company_name: string;
  position: string;
  jd_text: string;
}

interface StartInterviewButtonProps {
  hasResume: boolean;
  documents: UserDocument[];
  prefillJd?: PrefillJd | null;
  submittedResumeId?: string | null;
  submittedResumes?: SubmittedResumeSummary[];
}

export default function StartInterviewButton({
  hasResume,
  documents,
  prefillJd,
  submittedResumeId,
  submittedResumes,
}: StartInterviewButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        disabled={!hasResume}
        onClick={() => setOpen(true)}
      >
        새 면접 추가하기
      </Button>

      {hasResume && (
        <NewInterviewDialog
          open={open}
          onOpenChange={setOpen}
          documents={documents}
          prefillJd={prefillJd}
          submittedResumeId={submittedResumeId}
          submittedResumes={submittedResumes}
        />
      )}
    </>
  );
}
