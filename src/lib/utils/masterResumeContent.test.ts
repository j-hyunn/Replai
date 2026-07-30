import { describe, it, expect } from "vitest";
import { hasMasterResumeContent } from "./masterResumeContent";
import type { ResumeExperience, ResumeProject } from "@/lib/types/master-resume";

const experience = (): ResumeExperience => ({
  id: "e1",
  company: "회사",
  position: "백엔드 엔지니어",
  start_date: "2023-01",
  end_date: "",
  is_current: true,
  description: "결제 서비스 운영",
  leave_reason: "",
});

const project = (): ResumeProject => ({
  id: "p1",
  name: "결제 리팩터링",
  company: "회사",
  start_date: "2024-01",
  end_date: "2024-06",
  description: "레거시 결제 모듈 분리",
  contribution: "80%",
  achievement: "응답 시간 40% 개선",
  tech_stack: "TypeScript, PostgreSQL",
  decisions: "이벤트 기반 전환",
});

describe("hasMasterResumeContent", () => {
  it("returns false when there is no master resume", () => {
    expect(hasMasterResumeContent(null)).toBe(false);
  });

  it("returns false for an empty shell with no experiences or projects", () => {
    expect(hasMasterResumeContent({ experiences: [], projects: [] })).toBe(false);
  });

  it("returns true when at least one experience exists", () => {
    expect(hasMasterResumeContent({ experiences: [experience()], projects: [] })).toBe(true);
  });

  it("returns true when at least one project exists", () => {
    expect(hasMasterResumeContent({ experiences: [], projects: [project()] })).toBe(true);
  });
});
