---
trigger: always_on
---

# Description
Defines the core service information, user flow, MVP scope, and tech stack for Rehearsal.
Read before starting any task.

# Content

## Service Info

**Name**: Rehearsal
**Core Value**: AI mock interviewer that knows your JD + resume — available anytime, anywhere
**Target User**: IT career changers (developers, PMs, designers, AI engineers, infra engineers)
**Trigger**: After passing document screening, before the interview

## Core Flow

```
Google login
→ Upload documents (resume required, portfolio optional, Git optional)
→ Interview setup (JD input, time slider, persona selection)
→ AI context analysis (background)
→ Mock interview simulation (text-based, conversational)
→ Report (per-answer scores + summary + improvement points)
```

## MVP Scope

**In**
- Job fit interview only (culture fit = v2)
- Text-based only (voice/video = v2)
- Google OAuth only
- Interview history: last 10 sessions
- Fully free (BM TBD)

**Out (v2+)**
- Culture fit interview
- Voice input / STT
- Video recording & facial analysis
- Git code/commit analysis (MVP: README only)
- Mobile app
- Paid plans

## Tech Stack

| Area | Technology |
|---|---|
| Framework | Next.js (App Router) |
| UI | shadcn/ui |
| Agent | Google ADK (TypeScript) |
| AI Model | Gemini 3 Pro |
| Database | Supabase (free tier) |
| Auth | Supabase Auth (Google OAuth) |
| Storage | Supabase Storage (free tier, 1GB) |
| Deploy | Vercel (free tier) |
| Language | TypeScript strict mode |