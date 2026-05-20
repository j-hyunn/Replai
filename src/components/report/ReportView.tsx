"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ReportJson,
  QaTurn,
  ModelAnswerEntry,
  AnswerReport,
  AnswerStatus,
} from "@/lib/supabase/queries/reports";

const SCORE_LABELS: Record<string, string> = {
  logic: "논리성",
  specificity: "구체성",
  job_fit: "직무 적합성",
};

type MenuId =
  | "summary"
  | `answer-${string}`;

interface MenuItem {
  id: MenuId;
  label: string;
  group: string;
}

function ScoreBadge({ score }: { score: number }) {
  const variant =
    score >= 80 ? "default" : score >= 60 ? "secondary" : "outline";
  return <Badge variant={variant}>{score}점</Badge>;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
        {score}
      </span>
    </div>
  );
}

interface ReportViewProps {
  data: ReportJson;
  createdAt: string;
  sessionId: string;
}

export default function ReportView({ data, createdAt, sessionId }: ReportViewProps) {
  const [activeId, setActiveId] = useState<MenuId>("summary");

  const menuItems: MenuItem[] = [
    { id: "summary", label: "종합 평가", group: "면접 피드백" },
    ...data.answers.map((a, i) => ({
      id: `answer-${a.question_id}` as MenuId,
      label: `Q${i + 1}. ${a.question.length > 22 ? a.question.slice(0, 22) + "…" : a.question}`,
      group: "문항별 피드백",
    })),
  ];

  const groups = ["면접 피드백", "문항별 피드백"];

  // Counts come from the server; fall back to a UI-side recompute for
  // older reports that predate the counts field so the tooltip still
  // shows useful text.
  const counts = data.counts ?? deriveCounts(data.answers);
  const scoreContext =
    counts.skipped > 0 || counts.failed > 0
      ? `응답 ${counts.responded}개 평균 (전체 ${counts.total}개)`
      : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex w-full gap-3 h-full">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 rounded-xl border bg-card overflow-y-auto">
          <div className="p-3 space-y-4">
            {/* Score badge in sidebar top */}
            <div className="flex items-center justify-between px-1 pt-1">
              <span className="text-xs text-muted-foreground">
                {new Date(createdAt).toLocaleDateString("ko-KR", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
              {scoreContext ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-lg font-bold tabular-nums text-primary cursor-help"
                      aria-label={scoreContext}
                    >
                      {data.total_score}
                      <span className="text-xs font-normal text-muted-foreground ml-0.5">/100</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{scoreContext}</TooltipContent>
                </Tooltip>
              ) : (
                <span className="text-lg font-bold tabular-nums text-primary">
                  {data.total_score}
                  <span className="text-xs font-normal text-muted-foreground ml-0.5">/100</span>
                </span>
              )}
            </div>

            <Separator />

            {groups.map((group) => {
              const items = menuItems.filter((m) => m.group === group);
              return (
                <div key={group} className="space-y-0.5">
                  <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </p>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveId(item.id)}
                      className={cn(
                        "w-full text-left rounded-lg px-2 py-1.5 text-sm transition-colors",
                        activeId === item.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 rounded-xl border bg-card overflow-y-auto">
          <div className="p-6 max-w-2xl mx-auto space-y-5">
            {activeId === "summary" && (
              <SummaryPanel data={data} scoreContext={scoreContext} />
            )}
            {activeId.startsWith("answer-") && (
              <AnswerPanel
                answer={data.answers.find(
                  (a) => `answer-${a.question_id}` === activeId
                )!}
                index={data.answers.findIndex(
                  (a) => `answer-${a.question_id}` === activeId
                )}
                sessionId={sessionId}
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function deriveCounts(answers: ReadonlyArray<AnswerReport>): {
  total: number;
  responded: number;
  skipped: number;
  failed: number;
} {
  let skipped = 0;
  let failed = 0;
  for (const a of answers) {
    if (a.status === "skipped") skipped++;
    else if (a.status === "failed") failed++;
  }
  return {
    total: answers.length,
    responded: answers.length - skipped - failed,
    skipped,
    failed,
  };
}

function SummaryPanel({
  data,
  scoreContext,
}: {
  data: ReportJson;
  scoreContext: string | null;
}) {
  const eligible = data.answers.filter(
    (a) => a.status !== "skipped" && a.status !== "failed",
  );
  const denom = eligible.length > 0 ? eligible.length : 1;
  const avgScores =
    eligible.length > 0
      ? {
          logic: Math.round(
            eligible.reduce((s, a) => s + a.scores.logic, 0) / denom,
          ),
          specificity: Math.round(
            eligible.reduce((s, a) => s + a.scores.specificity, 0) / denom,
          ),
          job_fit: Math.round(
            eligible.reduce((s, a) => s + a.scores.job_fit, 0) / denom,
          ),
        }
      : null;

  return (
    <div className="space-y-4">
      {/* 점수 히어로 */}
      <div className="flex items-center gap-6 rounded-xl bg-muted/50 px-5 py-4">
        <div className="flex shrink-0 flex-col items-center justify-center">
          <div className="flex h-[72px] w-[72px] flex-col items-center justify-center rounded-full border-2 border-border">
            <span className="text-2xl font-semibold tabular-nums leading-none">
              {data.total_score}
            </span>
            <span className="mt-0.5 text-[11px] text-muted-foreground">/100</span>
          </div>
          {scoreContext && (
            <p className="mt-1.5 text-[10px] text-muted-foreground text-center max-w-[72px] leading-tight">
              {scoreContext}
            </p>
          )}
        </div>
        {avgScores && (
          <div className="flex flex-1 flex-col gap-2">
            {(["logic", "specificity", "job_fit"] as const).map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{SCORE_LABELS[key]}</span>
                <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-border">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{ width: `${avgScores[key]}%` }}
                  />
                </div>
                <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">{avgScores[key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 종합 평가 */}
      <div className="rounded-xl border px-5 py-4 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">종합 평가</p>
        <p className="text-sm leading-relaxed">{data.summary}</p>
      </div>

      {/* 잘한 점 */}
      <div className="rounded-xl bg-green-50 dark:bg-green-950/30 px-5 py-4 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-green-700 dark:text-green-400">잘한 점</p>
        <p className="text-sm leading-relaxed text-green-900 dark:text-green-100">{data.strengths}</p>
        {data.strength_keywords && data.strength_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.strength_keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-green-200 px-2.5 py-0.5 text-xs text-green-800 dark:bg-green-800 dark:text-green-100"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 개선할 점 */}
      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-5 py-4 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">개선할 점</p>
        <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">{data.improvements}</p>
        {data.improvement_keywords && data.improvement_keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.improvement_keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-amber-200 px-2.5 py-0.5 text-xs text-amber-800 dark:bg-amber-800 dark:text-amber-100"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface AnswerPanelProps {
  answer: AnswerReport;
  index: number;
  sessionId: string;
}

// Pairs consecutive interviewer→user turns into exchanges.
function groupTurnsIntoExchanges(turns: QaTurn[]): Array<{ question: string; answer: string }> {
  const exchanges: Array<{ question: string; answer: string }> = [];
  let i = 0;
  while (i < turns.length) {
    if (turns[i].speaker === "interviewer") {
      const question = turns[i].content;
      const answer = turns[i + 1]?.speaker === "user" ? turns[i + 1].content : "";
      exchanges.push({ question, answer });
      i += answer ? 2 : 1;
    } else {
      i++;
    }
  }
  return exchanges;
}

// intent 배열을 chip 배열로 정규화하는 헬퍼
function normalizeIntentChips(
  intent: string | string[] | undefined
): string[] {
  if (!intent) return [];
  if (Array.isArray(intent)) return intent.filter(Boolean);
  return intent.split(/[,·•\n]+/).map((s) => s.trim()).filter(Boolean);
}

function AnswerPanel({ answer, index, sessionId }: AnswerPanelProps) {
  const exchanges =
    answer.turns && answer.turns.length > 0
      ? groupTurnsIntoExchanges(answer.turns)
      : null;

  const modelAnswers: (ModelAnswerEntry | null)[] = answer.model_answers ?? [];

  // exchanges[0] = 본질문, exchanges[1..] = 꼬리질문
  const mainExchange = exchanges?.[0] ?? null;
  const followUps = exchanges ? exchanges.slice(1) : [];
  const mainModel = modelAnswers[0] ?? null;
  const status: AnswerStatus = answer.status ?? "answered";

  const mainIntentChips = normalizeIntentChips(
    mainModel?.intent ?? answer.intent
  );

  return (
    <div className="space-y-4">
      {/* 본질문 — 타이틀 + intent chips + 내 답변 아코디언 */}
      <div>
        <div className="mb-2 space-y-1.5">
          <p className="text-xs text-muted-foreground">Q{index + 1}</p>
          <h2 className="text-base font-semibold leading-relaxed">{answer.question}</h2>
          {mainIntentChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {mainIntentChips.map((chip, ci) => (
                <span
                  key={ci}
                  className="inline-block rounded-full bg-primary/8 border border-primary/20 px-2.5 py-0.5 text-[11px] text-primary/80"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
        <Card>
          <CardContent className="p-0">
            <Accordion type="single" collapsible>
              <AccordionItem value="main" className="border-none">
                <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                  내 답변 / 모범 답변 보기
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                  <AnswerBody
                    status={status}
                    fallbackAnswer={mainExchange?.answer ?? answer.answer ?? ""}
                  />
                  {mainModel && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">모범 답안</p>
                      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                        {mainModel.model_answer}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      {/* 피드백 카드 / 스킵 안내 / 실패 placeholder */}
      <FeedbackBlock answer={answer} status={status} sessionId={sessionId} />

      {/* 꼬리질문 목록 */}
      {followUps.length > 0 && (
        <div className="space-y-3">
          {followUps.map((ex, i) => {
            const modelEntry = modelAnswers[i + 1] ?? null;
            const followUpChips = normalizeIntentChips(modelEntry?.intent);
            return (
              <div key={i}>
                <div className="mb-2 space-y-1.5">
                  <p className="text-xs text-muted-foreground">꼬리질문 {i + 1}</p>
                  <p className="text-sm font-medium leading-snug">{ex.question}</p>
                  {followUpChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {followUpChips.map((chip, ci) => (
                        <span
                          key={ci}
                          className="inline-block rounded-full bg-primary/8 border border-primary/20 px-2.5 py-0.5 text-[11px] text-primary/80"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <Card>
                  <CardContent className="p-0">
                    <Accordion type="single" collapsible>
                      <AccordionItem value={`followup-${i}`} className="border-none">
                        <AccordionTrigger className="px-4 py-3 text-sm hover:no-underline">
                          내 답변 / 모범 답변 보기
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4 space-y-3">
                          {ex.answer ? (
                            <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                              {ex.answer}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">답변 없음</p>
                          )}
                          {modelEntry && (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-semibold text-muted-foreground">모범 답안</p>
                              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                                {modelEntry.model_answer}
                              </div>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnswerBody({
  status,
  fallbackAnswer,
}: {
  status: AnswerStatus;
  fallbackAnswer: string;
}) {
  if (status === "skipped") {
    // The body of a skipped answer is rendered by the FeedbackBlock as a
    // dashed muted card; here in the accordion we just acknowledge.
    return (
      <p className="text-sm text-muted-foreground italic">
        건너뛴 질문입니다 — 답변이 제출되지 않았습니다.
      </p>
    );
  }
  if (status === "hint_shown") {
    return (
      <div className="space-y-2">
        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
          모범 답안 참조
        </span>
        <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
          {fallbackAnswer || "모범 답안을 참조하여 작성한 답변입니다."}
        </div>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <p className="text-sm text-muted-foreground italic">
        이 답변의 평가에 실패했습니다. 아래 재평가 버튼을 눌러 다시 시도해주세요.
      </p>
    );
  }
  if (!fallbackAnswer) {
    return <p className="text-sm text-muted-foreground italic">답변 없음</p>;
  }
  return (
    <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
      {fallbackAnswer}
    </div>
  );
}

function FeedbackBlock({
  answer,
  status,
  sessionId,
}: {
  answer: AnswerReport;
  status: AnswerStatus;
  sessionId: string;
}) {
  if (status === "skipped") {
    return (
      <div className="rounded-xl border border-dashed bg-muted/40 px-5 py-4">
        <p className="text-sm text-muted-foreground">
          건너뛴 질문입니다. 종합 점수 계산에서 제외되었습니다.
        </p>
      </div>
    );
  }
  if (status === "failed") {
    return <ReevaluateBlock sessionId={sessionId} questionId={answer.question_id} />;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">피드백</CardTitle>
          <ScoreBadge score={answer.average} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {(["logic", "specificity", "job_fit"] as const).map((key) => (
            <div key={key} className="grid grid-cols-[5rem_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">{SCORE_LABELS[key]}</span>
              <ScoreBar score={answer.scores[key]} />
            </div>
          ))}
        </div>
        <Separator />
        <p className="text-sm leading-relaxed">{answer.feedback}</p>
      </CardContent>
    </Card>
  );
}

function ReevaluateBlock({
  sessionId,
  questionId,
}: {
  sessionId: string;
  questionId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReevaluate() {
    setIsPending(true);
    setError(null);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "reevaluate", sessionId, questionId }),
      });
      if (!res.ok) throw new Error("재평가 실패");
      router.refresh();
    } catch {
      setError("재평가 실패. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-destructive/30 bg-destructive/5 px-5 py-4 space-y-3">
      <p className="text-sm text-destructive">
        이 답변 평가에 실패했습니다.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleReevaluate}
      >
        {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        이 답변 재평가하기
      </Button>
      {error && (
        <p className="text-xs text-destructive/80">{error}</p>
      )}
    </div>
  );
}
