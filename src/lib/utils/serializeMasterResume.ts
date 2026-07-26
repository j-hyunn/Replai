import type {
  MasterResume,
  ResumeExperience,
  ResumeProject,
} from '@/lib/types/master-resume';

function formatPeriod(start: string, end: string, isCurrent = false): string {
  if (!start && !end && !isCurrent) return '';
  const endLabel = isCurrent ? '재직 중' : end;
  return [start, endLabel].filter(Boolean).join(' ~ ');
}

function pushField(lines: string[], label: string, value: string): void {
  if (value.trim()) lines.push(`- ${label}: ${value.trim()}`);
}

function serializeExperience(exp: ResumeExperience): string {
  const lines: string[] = [];
  const title = [exp.company, exp.position].filter((v) => v.trim()).join(' — ');
  if (title) lines.push(`### ${title}`);
  pushField(lines, '기간', formatPeriod(exp.start_date, exp.end_date, exp.is_current));
  pushField(lines, '업무 내용', exp.description);
  pushField(lines, '퇴사 사유', exp.leave_reason);
  return lines.join('\n');
}

function serializeProject(proj: ResumeProject): string {
  const lines: string[] = [];
  const title = [proj.name, proj.company ? `(${proj.company})` : '']
    .filter((v) => v.trim())
    .join(' ');
  if (title) lines.push(`### ${title}`);
  pushField(lines, '기간', formatPeriod(proj.start_date, proj.end_date));
  pushField(lines, '프로젝트 내용', proj.description);
  pushField(lines, '의사결정 및 협업', proj.decisions);
  pushField(lines, '성과', proj.achievement);
  pushField(lines, '기여도', proj.contribution);
  pushField(lines, '사용 기술', proj.tech_stack);
  return lines.join('\n');
}

/**
 * Serializes a structured master resume into markdown text for LLM prompts.
 * Empty fields and empty sections are omitted entirely.
 */
export function serializeMasterResume(resume: MasterResume): string {
  const sections: string[] = [];

  // Basics
  const basicsLines: string[] = [];
  pushField(basicsLines, '이름', resume.basics.name);
  pushField(basicsLines, '이메일', resume.basics.email);
  pushField(basicsLines, '연락처', resume.basics.phone);
  pushField(basicsLines, '웹사이트', resume.basics.website);
  pushField(basicsLines, '소개', resume.basics.summary);
  if (basicsLines.length > 0) sections.push(`## 기본 정보\n${basicsLines.join('\n')}`);

  // Experiences
  const expBlocks = resume.experiences.map(serializeExperience).filter(Boolean);
  if (expBlocks.length > 0) sections.push(`## 경력\n${expBlocks.join('\n\n')}`);

  // Projects
  const projBlocks = resume.projects.map(serializeProject).filter(Boolean);
  if (projBlocks.length > 0) sections.push(`## 프로젝트\n${projBlocks.join('\n\n')}`);

  // Skills
  const skillLines: string[] = [];
  pushField(skillLines, '하드 스킬', resume.skills.hard.join(', '));
  pushField(skillLines, '소프트 스킬', resume.skills.soft.join(', '));
  if (skillLines.length > 0) sections.push(`## 스킬\n${skillLines.join('\n')}`);

  // Educations
  const eduBlocks = resume.educations
    .map((edu) => {
      const lines: string[] = [];
      const title = [edu.school, edu.major].filter((v) => v.trim()).join(' — ');
      if (title) lines.push(`### ${title}`);
      pushField(lines, '학위', edu.degree);
      pushField(lines, '기간', formatPeriod(edu.start_date, edu.end_date));
      pushField(lines, '상태', `${edu.entry_type} / ${edu.status}`);
      return lines.join('\n');
    })
    .filter(Boolean);
  if (eduBlocks.length > 0) sections.push(`## 학력\n${eduBlocks.join('\n\n')}`);

  // Activities
  const actBlocks = resume.activities
    .map((act) => {
      const lines: string[] = [];
      if (act.title.trim()) lines.push(`### ${act.title.trim()}`);
      pushField(lines, '발급/주관', act.issuer);
      pushField(lines, '일자', act.date);
      pushField(lines, '내용', act.description);
      return lines.join('\n');
    })
    .filter(Boolean);
  if (actBlocks.length > 0) sections.push(`## 활동·자격\n${actBlocks.join('\n\n')}`);

  // Self intro memo
  if (resume.self_intro_memo.trim()) {
    sections.push(`## 자기소개 메모\n${resume.self_intro_memo.trim()}`);
  }

  return sections.join('\n\n');
}
