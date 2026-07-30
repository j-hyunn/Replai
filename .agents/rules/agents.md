---
trigger: always_on
---

# Description
Defines the actual AI agent composition, execution patterns, I/O structures, error handling, and question generation strategy.
Read before working on any agent or prompt code.

Reflects codebase `main` = b330303 (2026-07-30).

# Content

## Agent Composition — NO SequentialAgent

**There is no `SequentialAgent` orchestrator.** Call order is controlled by code in the API Route.
Only the interview agent uses ADK; everything else is a one-shot call.

```
[analysis]        runOneShot (ephemeral)   → JD + resume → question set
[interviewer]     ADK LlmAgent + Runner    → persona dialogue, follow-up judgment
[hint]            runOneShot (ephemeral)   → resume-grounded model answer
[evaluation]      runOneShot × N + 1       → per-question scoring + summary
[normalize]       Gemini REST direct       → clean up raw PDF text (aux, outside interview flow)
[resume-generate] Gemini REST direct × 4   → JD-tailored resume (aux, outside interview flow)
```

## Execution Patterns

### `runOneShot` — analysis / hint / evaluation

```typescript
// src/app/api/interview/route.ts
async function runOneShot(
  instruction: string, userMessage: string, userId: string,
  apiKey: string, model: string,
  timeoutMs: number = ONESHOT_TIMEOUT_MS,
): Promise<string> {
  const agent = new LlmAgent({
    name: "oneshot_agent",
    model: new Gemini({ model, apiKey }),   // user BYOK key or server default
    instruction: () => instruction,
  });
  const runner = new Runner({ agent, appName: APP_NAME, sessionService: new InMemorySessionService() });
  // drain runner.runEphemeral(), wrapped in withDeadline()
}
```

### ADK Runner — interviewer only

```typescript
// src/lib/agents/runners.ts — module-level singletons
export const sessionService = new InMemorySessionService();

const interviewAgent = new LlmAgent({
  name: "interview_agent",
  model: new Gemini({ model: "gemini-2.5-flash", apiKey: env.googleApiKey }),
  instruction: interviewInstruction,   // InstructionProvider — rebuilt from session state each turn
});

export const interviewRunner = new Runner({ agent: interviewAgent, appName: APP_NAME, sessionService });
```

- `InstructionProvider` must read state via `ctx.state.toRecord()`. State is a class instance — direct property access does not work.
- **The interviewer agent does NOT use BYOK.** It is created once with the server key. Only `runOneShot` calls and the resume pipeline honor the user's key/model. Do not claim otherwise in docs or UI.
- On cold start `InMemorySessionService` is empty. `ensureAdkSession()` replays the last 30 messages from Supabase before `runAsync()`. Messages with `kind === 'skipped'` are replaced with `"(질문을 건너뛰었습니다)"` during replay.

## Context Priority — resumeTexts

`/api/interview` assembles `resumeTexts` in this order. Earlier entries have higher priority.

```
[제출용 이력서 - {company} {position}]   ← content_json via serializeSubmittedResume(), else content_md
[마스터 이력서]                          ← only when experiences or projects is non-empty
[이력서: {file_name}]                    ← normalized_text ?? parsed_text
[포트폴리오: {file_name}]
```

The same array is passed to analysis, interviewer, hint, and evaluation prompts.

## Model Assignment

| Task | Model | Key |
|---|---|---|
| analysis / hint / evaluation / resume-generate | `gemini-2.5-flash`, or user's BYOK model | BYOK if set |
| interviewer | `gemini-2.5-flash` | **server key only** |
| normalize | `gemini-2.5-flash-lite` (`NORMALIZE_MODEL`) | server key only |
| TTS | `gemini-2.5-flash-preview-tts` | server key only |
| STT | `gemini-2.5-flash` | server key only |

## I/O Structures

### analysis — `AnalysisOutput`
```json
{
  "analysis": { "jd_keywords": [], "strengths": [], "preferred_gaps": [] },
  "questions": [
    {
      "id": "q1", "question": "",
      "type": "common | project | preferred_gap",
      "intent": "", "good_answer_tips": "", "depth": 0, "source": ""
    }
  ]
}
```

`good_answer_tips` is stripped before serializing `analysisJson` into the interviewer system prompt — it is hint-agent-only data.

### interviewer — `InterviewAgentOutput`
```json
{
  "message": "",
  "type": "question | followup | closing",
  "current_depth": 0,
  "next_question_id": "q2",
  "is_last": false
}
```

### evaluation — per question (`QuestionEvaluationResult`)
```json
{
  "question_id": "q1", "question": "", "answer": "",
  "scores": { "logic": 85, "specificity": 70, "job_fit": 90 },
  "average": 82,
  "intent": ["keyword1", "keyword2"],
  "feedback": "",
  "model_answers": [{ "question": "", "model_answer": "" }]
}
```

### evaluation — summary (`SummaryEvaluationResult`)
```json
{
  "total_score": 82,
  "summary": "", "strengths": "", "strength_keywords": [],
  "improvements": "", "improvement_keywords": []
}
```

Post-processing adds `status: "answered" | "hint_shown" | "skipped" | "failed"` to each answer.

> **Known gap:** `status` is persisted into `report_json` but the client type `AnswerReport`
> (`src/lib/supabase/queries/reports.ts`) does not declare it and `ReportView` does not read it.
> Hint-used, skipped, and failed answers are visually indistinguishable in the report.
> There is also no `reevaluate` endpoint. Treat these two as one unit of work.

### resume-generate — 4 stages
```
1  JdAnalysis      { persona: 'manager'|'executor', core_pillars[3], keywords[5], company_context }
2  FilteredContent { selected_experiences[], selected_projects[], priority_order[], removed_reasons{} }
3  RewrittenContent = SubmittedResumeContent   (master resume shape + summary)
4  ---RESUME_JSON--- / ---ANALYSIS--- delimited text
   ANALYSIS = { keyword_mapping[], highlights[], missing_items[] }
```

Stage 4 does not regenerate the resume. If the `RESUME_JSON` block fails to parse, stage 3's output is used
as canonical — this is the only fallback in the pipeline.

## Evaluation Pipeline

Located in `src/lib/evaluation/` plus inline orchestration in `route.ts`.

| File | Role |
|---|---|
| `parse.ts` | Runtime type guards, `InvalidEvaluationError`. **No Zod.** |
| `postprocess.ts` | `HINT_SCORE_CAP`, `applyHintCap`, `applyAnsweredOverrides`, `buildSkippedAnswer`, `buildFailedAnswer`, `computeTotalScore`, `countByStatus` |
| `concurrency.ts` | `mapWithConcurrency(items, limit, task)` — hand-rolled. **No `p-limit`.** |
| `src/lib/utils/withDeadline.ts` | Per-call wait ceiling |

Do not introduce `zod`, `p-limit`, or Gemini `responseSchema` structured output without an explicit decision —
the current design deliberately avoids those dependencies.

| Constant | Value | Meaning |
|---|---|---|
| `EVAL_CONCURRENCY` | 4 | Max concurrent evaluation calls |
| `ONESHOT_TIMEOUT_MS` | 45_000 | Per-call wait ceiling |
| `EVAL_BUDGET_MS` | 240_000 | Whole-handler wall-clock budget |
| `HINT_SCORE_CAP` | 30 | Per-axis cap for hint-assisted answers |

Per-call ceiling is `Math.min(ONESHOT_TIMEOUT_MS, remainingBudget)` so retries cannot overrun the budget.
`withDeadline` only bounds the caller's wait — ADK exposes no AbortSignal, so the Gemini call itself keeps running.

**Server owns the arithmetic.** `average` and `total_score` are always recomputed server-side; LLM values are ignored.

## Message `kind`

Text markers (`[모범 답안]`, `[질문 건너뛰기]`) are gone. Use `interview_messages.kind`.

| kind | content | Evaluation effect |
|---|---|---|
| `answer` | user's answer text | scored normally |
| `hint_shown` | **the hint text itself** | each axis capped at 30 (server-enforced) |
| `skipped` | **empty string** | 0, excluded from `total_score` |
| `interviewer` | interviewer utterance | excluded |

`QaGroup.used_hint` / `.skipped` are derived from `kind` — never parse `content`.

> The interviewer receives `content` verbatim for both `answer` and `hint_shown`. There is no
> "user referred to a model answer" substitution, so the interviewer treats hint text as the user's own answer.

## Error Handling

- Retry AI calls up to 3 times
- **No fallback — never proceed with incomplete data.** An incomplete interview experience is worse than no interview.
- Exceptions to the no-fallback rule, all deliberate:
  - TTS failure → return `null`, interview continues (non-critical)
  - Single-question evaluation failure → that answer degrades to `failed`, the report still ships
  - Stage 4 resume parse failure → fall back to stage 3 output
- `normalize` has no fallback: never run an interview on `parsed_text` alone. `ensureNormalizedAction` guarantees `normalized_text`.

## Question Generation Strategy

- Question count: `Math.round(durationMinutes / 5 * 1.5)`
- JD present → q1 self-intro, q2 motivation, q3 reason-for-leaving are fixed. JD absent → no motivation question at all
- Follow-ups: AI judgment, no rule-based filter. `question_id` is inherited by follow-up turns
- depth cap by persona: `explorer` 2, `pressure` 4, `technical` 4
- Remaining time < 20% of total → switch to closing questions
- Types: `common | project | preferred_gap`
