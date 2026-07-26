import type { AnalysisOutput } from "./analysis";

export interface EvaluationOutput {
  total_score: number;
  summary: string;
  strengths: string;
  strength_keywords: string[];
  improvements: string;
  improvement_keywords: string[];
  answers: Array<{
    question_id: string;
    question: string;
    answer: string;
    scores: {
      logic: number;
      specificity: number;
      job_fit: number;
    };
    average: number;
    intent: string[];
    feedback: string;
    model_answers: Array<{ question: string; model_answer: string }>;
  }>;
}

export interface QaTurn { speaker: "interviewer" | "user"; content: string }
export interface QaGroup {
  question_id: string;
  question: string;
  intent: string;
  good_answer_tips: string;
  turns: QaTurn[];
  used_hint: boolean;
  skipped: boolean;
}

export interface QuestionEvaluationResult {
  question_id: string;
  question: string;
  answer: string;
  scores: { logic: number; specificity: number; job_fit: number };
  average: number;
  intent: string[];
  feedback: string;
  model_answers: Array<{ question: string; model_answer: string }>;
}

export interface SummaryEvaluationResult {
  total_score: number;
  summary: string;
  strengths: string;
  strength_keywords: string[];
  improvements: string;
  improvement_keywords: string[];
}

// Stage 1: Evaluate a single question group
export function buildQuestionEvaluationPrompt(params: {
  qaGroup: QaGroup;
  resumeTexts: string[];
  jdKeywords: string[];
}): string {
  const { qaGroup: g, resumeTexts, jdKeywords } = params;

  const resumeSection =
    resumeTexts.length > 0 ? resumeTexts.join("\n\n") : "제출된 문서가 없습니다.";

  const hasJd = jdKeywords.length > 0;
  const jobFitLabel = hasJd
    ? `job_fit (직무 적합성): JD 핵심 키워드(${jdKeywords.join(", ")})와의 부합도`
    : "job_fit (직군 일반 역량 부합도): JD가 없으므로 지원자의 직군(${직군 정보 없음})에서 일반적으로 요구되는 역량과의 부합도";

  const dialogue = g.turns
    .map((t) => `[${t.speaker === "interviewer" ? "면접관" : "지원자"}] ${t.content}`)
    .join("\n");

  if (g.skipped) {
    return `아래 JSON을 그대로 반환하세요 (유효한 JSON만, 마크다운 코드 블록 없이):
{
  "question_id": "${g.question_id}",
  "question": ${JSON.stringify(g.question)},
  "answer": "건너뜀",
  "scores": { "logic": 0, "specificity": 0, "job_fit": 0 },
  "average": 0,
  "intent": [],
  "feedback": "건너뛴 질문입니다.",
  "model_answers": []
}`;
  }

  return `당신은 IT 직무 면접 평가 전문가입니다. 아래 질문 그룹 하나를 평가하고 결과 JSON을 반환하세요.

## 지원자 제출 문서
${resumeSection}

## 평가 대상 질문 그룹
- question_id: ${g.question_id}
- 질문: ${g.question}
- 질문 의도: ${g.intent}
- 좋은 답변 포인트: ${g.good_answer_tips}
- 모범 답안 참조: ${g.used_hint ? "예" : "아니오"} / 건너뜀: 아니오

## 대화 내용
${dialogue}

## 평가 기준 (0~100점)
- **logic (논리성)**: 답변의 논리적 구조와 일관성
- **specificity (구체성)**: 구체적인 사례, 수치, 결과 포함 여부
- **${jobFitLabel}**

## 점수 앵커
- 90~100: 수치 + 구체적 사례 + 트레이드오프까지 언급. 질문 의도를 완전히 충족.
- 70~89: 구체적이나 수치 또는 트레이드오프 중 하나 부족. 의도의 대부분 충족.
- 50~69: 내용은 있으나 일반론 수준이거나 본인 역할이 불명확. 의도 부분 충족.
- 30~49: 모호하거나 질문 의도와 관련성 낮음. 표면적 언급만.
- 0~29: 건너뜀, 무관한 답변, 또는 응답 없음.

## 특수 마커 처리 규칙
- **모범 답안 참조: 예** → 모든 점수를 최대 40점으로 제한. feedback에 "모범 답안을 참조한 답변입니다" 명시.

## 평가 지시사항
1. intent: 면접관이 이 질문으로 확인하려 한 핵심을 2~4개의 짧은 키워드 배열로 추출. 문장 금지. 예: ["역할 명확성", "기술 이해도"]
2. feedback: 각 점수 영역(논리성·구체성·직무 적합성)의 채점 근거를 포함하되, 별도 나열 없이 자연스러운 한 문단. 잘한 점과 부족한 점 균형 있게 서술. 마지막 문장에 핵심 개선 방향 제시.
3. average: scores 세 항목의 산술 평균 (소수점 반올림).

## 모범 답안 생성 지침 (model_answers)
- 모범 답안 참조(used_hint) 여부와 무관하게 모든 질문에서 반드시 생성.
- 지원자 제출 문서를 먼저 스캔: 등장하는 프로젝트명·역할·성과 수치를 파악.
- 반드시 문서에 등장하는 프로젝트명, 본인 역할, 주요 성과(수치)를 구체적으로 포함. 추상적·일반적 답변 금지.
- 문서에 없는 상황, 수치, 프로젝트, 경험은 절대 만들거나 추측하지 마세요.
- 1인칭 한국어로. STAR 기법(상황-과제-행동-결과)을 문서 범위 안에서 활용.
- 본 질문과 꼬리질문의 model_answer가 같은 프로젝트를 반복하지 않도록, 가능한 경우 서로 다른 경험 활용.

## 출력 형식 (반드시 유효한 JSON만 반환, 마크다운 코드 블록 없이)
{
  "question_id": "${g.question_id}",
  "question": "질문 내용",
  "answer": "지원자 답변 요약",
  "scores": { "logic": 85, "specificity": 70, "job_fit": 90 },
  "average": 82,
  "intent": ["키워드1", "키워드2"],
  "feedback": "피드백 한 문단",
  "model_answers": [
    { "question": "본 질문 내용", "model_answer": "본 질문 모범 답안" },
    { "question": "꼬리질문 1 내용", "model_answer": "꼬리질문 1 모범 답안" }
  ]
}`;
}

// Stage 2: Generate overall summary from per-question results
export function buildSummaryEvaluationPrompt(params: {
  questionResults: QuestionEvaluationResult[];
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
}): string {
  const { questionResults, analysisJson, resumeTexts } = params;

  const resumeSection =
    resumeTexts.length > 0 ? resumeTexts.join("\n\n") : "제출된 문서가 없습니다.";

  const answersText = questionResults
    .map((r) =>
      `### [${r.question_id}] ${r.question}
- 점수: logic=${r.scores.logic}, specificity=${r.scores.specificity}, job_fit=${r.scores.job_fit}, average=${r.average}
- intent: ${r.intent.join(", ")}
- feedback 요약: ${r.feedback}`
    )
    .join("\n\n");

  const totalScore =
    questionResults.length > 0
      ? Math.round(questionResults.reduce((sum, r) => sum + r.average, 0) / questionResults.length)
      : 0;

  return `당신은 IT 직무 면접 평가 전문가입니다. 아래 질문별 평가 결과를 바탕으로 전체 면접의 종합 평가를 생성하세요.

## 지원자 제출 문서
${resumeSection}

## JD 분석 요약
- 핵심 키워드: ${analysisJson.analysis.jd_keywords.join(", ") || "없음"}
- 강점: ${analysisJson.analysis.strengths.join(", ") || "없음"}
- 부족한 부분: ${analysisJson.analysis.preferred_gaps.join(", ") || "없음"}

## 질문별 평가 결과 (이미 계산된 값)
${answersText}

## 참고: 전체 평균 점수 = ${totalScore}점

## 종합 평가 지시사항
1. total_score: ${totalScore} (위 계산값을 그대로 사용)
2. summary: 전체 면접에 대한 종합 평가 3~5문장. 모범 답안 참조·건너뛰기 사용 여부도 언급.
3. strengths: 면접 전반에서 지원자가 잘한 점 3~5문장. 전체 흐름 속 강점 중심.
4. improvements: 면접 전반에서 개선해야 할 포인트 3~5문장. 구체적 개선 방향 포함.
5. strength_keywords: strengths에서 핵심 강점 2~4개 짧은 명사형 키워드. 문장 금지. 예: ["논리적 구조", "직무 이해도"]
6. improvement_keywords: improvements에서 핵심 개선 포인트 2~4개 짧은 명사형 키워드. 문장 금지. 예: ["수치 기반 근거", "답변 간결성"]

## 출력 형식 (반드시 유효한 JSON만 반환, 마크다운 코드 블록 없이)
{
  "total_score": ${totalScore},
  "summary": "전체 면접 종합 평가 (3~5문장)",
  "strengths": "면접 전반에서 잘한 점 (3~5문장)",
  "strength_keywords": ["강점키워드1", "강점키워드2"],
  "improvements": "면접 전반에서 개선할 점 (3~5문장)",
  "improvement_keywords": ["개선키워드1", "개선키워드2"]
}`;
}
