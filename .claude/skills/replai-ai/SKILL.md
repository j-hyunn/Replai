---
name: replai-ai
description: Replai AI 에이전트 개발 스킬. "에이전트 수정해줘", "프롬프트 개선해줘", "질문 생성 로직 바꿔줘", "인터뷰 에이전트 동작 바꿔줘", "Gemini API 연동", "이력서 생성 파이프라인 수정" 등 ADK 에이전트/프롬프트/Gemini 관련 모든 작업 요청 시 이 스킬을 사용할 것. ai-builder가 직접 사용하는 작업 가이드.
---

# Replai AI 에이전트 개발 가이드

## 핵심 규칙

`.agents/rules/agents.md`와 `.agents/rules/architecture.md`가 최종 권위다.
이 스킬은 실무 적용 방법을 담는다.

## 파일 구조

```
lib/agents/runners.ts   → ADK Runner 싱글턴 (면접관 전용). 프롬프트는 여기 없음
lib/prompts/            → analysis.ts, interview.ts, evaluation.ts, normalize.ts, resume-generate.ts
lib/evaluation/         → parse.ts, postprocess.ts, concurrency.ts
lib/utils/withDeadline.ts → 호출별 대기 상한
app/api/interview/route.ts        → 면접 액션 5종 + 평가 오케스트레이션 (인라인)
app/api/resume/generate/route.ts  → 이력서 4단계 파이프라인
```

## 실행 패턴 3종

**`SequentialAgent`는 쓰지 않는다.** 호출 순서는 route 코드로 제어한다.

```typescript
// 1. runOneShot — 분석 / 힌트 / 평가. 세션 없음, BYOK 적용
const agent = new LlmAgent({
  name: 'oneshot_agent',
  model: new Gemini({ model, apiKey }),   // getUserAiConfig()에서 받은 값
  instruction: () => prompt,
})
// runner.runEphemeral() 이벤트를 drain, withDeadline()으로 감싼다

// 2. ADK Runner — 면접관 전용 (lib/agents/runners.ts 싱글턴)
//    모듈 레벨에서 서버 키로 고정 생성됨. BYOK 미적용
//    InstructionProvider는 ctx.state.toRecord()로 읽어야 한다 (State는 클래스 인스턴스)

// 3. Gemini REST 직접 — normalize / 이력서 생성
//    fetch로 generativelanguage.googleapis.com 호출. 재시도·타임아웃 직접 제어
```

모델명은 `lib/models.ts`에서 관리한다. 하드코딩 금지 (`NORMALIZE_MODEL` 같은 전용 상수는 예외).

## 컨텍스트 우선순위 — 건드릴 때 주의

`/api/interview`가 `resumeTexts`를 아래 순서로 조립한다. 앞이 높은 우선순위다.

```
[제출용 이력서 - {회사} {포지션}]   ← content_json 우선, 없으면 content_md 폴백
[마스터 이력서]                     ← 경력 또는 프로젝트가 1개 이상일 때만
[이력서: {파일명}] / [포트폴리오: …]  ← normalized_text ?? parsed_text
```

이 배열이 분석·면접관·힌트·평가 전부에 동일하게 전달된다. 순서를 바꾸면 질문 품질이 직접 바뀐다.

## API 라우트 패턴

```typescript
// 모든 AI 라우트의 진입 순서
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { apiKey, model } = await getUserAiConfig(user.id)

  const session = await getSession(sessionId)
  if (!session || session.user_id !== user.id) {
    return new Response('Not Found', { status: 404 })
  }
  // ... 액션 분기 후 Response.json()으로 응답
}
```

**응답은 스트리밍하지 않는다.** 전 라우트가 `Response.json()` 일괄 응답이다. `text/event-stream`을
새로 도입하려면 별도 결정이 필요하다 — 기존 코드에 그런 경로는 없다.

**TTS/STT/normalize는 항상 서버 기본 키(`env.googleApiKey`) 사용 — BYOK 키 사용 금지**

## I/O JSON 구조

`agents.md`에 정의된 구조를 변경하면 다음을 함께 수정한다:

- 해당 에이전트의 TypeScript 타입 정의
- 응답 파싱 로직 (`lib/evaluation/parse.ts` 등)
- DB 저장 컬럼 (`analysis_json`, `report_json`, `content_json` 등)
- **클라이언트 소비 타입** — 서버가 저장하는 필드를 클라이언트 타입에 선언하지 않으면 UI가 못 읽는다.
  `AnswerStatus`가 실제로 이 문제를 겪고 있다 (`report_json`에는 있는데 `AnswerReport`에는 없음)

## 질문 생성 전략

- 질문 수: `Math.round(duration / 5 * 1.5)`
- JD 있으면 q1 자기소개 → q2 지원동기 → q3 이직 사유 고정. JD 없으면 지원동기 금지
- 꼬리질문 depth 상한: `explorer` 2, `pressure` 4, `technical` 4
- 남은 시간 < 20%: 클로징 질문으로 전환
- 타입: `common | project | preferred_gap`
- `good_answer_tips`는 면접관 프롬프트에서 제외한다 (힌트 전용). 노출하면 꼬리질문이 편향된다

## 평가 파이프라인

```
Stage 1  mapWithConcurrency(qaGroups, 4, evaluateOneGroup)
         skipped → buildSkippedModelAnswerPrompt() → buildSkippedAnswer()
         그 외   → buildQuestionEvaluationPrompt() → 3회 재시도
                   → parseQuestionEvaluation() → applyHintCap() / applyAnsweredOverrides()
                   → 실패·예산소진 시 buildFailedAnswer()
computeTotalScore()   ← 서버 산술
Stage 2  buildSummaryEvaluationPrompt() → 3회 재시도 → 실패 시 500
```

| 상수 | 값 |
|---|---|
| `EVAL_CONCURRENCY` | 4 |
| `ONESHOT_TIMEOUT_MS` | 45,000 |
| `EVAL_BUDGET_MS` | 240,000 |
| `HINT_SCORE_CAP` | 30 |

**금지:** `zod`, `p-limit`, Gemini `responseSchema` structured output 도입. 자체 타입 가드와
`mapWithConcurrency`로 의존성 없이 구현한 것이 현재 설계다. 바꾸려면 명시적 결정이 필요하다.

**서버가 산술을 소유한다.** `average`, `total_score`는 LLM 값을 버리고 항상 재계산한다.

## 이력서 생성 파이프라인

4단계 순차. 각 단계 출력이 다음 입력이다. 단계마다 3회 재시도(`1000ms × attempt` 백오프).

```
1  buildJdAnalysisPrompt()   → JdAnalysis        실패 시 502 "JD 분석에 실패했습니다"
2  buildFilterPrompt()       → FilteredContent   실패 시 502 "이력서 필터링에 실패했습니다"
3  buildRewritePrompt()      → RewrittenContent  실패 시 502 "문장 변환에 실패했습니다"
4  buildFinalResumePrompt()  → ---RESUME_JSON--- / ---ANALYSIS---
```

**단계를 합치지 말 것.** 선별(2단계)과 문체 변환(3단계)을 한 번에 시키면 선별 기준이 무너진다.
소요 시간 단축이 필요하면 모델 경량화를 먼저 검토한다 (Decisions #34).

3단계 프롬프트의 "주체 혼동 금지" 경고 블록은 실제 회귀 대응이다 — LLM이 자기 역할명을
`summary`에 넣던 문제. 제거하지 말 것.

## 메시지 kind

힌트·건너뛰기 판정은 `interview_messages.kind`로만 한다. `content` 파싱 금지.

| kind | content |
|---|---|
| `answer` | 사용자 답변 원문 |
| `hint_shown` | **힌트 텍스트 원문** (면접관에게도 그대로 전달됨) |
| `skipped` | **빈 문자열** |
| `interviewer` | 면접관 발화 |

## 에러 핸들링

각 AI 호출에 3회 재시도. 3회 실패 시 명확한 오류 메시지 + 재시도 안내.
**불완전한 데이터로 계속 진행하지 않는다.**

의도된 예외 3곳만:
1. TTS 실패 → `null` 반환, 면접 계속
2. 질문 단건 평가 실패 → 해당 답변만 `failed`, 리포트는 생성
3. 이력서 4단계 파싱 실패 → 3단계 결과 사용

`normalize`는 폴백 없음 — `parsed_text`로 인터뷰를 진행하지 않는다.
