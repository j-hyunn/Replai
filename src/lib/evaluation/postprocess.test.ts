import { describe, it, expect } from "vitest";
import {
  HINT_SCORE_CAP,
  applyAnsweredOverrides,
  applyHintCap,
  buildFailedAnswer,
  buildSkippedAnswer,
  computeTotalScore,
  countByStatus,
  findMissingQuestionIds,
} from "./postprocess";
import type { AnswerEvaluationOutput } from "./schema";

const baseAnswer: AnswerEvaluationOutput = {
  question_id: "q1",
  question: "자기소개해주세요",
  answer: "저는 5년차 백엔드 개발자입니다",
  scores: { logic: 85, specificity: 70, job_fit: 90 },
  average: 99, // intentionally wrong to verify server recalc
  intent: ["역할", "성과"],
  feedback: "전반적으로 좋은 답변이었습니다. 다음에는 수치를 추가하세요.",
  model_answers: [
    {
      question: "자기소개해주세요",
      intent: ["프로젝트", "성과"],
      model_answer:
        "저는 Replai 백엔드를 담당하며 응답 속도를 50% 개선하고 동시 처리량을 3배 늘렸습니다.",
    },
  ],
};

describe("applyAnsweredOverrides", () => {
  it("recomputes average as the arithmetic mean", () => {
    const result = applyAnsweredOverrides(baseAnswer);
    expect(result.average).toBe(Math.round((85 + 70 + 90) / 3));
    expect(result.status).toBe("answered");
  });
});

describe("applyHintCap", () => {
  it("caps each score at HINT_SCORE_CAP", () => {
    const result = applyHintCap(baseAnswer);
    expect(result.scores.logic).toBe(HINT_SCORE_CAP);
    expect(result.scores.specificity).toBe(HINT_SCORE_CAP);
    expect(result.scores.job_fit).toBe(HINT_SCORE_CAP);
    expect(result.average).toBe(HINT_SCORE_CAP);
    expect(result.status).toBe("hint_shown");
  });

  it("does not raise scores below the cap", () => {
    const low = {
      ...baseAnswer,
      scores: { logic: 10, specificity: 20, job_fit: 25 },
    };
    const result = applyHintCap(low);
    expect(result.scores).toEqual({ logic: 10, specificity: 20, job_fit: 25 });
    expect(result.average).toBe(Math.round((10 + 20 + 25) / 3));
  });

  it("prefixes the feedback with the hint disclosure", () => {
    const result = applyHintCap(baseAnswer);
    expect(result.feedback.startsWith("모범 답안을 참조했기 때문에")).toBe(true);
  });
});

describe("buildSkippedAnswer", () => {
  it("returns zero scores and the canonical skipped strings", () => {
    const result = buildSkippedAnswer({ question_id: "q3", question: "강점은?" });
    expect(result.scores).toEqual({ logic: 0, specificity: 0, job_fit: 0 });
    expect(result.average).toBe(0);
    expect(result.answer).toBe("건너뛴 질문입니다.");
    expect(result.model_answers.length).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("skipped");
  });
});

describe("computeTotalScore", () => {
  it("excludes skipped and failed answers from the mean", () => {
    const answers = [
      applyAnsweredOverrides({ ...baseAnswer, scores: { logic: 80, specificity: 80, job_fit: 80 } }),
      applyAnsweredOverrides({ ...baseAnswer, scores: { logic: 60, specificity: 60, job_fit: 60 } }),
      buildSkippedAnswer({ question_id: "q3", question: "skip me" }),
      buildFailedAnswer({ question_id: "q4", question: "fail me" }),
    ];
    // Only the two answered ones count: (80 + 60) / 2 = 70
    expect(computeTotalScore(answers)).toBe(70);
  });

  it("returns 0 when every answer is skipped or failed", () => {
    const answers = [
      buildSkippedAnswer({ question_id: "q1", question: "a" }),
      buildFailedAnswer({ question_id: "q2", question: "b" }),
    ];
    expect(computeTotalScore(answers)).toBe(0);
  });
});

describe("findMissingQuestionIds", () => {
  it("returns ids present in expected but not received", () => {
    const missing = findMissingQuestionIds(
      ["q1", "q2", "q3"],
      [{ question_id: "q1" }, { question_id: "q3" }],
    );
    expect(missing).toEqual(["q2"]);
  });

  it("returns empty array when all present", () => {
    const missing = findMissingQuestionIds(
      ["q1", "q2"],
      [{ question_id: "q2" }, { question_id: "q1" }],
    );
    expect(missing).toEqual([]);
  });
});

describe("countByStatus", () => {
  it("counts each status separately", () => {
    const answers = [
      applyAnsweredOverrides(baseAnswer),
      applyHintCap(baseAnswer),
      buildSkippedAnswer({ question_id: "q3", question: "x" }),
      buildFailedAnswer({ question_id: "q4", question: "y" }),
    ];
    expect(countByStatus(answers)).toEqual({
      total: 4,
      responded: 2,
      skipped: 1,
      failed: 1,
    });
  });
});
