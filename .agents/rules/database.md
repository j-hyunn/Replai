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
- Use `upsert` with `onConflict` for tables with UNIQUE constraints (user_profiles, user_persona_settings, user_api_settings, master_resumes)

## Schema

```sql
-- User documents (resume / portfolio)
create table user_documents (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  type             text check (type in ('resume', 'portfolio')),
  file_url         text,        -- Storage 경로
  file_name        text,        -- 원본 파일명 ※ 생성 마이그레이션 없음 (아래 주의 참고)
  parsed_text      text,        -- unpdf 추출 텍스트 (최대 200,000자)
  normalized_text  text,        -- Gemini로 정제된 텍스트
  normalize_status text not null default 'pending'
                   check (normalize_status in ('pending', 'done', 'failed')),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index user_documents_normalize_status_idx on user_documents (user_id, normalize_status);

-- 주의: 코드의 DocumentType에는 'git'이 남아 있으나 호출부가 없는 dead code다.
-- Git 링크 기능은 v4.0에서 제거되었다. 새 코드에서 type='git'을 쓰지 말 것.

-- Interview sessions
create table interview_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade,
  title               text,                                        -- 히스토리 구분용
  jd_text             text,
  persona             text check (persona in ('explorer', 'pressure', 'technical')),
  duration_minutes    integer,
  remaining_seconds   integer,                                     -- 이어하기용 남은 시간
  resume_ids          uuid[],                                      -- 선택된 문서 ID 목록
  analysis_json       jsonb,                                       -- 분석 에이전트 AnalysisOutput
  adk_session_id      uuid,                                        -- ADK InMemorySession 식별자
  submitted_resume_id uuid references submitted_resumes(id) on delete set null,
  started_at          timestamptz,
  ended_at            timestamptz,
  status              text check (status in ('in_progress', 'completed', 'abandoned')),
  created_at          timestamptz default now()
);

-- Conversation history
create table interview_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid references interview_sessions(id) on delete cascade,
  role       text check (role in ('interviewer', 'user')),
  content    text,        -- 답변 원문만 저장. 마커 금지 (kind 컬럼으로 대체됨)
  kind       text check (kind in ('answer', 'hint_shown', 'skipped', 'interviewer'))
             default 'answer',  -- 힌트·건너뛰기 판정 기준. skipped는 content가 빈 문자열
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
  report_json jsonb,      -- 평가 결과 전체 (answers[].status 포함)
  created_at  timestamptz default now()
);

create unique index interview_reports_session_id_uniq on interview_reports (session_id);

-- User profiles (직군·경력·기술스택)
create table user_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  job_category        text,
  years_of_experience integer,
  tech_stack          text[],
  skills              text[],
  email               text,
  name                text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Persona custom instructions
create table user_persona_settings (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade,
  persona             text check (persona in ('explorer', 'pressure', 'technical')),
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

-- Master resume (유저당 1개, 모든 경험의 원본) — v4.0
create table master_resumes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade unique,
  basics          jsonb not null default '{}',   -- {name, email, phone, website, summary}
  experiences     jsonb not null default '[]',   -- [{id, company, position, start_date, end_date, is_current, description, leave_reason}]
  projects        jsonb not null default '[]',   -- [{id, name, company, start_date, end_date, description, decisions, achievement, contribution, tech_stack}]
  skills          jsonb not null default '[]',   -- {hard: string[], soft: string[]}
  educations      jsonb not null default '[]',   -- [{id, school, major, degree, start_date, end_date, entry_type, status}]
  activities      jsonb not null default '[]',   -- [{id, title, issuer, date, description}]
  self_intro_memo text not null default '',      -- 면접 대비 메모. 이력서 출력물에는 포함하지 않음
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Submitted resume (JD별 N개, AI 생성물) — v4.0
create table submitted_resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  company_name  text not null default '',
  position      text not null default '',
  jd_text       text not null default '',
  content_md    text not null default '',   -- 레거시. 신규 생성은 빈 문자열
  content_json  jsonb,                      -- canonical. SubmittedResumeContent (summary는 optional)
  analysis_json jsonb not null default '{}', -- {keyword_mapping[], highlights[], missing_items[]}
  created_at    timestamptz default now()
);
```

**이력서 저장 주의사항**
- `content_json`이 canonical이다. `content_md`는 컬럼 도입 이전 행 호환용이며 신규 생성 시 빈 문자열이다.
  읽을 때는 `content_json` 우선 → `content_md` 폴백.
- `content_json`은 LLM 출력을 그대로 저장하므로 **구조가 강제되지 않는다.** JD 맞춤 요약이 최상위
  `summary` 대신 `basics.summary`에 들어가는 경우가 있어, 읽는 쪽은 최상위 → basics 순으로 폴백한다.
- `master_resumes`는 UNIQUE(user_id) — 반드시 `upsert(..., { onConflict: 'user_id' })`.

## RLS Policies

```sql
alter table user_documents        enable row level security;
alter table interview_sessions    enable row level security;
alter table interview_messages    enable row level security;
alter table interview_reports     enable row level security;
alter table user_profiles         enable row level security;
alter table user_persona_settings enable row level security;
alter table user_api_settings     enable row level security;
alter table master_resumes        enable row level security;
alter table submitted_resumes     enable row level security;

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

create policy "own master_resumes only" on master_resumes
  for all using (auth.uid() = user_id);

create policy "own submitted_resumes only" on submitted_resumes
  for all using (auth.uid() = user_id);
```

## Migration Files (순서대로 적용)

```
20260327000001_initial_schema.sql            -- user_documents, interview_sessions, interview_messages, interview_reports
20260331000001_add_title_to_sessions.sql      -- interview_sessions.title 추가
20260331000002_add_persona_settings.sql       -- user_persona_settings 테이블
20260401000001_add_user_api_settings.sql      -- user_api_settings 테이블 (BYOK)
20260401000002_add_email_name_to_profiles.sql -- user_profiles.email, name 컬럼 추가
20260403000001_add_normalized_text.sql        -- user_documents.normalized_text 컬럼 추가
20260403000002_add_technical_persona.sql      -- persona CHECK 제약에 'technical' 추가
20260517000001_add_normalize_status.sql       -- user_documents 정규화 상태 추적
20260519080147_add_message_kind.sql           -- interview_messages.kind 추가 + 레거시 마커 백필·제거
20260520114921_add_interview_reports_session_unique.sql -- interview_reports.session_id UNIQUE 인덱스
20260611000001_add_resume_tables.sql          -- master_resumes, submitted_resumes 테이블
20260615000001_add_submitted_resume_id_to_sessions.sql  -- interview_sessions.submitted_resume_id
20260616000001_add_content_json_to_submitted_resumes.sql -- submitted_resumes.content_json
```

**메시지 마커는 폐기됨.** `[모범 답안]` / `[질문 건너뛰기]`를 `content`에 넣던 방식은
`20260519080147`에서 `kind` 컬럼으로 대체되었고, 같은 마이그레이션이 기존 행의 마커를
제거했다. `content` 파싱으로 힌트·건너뛰기를 판정하는 코드를 새로 쓰지 말 것 —
반드시 `kind`를 사용한다.

**주의:** initial_schema의 interview_sessions.persona CHECK 제약은 `('startup', 'enterprise', 'pressure')`로 되어 있으나, 실제 사용 값은 `'explorer' | 'pressure' | 'technical'`임. 신규 마이그레이션 작성 시 `'explorer' | 'pressure' | 'technical'`를 기준으로 한다.

## 마이그레이션 없이 원격 DB에만 존재하는 항목 (보정 필요)

아래는 `supabase/migrations/`만으로 신규 환경을 재현할 수 없게 만드는 항목이다. 새 환경 구축이나
브랜치 DB 생성 시 문제가 되므로 보정 마이그레이션을 작성해야 한다.

| 항목 | 상태 |
|---|---|
| `user_documents.file_name` | initial_schema에 없고 추가 마이그레이션도 없음 |
| `user_profiles` 테이블 | 생성 마이그레이션 없음 (`20260401000002`는 컬럼 추가만) |

**user_profiles는 마이그레이션 파일이 없음.** 실제 테이블이 없다면 아래 SQL로 생성:

```sql
create table user_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete cascade unique,
  job_category        text,
  years_of_experience integer,
  tech_stack          text[] default '{}',
  skills              text[] default '{}',
  email               text,
  name                text,
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

// master_resumes — upsert (UNIQUE: user_id)
await supabase.from('master_resumes')
  .upsert({ user_id, ...input, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

// interview_reports — upsert (UNIQUE: session_id) ※ onConflict 필수
await supabase.from('interview_reports')
  .upsert({ session_id, total_score, summary, report_json }, { onConflict: 'session_id' });

// interview_sessions — 최근 10개만 조회 (자동 삭제 없음, 읽기 제한만)
await supabase.from('interview_sessions')
  .select('*').eq('user_id', userId)
  .order('created_at', { ascending: false }).limit(10);

// interview_messages — 세션 전체 메시지 (시간순). kind로 힌트·건너뛰기 판정
await supabase.from('interview_messages')
  .select('*').eq('session_id', sessionId)
  .order('created_at', { ascending: true });

// submitted_resumes — 목록 / 단건
await supabase.from('submitted_resumes')
  .select('*').eq('user_id', userId).order('created_at', { ascending: false });
```