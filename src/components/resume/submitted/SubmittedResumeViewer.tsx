"use client";

import { Button } from "@/components/ui/button";
import { MarkdownPreview } from "@/components/ui/markdown-preview";
import { PrinterIcon } from "lucide-react";
import type {
  SubmittedResumeContent,
  ResumeExperience,
  ResumeProject,
  ResumeEducation,
  ResumeActivity,
} from "@/lib/types/master-resume";

interface Props {
  contentMd: string;
  content_json?: SubmittedResumeContent | null;
}

function formatDateRange(start: string, end: string, isCurrent: boolean): string {
  if (isCurrent) return `${start} ~ 재직 중`;
  if (!end) return start;
  return `${start} ~ ${end}`;
}

// Standard resume section heading: large bold title with a full-width rule underneath.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-bold tracking-tight text-foreground border-b border-foreground/20 pb-1.5 mb-3">
      {children}
    </h2>
  );
}

// Small uppercase label used for sub-groups (주요 성과, 주요 프로젝트).
const microLabel = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";

const bulletBody =
  "text-sm leading-relaxed text-foreground/90 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-1 [&_p]:my-1";

function ProjectItem({ proj, nested = false }: { proj: ResumeProject; nested?: boolean }) {
  const period =
    proj.start_date && proj.end_date
      ? `${proj.start_date} ~ ${proj.end_date}`
      : proj.start_date;
  const meta = [
    proj.tech_stack ? `기술 스택 · ${proj.tech_stack}` : "",
    proj.contribution ? `기여도 · ${proj.contribution}` : "",
  ]
    .filter(Boolean)
    .join("    ");

  return (
    <div className={nested ? "space-y-1 border-l-2 border-muted pl-3" : "space-y-1.5"}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={nested ? "text-sm font-semibold" : "text-base font-bold"}>{proj.name}</span>
          {!nested && proj.company && (
            <span className="text-sm text-muted-foreground">{proj.company}</span>
          )}
        </div>
        {period && (
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{period}</span>
        )}
      </div>
      {proj.description && <MarkdownPreview className={bulletBody}>{proj.description}</MarkdownPreview>}
      {proj.decisions && <MarkdownPreview className={bulletBody}>{proj.decisions}</MarkdownPreview>}
      {proj.achievement && (
        <div className="space-y-0.5">
          <p className={microLabel}>주요 성과</p>
          <MarkdownPreview className={bulletBody}>{proj.achievement}</MarkdownPreview>
        </div>
      )}
      {meta && <p className="text-xs text-muted-foreground pt-0.5">{meta}</p>}
    </div>
  );
}

function ExperienceItem({ exp, projects }: { exp: ResumeExperience; projects: ResumeProject[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-base font-bold">{exp.company}</span>
          {exp.position && <span className="text-sm text-muted-foreground">{exp.position}</span>}
        </div>
        <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
          {formatDateRange(exp.start_date, exp.end_date, exp.is_current)}
        </span>
      </div>
      {exp.description && <MarkdownPreview className={bulletBody}>{exp.description}</MarkdownPreview>}
      {projects.length > 0 && (
        <div className="space-y-3 pt-1.5">
          <p className={microLabel}>주요 프로젝트</p>
          {projects.map((proj) => (
            <ProjectItem key={proj.id} proj={proj} nested />
          ))}
        </div>
      )}
    </div>
  );
}

function EducationItem({ edu }: { edu: ResumeEducation }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold">{edu.school}</span>
        {edu.major && <span className="text-sm text-muted-foreground">{edu.major}</span>}
        {edu.degree && <span className="text-sm text-muted-foreground">· {edu.degree}</span>}
      </div>
      <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">
        {edu.start_date && edu.end_date ? `${edu.start_date} ~ ${edu.end_date}` : edu.start_date}
      </span>
    </div>
  );
}

function ActivityItem({ act }: { act: ResumeActivity }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold">{act.title}</span>
          {act.issuer && <span className="text-sm text-muted-foreground">{act.issuer}</span>}
        </div>
        {act.date && (
          <span className="text-sm text-muted-foreground whitespace-nowrap shrink-0">{act.date}</span>
        )}
      </div>
      {act.description && <p className="text-sm text-muted-foreground">{act.description}</p>}
    </div>
  );
}

function JsonResumeView({ content }: { content: SubmittedResumeContent }) {
  const { basics, experiences, projects, skills, educations, activities } = content;
  // AI may place the summary at top-level or inside basics.summary
  const summary = content.summary || basics?.summary || "";

  const safeExperiences = Array.isArray(experiences) ? experiences : [];
  const safeProjects = Array.isArray(projects) ? projects : [];
  const safeEducations = Array.isArray(educations) ? educations : [];
  const safeActivities = Array.isArray(activities) ? activities : [];
  const hardSkills = Array.isArray(skills?.hard) ? skills.hard : [];
  const softSkills = Array.isArray(skills?.soft) ? skills.soft : [];

  // Group projects under the experience of the same company; leftovers go to "기타 프로젝트".
  const normalize = (s: string) => (s ?? "").trim().toLowerCase();
  const matchedProjectIds = new Set<string>();
  const projectsByExperience = safeExperiences.map((exp) => {
    const matched = safeProjects.filter(
      (p) => p.company && normalize(p.company) === normalize(exp.company)
    );
    matched.forEach((p) => matchedProjectIds.add(p.id));
    return matched;
  });
  const otherProjects = safeProjects.filter((p) => !matchedProjectIds.has(p.id));

  const contactLine = [basics?.email, basics?.phone, basics?.website].filter(Boolean).join("  ·  ");

  return (
    <div className="space-y-8">
      {/* 헤더 — 이름 + 연락처 (가운데 정렬, 표준 이력서 스타일) */}
      <div className="text-center space-y-2 pb-1">
        <h1 className="text-3xl font-bold tracking-tight">{basics?.name}</h1>
        {contactLine && <p className="text-sm text-muted-foreground">{contactLine}</p>}
      </div>

      {/* 핵심 역량 */}
      {summary && (
        <section>
          <SectionTitle>핵심 역량</SectionTitle>
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">{summary}</p>
        </section>
      )}

      {/* 경력 (해당 회사에서 진행한 프로젝트 포함) */}
      {safeExperiences.length > 0 && (
        <section>
          <SectionTitle>경력</SectionTitle>
          <div className="space-y-5">
            {safeExperiences.map((exp, i) => (
              <ExperienceItem key={exp.id} exp={exp} projects={projectsByExperience[i]} />
            ))}
          </div>
        </section>
      )}

      {/* 기타 프로젝트 (특정 경력에 매칭되지 않는 프로젝트) */}
      {otherProjects.length > 0 && (
        <section>
          <SectionTitle>기타 프로젝트</SectionTitle>
          <div className="space-y-4">
            {otherProjects.map((proj) => (
              <ProjectItem key={proj.id} proj={proj} />
            ))}
          </div>
        </section>
      )}

      {/* 스킬 */}
      {(hardSkills.length > 0 || softSkills.length > 0) && (
        <section>
          <SectionTitle>스킬</SectionTitle>
          <div className="space-y-1">
            {hardSkills.length > 0 && (
              <p className="text-sm text-foreground/90">
                <span className="font-semibold mr-2">전문 기술</span>
                {hardSkills.join("  ·  ")}
              </p>
            )}
            {softSkills.length > 0 && (
              <p className="text-sm text-foreground/90">
                <span className="font-semibold mr-2">소프트 스킬</span>
                {softSkills.join("  ·  ")}
              </p>
            )}
          </div>
        </section>
      )}

      {/* 학력 */}
      {safeEducations.length > 0 && (
        <section>
          <SectionTitle>학력</SectionTitle>
          <div className="space-y-2">
            {safeEducations.map((edu) => (
              <EducationItem key={edu.id} edu={edu} />
            ))}
          </div>
        </section>
      )}

      {/* 활동 / 수상 */}
      {safeActivities.length > 0 && (
        <section>
          <SectionTitle>활동 / 수상</SectionTitle>
          <div className="space-y-2">
            {safeActivities.map((act) => (
              <ActivityItem key={act.id} act={act} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function SubmittedResumeViewer({ contentMd, content_json }: Props) {
  const hasContent = content_json != null || (contentMd && contentMd.trim().length > 0);

  return (
    <div className="border rounded-lg p-8 bg-background print:border-0 print:p-0">
      {!hasContent ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          이력서 내용을 불러올 수 없습니다.
        </p>
      ) : content_json ? (
        <JsonResumeView content={content_json} />
      ) : (
        <MarkdownPreview
          className={[
            "text-base leading-relaxed",
            "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-2",
            "[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:border-b [&_h2]:pb-1",
            "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1",
            "[&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
            "[&_p]:my-1.5",
            "[&_blockquote]:my-2",
            "print:text-sm",
          ].join(" ")}
        >
          {contentMd}
        </MarkdownPreview>
      )}
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <PrinterIcon className="size-3.5 mr-1" />
      PDF 저장
    </Button>
  );
}
