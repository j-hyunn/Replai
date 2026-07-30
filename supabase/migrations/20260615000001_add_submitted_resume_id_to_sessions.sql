-- Add submitted_resume_id to interview_sessions
-- References submitted_resumes(id), nullable, on delete set null
alter table interview_sessions
  add column submitted_resume_id uuid references submitted_resumes(id) on delete set null;
