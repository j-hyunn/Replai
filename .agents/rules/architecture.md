---
trigger: always_on
---

# Description
Defines client/server/Supabase role separation, session state management, and AI call structure.
Read before designing any code structure.

Reflects codebase `main` = b330303 (2026-07-30).

# Content

## System Overview

```
[Client]
├─ Interview timer (setInterval countdown)
├─ UI state (messages, depth, loading flags) — useState / useRef
├─ Mic recording (MediaRecorder API)
├─ Document card polling (5s interval, only while something is `pending`)
├─ Master resume form (tiptap markdown editor)
└─ AI calls → delegated to API Routes. Never direct.

[Next.js Server Actions]
├─ getUploadUrlAction              — metadata validation, Presigned URL issuance
├─ processUploadedDocumentAction   — Storage download → unpdf → DB save; normalize via after()
├─ ensureNormalizedAction          — interview-start guard (sync normalize)
├─ retryNormalizeAction            — card retry button
├─ getNormalizeStatusesAction      — polling
├─ saveMasterResumeAction / deleteMasterResumeAction
├─ createInterviewSessionAction / updateSessionStatusAction / saveRemainingSecondsAction / saveAnalysisAction / deleteInterviewSessionsAction
├─ saveApiKeyAction / updateModelAction / deleteApiKeyAction / getApiSettingsAction / updateDisplayNameAction / deleteAccountAction
├─ saveProfileAction / savePersonaSettingAction
└─ revalidateDocumentsAction

[Next.js API Routes]
├─ POST   /api/interview              — analyze / respond / hint / skip / evaluate   (maxDuration 300)
├─ POST   /api/resume/generate        — 4-stage resume pipeline                      (maxDuration 300)
├─ DELETE /api/resume/submitted/[id]  — owner-checked delete
├─ POST   /api/transcribe             — STT (server key only)
├─ POST   /api/tts                    — TTS (server key only)
└─ /auth/callback, /auth/popup-success — Google OAuth

[Middleware]
└─ Supabase session refresh

[Supabase]
├─ Auth (Google OAuth)
├─ DB (sessions, messages, reports, profiles, persona_settings, api_settings,
│       documents[normalize_status], master_resumes, submitted_resumes)
└─ Storage (documents bucket: resume / portfolio files)
```

## Client Responsibilities
- Timer countdown. Initial value `session.remaining_seconds ?? totalSeconds`
- UI state (messages, depth, TTS toggle, loading flags)
- Mic recording, audio playback (`playbackRate = 1.3`)

## Server Responsibilities

### Document upload — 3-step flow
1. `getUploadUrlAction` — validate `mimeType` (PDF only) and size (resume 10MB / portfolio 20MB), issue Presigned URL. The file never passes through Vercel.
2. Client uploads directly to Supabase Storage via `uploadToSignedUrl` (bypasses Vercel's 4.5MB request body limit).
3. `processUploadedDocumentAction` — download from Storage (server-to-server), parse with `unpdf`, save with `normalize_status='pending'`, then run normalize inside `after()`.

- `serverExternalPackages: ["unpdf"]` required in `next.config.ts`
- Storage path must be `{user_id}/{document_id}`; validate `storagePath.startsWith(`${user.id}/`)`
- `parsedText === ""` → clean up the Storage file and reject explicitly. Never save silently.
- `parsed_text` is capped at 200,000 chars

### AI calls
- All AI calls go through an API Route or a Server Action. Never from the client.
- `getUser()` first, then `getUserAiConfig(userId)`, then verify resource ownership.

## Never Do
- Call Gemini directly from the client
- Reference `GOOGLE_API_KEY` or `ENCRYPTION_KEY` on the client side
- Run an interview on `parsed_text` alone — `ensureNormalizedAction` must pass first
- Parse `interview_messages.content` to detect hints or skips — use `kind`
- Trust LLM-reported `average` / `total_score` — the server recomputes both
- Excessive DB writes (no per-second writes to Supabase)
- Add `zod` / `p-limit` / Gemini `responseSchema` to the evaluation path without an explicit decision

## Session State Management

### Save Triggers
```
Interview start        → createInterviewSessionAction (started_at, config)
Each answer / question → createMessage (content + kind)
Explicit exit          → handleExit() → saveRemainingSecondsAction
Interview end          → updateSessionStatusAction("completed")
Report generated       → interview_reports upsert (onConflict: session_id)
```

> There is **no** `beforeunload` or `visibilitychange` handler. State is saved only on the explicit
> `handleExit()` path (back button / home button) and on each answer. A hard tab close loses the timer value.

### Resume Flow
```
Exit → handleExit() → clearInterval() + saveRemainingSecondsAction() → router.push("/interview")

Reconnect → in_progress session shows as "진행 중" in history
          → entering restores remaining_seconds + message history
          → ensureAdkSession() rebuilds the ADK session from the last 30 messages
```

> There is **no** expiry window. A session stays resumable indefinitely.

### History Limit
- `getUserSessions()` reads with `.limit(10)`
- **No auto-delete.** An 11th session is created normally; older ones simply fall out of the read window
  and remain in the DB. Manual deletion via `deleteInterviewSessionsAction`.

## AI Call Rules

- Every AI request: `getUser()` → 401 if absent → `getUserAiConfig(userId)` → ownership check → proceed
- **Responses are not streamed.** Every route returns `Response.json()`. There is no `text/event-stream`
  and no client-side typewriter effect. Do not write docs or code that assume streaming.
- TTS generation and message persistence run in `Promise.all`
- TTS / STT / normalize always use `env.googleApiKey`, regardless of BYOK

```typescript
// app/api/interview/route.ts — actual shape
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { apiKey, model } = await getUserAiConfig(user.id);

  const { type, sessionId, userMessage } = await req.json();

  const session = await getSession(sessionId);
  if (!session || session.user_id !== user.id) {
    return new Response("Not Found", { status: 404 });
  }
  // ... branch on `type`
}
```

## Function Duration

| Path | `maxDuration` | Reason |
|---|---|---|
| `/api/interview` | 300 | evaluate fans out per question, then summarizes |
| `/api/resume/generate` | 300 | 4 sequential LLM calls |
| `/interview/page.tsx` | 60 | `ensureNormalizedAction` sync normalize |
| `/resume/page.tsx` | 60 | upload + `after()` callback lifecycle |

> **Unverified:** the two `300` values exceed the "Vercel free tier = 60s" assumption these docs were
> written against. If 300 is not actually granted, `EVAL_BUDGET_MS` (240s) and the 4-stage resume
> pipeline both need redesign. Confirm the real ceiling before relying on it.
