---
trigger: always_on
---

# Description
Defines the core service information, user flow, MVP scope, and tech stack for Replai.
Read before starting any task.

Reflects codebase `main` = b330303 (2026-07-30).

# Content

## Service Info

**Name**: Replai (리플레이)
**Core Value**: One master resume → JD-tailored resumes → mock interviews with an AI that read that exact resume
**Target User**: IT career changers and juniors (developers, PMs, designers, AI engineers, infra engineers)
**Trigger**: From the moment they start writing their resume, through the night before the interview

> The trigger point moved earlier in v4.0. It used to be "after document screening" — the resume features
> mean users now enter before they even apply.

## Core Flow

```
Google login
→ Onboarding (new users only)
    Step 1: 내 소개 — 직군·연차 (required), 기술스택·스킬 (optional)
    Step 2: 문서 업로드 — 이력서·포트폴리오 PDF (all optional, skippable)

[Resume track — /resume]
→ Master resume (/resume/master)
    7 sections: 기본 정보 / 경력 / 프로젝트 / Hard·Soft Skills / 학력 / 수상·자격증·활동 / 자기소개 소재 메모
→ Submitted resume (POST /api/resume/generate)
    company + position + JD → 4-stage pipeline → /resume/submitted/[id]

[Interview track — /interview]
→ Interview setup (title, optional submitted resume, JD, document selection, duration, persona)
→ ensureNormalizedAction guard (blocks entry until selected documents are normalized)
→ AI context analysis
→ Mock interview simulation (text-based, conversational, TTS/STT available)
→ Report (per-answer 3-axis scores + summary + model answers)
```

> Onboarding completion criterion: `user_profiles.job_category !== null`
> Interview start requires at least one uploaded resume PDF — a master resume alone does not unlock it.

## MVP Scope

**In**
- Job fit interview only (culture fit = v2)
- Master resume (1 per user) + JD-tailored submitted resumes (N per user)
- Submitted resume injected into interview context
- Voice: TTS output + STT input (both implemented, server key only)
- 3 interviewer personas + per-persona custom instructions
- BYOK (user Gemini API key, AES-256-GCM encrypted)
- Google OAuth only
- Interview history: last 10 sessions (read limit only, no auto-delete)
- Fully free (BM TBD)

**Out (v2+)**
- Culture fit interview
- Video recording & facial analysis
- **Git link input — removed in v4.0.** README fetch contributed almost nothing to interview context; the
  master resume's project section replaces it. `DocumentType` still contains `'git'` as dead code.
- Report PDF export
- Mobile app
- Paid plans
- Multi-provider (OpenAI / Claude)

**Spec'd but NOT implemented** — do not assume these exist:
- Report 4-state UI (`answered`/`hint_shown`/`skipped`/`failed`) — server computes it, UI ignores it
- Single-answer re-evaluation endpoint (`type: "reevaluate"`)
- JD minimum-length validation
- Resume-interview 24h expiry
- History auto-delete beyond 10
- Paste-text fallback on parse failure
- `beforeunload` / `visibilitychange` handlers
- Streaming responses / typewriter UX — every route returns `Response.json()`

## Tech Stack

| Area | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.2.1 (App Router) | React 19.2.4 |
| UI | shadcn/ui + Radix UI + Base UI | |
| Editor | tiptap + tiptap-markdown | master resume prose fields |
| Agent | Google ADK (`@google/adk ^0.6.0`) | interviewer agent only |
| AI Model (default) | `gemini-2.5-flash` | server key |
| AI Model (BYOK) | `gemini-2.5-pro`, `gemini-3.1-pro-preview` | user key; **not applied to the interviewer agent** |
| AI Model (normalize) | `gemini-2.5-flash-lite` | server key only |
| AI Model (TTS/STT) | `gemini-2.5-flash-preview-tts` / `gemini-2.5-flash` | server key only |
| Database | Supabase (free tier) | |
| Auth | Supabase Auth (Google OAuth) | `@supabase/ssr ^0.9.0` |
| Storage | Supabase Storage (free tier, 1GB) | `documents` bucket |
| Deploy | Vercel (free tier) | |
| PDF parsing | `unpdf ^1.6.2` | server-side, PDF only |
| Testing | Vitest | `npm run test` |
| Analytics | Google Analytics (`@next/third-parties`) | |
| Language | TypeScript strict mode | |

## Open Questions

Flag these rather than assuming an answer:

- **API Route `maxDuration = 300`** on `/api/interview` and `/api/resume/generate` conflicts with the
  "Vercel free tier = 60s" assumption used throughout the docs. The real ceiling for the current plan is unverified.
- **`10분 (임시)`** interview duration option is exposed in production UI but is a dev-only value.
- `user_documents.file_name` and the `user_profiles` table have no creation migration — a fresh environment
  cannot be reproduced from `supabase/migrations/` alone.
