import { describe, it, expect } from "vitest";
import {
  InvalidResumeOutputError,
  parseFilteredContent,
  parseJdAnalysis,
  parseResumeAnalysis,
  parseSubmittedResumeContent,
} from "./parse";

describe("parseJdAnalysis", () => {
  const valid = {
    persona: "manager",
    core_pillars: ["실행력", "데이터", "협업"],
    keywords: ["PM", "SaaS"],
    company_context: "외식업 디지털 전환",
  };

  it("accepts a well-formed response", () => {
    const out = parseJdAnalysis(valid);
    expect(out.persona).toBe("manager");
    expect(out.core_pillars).toEqual(["실행력", "데이터", "협업"]);
  });

  it("falls back to executor for an unknown persona", () => {
    expect(parseJdAnalysis({ ...valid, persona: "wizard" }).persona).toBe("executor");
  });

  it("pads core_pillars to exactly three entries", () => {
    expect(parseJdAnalysis({ ...valid, core_pillars: ["하나"] }).core_pillars).toEqual([
      "하나",
      "",
      "",
    ]);
  });

  it("trims core_pillars beyond three entries", () => {
    const out = parseJdAnalysis({ ...valid, core_pillars: ["a", "b", "c", "d"] });
    expect(out.core_pillars).toEqual(["a", "b", "c"]);
  });

  it("throws when core_pillars is missing or empty", () => {
    expect(() => parseJdAnalysis({ ...valid, core_pillars: [] })).toThrow(InvalidResumeOutputError);
    expect(() => parseJdAnalysis({ persona: "manager" })).toThrow(InvalidResumeOutputError);
  });

  it("defaults malformed keywords rather than throwing", () => {
    expect(parseJdAnalysis({ ...valid, keywords: "PM" }).keywords).toEqual([]);
  });

  it("throws when the response is not an object", () => {
    expect(() => parseJdAnalysis(null)).toThrow(InvalidResumeOutputError);
    expect(() => parseJdAnalysis([1, 2])).toThrow(InvalidResumeOutputError);
  });
});

describe("parseFilteredContent", () => {
  it("accepts a well-formed response", () => {
    const out = parseFilteredContent({
      selected_experiences: ["exp-1"],
      selected_projects: ["proj-1"],
      priority_order: ["proj-1", "exp-1"],
      removed_reasons: { "exp-2": "JD 무관" },
    });
    expect(out.selected_experiences).toEqual(["exp-1"]);
    expect(out.removed_reasons).toEqual({ "exp-2": "JD 무관" });
  });

  it("accepts projects-only selections", () => {
    const out = parseFilteredContent({ selected_experiences: [], selected_projects: ["p"] });
    expect(out.selected_projects).toEqual(["p"]);
    expect(out.priority_order).toEqual([]);
  });

  it("throws when nothing at all was selected", () => {
    expect(() =>
      parseFilteredContent({ selected_experiences: [], selected_projects: [] }),
    ).toThrow(InvalidResumeOutputError);
  });

  it("drops non-string removed_reasons values", () => {
    const out = parseFilteredContent({
      selected_projects: ["p"],
      removed_reasons: { a: "이유", b: 42 },
    });
    expect(out.removed_reasons).toEqual({ a: "이유" });
  });
});

describe("parseSubmittedResumeContent", () => {
  const minimal = { basics: { name: "김제현" } };

  it("normalizes a sparse but substantive resume", () => {
    const out = parseSubmittedResumeContent(minimal);
    expect(out.basics.name).toBe("김제현");
    expect(out.basics.email).toBe("");
    expect(out.experiences).toEqual([]);
    expect(out.skills).toEqual({ hard: [], soft: [] });
    expect(out.self_intro_memo).toBe("");
  });

  it("throws when the resume is effectively empty", () => {
    // Regression guard: an empty resume serializes to "" and silently drops
    // out of the interview context — exactly the bug this validation exists
    // to prevent from reaching the DB.
    expect(() => parseSubmittedResumeContent({ basics: {}, experiences: [], projects: [] })).toThrow(
      InvalidResumeOutputError,
    );
    expect(() => parseSubmittedResumeContent({})).toThrow(InvalidResumeOutputError);
  });

  it("accepts a resume carried only by basics.summary", () => {
    const out = parseSubmittedResumeContent({ basics: { summary: "JD 맞춤 요약" } });
    expect(out.basics.summary).toBe("JD 맞춤 요약");
  });

  it("accepts a resume carried only by experiences", () => {
    const out = parseSubmittedResumeContent({ experiences: [{ company: "스포카" }] });
    expect(out.experiences[0].company).toBe("스포카");
  });

  it("mints an id when the model omits one", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      projects: [{ name: "프로젝트" }],
    });
    expect(out.projects[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves an id the model did provide", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      projects: [{ id: "proj-42", name: "프로젝트" }],
    });
    expect(out.projects[0].id).toBe("proj-42");
  });

  it("coerces union fields to safe defaults", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      educations: [{ school: "s", degree: "박사과정", status: "휴학", entry_type: "재입학" }],
    });
    expect(out.educations[0].degree).toBe("기타");
    expect(out.educations[0].status).toBe("졸업");
    expect(out.educations[0].entry_type).toBe("입학");
  });

  it("keeps valid union values", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      educations: [{ school: "s", degree: "석사", status: "재학중", entry_type: "편입" }],
    });
    expect(out.educations[0].degree).toBe("석사");
    expect(out.educations[0].status).toBe("재학중");
    expect(out.educations[0].entry_type).toBe("편입");
  });

  it("drops non-object array entries", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      experiences: [{ company: "a" }, "garbage", null, 42],
    });
    expect(out.experiences).toHaveLength(1);
  });

  it("only sets top-level summary when the model produced one", () => {
    expect(parseSubmittedResumeContent(minimal).summary).toBeUndefined();
    expect(parseSubmittedResumeContent({ ...minimal, summary: "  " }).summary).toBeUndefined();
    expect(parseSubmittedResumeContent({ ...minimal, summary: "요약" }).summary).toBe("요약");
  });

  it("coerces is_current to a real boolean", () => {
    const out = parseSubmittedResumeContent({
      basics: { name: "n" },
      experiences: [{ company: "a", is_current: "true" }, { company: "b", is_current: true }],
    });
    expect(out.experiences[0].is_current).toBe(false);
    expect(out.experiences[1].is_current).toBe(true);
  });

  it("names the stage in the error message", () => {
    expect(() => parseSubmittedResumeContent({}, "Final resume block")).toThrow(
      /Final resume block/,
    );
  });
});

describe("parseResumeAnalysis", () => {
  it("never throws on malformed input", () => {
    expect(parseResumeAnalysis(null)).toEqual({
      keyword_mapping: [],
      highlights: [],
      missing_items: [],
    });
    expect(parseResumeAnalysis("nope").highlights).toEqual([]);
  });

  it("keeps well-formed entries and drops empty ones", () => {
    const out = parseResumeAnalysis({
      keyword_mapping: [{ keyword: "PM", found_in: "경력" }, { found_in: "없음" }],
      highlights: [{ item: "전환율 8%", reason: "JD 핵심" }],
      missing_items: [{ item: "SQL", recommendation: "학습 권장" }],
    });
    expect(out.keyword_mapping).toEqual([{ keyword: "PM", found_in: "경력" }]);
    expect(out.highlights).toHaveLength(1);
    expect(out.missing_items[0].recommendation).toBe("학습 권장");
  });
});
