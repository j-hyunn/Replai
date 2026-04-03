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

**TTS/STT는 항상 서버 키 사용:**
- `/api/tts`, `/api/transcribe`는 `env.googleApiKey`만 사용
- 사용자 BYOK 키를 TTS/STT에 절대 사용하지 않음

## Supabase Security

- RLS must be applied to every table (see database.md)
- Users can only access their own data (`user_id = auth.uid()`)
- `user_api_settings` 테이블도 RLS 적용 — `own api settings only` 정책
- Use `service_role_key` for admin operations only — never on client side

## File Upload Security

- Allowed formats: PDF only (DOCX support removed)
- Max file size: resume 10MB, portfolio 20MB
- Storage path must follow `{user_id}/{document_id}` structure for isolation
- Deletion must remove both DB record and Storage file simultaneously