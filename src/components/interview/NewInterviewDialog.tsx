"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createInterviewSessionAction } from "@/app/(main)/interview/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiCombobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils/index";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface NewInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: UserDocument[];
}

function toOptions(docs: UserDocument[]): ComboboxOption[] {
  return docs.map((d) => ({ value: d.id, label: d.file_name ?? d.id }));
}

export default function NewInterviewDialog({
  open,
  onOpenChange,
  documents,
}: NewInterviewDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Title
  const [title, setTitle] = useState("");

  // JD
  const [jdText, setJdText] = useState("");

  // Documents — multi-select
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
  const [githubIds, setGithubIds] = useState<string[]>([]);

  // Duration
  const [duration, setDuration] = useState<"10" | "30" | "60" | "90" | "">("");

  // Persona
  const [persona, setPersona] = useState<"explorer" | "pressure" | "technical" | "">("");

  // Optional
  const [referenceLink, setReferenceLink] = useState("");

  const resumes = documents.filter((d) => d.type === "resume");
  const portfolios = documents.filter((d) => d.type === "portfolio");
  const githubDocs = documents.filter((d) => d.type === "git");

  const resumeOptions = toOptions(resumes);
  const portfolioOptions = toOptions(portfolios);
  const githubOptions = toOptions(githubDocs);

  const canStart = title.trim() !== "" && resumeIds.length > 0 && persona !== "" && duration !== "";

  function handleReset() {
    setTitle("");
    setJdText("");
    setResumeIds([]);
    setPortfolioIds([]);
    setGithubIds([]);
    setDuration("");
    setPersona("");
    setReferenceLink("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) handleReset();
    onOpenChange(next);
  }

  function handleStart() {
    if (!canStart) return;

    const jdContent = jdText.trim();

    startTransition(async () => {
      const result = await createInterviewSessionAction({
        title: title.trim(),
        jdText: jdContent,
        persona: persona as "explorer" | "pressure" | "technical",
        durationMinutes: Number(duration),
        resumeIds: [...resumeIds, ...portfolioIds, ...githubIds],
      });

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      handleOpenChange(false);
      router.push(`/interview/${result.sessionId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 면접 추가하기</DialogTitle>
        </DialogHeader>

        {isPending && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-background/90 backdrop-blur-sm">
            <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">면접을 생성하고 있어요...</p>
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* 0. Title */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              면접 이름
              <span className="ml-1 text-xs text-primary font-normal">*필수</span>
            </label>
            <Input
              placeholder="예) 카카오 프론트엔드 2차 면접"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </section>

          {/* 1. Persona */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              면접관 페르소나
              <span className="ml-1 text-xs text-primary font-normal">*필수</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "explorer", label: "경험 탐색형", desc: "편안하고 대화적인 분위기" },
                  { value: "pressure", label: "심층 압박형", desc: "논리적 검증, 날카로운 꼬리질문" },
                  { value: "technical", label: "기술 검증형", desc: "설계·CS·성능, why/how 집중 검증" },
                ] as const
              ).map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPersona(p.value)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                    persona === p.value
                      ? "border-primary bg-accent text-primary"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <span className="text-xs font-medium">{p.label}</span>
                  <span className={cn("text-xs", persona === p.value ? "text-primary/70" : "text-muted-foreground")}>
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Duration */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              면접 시간
              <span className="ml-1 text-xs text-primary font-normal">*필수</span>
            </label>
            <Select value={duration} onValueChange={(v) => setDuration(v as "10" | "30" | "60" | "90")}>
              <SelectTrigger>
                <SelectValue placeholder="면접 시간을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10분 (임시)</SelectItem>
                <SelectItem value="30">30분</SelectItem>
                <SelectItem value="60">60분</SelectItem>
                <SelectItem value="90">90분</SelectItem>
              </SelectContent>
            </Select>
          </section>

          {/* 3. JD */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              지원 포지션 JD
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                (선택)
              </span>
            </label>
            <Textarea
              placeholder="JD 내용을 여기에 붙여넣으세요."
              rows={5}
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
            />
          </section>

          {/* 3. Resume */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              이력서 / 경력기술서
              <span className="ml-1 text-xs text-primary font-normal">*필수</span>
            </label>
            {resumes.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                저장된 이력서가 없습니다. 문서 관리에서 먼저 업로드해 주세요.
              </p>
            ) : (
              <MultiCombobox
                options={resumeOptions}
                value={resumeIds}
                onValueChange={setResumeIds}
                placeholder="이력서를 선택하세요"
              />
            )}
          </section>

          {/* 4. Portfolio */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              포트폴리오
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                (선택)
              </span>
            </label>
            {portfolios.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                저장된 포트폴리오가 없습니다.
              </p>
            ) : (
              <MultiCombobox
                options={portfolioOptions}
                value={portfolioIds}
                onValueChange={setPortfolioIds}
                placeholder="포트폴리오를 선택하세요"
              />
            )}
          </section>

          {/* 5. GitHub */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              GitHub 링크
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                (선택)
              </span>
            </label>
            {githubDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                저장된 GitHub 링크가 없습니다.
              </p>
            ) : (
              <MultiCombobox
                options={githubOptions}
                value={githubIds}
                onValueChange={setGithubIds}
                placeholder="GitHub 링크를 선택하세요"
              />
            )}
          </section>

          {/* 6. Reference link */}
          <section className="space-y-2">
            <label className="text-sm font-medium">
              참고 자료
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                (선택)
              </span>
            </label>
            <Input
              type="url"
              placeholder="https://example.com/reference"
              value={referenceLink}
              onChange={(e) => setReferenceLink(e.target.value)}
            />
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleStart} disabled={!canStart || isPending}>
            {isPending ? "생성 중..." : "면접 시작하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
