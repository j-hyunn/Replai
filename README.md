# Replai (리플레이)

> 이력서부터 면접까지 — 하나의 마스터 이력서로 지원 준비를 끝낸다

[![Next.js](https://img.shields.io/badge/Next.js-16_App_Router-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database_+_Auth-3FCF8E?logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_Flash-Multi--Agent-4285F4?logo=google)](https://deepmind.google/technologies/gemini)

---

## 왜 리플레이인가

지원 준비는 두 곳에서 막힌다. **이력서**를 회사마다 다듬는 일과, **면접**을 나를 아는 상대와 연습하는 일이다. 각각을 도와주는 도구는 있지만, "내가 이 회사에 실제로 낸 이력서로 그 회사 면접을 연습한다"는 흐름은 어디에서도 완결되지 않는다.

Replai는 그 둘을 하나의 데이터로 잇는다. 마스터 이력서를 한 번 정리해두면, 채용 공고를 붙여넣는 것만으로 그 회사용 이력서가 만들어지고, **그 이력서를 그대로 읽은 AI 면접관**이 맥락 있는 질문을 던진다.

> **Replai**
> - Re + Play + AI: 면접을 다시 재생하며 AI와 연습한다

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **마스터 이력서** | 경력·프로젝트·스킬·학력·활동을 구조화해 한 곳에 정리. 유저당 1개, 계속 갱신하는 기준 이력서 |
| **JD 맞춤 이력서 생성** | 공고 분석 → 핵심 역량 3가지 도출 → 맞는 경험만 선별 → 개조식·수치 중심 재작성 (4단계 파이프라인) |
| **이력서 분석 리포트** | JD 키워드 매핑, 강조 포인트, 부족한 항목 제시 |
| **맞춤형 질문 생성** | 제출용 이력서 + 마스터 이력서 + JD 매핑 → 개인화 질문 세트 |
| **3가지 면접관 페르소나** | 경험 탐색형 / 심층 압박형 / 기술 검증형 + 페르소나별 커스텀 지침 |
| **꼬리질문** | AI가 답변 맥락을 보고 판단. depth 상한은 페르소나별 (2~4) |
| **음성 지원** | AI 면접관 TTS 출력 + 마이크 STT 입력 |
| **힌트 시스템** | 이력서 기반 실시간 모범 답안 (점수 상한 30점 적용) |
| **상세 리포트** | 논리성 / 구체성 / 직무 적합성 3축 + 질문별 모범 답안 + 강점·개선점 키워드 |
| **이어하기** | 이탈 시 남은 시간·대화 이력 복원 |
| **BYOK** | 자기 Gemini API 키 등록 시 상위 모델 사용 (AES-256-GCM 암호화 저장) |

---

## 타겟 유저

이력서를 쓰기 시작한 시점부터 면접 전날까지의 **IT 직군 경력직/신입 취준생**

- 개발자, PM, 디자이너, AI 엔지니어, 인프라 엔지니어
- 회사마다 이력서를 다시 쓰는 반복 노동을 줄이고 싶은 사람
- 사람 의존 없이 언제 어디서든 면접을 연습하고 싶은 사람

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16.2.1 (App Router), React 19 |
| UI | shadcn/ui + Radix UI + Base UI |
| 에디터 | tiptap + tiptap-markdown |
| AI 모델 | Gemini 2.5 Flash (기본) / 2.5 Pro · 3.1 Pro Preview (BYOK) |
| 에이전트 프레임워크 | Google ADK (TypeScript) — 면접관 에이전트에만 적용 |
| Database / Auth / Storage | Supabase |
| 문서 파싱 | unpdf (PDF 전용, 서버 사이드) |
| 테스트 | Vitest |
| 배포 | Vercel |

---

## 시스템 구조

```
[클라이언트]
├─ 타이머 / UI 상태
├─ 마이크 녹음 (MediaRecorder)
├─ 마스터 이력서 폼 (tiptap)
└─ AI 호출은 전부 서버 경유 — 직접 호출 금지

[Server Actions]
├─ 문서 업로드 (Presigned URL → Storage 직접 업로드 → 서버 파싱)
├─ 백그라운드 정제 (after()) + 상태 추적 (normalize_status)
└─ 마스터 이력서 저장 / 세션 관리 / API 키 관리

[API Routes]
├─ /api/interview          analyze · respond · hint · skip · evaluate
├─ /api/resume/generate    4단계 이력서 생성 파이프라인
├─ /api/tts, /api/transcribe  (항상 서버 키)
└─ /auth/*                 Google OAuth

[에이전트]
├─ 분석         runOneShot   — JD + 이력서 → 질문 세트
├─ 면접관       ADK Runner   — 대화 진행 + 꼬리질문 (세션 보유)
├─ 힌트         runOneShot   — 이력서 기반 모범 답안
├─ 평가         runOneShot × N + 요약 1회 (동시성 4)
└─ 이력서 생성   Gemini REST × 4단계

[Supabase]
├─ Auth (Google OAuth)
├─ DB (sessions, messages, reports, profiles, documents, master_resumes, submitted_resumes)
└─ Storage (이력서·포트폴리오 PDF)
```

> `SequentialAgent` 오케스트레이터는 사용하지 않는다. 호출 순서는 API Route 코드로 제어한다.

---

## 유저 플로우

```
[이력서]  로그인 → 온보딩 → 마스터 이력서 작성 → 공고 붙여넣기 → 제출용 이력서 생성
[면접]    제출용 이력서 선택 → 면접 설정 → AI 분석 → 모의면접 → 리포트
```

1. **로그인** — Google 소셜 로그인
2. **온보딩** — 직군·연차 입력, 이력서/포트폴리오 업로드 (선택)
3. **마스터 이력서** — 7개 섹션 작성 (`/resume/master`)
4. **제출용 이력서** — 회사명·포지션·JD 입력 → AI가 JD 맞춤 이력서 생성
5. **면접 설정** — 제출용 이력서 선택(선택) + 이력서 파일 선택(필수) + 시간 + 페르소나
6. **모의면접** — 텍스트 기반 대화, 음성 출력, 꼬리질문, 힌트, 건너뛰기
7. **리포트** — 답변별 점수 + 총평 + 모범 답안

---

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # Vitest
```

### 환경 변수

```bash
# 서버 전용 — 클라이언트 노출 금지
GOOGLE_API_KEY=
ENCRYPTION_KEY=            # openssl rand -hex 32
SUPABASE_SERVICE_ROLE_KEY=

# 클라이언트 허용
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

모든 환경 변수는 `src/lib/env.ts`에서 중앙 관리한다.

### 주의

- `unpdf`가 `package-lock.json`과 어긋나면 개발 환경에서 **모든 PDF가 0자로 추출**된다. Vercel 빌드는 정상이라 개발·운영 동작이 달라진다. `npm install` 후 lockfile을 커밋할 것.
- `supabase/migrations/`만으로는 신규 환경을 완전히 재현할 수 없다 (`user_documents.file_name`, `user_profiles` 테이블에 생성 마이그레이션이 없음).

---

## 문서

제품·기술 명세는 Obsidian vault(`Micro Projects/Replai/`)에서 관리한다 — PRD, TRD, Multi Agent Architecture, Agents Prompt, Decisions.

레포 내 문서:

| 문서 | 설명 |
|------|------|
| [AGENTS.md](./AGENTS.md) · [CLAUDE.md](./CLAUDE.md) | 에이전트 진입점 |
| [.agents/rules/](./.agents/rules/) | 프로젝트·아키텍처·컨벤션·DB·보안 규칙 (에이전트가 매 세션 읽음) |
| [DECISIONS.md](./DECISIONS.md) | 기술 의사결정 기록 |
| [WORKFLOW.md](./WORKFLOW.md) | GitHub 작업 가이드 |
| [GEMINI.md](./GEMINI.md) | Antigravity 에이전트 전역 규칙 |
| [docs/](./docs/) | **미관리 사본** — Obsidian 최신본을 볼 것 |

---

## 에러 처리 원칙

> 불완전한 면접 경험은 실전 대응에 치명적이다. 폴백 없이 실패는 실패로 처리한다.

- AI 호출 실패 시 최대 3회 재시도, 이후 명확한 에러 메시지 + 재시도 유도
- 정제되지 않은 원본 텍스트로 면접을 진행하지 않는다 (시작 가드에서 보장)
- 의도된 예외 3곳: TTS 실패(텍스트로 계속), 질문 단건 평가 실패(해당 답변만 실패 처리), 이력서 4단계 파싱 실패(3단계 결과 사용)

---

*MVP: 전면 무료 / v2 이후 BM 도입 예정*
