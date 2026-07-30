"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileUserIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteMasterResumeAction } from "@/app/(main)/resume/master/actions";
import type { MasterResume } from "@/lib/types/master-resume";

interface Props {
  masterResume: MasterResume;
}

export default function MasterResumeCard({ masterResume }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const updatedLabel = new Date(masterResume.updated_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteMasterResumeAction();
    setDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      setConfirmOpen(false);
      toast.success("마스터 이력서가 삭제되었습니다.");
      router.refresh();
    }
  }

  return (
    <>
      <Card
        className="shadow-none cursor-pointer transition-colors hover:bg-muted/50"
        role="link"
        tabIndex={0}
        onClick={() => router.push("/resume/master")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push("/resume/master");
          }
        }}
      >
        <CardContent className="flex items-center gap-3 pl-4 pr-1 py-1">
          <FileUserIcon className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-base font-medium truncate">마스터 이력서</p>
            <p className="text-sm text-muted-foreground">최근 수정: {updatedLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={deleting}
            className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
          >
            <Trash2Icon className="size-4" />
            <span className="sr-only">삭제</span>
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>마스터 이력서를 삭제하시겠습니까?</DialogTitle>
            <DialogDescription>
              삭제하면 모든 경력, 프로젝트, 기술 역량 정보가 영구적으로 삭제됩니다.
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
