# GEMINI.md — Antigravity 에이전트 전역 규칙

> 이 파일은 모든 작업 세션에 공통으로 적용되는 규칙이다.
> 에이전트는 새 작업을 시작하기 전 이 파일을 반드시 읽는다.

---

## 프로젝트 개요

**Replai (리플레이)** — AI 멀티 에이전트 기반 모의면접 시뮬레이터

IT 직군 취준생이 JD + 이력서 + 포트폴리오를 학습한 AI 면접관과 맞춤형 모의면접을 진행하고 상세한 피드백을 받는 서비스.

---

## 기술 스택 (변경 금지)

| 영역 | 기술 | 비고 |
|------|------|------|
| Framework | Next.js (App Router) | Pages Router 사용 금지 |
| UI | shadcn/ui | 커스텀 CSS 최소화 |
| AI 모델 | Gemini 2.5 Flash (기본) | 사용자 BYOK로 2.5 Pro, 3.1 Pro-Preview 가능 |
| 에이전트 | Google ADK (TypeScript) | `@google/adk` — 면접관 에이전트에만 적용 |
| DB / Auth / Storage | Supabase | 무료 티어 |
| 배포 | Vercel | 무료 티어 |
| 문서 파싱 | pdf-parse, mammoth | **서버 사이드** (Server Actions) |

---

## 폴더 구조

```
/app
  /api
    /interview        ← Gemini API 프록시 (API 키 보호)
    /tts              ← TTS API (항상 서버 키 사용)
    /transcribe       ← STT API (항상 서버 키 사용)
  /(auth)
    /login
  /(main)             ← 메인 레이아웃 (사이드바 포함)
    /page.tsx         ← 대시보드 (히스토리, 새 면접 시작)
    /resume           ← 문서 관리 (이력서·포트폴리오·GitHub)
    /interview        ← 새 면접 생성 진입점
    /persona          ← 페르소나 커스텀 지시사항 설정
    /preferences      ← 설정 탭 (오디오 + API 키)
    /profile          ← 프로필 (직군·경력·기술스택)
    /settings         ← 설정 진입점
  /(interview)
    /interview/[id]   ← 모의면접 진행 화면
  /(report)
    /report/[id]      ← 리포트 화면
/components
  /ui                 ← shadcn/ui 컴포넌트
  /interview          ← 면접 관련 컴포넌트
  /report             ← 리포트 관련 컴포넌트
  /resume             ← 문서 업로드·관리 컴포넌트
  /persona            ← 페르소나 설정 컴포넌트
  /preferences        ← 설정 컴포넌트
  /profile            ← 프로필 컴포넌트
  /settings           ← 설정 컴포넌트
  /common             ← 공용 컴포넌트
/lib
  /supabase           ← Supabase 클라이언트 + 쿼리
  /agents             ← ADK 에이전트 정의 (runners.ts)
  /prompts            ← 에이전트 프롬프트 (analysis, interview, evaluation)
  /utils              ← 유틸리티 함수
  ai-config.ts        ← BYOK API 키 해석 (서버 전용)
  crypto.ts           ← AES-256-GCM 암호화/복호화
  env.ts              ← 환경변수 중앙 관리
  models.ts           ← 지원 모델 목록
  tts.ts              ← TTS 유틸
```

---

## 핵심 원칙 (절대 위반 금지)

### 보안
- `GOOGLE_API_KEY`, `ENCRYPTION_KEY`는 서버 환경변수에만 존재. 클라이언트 코드에 절대 노출하지 않는다
- Gemini API 호출은 반드시 `/app/api/` 경유
- 사용자 API 키는 AES-256-GCM으로 암호화 후 DB 저장. 복호화는 `ai-config.ts`에서만
- Supabase Storage는 RLS 적용 필수 (본인 문서만 접근 가능)

### 에러 처리
- 에이전트 호출 실패: **최대 3회 재시도 후 하드 실패**
- 폴백(일부 기능 제외 진행) **없음**
- 파싱 실패: 텍스트 직접 입력 옵션 제공
- 모든 에러는 유저에게 명확한 메시지로 표시

### 아키텍처
- 문서 파싱은 **서버 사이드** (Server Actions — `pdf-parse`, `mammoth`)
- Gemini 응답은 스트리밍 처리
- 타이머는 클라이언트 관리, 면접 시작 시각만 DB 저장
- TTS/STT는 항상 서버 기본 키 사용 (BYOK 키 사용 금지)

---

## Supabase DB 스키마

```sql
user_documents          ← id, user_id, type(resume|portfolio|git), file_url, file_name, parsed_text
interview_sessions      ← id, user_id, title, jd_text, persona, duration_minutes, remaining_seconds,
                           resume_ids(uuid[]), analysis_json, adk_session_id, started_at, ended_at, status
interview_messages      ← id, session_id, role, content, depth, question_id, created_at
interview_reports       ← id, session_id, total_score, summary, report_json, created_at
user_profiles           ← id, user_id, job_category, years_of_experience, tech_stack[], skills[]
user_persona_settings   ← id, user_id, persona, custom_instructions
user_api_settings       ← id, user_id, model, api_key_enc
```

- `interview_sessions.status`: `in_progress | completed | abandoned`
- `interview_sessions.persona`: `explorer | pressure`
- `interview_messages.role`: `interviewer | user`
- `user_documents.type`: `resume | portfolio | git`
- `user_api_settings.api_key_enc`: AES-256-GCM 암호화. null이면 서버 기본 키 사용

---

## 에이전트 구조

> SequentialAgent는 제거됨. 에이전트 호출 순서는 `/api/interview/route.ts`에서 코드로 제어.

```
분석 에이전트    → runOneShot()   — JD + 이력서 → 질문 세트 JSON (ADK 미사용)
면접관 에이전트  → ADK LlmAgent  — 페르소나별 대화 + 꼬리질문 판단 (세션 유지)
힌트 에이전트   → runOneShot()   — 현재 질문 → 모범 답안 (ADK 미사용)
평가 에이전트   → runOneShot()   — 전체 대화 → 리포트 JSON (ADK 미사용)
```

모든 에이전트 출력은 JSON 구조. 자연어 단독 응답 금지.

---

## 코딩 컨벤션

### 언어 및 타입
- TypeScript 필수. `any` 타입 사용 금지
- 모든 API 응답 타입 정의 (인터페이스 사용)

### 컴포넌트
- shadcn/ui 컴포넌트 우선 사용
- 컴포넌트 파일명: PascalCase (`InterviewChat.tsx`)
- 훅 파일명: camelCase (`useInterviewSession.ts`)

### 변수/함수명
- 변수: camelCase
- 상수: UPPER_SNAKE_CASE
- 타입/인터페이스: PascalCase

### 주석
- 복잡한 로직에만 작성. 자명한 코드에 주석 금지
- 한국어 주석 허용

---

## 환경변수 목록

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      ← 서버 전용, 클라이언트 노출 금지

# Google AI
GOOGLE_API_KEY=                 ← 서버 전용, 클라이언트 노출 금지

# 암호화
ENCRYPTION_KEY=                 ← 서버 전용, 32바이트 hex, 클라이언트 노출 금지

# App
NEXT_PUBLIC_APP_URL=
```

`NEXT_PUBLIC_` 접두어가 없는 변수는 절대 클라이언트 코드에서 참조하지 않는다.

---

## 참고 문서 경로

| 문서 | 경로 |
|------|------|
| 기술 의사결정 | `DECISIONS.md` |
| 에이전트 규칙 | `.agents/rules/agents.md` |
| 아키텍처 규칙 | `.agents/rules/architecture.md` |
| DB 규칙 | `.agents/rules/database.md` |
| 보안 규칙 | `.agents/rules/security.md` |
| 코딩 컨벤션 | `.agents/rules/conventions.md` |

---

*이 파일이 최신 상태인지 확인 후 작업을 시작한다. 변경사항 발생 시 즉시 업데이트.*
