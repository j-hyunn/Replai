"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createInterviewSessionAction } from "@/app/(main)/interview/actions";
import { ensureNormalizedAction } from "@/app/(main)/resume/actions";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/index";
import type { UserDocument } from "@/lib/supabase/queries/documents";

interface PrefillJd {
  company_name: string;
  position: string;
  jd_text: string;
}

interface SubmittedResumeSummary {
  id: string;
  company_name: string;
  position: string;
  jd_text: string;
}

interface NewInterviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: UserDocument[];
  prefillJd?: PrefillJd | null;
  submittedResumeId?: string | null;
  submittedResumes?: SubmittedResumeSummary[];
  hasMasterResume?: boolean;
}

function toOptions(docs: UserDocument[]): ComboboxOption[] {
  return docs.map((d) => ({ value: d.id, label: d.file_name ?? d.id }));
}

// Radix Select throws on an empty-string item value (an empty value is reserved
// for "no selection"), so the "직접 입력" option needs a sentinel.
const DIRECT_INPUT_VALUE = "__direct__";

type StartStage = "idle" | "preparing" | "creating";

export default function NewInterviewDialog({
  open,
  onOpenChange,
  documents,
  prefillJd,
  submittedResumeId: initialSubmittedResumeId,
  submittedResumes = [],
  hasMasterResume = false,
}: NewInterviewDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [stage, setStage] = useState<StartStage>("idle");

  const [title, setTitle] = useState("");
  const [jdText, setJdText] = useState("");

  // Documents — multi-select
  const [resumeIds, setResumeIds] = useState<string[]>([]);
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);

  // Duration
  const [duration, setDuration] = useState<"10" | "30" | "60" | "90" | "">("");

  // Persona
  const [persona, setPersona] = useState<"explorer" | "pressure" | "technical" | "">("");

  // Optional
  const [referenceLink, setReferenceLink] = useState("");

  // Submitted resume selection
  const [selectedSubmittedResumeId, setSelectedSubmittedResumeId] = useState<string>("");

  // Apply prefill when dialog opens
  useEffect(() => {
    if (open) {
      if (initialSubmittedResumeId) {
        // Navigated from submitted resume detail page — pin that resume
        setSelectedSubmittedResumeId(initialSubmittedResumeId);
      }
      if (prefillJd) {
        setTitle(`${prefillJd.company_name} ${prefillJd.position}`.trim());
        setJdText(prefillJd.jd_text);
      }
    }
  }, [open, prefillJd, initialSubmittedResumeId]);

  const resumes = documents.filter((d) => d.type === "resume");
  const portfolios = documents.filter((d) => d.type === "portfolio");

  const resumeOptions = toOptions(resumes);
  const portfolioOptions = toOptions(portfolios);

  // A resume source is required, but an uploaded document is only one of three:
  // a selected submitted resume or a filled-in master resume works just as well
  // (the interview route injects all three as context).
  const hasOtherResumeSource = selectedSubmittedResumeId !== "" || hasMasterResume;
  const hasResumeSource = resumeIds.length > 0 || hasOtherResumeSource;

  const canStart = title.trim() !== "" && hasResumeSource && persona !== "" && duration !== "";

  function handleReset() {
    setTitle("");
    setJdText("");
    setResumeIds([]);
    setPortfolioIds([]);
    setDuration("");
    setPersona("");
    setReferenceLink("");
    setSelectedSubmittedResumeId("");
  }

  function handleSubmittedResumeSelect(value: string) {
    if (value === DIRECT_INPUT_VALUE) {
      setSelectedSubmittedResumeId("");
      return;
    }
    setSelectedSubmittedResumeId(value);
    const found = submittedResumes.find((r) => r.id === value);
    if (!found) return;
    setTitle(`${found.company_name} ${found.position}`.trim());
    setJdText(found.jd_text);
  }

  function handleOpenChange(next: boolean) {
    if (!next) handleReset();
    onOpenChange(next);
  }

  function handleStart() {
    if (!canStart) return;

    const jdContent = jdText.trim();
    const selectedIds = [...resumeIds, ...portfolioIds];

    startTransition(async () => {
      // 가드: 선택된 모든 문서가 normalize 'done' 상태여야 인터뷰 시작 가능.
      // 미완료(pending/failed) 문서는 서버에서 동기 normalize 후 결과 반환.
      setStage("preparing");
      const ensureResult = await ensureNormalizedAction(selectedIds);

      if (ensureResult.error) {
        toast.error(ensureResult.error);
        setStage("idle");
        return;
      }

      if (ensureResult.failed.length > 0) {
        const failedDocs = documents.filter((d) => ensureResult.failed.includes(d.id));
        const names = failedDocs.map((d) => d.file_name ?? d.id).join(", ");
        toast.error(
          `다음 문서의 AI 분석에 실패했습니다: ${names}. 문서 관리에서 재시도하거나 다른 문서를 선택해주세요.`
        );
        setStage("idle");
        router.refresh();
        return;
      }

      setStage("creating");
      const result = await createInterviewSessionAction({
        title: title.trim(),
        jdText: jdContent,
        persona: persona as "explorer" | "pressure" | "technical",
        durationMinutes: Number(duration),
        resumeIds: selectedIds,
        submittedResumeId: selectedSubmittedResumeId || null,
      });

      if ("error" in result) {
        toast.error(result.error);
        setStage("idle");
        return;
      }

      handleOpenChange(false);
      setStage("idle");
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
            <p className="text-base font-medium">
              {stage === "preparing"
                ? "AI 분석을 마무리하고 있어요..."
                : "면접을 생성하고 있어요..."}
            </p>
            {stage === "preparing" && (
              <p className="text-sm text-muted-foreground">
                최대 1분 정도 걸릴 수 있어요. 잠시만 기다려주세요.
              </p>
            )}
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* Submitted resume — pinned badge (when navigated from submitted resume page) */}
          {initialSubmittedResumeId && prefillJd && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">연동된 이력서</span>
              <Badge variant="secondary">
                {prefillJd.company_name} {prefillJd.position} 제출본
              </Badge>
            </div>
          )}

          {/* Submitted resume select — shown only when not pre-pinned and resumes exist */}
          {!initialSubmittedResumeId && submittedResumes.length > 0 && (
            <section className="space-y-2">
              <label className="text-base font-medium">
                제출용 이력서 불러오기
                <span className="ml-1 text-sm text-muted-foreground font-normal">(선택)</span>
              </label>
              <Select value={selectedSubmittedResumeId} onValueChange={handleSubmittedResumeSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="직접 입력" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DIRECT_INPUT_VALUE}>직접 입력</SelectItem>
                  {submittedResumes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.company_name} {r.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          {/* 0. Title */}
          <section className="space-y-2">
            <label className="text-base font-medium">
              면접 이름
              <span className="ml-1 text-sm text-primary font-normal">*필수</span>
            </label>
            <Input
              placeholder="예) 카카오 프론트엔드 2차 면접"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </section>

          {/* 1. Persona */}
          <section className="space-y-2">
            <label className="text-base font-medium">
              면접관 페르소나
              <span className="ml-1 text-sm text-primary font-normal">*필수</span>
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
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className={cn("text-sm", persona === p.value ? "text-primary/70" : "text-muted-foreground")}>
                    {p.desc}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Duration */}
          <section className="space-y-2">
            <label className="text-base font-medium">
              면접 시간
              <span className="ml-1 text-sm text-primary font-normal">*필수</span>
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
            <label className="text-base font-medium">
              지원 포지션 JD
              <span className="ml-1 text-sm text-muted-foreground font-normal">
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
            <label className="text-base font-medium">
              이력서 / 경력기술서
              {hasOtherResumeSource ? (
                <span className="ml-1 text-sm text-muted-foreground font-normal">(선택)</span>
              ) : (
                <span className="ml-1 text-sm text-primary font-normal">*필수</span>
              )}
            </label>
            {resumes.length === 0 ? (
              <p className="text-base text-muted-foreground py-2">
                {hasOtherResumeSource
                  ? "업로드된 이력서 파일이 없습니다. 마스터·제출용 이력서로 면접을 진행합니다."
                  : "저장된 이력서가 없습니다. 서류 관리에서 마스터 이력서를 작성하거나 파일을 업로드해 주세요."}
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
            <label className="text-base font-medium">
              포트폴리오
              <span className="ml-1 text-sm text-muted-foreground font-normal">
                (선택)
              </span>
            </label>
            {portfolios.length === 0 ? (
              <p className="text-base text-muted-foreground py-2">
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

          {/* 5. Reference link */}
          <section className="space-y-2">
            <label className="text-base font-medium">
              참고 자료
              <span className="ml-1 text-sm text-muted-foreground font-normal">
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
            {isPending
              ? stage === "preparing"
                ? "분석 마무리 중..."
                : "생성 중..."
              : "면접 시작하기"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
