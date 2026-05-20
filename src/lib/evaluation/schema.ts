import { z } from "zod";

// Single source of truth for evaluation output shape. Used both for runtime
// validation (Zod.parse) and for Gemini structured output (responseSchema).
// Keeping them in one place prevents drift between the prompt contract and
// the post-processing layer.

export const ScoresSchema = z.object({
  logic: z.number().int().min(0).max(100),
  specificity: z.number().int().min(0).max(100),
  job_fit: z.number().int().min(0).max(100),
});

export const ModelAnswerSchema = z.object({
  question: z.string().min(1),
  intent: z.array(z.string().min(1)).min(1).max(6),
  // minLength is the truncate guard: Gemini occasionally returns
  // schema-valid but empty strings. 50 chars rejects those reliably for
  // Korean STAR-style answers (roughly 1.5-2 sentences minimum).
  model_answer: z.string().min(50),
});

export const AnswerEvaluationSchema = z.object({
  question_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string(),
  scores: ScoresSchema,
  average: z.number().int().min(0).max(100),
  intent: z.array(z.string().min(1)).min(1).max(6),
  feedback: z.string().min(20),
  model_answers: z.array(ModelAnswerSchema).min(1),
});

export const SummaryEvaluationSchema = z.object({
  summary: z.string().min(20),
  strengths: z.string().min(20),
  strength_keywords: z.array(z.string().min(1)).min(1).max(6),
  improvements: z.string().min(20),
  improvement_keywords: z.array(z.string().min(1)).min(1).max(6),
});

export type ScoresOutput = z.infer<typeof ScoresSchema>;
export type ModelAnswerOutput = z.infer<typeof ModelAnswerSchema>;
export type AnswerEvaluationOutput = z.infer<typeof AnswerEvaluationSchema>;
export type SummaryEvaluationOutput = z.infer<typeof SummaryEvaluationSchema>;

// Gemini's responseSchema rejects `$schema` and `additionalProperties`.
// Strip them after Zod's native JSON-Schema conversion so the payload is
// acceptable to the API.
type JsonSchemaLike = Record<string, unknown>;

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (node === null || typeof node !== "object") return node;
  const obj = node as JsonSchemaLike;
  const out: JsonSchemaLike = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "$schema" || key === "additionalProperties") continue;
    out[key] = stripUnsupported(value);
  }
  return out;
}

export function toGeminiResponseSchema<T extends z.ZodTypeAny>(
  schema: T,
): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7" });
  return stripUnsupported(json) as Record<string, unknown>;
}

export const answerResponseSchema = toGeminiResponseSchema(AnswerEvaluationSchema);
export const summaryResponseSchema = toGeminiResponseSchema(SummaryEvaluationSchema);
