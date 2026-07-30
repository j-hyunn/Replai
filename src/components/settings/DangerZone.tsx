"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { deleteAccountAction } from "@/app/(main)/settings/actions";

export default function DangerZone() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteAccountAction();
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("계정이 삭제되었습니다.");
        router.push("/login");
      }
    });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-destructive">위험 구역</h2>
      <div className="rounded-lg border border-destructive/30 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-base font-medium">계정 삭제</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            계정과 모든 데이터가 영구적으로 삭제됩니다. 되돌릴 수 없습니다.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
          className="shrink-0"
        >
          계정 삭제
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>계정을 삭제하시겠습니까?</DialogTitle>
            <DialogDescription>
              계정과 업로드된 문서, 인터뷰 기록이 모두 영구 삭제됩니다.
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
