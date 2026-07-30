---
trigger: always_on
---

# Description
Defines TypeScript conventions, file structure, shadcn/ui usage rules, and interview UX guidelines.
Read before writing any code or implementing UI.

Reflects codebase `main` = b330303 (2026-07-30).

# Content

## Coding Convention

### Language & Types
- TypeScript strict mode required
- Never use `any` type — always define proper types
- All API responses must be typed JSON
- **When the server persists a field, declare it in the client-facing type too.** A field written into
  `report_json` but missing from `AnswerReport` is invisible to the UI — this has already happened once
  with `AnswerStatus`.

### Components
- Always use shadcn/ui components first
- Avoid creating unnecessary custom components
- File naming: PascalCase (`InterviewChat.tsx`)

### Utils & Hooks
- File naming: camelCase (`useInterviewSession.ts`, `serializeMasterResume.ts`)
- All env vars must be managed centrally in `lib/env.ts`

### Error Messages
- Always include: "what went wrong" + "what to do next"
- User must know their next action from the error message alone
- Multi-stage pipelines should name the failed stage (e.g. "JD 분석에 실패했습니다" vs "문장 변환에 실패했습니다")

### Comments
- All code comments in English
- Comment the *why*, not the *what*. Non-obvious constraints and past regressions are worth a comment;
  restating the code is not.

## File Structure

```
src/app/
├─ (auth)/login/page.tsx
├─ (onboarding)/onboarding/page.tsx        → new-user wizard
├─ (main)/
│   ├─ page.tsx
│   ├─ interview/            page.tsx, actions.ts        → history + new interview dialog
│   ├─ resume/               page.tsx, actions.ts        → 서류 관리 hub
│   │   ├─ master/           page.tsx, actions.ts        → master resume editor
│   │   └─ submitted/[id]/   page.tsx                    → submitted resume viewer
│   ├─ persona/              page.tsx, actions.ts
│   ├─ profile/              page.tsx, actions.ts
│   ├─ preferences/          page.tsx
│   └─ settings/             page.tsx, actions.ts
├─ (interview)/interview/[sessionId]/      page.tsx, loading.tsx
├─ (report)/report/[sessionId]/page.tsx
├─ about/, privacy/, terms/                page.tsx
├─ api/
│   ├─ interview/route.ts
│   ├─ resume/generate/route.ts
│   ├─ resume/submitted/[id]/route.ts
│   ├─ transcribe/route.ts
│   └─ tts/route.ts
├─ auth/callback/route.ts, auth/popup-success/page.tsx
└─ layout.tsx

src/components/
├─ ui/                → shadcn components (do not modify)
├─ onboarding/steps/  → wizard steps
├─ interview/         → interview UI
├─ report/            → report UI
├─ resume/            → document upload + sections
│   ├─ master/        → MasterResumeForm, MasterResumeCard
│   └─ submitted/     → GenerateResumeButton/Dialog, SubmittedResumeCard, SubmittedResumeViewer
├─ persona/, profile/, preferences/, settings/, about/
└─ common/            → sidebar, topbar, breadcrumb, document card

src/lib/
├─ supabase/          → clients, auth, middleware, queries/
├─ agents/            → ADK Runner singletons (runners.ts) — prompts do NOT live here
├─ prompts/           → analysis, interview, evaluation, normalize, resume-generate
├─ evaluation/        → parse, postprocess, concurrency (+ tests)
├─ types/             → master-resume.ts
├─ constants/         → profile options
├─ utils/             → index, withDeadline, serializeMasterResume (+ tests)
├─ ai-config.ts, crypto.ts, env.ts, models.ts, tts.ts
```

Notes:
- There is no `lib/parsers/` — PDF parsing is inline in `(main)/resume/actions.ts` via `unpdf`
- `lib/agents/` holds only the ADK Runner singleton. All prompt builders live in `lib/prompts/`
- Agent call orchestration is inline in the route handlers, not in a separate library

## UX Principles

### Interview Experience
- Hints hidden by default — show only on button click
- Highlight timer when remaining time < 20%
- Always show a loading state (AI analyzing, interviewer responding, report generating)
- Pair every error message with a retry or restart affordance

> **Not implemented, do not assume:** streaming typewriter UX (all routes return `Response.json()`),
> `beforeunload` tab-close warning, `visibilitychange` state save.
> If you are asked to add one of these, it is new work — not a bug fix.

### Resume Experience
- Master resume form shows per-section completion state so a long form feels tractable
- Prose fields use the tiptap markdown editor; date fields use the month picker
- Submitted resume viewer renders the standard resume hierarchy: projects nest under the experience at the
  same company, unmatched projects go to "기타 프로젝트"
- Generate button is disabled without a master resume (server also rejects with 422)

### Document Parsing
- Notify the user when a scanned or image-based PDF cannot be parsed. Text-empty PDFs are rejected at upload
  with Storage cleanup — never saved silently.
- Card badges reflect `normalize_status`: `pending` → "AI 분석 중" + spinner, `failed` → "분석 실패" + retry, `done` → no badge
- `/resume` polls every 5s only while something is `pending`

> **Not implemented:** paste-text fallback on parse failure. The current behavior is explicit rejection only.

## Reference Docs

Product and technical specs live in the Obsidian vault, not in this repo:
`Micro Projects/Replai/` — PRD, TRD, Multi Agent Architecture, Agents Prompt, Decisions.
The copies under `docs/` are stale and unmaintained.
