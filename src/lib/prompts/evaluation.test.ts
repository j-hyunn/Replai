import { describe, it, expect } from "vitest";
import {
  assertNoLegacyMarkers,
  buildAnswerEvaluationPrompt,
  buildSummaryEvaluationPrompt,
  LEGACY_MARKERS,
} from "./evaluation";
import type { AnalysisOutput } from "./analysis";

const analysis: AnalysisOutput = {
  analysis: {
    jd_keywords: ["TypeScript", "Next.js"],
    strengths: ["풀스택 경험"],
    preferred_gaps: ["대규모 트래픽 대응"],
  },
  questions: [],
};

describe("buildAnswerEvaluationPrompt", () => {
  it("includes the anchor rubric", () => {
    const prompt = buildAnswerEvaluationPrompt({
      qaGroup: {
        question_id: "q1",
        question: "자기소개해주세요",
        intent: "역할 확인",
        good_answer_tips: "수치를 포함하세요",
        turns: [
          { speaker: "interviewer", content: "자기소개해주세요" },
          { speaker: "user", content: "저는 5년차 백엔드 개발자입니다" },
        ],
        used_hint: false,
        skipped: false,
      },
      analysisJson: analysis,
      resumeTexts: ["이력서 본문"],
    });

    expect(prompt).toContain("anchor");
    expect(prompt).toContain("90~100");
    expect(prompt).toContain("0~29");
  });

  it("does NOT leak the legacy [모범 답안] or [질문 건너뛰기] markers", () => {
    const prompt = buildAnswerEvaluationPrompt({
      qaGroup: {
        question_id: "q1",
        question: "자기소개해주세요",
        intent: "역할 확인",
        good_answer_tips: "수치를 포함하세요",
        turns: [
          { speaker: "interviewer", content: "자기소개해주세요" },
          // Content arriving from the post-migration DB is the hint text
          // itself, NOT the legacy `[모범 답안] ...` marker — the kind
          // column carries the semantic. Verify the prompt holds.
          { speaker: "user", content: "저는 5년차 백엔드 개발자입니다" },
        ],
        used_hint: true,
        skipped: false,
      },
      analysisJson: analysis,
      resumeTexts: ["이력서 본문"],
    });

    for (const marker of LEGACY_MARKERS) {
      expect(prompt.includes(marker)).toBe(false);
    }
  });

  it("labels the hint flag for the LLM", () => {
    const prompt = buildAnswerEvaluationPrompt({
      qaGroup: {
        question_id: "q1",
        question: "자기소개해주세요",
        intent: "역할 확인",
        good_answer_tips: "수치",
        turns: [],
        used_hint: true,
        skipped: false,
      },
      analysisJson: analysis,
      resumeTexts: [],
    });
    expect(prompt).toContain("모범 답안 참조: 예");
  });
});

describe("buildSummaryEvaluationPrompt", () => {
  it("includes skipped/hint counts and total_score", () => {
    const prompt = buildSummaryEvaluationPrompt({
      analysisJson: analysis,
      resumeTexts: [],
      answers: [
        {
          question_id: "q1",
          question: "자기소개",
          answer: "5년차 개발자입니다",
          scores: { logic: 80, specificity: 70, job_fit: 75 },
          average: 75,
          feedback: "좋은 답변",
        },
      ],
      totalScore: 75,
      skippedCount: 1,
      hintCount: 2,
    });
    expect(prompt).toContain("건너뜀: 1");
    expect(prompt).toContain("모범 답안 참조: 2");
    expect(prompt).toContain("종합 점수 (skipped 제외 평균): 75");
  });
});

describe("assertNoLegacyMarkers", () => {
  it("throws when a legacy marker is present", () => {
    expect(() => assertNoLegacyMarkers("hello [모범 답안] world")).toThrow();
    expect(() => assertNoLegacyMarkers("[질문 건너뛰기]")).toThrow();
  });

  it("passes for clean prompts", () => {
    expect(() => assertNoLegacyMarkers("정상 답변 내용")).not.toThrow();
  });
});
