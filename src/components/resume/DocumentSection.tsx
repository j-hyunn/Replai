"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import FileCard from "@/components/resume/FileCard";
import type { UserDocument, DocumentType } from "@/lib/supabase/queries/documents";

interface DocumentSectionProps {
  type: DocumentType;
  title: string;
  description: string;
  documents: UserDocument[];
}

const POLL_INTERVAL_MS = 5_000;

export default function DocumentSection({ title, description, documents }: DocumentSectionProps) {
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
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
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
