"use client";

import { useRef, useState, useCallback } from "react";
import { CheckIcon, Loader2Icon, UploadIcon, XIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUploadUrlAction, processUploadedDocumentAction, saveGitLinkAction, deleteDocumentAction, revalidateDocumentsAction } from "@/app/(main)/resume/actions";
import { createClient } from "@/lib/supabase/client";

interface AddDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadStep =
  | { kind: "resume"; file: File; label: string }
  | { kind: "portfolio"; file: File; label: string }
  | { kind: "git"; url: string; label: string };

const KIND_LABEL: Record<UploadStep["kind"], string> = {
  resume: "이력서",
  portfolio: "포트폴리오",
  git: "GitHub",
};

export default function AddDocumentDialog({ open, onOpenChange }: AddDocumentDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadSteps, setUploadSteps] = useState<UploadStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [stepProgress, setStepProgress] = useState<Record<number, number>>({});
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCancelledRef = useRef(false);
  const uploadedDocsRef = useRef<Array<{ id: string; storagePath: string }>>([]);

  const startProgressFor = useCallback((index: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setStepProgress((prev) => ({ ...prev, [index]: 0 }));
    progressIntervalRef.current = setInterval(() => {
      setStepProgress((prev) => {
        const current = prev[index] ?? 0;
        if (current >= 95) return prev;
        const increment = current < 50 ? 1.5 : current < 80 ? 0.7 : 0.2;
        return { ...prev, [index]: Math.min(95, current + increment) };
      });
    }, 400);
  }, []);

  const completeProgressFor = useCallback((index: number) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setStepProgress((prev) => ({ ...prev, [index]: 100 }));
  }, []);

  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const [portfolioFiles, setPortfolioFiles] = useState<File[]>([]);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  const [gitUrls, setGitUrls] = useState<string[]>([""]);

  function handleResumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setResumeFiles((prev) => [...prev, ...files]);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
  }

  function handlePortfolioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPortfolioFiles((prev) => [...prev, ...files]);
    if (portfolioInputRef.current) portfolioInputRef.current.value = "";
  }

  function handleClose() {
    isCancelledRef.current = true;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    // 이미 완료된 업로드 삭제 (이번 iteration 완료분은 루프에서 처리)
    for (const doc of uploadedDocsRef.current) {
      void deleteDocumentAction(doc.id, doc.storagePath);
    }
    uploadedDocsRef.current = [];
    setIsLoading(false);
    setResumeFiles([]);
    setPortfolioFiles([]);
    setGitUrls([""]);
    setUploadSteps([]);
    setCurrentStepIndex(-1);
    setStepProgress({});
    onOpenChange(false);
  }

  async function handleSubmit() {
    const steps: UploadStep[] = [
      ...resumeFiles.map((f) => ({ kind: "resume" as const, file: f, label: f.name })),
      ...portfolioFiles.map((f) => ({ kind: "portfolio" as const, file: f, label: f.name })),
      ...gitUrls
        .filter((u) => u.trim())
        .map((u) => ({ kind: "git" as const, url: u.trim(), label: u.trim() })),
    ];

    isCancelledRef.current = false;
    uploadedDocsRef.current = [];
    setUploadSteps(steps);
    setCurrentStepIndex(0);
    setIsLoading(true);

    const errors: string[] = [];

    for (let i = 0; i < steps.length; i++) {
      if (isCancelledRef.current) break;

      setCurrentStepIndex(i);
      startProgressFor(i);
      const step = steps[i];

      let result;
      if (step.kind === "resume" || step.kind === "portfolio") {
        // 1단계: Presigned URL 발급
        const urlResult = await getUploadUrlAction(
          step.kind,
          step.file.name,
          step.file.size,
          step.file.type
        );
        if (urlResult.error) {
          result = { error: urlResult.error };
        } else {
          // 2단계: Supabase에 직접 업로드 (Vercel 미경유)
          const supabase = createClient();
          const { error: uploadError } = await supabase.storage
            .from("documents")
            .uploadToSignedUrl(urlResult.storagePath!, urlResult.token!, step.file);

          if (uploadError) {
            result = { error: `파일 업로드에 실패했습니다: ${uploadError.message}. 다시 시도해주세요.` };
          } else {
            // 3단계: 파싱 + DB 저장
            result = await processUploadedDocumentAction(
              urlResult.documentId!,
              urlResult.storagePath!,
              step.kind,
              step.file.name,
              { skipRevalidate: true }
            );
          }
        }
      } else {
        result = await saveGitLinkAction(step.url, { skipRevalidate: true });
      }

      // 업로드 완료 후 취소가 들어온 경우 — 방금 생성된 문서 삭제
      if (isCancelledRef.current) {
        if (result.documentId) {
          void deleteDocumentAction(result.documentId, result.storagePath ?? "");
        }
        break;
      }

      if (result.error) {
        errors.push(result.error);
      } else if (result.documentId) {
        uploadedDocsRef.current.push({ id: result.documentId, storagePath: result.storagePath ?? "" });
      }

      completeProgressFor(i);
    }

    if (isCancelledRef.current) return;

    setCurrentStepIndex(steps.length);
    setIsLoading(false);

    // 성공한 파일이 있으면 먼저 저장 확정 (handleClose가 삭제하지 못하도록 초기화 후 revalidate)
    if (uploadedDocsRef.current.length > 0) {
      uploadedDocsRef.current = [];
      await revalidateDocumentsAction();
    }

    if (errors.length > 0) {
      errors.forEach((msg) => toast.error(msg));
    } else {
      toast.success("문서가 추가되었습니다.");
    }
    handleClose();
  }

  const hasContent =
    resumeFiles.length > 0 ||
    portfolioFiles.length > 0 ||
    gitUrls.some((u) => u.trim());

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (isLoading) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>문서 추가</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 rounded-lg bg-background/95 backdrop-blur-sm px-8">
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <XIcon className="size-4" />
              <span className="sr-only">취소</span>
            </button>

            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-muted-foreground tracking-widest uppercase">
                분석 중
              </p>
              <p className="text-lg font-bold">
                {currentStepIndex < uploadSteps.length
                  ? uploadSteps[currentStepIndex]?.label
                  : "완료"}
              </p>
            </div>

            <div className="w-full space-y-2">
              {uploadSteps.map((step, i) => {
                const isDone = i < currentStepIndex;
                const isCurrent = i === currentStepIndex;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all ${
                      isDone
                        ? "bg-primary/15 text-primary"
                        : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone && (
                      <CheckIcon className="size-3 shrink-0" />
                    )}
                    {isCurrent && (
                      <Loader2Icon className="size-3 shrink-0 animate-spin" />
                    )}
                    {!isDone && !isCurrent && (
                      <span className="size-3 shrink-0" />
                    )}
                    <span className="text-[11px] opacity-60 shrink-0">
                      {KIND_LABEL[step.kind]}
                    </span>
                    <span className="flex-1 truncate">{step.label}</span>
                    <span className="shrink-0 tabular-nums opacity-50">
                      {Math.round(stepProgress[i] ?? 0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              문서 분석은 업로드 시 1회만 진행됩니다. 잠시만 기다려주세요.
              <br />창을 닫으면 업로드가 취소됩니다.
            </p>
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* Resume */}
          <section className="space-y-2">
            <div>
              <p className="text-sm font-medium">이력서 / 경력기술서</p>
              <p className="text-xs text-muted-foreground">PDF · 최대 10MB · 여러 파일 선택 가능</p>
            </div>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handleResumeChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => resumeInputRef.current?.click()}
              disabled={isLoading}
            >
              <UploadIcon className="size-3.5" />
              파일 선택
            </Button>
            {resumeFiles.length > 0 && (
              <ul className="space-y-1.5">
                {resumeFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setResumeFiles((prev) => prev.filter((_, j) => j !== i))}
                      disabled={isLoading}
                    >
                      <XIcon className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Portfolio */}
          <section className="space-y-2">
            <div>
              <p className="text-sm font-medium">포트폴리오</p>
              <p className="text-xs text-muted-foreground">PDF · 최대 20MB · 여러 파일 선택 가능</p>
            </div>
            <input
              ref={portfolioInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={handlePortfolioChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => portfolioInputRef.current?.click()}
              disabled={isLoading}
            >
              <UploadIcon className="size-3.5" />
              파일 선택
            </Button>
            {portfolioFiles.length > 0 && (
              <ul className="space-y-1.5">
                {portfolioFiles.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setPortfolioFiles((prev) => prev.filter((_, j) => j !== i))}
                      disabled={isLoading}
                    >
                      <XIcon className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* GitHub */}
          <section className="space-y-2">
            <div>
              <p className="text-sm font-medium">GitHub</p>
              <p className="text-xs text-muted-foreground">GitHub 레포지토리 링크</p>
            </div>
            <div className="space-y-2">
              {gitUrls.map((url, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://github.com/username/repo"
                    value={url}
                    disabled={isLoading}
                    onChange={(e) =>
                      setGitUrls((prev) => prev.map((u, j) => (j === i ? e.target.value : u)))
                    }
                  />
                  {gitUrls.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isLoading}
                      onClick={() => setGitUrls((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                disabled={isLoading}
                onClick={() => setGitUrls((prev) => [...prev, ""])}
              >
                <PlusIcon className="size-3.5" />
                링크 추가
              </Button>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!hasContent || isLoading}>
            {isLoading ? "업로드 중..." : "업로드"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
