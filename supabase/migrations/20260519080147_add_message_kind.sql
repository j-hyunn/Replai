-- Adds a structured `kind` column to interview_messages so that hint/skip
-- semantics live as first-class data instead of inline markers in `content`.
-- This removes the need for prompt-time sanitization and lets the evaluation
-- pipeline branch on a single column.

alter table interview_messages
  add column if not exists kind text
    check (kind in ('answer', 'hint_shown', 'skipped', 'interviewer'))
    default 'answer';

-- Backfill existing rows. Interviewer messages get 'interviewer'. User
-- messages keep 'answer' by default, except those whose content carries
-- the legacy `[모범 답안]` / `[질문 건너뛰기]` markers.
update interview_messages
  set kind = 'interviewer'
  where role = 'interviewer' and (kind is null or kind = 'answer');

update interview_messages
  set kind = 'hint_shown'
  where role = 'user' and content like '[모범 답안]%';

update interview_messages
  set kind = 'skipped'
  where role = 'user' and content = '[질문 건너뛰기]';

-- Cleanup: strip legacy markers from `content` so the new code path that
-- reads content directly (no sanitization) sees the actual hint text or
-- empty skipped text.
update interview_messages
  set content = substring(content from length('[모범 답안] ') + 1)
  where kind = 'hint_shown' and content like '[모범 답안] %';

update interview_messages
  set content = ''
  where kind = 'skipped';
