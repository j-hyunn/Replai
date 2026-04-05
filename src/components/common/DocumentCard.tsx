"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { getUploadUrlAction, processUploadedDocumentAction, deleteDocumentAction } from "@/app/(main)/resume/actions";
import { createClient } from "@/lib/supabase/client";
import type { UserDocument, DocumentType } from "@/lib/supabase/queries/documents";

interface DocumentCardProps {
  type: DocumentType;
  label: string;
  description: string;
  required?: boolean;
  document: UserDocument | null;
}

export default function DocumentCard({
  type,
  label,
  description,
  required = false,
  document,
}: DocumentCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    startTransition(async () => {
      // 1단계: Presigned URL 발급
      const urlResult = await getUploadUrlAction(type, file.name, file.size, file.type);
      if (urlResult.error) {
        toast.error(urlResult.error);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      // 2단계: Supabase에 직접 업로드
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .uploadToSignedUrl(urlResult.storagePath!, urlResult.token!, file);

      if (uploadError) {
        toast.error(`파일 업로드에 실패했습니다: ${uploadError.message}. 다시 시도해주세요.`);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      // 3단계: 파싱 + DB 저장
      const result = await processUploadedDocumentAction(
        urlResult.documentId!,
        urlResult.storagePath!,
        type,
        file.name
      );

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${label}이(가) 업로드되었습니다.`);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleDelete() {
    if (!document) return;

    startTransition(async () => {
      const result = await deleteDocumentAction(document.id, document.file_url ?? "");
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${label}이(가) 삭제되었습니다.`);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {label}
              {required && (
                <Badge variant="secondary" className="text-xs">
                  필수
                </Badge>
              )}
              {document && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                  업로드됨
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="shrink-0">
            {document ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="text-destructive hover:text-destructive"
              >
                {isPending ? "삭제 중..." : "삭제"}
              </Button>
            ) : (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={isPending}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={isPending}
                >
                  {isPending ? "업로드 중..." : "파일 선택"}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      {document && (
        <CardContent>
          <p className="text-sm text-muted-foreground truncate">
            업로드 완료 ·{" "}
            {new Date(document.created_at).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </CardContent>
      )}
    </Card>
  );
}
