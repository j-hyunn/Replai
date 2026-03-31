import type { AnalysisOutput } from "./analysis";

export interface EvaluationOutput {
  total_score: number;
  summary: string;
  strengths: string;
  improvements: string;
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

interface QaTurn { speaker: "interviewer" | "user"; content: string }
interface QaGroup {
  question_id: string;
  question: string;
  intent: string;
  good_answer_tips: string;
  turns: QaTurn[];
  used_hint: boolean;
  skipped: boolean;
}

export function buildEvaluationPrompt(params: {
  qaGroups: QaGroup[];
  analysisJson: AnalysisOutput;
  resumeTexts: string[];
}): string {
  const { qaGroups, analysisJson, resumeTexts } = params;

  const resumeSection =
    resumeTexts.length > 0
      ? resumeTexts.join("\n\n")
      : "제출된 문서가 없습니다.";

  const groupedText = qaGroups
    .map((g) => {
      const header = `### [${g.question_id}] ${g.question}
- 질문 의도: ${g.intent}
- 좋은 답변 포인트: ${g.good_answer_tips}
- 모범 답안 참조: ${g.used_hint ? "예" : "아니오"} / 건너뜀: ${g.skipped ? "예" : "아니오"}`;

      const dialogue = g.turns
        .map((t) => `[${t.speaker === "interviewer" ? "면접관" : "지원자"}] ${t.content}`)
        .join("\n");

      return `${header}\n\n${dialogue}`;
    })
    .join("\n\n---\n\n");

  return `당신은 IT 직무 면접 평가 전문가입니다. 아래 질문별 대화 그룹을 분석하고 상세한 피드백 리포트를 생성하세요.

## 지원자 제출 문서 (이력서 / 포트폴리오 / GitHub)
${resumeSection}

## JD 분석 요약
- 핵심 키워드: ${analysisJson.analysis.jd_keywords.join(", ") || "없음"}
- 강점: ${analysisJson.analysis.strengths.join(", ") || "없음"}
- 부족한 부분: ${analysisJson.analysis.preferred_gaps.join(", ") || "없음"}

## 질문별 대화 그룹
각 그룹은 하나의 메인 질문과 그에 따른 follow-up 및 답변 전체를 포함합니다.

${groupedText}

## 평가 기준
각 질문 그룹의 답변 전체(follow-up 포함)를 종합해 0~100점 평가:
- **logic (논리성)**: 답변의 논리적 구조와 일관성
- **specificity (구체성)**: 구체적인 사례, 수치, 결과 포함 여부
- **job_fit (직무 적합성)**: JD의 요구 역량과의 부합도

## 특수 마커 처리 규칙
- **모범 답안 참조: 예** → 해당 질문의 모든 점수를 최대 40점으로 제한. feedback에 "모범 답안을 참조한 답변입니다" 명시.
- **건너뜀: 예** → 모든 점수 0점. answer를 "건너뜀"으로. feedback에 "건너뛴 질문입니다" 명시.

## 지시사항
1. 각 질문 그룹(question_id)마다 answers 항목을 하나씩 생성하세요.
2. 각 질문의 intent와 good_answer_tips를 기준으로 채점하세요.
2-1. intent: 면접관이 이 질문으로 확인하려 한 핵심을 2~4개의 짧은 키워드 배열로 추출하세요. 문장 금지. 예: ["역할 명확성", "기술 이해도", "성과 측정 방식"]
3. feedback: 각 점수 영역(논리성·구체성·직무 적합성)의 채점 근거를 포함하되, 각 영역을 별도로 나열하지 말고 자연스러운 한 문단으로 작성하세요. 잘한 점과 부족한 점을 균형 있게 서술하고, 마지막 문장에 핵심 개선 방향을 제시하세요.
4. model_answers: 해당 질문 그룹 내 각 질문(본 질문 + 꼬리질문 순서대로)마다 모범 답안을 하나씩 작성하세요.
   - 모범 답안 작성 전, 위 "지원자 제출 문서" 전체를 먼저 스캔하여 관련 프로젝트·경험에 등장하는 수치(%, 배수, 시간, 건수 등)를 모두 파악하세요.
   - question 필드에는 해당 질문 내용을 그대로 입력하세요.
   - intent 필드에는 해당 질문(본 질문 또는 꼬리질문)으로 면접관이 확인하려 한 핵심을 2~4개의 짧은 키워드 배열로 추출하세요. 문장 금지. 예: ["수치 근거 확인", "문제 해결 과정"]
   - model_answer 필드는 위 "지원자 제출 문서"에 기재된 실제 내용(수치, 프로젝트명, 경험)만을 근거로 작성하세요. 문서에 없는 내용은 지어내지 마세요.
   - 수치를 활용할 때는 질문과 직접 관련된 항목뿐 아니라, 동일 프로젝트·경험에 언급된 수치라면 적극적으로 인용하세요.
   - 건너뛴 질문은 model_answers를 빈 배열로 설정하세요.
5. total_score는 모든 답변의 average 점수의 평균입니다.
7. summary: 전체 면접에 대한 종합 평가를 3~5문장으로 작성하세요. 모범 답안 참조·건너뛰기 사용 여부도 언급하세요.
8. strengths: 면접 전반에서 지원자가 잘한 점을 3~5문장으로 서술하세요. 특정 질문을 언급하더라도 전체 흐름 속에서의 강점을 중심으로 작성하세요.
9. improvements: 면접 전반에서 지원자가 개선해야 할 포인트를 3~5문장으로 서술하세요. 부족했던 부분과 구체적인 개선 방향을 중심으로 작성하세요.

## 출력 형식 (반드시 유효한 JSON만 반환, 마크다운 코드 블록 없이)
{
  "total_score": 82,
  "summary": "전체 면접 종합 평가 (3~5문장)",
  "strengths": "면접 전반에서 잘한 점 (3~5문장)",
  "improvements": "면접 전반에서 개선할 점 (3~5문장)",
  "answers": [
    {
      "question_id": "q1",
      "question": "질문 내용",
      "answer": "지원자 답변 요약",
      "scores": { "logic": 85, "specificity": 70, "job_fit": 90 },
      "average": 82,
      "intent": ["키워드1", "키워드2", "키워드3"],
      "feedback": "이 답변에 대한 피드백",
      "model_answers": [
        { "question": "본 질문 내용", "intent": ["키워드1", "키워드2"], "model_answer": "본 질문 모범 답안" },
        { "question": "꼬리질문 1 내용", "intent": ["키워드3", "키워드4"], "model_answer": "꼬리질문 1 모범 답안" }
      ]
    }
  ]
}`;
}
