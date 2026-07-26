-- Add content_json column to submitted_resumes
-- Stores structured resume data (same shape as master resume)
-- Nullable for backward compatibility with existing rows

alter table submitted_resumes
  add column if not exists content_json jsonb null;
