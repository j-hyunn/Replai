---
trigger: always_on
---

# Description
Defines Supabase DB schema, RLS policies, and document deletion rules.
Read before creating migrations or writing queries.

# Content

## Principles
- Generate migration files based on the schema below
- Never add or modify columns without explicit approval
- RLS must be applied to every table
- Document deletion must remove both DB record and Storage file simultaneously

## Schema

```sql
-- User documents
create table user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text check (type in ('resume', 'portfolio')),
  file_url text,
  parsed_text text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Interview sessions
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  jd_text text,
  persona text check (persona in ('startup', 'enterprise', 'pressure')),
  duration_minutes integer,
  started_at timestamptz,
  ended_at timestamptz,
  status text check (status in ('in_progress', 'completed', 'abandoned')),
  created_at timestamptz default now()
);

-- Conversation history
create table interview_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references interview_sessions(id) on delete cascade,
  role text check (role in ('interviewer', 'user')),
  content text,
  depth integer default 0,
  question_id text,
  created_at timestamptz default now()
);

-- Reports
create table interview_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references interview_sessions(id) on delete cascade,
  total_score integer,
  summary text,
  report_json jsonb,
  created_at timestamptz default now()
);
```

## RLS Policies

```sql
alter table user_documents enable row level security;
alter table interview_sessions enable row level security;
alter table interview_messages enable row level security;
alter table interview_reports enable row level security;

create policy "own documents only" on user_documents
  for all using (auth.uid() = user_id);

create policy "own sessions only" on interview_sessions
  for all using (auth.uid() = user_id);

create policy "own messages only" on interview_messages
  for all using (
    session_id in (
      select id from interview_sessions where user_id = auth.uid()
    )
  );

create policy "own reports only" on interview_reports
  for all using (
    session_id in (
      select id from interview_sessions where user_id = auth.uid()
    )
  );
```

## Document Deletion

```typescript
// Always delete from both DB and Storage simultaneously
async function deleteDocument(documentId: string, fileUrl: string) {
  await supabase.from('user_documents').delete().eq('id', documentId)
  await supabase.storage.from('documents').remove([fileUrl])
}
```