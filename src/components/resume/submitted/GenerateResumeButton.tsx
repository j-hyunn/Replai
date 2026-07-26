"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import GenerateResumeDialog from "@/components/resume/submitted/GenerateResumeDialog";

interface Props {
  hasMasterResume: boolean;
}

export default function GenerateResumeButton({ hasMasterResume }: Props) {
  const [open, setOpen] = useState(false);

  if (!hasMasterResume) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button size="sm" disabled>
              <PlusIcon className="size-3.5 mr-1" />
              새로 생성
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>마스터 이력서를 먼저 작성해주세요.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PlusIcon className="size-3.5 mr-1" />
        새로 생성
      </Button>
      <GenerateResumeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
