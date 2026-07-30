---
trigger: always_on
---

---
trigger: always_on
---

# Description
Defines environment variable management, API Route authentication, Supabase access control, file upload security, and user API key encryption.
No exceptions — apply to every task.

# Content

## Environment Variables

```
# Server only — never expose to client
GOOGLE_API_KEY           -- Gemini API 기본 키 (서버 전용)
ENCRYPTION_KEY           -- AES-256-GCM 암호화 키 (32바이트 hex, 서버 전용)
SUPABASE_SERVICE_ROLE_KEY

# Client allowed (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- Never add `NEXT_PUBLIC_` prefix to `GOOGLE_API_KEY` or `ENCRYPTION_KEY`
- All env vars must be centrally managed in `lib/env.ts`

```typescript
// lib/env.ts
export const env = {
  googleApiKey:           process.env.GOOGLE_API_KEY!,
  encryptionKey:          process.env.ENCRYPTION_KEY!,    // server only
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  supabaseUrl:            process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey:        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
}
```

## API Route Security

- Validate user before every AI API call via `getUser()`
- Return 401 immediately for unauthenticated requests
- After auth, call `getUserAiConfig(userId)` to resolve the correct API key and model

```typescript
// Every /api/interview request must follow this order
const user = await getUser();
if (!user) return new Response('Unauthorized', { status: 401 });

const { apiKey, model } = await getUserAiConfig(user.id);
// Then proceed with AI calls using apiKey and model
```

- Verify session ownership before accessing session data:

```typescript
const session = await getSession(sessionId);
if (!session || session.user_id !== user.id) {
  return new Response('Not Found', { status: 404 });
}
```

- Verify ownership for every resource-scoped route, not just sessions:

```typescript
// /api/resume/submitted/[id] — 존재 여부와 소유권을 분리해 응답
const resume = await getSubmittedResume(id);
if (!resume) return NextResponse.json({ error: '이력서를 찾을 수 없습니다.' }, { status: 404 });
if (resume.user_id !== user.id) return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
```

- `/api/resume/generate`는 `getMasterResume(user.id)`로 본인 마스터 이력서만 읽는다.
  요청 body에 이력서 ID를 받지 않으므로 타 사용자 이력서를 참조할 경로가 없다 — 이 구조를 유지할 것.

## User API Key Encryption (BYOK)

사용자가 등록한 Gemini API 키는 반드시 AES-256-GCM으로 암호화 후 DB에 저장한다.

**절대 금지:**
- 평문 API 키를 DB에 저장하는 것
- 복호화된 API 키를 클라이언트에 전달하는 것
- `ENCRYPTION_KEY`를 코드에 하드코딩하는 것

**암호화 위치:** `src/lib/crypto.ts` — `encrypt()` / `decrypt()`

**복호화 위치:** 서버 전용 (`src/lib/ai-config.ts`) — 클라이언트에서 절대 호출 금지

```typescript
// 저장 시 (settings/actions.ts)
api_key_enc: encrypt(apiKey.trim())

// 조회 시 (ai-config.ts) — 서버에서만
const plainKey = decrypt(data.api_key_enc)
```

**저장 전 유효성 검사 필수:**

```typescript
// 저장 전 반드시 Gemini API로 키 유효성 검증
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
);
if (!res.ok) return { error: '유효하지 않은 API 키입니다.' };
// 유효한 경우에만 encrypt() 후 저장
```

**TTS/STT/Normalize는 항상 서버 키 사용:**
- `/api/tts`, `/api/transcribe`, 문서 normalize는 `env.googleApiKey`만 사용
- 사용자 BYOK 키를 이 세 경로에 절대 사용하지 않음

**BYOK 적용 범위 (사실 기록):**
- 적용됨 — 분석, 힌트, 평가, 이력서 생성 (`runOneShot` / `callGemini`에 `apiKey`·`model` 주입)
- **적용 안 됨 — 면접관 에이전트.** `src/lib/agents/runners.ts`의 `interviewAgent`가 모듈 레벨 싱글턴이며
  `new Gemini({ apiKey: env.googleApiKey })`로 서버 키 고정 생성된다. 사용자가 상위 모델을 선택해도
  면접 대화는 기본 모델로 진행된다. UI나 문서에서 "선택한 모델로 면접"이라고 표현하지 말 것.

## Supabase Security

- RLS must be applied to every table (see database.md)
- Users can only access their own data (`user_id = auth.uid()`)
- `user_api_settings`, `master_resumes`, `submitted_resumes` 모두 RLS 적용
- Use `service_role_key` for admin operations only — never on client side

## 이력서 데이터 취급

마스터 이력서와 제출용 이력서는 **이름·이메일·연락처·전 직장명·재직 기간을 포함한 개인정보**다.
API 키와 같은 수준으로 다룰 필요는 없지만 아래를 지킨다.

- RLS로 본인 데이터만 접근 (`master_resumes`, `submitted_resumes`)
- 로그에 이력서 본문을 출력하지 않는다. 디버깅 시 길이나 필드 존재 여부만 로깅
- 이력서 원문이 Gemini API로 전송된다는 사실을 Privacy Policy에 명시해야 한다 (BYOK 사용 시 사용자 자신의
  Google 계정으로 전송된다는 점도 포함)
- 계정 삭제(`deleteAccountAction`) 시 `on delete cascade`로 두 테이블 모두 삭제되는지 확인

## File Upload Security

- Allowed formats: PDF only (DOCX support removed)
- Max file size: resume 10MB, portfolio 20MB
- Storage path must follow `{user_id}/{document_id}` structure for isolation
- Presigned URL 발급 시 `storagePath.startsWith(`${user.id}/`)` 검증 필수 — 타 사용자 경로 접근 차단
- 텍스트 0자 PDF는 업로드 단계에서 거부하고 Storage 파일을 즉시 정리한다 (의미 없는 파일 축적 방지)
- Deletion must remove both DB record and Storage file simultaneously