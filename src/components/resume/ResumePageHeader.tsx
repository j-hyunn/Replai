"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddDocumentDialog from "@/components/resume/AddDocumentDialog";

export default function ResumePageHeader() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold">문서 관리</h1>
        <p className="text-base text-muted-foreground mt-1">
          업로드된 문서는 모의 인터뷰에서 활용할 수 있습니다.
        </p>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5" />
        문서 추가
      </Button>
      <AddDocumentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
