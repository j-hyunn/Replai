export interface AnalysisOutput {
  analysis: {
    jd_keywords: string[];
    strengths: string[];
    preferred_gaps: string[];
  };
  questions: Array<{
    id: string;
    question: string;
    type: "common" | "project" | "preferred_gap";
    intent: string;
    good_answer_tips: string;
    depth: number;
    source: string;
  }>;
}

export interface UserProfileContext {
  name?: string | null;
  jobCategory: string | null;
  yearsOfExperience: number | null;
  techStack: string[];
  skills: string[];
}

export function buildAnalysisPrompt(params: {
  jdText: string;
  resumeTexts: string[];
  persona: string;
  durationMinutes: number;
  userProfile?: UserProfileContext;
}): string {
  const { jdText, resumeTexts, persona, durationMinutes, userProfile } = params;
  const questionCount = Math.round((durationMinutes / 5) * 1.5);

  const personaContext = {
    explorer: "경험 탐색형 면접으로, 지원자가 자신의 경험을 편안하게 풀어낼 수 있도록 열린 질문을 선호합니다.",
    pressure: "심층 압박형 면접으로, 논리적 검증과 날카로운 꼬리질문을 통해 지원자의 사고력을 검증합니다.",
  }[persona] ?? "";

  // resumeTexts already contains labeled sections (e.g. "[이력서: ...]\n...", "[포트폴리오: ...]\n...")
  const resumeSection =
    resumeTexts.length > 0
      ? resumeTexts.join("\n\n")
      : "제출된 문서가 없습니다.";

  const profileSection = userProfile
    ? `## 지원자 프로필
- 직군: ${userProfile.jobCategory ?? "미입력"}
- 경력: ${userProfile.yearsOfExperience != null ? `${userProfile.yearsOfExperience}년` : "미입력"}
- 기술 스택: ${userProfile.techStack.length > 0 ? userProfile.techStack.join(", ") : "미입력"}
- 보유 스킬: ${userProfile.skills.length > 0 ? userProfile.skills.join(", ") : "미입력"}`
    : "";

  return `당신은 IT 직무 면접 전문가입니다. 아래 JD와 이력서를 분석해 면접 질문 세트를 생성하세요.

## 면접 컨텍스트
- 페르소나: ${personaContext}
- 면접 시간: ${durationMinutes}분
- 목표 질문 수: ${questionCount}개 (시간 여유를 위한 버퍼 포함)
${profileSection ? `\n${profileSection}` : ""}
## JD 제공 여부
${jdText
      ? "✅ JD가 제공되었습니다. common 질문의 첫 번째는 자기소개, 두 번째는 지원동기, 세 번째는 이직 사유를 반드시 포함하세요."
      : "❌ JD가 제공되지 않았습니다. 지원동기 질문은 절대 포함하지 마세요. 첫 번째는 자기소개, 두 번째는 이직 사유를 반드시 포함하세요."}

## JD (채용공고)
${jdText || (userProfile?.jobCategory ? `없음 — 지원자 직군(${userProfile.jobCategory}) 기반 일반 면접 질문을 생성하세요.` : "없음 — 일반적인 IT 직무 면접 질문을 생성하세요.")}

## 이력서
${resumeSection}

## 지시사항
1. JD의 핵심 키워드와 요구 역량을 추출하세요.
2. 이력서에서 강점과 JD 대비 부족한 부분(preferred_gaps)을 파악하세요.
3. 다음 타입으로 질문을 구성하세요:
   - common: 공통 질문 (아래 필수 규칙 참고)
   - project: 이력서의 실제 프로젝트/경험 기반 질문
   - preferred_gap: JD 요구사항 대비 부족한 부분 검증 질문
4. **common 질문 필수 규칙**:
   - JD가 제공된 경우: 질문 목록의 첫 번째는 반드시 자기소개(id: "q1"), 두 번째는 반드시 지원동기(id: "q2"), 세 번째는 반드시 이직 사유(id: "q3")여야 합니다.
   - JD가 제공되지 않은 경우: 첫 번째는 반드시 자기소개(id: "q1"), 두 번째는 반드시 이직 사유(id: "q2")여야 합니다. 지원동기는 절대 포함하지 마세요.
   - 이후 강약점 등 추가 common 질문을 구성하세요.
5. 각 질문의 intent(의도)와 good_answer_tips(좋은 답변 팁)를 작성하세요.
6. depth는 0으로 설정하세요 (면접 중 추가 질문 시 증가).

## 출력 형식 (반드시 유효한 JSON만 반환, 마크다운 코드 블록 없이)
{
  "analysis": {
    "jd_keywords": ["키워드1", "키워드2"],
    "strengths": ["강점1", "강점2"],
    "preferred_gaps": ["부족한점1", "부족한점2"]
  },
  "questions": [
    {
      "id": "q1",
      "question": "질문 내용",
      "type": "common",
      "intent": "이 질문의 의도",
      "good_answer_tips": "좋은 답변 가이드",
      "depth": 0,
      "source": "출처 (JD 키워드 또는 이력서 항목)"
    }
  ]
}`;
}
