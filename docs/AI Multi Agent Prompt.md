**문서 유형:** PM 프롬프트 설계 문서 
**버전:** v3.0 | 작성일: 2026-04-01 
**이전 버전:** Agent_Prompt v2.0 (2026-03-31) 
**참고:** `src/lib/prompts/` 코드베이스 직접 반영

---

## 변경 이력

|버전|날짜|주요 변경 내용|
|---|---|---|
|v1.0|2026-03-27|최초 작성|
|v2.0|2026-03-31|코드베이스 반영: 모델 변경(gemini-2.5-flash), 페르소나 2종으로 확정, explorer depth 2 상한, 힌트 실시간 AI 생성으로 변경, 건너뛰기 기능 추가, 평가 출력 구조 변경, ADK 적용 범위 수정, userProfile 컨텍스트 추가|
|v3.0|2026-04-01|버그 수정 반영: 분석 에이전트 personaContext explorer/pressure로 교체(startup·enterprise 제거). 평가 출력 구조 변경: model_answer(string) → model_answers(배열), answers[].intent 키워드 배열 추가|

---

## 개요

리허설의 면접 품질은 프롬프트로 결정된다. 3개의 프롬프트 파일(`analysis.ts`, `interview.ts`, `evaluation.ts`)로 구성되며, 각각 독립된 역할을 가진다.

|파일|에이전트|역할|실행 방식|
|---|---|---|---|
|`analysis.ts`|분석 에이전트|JD + 이력서 → 질문 세트 생성|직접 Gemini API 호출|
|`interview.ts`|면접관 에이전트|페르소나 대화 + 꼬리질문|ADK `LlmAgent` + `Runner`|
|`evaluation.ts`|평가 에이전트|전체 대화 → 리포트 생성|직접 Gemini API 호출|

**공통 AI 모델:** `gemini-2.5-flash` (전 에이전트, 기본값)

---

## 설계 원칙

|원칙|내용|
|---|---|
|JSON 출력 통일|모든 에이전트 출력은 JSON, 마크다운 코드 블록 없이 순수 JSON만 반환|
|한국어 발화|모든 질문, 피드백, 리포트는 한국어|
|서류 합격자 전제|필수 요건 갭 질문 생성 안 함, 우대사항 갭만 허용|
|JD 선택 입력|JD 없이도 면접 가능 — JD 없으면 지원동기 질문 생성 안 함|
|모범 답변 개인화|이력서에 실제로 기재된 내용만 근거로 사용, 없는 내용 생성 금지|
|userProfile 활용|직군/경력/기술스택은 질문 난이도·깊이 조정에만 사용, 답변 내용에 직접 포함 금지|
|AI 꼬리질문 판단|룰 기반 필터 없음, AI가 전체 맥락 보고 판단|

---

## 1. 분석 프롬프트

**파일:** `src/lib/prompts/analysis.ts` — `buildAnalysisPrompt()`

### 역할

JD와 이력서를 분석해 면접 질문 세트를 생성한다. 면접관 에이전트가 사용할 질문 목록과 힌트 생성에 필요한 메타데이터를 만든다.

### 입력 파라미터

|파라미터|타입|필수|설명|
|---|---|---|---|
|`jdText`|string|선택|JD 텍스트. 빈 문자열이면 JD 없는 면접으로 처리|
|`resumeTexts`|string[]|필수|서버 파싱된 문서 텍스트 배열 (이력서, 포트폴리오 등 레이블 포함)|
|`persona`|string|필수|선택된 페르소나 (`explorer` \| `pressure`)|
|`durationMinutes`|number|필수|면접 시간 (분)|
|`userProfile`|object|선택|직군, 경력, 기술스택, 보유스킬|

### userProfile 구조

```typescript
interface UserProfileContext {
  jobCategory: string | null;       // 예: "프론트엔드 개발자"
  yearsOfExperience: number | null; // 예: 3
  techStack: string[];              // 예: ["React", "TypeScript"]
  skills: string[];                 // 예: ["UI 설계", "코드 리뷰"]
}
```

userProfile은 질문 난이도와 깊이를 조정하는 컨텍스트로만 사용한다. 답변 내용이나 모범 답안에 직접 언급하지 않는다.

### 페르소나 컨텍스트 매핑 — v3.0 수정

```typescript
// v2.0 (버그) — startup·enterprise는 삭제된 페르소나, explorer 누락
const personaContext = {
  startup: "...",
  enterprise: "...",
  pressure: "...",
}[persona] ?? "";

// v3.0 (수정) — explorer·pressure 2종으로 교체
const personaContext = {
  explorer: "경험 탐색형 면접으로, 지원자가 자신의 경험을 편안하게 풀어낼 수 있도록 열린 질문을 선호합니다. 꼬리질문은 최대 2회로 제한하며 대화적인 흐름을 유지합니다.",
  pressure: "심층 압박형 면접으로, 날카롭고 집요한 추가 질문을 선호합니다. 모호하거나 수치가 없는 답변에는 반드시 꼬리질문하며 최대 4회까지 깊이 파고듭니다.",
}[persona] ?? "";
```

### 질문 수 계산

```
목표 질문 수 = round(durationMinutes / 5 × 1.5)
예: 60분 → round(60 / 5 × 1.5) = 18개
```

### JD 유무에 따른 분기

|상황|처리 방식|
|---|---|
|JD 있음|q1: 자기소개 (필수), q2: 지원동기 (필수), 이후 추가 common 질문|
|JD 없음|q1: 자기소개 (필수), 지원동기 질문 절대 포함 금지|

### 처리 단계

```
Step 1: JD 핵심 키워드 추출 (필수 요건 / 우대사항 분리)
Step 2: 이력서 분석 (주요 경력, 프로젝트, 수치 성과, 기술스택)
Step 3: JD ↔ 이력서 매핑
  └─ strengths: 이력서가 JD를 강하게 커버하는 부분
  └─ preferred_gaps: 우대 요건 중 이력서에서 확인 안 되는 부분
  └─ (필수 요건 갭 → 질문 생성 금지)
Step 4: 질문 세트 생성
  └─ common: 자기소개, 지원동기(JD 있을 때만), 강약점 등
  └─ project: 이력서 특정 프로젝트 기반 동적 생성
  └─ preferred_gap: 우대사항 갭에 대한 검증 질문
```

### 출력 구조 (TypeScript 타입)

```typescript
interface AnalysisOutput {
  analysis: {
    jd_keywords: string[];
    strengths: string[];
    preferred_gaps: string[];
  };
  questions: Array<{
    id: string;               // "q1", "q2", ...
    question: string;         // 한국어 질문 텍스트
    type: "common" | "project" | "preferred_gap";
    intent: string;           // 이 질문으로 확인하려는 역량
    good_answer_tips: string; // 힌트 생성 기반 데이터
    depth: number;            // 항상 0으로 생성 (면접 중 증가)
    source: string;           // JD 키워드 또는 이력서 항목
  }>;
}
```

### 주요 설계 결정

|결정|이유|
|---|---|
|JD 없는 면접 지원|포트폴리오만 있거나 직군 기반 연습 용도 대응|
|필수 요건 갭 질문 금지|서류 합격자 기본 요건 재검증은 목적에 맞지 않음|
|q1/q2 자리 고정|라포 형성 → 경험 탐색 → 심층 검증 순서의 자연스러운 흐름|
|`good_answer_tips` 필드|힌트 기능에서 AI 모범 답안 생성 시 가이드로 활용|

---

## 2. 면접관 프롬프트

**파일:** `src/lib/prompts/interview.ts` **ADK 구조:** `src/lib/agents/runners.ts`

### 역할

분석 에이전트가 생성한 질문 세트를 기반으로 페르소나별 대화를 진행한다. 총 5개의 프롬프트 빌더 함수로 구성된다.

### ADK 실행 구조

```
LlmAgent (interview_agent)
  └─ 모델: gemini-2.5-flash
  └─ instruction: InstructionProvider (동적 — 세션 state에서 매 턴마다 읽어옴)

Runner (interviewRunner)
  └─ sessionService: InMemorySessionService
  └─ 세션 state 보유: persona, jdText, resumeTexts, analysisJson,
                       remainingSeconds, totalSeconds, userProfile, customInstructions
```

콜드 스타트 시 InMemorySessionService는 비어 있으므로, API Route에서 Supabase `interview_messages`를 읽어 세션을 재구성한 뒤 `runner.runAsync()`를 호출한다.

### 프롬프트 빌더 함수 목록

|함수|호출 시점|역할|
|---|---|---|
|`buildInterviewSystemPrompt()`|매 턴 시스템 프롬프트|페르소나, 컨텍스트, 진행 규칙 설정|
|`buildFirstQuestionPrompt()`|면접 시작|첫 번째 질문 + 인사말 생성|
|`buildRespondPrompt()`|유저 답변 수신 후|꼬리질문 여부 판단 + 다음 발화 생성|
|`buildSkipPrompt()`|유저가 질문 건너뛰기|건너뜀 처리 + 다음 질문으로 이동|
|`buildHintPrompt()`|유저가 힌트 요청|이력서 기반 모범 답안 실시간 생성|

### 2-1. 시스템 프롬프트 — `buildInterviewSystemPrompt()`

**입력 파라미터:**

|파라미터|설명|
|---|---|
|`persona`|`"explorer"` \| `"pressure"`|
|`jdText`|JD 텍스트 (없으면 직군 기반 일반 면접으로 처리)|
|`resumeTexts`|이력서/포트폴리오 텍스트 배열|
|`analysisJson`|분석 에이전트 출력 JSON|
|`remainingSeconds`|남은 면접 시간 (초)|
|`totalSeconds`|총 면접 시간 (초)|
|`userProfile`|직군/경력/기술스택 (선택)|
|`customInstructions`|유저가 작성한 페르소나 추가 지침 (선택)|

**구성 순서:**

```
① PERSONA_INSTRUCTIONS[persona]   ← 페르소나 고유 말투·판단 기준
② 사용자 추가 지침 (있을 때만)    ← customInstructions
③ 면접 컨텍스트 (JD, 이력서, 분석 결과, 지원자 프로필)
④ 면접 진행 규칙 (질문 순서, depth, 남은 시간, 출력 형식)
```

> **주의:** ③의 분석 결과(`analysisJson`) 직렬화 시 각 질문의 `good_answer_tips` 필드는 제외된다. `good_answer_tips`는 힌트 에이전트 전용 데이터로, 면접관이 사전에 참조하면 꼬리질문·판단이 편향될 수 있기 때문이다. (`buildHintPrompt()`에는 별도 파라미터로 전달됨)

### 2-2. 페르소나 시스템 프롬프트 — `PERSONA_INSTRUCTIONS`

#### explorer — 경험 탐색형

|항목|내용|
|---|---|
|말투|"~해보셨나요?", "어떤 경험이 있으셨어요?" 같은 열린 질문 어조|
|전환 표현|"아, 그렇군요. 그럼 혹시~" 같은 부드러운 연결|
|**꼬리질문 depth 상한**|**최대 2** — depth 2 초과 시 반드시 다음 주제로 전환|
|꼬리질문 기준|답변이 너무 짧거나 맥락이 부족할 때만 1회 가볍게 이어감|
|목표 분위기|면접 끝에 "편하게 내 이야기를 풀어냈다"는 느낌|

#### pressure — 심층 압박형

|항목|내용|
|---|---|
|말투|"구체적으로 어떤 역할을 하셨나요?", "그 결과는 어떻게 측정했나요?"|
|허점 지적|"말씀하신 부분에서 ~가 불명확한데요." 처럼 직접적|
|**꼬리질문 depth 상한**|**최대 4**|
|꼬리질문 기준|모호/추상적 답변, 수치·사례 없는 답변, 흥미로운 키워드 발견 시|
|목표 분위기|면접 끝에 "실력이 제대로 시험된 느낌" — 날카롭되 공격적이지 않게|

### 페르소나별 depth 상한 비교

|페르소나|depth 상한|꼬리질문 강도|
|---|---|---|
|explorer|**2**|보완 요청 수준 ("조금 더 구체적으로…")|
|pressure|**4**|적극적 파고들기, 논리 검증 중심|

### 2-3. 커스텀 지침 주입

유저가 페르소나별로 작성한 추가 지침이 있으면, 페르소나 기본 지침 바로 뒤에 `## 사용자 추가 지침` 섹션으로 삽입된다.

```
[페르소나 기본 지침]
...

## 사용자 추가 지침
{customInstructions}

## 면접 컨텍스트
...
```

커스텀 지침이 없으면 이 섹션 자체가 삽입되지 않는다.

### 2-4. 시간 관리

|조건|동작|
|---|---|
|`remainingSeconds >= totalSeconds × 0.2`|정상 진행|
|`remainingSeconds < totalSeconds × 0.2`|시스템 프롬프트에 ⚠️ 경고 삽입 → `type: "closing"`으로 전환 지시|

### 2-5. 힌트 프롬프트 — `buildHintPrompt()`

힌트는 사전에 생성된 텍스트를 보여주는 것이 아니라, **AI가 실시간으로 이력서를 참조해 모범 답안을 생성**한다.

**입력:**

|파라미터|설명|
|---|---|
|`currentQuestion`|현재 질문 텍스트|
|`questionIntent`|질문 의도 (analysis에서 생성된 `intent`)|
|`goodAnswerTips`|좋은 답변 포인트 (analysis에서 생성된 `good_answer_tips`)|
|`resumeTexts`|이력서/포트폴리오 텍스트|
|`recentMessages`|직전 대화 흐름 최근 6개 (맥락 파악용)|
|`userProfile`|직군/경력/기술스택 (난이도 조정용만)|

**핵심 제약:**

- 이력서에 실제로 기재된 내용만 근거로 사용
- 없는 상황·수치·프로젝트·경험 생성 금지
- 직전 대화에서 이미 언급한 프로젝트 제외 — 다른 프로젝트 우선 활용
- STAR 기법을 문서 내용 범위 안에서 활용
- 200~400자 내외, 답변 텍스트만 반환 (JSON·마크다운 없이)
- `userProfile`은 난이도 조정에만 사용, 답변 본문에 직접 언급 금지

**출력:** 순수 텍스트 (JSON 아님)

### 2-6. 건너뛰기 — `buildSkipPrompt()`

유저가 질문을 건너뛰면 호출된다. "알겠습니다"라고 짧게 응답 후 다음 질문으로 이동. `type: "question"`으로 설정.

건너뛴 질문은 평가 에이전트에서 `skipped: true` 마커로 전달되어 모든 점수가 0점 처리된다.

### 2-7. 출력 구조

```typescript
interface InterviewAgentOutput {
  message: string;             // 면접관 발화 내용
  type: "question" | "followup" | "closing";
  current_depth: number;       // 현재 꼬리질문 깊이
  next_question_id: string | null;
  is_last: boolean;
}
```

---

## 3. 평가 프롬프트

**파일:** `src/lib/prompts/evaluation.ts` — `buildEvaluationPrompt()`

### 역할

면접 종료 후 전체 대화를 질문 그룹 단위로 분석해 리포트를 생성한다.

### 입력 구조

평가 에이전트는 개별 메시지가 아닌 **질문 그룹(QaGroup)** 단위로 데이터를 받는다. 하나의 본 질문 + 이어진 모든 꼬리질문·답변을 하나의 그룹으로 묶어 평가한다.

```typescript
interface QaTurn {
  speaker: "interviewer" | "user";
  content: string;
}

interface QaGroup {
  question_id: string;
  question: string;
  intent: string;
  good_answer_tips: string;
  turns: QaTurn[];      // 본 질문 + 꼬리질문 + 답변 전체
  used_hint: boolean;   // 힌트(모범 답안) 참조 여부
  skipped: boolean;     // 건너뛰기 여부
}
```

### 특수 마커 처리 규칙

|마커|점수 처리|feedback 명시|
|---|---|---|
|`used_hint: true`|모든 항목 **최대 40점**|"모범 답안을 참조한 답변입니다" 명시|
|`skipped: true`|모든 항목 **0점**, `answer`는 "건너뜀"|"건너뛴 질문입니다" 명시|

### 평가 항목 (질문 그룹당 3축 × 100점)

질문 그룹의 **모든 turns(본 질문 + 꼬리질문 답변 전체)**를 종합해 평가한다.

|평가 축|설명|
|---|---|
|`logic` (논리성)|답변의 논리적 구조와 일관성, 두괄식 구성 여부|
|`specificity` (구체성)|구체적 사례·수치·결과 포함 여부|
|`job_fit` (직무 적합성)|JD 요구 역량과의 부합도, 핵심 키워드 연결|

### 총점 산출

```
답변별 평균 = (logic + specificity + job_fit) / 3
total_score = 전체 답변 평균들의 평균 (100점 환산)
MVP: 모든 답변 동일 가중치
```

### 출력 구조 (TypeScript 타입) — v3.0 수정

```typescript
interface EvaluationOutput {
  total_score: number;       // 전체 평균 점수 (0~100)
  summary: string;           // 전체 종합 평가 3~5문장
  strengths: string;         // 면접 전반 잘한 점 3~5문장
  improvements: string;      // 면접 전반 개선할 점 3~5문장
  answers: Array<{
    question_id: string;
    question: string;
    answer: string;           // 지원자 답변 요약
    scores: {
      logic: number;
      specificity: number;
      job_fit: number;
    };
    average: number;
    intent: string[];         // ← v3.0 추가: 질문 의도 키워드 배열 (2~4개)
    feedback: string;         // 자연스러운 한 문단 피드백
    model_answers: Array<{    // ← v3.0 변경: model_answer(string) → model_answers(배열)
      question: string;       //   질문 그룹 내 각 질문(본 질문 + 꼬리질문)마다 1개
      intent: string[];       //   해당 질문의 의도 키워드 배열
      model_answer: string;   //   이력서 기반 모범 답안
    }>;
  }>;
}
```

**v2.0 → v3.0 변경 내용:**

|항목|v2.0|v3.0|
|---|---|---|
|`answers[].intent`|없음|`string[]` — 2~4개 짧은 키워드 배열 추가. 예: `["역할 명확성", "기술 이해도"]`|
|`answers[].model_answer`|`string` 단일 필드|**삭제**|
|`answers[].model_answers`|없음|`Array<{question, intent[], model_answer}>` — 본 질문 + 꼬리질문마다 각 1개|

### model_answers 생성 규칙

- 질문 그룹 내 본 질문 + 꼬리질문 순서대로 각각 1개씩 생성
- 생성 전 이력서 전체를 먼저 스캔해 관련 수치(%, 배수, 시간, 건수 등) 파악
- `question` 필드: 해당 질문 내용 그대로
- `intent` 필드: 해당 질문의 의도를 2~4개 짧은 키워드 배열로 (문장 금지)
- `model_answer` 필드: 이력서 기재 내용만 근거로 작성, 없는 내용 생성 금지
- 동일 프로젝트 수치를 질문과 직접 관련 없어도 적극 인용
- 건너뛴 질문은 `model_answers: []` (빈 배열)

### feedback 작성 규칙

- 논리성·구체성·직무 적합성 채점 근거를 각 영역별로 나열하지 않고 자연스러운 한 문단으로 통합
- 잘한 점과 부족한 점을 균형 있게 서술
- 마지막 문장에 핵심 개선 방향 제시

---

## 4. 프롬프트 간 데이터 흐름

```
[클라이언트 — 면접 시작]
JD + 이력서 + 페르소나 + 시간 + userProfile
         │
         ▼
[분석 에이전트 — buildAnalysisPrompt()]
         │ AnalysisOutput (questions[], analysis)
         ▼
[면접관 에이전트 — ADK Runner]
  매 턴: buildInterviewSystemPrompt() ← 세션 state에서 읽어옴
  시작:  buildFirstQuestionPrompt()
  답변:  buildRespondPrompt()
  힌트:  buildHintPrompt()           → 순수 텍스트 반환 (non-JSON)
  건너뜀: buildSkipPrompt()
         │ 대화 이력 누적 (interviewer/user turns)
         │ Supabase interview_messages에 매 턴 저장
         ▼
[평가 에이전트 — buildEvaluationPrompt()]
  입력: QaGroup[] (turns + used_hint + skipped 포함)
         │ EvaluationOutput
         ▼
[Supabase interview_reports 저장 → 리포트 화면 렌더링]
```

---

## 5. ADK 적용 범위

|에이전트|ADK 사용 여부|이유|
|---|---|---|
|분석 에이전트|미사용 (직접 Gemini API)|1회성 호출, 대화 세션 불필요|
|면접관 에이전트|**사용 (LlmAgent + Runner)**|다중 턴 대화, 세션 상태 유지 필요|
|평가 에이전트|미사용 (직접 Gemini API)|1회성 호출, 세션 불필요|

v1.0 문서의 SequentialAgent 오케스트레이터는 실제 구현에 없다. 에이전트 간 순서는 API Route에서 코드로 제어한다.

---

## 6. 품질 관리 체크리스트

프롬프트 수정·테스트 시 확인 항목:

### 분석 프롬프트

- [ ] JD 없이 실행 시 지원동기 질문이 생성되지 않는가?
- [ ] JD 있을 때 q1=자기소개, q2=지원동기 순서로 생성되는가?
- [ ] 이력서에 없는 내용을 프로젝트 질문에서 참조하지 않는가?
- [ ] 질문 수가 `round(duration / 5 × 1.5)` 범위에서 생성되는가?
- [ ] explorer/pressure 페르소나 컨텍스트가 프롬프트에 올바르게 반영되는가?

### 면접관 프롬프트

- [ ] explorer 페르소나에서 depth 2를 초과하는 꼬리질문이 발생하지 않는가?
- [ ] pressure 페르소나에서 depth 4를 초과하는 꼬리질문이 발생하지 않는가?
- [ ] 남은 시간 20% 이하에서 `type: "closing"`으로 전환되는가?
- [ ] 한 번에 하나의 질문만 하는가?
- [ ] 힌트 모범 답안에 이력서에 없는 내용이 포함되지 않는가?
- [ ] 커스텀 지침이 기본 페르소나 지침을 완전히 덮어쓰지 않고 보완하는가?

### 평가 프롬프트

- [ ] `used_hint: true` 질문의 모든 점수가 40점 이하인가?
- [ ] `skipped: true` 질문의 모든 점수가 0점이고 `answer`가 "건너뜀"인가?
- [ ] feedback이 항목별 나열 없이 자연스러운 한 문단인가?
- [ ] `model_answers`가 본 질문 + 꼬리질문마다 각각 생성되는가?
- [ ] `model_answers[].model_answer`가 이력서 기재 내용만 근거로 작성됐는가?
- [ ] `answers[].intent`가 2~4개 키워드 배열로 생성되는가? (문장 형태 아님)

---

## 7. v2 예정 사항

|항목|현재 (MVP)|v2 예정|
|---|---|---|
|평가 가중치|동일 가중치|질문 유형별 차등 (project > common)|
|힌트 사용 점수 상한|40점 고정|사용 횟수·시점 기반 유동 조정|
|userProfile 활용 범위|난이도 조정만|직군별 맞춤 평가 기준 적용|
|페르소나|2종 고정|추가 페르소나 또는 완전 커스텀 페르소나|

---

## 8. 용어 정의

|용어|정의|
|---|---|
|depth|꼬리질문 깊이. 본 질문 = 0, 첫 번째 꼬리질문 = 1, explorer 최대 2, pressure 최대 4|
|QaGroup|하나의 본 질문 + 그에 딸린 모든 꼬리질문·답변 turns를 묶은 단위|
|used_hint|유저가 해당 질문에서 힌트(모범 답안)를 열람한 경우. 점수 최대 40점 제한 트리거|
|skipped|유저가 해당 질문을 건너뛴 경우. 모든 점수 0점 처리|
|customInstructions|유저가 페르소나별로 작성한 추가 지침. 기본 지침에 보완적으로 적용|
|InstructionProvider|ADK의 동적 시스템 프롬프트 생성 함수. 매 턴마다 세션 state를 읽어 프롬프트를 재구성|
|model_answers|평가 리포트에서 질문 그룹 내 각 질문(본 질문 + 꼬리질문)마다 생성되는 이력서 기반 모범 답안 배열|

---

_본 문서는 `src/lib/prompts/` 코드베이스를 직접 반영한 v3.0입니다. 프롬프트 실제 텍스트는 각 `.ts` 파일을 참고하세요._