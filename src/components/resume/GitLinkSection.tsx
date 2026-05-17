"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2Icon, Loader2Icon, PencilIcon, CheckIcon, XIcon, AlertCircleIcon, RotateCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { saveGitLinkAction, deleteDocumentAction, retryNormalizeAction } from "@/app/(main)/resume/actions";
import type { UserDocument } from "@/lib/supabase/queries/documents";

const POLL_INTERVAL_MS = 5_000;

interface GitLinkSectionProps {
  documents: UserDocument[];
}

function GitLinkItem({ document }: { document: UserDocument }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(document.file_url ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const deleteResult = await deleteDocumentAction(document.id, "");
      if (deleteResult.error) {
        toast.error(deleteResult.error);
        return;
      }
      const saveResult = await saveGitLinkAction(value);
      if (saveResult.error) {
        toast.error(saveResult.error);
      } else {
        setIsEditing(false);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDocumentAction(document.id, "");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("링크가 삭제되었습니다.");
      }
    });
  }

  if (isEditing) {
    return (
      <>
        {isPending && (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">문서를 분석 중이에요...</p>
            <p className="text-xs text-muted-foreground text-center max-w-[220px]">
              문서 분석은 업로드 시 1회만 진행됩니다.
              <br />잠시만 기다려주세요.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
            autoFocus
          />
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            <CheckIcon className="size-4" />
            <span className="sr-only">저장</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setValue(document.file_url ?? ""); setIsEditing(false); }}
            disabled={isPending}
          >
            <XIcon className="size-4" />
            <span className="sr-only">취소</span>
          </Button>
        </div>
      </>
    );
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

  const status = document.normalize_status;

  return (
    <div className="flex items-center gap-2">
      <Link2Icon className="size-4 shrink-0 text-muted-foreground" />
      <a
        href={document.file_url ?? ""}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 text-sm truncate hover:underline"
      >
        {document.file_url}
      </a>
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
      <div className="flex shrink-0 gap-1">
        {status === "failed" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRetry}
            disabled={isPending}
            className="size-7 text-muted-foreground"
            title="AI 분석 다시 시도"
          >
            <RotateCwIcon className={`size-3.5 ${isPending ? "animate-spin" : ""}`} />
            <span className="sr-only">재시도</span>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsEditing(true)}
          className="size-7 text-muted-foreground"
        >
          <PencilIcon className="size-3.5" />
          <span className="sr-only">수정</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleDelete}
          disabled={isPending}
          className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <XIcon className="size-3.5" />
          <span className="sr-only">삭제</span>
        </Button>
      </div>
    </div>
  );
}

export default function GitLinkSection({ documents }: GitLinkSectionProps) {
  const router = useRouter();
  const hasPending = documents.some((d) => d.normalize_status === "pending");

  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasPending, router]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">GitHub</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          GitHub 레포지토리 링크
        </p>
      </div>
      <div className="space-y-2">
        {documents.map((doc) => (
          <GitLinkItem key={doc.id} document={doc} />
        ))}
        {documents.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
            GitHub 링크를 추가해보세요
          </div>
        )}
      </div>
    </section>
  );
}
