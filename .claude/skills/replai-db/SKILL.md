---
name: replai-db
description: Replai DB 작업 스킬. "마이그레이션 만들어줘", "테이블 추가해줘", "컬럼 추가해줘", "RLS 설정해줘", "쿼리 작성해줘" 등 Supabase 스키마/마이그레이션/RLS/쿼리 관련 모든 작업 요청 시 이 스킬을 사용할 것. db-agent가 직접 사용하는 작업 가이드.
---

# Replai DB 작업 가이드

## 핵심 규칙

`.agents/rules/database.md`가 최종 권위다. 이 스킬은 그 내용을 실무에 적용하는 방법을 담는다.

## 마이그레이션 파일 작성

### 파일 위치 및 네이밍

```
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

현재 날짜(오늘) 기준으로 타임스탬프를 생성한다. 기존 파일 목록과 순서가 충돌하지 않아야 한다.

### 기존 마이그레이션 파일 목록 (반드시 확인)

```
20260327000001_initial_schema.sql
20260331000001_add_title_to_sessions.sql
20260331000002_add_persona_settings.sql
20260401000001_add_user_api_settings.sql
20260401000002_add_email_name_to_profiles.sql
20260403000001_add_normalized_text.sql
20260403000002_add_technical_persona.sql
20260517000001_add_normalize_status.sql
20260519080147_add_message_kind.sql
20260520114921_add_interview_reports_session_unique.sql
20260611000001_add_resume_tables.sql
20260615000001_add_submitted_resume_id_to_sessions.sql
20260616000001_add_content_json_to_submitted_resumes.sql
```

신규 파일 타임스탬프는 위 목록의 마지막 파일보다 이후여야 한다.
**작성 전 `ls supabase/migrations/`로 실제 목록을 확인할 것** — 이 목록은 갱신이 밀릴 수 있다.

### 마이그레이션 파일 템플릿

```sql
-- {변경 내용 한 줄 설명}

{SQL 내용}

-- RLS (새 테이블인 경우)
alter table {table_name} enable row level security;
create policy "own {table} only" on {table_name}
  for all using (auth.uid() = user_id);
```

## 주요 주의사항

**persona 컬럼 CHECK 제약:**
- 실제 사용 값: `'explorer' | 'pressure' | 'technical'`
- initial_schema에는 다른 값으로 되어 있으나 실제 기준은 위와 같다
- 신규 마이그레이션에서 persona를 다룰 때 이 기준으로 작성한다

**마이그레이션 없이 원격 DB에만 존재하는 항목:**
- `user_documents.file_name` — 생성 마이그레이션 없음
- `user_profiles` 테이블 자체 — 생성 마이그레이션 없음 (`20260401000002`는 컬럼 추가만)
- 신규 환경·브랜치 DB를 만들 때 문제가 되므로, DB 작업을 맡으면 보정 마이그레이션 작성을 함께 제안한다

**이력서 테이블 (v4.0):**
- `master_resumes` — UNIQUE(user_id). 반드시 `upsert(..., { onConflict: 'user_id' })`
- `submitted_resumes` — `content_json`이 canonical, `content_md`는 레거시 폴백
- `content_json`은 LLM 출력을 그대로 저장해 **구조가 강제되지 않는다.** 스키마 검증 추가는 v2 과제

**`type='git'` 사용 금지:**
- Git 링크 기능은 v4.0에서 제거됨. `DocumentType`의 `'git'`과 `upsertGitDocument()`는 dead code
- 새 쿼리·마이그레이션에서 이 값을 다루지 않는다

## 쿼리 패턴

자주 쓰는 패턴은 `database.md`의 "Key Query Patterns" 섹션 참조.

핵심만 요약:
- UNIQUE 제약 테이블: 반드시 `upsert` + `onConflict` 사용 (`user_profiles`, `user_persona_settings`, `user_api_settings`, `master_resumes`, `interview_reports`)
- 세션 목록: 최근 10개, `order('created_at', ascending: false).limit(10)` — **자동 삭제는 없다. 읽기 제한만**
- 메시지: 시간순, `order('created_at', ascending: true)`
- 힌트·건너뛰기 판정은 `interview_messages.kind`로만. `content` 파싱 금지

## 문서 삭제 패턴

```typescript
// Storage 경로: {user_id}/{document_id}
const [dbResult, storageResult] = await Promise.all([
  supabase.from('user_documents').delete().eq('id', documentId),
  supabase.storage.from('documents').remove([storagePath]),
]);
```

DB와 Storage를 반드시 동시에 삭제한다. 한쪽만 삭제하면 고아 레코드/파일이 생긴다.
