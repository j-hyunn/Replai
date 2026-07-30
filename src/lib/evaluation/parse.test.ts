import { describe, it, expect } from "vitest";
import {
  InvalidEvaluationError,
  parseQuestionEvaluation,
  parseSkippedModelAnswer,
  parseSummaryEvaluation,
} from "./parse";

const validQuestion = {
  question_id: "q1",
  question: "본인의 강점은?",
  answer: "협업입니다.",
  scores: { logic: 80, specificity: 70, job_fit: 90 },
  average: 80,
  intent: ["자기 이해"],
  feedback: "사례가 더 필요합니다.",
  model_answers: [{ question: "본인의 강점은?", model_answer: "..." }],
};

describe("parseQuestionEvaluation", () => {
  it("accepts a well-formed response", () => {
    const parsed = parseQuestionEvaluation(validQuestion, "q1");
    expect(parsed.scores).toEqual({ logic: 80, specificity: 70, job_fit: 90 });
    expect(parsed.model_answers).toHaveLength(1);
  });

  it("overrides the question_id with the server's value", () => {
    const parsed = parseQuestionEvaluation({ ...validQuestion, question_id: "wrong" }, "q1");
    expect(parsed.question_id).toBe("q1");
  });

  it("throws when scores are missing", () => {
    expect(() => parseQuestionEvaluation({ ...validQuestion, scores: undefined }, "q1")).toThrow(
      InvalidEvaluationError,
    );
  });

  it("throws when a score is out of the 0-100 range", () => {
    expect(() =>
      parseQuestionEvaluation(
        { ...validQuestion, scores: { logic: 120, specificity: 70, job_fit: 90 } },
        "q1",
      ),
    ).toThrow(InvalidEvaluationError);
  });

  it("throws when a score is a string instead of a number", () => {
    expect(() =>
      parseQuestionEvaluation(
        { ...validQuestion, scores: { logic: "80", specificity: 70, job_fit: 90 } },
        "q1",
      ),
    ).toThrow(InvalidEvaluationError);
  });

  it("throws when feedback is missing or empty", () => {
    expect(() => parseQuestionEvaluation({ ...validQuestion, feedback: "" }, "q1")).toThrow(
      InvalidEvaluationError,
    );
  });

  it("throws when the response is not an object", () => {
    expect(() => parseQuestionEvaluation("nope", "q1")).toThrow(InvalidEvaluationError);
    expect(() => parseQuestionEvaluation(null, "q1")).toThrow(InvalidEvaluationError);
  });

  it("drops malformed model_answers entries instead of failing", () => {
    const parsed = parseQuestionEvaluation(
      {
        ...validQuestion,
        model_answers: [{ question: "ok", model_answer: "ok" }, { question: 1 }, null],
      },
      "q1",
    );
    expect(parsed.model_answers).toEqual([{ question: "ok", model_answer: "ok" }]);
  });

  it("falls back to an empty intent array when the field is malformed", () => {
    expect(parseQuestionEvaluation({ ...validQuestion, intent: "자기 이해" }, "q1").intent).toEqual(
      [],
    );
  });

  it("rounds fractional scores", () => {
    const parsed = parseQuestionEvaluation(
      { ...validQuestion, scores: { logic: 79.6, specificity: 70.2, job_fit: 90 } },
      "q1",
    );
    expect(parsed.scores).toEqual({ logic: 80, specificity: 70, job_fit: 90 });
  });
});

describe("parseSkippedModelAnswer", () => {
  it("accepts a well-formed response", () => {
    const parsed = parseSkippedModelAnswer({
      intent: ["동기 확인"],
      model_answers: [{ question: "왜 이직하시나요?", model_answer: "제가 맡았던..." }],
    });
    expect(parsed.intent).toEqual(["동기 확인"]);
    expect(parsed.model_answers).toHaveLength(1);
  });

  it("throws when no usable model answer came back", () => {
    expect(() => parseSkippedModelAnswer({ intent: ["x"], model_answers: [] })).toThrow(
      InvalidEvaluationError,
    );
  });

  it("throws when the only model answer has empty text", () => {
    expect(() =>
      parseSkippedModelAnswer({
        intent: ["x"],
        model_answers: [{ question: "q", model_answer: "" }],
      }),
    ).toThrow(InvalidEvaluationError);
  });

  it("defaults intent to an empty array when malformed", () => {
    const parsed = parseSkippedModelAnswer({
      intent: "동기 확인",
      model_answers: [{ question: "q", model_answer: "a" }],
    });
    expect(parsed.intent).toEqual([]);
  });

  it("throws when the response is not an object", () => {
    expect(() => parseSkippedModelAnswer(null)).toThrow(InvalidEvaluationError);
  });
});

describe("parseSummaryEvaluation", () => {
  it("accepts a well-formed response", () => {
    const parsed = parseSummaryEvaluation({
      summary: "전반적으로 안정적입니다.",
      strengths: "논리 전개가 좋습니다.",
      strength_keywords: ["논리적 구조"],
      improvements: "수치가 부족합니다.",
      improvement_keywords: ["수치 기반 근거"],
    });
    expect(parsed.strength_keywords).toEqual(["논리적 구조"]);
  });

  it("throws when summary is missing", () => {
    expect(() => parseSummaryEvaluation({ strengths: "..." })).toThrow(InvalidEvaluationError);
  });

  it("defaults optional fields rather than throwing", () => {
    const parsed = parseSummaryEvaluation({ summary: "요약" });
    expect(parsed.strengths).toBe("");
    expect(parsed.improvement_keywords).toEqual([]);
  });
});
