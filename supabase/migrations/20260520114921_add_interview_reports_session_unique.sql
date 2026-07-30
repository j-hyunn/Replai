-- Without this, upsert on `interview_reports` cannot resolve a conflict target
-- by session_id and silently inserts a new row on every call. getReport()
-- then uses .single() and throws as soon as the second row exists.
-- The new reevaluate flow makes this far more likely to trigger in practice.

create unique index if not exists interview_reports_session_id_uniq
  on interview_reports(session_id);
