# reHEARsal (리허설)

> AI 스페셜리스트 면접관과 함께하는 맞춤형 모의면접 시뮬레이터

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=nextdotjs)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database_+_Auth-3FCF8E?logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://vercel.com)
[![Gemini](https://img.shields.io/badge/Gemini_2.5_flash-Multi--Agent-4285F4?logo=google)](https://deepmind.google/technologies/gemini)

---

## 왜 리허설인가

면접 준비의 핵심은 **"나를 아는 면접관"** 과의 연습이다.

기존 서비스들은 내 이력서를 모르는 면접관과의 generic한 연습만 제공한다. 리허설은 JD + 이력서 + 포트폴리오를 읽은 AI 스페셜리스트 면접관이 맥락 있는 질문을 던지고, 꼬리질문으로 깊이를 파고들며, 면접 후 구체적인 피드백 리포트를 생성한다.

> **리허설(Rehearsal)**
> - 발음을 흘리면 **"이력서"** 가 들린다
> - RE + **HEAR** + sal = "다시 듣게 하다"
> - 履說(리설) = 이력을 말하다

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **맞춤형 질문 생성** | JD ↔ 이력서 매핑 → 강점/갭 분석 → 개인화 질문 세트 |
| **3가지 면접관 페르소나** | 스타트업 실무진 / 대기업 인사팀 / 압박 면접관 |
| **꼬리질문 (최대 4depth)** | 답변 분석 후 AI가 심층 질문 여부 판단 |
| **힌트 시스템** | 질문 의도 + 좋은 답변 구성 요소 온디맨드 제공 |
| **상세 평가 리포트** | 논리성 / 구체성 / 직무 적합성 3축 평가 + 모범 답변 예시 |
| **이어하기** | 중간 이탈 시 세션 자동 저장 → 재접속 후 재개 |

---

## 타겟 유저

서류 합격 후 면접을 앞둔 **IT 직군 경력직/신입 취준생**

- 개발자, PM, 디자이너, AI 엔지니어, 인프라 엔지니어
- 실전과 유사한 맞춤형 모의면접이 필요한 사람
- 사람 의존 없이 언제 어디서든 연습하고 싶은 사람

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| IDE | Google Antigravity |
| Framework | Next.js (App Router) |
| UI | shadcn/ui |
| AI 모델 | Gemini 2.5 flash |
| 에이전트 프레임워크 | Google ADK (TypeScript) |
| Database / Auth / Storage | Supabase |
| 배포 | Vercel |

---

## 시스템 구조

```
[클라이언트]
├─ 문서 파싱 (pdf.js, mammoth.js)
├─ 타이머 관리
└─ UI 렌더링 (스트리밍)

[Next.js API Route]
├─ Gemini API 프록시 (API 키 보호)
└─ Google OAuth 처리

[멀티 에이전트 (Google ADK)]
├─ 분석 에이전트: JD + 이력서 → 질문 세트
├─ 면접관 에이전트: 대화 진행 + 꼬리질문
└─ 평가 에이전트: 전체 대화 → 리포트

[Supabase]
├─ Auth (Google OAuth)
├─ DB (세션, 대화 이력, 리포트)
└─ Storage (이력서, 포트폴리오 파일)
```

---

## 유저 플로우

```
로그인 → 문서 업로드 → 면접 설정 → AI 분석 → 모의면접 → 리포트
```

1. **로그인** — Google 소셜 로그인
2. **문서 업로드** — 이력서(필수) + 포트폴리오(선택) + Git 링크(선택)
3. **면접 설정** — JD 입력 + 시간(30~90분) + 페르소나 선택
4. **AI 분석** — 백그라운드에서 JD ↔ 이력서 매핑 + 질문 세트 생성
5. **모의면접** — AI 면접관과 텍스트 기반 대화, 꼬리질문, 힌트
6. **리포트** — 답변별 점수 + 총평 + 모범 답변 + 재도전 추천 질문

---

## 문서

| 문서 | 설명 |
|------|------|
| [PRD.md](./PRD.md) | 제품 요구사항 |
| [TRD.md](./TRD.md) | 기술 요구사항 |
| [AI_Multi_Agent_Prompt.md](./AI_Multi_Agent_Prompt.md) | 멀티 에이전트 프롬프트 설계 |
| [DECISIONS.md](./DECISIONS.md) | 기술 의사결정 기록 |
| [WORKFLOW.md](./WORKFLOW.md) | GitHub 작업 가이드 |
| [GEMINI.md](./GEMINI.md) | Antigravity 에이전트 전역 규칙 |

---

## 에러 처리 원칙

> 불완전한 면접 경험은 실전 대응에 치명적이다. 폴백 없이 실패는 실패로 처리한다.

- 각 에이전트 호출 실패 시 최대 3회 재시도
- 3회 후에도 실패 시 → 명확한 에러 메시지 + 재시작 유도
- 폴백(일부 기능 제외 진행) 없음

---

*MVP: 전면 무료 / v2 이후 BM 도입 예정*
