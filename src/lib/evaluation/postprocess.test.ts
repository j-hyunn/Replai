import { describe, it, expect, vi, afterEach } from "vitest";
import {
  HINT_SCORE_CAP,
  applyAnsweredOverrides,
  applyHintCap,
  buildFailedAnswer,
  buildSkippedAnswer,
  computeTotalScore,
  countByStatus,
  type AnswerFinal,
} from "./postprocess";
import type { QuestionEvaluationResult } from "@/lib/prompts/evaluation";

function makeResult(
  overrides: Partial<QuestionEvaluationResult> = {},
): QuestionEvaluationResult {
  return {
    question_id: "q1",
    question: "본인의 강점을 말씀해 주세요.",
    answer: "협업 경험이 강점입니다.",
    scores: { logic: 80, specificity: 70, job_fit: 90 },
    average: 80,
    intent: ["자기 이해"],
    feedback: "구체적인 사례가 더 필요합니다.",
    model_answers: [{ question: "본인의 강점은?", model_answer: "..." }],
    ...overrides,
  };
}

function makeFinal(status: AnswerFinal["status"], average: number): AnswerFinal {
  return { ...makeResult(), average, status };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applyAnsweredOverrides", () => {
  it("recomputes average from the three component scores", () => {
    const result = applyAnsweredOverrides(
      makeResult({ scores: { logic: 80, specificity: 70, job_fit: 90 }, average: 42 }),
    );
    expect(result.average).toBe(80);
    expect(result.status).toBe("answered");
  });

  it("rounds the recomputed average rather than truncating", () => {
    const result = applyAnsweredOverrides(
      makeResult({ scores: { logic: 80, specificity: 81, job_fit: 81 }, average: 0 }),
    );
    expect(result.average).toBe(81);
  });

  it("leaves scores untouched", () => {
    const scores = { logic: 55, specificity: 61, job_fit: 72 };
    expect(applyAnsweredOverrides(makeResult({ scores })).scores).toEqual(scores);
  });
});

describe("applyHintCap", () => {
  it("clips every score that exceeds the cap", () => {
    const result = applyHintCap(
      makeResult({ scores: { logic: 95, specificity: 88, job_fit: 100 } }),
    );
    expect(result.scores).toEqual({
      logic: HINT_SCORE_CAP,
      specificity: HINT_SCORE_CAP,
      job_fit: HINT_SCORE_CAP,
    });
    expect(result.average).toBe(HINT_SCORE_CAP);
    expect(result.status).toBe("hint_shown");
  });

  it("leaves scores already under the cap alone", () => {
    const result = applyHintCap(
      makeResult({ scores: { logic: 10, specificity: 20, job_fit: 12 } }),
    );
    expect(result.scores).toEqual({ logic: 10, specificity: 20, job_fit: 12 });
    expect(result.average).toBe(14);
  });

  it("warns when the LLM ignored the cap instruction", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyHintCap(makeResult({ scores: { logic: 95, specificity: 10, job_fit: 10 } }));
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not warn when the LLM respected the cap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    applyHintCap(makeResult({ scores: { logic: 30, specificity: 10, job_fit: 10 } }));
    expect(warn).not.toHaveBeenCalled();
  });

  it("prefixes the feedback with the penalty explanation exactly once", () => {
    const first = applyHintCap(makeResult({ feedback: "논리 전개가 좋습니다." }));
    expect(first.feedback).toContain(`최대 ${HINT_SCORE_CAP}점으로 제한`);

    const second = applyHintCap(makeResult({ feedback: first.feedback }));
    const occurrences = second.feedback.split("최대").length - 1;
    expect(occurrences).toBe(1);
  });

  it("fills in placeholder answer text when the LLM returned none", () => {
    expect(applyHintCap(makeResult({ answer: "" })).answer).not.toBe("");
  });
});

describe("buildSkippedAnswer", () => {
  it("produces a deterministic zero-score record", () => {
    const result = buildSkippedAnswer({ question_id: "q3", question: "왜 이직하시나요?" });
    expect(result.scores).toEqual({ logic: 0, specificity: 0, job_fit: 0 });
    expect(result.average).toBe(0);
    expect(result.status).toBe("skipped");
    expect(result.question_id).toBe("q3");
  });
});

describe("buildFailedAnswer", () => {
  it("marks the record failed and tells the user what to do next", () => {
    const result = buildFailedAnswer({ question_id: "q4", question: "가장 큰 실패는?" });
    expect(result.status).toBe("failed");
    expect(result.average).toBe(0);
    expect(result.feedback).toContain("다시 생성");
  });
});

describe("computeTotalScore", () => {
  it("averages only answered questions", () => {
    expect(
      computeTotalScore([makeFinal("answered", 90), makeFinal("answered", 70)]),
    ).toBe(80);
  });

  it("excludes skipped questions so they do not drag the score down", () => {
    expect(
      computeTotalScore([
        makeFinal("answered", 90),
        makeFinal("answered", 70),
        makeFinal("skipped", 0),
      ]),
    ).toBe(80);
  });

  it("excludes failed questions too", () => {
    expect(
      computeTotalScore([makeFinal("answered", 60), makeFinal("failed", 0)]),
    ).toBe(60);
  });

  it("counts hint_shown answers toward the total", () => {
    expect(
      computeTotalScore([makeFinal("answered", 90), makeFinal("hint_shown", 30)]),
    ).toBe(60);
  });

  it("returns 0 when every question was skipped or failed", () => {
    expect(computeTotalScore([makeFinal("skipped", 0), makeFinal("failed", 0)])).toBe(0);
  });

  it("returns 0 for an empty list", () => {
    expect(computeTotalScore([])).toBe(0);
  });
});

describe("countByStatus", () => {
  it("counts hint_shown as both responded and hinted", () => {
    const counts = countByStatus([
      makeFinal("answered", 80),
      makeFinal("hint_shown", 30),
      makeFinal("skipped", 0),
      makeFinal("failed", 0),
    ]);
    expect(counts).toEqual({ total: 4, responded: 2, hinted: 1, skipped: 1, failed: 1 });
  });
});
