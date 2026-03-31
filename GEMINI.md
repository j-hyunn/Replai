# GEMINI.md — Antigravity 에이전트 전역 규칙

> 이 파일은 모든 작업 세션에 공통으로 적용되는 규칙이다.
> 에이전트는 새 작업을 시작하기 전 이 파일을 반드시 읽는다.

---

## 프로젝트 개요

**reHEARsal (리허설)** — AI 멀티 에이전트 기반 모의면접 시뮬레이터

IT 직군 취준생이 JD + 이력서 + 포트폴리오를 학습한 AI 면접관과 맞춤형 모의면접을 진행하고 상세한 피드백을 받는 서비스.

---

## 기술 스택 (변경 금지)

| 영역 | 기술 | 비고 |
|------|------|------|
| Framework | Next.js (App Router) | Pages Router 사용 금지 |
| UI | shadcn/ui | 커스텀 CSS 최소화 |
| AI 모델 | Gemini 3 Pro | 다른 모델로 대체 금지 |
| 에이전트 | Google ADK (TypeScript) | `@google/adk` |
| DB / Auth / Storage | Supabase | 무료 티어 |
| 배포 | Vercel | 무료 티어 |
| 문서 파싱 | pdf.js, mammoth.js | 클라이언트 사이드 |

---

## 폴더 구조

```
/app
  /api
    /interview        ← Gemini API 프록시 (API 키 보호)
  /(auth)
    /login
  /(main)
    /dashboard        ← 메인 허브 (히스토리, 새 면접 시작)
    /setup            ← 문서 업로드 + 면접 설정
    /interview        ← 모의면접 진행
    /report/[id]      ← 리포트 화면
/components
  /ui                 ← shadcn/ui 컴포넌트
  /interview          ← 면접 관련 컴포넌트
  /report             ← 리포트 관련 컴포넌트
/lib
  /supabase           ← Supabase 클라이언트
  /agents             ← ADK 에이전트 정의
  /parsers            ← 문서 파싱 유틸
/types                ← TypeScript 타입 정의
```

---

## 핵심 원칙 (절대 위반 금지)

### 보안
- `GOOGLE_API_KEY`는 서버 환경변수에만 존재. 클라이언트 코드에 절대 노출하지 않는다
- Gemini API 호출은 반드시 `/app/api/` 경유
- Supabase Storage는 RLS 적용 필수 (본인 문서만 접근 가능)

### 에러 처리
- 에이전트 호출 실패: **최대 3회 재시도 후 하드 실패**
- 폴백(일부 기능 제외 진행) **없음**
- 파싱 실패: 3회 재시도 후 텍스트 직접 입력 옵션 제공
- 모든 에러는 유저에게 명확한 메시지로 표시

### 아키텍처
- 문서 파싱은 클라이언트 사이드 (서버 X)
- Gemini 응답은 스트리밍 처리
- 타이머는 클라이언트 관리, 면접 시작 시각만 DB 저장

---

## Supabase DB 스키마

```sql
users                   ← id, email, created_at
user_documents          ← id, user_id, type, file_url, parsed_text, created_at, updated_at
interview_sessions      ← id, user_id, jd_text, persona, duration_minutes, started_at, ended_at, status
interview_messages      ← id, session_id, role, content, depth, created_at
interview_reports       ← id, session_id, total_score, summary, report_json, created_at
```

- `interview_sessions.status`: `in_progress | completed | abandoned`
- `interview_messages.role`: `interviewer | user`
- `interview_messages.depth`: `0~4` (꼬리질문 depth)
- `user_documents.type`: `resume | portfolio`
- `interview_sessions.persona`: `startup | enterprise | pressure`

---

## 에이전트 구조 요약

```typescript
// /lib/agents/index.ts
SequentialAgent (rehearsal_orchestrator)
├─ LlmAgent: analysis_agent      // JD + 이력서 → 질문 세트 JSON
├─ LlmAgent: interview_agent     // 페르소나별 대화 + 꼬리질문 판단
└─ LlmAgent: evaluation_agent    // 전체 대화 → 리포트 JSON
```

모든 에이전트 출력은 JSON 구조. 자연어 단독 응답 금지.

---

## 코딩 컨벤션

### 언어 및 타입
- TypeScript 필수. `any` 타입 사용 금지
- 모든 API 응답 타입 `/types/` 폴더에 정의

### 컴포넌트
- shadcn/ui 컴포넌트 우선 사용, 없으면 shadcn 스타일로 직접 구현
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

# App
NEXT_PUBLIC_APP_URL=
```

`NEXT_PUBLIC_` 접두어가 없는 변수는 절대 클라이언트 코드에서 참조하지 않는다.

---

## 작업 진행 순서 (빌드 단계)

| 단계 | 내용 | 상태 |
|------|------|------|
| Step 1 | Next.js 프로젝트 초기 세팅 | ✅ 완료 |
| Step 2 | Supabase 연동 + DB 스키마 | ✅ 완료 |
| Step 3 | 로그인 화면 (Google OAuth) | ✅ 완료 |
| Step 4 | 문서 업로드 화면 | 🔄 진행 예정 |
| Step 5 | 면접 설정 화면 | - |
| Step 6 | 분석 에이전트 + 로딩 화면 | - |
| Step 7 | 면접관 에이전트 + 면접 진행 화면 | - |
| Step 8 | 평가 에이전트 + 리포트 화면 | - |
| Step 9 | 히스토리 + 이어하기 | - |
| Step 10 | 전체 플로우 통합 테스트 | - |

---

## 참고 문서 경로

| 문서 | 경로 |
|------|------|
| 제품 요구사항 | `PRD.md` |
| 기술 요구사항 | `TRD.md` |
| 프롬프트 설계 | `AI_Multi_Agent_Prompt.md` |
| 기술 의사결정 | `DECISIONS.md` |
| GitHub 작업 가이드 | `WORKFLOW.md` |

---

*이 파일이 최신 상태인지 확인 후 작업을 시작한다. 변경사항 발생 시 즉시 업데이트.*
