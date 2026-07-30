import { randomUUID } from "crypto";
import type {
  EducationDegree,
  EducationEntryType,
  EducationStatus,
  ResumeActivity,
  ResumeAnalysis,
  ResumeBasics,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkills,
  SubmittedResumeContent,
} from "@/lib/types/master-resume";
import type { FilteredContent, JdAnalysis } from "@/lib/prompts/resume-generate";

// Runtime validation for the resume generation pipeline. Every stage parses raw
// LLM output, which the prompt shapes but does not guarantee. Casting it with
// `as` let a resume whose fields the model had renamed or dropped reach the DB
// looking well-typed — that is how submitted resumes ended up persisted with no
// usable content.
//
// Policy mirrors lib/evaluation/parse.ts: repair what is safely recoverable,
// throw when the core payload is missing so the caller's retry loop runs again.

export class InvalidResumeOutputError extends Error {
  constructor(stage: string, reason: string) {
    super(`${stage} output failed validation: ${reason}`);
    this.name = "InvalidResumeOutputError";
  }
}

function asRecord(raw: unknown, stage: string): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new InvalidResumeOutputError(stage, "response is not an object");
  }
  return raw as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function objArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (v): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && !Array.isArray(v),
      )
    : [];
}

// The model omits `id` on generated items often enough that rejecting on it
// would fail otherwise-good resumes. The UI keys list rows by id, so mint one.
function id(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : randomUUID();
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

const DEGREES: readonly EducationDegree[] = ["고등학교", "전문학사", "학사", "석사", "박사", "기타"];
const STATUSES: readonly EducationStatus[] = ["졸업", "중퇴", "재학중"];
const ENTRY_TYPES: readonly EducationEntryType[] = ["입학", "편입"];

// ─── Stage 1: JD analysis ────────────────────────────────────────────────────

export function parseJdAnalysis(raw: unknown): JdAnalysis {
  const r = asRecord(raw, "JD analysis");

  const pillars = strArray(r.core_pillars);
  if (pillars.length === 0) {
    throw new InvalidResumeOutputError("JD analysis", "core_pillars is empty");
  }
  // The type fixes this at three entries; pad or trim so downstream prompts
  // always read the same shape.
  const three: [string, string, string] = [
    pillars[0] ?? "",
    pillars[1] ?? "",
    pillars[2] ?? "",
  ];

  return {
    persona: oneOf(r.persona, ["manager", "executor"] as const, "executor"),
    core_pillars: three,
    keywords: strArray(r.keywords),
    company_context: str(r.company_context),
  };
}

// ─── Stage 2: master resume filtering ────────────────────────────────────────

export function parseFilteredContent(raw: unknown): FilteredContent {
  const r = asRecord(raw, "Resume filtering");

  const selectedExperiences = strArray(r.selected_experiences);
  const selectedProjects = strArray(r.selected_projects);
  if (selectedExperiences.length === 0 && selectedProjects.length === 0) {
    throw new InvalidResumeOutputError(
      "Resume filtering",
      "neither experiences nor projects were selected",
    );
  }

  const removedReasons: Record<string, string> = {};
  if (typeof r.removed_reasons === "object" && r.removed_reasons !== null) {
    for (const [k, v] of Object.entries(r.removed_reasons as Record<string, unknown>)) {
      if (typeof v === "string") removedReasons[k] = v;
    }
  }

  return {
    selected_experiences: selectedExperiences,
    selected_projects: selectedProjects,
    priority_order: strArray(r.priority_order),
    removed_reasons: removedReasons,
  };
}

// ─── Stage 3 / final block: submitted resume content ─────────────────────────

function parseBasics(raw: unknown): ResumeBasics {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    name: str(r.name),
    email: str(r.email),
    phone: str(r.phone),
    website: str(r.website),
    summary: str(r.summary),
  };
}

function parseSkills(raw: unknown): ResumeSkills {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { hard: strArray(r.hard), soft: strArray(r.soft) };
}

function parseExperience(r: Record<string, unknown>): ResumeExperience {
  return {
    id: id(r.id),
    company: str(r.company),
    position: str(r.position),
    start_date: str(r.start_date),
    end_date: str(r.end_date),
    is_current: r.is_current === true,
    description: str(r.description),
    leave_reason: str(r.leave_reason),
  };
}

function parseProject(r: Record<string, unknown>): ResumeProject {
  return {
    id: id(r.id),
    name: str(r.name),
    company: str(r.company),
    start_date: str(r.start_date),
    end_date: str(r.end_date),
    description: str(r.description),
    decisions: str(r.decisions),
    achievement: str(r.achievement),
    contribution: str(r.contribution),
    tech_stack: str(r.tech_stack),
  };
}

function parseEducation(r: Record<string, unknown>): ResumeEducation {
  return {
    id: id(r.id),
    school: str(r.school),
    major: str(r.major),
    degree: oneOf(r.degree, DEGREES, "기타"),
    start_date: str(r.start_date),
    end_date: str(r.end_date),
    entry_type: oneOf(r.entry_type, ENTRY_TYPES, "입학"),
    status: oneOf(r.status, STATUSES, "졸업"),
  };
}

function parseActivity(r: Record<string, unknown>): ResumeActivity {
  return {
    id: id(r.id),
    title: str(r.title),
    issuer: str(r.issuer),
    date: str(r.date),
    description: str(r.description),
  };
}

/**
 * Guards the payload that gets persisted and later injected into the interview
 * prompt. Everything recoverable is normalized; the one hard requirement is
 * that the resume is not effectively empty, because an empty one serializes to
 * a blank string and silently disappears from the interview context.
 */
export function parseSubmittedResumeContent(
  raw: unknown,
  stage = "Resume rewrite",
): SubmittedResumeContent {
  const r = asRecord(raw, stage);

  const basics = parseBasics(r.basics);
  const experiences = objArray(r.experiences).map(parseExperience);
  const projects = objArray(r.projects).map(parseProject);

  const hasSubstance =
    basics.name.trim().length > 0 ||
    basics.summary.trim().length > 0 ||
    experiences.length > 0 ||
    projects.length > 0;
  if (!hasSubstance) {
    throw new InvalidResumeOutputError(
      stage,
      "resume has no name, summary, experiences, or projects",
    );
  }

  const content: SubmittedResumeContent = {
    basics,
    experiences,
    projects,
    skills: parseSkills(r.skills),
    educations: objArray(r.educations).map(parseEducation),
    activities: objArray(r.activities).map(parseActivity),
    self_intro_memo: str(r.self_intro_memo),
  };

  // Only set when the model actually produced one — the serializer falls back
  // to basics.summary, which is where this text usually lands in practice.
  const summary = str(r.summary).trim();
  if (summary) content.summary = summary;

  return content;
}

// ─── Final block: JD-fit analysis ────────────────────────────────────────────

// Unlike the resume itself, an empty analysis is tolerable — it drives an
// informational tab, not the interview. Never throws.
export function parseResumeAnalysis(raw: unknown): ResumeAnalysis {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { keyword_mapping: [], highlights: [], missing_items: [] };
  }
  const r = raw as Record<string, unknown>;

  return {
    keyword_mapping: objArray(r.keyword_mapping)
      .map((m) => ({ keyword: str(m.keyword), found_in: str(m.found_in) }))
      .filter((m) => m.keyword),
    highlights: objArray(r.highlights)
      .map((h) => ({ item: str(h.item), reason: str(h.reason) }))
      .filter((h) => h.item),
    missing_items: objArray(r.missing_items)
      .map((m) => ({ item: str(m.item), recommendation: str(m.recommendation) }))
      .filter((m) => m.item),
  };
}
