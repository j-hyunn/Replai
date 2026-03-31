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
  return (
    <>
      {/* 종합 평가 */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold">종합 평가</h2>
        <p className="text-xs text-muted-foreground">면접 전반에 대한 평가</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{data.summary}</p>

      <Separator />

      {/* 잘한 점 */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold">잘한 점</h2>
        <p className="text-xs text-muted-foreground">면접 전반에서 돋보인 강점</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{data.strengths}</p>

      <Separator />

      {/* 개선할 점 */}
      <div className="space-y-1">
        <h2 className="text-base font-semibold">개선할 점</h2>
        <p className="text-xs text-muted-foreground">면접 전반에서 보완이 필요한 부분</p>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{data.improvements}</p>

    </>
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

function AnswerPanel({ answer, index }: AnswerPanelProps) {
  const exchanges =
    answer.turns && answer.turns.length > 0
      ? groupTurnsIntoExchanges(answer.turns)
      : null;

  const modelAnswers: (ModelAnswerEntry | null)[] = answer.model_answers ?? [];

  return (
    <>
      {/* Question header */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Q{index + 1}</p>
        <h2 className="text-base font-semibold leading-relaxed">{answer.question}</h2>
      </div>

      {/* Scores + Feedback */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">점수 및 피드백</CardTitle>
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

      {/* Question list + answers (with per-question model answer) */}
      {exchanges ? (
        <div className="space-y-3">
          {exchanges.map((ex, i) => {
            const modelEntry = modelAnswers[i] ?? null;
            return (
              <Card key={i}>
                <CardContent className="p-0">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="answer" className="border-none">
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex flex-col items-start gap-1 text-left">
                          <span className="text-[11px] text-muted-foreground">
                            {i === 0 ? "본 질문" : `꼬리질문 ${i}`}
                          </span>
                          <span className="text-sm font-medium leading-snug">{ex.question}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 space-y-3">
                        {(() => {
                          const rawIntent = modelEntry?.intent ?? (i === 0 ? answer.intent : undefined);
                          if (!rawIntent) return null;
                          const chips = Array.isArray(rawIntent)
                            ? rawIntent
                            : rawIntent.split(/[,·•\n]+/).map((s: string) => s.trim()).filter(Boolean);
                          return chips.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {chips.map((chip: string, ci: number) => (
                                <span key={ci} className="inline-block rounded-full bg-primary/8 border border-primary/20 px-2.5 py-0.5 text-[11px] text-primary/80">
                                  {chip}
                                </span>
                              ))}
                            </div>
                          ) : null;
                        })()}
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
            );
          })}
        </div>
      ) : (
        // Fallback for reports generated before turns were stored
        <Card>
          <CardContent className="p-0">
            <Accordion type="single" collapsible>
              <AccordionItem value="answer" className="border-none">
                <AccordionTrigger className="px-4 py-3 text-sm font-semibold hover:no-underline">
                  내 답변
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-3">
                  <div className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground leading-relaxed">
                    {answer.answer}
                  </div>
                  {modelAnswers[0] && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">모범 답안</p>
                      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                        {modelAnswers[0].model_answer}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      )}
    </>
  );
}
