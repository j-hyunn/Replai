**문서 유형:** PM 기술 이해 문서
**버전:** v3.0 | 작성일: 2026-04-01 
**이전 버전:** Multi-Agent Architecture v2.0 (2026-03-31) 
**참고:** `src/app/api/interview/route.ts`, `src/lib/agents/runners.ts`, `src/lib/ai-config.ts` 코드베이스 직접 반영

---

## 변경 이력

|버전|날짜|주요 변경 내용|
|---|---|---|
|v1.0|2026-03-31|최초 작성 (설계 문서 기반)|
|v2.0|2026-03-31|코드베이스 반영: SequentialAgent 제거, ADK 적용 범위 수정(면접관만), runOneShot 패턴 추가, 모델 변경(gemini-2.5-flash), 콜드 스타트 재구성 로직, API Route 액션 타입 5종, 메시지 마커 시스템, DB 스키마 최신화|
|v3.0|2026-04-01|BYOK 기능 추가: getUserAiConfig() 주입, user_api_settings 테이블, crypto.ts·ai-config.ts 신규, API Route 흐름 업데이트, 보안 섹션 확장|
|v3.1|2026-04-04|기술 검증형(technical) 페르소나 추가: DB CHECK 제약 확장, Persona 타입 3종, 분석·면접관 에이전트 컨텍스트 맵 업데이트|

---

## 1. 왜 멀티 에이전트인가?

하나의 AI 호출로 면접 전체를 처리할 수 없다. 세 작업이 각각 다른 목표와 컨텍스트를 요구하기 때문이다.

|작업|특성|단일 모델로 처리 시 문제|
|---|---|---|
|JD + 이력서 분석, 질문 생성|1회성, 구조화 출력|면접 대화 컨텍스트와 섞여 품질 저하|
|면접 대화 진행|다중 턴, 페르소나 유지, 상태 보존|분석·평가 로직이 섞여 페르소나 흔들림|
|전체 대화 평가, 리포트 생성|1회성, 전체 이력 참조|면접 중 평가 프롬프트가 컨텍스트 낭비|

---

## 2. 전체 구조

```
[클라이언트]
└─ 타이머 관리 (면접 시작 시각만 DB 저장)
└─ UI 상태 (현재 질문 index, depth)
└─ /api/interview 호출만 — AI 직접 호출 금지

[Next.js API Route — /api/interview]
├─ getUser()                  ← 인증 검증
├─ getUserAiConfig(userId)    ← BYOK: 사용자 키/모델 조회 (v3.0 추가)
├─ type: "analyze"   → 분석 에이전트 (runOneShot)
│                    → 면접관 에이전트 첫 질문 생성 (ADK)
├─ type: "respond"   → 면접관 에이전트 (ADK runAsync)
├─ type: "hint"      → 힌트 에이전트 (runOneShot)
├─ type: "skip"      → 면접관 에이전트 (ADK runAsync)
└─ type: "evaluate"  → 평가 에이전트 (runOneShot)

[Next.js API Route — /api/tts, /api/transcribe]
└─ 항상 서버 GOOGLE_API_KEY 사용 — 사용자 BYOK 키 무관

[Supabase]
├─ Auth (Google OAuth)
├─ DB (sessions, messages, reports, persona_settings, api_settings) ← v3.0: api_settings 추가
└─ Storage (이력서, 포트폴리오 파일)
```

---

## 3. BYOK 키 주입 흐름 — v3.0 신규

모든 `/api/interview` 요청에서 인증 직후 `getUserAiConfig()`를 호출해 해당 유저의 API 키와 모델을 결정한다.

```
POST /api/interview 진입
  │
  ▼
getUser()                          ← 인증 검증 (기존)
  │
  ▼
getUserAiConfig(userId)            ← BYOK 키 조회 (v3.0 추가)
  │
  ├─ user_api_settings에 api_key_enc 존재?
  │     YES → decrypt(api_key_enc) → 사용자 키 + 선택 모델
  │     NO  → 서버 GOOGLE_API_KEY + gemini-2.5-flash (기본값)
  │
  ▼
{ apiKey, model, isCustom } 획득
  │
  ▼
makeGemini(apiKey, model) 로 에이전트 생성 → runOneShot() / runAsync()
```

### 관련 파일

|파일|역할|
|---|---|
|`src/lib/crypto.ts`|AES-256-GCM 암호화/복호화 — `encrypt()`, `decrypt()`|
|`src/lib/ai-config.ts`|`getUserAiConfig(userId)` — DB 조회 후 키/모델 반환|
|`src/app/(main)/settings/actions.ts`|`saveApiKeyAction()`, `deleteApiKeyAction()` — 키 저장·삭제|

### 지원 모델

|모델 ID|제공 방식|비고|
|---|---|---|
|`gemini-2.5-flash`|서버 기본 키|기본값 — 별도 설정 불필요|
|`gemini-2.5-pro`|사용자 키|Settings에서 등록 필요|
|`gemini-3.1-pro-preview`|사용자 키|최고 성능, Settings에서 등록 필요|

### TTS / STT 예외

TTS(`/api/tts`)와 STT(`/api/transcribe`)는 **항상 서버 `GOOGLE_API_KEY`를 사용**한다. 사용자가 어떤 모델을 선택하든 음성 기능은 기본 키로 동작한다.

---

## 4. 에이전트별 실행 방식

실제 구현에서 에이전트 실행은 **두 가지 패턴**으로 나뉜다.

### 4-1. runOneShot — 분석·평가·힌트

```typescript
// v3.0: apiKey, model 파라미터 추가
async function runOneShot(instruction, userMessage, userId, apiKey, model): Promise<string> {
  const agent = new LlmAgent({
    name: "oneshot_agent",
    model: new Gemini({ model, apiKey }),  // ← 사용자 키/모델 주입
    instruction,
  });
  const runner = new Runner({ agent, appName, sessionService: new InMemorySessionService() });

  for await (const event of runner.runEphemeral({ userId, newMessage })) {
    if (isFinalResponse(event)) result = stringifyContent(event);
  }
  return result;
}
```

- 매 호출마다 새 `LlmAgent` + `InMemorySessionService` 인스턴스 생성
- `runEphemeral()` — 세션 저장 없이 1회성 실행
- 분석, 평가, 힌트처럼 대화 이력이 불필요한 1회성 작업에 사용

### 4-2. ADK Runner — 면접관 에이전트

```typescript
// runners.ts — 모듈 레벨 싱글턴
const interviewAgent = new LlmAgent({
  name: "interview_agent",
  model: new Gemini({ model: "gemini-2.5-flash", apiKey: env.googleApiKey }),
  instruction: interviewInstruction, // InstructionProvider — 매 턴 동적 생성
});

export const interviewRunner = new Runner({
  agent: interviewAgent,
  appName: APP_NAME,
  sessionService, // InMemorySessionService 싱글턴
});
```

- 모듈 레벨 싱글턴 — Vercel 워밍 인스턴스에서 세션 재사용
- `runAsync()` — 기존 세션에 턴 추가
- 시스템 프롬프트는 `InstructionProvider`로 매 턴마다 세션 state에서 동적 읽기
- 사용자 BYOK 키/모델은 `runAsync()` 호출 전 에이전트에 동적 주입

---

## 5. 에이전트 상세

### 5-1. 분석 에이전트

|항목|내용|
|---|---|
|실행 방식|`runOneShot()`|
|호출 시점|`type: "analyze"` — 면접 시작 버튼 클릭 직후|
|모델|`getUserAiConfig(userId).model` (기본: gemini-2.5-flash)|
|프롬프트 빌더|`buildAnalysisPrompt()`|

**입력:** JD 텍스트, 이력서·포트폴리오·GitHub 파싱 텍스트, 페르소나, 면접 시간, userProfile

**처리:**

1. JD 핵심 키워드 추출 (필수 요건 / 우대사항 분리)
2. 이력서 경력·프로젝트·수치 성과 추출
3. JD ↔ 이력서 매핑 (강점 / 우대사항 갭)
4. 질문 세트 생성 (`round(duration / 5 × 1.5)`개)

**완료 후 즉시:** ADK 세션 생성 → 면접관 에이전트 첫 질문 요청 → Supabase에 `analysis_json` + `adk_session_id` 저장

**출력:** `AnalysisOutput` JSON (`analysis` + `questions[]`)

---

### 5-2. 면접관 에이전트

|항목|내용|
|---|---|
|실행 방식|ADK `interviewRunner.runAsync()`|
|호출 시점|첫 질문(analyze 완료 후), 유저 답변마다(respond), 건너뛰기(skip)|
|모델|`getUserAiConfig(userId).model` (기본: gemini-2.5-flash)|
|세션 관리|`InMemorySessionService` 싱글턴|

**세션 state 보유 항목:**

|state 키|내용|
|---|---|
|`persona`|`"explorer"` \| `"pressure"` \| `"technical"`|
|`jdText`|JD 텍스트|
|`resumeTexts`|문서 섹션 배열 (레이블 포함)|
|`analysisJson`|분석 에이전트 출력 전체|
|`remainingSeconds`|남은 면접 시간 (초)|
|`totalSeconds`|총 면접 시간 (초)|
|`userProfile`|직군·경력·기술스택|
|`customInstructions`|유저 작성 페르소나 추가 지침|

**시스템 프롬프트:** `InstructionProvider`가 매 턴마다 세션 state를 읽어 `buildInterviewSystemPrompt()`를 동적으로 호출한다.

**호출 액션별 프롬프트:**

|액션|사용 프롬프트|동작|
|---|---|---|
|면접 시작|`buildFirstQuestionPrompt()`|인사말 + 첫 질문 생성|
|유저 답변|`buildRespondPrompt(userAnswer)`|꼬리질문 여부 판단 + 다음 발화|
|건너뛰기|`buildSkipPrompt()`|"알겠습니다" + 다음 질문 이동|

**콜드 스타트 재구성:**

Vercel 콜드 스타트 시 `InMemorySessionService`가 비어 있으므로, `ensureAdkSession()`이 Supabase `interview_messages`에서 최근 30개 메시지를 읽어 ADK 세션을 재구성한 뒤 `runAsync()`를 호출한다.

```
콜드 스타트 감지
  └─ sessionService.getSession() → null
  └─ sessionService.createSession() + state 주입
  └─ Supabase messages 최근 30개 읽기
  └─ createEvent()로 각 메시지를 ADK 이벤트로 변환
  └─ sessionService.appendEvent() 반복
  └─ runAsync() 호출
```

30개로 제한하는 이유: 면접관 에이전트는 시스템 프롬프트에 전체 질문 목록을 보유하므로 초기 대화 이력이 없어도 질문 진행에 문제없다.

---

### 5-3. 힌트 에이전트

|항목|내용|
|---|---|
|실행 방식|`runOneShot()`|
|호출 시점|`type: "hint"` — 유저가 힌트 버튼 클릭|
|모델|`getUserAiConfig(userId).model`|
|프롬프트 빌더|`buildHintPrompt()`|
|출력 형식|**순수 텍스트** (JSON 아님)|

직전 인터뷰어 메시지에서 현재 질문 ID를 찾아 `intent`와 `good_answer_tips`를 컨텍스트로 제공한다. 최근 6개 메시지를 함께 전달해 어떤 프로젝트·주제를 논의 중인지 파악한다.

클라이언트는 힌트 텍스트를 받아 `[모범 답안] {hint}` 접두사를 붙여 `type: "respond"`로 전송한다. 이 마커는 평가 에이전트에서 해당 답변의 점수 상한(40점)을 트리거한다.

---

### 5-4. 평가 에이전트

|항목|내용|
|---|---|
|실행 방식|`runOneShot()`|
|호출 시점|`type: "evaluate"` — 면접 종료 후|
|모델|`getUserAiConfig(userId).model`|
|프롬프트 빌더|`buildEvaluationPrompt()`|

**QaGroup 조립 (AI 호출 없이 API Route에서 코드로 처리):**

```
Supabase interview_messages 전체 읽기
  └─ question_id가 있는 메시지 발견 → activeQid 업데이트
  └─ question_id 없는 꼬리질문/답변 → 현재 activeQid 그룹에 turns 추가
  └─ [모범 답안] 접두사 → used_hint: true 마킹
  └─ [질문 건너뛰기] 내용 → skipped: true 마킹
```

**출력:** `EvaluationOutput` JSON → Supabase `interview_reports` 저장

---

## 6. API Route 액션 플로우

`/api/interview` POST 엔드포인트는 `type` 필드로 5가지 액션을 처리한다.

### analyze — 면접 분석 + 첫 질문

```
요청: { type: "analyze", sessionId }

1. getUser() → getUserAiConfig(userId) → { apiKey, model }  ← v3.0
2. Supabase에서 session, documents, userProfile, personaSettings 병렬 조회
3. buildAnalysisPrompt() → runOneShot(apiKey, model) → AnalysisOutput JSON 파싱
4. ADK 세션 생성 (state 주입)
5. Supabase session에 analysis_json + adk_session_id 저장
6. interviewRunner.runAsync(buildFirstQuestionPrompt()) → 첫 질문 생성
7. Supabase interview_messages에 첫 질문 저장
8. generateTtsBase64(firstMessage) 병렬 실행  ← 서버 키 고정
9. 응답: { analysisJson, firstMessage, audioBase64 }
```

### respond — 유저 답변 처리

```
요청: { type: "respond", sessionId, userMessage }

1. getUser() → getUserAiConfig(userId)  ← v3.0
2. userMessage를 Supabase interview_messages에 저장 (마커 포함)
3. [모범 답안] 마커 제거 후 에이전트에 전달
4. ensureAdkSession() — 콜드 스타트 시 세션 재구성
5. interviewRunner.runAsync(buildRespondPrompt()) → 다음 발화 생성
6. 면접관 메시지 Supabase 저장 + generateTtsBase64() 병렬 실행
7. 응답: { message, audioBase64 }
```

### hint — 모범 답안 생성

```
요청: { type: "hint", sessionId }

1. getUser() → getUserAiConfig(userId)  ← v3.0
2. Supabase messages에서 마지막 인터뷰어 메시지의 question_id 조회
3. analysisJson에서 해당 질문의 intent + good_answer_tips 조회
4. 최근 6개 메시지를 컨텍스트로 buildHintPrompt() → runOneShot(apiKey, model)
5. 응답: { hint } — 순수 텍스트
```

### skip — 질문 건너뛰기

```
요청: { type: "skip", sessionId }

1. getUser() → getUserAiConfig(userId)  ← v3.0
2. "[질문 건너뛰기]" 메시지 Supabase 저장
3. ensureAdkSession()
4. interviewRunner.runAsync(buildSkipPrompt()) → "알겠습니다" + 다음 질문
5. 면접관 메시지 저장 + generateTtsBase64() 병렬 실행
6. 응답: { message, audioBase64 }
```

### evaluate — 면접 평가

```
요청: { type: "evaluate", sessionId }

1. getUser() → getUserAiConfig(userId)  ← v3.0
2. Supabase에서 전체 대화 이력 조회
3. API Route에서 코드로 QaGroup[] 조립 (AI 호출 없음)
4. buildEvaluationPrompt(qaGroups, analysisJson) → runOneShot(apiKey, model)
5. EvaluationOutput JSON 파싱
6. Supabase interview_reports에 upsert
7. 응답: { reportJson }
```

---

## 7. 메시지 마커 시스템

유저 메시지에 특수 접두사를 붙여 힌트 사용과 건너뛰기를 추적한다.

|마커|저장 내용|에이전트 전달 시|평가 영향|
|---|---|---|---|
|`[모범 답안] {text}`|마커 포함해서 DB 저장|마커 제거 후 전달|`used_hint: true` → 점수 최대 40점|
|`[질문 건너뛰기]`|그대로 저장|`buildSkipPrompt()` 호출|`skipped: true` → 모든 점수 0점|

---

## 8. 데이터 흐름

```
[면접 시작]
유저 입력 (JD, 이력서, 페르소나, 시간)
    │
    ▼ type: "analyze"
getUserAiConfig(userId) → { apiKey, model }     ← v3.0
buildAnalysisPrompt() → runOneShot(apiKey, model)
    │ AnalysisOutput
    ▼
ADK 세션 생성 (state 주입)
Supabase: analysis_json + adk_session_id 저장
    │
    ▼ buildFirstQuestionPrompt()
interviewRunner.runAsync()
    │ 첫 질문 + audioBase64 (TTS: 서버 키)
    ▼
Supabase: interview_messages 저장

[면접 진행 — 매 턴]
유저 답변 입력
    │
    ▼ type: "respond"
getUserAiConfig(userId)                          ← v3.0
Supabase: 유저 메시지 저장 (마커 포함)
ensureAdkSession() — 콜드 스타트 대응
buildRespondPrompt() → interviewRunner.runAsync()
    │ 다음 발화 + audioBase64 (TTS: 서버 키)
    ▼
Supabase: 면접관 메시지 저장

[면접 종료]
    │ type: "evaluate"
getUserAiConfig(userId)                          ← v3.0
Supabase: 전체 messages 조회
API Route: QaGroup[] 조립 (코드 로직, AI 없음)
buildEvaluationPrompt() → runOneShot(apiKey, model)
    │ EvaluationOutput
    ▼
Supabase: interview_reports upsert
```

---

## 9. DB 스키마 (마이그레이션 기반 최신)

마이그레이션 파일 4개 기준 현재 스키마.

```sql
-- 유저 문서
user_documents
  id uuid PK
  user_id uuid → auth.users
  type text ('resume' | 'portfolio')
  file_url text
  parsed_text text
  created_at, updated_at timestamptz

-- 면접 세션
interview_sessions
  id uuid PK
  user_id uuid → auth.users
  title text                        ← 20260331 마이그레이션 추가
  jd_text text
  persona text ('explorer' | 'pressure' | 'technical')
  duration_minutes integer
  remaining_seconds integer         ← 이어하기용
  resume_ids uuid[]
  analysis_json jsonb
  adk_session_id uuid
  started_at, ended_at timestamptz
  status text ('in_progress' | 'completed' | 'abandoned')
  created_at timestamptz

-- 대화 이력
interview_messages
  id uuid PK
  session_id uuid → interview_sessions
  role text ('interviewer' | 'user')
  content text
  depth integer default 0
  question_id text
  created_at timestamptz

-- 리포트
interview_reports
  id uuid PK
  session_id uuid → interview_sessions
  total_score integer
  summary text
  report_json jsonb
  created_at timestamptz

-- 페르소나 커스텀 지침 (20260331 마이그레이션 추가)
user_persona_settings
  id uuid PK
  user_id uuid → auth.users
  persona text ('explorer' | 'pressure' | 'technical')
  custom_instructions text default ''
  updated_at timestamptz
  UNIQUE(user_id, persona)

-- 사용자 API 설정 (20260401 마이그레이션 추가) ← v3.0 신규
user_api_settings
  id uuid PK
  user_id uuid → auth.users (UNIQUE)
  model text NOT NULL DEFAULT 'gemini-2.5-flash'
  api_key_enc text          ← AES-256-GCM 암호화. null이면 서버 기본 키 사용
  updated_at timestamptz DEFAULT now()
```

**RLS 정책 요약:** 모든 테이블에 RLS 적용. 유저는 본인 데이터만 접근 가능.

|테이블|정책|
|---|---|
|user_api_settings|`auth.uid() = user_id` — v3.0 신규|
|그 외 테이블|기존과 동일|

---

## 10. 에러 핸들링

> 불완전한 면접 경험은 실전 대응에 치명적이다. 폴백 없이 실패는 실패로 처리한다.

|상황|처리 방식|
|---|---|
|runOneShot 실패|즉시 500 에러 반환, 클라이언트에서 재시도 버튼 제공|
|JSON 파싱 실패|`extractJson()`으로 마크다운 코드 펜스 제거 후 재파싱. 실패 시 500 반환|
|ADK 세션 없음 (콜드 스타트)|`ensureAdkSession()`으로 Supabase 메시지 기반 자동 재구성|
|TTS 실패|`null` 반환 (non-critical). 텍스트만 표시하고 면접 계속 진행|
|STT 실패|`/api/transcribe` 500 반환, 클라이언트에서 텍스트 직접 입력 유도|
|사용자 API 키 유효하지 않음|Gemini 401/403 → 500 반환 + 클라이언트에 키 오류 안내 — v3.0 추가|
|폴백|**없음** — 부분 기능 제외 진행 불허|

---

## 11. 성능 고려사항

|항목|내용|대응|
|---|---|---|
|Gemini API 레이턴시|프록시 경유 100~300ms 추가|TTS 생성과 메시지 저장 병렬 실행 (`Promise.all`)|
|Vercel 콜드 스타트|InMemorySessionService 초기화|`ensureAdkSession()`으로 최근 30개 메시지 재구성|
|Vercel 함수 타임아웃|무료 티어 10초 제한|스트리밍 응답으로 처리|
|과도한 DB 쓰기|Supabase 무료 티어 API 제한|매 초 저장 금지, 답변 완료 단위로만 저장|
|상위 모델 레이턴시|gemini-3.1-pro-preview는 응답이 느릴 수 있음|사용자 선택 모델이므로 별도 대응 없음, UI 안내|

---

## 12. 보안

|항목|처리 방식|
|---|---|
|서버 Gemini API 키|`env.googleApiKey` 서버 환경변수 전용. 클라이언트 노출 금지|
|사용자 API 키 저장|AES-256-GCM 암호화 후 `user_api_settings.api_key_enc`에 저장. 평문 저장 금지|
|암호화 키|`ENCRYPTION_KEY` 서버 환경변수 전용. 유출 시 전체 사용자 키 노출 — Vercel 환경변수에서 엄격 관리|
|복호화 위치|`ai-config.ts` 서버에서만 수행. 클라이언트에 평문 키 전달 금지|
|클라이언트 AI 직접 호출|`/api/interview` Route를 통해서만 AI 호출|
|세션 접근 제어|`getSession()` 후 `session.user_id !== user.id` 검증|
|문서 접근 제어|Supabase RLS — 본인 문서만 접근 가능|
|페르소나 설정 접근|Supabase RLS — `own persona settings only` 정책|
|API 설정 접근|Supabase RLS — `own api settings only` 정책 — v3.0 추가|

---

## 13. v2.0 → v3.0 주요 변경 사항

|항목|v2.0|v3.0|
|---|---|---|
|AI 키 관리|서버 단일 키|**사용자 BYOK 키 추가 (AES-256-GCM 암호화 저장)**|
|API Route 진입|getUser() → 액션 처리|**getUser() → getUserAiConfig() → 액션 처리**|
|모델|gemini-2.5-flash 고정|**기본 flash, BYOK로 2.5-pro·3.1-pro-preview 선택 가능**|
|TTS/STT|서버 키 사용|**항상 서버 키 사용 명시 (BYOK 무관)**|
|DB 테이블|5개|**6개 (user_api_settings 추가)**|
|신규 파일|—|**crypto.ts, ai-config.ts, settings/actions.ts 확장**|
|환경변수|GOOGLE_API_KEY 외|**ENCRYPTION_KEY 추가**|

---

_본 문서는 BYOK 설계 확정 기준 v3.0입니다. 구현 진행에 따라 지속 업데이트됩니다._