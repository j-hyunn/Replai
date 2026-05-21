import type { AnswerEvaluationOutput } from "./schema";

// Hint penalty: each score is capped at 30 server-side. The prompt asks
// the LLM to respect it too, but the server enforces it unconditionally
// so the cap is not at the mercy of LLM consistency.
export const HINT_SCORE_CAP = 30;

export type AnswerStatus = "answered" | "hint_shown" | "skipped" | "failed";

export interface AnswerFinal extends AnswerEvaluationOutput {
  status: AnswerStatus;
}

export interface BuildSkippedInput {
  question_id: string;
  question: string;
  intent?: string[];
  model_answers?: AnswerEvaluationOutput["model_answers"];
}

// Skipped questions get a fully deterministic shape: zero scores, fixed
// answer text, fixed feedback. The model_answers can still be provided
// (generated separately for learning value) — if absent, we ship a
// placeholder so the schema invariant `model_answers.length >= 1` holds.
export function buildSkippedAnswer(input: BuildSkippedInput): AnswerFinal {
  const placeholderIntent = input.intent && input.intent.length > 0
    ? input.intent
    : ["건너뜀"];
  const modelAnswers = input.model_answers && input.model_answers.length > 0
    ? input.model_answers
    : [
        {
          question: input.question,
          intent: placeholderIntent,
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
    intent: placeholderIntent,
    feedback: "건너뛴 질문입니다. 종합 점수 계산에서 제외되었습니다.",
    model_answers: modelAnswers,
    status: "skipped",
  };
}

// Apply the hint cap and the deterministic average to an LLM-produced
// answer. The LLM is asked to score within the cap, but if it ignores
// the instruction we silently clip — that is the whole point of doing
// this server-side.
export function applyHintCap(answer: AnswerEvaluationOutput): AnswerFinal {
  const capped = {
    logic: Math.min(answer.scores.logic, HINT_SCORE_CAP),
    specificity: Math.min(answer.scores.specificity, HINT_SCORE_CAP),
    job_fit: Math.min(answer.scores.job_fit, HINT_SCORE_CAP),
  };
  const exceeded = Object.entries(answer.scores).filter(
    ([, v]) => v > HINT_SCORE_CAP,
  );
  if (exceeded.length > 0) {
    console.warn("[applyHintCap] LLM exceeded hint cap — prompt drift?", {
      question_id: answer.question_id,
      original: answer.scores,
      capped,
    });
  }
  const average = Math.round(
    (capped.logic + capped.specificity + capped.job_fit) / 3,
  );
  return {
    ...answer,
    scores: capped,
    average,
    answer:
      answer.answer && answer.answer.length > 0
        ? answer.answer
        : "모범 답안을 참조하여 작성한 답변입니다.",
    feedback: ensurePrefix(
      answer.feedback,
      "모범 답안을 참조했기 때문에 점수가 최대 30점으로 제한되었습니다.",
    ),
    status: "hint_shown",
  };
}

// A normal answer: trust LLM scores, but still re-compute `average` so
// it always equals the mean of the three component scores. Several
// observed LLM outputs had `average` drifting by 1-3 points from the
// arithmetic mean. The server is the source of truth for arithmetic.
export function applyAnsweredOverrides(answer: AnswerEvaluationOutput): AnswerFinal {
  const average = Math.round(
    (answer.scores.logic + answer.scores.specificity + answer.scores.job_fit) / 3,
  );
  return { ...answer, average, status: "answered" };
}

export interface BuildFailedInput {
  question_id: string;
  question: string;
}

export function buildFailedAnswer(input: BuildFailedInput): AnswerFinal {
  return {
    question_id: input.question_id,
    question: input.question,
    answer: "이 답변 평가에 실패했습니다.",
    scores: { logic: 0, specificity: 0, job_fit: 0 },
    average: 0,
    intent: ["평가 실패"],
    feedback: "평가에 실패했습니다. 다시 시도해주세요.",
    model_answers: [
      {
        question: input.question,
        intent: ["평가 실패"],
        model_answer:
          "이 답변에 대한 모범 답안은 평가가 다시 성공하면 생성됩니다. 잠시 후 재평가를 시도해주세요.",
      },
    ],
    status: "failed",
  };
}

// total_score = mean of average across answers that are NOT skipped and
// NOT failed. Skipped answers explicitly excluded so they don't drag
// down the user's score (see Tension #4 decision). Failed answers also
// excluded so a transient evaluation failure doesn't penalize the user.
// If every answer is skipped or failed, total_score is 0.
export function computeTotalScore(answers: ReadonlyArray<AnswerFinal>): number {
  const eligible = answers.filter(
    (a) => a.status !== "skipped" && a.status !== "failed",
  );
  if (eligible.length === 0) return 0;
  const sum = eligible.reduce((acc, a) => acc + a.average, 0);
  return Math.round(sum / eligible.length);
}

// Find question_ids that should have been evaluated but are missing from
// the LLM output. Used to drive the targeted re-call loop.
export function findMissingQuestionIds(
  expected: ReadonlyArray<string>,
  received: ReadonlyArray<{ question_id: string }>,
): string[] {
  const have = new Set(received.map((r) => r.question_id));
  return expected.filter((id) => !have.has(id));
}

// Count helper used by the UI to render "응답 N개 평균 (전체 M개)".
export function countByStatus(answers: ReadonlyArray<AnswerFinal>): {
  total: number;
  responded: number;
  skipped: number;
  failed: number;
} {
  let responded = 0;
  let skipped = 0;
  let failed = 0;
  for (const a of answers) {
    if (a.status === "skipped") skipped++;
    else if (a.status === "failed") failed++;
    else responded++;
  }
  return { total: answers.length, responded, skipped, failed };
}

function ensurePrefix(text: string, prefix: string): string {
  if (!text) return prefix;
  if (text.startsWith(prefix)) return text;
  return `${prefix} ${text}`;
}
