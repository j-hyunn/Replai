"use client";

import { useTransition } from "react";
import { FileTextIcon, Trash2Icon, Loader2Icon, AlertCircleIcon, RotateCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { deleteDocumentAction, retryNormalizeAction } from "@/app/(main)/resume/actions";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface FileCardProps {
  document: UserDocument;
  label: string;
}

export default function FileCard({ document, label }: FileCardProps) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDocumentAction(document.id, document.file_url ?? "");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${label}이(가) 삭제되었습니다.`);
      }
    });
  }

  function handleRetry() {
    startTransition(async () => {
      const result = await retryNormalizeAction(document.id);
      if (result.error) {
        toast.error(result.error);
      } else if (result.status === "done") {
        toast.success("AI 분석이 완료되었습니다.");
      } else {
        toast.error("AI 분석에 다시 실패했습니다. 잠시 후 다시 시도해주세요.");
      }
    });
  }

  const fileName = document.file_name ?? document.file_url?.split("/").pop() ?? "파일";
  const uploadedAt = new Date(document.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const status = document.normalize_status;

  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 pl-4 pr-1 py-1">
        <FileTextIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{fileName}</p>
            {status === "pending" && (
              <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
                <Loader2Icon className="size-2.5 animate-spin" />
                AI 분석 중
              </Badge>
            )}
            {status === "failed" && (
              <Badge variant="destructive" className="shrink-0 gap-1 text-[10px]">
                <AlertCircleIcon className="size-2.5" />
                분석 실패
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{uploadedAt}</p>
        </div>
        {status === "failed" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRetry}
            disabled={isPending}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="AI 분석 다시 시도"
          >
            <RotateCwIcon className={`size-4 ${isPending ? "animate-spin" : ""}`} />
            <span className="sr-only">재시도</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={isPending}
          className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2Icon className="size-4" />
          <span className="sr-only">삭제</span>
        </Button>
      </CardContent>
    </Card>
  );
}
