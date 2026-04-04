작성일: 2026-04-01 | 상태: Draft | 이전 버전: TRD v2.0 (2026-03-31)

---

## 변경 이력

|버전|날짜|주요 변경 내용|
|---|---|---|
|v1.0|2026-03-27|최초 작성|
|v2.0|2026-03-31|코드베이스 반영 전면 업데이트: 모델 변경(gemini-2.5-flash), TTS/STT 추가, 페르소나 2종 확정, ADK 적용 범위 수정, API Route 구조 확정, DB 스키마 최신화(title·remaining_seconds·resume_ids·adk_session_id·user_profiles·user_persona_settings), 타이머 구현 방식 확정, 콜드 스타트 대응 추가, 메시지 마커 시스템 추가|
|v3.0|2026-04-01|BYOK(Gemini) 기능 추가: user_api_settings 테이블, AES-256 암호화(crypto.ts), ai-config.ts, Settings 페이지, 지원 모델 목록, env.ts 업데이트, 보안 섹션 확장|
|v3.1|2026-04-04|기술 검증형 페르소나 추가: DB CHECK 제약 마이그레이션, Persona 타입 3종 확장, 프롬프트 맵 업데이트|

---

## 1. 기술 스택

|영역|기술|버전 / 비고|
|---|---|---|
|**IDE**|Google Antigravity|Gemini 기반 에이전트 개발 환경|
|**에이전트 프레임워크**|Google ADK (TypeScript)|`@google/adk ^0.6.0` — 면접관 에이전트에만 적용|
|**Framework**|Next.js|v16.2.1, App Router|
|**UI**|shadcn/ui + Radix UI||
|**AI — 면접/평가/분석 (기본)**|Gemini 2.5 Flash|`gemini-2.5-flash` — 서버 키 사용|
|**AI — 면접/평가/분석 (BYOK)**|Gemini 2.5 Flash / 2.5 Pro / 3.1 Pro Preview|사용자 키 사용 시 선택 가능|
|**AI — TTS**|Gemini 2.5 Flash Preview TTS|`gemini-2.5-flash-preview-tts` — 항상 서버 키 사용|
|**AI — STT**|Gemini 2.5 Flash|오디오 전사, `/api/transcribe` — 항상 서버 키 사용|
|**암호화**|Node.js `crypto` (AES-256-GCM)|사용자 API 키 암호화 저장|
|**Database**|Supabase|무료 티어|
|**Auth**|Supabase Auth|Google OAuth, `@supabase/ssr ^0.9.0`|
|**Storage**|Supabase Storage|무료 티어 (1GB), `documents` 버킷|
|**배포**|Vercel|무료 티어|
|**문서 파싱**|`pdfjs-dist`|서버 사이드 파싱 (Server Actions), PDF 전용|

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
[클라이언트]
├─ 타이머 관리 (setInterval 카운트다운)
├─ UI 상태 (React useState / useRef)
├─ 마이크 녹음 (MediaRecorder API)
└─ AI 호출 → /api/interview 위임 (직접 호출 금지)

[Next.js Server]
├─ /api/interview     — 5개 액션 (analyze / respond / hint / skip / evaluate)
├─ /api/transcribe    — STT: 오디오 → 텍스트 (항상 서버 키)
├─ /api/tts           — TTS: 텍스트 → WAV (항상 서버 키)
├─ Server Actions     — 세션 생성·상태 업데이트·타이머 저장·API 키 저장
└─ Middleware         — Supabase 세션 갱신

[Supabase]
├─ Auth (Google OAuth)
├─ DB  (sessions, messages, reports, profiles, persona_settings, api_settings)
└─ Storage (documents 버킷: 이력서·포트폴리오 파일)
```

### 2.2 아키텍처 결정 원칙

- `GOOGLE_API_KEY`는 서버 환경변수에만 저장 — 클라이언트 절대 노출 금지
- 사용자 API 키는 AES-256-GCM으로 암호화 후 DB 저장 — 서버에서만 복호화
- 모든 AI 호출은 `/api/interview` 통과 (API 키 보호 + 인증 검증)
- TTS / STT는 항상 서버 `GOOGLE_API_KEY` 사용 — 사용자 키와 무관
- 환경변수는 `src/lib/env.ts`에서 중앙 관리

```typescript
// lib/env.ts — 서버/클라이언트 접근 분리
export const env = {
  googleApiKey:           process.env.GOOGLE_API_KEY!,           // 서버 전용
  encryptionKey:          process.env.ENCRYPTION_KEY!,           // 서버 전용 (AES-256, 32바이트 hex)
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!, // 서버 전용
  supabaseUrl:            process.env.NEXT_PUBLIC_SUPABASE_URL!,  // 클라이언트 허용
  supabaseAnonKey:        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, // 클라이언트 허용
}
```

**환경변수 추가 (v3.0 신규):**

```bash
# .env.local 및 Vercel 환경변수에 추가
ENCRYPTION_KEY=   # openssl rand -hex 32 으로 생성한 32바이트 hex 문자열
```

---

## 3. 멀티 에이전트 구조

### 3.1 에이전트 개요

```
[분석 에이전트]  — runOneShot (ephemeral, 세션 없음)
  └─ JD + 이력서 → 질문 세트 생성

[면접관 에이전트] — ADK LlmAgent + Runner (세션 보유)
  └─ 페르소나 대화 진행, 꼬리질문 판단

[힌트 에이전트]  — runOneShot (ephemeral)
  └─ 이력서 기반 모범 답안 실시간 생성

[평가 에이전트]  — runOneShot (ephemeral)
  └─ 전체 대화 → 리포트 생성
```

**SequentialAgent 오케스트레이터는 사용하지 않는다.** 에이전트 호출 순서는 `/api/interview` Route에서 코드로 제어한다.

### 3.2 실행 패턴

#### runOneShot (분석·힌트·평가)

```typescript
async function runOneShot(instruction, userMessage, userId, apiKey, model): Promise<string> {
  const agent = new LlmAgent({ name: "oneshot_agent", model: makeGemini(apiKey, model), instruction });
  const runner = new Runner({ agent, appName, sessionService: new InMemorySessionService() });

  let result = "";
  for await (const event of runner.runEphemeral({ userId, newMessage })) {
    if (isFinalResponse(event)) result = stringifyContent(event);
  }
  return result;
}
```

- 매 호출마다 새 에이전트·서비스 인스턴스 생성
- `runEphemeral()` — 세션 저장 없이 1회성 실행
- 대화 이력이 불필요한 1회성 작업에 사용
- `makeGemini(apiKey, model)` — 사용자 키/모델 또는 서버 기본값 주입

#### ADK Runner (면접관)

```typescript
// runners.ts — 모듈 레벨 싱글턴
// 주의: 싱글턴이므로 사용자별 키/모델 차이는 runAsync() 호출 전 동적으로 처리
const interviewAgent = new LlmAgent({
  name: "interview_agent",
  model: new Gemini({ model: "gemini-2.5-flash" }), // 기본값; 사용자 키 적용 시 교체
  instruction: interviewInstruction, // InstructionProvider (동적)
});
export const interviewRunner = new Runner({
  agent: interviewAgent,
  appName: APP_NAME,
  sessionService, // InMemorySessionService 싱글턴
});
```

- Vercel 워밍 인스턴스에서 세션 재사용
- `runAsync()` — 기존 세션에 턴 추가
- `InstructionProvider`가 매 턴 세션 state에서 시스템 프롬프트 동적 재생성
- 사용자 BYOK 키/모델은 ADK 에이전트 생성 시 주입

### 3.3 실행 순서

```
[면접 시작 — type: "analyze"]
  getUserAiConfig(userId) → { apiKey, model }
  분석 에이전트 (runOneShot, 사용자 키/모델 적용)
  └─ AnalysisOutput 생성 → ADK 세션 생성 (state 주입)
  └─ Supabase: analysis_json + adk_session_id 저장
  └─ 면접관 에이전트 (ADK) 첫 질문 생성 → TTS 병렬

[면접 진행 — type: "respond" / "skip"]
  면접관 에이전트 (ADK runAsync, 사용자 키/모델 적용)
  └─ 꼬리질문 여부 판단 → 다음 발화 → TTS 병렬

[힌트 — type: "hint"]
  힌트 에이전트 (runOneShot, 사용자 키/모델 적용)
  └─ 순수 텍스트 모범 답안 반환

[면접 종료 — type: "evaluate"]
  API Route에서 QaGroup[] 코드로 조립 (AI 없음)
  └─ 평가 에이전트 (runOneShot, 사용자 키/모델 적용) → EvaluationOutput
  └─ Supabase interview_reports upsert
```

### 3.4 콜드 스타트 대응

Vercel 콜드 스타트 시 `InMemorySessionService`가 초기화되어 세션이 사라진다. `ensureAdkSession()`이 이를 자동 복구한다.

```
ensureAdkSession() 호출
  └─ sessionService.getSession() → null (세션 없음)
  └─ sessionService.createSession() + state 주입
  └─ Supabase interview_messages 최근 30개 조회
  └─ createEvent()로 각 메시지 → ADK 이벤트 변환
  └─ sessionService.appendEvent() 반복 후 runAsync() 호출
```

30개 상한 이유: 시스템 프롬프트에 전체 질문 목록이 있으므로 초기 대화 손실이 질문 진행에 영향 없음.

### 3.5 에러 핸들링

> 불완전한 면접 경험은 실전 대응에 치명적이다. 폴백 없이 실패는 실패로 처리한다.

|상황|처리 방식|
|---|---|
|runOneShot 실패|즉시 500 반환, 클라이언트 재시도 유도|
|JSON 파싱 실패|`extractJson()`으로 마크다운 코드 펜스 제거 후 재파싱. 실패 시 500 반환|
|ADK 세션 없음|`ensureAdkSession()`으로 자동 재구성|
|TTS 실패|`null` 반환 (non-critical). 텍스트만 표시하고 면접 계속 진행|
|사용자 API 키 유효하지 않음|Gemini API 401/403 → 500 반환 + 클라이언트에 키 오류 안내|
|폴백|**없음**|

---

## 4. 면접관 에이전트 상세

### 4.1 페르소나 시스템 프롬프트

|코드값|이름|depth 상한|특성|
|---|---|---|---|
|`explorer`|경험 탐색형|**최대 2**|편안하고 대화적, 열린 질문, depth 2 초과 시 강제 다음 주제 전환|
|`pressure`|심층 압박형|**최대 4**|논리적 허점 지적, 수치·사례 없으면 반드시 꼬리질문|
|`technical`|기술 검증형|**최대 4**|설계 결정 근거·CS 원리·성능 트레이드오프 집중 검증, why/how 중심|

### 4.2 커스텀 지침 주입

유저가 작성한 `customInstructions`가 있으면 페르소나 기본 지침 뒤, 면접 컨텍스트 앞에 `## 사용자 추가 지침` 섹션으로 삽입된다. 없으면 섹션 자체가 생략된다.

### 4.3 시간 관리

- 남은 시간 `< totalSeconds × 0.2` → 시스템 프롬프트에 경고 삽입 → `type: "closing"` 전환 지시
- `InstructionProvider`가 매 턴 `state.remainingSeconds`를 읽으므로 자동 반영

### 4.4 꼬리질문 판단

룰 기반 필터 없음. AI가 대화 전체 컨텍스트를 보고 판단한다.

```
판단 기준 (AI에게 전달)
├─ 답변이 모호하거나 추상적인가?
├─ 수치나 구체적 사례가 없는가?
├─ 더 파고들 만한 흥미로운 키워드가 있는가?
├─ 답변이 불충분한가?
└─ 현재 depth < 페르소나 상한?

→ 하나라도 해당 + depth 미달 → 꼬리질문
→ 모두 해당 없거나 depth 상한 도달 → 다음 질문
```

---

## 5. API Route 구조

**엔드포인트:** `POST /api/interview`

모든 요청에서 `getUser()` 인증 검증 → `getUserAiConfig(userId)` 호출 → 세션 소유자 확인 후 처리.

|type|역할|응답|
|---|---|---|
|`analyze`|분석 + 첫 질문 생성|`{ analysisJson, firstMessage, audioBase64 }`|
|`respond`|유저 답변 처리 + 다음 발화|`{ message, audioBase64 }`|
|`hint`|모범 답안 실시간 생성|`{ hint }` — 순수 텍스트|
|`skip`|질문 건너뛰기 + 다음 질문|`{ message, audioBase64 }`|
|`evaluate`|면접 평가 + 리포트 저장|`{ reportJson }`|

**기타 엔드포인트:**

|경로|메서드|역할|
|---|---|---|
|`/api/transcribe`|POST|STT: webm 오디오 → 한국어 텍스트 전사 (서버 키 고정)|
|`/api/tts`|POST|TTS: 텍스트 → WAV 오디오 반환 (서버 키 고정)|

### 5.1 Server Actions (`src/app/(main)/interview/actions.ts`)

클라이언트에서 직접 호출하는 서버 함수들.

|함수|역할|
|---|---|
|`createInterviewSessionAction()`|세션 생성 (title, jdText, persona, durationMinutes, resumeIds)|
|`updateSessionStatusAction()`|세션 상태 변경 (in_progress / completed / abandoned)|
|`saveRemainingSecondsAction()`|남은 시간 DB 저장 (이탈·종료 시)|
|`saveAnalysisAction()`|분석 결과 저장|
|`deleteInterviewSessionsAction()`|세션 삭제|

### 5.2 Settings Server Actions (`src/app/(main)/settings/actions.ts`) — v3.0 신규

|함수|역할|
|---|---|
|`saveApiKeyAction(apiKey, model)`|키 AES-256 암호화 → user_api_settings upsert|
|`deleteApiKeyAction()`|api_key_enc = null, model = 기본값으로 초기화|
|`getApiSettingsAction()`|현재 설정 조회 (키 마스킹, 모델명만 반환)|

---

## 6. BYOK (Bring Your Own Key) 시스템 — v3.0 신규

사용자가 자신의 Gemini API 키를 등록하면 더 강력한 상위 모델을 사용할 수 있다.

### 6.1 지원 모델

|모델 ID|이름|비고|
|---|---|---|
|`gemini-2.5-flash`|Gemini 2.5 Flash|**기본값** — 서버 키, 무료|
|`gemini-2.5-pro`|Gemini 2.5 Pro|사용자 키 필요|
|`gemini-3.1-pro-preview`|Gemini 3.1 Pro Preview|사용자 키 필요, 최고 성능|

### 6.2 키 적용 우선순위

```
getUserAiConfig(userId) 호출
  └─ user_api_settings에 api_key_enc 있음?
      ├─ YES → 복호화 후 사용자 키 + 선택 모델 사용
      └─ NO  → 서버 GOOGLE_API_KEY + gemini-2.5-flash 사용
```

### 6.3 암호화 구현 (`src/lib/crypto.ts`) — v3.0 신규

AES-256-GCM 방식. IV와 인증 태그를 함께 저장해 무결성을 보장한다.

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex") // 32바이트

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":")
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encHex] = ciphertext.split(":")
  const decipher = createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"))
  decipher.setAuthTag(Buffer.from(tagHex, "hex"))
  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8")
}
```

### 6.4 AI 설정 조회 (`src/lib/ai-config.ts`) — v3.0 신규

```typescript
export const DEFAULT_MODEL = "gemini-2.5-flash"

export async function getUserAiConfig(userId: string): Promise<{
  apiKey: string
  model: string
  isCustom: boolean
}> {
  const { data } = await supabase
    .from("user_api_settings")
    .select("api_key_enc, model")
    .eq("user_id", userId)
    .single()

  if (data?.api_key_enc) {
    return { apiKey: decrypt(data.api_key_enc), model: data.model, isCustom: true }
  }
  return { apiKey: process.env.GOOGLE_API_KEY!, model: DEFAULT_MODEL, isCustom: false }
}
```

### 6.5 Settings 페이지 (`src/app/(main)/settings/page.tsx`) — v3.0 신규

|섹션|내용|
|---|---|
|현재 상태 배지|"기본 모델 사용 중 (gemini-2.5-flash)" / "내 API 키 사용 중 (gemini-3.1-pro-preview)"|
|API 키 입력창|password 타입. 저장된 경우 `••••••••` 표시|
|모델 선택 드롭다운|gemini-2.5-flash / gemini-2.5-pro / gemini-3.1-pro-preview|
|저장 버튼|`saveApiKeyAction()` 호출|
|키 삭제 버튼|`deleteApiKeyAction()` 호출 → 기본값으로 복귀|
|안내 문구|"API 키는 AES-256 암호화 후 저장되며 서버에서만 복호화됩니다"|
|TTS/STT 안내|"음성 기능은 항상 서버 기본 키를 사용합니다"|

---

## 7. 음성 기능 (TTS / STT)

### 7.1 TTS — AI 면접관 음성 출력

```typescript
// lib/tts.ts
// Gemini 2.5 Flash Preview TTS 호출 → PCM → WAV 변환 → base64 반환
// 항상 서버 GOOGLE_API_KEY 사용 — 사용자 BYOK 키 무관
export async function generateTtsBase64(text: string): Promise<string | null>
```

- 모델: `gemini-2.5-flash-preview-tts`, 음성: `Kore`
- 샘플레이트: 24000Hz, 모노, 16bit PCM → WAV 헤더 추가
- 재생 속도: 1.3× (클라이언트 `audio.playbackRate`)
- **non-critical**: 실패 시 `null` 반환, 면접 중단 없음
- TTS 생성과 메시지 DB 저장은 `Promise.all`로 병렬 처리

### 7.2 STT — 유저 마이크 음성 입력

```
클라이언트 MediaRecorder (audio/webm;codecs=opus)
  └─ 녹음 완료 → /api/transcribe 전송
  └─ Gemini 2.5 Flash 오디오 전사 → 한국어 텍스트 (서버 키 고정)
  └─ 답변창에 자동 입력 → respond 액션으로 전송
```

- MIME 타입에서 코덱 정보 제거 후 Gemini 전달 (`audio/webm;codecs=opus` → `audio/webm`)
- 실패 시 에러 안내 + 텍스트 직접 입력 유도

### 7.3 환경설정 (`/preferences`)

- 마이크 / 스피커 장치 선택 (MediaDevices API)
- 마이크·스피커 음량 슬라이더 (0~100)
- 마이크 테스트 (실시간 레벨 미터, 30 bar 시각화)
- 마이크 권한 미허용 시 장치 목록 비활성화 + 권한 요청 버튼

---

## 8. 상태 관리

### 8.1 면접 세션 상태

```
[브라우저 메모리 — React useState / useRef]
├─ secondsLeft      — 남은 시간 카운트다운
├─ messages         — 대화 이력 (화면 렌더링용)
├─ isPlaying        — 면접 진행 중 여부
├─ ttsEnabled       — TTS 활성화 여부
└─ 각종 로딩 상태 (isSending, isHinting, isEvaluating ...)

[Supabase DB — Server Actions 호출 시점]
├─ 면접 시작       → createSession() — started_at, 설정값 저장
├─ 매 답변 완료    → createMessage() — 대화 이력 저장
├─ 면접 종료       → updateSession(status: "completed"), remaining_seconds: null
├─ 이탈·일시정지   → saveRemainingSecondsAction() — 남은 시간 저장
└─ 리포트 생성     → interview_reports upsert
```

### 8.2 타이머 관리

```typescript
// 클라이언트 setInterval 카운트다운 — 1초마다 감소
intervalRef.current = setInterval(() => {
  setSecondsLeft((prev) => {
    if (prev <= 1) {
      clearInterval(intervalRef.current!);
      updateSessionStatusAction(session.id, "completed");
      setTimeUpOpen(true);
      return 0;
    }
    return prev - 1;
  });
}, 1000);
```

- 초기값: `session.remaining_seconds ?? totalSeconds` (이어하기 지원)
- 시간 종료 시: 자동으로 completed 처리 + 종료 다이얼로그 표시
- 이탈·일시정지 시: `saveRemainingSecondsAction(session.id, secondsLeftRef.current)` 호출

### 8.3 이어하기 플로우

```
면접 중 이탈 (뒤로가기 / 홈 버튼)
  └─ handleExit() 호출
  └─ clearInterval() + saveRemainingSecondsAction()
  └─ router.push("/interview")

재접속 시
  └─ /interview 페이지에서 in_progress 세션 감지
  └─ "이어하기" 버튼 클릭 → /interview/[sessionId]
  └─ remaining_seconds로 타이머 초기화
  └─ Supabase messages에서 대화 이력 복원
  └─ ensureAdkSession()으로 ADK 세션 재구성
```

---

## 9. 문서 파싱

### 9.1 파싱 위치

**서버 사이드 (Server Actions)** — 클라이언트가 아닌 서버에서 파싱.

### 9.2 지원 형식 및 라이브러리

|형식|라이브러리|저장|
|---|---|---|
|PDF|`pdfjs-dist` (serverExternalPackages로 번들 제외)|파싱 텍스트(최대 200,000자) → DB, 원본 → Storage|
|Git 링크|GitHub API (README fetch)|`file_url`에 URL, `parsed_text`는 README 텍스트(최대 20,000자)|

Storage 경로: `{user_id}/{document_id}`

### 9.3 문서 타입

`user_documents.type`: `'resume' | 'portfolio' | 'git'`

Git은 파일 없이 URL만 `file_url`에 저장. `upsertGitDocument()`로 upsert 처리 (유저당 Git 링크 1개 유지).

### 9.4 파싱 실패 처리

- 파싱 실패 시 에러 메시지 + 텍스트 직접 붙여넣기 옵션 제공
- 스캔본 PDF·이미지 기반 문서 파싱 불가 안내

---

## 10. 메시지 마커 시스템

유저 메시지에 특수 접두사를 붙여 힌트 사용과 건너뛰기를 추적한다.

|마커|저장 내용|에이전트 전달 시|평가 시 처리|
|---|---|---|---|
|`[모범 답안] {text}`|마커 포함 DB 저장|마커 제거 후 전달|`used_hint: true` → 점수 최대 40점|
|`[질문 건너뛰기]`|그대로 저장|`buildSkipPrompt()` 호출|`skipped: true` → 모든 점수 0점|

---

## 11. Supabase DB 스키마 (마이그레이션 기반 최신)

4개 마이그레이션 파일 기준 현재 스키마:

```sql
-- 유저 문서 (resume / portfolio / git)
user_documents
├─ id uuid PK
├─ user_id uuid → auth.users
├─ type text CHECK ('resume' | 'portfolio')  ← git은 타입 없이 URL만 저장
├─ file_url text     ← Storage 경로 또는 Git URL
├─ file_name text    ← 원본 파일명
├─ parsed_text text  ← 추출된 텍스트 (git은 빈 문자열)
├─ created_at timestamptz
└─ updated_at timestamptz

-- 면접 세션
interview_sessions
├─ id uuid PK
├─ user_id uuid → auth.users
├─ title text                    ← 히스토리 구분용 (마이그레이션 20260331-0001)
├─ jd_text text
├─ persona text CHECK ('explorer' | 'pressure')
├─ duration_minutes integer
├─ remaining_seconds integer     ← 이어하기용 남은 시간
├─ resume_ids uuid[]             ← 선택된 문서 ID 목록
├─ analysis_json jsonb           ← 분석 에이전트 AnalysisOutput
├─ adk_session_id uuid           ← ADK InMemorySession 식별자
├─ started_at timestamptz
├─ ended_at timestamptz
├─ status text CHECK ('in_progress' | 'completed' | 'abandoned')
└─ created_at timestamptz

-- 대화 이력
interview_messages
├─ id uuid PK
├─ session_id uuid → interview_sessions
├─ role text CHECK ('interviewer' | 'user')
├─ content text     ← 메시지 마커 포함 저장
├─ depth integer DEFAULT 0
├─ question_id text ← 질문 그룹핑 기준 (꼬리질문은 부모 question_id 상속)
└─ created_at timestamptz

-- 리포트
interview_reports
├─ id uuid PK
├─ session_id uuid → interview_sessions
├─ total_score integer
├─ summary text
├─ report_json jsonb  ← EvaluationOutput 전체
└─ created_at timestamptz

-- 유저 프로필 (직군·경력·기술스택)
user_profiles
├─ id uuid PK
├─ user_id uuid → auth.users (UNIQUE)
├─ job_category text
├─ years_of_experience integer
├─ tech_stack text[]
├─ skills text[]
├─ created_at timestamptz
└─ updated_at timestamptz

-- 페르소나 커스텀 지침 (마이그레이션 20260331-0002)
user_persona_settings
├─ id uuid PK
├─ user_id uuid → auth.users
├─ persona text CHECK ('explorer' | 'pressure')
├─ custom_instructions text DEFAULT ''
├─ updated_at timestamptz
└─ UNIQUE(user_id, persona)

-- 사용자 API 설정 (마이그레이션 20260401-0001) ← v3.0 신규
user_api_settings
├─ id uuid PK
├─ user_id uuid → auth.users (UNIQUE)
├─ model text NOT NULL DEFAULT 'gemini-2.5-flash'
├─ api_key_enc text          ← AES-256-GCM 암호화된 키. null이면 서버 기본 키 사용
└─ updated_at timestamptz DEFAULT now()
```

### RLS 정책

|테이블|정책|조건|
|---|---|---|
|user_documents|own documents only|`auth.uid() = user_id`|
|interview_sessions|own sessions only|`auth.uid() = user_id`|
|interview_messages|own messages only|`session_id IN (SELECT id FROM interview_sessions WHERE user_id = auth.uid())`|
|interview_reports|own reports only|동일|
|user_profiles|own profile only|`auth.uid() = user_id`|
|user_persona_settings|own persona settings only|`auth.uid() = user_id`|
|user_api_settings|own api settings only|`auth.uid() = user_id`|

---

## 12. 프롬프트 구조 요약

상세 내용은 Prompt Design Document v2.0 참고.

|프롬프트|빌더 함수|출력 형식|
|---|---|---|
|분석|`buildAnalysisPrompt()`|JSON (`AnalysisOutput`)|
|면접관 시스템|`buildInterviewSystemPrompt()`|시스템 프롬프트 텍스트|
|첫 질문|`buildFirstQuestionPrompt()`|JSON (`InterviewAgentOutput`)|
|유저 답변|`buildRespondPrompt()`|JSON (`InterviewAgentOutput`)|
|건너뛰기|`buildSkipPrompt()`|JSON (`InterviewAgentOutput`)|
|힌트|`buildHintPrompt()`|순수 텍스트 (JSON 아님)|
|평가|`buildEvaluationPrompt()`|JSON (`EvaluationOutput`)|

**JSON 파싱 주의:** Gemini가 가끔 마크다운 코드 펜스로 JSON을 감싸므로, `extractJson(raw)`로 펜스를 제거한 뒤 파싱한다.

---

## 13. 성능 고려사항

|항목|내용|대응|
|---|---|---|
|Gemini API 레이턴시|프록시 경유 100~300ms 추가|TTS 생성과 메시지 저장 `Promise.all` 병렬 처리|
|Vercel 콜드 스타트|InMemorySessionService 초기화|`ensureAdkSession()` 최근 30개 메시지 재구성|
|Vercel 함수 타임아웃|무료 티어 10초 제한|스트리밍 응답, 청크 분리|
|Server Action 파일 크기|Next.js 기본 4MB 제한|`serverActions.bodySizeLimit: "21mb"` + `proxyClientMaxBodySize: "21mb"` (Turbopack) 설정|
|Supabase DB 쓰기|무료 티어 API 제한|매 초 저장 금지, 답변 완료 단위로만 저장|
|Storage 용량|무료 티어 1GB 제한|트래픽 증가 시 Cloudflare R2 마이그레이션 검토|
|상위 모델 레이턴시|gemini-3.1-pro-preview는 응답이 느릴 수 있음|사용자가 선택한 모델이므로 별도 대응 없음, UI에서 안내|

---

## 14. 보안 고려사항

|항목|처리 방식|
|---|---|
|서버 Gemini API 키|`GOOGLE_API_KEY` 서버 환경변수 전용, `lib/env.ts` 중앙 관리|
|사용자 API 키 저장|AES-256-GCM 암호화 후 DB 저장 (`api_key_enc`). 평문 저장 금지|
|암호화 키|`ENCRYPTION_KEY` 서버 환경변수 전용. 유출 시 전체 사용자 키 노출 — Vercel 환경변수에서 엄격 관리|
|복호화 위치|서버(`ai-config.ts`)에서만 수행. 클라이언트에 평문 키 전달 금지|
|클라이언트 AI 직접 호출|금지 — 반드시 `/api/interview` 경유|
|API Route 인증|모든 요청에서 `getUser()` → 세션 소유자 검증|
|유저 문서 접근|Supabase RLS + Storage 경로 `{user_id}/{document_id}` 격리|
|문서 삭제|DB record + Storage file `Promise.all` 동시 삭제|
|파일 업로드|허용 형식 PDF 전용, 이력서 최대 10MB·포트폴리오 최대 20MB, Server Actions 검증|
|OAuth|Supabase Auth 위임 처리, Middleware에서 세션 갱신|
|Privacy Policy|사용자 API 키 서버 저장 사실을 서비스 약관·Privacy Policy에 명시 필요|

---

## 15. v3.0 신규 파일 목록

|구분|파일|내용|
|---|---|---|
|신규|`src/lib/crypto.ts`|AES-256-GCM 암호화/복호화|
|신규|`src/lib/ai-config.ts`|유저별 API 키·모델 조회 (`getUserAiConfig`)|
|신규|`src/app/(main)/settings/page.tsx`|API 키 설정 UI|
|신규|`src/app/(main)/settings/actions.ts`|저장·삭제·조회 Server Actions|
|신규|`supabase/migrations/20260401-0001_user_api_settings.sql`|DB 마이그레이션|
|수정|`src/lib/env.ts`|`ENCRYPTION_KEY` 추가|
|수정|`src/app/api/interview/route.ts`|`getUserAiConfig()` 주입|
|수정|`src/lib/agents/runners.ts`|사용자 키/모델 동적 적용|

---

## 16. TRD 버전별 주요 변경 사항

|항목|v1.0 (설계)|v2.0 (구현 반영)|v3.0 (BYOK 추가)|
|---|---|---|---|
|AI 모델|Gemini 3 Pro|gemini-2.5-flash|**기본 flash, BYOK로 2.5-pro·3.1-pro-preview 선택 가능**|
|API 키 관리|서버 단일 키|서버 단일 키|**사용자 키 AES-256 암호화 저장 추가**|
|TTS|Out of Scope|Gemini 2.5 Flash Preview TTS|**항상 서버 키 사용 명시**|
|STT|Out of Scope|Gemini 2.5 Flash 전사|**항상 서버 키 사용 명시**|
|ADK 구조|SequentialAgent (3개)|면접관만 ADK|**유지 (변경 없음)**|
|DB 테이블|—|user_profiles, user_persona_settings|**user_api_settings 추가**|
|Settings 페이지|없음|없음|**신규 (`/settings`)**|
|암호화|없음|없음|**AES-256-GCM (crypto.ts)**|
|환경변수|GOOGLE_API_KEY 외|동일|**ENCRYPTION_KEY 추가**|

---

_본 문서는 v3.0 설계 확정 기준입니다. 구현 진행에 따라 지속 업데이트됩니다._