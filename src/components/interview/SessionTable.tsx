"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteInterviewSessionsAction } from "@/app/(main)/interview/actions";
import type { InterviewSession } from "@/lib/supabase/queries/sessions";

const PERSONA_LABELS: Record<string, string> = {
  startup: "스타트업 실무진",
  enterprise: "대기업 인사팀",
  pressure: "압박 면접관",
};

const STATUS_LABELS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  in_progress: { label: "일시정지", variant: "secondary" },
  abandoned: { label: "일시정지", variant: "secondary" },
  completed: { label: "면접 종료", variant: "default" },
};

interface SessionTableProps {
  sessions: InterviewSession[];
}

export default function SessionTable({ sessions }: SessionTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allChecked = sessions.length > 0 && selected.size === sessions.length;
  const indeterminate = selected.size > 0 && selected.size < sessions.length;

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map((s) => s.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDelete() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await deleteInterviewSessionsAction(ids);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">면접 기록</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={selected.size === 0 || isPending}
          className="text-destructive bg-destructive/10 hover:bg-destructive/15 hover:text-destructive disabled:opacity-40"
          onClick={handleDelete}
        >
          {isPending ? "삭제 중..." : `면접 삭제${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </Button>
      </div>

      <div className="rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow className="border-0">
              <TableHead className="w-10">
                <Checkbox
                  checked={indeterminate ? "indeterminate" : allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead>면접 이름</TableHead>
              <TableHead>시간</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>일시</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-b [&_tr:last-child]:border-0">
            {sessions.map((session) => {
              const status = session.status ? STATUS_LABELS[session.status] : null;
              const isInProgress = session.status === "in_progress";
              const isCompleted = session.status === "completed";

              return (
                <TableRow
                  key={session.id}
                  data-state={selected.has(session.id) ? "selected" : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(session.id)}
                      onCheckedChange={() => toggleOne(session.id)}
                      aria-label="행 선택"
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {session.title ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {session.duration_minutes ? `${session.duration_minutes}분` : "-"}
                  </TableCell>
                  <TableCell>
                    {status ? (
                      <Badge variant={status.variant}>{status.label}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(session.created_at).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {isInProgress && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/interview/${session.id}`}>이어하기</Link>
                      </Button>
                    )}
                    {isCompleted && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/report/${session.id}`}>리포트 보기</Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
