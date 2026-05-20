import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateAnswer,
  EvaluationFailedError,
  resetFetchForTests,
  setFetchForTests,
} from "./run";
import type { AnalysisOutput } from "@/lib/prompts/analysis";
import type { QaGroup } from "@/lib/prompts/evaluation";

const analysis: AnalysisOutput = {
  analysis: { jd_keywords: [], strengths: [], preferred_gaps: [] },
  questions: [],
};

const baseQaGroup: QaGroup = {
  question_id: "q1",
  question: "자기소개해주세요",
  intent: "역할 확인",
  good_answer_tips: "수치 포함",
  turns: [
    { speaker: "interviewer", content: "자기소개해주세요" },
    { speaker: "user", content: "저는 5년차 백엔드 개발자입니다" },
  ],
  used_hint: false,
  skipped: false,
};

const goodPayload = {
  question_id: "q1",
  question: "자기소개해주세요",
  answer: "5년차 백엔드 개발자",
  scores: { logic: 80, specificity: 70, job_fit: 75 },
  average: 75,
  intent: ["역할", "성과"],
  feedback: "전반적으로 논리적이고 답변 흐름이 좋습니다 수치를 더 추가하세요",
  model_answers: [
    {
      question: "자기소개해주세요",
      intent: ["프로젝트", "성과"],
      model_answer:
        "저는 Replai 백엔드를 담당하며 응답 속도 50% 개선과 동시 처리량 3배 증가를 이끈 5년차 개발자입니다",
    },
  ],
};

function geminiOk(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function geminiHttpFail(): Response {
  return new Response("rate limited", { status: 429 });
}

beforeEach(() => {
  // start each test with a clean fetch
  resetFetchForTests();
});

afterEach(() => {
  resetFetchForTests();
  vi.restoreAllMocks();
});

describe("evaluateAnswer — structured success", () => {
  it("returns the LLM result with average recomputed", async () => {
    const mock = vi.fn().mockResolvedValue(geminiOk(goodPayload));
    setFetchForTests(mock as unknown as typeof fetch);

    const result = await evaluateAnswer({
      qaGroup: baseQaGroup,
      analysisJson: analysis,
      resumeTexts: ["이력서"],
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    expect(mock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("answered");
    expect(result.average).toBe(Math.round((80 + 70 + 75) / 3));
  });
});

describe("evaluateAnswer — fallback to raw on first error", () => {
  it("structured 4xx → raw succeeds → returns parsed", async () => {
    let call = 0;
    const mock = vi.fn().mockImplementation(() => {
      call++;
      return Promise.resolve(call === 1 ? geminiHttpFail() : geminiOk(goodPayload));
    });
    setFetchForTests(mock as unknown as typeof fetch);

    const result = await evaluateAnswer({
      qaGroup: baseQaGroup,
      analysisJson: analysis,
      resumeTexts: ["이력서"],
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    // structured (fail) + raw (success) within attempt #1
    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("answered");
  });
});

describe("evaluateAnswer — retries up to MAX_ATTEMPTS then surfaces as failed", () => {
  it("returns failed AnswerFinal (does NOT throw) when 3 attempts all fail", async () => {
    const mock = vi.fn().mockResolvedValue(geminiHttpFail());
    setFetchForTests(mock as unknown as typeof fetch);

    const result = await evaluateAnswer({
      qaGroup: baseQaGroup,
      analysisJson: analysis,
      resumeTexts: ["이력서"],
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    // 3 attempts × 2 calls each (structured + raw) = 6
    expect(mock).toHaveBeenCalledTimes(6);
    expect(result.status).toBe("failed");
    expect(result.answer).toContain("실패");
  });
}, 10_000);

describe("evaluateAnswer — used_hint caps server-side", () => {
  it("clips each score at 30 even if LLM returns higher", async () => {
    const mock = vi.fn().mockResolvedValue(geminiOk(goodPayload));
    setFetchForTests(mock as unknown as typeof fetch);

    const result = await evaluateAnswer({
      qaGroup: { ...baseQaGroup, used_hint: true },
      analysisJson: analysis,
      resumeTexts: ["이력서"],
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    });

    expect(result.status).toBe("hint_shown");
    expect(result.scores.logic).toBe(30);
    expect(result.scores.specificity).toBe(30);
    expect(result.scores.job_fit).toBe(30);
  });
});

describe("EvaluationFailedError class is exported", () => {
  it("is constructible", () => {
    const err = new EvaluationFailedError("nope");
    expect(err).toBeInstanceOf(EvaluationFailedError);
  });
});
