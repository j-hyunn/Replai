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
  hasMasterResume?: boolean;
}

export default function StartInterviewButton({
  hasResume,
  documents,
  prefillJd,
  submittedResumeId,
  submittedResumes,
  hasMasterResume,
}: StartInterviewButtonProps) {
  // Arriving from a submitted resume's "면접 준비" link means the intent is
  // already to create an interview — open the dialog without a second click.
  const [open, setOpen] = useState(hasResume && submittedResumeId != null);

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
          hasMasterResume={hasMasterResume}
        />
      )}
    </>
  );
}
