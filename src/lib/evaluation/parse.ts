import type {
  QuestionEvaluationResult,
  SkippedModelAnswerResult,
} from "@/lib/prompts/evaluation";

// Runtime validation for LLM evaluation output. The model is asked for a
// fixed JSON shape but occasionally omits fields or returns strings where
// numbers belong. Without this guard a malformed response becomes `undefined`
// deep inside the report and only surfaces as a blank card in the UI.

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

export class InvalidEvaluationError extends Error {
  constructor(reason: string) {
    super(`Evaluation output failed validation: ${reason}`);
    this.name = "InvalidEvaluationError";
  }
}

// Throws InvalidEvaluationError so the caller's retry loop treats a malformed
// response the same as a network failure — worth another attempt.
export function parseQuestionEvaluation(
  raw: unknown,
  expectedQuestionId: string,
): QuestionEvaluationResult {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidEvaluationError("response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const scores = r.scores as Record<string, unknown> | undefined;
  if (
    typeof scores !== "object" ||
    scores === null ||
    !isScore(scores.logic) ||
    !isScore(scores.specificity) ||
    !isScore(scores.job_fit)
  ) {
    throw new InvalidEvaluationError("scores missing or out of the 0-100 range");
  }

  if (typeof r.feedback !== "string" || r.feedback.length === 0) {
    throw new InvalidEvaluationError("feedback missing");
  }

  const modelAnswers = Array.isArray(r.model_answers)
    ? r.model_answers.filter(
        (m): m is { question: string; model_answer: string } =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as Record<string, unknown>).question === "string" &&
          typeof (m as Record<string, unknown>).model_answer === "string",
      )
    : [];

  // The LLM sometimes echoes a different question_id than the one it was
  // given. The server's id is authoritative — otherwise the answer would be
  // orphaned from its QaGroup during assembly.
  return {
    question_id: expectedQuestionId,
    question: typeof r.question === "string" ? r.question : "",
    answer: typeof r.answer === "string" ? r.answer : "",
    scores: {
      logic: Math.round(scores.logic),
      specificity: Math.round(scores.specificity),
      job_fit: Math.round(scores.job_fit),
    },
    // Recomputed server-side in postprocess; any value here is provisional.
    average: typeof r.average === "number" ? Math.round(r.average) : 0,
    intent: isStringArray(r.intent) ? r.intent : [],
    feedback: r.feedback,
    model_answers: modelAnswers,
  };
}

// The skipped-question prompt returns only intent + one model answer, so it
// gets its own narrower guard rather than reusing the scored one.
export function parseSkippedModelAnswer(raw: unknown): SkippedModelAnswerResult {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidEvaluationError("response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const modelAnswers = Array.isArray(r.model_answers)
    ? r.model_answers.filter(
        (m): m is { question: string; model_answer: string } =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as Record<string, unknown>).question === "string" &&
          typeof (m as Record<string, unknown>).model_answer === "string" &&
          (m as Record<string, unknown>).model_answer !== "",
      )
    : [];

  if (modelAnswers.length === 0) {
    throw new InvalidEvaluationError("no usable model_answers returned");
  }

  return {
    intent: isStringArray(r.intent) ? r.intent : [],
    model_answers: modelAnswers,
  };
}

export interface SummaryEvaluationParsed {
  summary: string;
  strengths: string;
  strength_keywords: string[];
  improvements: string;
  improvement_keywords: string[];
}

export function parseSummaryEvaluation(raw: unknown): SummaryEvaluationParsed {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidEvaluationError("response is not an object");
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.summary !== "string" || r.summary.length === 0) {
    throw new InvalidEvaluationError("summary missing");
  }

  return {
    summary: r.summary,
    strengths: typeof r.strengths === "string" ? r.strengths : "",
    strength_keywords: isStringArray(r.strength_keywords) ? r.strength_keywords : [],
    improvements: typeof r.improvements === "string" ? r.improvements : "",
    improvement_keywords: isStringArray(r.improvement_keywords) ? r.improvement_keywords : [],
  };
}
