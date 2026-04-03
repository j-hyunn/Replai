"use client";

import { useRef, useTransition } from "react";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FileCard from "@/components/resume/FileCard";
import { uploadDocumentAction } from "@/app/(main)/resume/actions";
import type { UserDocument, DocumentType } from "@/lib/supabase/queries/documents";

interface DocumentSectionProps {
  type: DocumentType;
  title: string;
  description: string;
  required?: boolean;
  documents: UserDocument[];
}

export default function DocumentSection({
  type,
  title,
  description,
  required = false,
  documents,
}: DocumentSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);

    startTransition(async () => {
      const result = await uploadDocumentAction(formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${title}이(가) 업로드되었습니다.`);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div>
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
            <UploadIcon className="size-3.5" />
            {isPending ? "업로드 중..." : "업로드"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {documents.length > 0 ? (
          documents.map((doc) => (
            <FileCard key={doc.id} document={doc} label={title} />
          ))
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
            업로드된 파일이 없습니다
          </div>
        )}
      </div>
    </section>
  );
}
