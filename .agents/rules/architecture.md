---
trigger: always_on
---

# Description
Defines client/server/Supabase role separation, session state management, and Gemini API call structure.
Read before designing any code structure.

# Content

## System Overview

```
[Client]
├─ Interview timer management
├─ UI state (question index, conversation history, depth)
└─ Gemini API calls → delegated to API Route

[Next.js Server Actions]
├─ Presigned URL issuance (metadata validation only, file not sent)
└─ Document parsing (Storage download → unpdf → normalize → DB save)

[Next.js API Route]
├─ Gemini API proxy (protects API key)
└─ Google OAuth handling

[Supabase]
├─ Auth
├─ DB (sessions, history, reports)
└─ Storage (resume, portfolio files)
```

## Client Responsibilities
- Timer management (save start time to DB, calculate elapsed time on client)
- UI state (current question index, conversation history, depth)

## Server Responsibilities
- Document upload (2-step flow):
  1. `getUploadUrlAction` — validate metadata (mimeType, size), issue Supabase Presigned URL. File never passes through Vercel.
  2. `processUploadedDocumentAction` — download from Supabase Storage (server-to-server, no Vercel size limit), parse with `unpdf`, normalize, save to DB
  - `serverExternalPackages: ["unpdf"]` required in `next.config.ts`
  - Client uploads directly to Supabase Storage via `uploadToSignedUrl` (bypasses Vercel 4.5MB limit)
- Gemini API calls (proxy only, for API key protection)
- Google OAuth handling

## Never Do
- Call Gemini API directly from client
- Reference `GOOGLE_API_KEY` on client side
- Synchronous processing that exceeds Vercel 10s timeout
- Excessive DB writes (no per-second writes to Supabase)

## Session State Management

### Save Triggers
```
Interview start   → save started_at, config to DB
Each answer       → save interview_messages to DB
Tab hidden        → visibilitychange event triggers state save
Interview end     → save ended_at, status, report to DB
```

### Resume Flow
```
visibilitychange detects tab hidden
→ save current session state to DB
→ on reconnect, detect in_progress session
→ show "Resume interview?" dialog
→ on confirm, restore state from DB and continue
```

### History Limit
- Keep last 10 sessions
- On 11th session, prompt to delete oldest before saving

## Gemini API Call Rules
- All Gemini calls must go through `/api/interview` route only
- Streaming response required (`text/event-stream`)
- Handle Vercel free tier 10s timeout with chunked streaming

```typescript
// app/api/interview/route.ts
export async function POST(req: Request) {
  const session = await getSession(req)
  if (!session) return new Response('Unauthorized', { status: 401 })

  const { type, payload } = await req.json()
  const stream = await callGeminiAgent(type, payload)

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  })
}
```