import type { AnalysisOutput } from "./analysis";

// Re-exported for compatibility with consumers that imported these types
// from the old single-prompt module.
export interface QaTurn {
  speaker: "interviewer" | "user";
  content: string;
}

export interface QaGroup {
  question_id: string;
  question: string;
  intent: string;
  good_answer_tips: string;
  turns: QaTurn[];
  used_hint: boolean;
  skipped: boolean;
}

// Legacy aggregate type kept so existing UI/DB readers compile while the
// new structured types (AnswerEvaluationOutput / SummaryEvaluationOutput)
// take over the actual evaluation contract. Built up server-side from
// per-question outputs + summary output + deterministic post-processing.
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
    scores: { logic: number; specificity: number; job_fit: number };
    average: number;
    intent: string[];
    feedback: string;
    model_answers: Array<{ question: string; intent: string[]; model_answer: string }>;
  }>;
}

function resumeSectionOf(resumeTexts: string[]): string {
  return resumeTexts.length > 0
    ? resumeTexts.join("\n\n")
    : "제출된 문서가 없습니다.";
}

function jdSectionOf(analysisJson: AnalysisOutput): string {
  return [
    `- 핵심 키워드: ${analysisJson.analysis.jd_keywords.join(", ") || "없음"}`,
    `- 강점: ${analysisJson.analysis.strengths.join(", ") || "없음"}`,
    `- 부족한 부분: ${analysisJson.analysis.preferred_gaps.join(", ") || "없음"}`,
  ].join("\n");
}

// Anchor rubric is the same for every single-answer evaluation call.
// Keeping it as a constant ensures every question is judged on the same
// scale (the core reason we split into per-question calls in the first
// place).
const ANCHOR_RUBRIC = `## 평가 기준 (각 항목 0~100점, 5단계 anchor)

### logic (논리성)
- 90~100: 결론·근거·구조가 일관됨. 모순 없음. 두괄식 또는 명확한 흐름.
- 70~89:  대체로 일관되나 일부 비약/장황함.
- 50~69:  기본 논리는 있으나 비약 다수.
- 30~49:  논리 약함. 결론과 근거가 불일치하거나 결론이 명확하지 않음.
- 0~29:   논리적 구조가 거의 없음.

### specificity (구체성)
- 90~100: 프로젝트명·수치(%, 배수, 건수, 기간)·도구가 다수. STAR 완비.
- 70~89:  일부 수치와 구체적 사례 포함. STAR 일부.
- 50~69:  사례는 있으나 추상적.
- 30~49:  사례 모호. 수치 부재.
- 0~29:   완전 추상. "잘했습니다" 수준.

### job_fit (직무 적합성)
- 90~100: JD 핵심 키워드와 강하게 매칭. 부족한 부분을 어떻게 보완할지 언급.
- 70~89:  대체로 매칭.
- 50~69:  부분 매칭.
- 30~49:  약한 매칭.
- 0~29:   매칭 거의 없음.`;

const MODEL_ANSWER_RULES = `## 모범 답안 작성 규칙 (model_answers)

각 model_answers 항목:
- 지원자의 1인칭으로 작성. 실제 면접에서 바로 사용할 수 있는 자연스러운 한국어.
- 지원자 제출 문서(이력서/포트폴리오/GitHub)에 등장하는 프로젝트명·역할·수치를 구체적으로 인용.
- 문서에 없는 상황·수치·프로젝트·경험은 절대 만들어내지 않음. 문서에 단서가 약하면 일반론으로 짧게.
- STAR(상황·과제·행동·결과)를 문서 범위 안에서 활용.
- 본 질문과 꼬리질문이 가능하면 서로 다른 프로젝트를 인용. 문서에 다른 프로젝트가 없으면 같은 것 재사용 허용.
- model_answer는 최소 2~3문장 이상의 충분한 길이로 작성.

각 model_answers 항목의 필드:
- question: 본 질문 또는 꼬리질문의 원문 그대로
- intent: 면접관이 이 질문으로 확인하려 한 핵심을 2~4개의 짧은 명사형 키워드 배열 (문장 금지)
- model_answer: 위 규칙에 따라 작성한 1인칭 답변 본문`;

export interface BuildAnswerPromptInput {
  qaGroup: QaGroup;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
}

// Build the per-question prompt. The hint flag is passed as a LABEL the
// LLM sees ("모범 답안 참조: 예/아니오"); the score cap itself is applied
// server-side in postprocess.ts regardless of what the LLM does.
export function buildAnswerEvaluationPrompt(input: BuildAnswerPromptInput): string {
  const { qaGroup, analysisJson, resumeTexts } = input;
  const dialogue = qaGroup.turns
    .map((t) => `[${t.speaker === "interviewer" ? "면접관" : "지원자"}] ${t.content}`)
    .join("\n");

  return `당신은 IT 직무 면접 평가 전문가입니다. 아래 하나의 질문 그룹에 대해 채점·피드백·모범 답안을 생성하세요.

## 지원자 제출 문서 (이력서 / 포트폴리오 / GitHub)
${resumeSectionOf(resumeTexts)}

## JD 분석 요약
${jdSectionOf(analysisJson)}

## 질문 그룹
### [${qaGroup.question_id}] ${qaGroup.question}
- 질문 의도: ${qaGroup.intent}
- 좋은 답변 포인트: ${qaGroup.good_answer_tips}
- 모범 답안 참조: ${qaGroup.used_hint ? "예" : "아니오"}

대화 전체(본 질문 + 모든 꼬리질문 + 답변):
${dialogue}

${ANCHOR_RUBRIC}

## 평가 지시사항
1. 위 anchor rubric의 5단계 기준에 따라 logic / specificity / job_fit 각 0~100점.
2. average는 세 항목의 산술 평균을 정수로(서버에서 다시 계산하지만 일관되게 작성).
3. answer 필드: 지원자 답변(꼬리질문 포함)을 1~2문장으로 요약.
4. intent: 이 질문으로 면접관이 확인하려 한 핵심을 2~4개의 짧은 명사형 키워드 배열.
5. feedback: 잘한 점과 부족한 점을 균형 있게 한 문단으로. 마지막 문장에 핵심 개선 방향. 각 점수 영역을 별도 나열하지 말고 자연스러운 문단으로.
6. **모범 답안 참조: 예** 인 경우 — 점수를 최대 30점으로 제한(서버가 한 번 더 강제). feedback에 모범 답안을 참조했다는 점을 자연스럽게 언급.

${MODEL_ANSWER_RULES}

## 출력 형식
반드시 유효한 JSON만 반환. 마크다운 코드 펜스 사용 금지.
스키마는 호출 측이 구조화 출력으로 강제합니다 — 모든 필수 필드를 누락 없이 채우세요.

{
  "question_id": "${qaGroup.question_id}",
  "question": "본 질문 원문",
  "answer": "지원자 답변 요약 1~2문장",
  "scores": { "logic": 0~100, "specificity": 0~100, "job_fit": 0~100 },
  "average": 0~100,
  "intent": ["키워드1", "키워드2"],
  "feedback": "잘한 점과 부족한 점, 개선 방향을 한 문단으로",
  "model_answers": [
    { "question": "본 질문 원문", "intent": ["키워드1","키워드2"], "model_answer": "..." },
    { "question": "꼬리질문 원문", "intent": ["..."], "model_answer": "..." }
  ]
}`;
}

export interface BuildSkippedModelAnswerPromptInput {
  qaGroup: QaGroup;
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
}

// For skipped questions we still want a model answer (learning value),
// but no scoring. Use this prompt to ask for just model_answers; the
// score / feedback fields are filled deterministically server-side.
export function buildSkippedModelAnswerPrompt(input: BuildSkippedModelAnswerPromptInput): string {
  const { qaGroup, analysisJson, resumeTexts } = input;
  return `당신은 IT 직무 면접 모범 답안 작성 전문가입니다. 아래 질문에 대해, 지원자가 답변을 건너뛰었지만 학습용으로 모범 답안을 작성하세요.

## 지원자 제출 문서 (이력서 / 포트폴리오 / GitHub)
${resumeSectionOf(resumeTexts)}

## JD 분석 요약
${jdSectionOf(analysisJson)}

## 질문
### [${qaGroup.question_id}] ${qaGroup.question}
- 질문 의도: ${qaGroup.intent}
- 좋은 답변 포인트: ${qaGroup.good_answer_tips}

${MODEL_ANSWER_RULES}

## 출력 형식
아래 스키마를 따르는 JSON 하나만 반환하세요. 점수·피드백·answer 필드는 서버가 결정적으로 채울 빈 자리이므로 정확히 다음 값을 그대로 사용:

{
  "question_id": "${qaGroup.question_id}",
  "question": "${qaGroup.question.replace(/"/g, '\\"')}",
  "answer": "건너뛴 질문입니다.",
  "scores": { "logic": 0, "specificity": 0, "job_fit": 0 },
  "average": 0,
  "intent": ["키워드1", "키워드2"],
  "feedback": "건너뛴 질문입니다. 종합 점수 계산에서 제외되었습니다.",
  "model_answers": [
    { "question": "본 질문 원문", "intent": ["키워드1","키워드2"], "model_answer": "..." }
  ]
}`;
}

export interface BuildSummaryPromptInput {
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
  // Already post-processed and finalized answers (scores already capped /
  // skipped handled). Used to seed the summary so it stays consistent
  // with the per-answer story.
  answers: Array<{
    question_id: string;
    question: string;
    answer: string;
    scores: { logic: number; specificity: number; job_fit: number };
    average: number;
    feedback: string;
  }>;
  totalScore: number;
  skippedCount: number;
  hintCount: number;
}

export function buildSummaryEvaluationPrompt(input: BuildSummaryPromptInput): string {
  const { analysisJson, resumeTexts, answers, totalScore, skippedCount, hintCount } = input;
  const compact = answers
    .map(
      (a, i) =>
        `${i + 1}. [${a.question_id}] (평균 ${a.average}점, logic ${a.scores.logic} · specificity ${a.scores.specificity} · job_fit ${a.scores.job_fit})\n   Q: ${a.question}\n   답변 요약: ${a.answer}\n   피드백: ${a.feedback}`,
    )
    .join("\n\n");

  return `당신은 IT 직무 면접 평가 전문가입니다. 아래는 한 면접 세션의 질문별 채점 결과입니다. 이를 종합해 면접 전반에 대한 평가를 작성하세요.

## 지원자 제출 문서 (요약 시 인용 시 참고)
${resumeSectionOf(resumeTexts)}

## JD 분석 요약
${jdSectionOf(analysisJson)}

## 질문별 평가 (서버 후처리 완료)
- 총 답변 수: ${answers.length}
- 건너뜀: ${skippedCount}
- 모범 답안 참조: ${hintCount}
- 종합 점수 (skipped 제외 평균): ${totalScore}

${compact}

## 작성 지침
1. summary: 면접 전반에 대한 종합 평가 3~5문장. 모범 답안 참조 / 건너뛰기가 있었다면 자연스럽게 언급.
2. strengths: 면접 전반에서 지원자가 잘한 점 3~5문장.
3. improvements: 면접 전반에서 개선해야 할 포인트 3~5문장. 구체적 개선 방향 포함.
4. strength_keywords: strengths의 핵심 강점을 2~4개의 짧은 명사형 키워드 배열. 문장 금지.
5. improvement_keywords: improvements의 핵심 개선 포인트를 2~4개의 짧은 명사형 키워드 배열. 문장 금지.

종합 점수(total_score)는 서버가 이미 계산했으므로 출력에 포함하지 마세요.

## 출력 형식
반드시 유효한 JSON만 반환. 마크다운 코드 펜스 금지.

{
  "summary": "...",
  "strengths": "...",
  "strength_keywords": ["..."],
  "improvements": "...",
  "improvement_keywords": ["..."]
}`;
}

// Marker assertion used in tests AND at runtime as a defense in depth.
// If a sanitized turn somehow still carries the legacy marker, we throw
// before that prompt reaches the LLM.
export const LEGACY_MARKERS = ["[모범 답안]", "[질문 건너뛰기]"] as const;

export function assertNoLegacyMarkers(prompt: string): void {
  for (const marker of LEGACY_MARKERS) {
    if (prompt.includes(marker)) {
      throw new Error(
        `Evaluation prompt leaks legacy marker "${marker}". Did sanitization break?`,
      );
    }
  }
}
