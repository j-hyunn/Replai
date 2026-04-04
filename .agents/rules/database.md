---
trigger: always_on
---

---
trigger: always_on
---

# Description
Defines Supabase DB schema, RLS policies, and query rules.
Read before creating migrations or writing queries.

# Content

## Principles
- Generate migration files based on the schema below
- Never add or modify columns without explicit approval
- RLS must be applied to every table
- Document deletion must remove both DB record and Storage file simultaneously
- Use `upsert` with `onConflict` for tables with UNIQUE constraints (user_profiles, user_persona_settings, user_api_settings)

## Schema

```sql
-- User documents (resume / portfolio / git)
create table user_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  type        text check (type in ('resume', 'portfolio')),  -- git은 type 없이 file_url에 URL만 저장
  file_url    text,        -- Storage 경로 또는 Git URL
  file_name   text,        -- 원본 파일명
  parsed_text text,        -- 추출된 텍스트 (git은 빈 문자열)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Interview sessions
create table interview_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  title            text,                                           -- 히스토리 구분용
  jd_text          text,
  persona          text check (persona in ('explorer', 'pressure')),
  duration_minutes integer,
  remaining_seconds integer,                                       -- 이어하기용 남은 시간
  resume_ids       uuid[],                                         -- 선택된 문서 ID 목록
  analysis_json    jsonb,                                          -- 분석 에이전트 AnalysisOutput
  adk_session_id   uuid,                                           -- ADK InMemorySession 식별자
  started_at       timestamptz,
  ended_at         timestamptz,
  status           text check (status in ('in_progress', 'completed', 'abandoned')),
  created_at       timestamptz default now()
);

-- Conversation history
create table interview_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references interview_sessions(id) on delete cascade,
  role       text check (role in ('interviewer', 'user')),
  content    text,        -- 메시지 마커 포함 저장 ([모범 답안], [질문 건너뛰기])
  depth      integer default 0,
  question_id text,       -- 질문 그룹핑 기준 (꼬리질문은 부모 question_id 상속)
  created_at timestamptz default now()
);

-- Reports
create table interview_reports (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references interview_sessions(id) on delete cascade,
  total_score integer,
  summary     text,
  report_json jsonb,      -- EvaluationOutput 전체
  created_at  timestamptz default now()
);

-- User profiles (직군·경력·기술스택)
create table user_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  job_category        text,
  years_of_experience integer,
  tech_stack          text[],
  skills              text[],
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Persona custom instructions
create table user_persona_settings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade,
  persona             text check (persona in ('explorer', 'pressure')),
  custom_instructions text not null default '',
  updated_at          timestamptz default now(),
  unique(user_id, persona)
);

-- User BYOK API settings (사용자 Gemini API 키)
create table user_api_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  model       text not null default 'gemini-2.5-flash',
  api_key_enc text,        -- AES-256-GCM 암호화된 키. null이면 서버 기본 키 사용
  updated_at  timestamptz default now(),
  unique(user_id)
);
```

## RLS Policies

```sql
alter table user_documents        enable row level security;
alter table interview_sessions    enable row level security;
alter table interview_messages    enable row level security;
alter table interview_reports     enable row level security;
alter table user_profiles         enable row level security;
alter table user_persona_settings enable row level security;
alter table user_api_settings     enable row level security;

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

create policy "own profile only" on user_profiles
  for all using (auth.uid() = user_id);

create policy "own persona settings only" on user_persona_settings
  for all using (auth.uid() = user_id);

create policy "own api settings only" on user_api_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

## Migration Files (순서대로 적용)

```
20260327000001_initial_schema.sql            -- user_documents, interview_sessions, interview_messages, interview_reports
20260331000001_add_title_to_sessions.sql      -- interview_sessions.title 추가
20260331000002_add_persona_settings.sql       -- user_persona_settings 테이블
20260401000001_add_user_api_settings.sql      -- user_api_settings 테이블 (BYOK)
20260403000001_add_normalized_text.sql        -- user_documents.normalized_text 컬럼 추가
20260403000002_add_technical_persona.sql      -- persona CHECK 제약에 'technical' 추가
```

**주의:** initial_schema의 interview_sessions.persona CHECK 제약은 `('startup', 'enterprise', 'pressure')`로 되어 있으나, 실제 사용 값은 `'explorer' | 'pressure' | 'technical'`임. 신규 마이그레이션 작성 시 `'explorer' | 'pressure' | 'technical'`를 기준으로 한다.

**user_profiles는 마이그레이션 파일이 없음** — 초기 스키마 이후 별도 마이그레이션 없이 추가된 것으로 보임. 실제 테이블이 없다면 아래 SQL로 생성:

```sql
create table user_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  job_category        text,
  years_of_experience integer,
  tech_stack          text[] default '{}',
  skills              text[] default '{}',
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);
alter table user_profiles enable row level security;
create policy "own profile only" on user_profiles
  for all using (auth.uid() = user_id);
```

## Document Deletion

```typescript
// DB record + Storage file 반드시 동시 삭제 (Promise.all)
// Storage 경로: {user_id}/{document_id}
async function deleteDocument(documentId: string, storagePath: string) {
  const [dbResult, storageResult] = await Promise.all([
    supabase.from('user_documents').delete().eq('id', documentId),
    supabase.storage.from('documents').remove([storagePath]),
  ]);
  if (dbResult.error) throw new Error(dbResult.error.message);
  if (storageResult.error) throw new Error(storageResult.error.message);
}
```

## Key Query Patterns

```typescript
// user_profiles — upsert (UNIQUE: user_id)
await supabase.from('user_profiles')
  .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

// user_persona_settings — upsert (UNIQUE: user_id, persona)
await supabase.from('user_persona_settings')
  .upsert({ user_id, persona, custom_instructions }, { onConflict: 'user_id,persona' });

// user_api_settings — upsert (UNIQUE: user_id)
await supabase.from('user_api_settings')
  .upsert({ user_id, api_key_enc, model }, { onConflict: 'user_id' });

// interview_sessions — 최근 10개만 조회
await supabase.from('interview_sessions')
  .select('*').eq('user_id', userId)
  .order('created_at', { ascending: false }).limit(10);

// interview_messages — 세션 전체 메시지 (시간순)
await supabase.from('interview_messages')
  .select('*').eq('session_id', sessionId)
  .order('created_at', { ascending: true });
```