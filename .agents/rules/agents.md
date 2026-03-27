---
trigger: always_on
---

# Description
Defines Google ADK multi-agent composition, execution order, I/O JSON structure, error handling, and question generation strategy.
Read before working on any ADK agent code.

# Content

## Agent Composition

```
SequentialAgent (orchestrator)
├─ LlmAgent: analysis_agent     → analyze JD + resume, generate question set
├─ LlmAgent: interview_agent    → conduct interview by persona, judge follow-ups
└─ LlmAgent: evaluation_agent   → analyze full conversation, generate report
```

## Execution Order

```
[Before interview]
analysis_agent runs (background)
└─ show loading UI while processing async
└─ on complete → start interview_agent

[During interview]
interview_agent runs (sync, streaming)
└─ question → user answer → follow-up judgment → repeat

[After interview]
evaluation_agent runs (async)
└─ analyze full conversation history → generate report
```

## Agent Code Structure

```typescript
import { LlmAgent, SequentialAgent } from '@google/adk'

const analysisAgent = new LlmAgent({
  name: 'analysis_agent',
  model: 'gemini-3-pro',
  instruction: `...` // see lib/prompts/analysis.ts
})

const interviewAgent = new LlmAgent({
  name: 'interview_agent',
  model: 'gemini-3-pro',
  instruction: `...` // see lib/prompts/interview.ts
})

const evaluationAgent = new LlmAgent({
  name: 'evaluation_agent',
  model: 'gemini-3-pro',
  instruction: `...` // see lib/prompts/evaluation.ts
})

export const orchestrator = new SequentialAgent({
  name: 'rehearsal_orchestrator',
  subAgents: [analysisAgent, interviewAgent, evaluationAgent]
})
```

## I/O JSON Structure

### analysis_agent output
```json
{
  "analysis": {
    "jd_keywords": [],
    "strengths": [],
    "preferred_gaps": []
  },
  "questions": [
    {
      "id": "q1",
      "question": "",
      "type": "common | project | preferred_gap",
      "intent": "",
      "good_answer_tips": "",
      "depth": 0,
      "source": ""
    }
  ]
}
```

### interview_agent output
```json
{
  "message": "",
  "type": "question | followup | closing",
  "current_depth": 0,
  "next_question_id": "q2",
  "remaining_time": 25,
  "is_last": false
}
```

### evaluation_agent output
```json
{
  "total_score": 82,
  "summary": "",
  "answers": [
    {
      "question_id": "q1",
      "question": "",
      "answer": "",
      "scores": { "logic": 85, "specificity": 70, "job_fit": 90 },
      "average": 82,
      "feedback": "",
      "model_answer": ""
    }
  ],
  "top3_improvements": [
    { "question_id": "q3", "reason": "", "improvement": "" }
  ],
  "retry_questions": [
    { "question_id": "q3", "question": "" }
  ]
}
```

## Error Handling
- Retry each agent call up to 3 times on failure
- After 3 failures, show clear error message + prompt user to restart
- **No fallback — never proceed with incomplete data**
- An incomplete interview experience is worse than no interview

## Question Generation Strategy
- Common questions (self-intro, strengths/weaknesses, motivation): pre-generated
- Project questions: dynamically generated from resume from the start
- Follow-up questions: dynamically generated after each answer (AI judgment, max 4 depth)
- Question count: `duration / 5 * 1.5` (150% buffer vs time)
- When remaining time < 20%, switch to closing questions