-- Add master_resumes and submitted_resumes tables for resume management feature

-- A. Master resume: one per user, stores all sections as structured JSONB
create table master_resumes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade unique,
  basics          jsonb not null default '{}',   -- {name, email, phone, location, website, summary}
  experiences     jsonb not null default '[]',   -- [{company, role, start_date, end_date, is_current, description, team_size, contribution, tech_decisions, challenges}]
  projects        jsonb not null default '[]',   -- [{name, description, url, start_date, end_date, team_composition, tech_challenges, tech_stack}]
  skills          jsonb not null default '[]',   -- [{name, level (beginner|intermediate|advanced|expert), context}]
  educations      jsonb not null default '[]',   -- [{school, major, degree, start_date, end_date, description}]
  activities      jsonb not null default '[]',   -- [{title, issuer, date, description}]
  self_intro_memo text not null default '',      -- interview material memo, not included in resume output
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- RLS
alter table master_resumes enable row level security;
create policy "own master_resumes only" on master_resumes
  for all using (auth.uid() = user_id);

-- B. Submitted resume: AI-generated tailored resume per JD
create table submitted_resumes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  company_name  text not null default '',
  position      text not null default '',
  jd_text       text not null default '',
  content_md    text not null default '',         -- AI-generated markdown resume
  analysis_json jsonb not null default '{}',      -- {keyword_mapping: [], highlights: [], missing_items: []}
  created_at    timestamptz default now()
);

-- RLS
alter table submitted_resumes enable row level security;
create policy "own submitted_resumes only" on submitted_resumes
  for all using (auth.uid() = user_id);
