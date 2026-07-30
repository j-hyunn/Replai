import { describe, it, expect } from "vitest";
import { serializeMasterResume, serializeSubmittedResume } from "./serializeMasterResume";
import type { MasterResumeInput, SubmittedResumeContent } from "@/lib/types/master-resume";

function emptyContent(): MasterResumeInput {
  return {
    basics: { name: "", email: "", phone: "", website: "", summary: "" },
    experiences: [],
    projects: [],
    skills: { hard: [], soft: [] },
    educations: [],
    activities: [],
    self_intro_memo: "",
  };
}

function filledContent(): MasterResumeInput {
  return {
    ...emptyContent(),
    basics: { name: "김지현", email: "", phone: "", website: "", summary: "" },
    experiences: [
      {
        id: "exp-1",
        company: "스포카",
        position: "프로덕트 매니저",
        start_date: "2023.01",
        end_date: "",
        is_current: true,
        description: "도도포인트 리텐션 개선",
        leave_reason: "",
      },
    ],
  };
}

function submitted(overrides: Partial<SubmittedResumeContent> = {}): SubmittedResumeContent {
  return { ...filledContent(), summary: "", ...overrides };
}

describe("serializeMasterResume", () => {
  it("omits empty sections entirely", () => {
    expect(serializeMasterResume(emptyContent())).toBe("");
  });

  it("renders populated sections", () => {
    const out = serializeMasterResume(filledContent());
    expect(out).toContain("## 기본 정보");
    expect(out).toContain("## 경력");
    expect(out).toContain("스포카 — 프로덕트 매니저");
    expect(out).toContain("재직 중");
  });

  it("does not emit sections that have no content", () => {
    const out = serializeMasterResume(filledContent());
    expect(out).not.toContain("## 프로젝트");
    expect(out).not.toContain("## 학력");
  });
});

describe("serializeSubmittedResume", () => {
  it("puts the JD-tailored summary first", () => {
    const out = serializeSubmittedResume(
      submitted({ summary: "JD 핵심 역량에 맞춘 요약입니다." }),
    );
    expect(out.startsWith("## JD 맞춤 요약")).toBe(true);
    expect(out).toContain("JD 핵심 역량에 맞춘 요약입니다.");
    // Body still follows.
    expect(out).toContain("## 경력");
  });

  it("omits the summary section when the field is blank", () => {
    expect(serializeSubmittedResume(submitted({ summary: "   " }))).not.toContain("JD 맞춤 요약");
  });

  it("returns only the summary when the rest of the resume is empty", () => {
    const out = serializeSubmittedResume({ ...emptyContent(), summary: "요약만 있습니다." });
    expect(out).toBe("## JD 맞춤 요약\n요약만 있습니다.");
  });

  it("returns an empty string when there is nothing at all", () => {
    expect(serializeSubmittedResume({ ...emptyContent(), summary: "" })).toBe("");
  });

  it("hoists basics.summary when the top-level field is absent", () => {
    // This is what production data actually looks like: the generator's LLM
    // output has no top-level `summary`, and the JD-tailored pitch lands in
    // basics.summary instead.
    const content = submitted();
    delete content.summary;
    content.basics.summary = "JD에 맞춘 지원 요약입니다.";

    const out = serializeSubmittedResume(content);
    expect(out.startsWith("## JD 맞춤 요약")).toBe(true);
    expect(out).toContain("JD에 맞춘 지원 요약입니다.");
    // Hoisted, not duplicated.
    expect(out.split("JD에 맞춘 지원 요약입니다.").length - 1).toBe(1);
    expect(out).not.toContain("- 소개:");
  });

  it("prefers the top-level summary and keeps basics.summary as 소개", () => {
    const content = submitted({ summary: "최상위 요약" });
    content.basics.summary = "기본 정보 소개";

    const out = serializeSubmittedResume(content);
    expect(out).toContain("## JD 맞춤 요약\n최상위 요약");
    expect(out).toContain("- 소개: 기본 정보 소개");
  });

  it("produces non-empty output for a realistic submitted resume", () => {
    // Regression guard: the interview route gates injection on this being
    // non-blank. If it ever returns "" for a populated resume, the submitted
    // resume silently drops out of the interview context again.
    const out = serializeSubmittedResume(submitted({ summary: "요약" }));
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
