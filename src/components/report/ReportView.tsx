"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { ReportJson, QaTurn, ModelAnswerEntry } from "@/lib/supabase/queries/reports";

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
}

export default function ReportView({ data, createdAt }: ReportViewProps) {
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

  return (
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
            <span className="text-lg font-bold tabular-nums text-primary">
              {data.total_score}
              <span className="text-xs font-normal text-muted-foreground ml-0.5">/100</span>
            </span>
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
          {activeId === "summary" && <SummaryPanel data={data} />}
          {activeId.startsWith("answer-") && (
            <AnswerPanel
              answer={data.answers.find(
                (a) => `answer-${a.question_id}` === activeId
              )!}
              index={data.answers.findIndex(
                (a) => `answer-${a.question_id}` === activeId
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ data }: { data: ReportJson }) {
  const avgScores = data.answers.length > 0
    ? {
      logic: Math.round(data.answers.reduce((s, a) => s + a.scores.logic, 0) / data.answers.length),
      specificity: Math.round(data.answers.reduce((s, a) => s + a.scores.specificity, 0) / data.answers.length),
      job_fit: Math.round(data.answers.reduce((s, a) => s + a.scores.job_fit, 0) / data.answers.length),
    }
    : null;

  return (
    <div className="space-y-4">
      {/* 점수 히어로 */}
      <div className="flex items-center gap-6 rounded-xl bg-muted/50 px-5 py-4">
        <div className="flex h-[72px] w-[72px] shrink-0 flex-col items-center justify-center rounded-full border-2 border-border">
          <span className="text-2xl font-semibold tabular-nums leading-none">{data.total_score}</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">/100</span>
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
  answer: ReportJson["answers"][number];
  index: number;
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

function AnswerPanel({ answer, index }: AnswerPanelProps) {
  const exchanges =
    answer.turns && answer.turns.length > 0
      ? groupTurnsIntoExchanges(answer.turns)
      : null;

  const modelAnswers: (ModelAnswerEntry | null)[] = answer.model_answers ?? [];

  // exchanges[0] = 본질문, exchanges[1..] = 꼬리질문
  const mainExchange = exchanges?.[0] ?? null;
  const followUps = exchanges ? exchanges.slice(1) : [];
  const mainModel = modelAnswers[0] ?? null;

  // 본질문 intent: model_answers[0].intent 우선, 없으면 answer.intent 폴백
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
                  {mainExchange?.answer ? (
                    <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                      {mainExchange.answer}
                    </div>
                  ) : answer.answer ? (
                    <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                      {answer.answer}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">답변 없음</p>
                  )}
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

      {/* 피드백 카드 */}
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
