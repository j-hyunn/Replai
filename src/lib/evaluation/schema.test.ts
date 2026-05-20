import { describe, it, expect } from "vitest";
import {
  AnswerEvaluationSchema,
  SummaryEvaluationSchema,
  answerResponseSchema,
} from "./schema";

const validAnswer = {
  question_id: "q1",
  question: "자기소개해주세요",
  answer: "저는 5년 경력 백엔드 개발자입니다",
  scores: { logic: 80, specificity: 70, job_fit: 75 },
  average: 75,
  intent: ["역할 명확성", "성과 측정"],
  feedback: "전반적으로 논리 흐름은 좋으나 구체 수치가 부족합니다",
  model_answers: [
    {
      question: "자기소개해주세요",
      intent: ["프로젝트", "성과"],
      model_answer:
        "저는 Replai 팀에서 백엔드를 담당하며 응답 속도를 50% 개선하고 동시 처리량을 3배 늘린 5년 경력 개발자입니다",
    },
  ],
};

describe("AnswerEvaluationSchema", () => {
  it("accepts a complete valid answer", () => {
    const result = AnswerEvaluationSchema.safeParse(validAnswer);
    expect(result.success).toBe(true);
  });

  it("rejects an empty model_answer (truncate guard)", () => {
    const bad = {
      ...validAnswer,
      model_answers: [{ ...validAnswer.model_answers[0], model_answer: "" }],
    };
    const result = AnswerEvaluationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a score out of 0..100", () => {
    const bad = {
      ...validAnswer,
      scores: { ...validAnswer.scores, logic: 150 },
    };
    const result = AnswerEvaluationSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("SummaryEvaluationSchema", () => {
  it("accepts valid summary", () => {
    const result = SummaryEvaluationSchema.safeParse({
      summary: "전반적으로 논리적이고 구체적인 답변이었습니다 다만 직무 매칭은 약합니다",
      strengths: "프로젝트 경험을 수치로 잘 뒷받침했고 답변 구조도 두괄식이었습니다",
      strength_keywords: ["두괄식", "수치 근거"],
      improvements: "직무 적합성 측면에서 JD의 핵심 키워드와 더 강하게 연결할 필요가 있습니다",
      improvement_keywords: ["JD 매칭", "직무 키워드"],
    });
    expect(result.success).toBe(true);
  });
});

describe("answerResponseSchema (Gemini)", () => {
  it("strips $schema and additionalProperties", () => {
    const json = JSON.stringify(answerResponseSchema);
    expect(json).not.toContain("$schema");
    expect(json).not.toContain("additionalProperties");
  });

  it("contains scores.properties.logic", () => {
    // Sanity check: the conversion preserves nested schema structure that
    // Gemini's responseSchema relies on for enforcing field types.
    const json = JSON.stringify(answerResponseSchema);
    expect(json).toContain("logic");
    expect(json).toContain("model_answers");
    expect(json).toContain("intent");
  });
});
