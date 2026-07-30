import type { QuestionEvaluationResult } from "@/lib/prompts/evaluation";

// Hint penalty: each score is capped server-side. The prompt asks the LLM to
// respect it too, but the server enforces it unconditionally so the cap is not
// at the mercy of LLM consistency.
export const HINT_SCORE_CAP = 30;

export type AnswerStatus = "answered" | "hint_shown" | "skipped" | "failed";

export interface AnswerFinal extends QuestionEvaluationResult {
  status: AnswerStatus;
}

function averageOf(scores: QuestionEvaluationResult["scores"]): number {
  return Math.round((scores.logic + scores.specificity + scores.job_fit) / 3);
}

export interface BuildSkippedInput {
  question_id: string;
  question: string;
  // Produced by the skipped-question model-answer call. Omitted when that
  // call was not made or failed — the record still ships, just without the
  // reference answer.
  intent?: string[];
  model_answers?: QuestionEvaluationResult["model_answers"];
}

// Skipped questions get deterministic scores and feedback: there is no answer
// to judge, so nothing here is left to the LLM. Only the reference answer is
// generated, and its absence never blocks the record.
export function buildSkippedAnswer(input: BuildSkippedInput): AnswerFinal {
  const intent = input.intent && input.intent.length > 0 ? input.intent : ["건너뜀"];
  const modelAnswers =
    input.model_answers && input.model_answers.length > 0
      ? input.model_answers
      : [
          {
            question: input.question,
            model_answer:
              "이 질문은 건너뛰어 모범 답안이 생성되지 않았습니다. 다음 면접에서는 짧게라도 답변해 보세요.",
          },
        ];

  return {
    question_id: input.question_id,
    question: input.question,
    answer: "건너뛴 질문입니다.",
    scores: { logic: 0, specificity: 0, job_fit: 0 },
    average: 0,
    intent,
    feedback: "건너뛴 질문입니다. 종합 점수 계산에서 제외되었습니다.",
    model_answers: modelAnswers,
    status: "skipped",
  };
}

// Apply the hint cap and the deterministic average to an LLM-produced answer.
// The LLM is asked to score within the cap, but if it ignores the instruction
// we silently clip — that is the whole point of doing this server-side.
export function applyHintCap(answer: QuestionEvaluationResult): AnswerFinal {
  const capped = {
    logic: Math.min(answer.scores.logic, HINT_SCORE_CAP),
    specificity: Math.min(answer.scores.specificity, HINT_SCORE_CAP),
    job_fit: Math.min(answer.scores.job_fit, HINT_SCORE_CAP),
  };
  const exceeded = Object.values(answer.scores).some((v) => v > HINT_SCORE_CAP);
  if (exceeded) {
    console.warn("[applyHintCap] LLM exceeded hint cap — prompt drift?", {
      question_id: answer.question_id,
      original: answer.scores,
      capped,
    });
  }
  return {
    ...answer,
    scores: capped,
    average: averageOf(capped),
    answer: answer.answer || "모범 답안을 참조하여 작성한 답변입니다.",
    feedback: ensurePrefix(
      answer.feedback,
      `모범 답안을 참조했기 때문에 점수가 최대 ${HINT_SCORE_CAP}점으로 제한되었습니다.`,
    ),
    status: "hint_shown",
  };
}

// A normal answer: trust LLM scores, but still re-compute `average` so it
// always equals the mean of the three component scores. LLM-reported averages
// drift from the arithmetic mean by a few points often enough to matter.
export function applyAnsweredOverrides(answer: QuestionEvaluationResult): AnswerFinal {
  return { ...answer, average: averageOf(answer.scores), status: "answered" };
}

export interface BuildFailedInput {
  question_id: string;
  question: string;
}

// A question whose evaluation exhausted every retry. Returned instead of
// thrown so one bad answer never wipes out the whole report.
export function buildFailedAnswer(input: BuildFailedInput): AnswerFinal {
  return {
    question_id: input.question_id,
    question: input.question,
    answer: "이 답변 평가에 실패했습니다.",
    scores: { logic: 0, specificity: 0, job_fit: 0 },
    average: 0,
    intent: ["평가 실패"],
    feedback:
      "이 질문의 평가에 실패해 점수를 산출하지 못했습니다. 종합 점수 계산에서 제외되었습니다. 리포트를 다시 생성하면 재평가됩니다.",
    model_answers: [],
    status: "failed",
  };
}

// total_score = mean of `average` across answers that are neither skipped nor
// failed. Skipped answers are excluded so they don't drag the score down, and
// failed ones so a transient evaluation error doesn't penalize the user.
// If every answer is skipped or failed, total_score is 0.
export function computeTotalScore(answers: ReadonlyArray<AnswerFinal>): number {
  const eligible = answers.filter((a) => a.status !== "skipped" && a.status !== "failed");
  if (eligible.length === 0) return 0;
  const sum = eligible.reduce((acc, a) => acc + a.average, 0);
  return Math.round(sum / eligible.length);
}

// Counts used by the summary prompt so the LLM can mention skip/hint usage
// without having to infer it from the per-answer text.
export function countByStatus(answers: ReadonlyArray<AnswerFinal>): {
  total: number;
  responded: number;
  hinted: number;
  skipped: number;
  failed: number;
} {
  let responded = 0;
  let hinted = 0;
  let skipped = 0;
  let failed = 0;
  for (const a of answers) {
    if (a.status === "skipped") skipped++;
    else if (a.status === "failed") failed++;
    else if (a.status === "hint_shown") {
      hinted++;
      responded++;
    } else responded++;
  }
  return { total: answers.length, responded, hinted, skipped, failed };
}

function ensurePrefix(text: string, prefix: string): string {
  if (!text) return prefix;
  if (text.startsWith(prefix)) return text;
  return `${prefix} ${text}`;
}
