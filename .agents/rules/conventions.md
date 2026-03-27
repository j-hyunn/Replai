---
trigger: always_on
---

# Description
Defines TypeScript conventions, file structure, shadcn/ui usage rules, and interview UX guidelines.
Read before writing any code or implementing UI.

# Content

## Coding Convention

### Language & Types
- TypeScript strict mode required
- Never use `any` type — always define proper types
- All API responses must be typed JSON or stream

### Components
- Always use shadcn/ui components first
- Avoid creating unnecessary custom components
- File naming: PascalCase (`InterviewChat.tsx`)

### Utils & Hooks
- File naming: camelCase (`useInterviewSession.ts`)
- All env vars must be managed centrally in `lib/env.ts`

### Error Messages
- Always include: "what went wrong" + "what to do next"
- User must know their next action from the error message alone

## File Structure

```
app/
├─ (auth)/
│   └─ login/page.tsx
├─ (main)/
│   ├─ upload/page.tsx
│   ├─ setup/page.tsx
│   ├─ interview/[sessionId]/page.tsx
│   └─ report/[sessionId]/page.tsx
├─ api/
│   └─ interview/route.ts
└─ layout.tsx

components/
├─ ui/           → shadcn components (do not modify)
├─ interview/    → interview-related components
├─ report/       → report-related components
└─ common/       → shared components

lib/
├─ supabase/     → Supabase client, queries
├─ agents/       → ADK agent definitions
├─ parsers/      → document parsers (pdf.js, mammoth.js)
├─ prompts/      → agent prompts
└─ utils/        → utility functions
```

## UX Principles

### Interview Experience
- All AI responses must use streaming typewriter UX (feels like interviewer speaking)
- Hints hidden by default — show only on button click
- Highlight timer when remaining time < 20%
- Show warning dialog on browser tab close (`beforeunload`)

### Loading & Errors
- Always show loading state (AI analyzing, interviewer responding, etc.)
- Always pair error messages with a retry or restart button

### Document Parsing
- On parse failure, offer text paste fallback option
- Notify user when scanned PDF or image-based document cannot be parsed