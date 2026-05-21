import pLimit from "p-limit";
import { z } from "zod";
import {
  AnswerEvaluationSchema,
  SummaryEvaluationSchema,
  answerResponseSchema,
  summaryResponseSchema,
  type AnswerEvaluationOutput,
  type SummaryEvaluationOutput,
} from "./schema";
import {
  applyAnsweredOverrides,
  applyHintCap,
  buildFailedAnswer,
  buildSkippedAnswer,
  type AnswerFinal,
} from "./postprocess";
import {
  assertNoLegacyMarkers,
  buildAnswerEvaluationPrompt,
  buildSkippedModelAnswerPrompt,
  buildSummaryEvaluationPrompt,
  type QaGroup,
} from "@/lib/prompts/evaluation";
import type { AnalysisOutput } from "@/lib/prompts/analysis";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 250;
const GEMINI_TIMEOUT_MS = 8_000;
const EVAL_CONCURRENCY = 4;

export class EvaluationFailedError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EvaluationFailedError";
  }
}

// Lightweight fetch indirection so tests can override the network layer
// without pulling in a heavier mocking framework. Production code reads
// global.fetch from this module.
export type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);

export function setFetchForTests(impl: FetchLike): void {
  fetchImpl = impl;
}

export function resetFetchForTests(): void {
  fetchImpl = (...args) => fetch(...args);
}

interface GeminiCallInput {
  prompt: string;
  apiKey: string;
  model: string;
  responseSchema?: Record<string, unknown>;
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

async function callGemini(input: GeminiCallInput): Promise<string> {
  const { prompt, apiKey, model, responseSchema } = input;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      ...(responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema,
          }
        : {}),
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as GeminiResponseBody;
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) {
    const blocked = json.promptFeedback?.blockReason;
    throw new Error(
      blocked ? `Gemini blocked the response: ${blocked}` : "Gemini returned an empty response",
    );
  }
  return text;
}

function extractJson(raw: string): string {
  // Gemini sometimes wraps JSON in markdown fences even when asked not to.
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1].trim() : raw.trim();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// One call attempt = (structured -> fallback raw). The whole attempt
// counts as one retry slot. A failure here triggers the retry loop in
// `callWithRetry`.
async function callOnceWithFallback<T>(
  prompt: string,
  apiKey: string,
  model: string,
  responseSchema: Record<string, unknown>,
  schema: z.ZodSchema<T>,
): Promise<T> {
  assertNoLegacyMarkers(prompt);

  // 1. structured output
  try {
    const text = await callGemini({ prompt, apiKey, model, responseSchema });
    const parsed = JSON.parse(extractJson(text));
    return schema.parse(parsed);
  } catch (structuredErr) {
    // 2. raw fallback (no responseSchema; still expects JSON via prompt)
    try {
      const text = await callGemini({ prompt, apiKey, model });
      const parsed = JSON.parse(extractJson(text));
      return schema.parse(parsed);
    } catch (rawErr) {
      const detail =
        structuredErr instanceof Error ? structuredErr.message : String(structuredErr);
      const fallbackDetail = rawErr instanceof Error ? rawErr.message : String(rawErr);
      throw new Error(
        `Evaluation call failed. structured=${detail} | raw=${fallbackDetail}`,
      );
    }
  }
}

async function callWithRetry<T>(
  prompt: string,
  apiKey: string,
  model: string,
  responseSchema: Record<string, unknown>,
  schema: z.ZodSchema<T>,
): Promise<T> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await callOnceWithFallback(prompt, apiKey, model, responseSchema, schema);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_MS * attempt);
      }
    }
  }
  throw new EvaluationFailedError(
    `Evaluation failed after ${MAX_ATTEMPTS} attempts`,
    lastErr,
  );
}

export interface EvaluateAnswerInput {
  qaGroup: QaGroup;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
  apiKey: string;
  model: string;
}

// Evaluate a single question. Branches on the QaGroup flags:
//  - skipped:  call only the model-answer prompt, fill scores deterministically
//  - hint_shown:  call full evaluation, then cap scores at 30 server-side
//  - normal:  call full evaluation, recompute average server-side
// On unrecoverable failure the function does NOT throw — it returns a
// `failed` AnswerFinal that the UI can render as a "재평가" placeholder.
export async function evaluateAnswer(input: EvaluateAnswerInput): Promise<AnswerFinal> {
  const { qaGroup, analysisJson, resumeTexts, apiKey, model } = input;

  if (qaGroup.skipped) {
    try {
      const prompt = buildSkippedModelAnswerPrompt({ qaGroup, analysisJson, resumeTexts });
      const raw = await callWithRetry(
        prompt,
        apiKey,
        model,
        answerResponseSchema,
        AnswerEvaluationSchema,
      );
      return buildSkippedAnswer({
        question_id: qaGroup.question_id,
        question: qaGroup.question,
        intent: raw.intent,
        model_answers: raw.model_answers,
      });
    } catch (err) {
      // Even the skipped-model-answer call failed. Ship a skipped record
      // with the placeholder model answer rather than failing the entire
      // session — the user can still see scores for other answers.
      console.error("[evaluateAnswer] skipped model-answer call failed", {
        question_id: qaGroup.question_id,
        error: err instanceof Error ? err.message : String(err),
      });
      return buildSkippedAnswer({
        question_id: qaGroup.question_id,
        question: qaGroup.question,
      });
    }
  }

  try {
    const prompt = buildAnswerEvaluationPrompt({ qaGroup, analysisJson, resumeTexts });
    const raw = await callWithRetry(
      prompt,
      apiKey,
      model,
      answerResponseSchema,
      AnswerEvaluationSchema,
    );
    return qaGroup.used_hint ? applyHintCap(raw) : applyAnsweredOverrides(raw);
  } catch (err) {
    console.error("[evaluateAnswer] evaluation call failed, returning failed card", {
      question_id: qaGroup.question_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return buildFailedAnswer({
      question_id: qaGroup.question_id,
      question: qaGroup.question,
    });
  }
}

export interface EvaluateSummaryInput {
  answers: ReadonlyArray<AnswerFinal>;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
  totalScore: number;
  skippedCount: number;
  hintCount: number;
  apiKey: string;
  model: string;
}

export async function evaluateSummary(input: EvaluateSummaryInput): Promise<SummaryEvaluationOutput> {
  const { answers, analysisJson, resumeTexts, totalScore, skippedCount, hintCount, apiKey, model } = input;

  const prompt = buildSummaryEvaluationPrompt({
    analysisJson,
    resumeTexts,
    answers: answers.map((a) => ({
      question_id: a.question_id,
      question: a.question,
      answer: a.answer,
      scores: a.scores,
      average: a.average,
      feedback: a.feedback,
    })),
    totalScore,
    skippedCount,
    hintCount,
  });

  return callWithRetry(prompt, apiKey, model, summaryResponseSchema, SummaryEvaluationSchema);
}

// Run all per-question evaluations in parallel.
export interface EvaluateAllAnswersInput {
  qaGroups: ReadonlyArray<QaGroup>;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
  apiKey: string;
  model: string;
}

export async function evaluateAllAnswers(input: EvaluateAllAnswersInput): Promise<AnswerFinal[]> {
  const { qaGroups, analysisJson, resumeTexts, apiKey, model } = input;
  const limit = pLimit(EVAL_CONCURRENCY);
  return Promise.all(
    qaGroups.map((qaGroup) =>
      limit(() => evaluateAnswer({ qaGroup, analysisJson, resumeTexts, apiKey, model })),
    ),
  );
}

// Convenience re-export for the route handler.
export type { AnswerEvaluationOutput, SummaryEvaluationOutput };
