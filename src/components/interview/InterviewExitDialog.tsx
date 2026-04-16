"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function InterviewExitDialog() {
  const [open, setOpen] = useState(false);

  function handleExit() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("interview:exit"));
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="shrink-0">
        <Image src="/logo.svg" alt="Replai" width={28} height={28} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>면접을 나가시겠어요?</DialogTitle>
            <DialogDescription className="space-y-1 pt-1">
              <span className="block">
                면접을 종료하지 않고 나가면 피드백 리포트를 받을 수 없어요.
              </span>
              <span className="block">
                나갔다가 다시 돌아오면 이어서 진행할 수 있어요.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              계속 진행하기
            </Button>
            <Button variant="destructive" className="text-white" onClick={handleExit}>
              나가기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
