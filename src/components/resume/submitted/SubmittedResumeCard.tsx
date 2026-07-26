"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileTextIcon, MessageSquareIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { SubmittedResume } from "@/lib/types/master-resume";

interface Props {
  resume: SubmittedResume;
}

export default function SubmittedResumeCard({ resume }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`"${resume.company_name} - ${resume.position}" 이력서를 삭제할까요?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/resume/submitted/${resume.id}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error("삭제에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      toast.success("삭제되었습니다.");
      router.refresh();
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  const createdLabel = new Date(resume.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 pl-4 pr-1 py-1">
        <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
        <Link href={`/resume/submitted/${resume.id}`} className="flex-1 min-w-0 py-2 -my-2">
          <p className="text-base font-medium truncate">
            {resume.company_name} · {resume.position}
          </p>
          <p className="text-sm text-muted-foreground">{createdLabel}</p>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title="면접 준비"
          asChild
        >
          <Link href={`/interview?submittedResumeId=${resume.id}`}>
            <MessageSquareIcon className="size-4" />
            <span className="sr-only">면접 준비</span>
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={deleting}
          onClick={handleDelete}
          className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2Icon className="size-4" />
          <span className="sr-only">삭제</span>
        </Button>
      </CardContent>
    </Card>
  );
}
