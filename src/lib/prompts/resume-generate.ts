import type { MasterResume, SubmittedResumeContent } from '@/lib/types/master-resume';

// ─── Stage 1 output ──────────────────────────────────────────────────────────

export interface JdAnalysis {
  persona: 'manager' | 'executor';
  core_pillars: [string, string, string];
  keywords: string[];
  company_context: string;
}

// ─── Stage 2 output ──────────────────────────────────────────────────────────

export interface FilteredContent {
  selected_experiences: string[];
  selected_projects: string[];
  priority_order: string[];
  removed_reasons: Record<string, string>;
}

// ─── Stage 3 output ──────────────────────────────────────────────────────────

export type RewrittenContent = SubmittedResumeContent;

// ─── Stage 1: JD analysis + strategy ─────────────────────────────────────────

export function buildJdAnalysisPrompt(
  companyName: string,
  position: string,
  jdText: string
): string {
  return `당신은 IT 채용 전문 컨설턴트입니다. 아래 채용 공고를 분석하여 이력서 최적화 전략을 수립하세요.

회사명: ${companyName}
포지션: ${position}

채용 공고:
${jdText}

다음 기준에 따라 분석하세요:
1. 포지션 페르소나: 이 포지션이 "관리자(manager, 전략/리더십/조율 중심)" 인지 "실행가(executor, 기술/실행/구현 중심)" 인지 판단
2. 3대 핵심 역량(기둥): JD에서 가장 강조하는 역량 3가지를 추출 (기술 스택 나열 금지, 역량 단위로 추상화)
3. AI 스크리닝 키워드: ATS(Applicant Tracking System)를 통과하기 위한 필수 키워드 5개
4. 기업 컨텍스트: 기업 규모(스타트업/대기업), 국내/외국계, 문화적 특성 한 문장으로 요약

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "persona": "manager" | "executor",
  "core_pillars": ["역량1", "역량2", "역량3"],
  "keywords": ["키워드1", "키워드2", "키워드3", "키워드4", "키워드5"],
  "company_context": "기업 컨텍스트 한 문장"
}`;
}

// ─── Stage 2: Master resume filtering ────────────────────────────────────────

export function buildFilterPrompt(
  masterResume: MasterResume,
  jdAnalysis: JdAnalysis
): string {
  const experienceList = masterResume.experiences
    .map(e => `id: ${e.id}, company: ${e.company}, position: ${e.position}, description: ${e.description.slice(0, 200)}`)
    .join('\n');

  const projectList = masterResume.projects
    .map(p => `id: ${p.id}, name: ${p.name}, achievement: ${p.achievement.slice(0, 200)}, tech_stack: ${p.tech_stack}`)
    .join('\n');

  return `당신은 IT 이력서 편집 전문가입니다. 마스터 이력서에서 JD에 최적화된 항목만 선별하세요.

JD 분석 결과:
- 포지션 페르소나: ${jdAnalysis.persona === 'manager' ? '관리자 (전략/리더십/조율 중심)' : '실행가 (기술/실행/구현 중심)'}
- 핵심 역량 기둥: ${jdAnalysis.core_pillars.join(', ')}
- 필수 키워드: ${jdAnalysis.keywords.join(', ')}
- 기업 컨텍스트: ${jdAnalysis.company_context}

경력 목록:
${experienceList || '(없음)'}

프로젝트 목록:
${projectList || '(없음)'}

선별 기준:
1. JD 핵심 역량 기둥과 무관한 경력/프로젝트 제거
2. 성과(achievement)가 비어있거나 단순 업무 나열에 불과한 프로젝트 제거
3. 비즈니스 임팩트(매출, 사용자 수, 성능 개선 등 수치 성과)가 있는 항목 우선
4. 최종 선별 후 1.5~2페이지 분량(약 6~10개 항목)으로 압축

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요:
{
  "selected_experiences": ["경력 id 목록"],
  "selected_projects": ["프로젝트 id 목록"],
  "priority_order": ["우선순위 순서로 정렬된 id 목록 (경력+프로젝트 통합)"],
  "removed_reasons": {
    "제거된 항목 id": "제거 이유"
  }
}`;
}

// ─── Stage 3: Sentence rewriting ─────────────────────────────────────────────

export function buildRewritePrompt(
  masterResume: MasterResume,
  filteredContent: FilteredContent,
  jdAnalysis: JdAnalysis,
  companyName: string,
  position: string
): string {
  const selectedExperiences = masterResume.experiences
    .filter(e => filteredContent.selected_experiences.includes(e.id))
    .sort((a, b) => {
      const aIdx = filteredContent.priority_order.indexOf(a.id);
      const bIdx = filteredContent.priority_order.indexOf(b.id);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

  const selectedProjects = masterResume.projects
    .filter(p => filteredContent.selected_projects.includes(p.id))
    .sort((a, b) => {
      const aIdx = filteredContent.priority_order.indexOf(a.id);
      const bIdx = filteredContent.priority_order.indexOf(b.id);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });

  const experienceDetails = selectedExperiences.map(e =>
    `[경력 id:${e.id}]
회사: ${e.company} | 직책: ${e.position} | 기간: ${e.start_date} ~ ${e.is_current ? '현재' : e.end_date}
업무내용: ${e.description}`
  ).join('\n\n');

  const projectDetails = selectedProjects.map(p =>
    `[프로젝트 id:${p.id}]
프로젝트명: ${p.name} | 소속: ${p.company} | 기간: ${p.start_date} ~ ${p.end_date}
기술스택: ${p.tech_stack}
내용: ${p.description}
의사결정/협업: ${p.decisions}
성과: ${p.achievement}
기여도: ${p.contribution}`
  ).join('\n\n');

  // Provide the full master resume structure as the base JSON template
  const baseJson = JSON.stringify({
    basics: masterResume.basics,
    experiences: selectedExperiences,
    projects: selectedProjects,
    skills: masterResume.skills,
    educations: masterResume.educations,
    activities: masterResume.activities,
    self_intro_memo: masterResume.self_intro_memo,
    summary: '',
  }, null, 2);

  return `당신은 IT 이력서 작성을 돕는 도구입니다. 아래 마스터 이력서 JSON을 기반으로 ${companyName}의 "${position}" 포지션 JD에 최적화된 제출용 이력서 JSON을 생성하세요.

⚠️ 매우 중요 — 주체 혼동 금지:
- 이 이력서의 주인공(지원자)은 "${position}" 포지션에 지원하는 사람이며, 신원은 마스터 이력서의 basics와 경력에서만 가져온다.
- 당신(작성 도구)의 역할명("이력서 작성 전문가", "도구" 등)을 이력서 본문(특히 summary)에 절대 넣지 말 것.
- summary는 반드시 지원자를 "${position}" 직군의 전문가로 서술해야 한다.

JD 전략:
- 포지션 페르소나: ${jdAnalysis.persona === 'manager' ? '관리자 (전략/리더십/조율 중심)' : '실행가 (기술/실행/구현 중심)'}
- 핵심 역량 기둥: ${jdAnalysis.core_pillars.join(', ')}
- 필수 키워드 (반드시 자연스럽게 삽입): ${jdAnalysis.keywords.join(', ')}
- 기업 컨텍스트: ${jdAnalysis.company_context}

선별된 경력 원문:
${experienceDetails || '(없음)'}

선별된 프로젝트 원문:
${projectDetails || '(없음)'}

## 재작성 원칙

1. **개조식(불릿) 필수 — 줄글 절대 금지**: description/decisions/achievement는 서술형 문장이 아니라 **마크다운 불릿 리스트**로 작성한다.
   - 각 항목은 \`- \`(하이픈+공백)로 시작하는 별도 줄
   - 각 불릿은 **명사형/동사 어간 종결**로 끝낸다 (예: "...전환율 8% 개선", "...분석 자동화 구축"). "~했습니다", "~추진했습니다", "~주도했습니다" 같은 **서술형 종결어미 금지**
   - 한 불릿 = 한 가지 성과/활동. 한 줄당 1~2줄 분량으로 간결하게
   - 항목당 불릿 2~4개 권장
   - **나쁜 예 (금지)**: "고객사 인터뷰와 시장조사를 통해 핵심 니즈를 파악하고 Agile 프로세스 하에 프로젝트를 주도했습니다."
   - **좋은 예**: "- 고객사 인터뷰·시장조사 기반 핵심 니즈 정의 및 Agile 기반 프로젝트 리딩"
2. **텍스트 필드만 재작성**: experiences의 description, projects의 description/decisions/achievement/contribution, self_intro_memo — JD 언어로 최적화 (위 개조식 규칙 적용)
3. **수치 필수**: achievement 불릿에는 반드시 수치(%, 배수, 건수, 금액) 포함. 원본에 수치 없으면 기여도/맥락 기반 합리적 추정치 사용하되 "(추정)" 표시
4. **contribution 구체화**: 백분율이나 역할 비중으로 구체화 (예: "백엔드 개발 80%, 인프라 20%")
5. **JD 키워드 삽입**: 필수 키워드를 불릿에 자연스럽게 배치
6. **원본 유지 필드**: id, company, position, start_date, end_date, is_current, leave_reason, name, tech_stack, school, degree, major, status, entry_type, title, issuer, date — 마스터 이력서 원본 그대로
7. **basics**: 원본 그대로 유지 (이름, 이메일, 연락처 등 변경 금지)
8. **skills/educations/activities**: 원본 그대로 유지
9. **summary 필드**: 지원자(="${position}" 직군 전문가) 본인의 차별점을 JD 핵심 역량 기둥(${jdAnalysis.core_pillars.join(', ')}) 중심으로 ${companyName}의 언어로 3~4문장 서술 (summary만 예외적으로 서술형 허용).
   - 주어는 지원자 본인의 직무 정체성("${position}")이어야 한다. "IT 이력서 작성 전문가" 등 작성 도구 역할이나 회사 소개(예: "${companyName}는 ~기업입니다")를 summary에 넣지 말 것.
   - 마스터 이력서의 실제 경력/성과에 근거한 내용만 작성하고, JD를 그대로 복붙하거나 회사 소개문을 베끼지 말 것.

## 마스터 이력서 기반 JSON (이 구조를 유지하면서 텍스트 필드만 재작성)

${baseJson}

반드시 유효한 JSON만 반환하세요. 마크다운 코드 블록(\`\`\`)을 포함하지 마세요. JSON 외 다른 텍스트는 절대 포함하지 마세요.`;
}

// ─── Stage 4: Final resume + summary ─────────────────────────────────────────

export function buildFinalResumePrompt(
  rewrittenContent: RewrittenContent,
  jdAnalysis: JdAnalysis,
  companyName: string,
  position: string
): string {
  return `당신은 IT 채용 전문 컨설턴트입니다. 아래 JD 최적화된 이력서 JSON을 분석하여 키워드 매핑과 개선 사항을 도출하세요.

지원 회사: ${companyName}
지원 포지션: ${position}

JD 전략:
- 핵심 역량 기둥: ${jdAnalysis.core_pillars.join(', ')}
- 필수 키워드: ${jdAnalysis.keywords.join(', ')}
- 기업 컨텍스트: ${jdAnalysis.company_context}

최적화된 이력서 JSON:
${JSON.stringify(rewrittenContent, null, 2)}

반드시 아래 두 구분자를 정확히 포함하여 응답하세요.

---RESUME_JSON---
${JSON.stringify(rewrittenContent)}
---ANALYSIS---
{
  "keyword_mapping": [
    { "keyword": "JD 핵심 키워드", "found_in": "이 키워드가 드러나는 위치를 사람이 읽을 수 있게 한국어로 서술. 배열 인덱스나 필드 경로(예: experiences[0].description) 절대 금지. 회사명·프로젝트명·섹션명으로 표기 (예: 'Paprika Data Lab 경력', 'AI 텍스트 분석 프로젝트 성과', '핵심 역량 요약'). 여러 곳이면 쉼표로 구분" }
  ],
  "highlights": [
    { "item": "강조할 성과 또는 경험", "reason": "강조 이유" }
  ],
  "missing_items": [
    { "item": "JD 요구사항 중 미충족 항목", "recommendation": "보완 방법" }
  ]
}`;
}
