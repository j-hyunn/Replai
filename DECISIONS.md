> 왜 이렇게 만들었는지를 기록한다. 나중에 돌아봤을 때, 또는 v2를 설계할 때 맥락을 잃지 않기 위해.

---

## 목차

1. [문서 파싱: 서버 사이드로 변경](#1-문서-파싱-서버-사이드로-변경)
2. [Next.js API Route를 Gemini 프록시로 사용](#2-nextjs-api-route를-gemini-프록시로-사용)
3. [폴백 없는 에러 처리 정책](#3-폴백-없는-에러-처리-정책)
4. [ADK 적용 범위: 면접관 에이전트만](#4-adk-적용-범위-면접관-에이전트만)
5. [스트리밍 응답 처리](#5-스트리밍-응답-처리)
6. [세션 상태: 메모리 + DB 혼합 저장](#6-세션-상태-메모리--db-혼합-저장)
7. [꼬리질문 판단: AI 전적 판단으로 변경](#7-꼬리질문-판단-ai-전적-판단으로-변경)
8. [질문 수: 150% 버퍼 생성](#8-질문-수-150-버퍼-생성)
9. [MVP 동일 가중치 평가](#9-mvp-동일-가중치-평가)
10. [Git 파싱: README만 (코드 분석 제외)](#10-git-파싱-readme만-코드-분석-제외)
11. [BYOK: Gemini 전용, ADK 유지](#11-byok-gemini-전용-adk-유지)
12. [사용자 API 키 암호화: AES-256-GCM](#12-사용자-api-키-암호화-aes-256-gcm)
13. [TTS/STT: 항상 서버 키 고정](#13-ttsstt-항상-서버-키-고정)
14. [API 키 유효성 검사: 저장 전 실행](#14-api-키-유효성-검사-저장-전-실행)
15. [모범 답안: 지원자 제출 문서 기반 생성](#15-모범-답안-지원자-제출-문서-기반-생성)
16. [good_answer_tips: 힌트 에이전트 전용으로 분리](#16-good_answer_tips-힌트-에이전트-전용으로-분리)
17. [신규 사용자 온보딩 플로우](#17-신규-사용자-온보딩-플로우)
18. [파일 업로드 크기 제한: 3단계 설정](#18-파일-업로드-크기-제한-3단계-설정)
19. [JD 입력: 링크 방식 제거, 텍스트 직접입력 전용](#19-jd-입력-링크-방식-제거-텍스트-직접입력-전용)
20. [기술 검증형 페르소나 추가](#20-기술-검증형-페르소나-추가)
21. [문서 업로드 UX: AddDocumentDialog + 단계별 로딩](#21-문서-업로드-ux-adddocumentdialog--단계별-로딩)

---

## 1. 문서 파싱: 서버 사이드로 변경

**결정 (최초)**: PDF/DOCX 파싱을 브라우저(클라이언트)에서 처리한다 — `pdf.js`, `mammoth.js`

**변경 1차 (구현 중)**: 서버 사이드(Server Actions)로 변경 — `pdf-parse`, `mammoth`

**변경 2차 (2026-04-03)**: `pdf-parse` → `pdfjs-dist`로 교체. DOCX 지원 제거, PDF 전용.

**2차 변경 이유**

- `pdf-parse` v2가 default export 함수 방식이 아닌 class 방식으로 변경 → import 호환성 문제 발생
- v1 다운그레이드 후에도 pdfjs-dist가 더 안정적이고 텍스트 추출 품질이 높다고 판단
- `mammoth`(DOCX) 제거: 이력서·포트폴리오 업로드 실태상 PDF만 사용하며 DOCX 허용은 불필요한 복잡도 추가
- **Webpack 번들링 문제**: `pdfjs-dist`를 서버에서 import하면 Next.js Webpack이 worker 경로를 번들 경로로 치환 → "Setting up fake worker failed" 런타임 에러 → `next.config.ts`에 `serverExternalPackages: ["pdfjs-dist"]`로 해결
- `parsed_text` 최대 200,000자로 제한 (기존 100,000자)

**트레이드오프**

- Vercel 함수 실행 시간 소비 증가 → `serverActions.bodySizeLimit: "21mb"` 설정으로 대응 (이후 3단계 크기 제한 문제 발견 — #18 참조)
- 스캔본 PDF, 이미지 기반 문서는 여전히 파싱 불가 → 파싱 실패 시 `parsedText = ""`로 처리 후 업로드는 성공시킴

---

## 2. Next.js API Route를 Gemini 프록시로 사용

**결정**: Gemini API를 클라이언트에서 직접 호출하지 않고, Next.js API Route를 경유한다

**이유**

- API 키가 클라이언트 코드에 노출되면 탈취 위험
- 서버 환경변수에만 키를 저장하고 클라이언트는 내부 API만 호출
- 요청 로깅, 인증 검증을 한 곳에서 처리 가능

**구조**

```
클라이언트 → /api/interview (Next.js API Route) → Gemini API
```

---

## 3. 폴백 없는 에러 처리 정책

**결정**: 에이전트 호출 실패 시 즉시 500 반환. 폴백(일부 기능 제외 진행) 없음

**이유**

> 불완전한 면접 경험은 실전 대응에 치명적이다.

- 절반만 준비된 질문으로 면접을 진행하면 오히려 잘못된 연습
- 에러가 발생했을 때 유저에게 명확하게 알리는 것이 더 나은 UX
- TTS 실패만 예외 — non-critical이므로 null 반환 후 면접 계속 진행

---

## 4. ADK 적용 범위: 면접관 에이전트만

**결정 (최초)**: 3개 에이전트를 Google ADK의 SequentialAgent로 오케스트레이션한다

**변경 (구현 중)**: SequentialAgent 제거. 면접관 에이전트만 ADK 사용. 에이전트 호출 순서는 API Route 코드로 제어

**변경 이유**

- 분석·평가·힌트는 1회성 호출로 대화 세션이 필요 없음 → `runEphemeral()` 패턴이 더 적합
- 면접관 에이전트만 다중 턴 대화와 세션 상태 유지가 필요 → ADK `LlmAgent + Runner` 유지
- SequentialAgent 오케스트레이터를 제거하면 에이전트 간 순서를 코드로 명시적으로 제어할 수 있어 디버깅이 용이

**현재 구조**

```
분석 에이전트  → runOneShot() (ADK 미사용)
면접관 에이전트 → ADK LlmAgent + Runner (세션 보유)
힌트 에이전트  → runOneShot() (ADK 미사용)
평가 에이전트  → runOneShot() (ADK 미사용)
```

---

## 5. 스트리밍 응답 처리

**결정**: Gemini API 응답을 스트리밍으로 처리한다

**이유**

- Vercel 무료 티어 함수 타임아웃(10초) 대응: 스트리밍은 첫 청크만 10초 내에 오면 됨
- 전체 응답 대기 없이 즉각적인 피드백으로 몰입감 유지

---

## 6. 세션 상태: 메모리 + DB 혼합 저장

**결정**: 면접 진행 중 상태는 브라우저 메모리, 중요 시점에만 DB에 저장한다

**DB 저장 시점**

- 면접 시작 시 (시작 시각, 설정값)
- 매 답변 완료 시 (대화 이력)
- 이탈·일시정지 시 (`handleExit()` 명시적 호출)
- 면접 종료 시 (전체 이력 + 리포트)

**이유**

- 매 상태 변경마다 DB 저장하면 불필요한 API 호출 과다
- 브라우저 메모리가 가장 빠르고 Supabase 무료 티어 API 제한에 여유 확보
- 명시적 이탈 처리(`handleExit()`)로 데이터 유실 없이 이어하기 지원

---

## 7. 꼬리질문 판단: AI 전적 판단으로 변경

**결정**: "룰 기반 1차 필터 + AI 2차 판단" 구조를 "AI 전적 판단"으로 단순화

**이유**

- 룰 기반 필터는 오탐 가능성 높음 (짧지만 훌륭한 답변에도 플래그)
- Gemini의 판단력이 충분히 신뢰할 수 있는 수준
- 코드 복잡도 감소, 유지보수 용이

**꼬리질문 판단 기준 (AI에 전달)**

- 답변이 모호하거나 추상적인가?
- 수치나 구체적 사례가 없는가?
- 더 파고들 만한 흥미로운 키워드가 있는가?
- 현재 depth < 페르소나 상한?

---

## 8. 질문 수: 150% 버퍼 생성

**결정**: 면접 시간 대비 150% 분량의 질문을 사전 생성한다

**계산식**: `round(duration / 5 × 1.5)`
- 예: 60분 면접 → 18개 생성

**이유**

- 꼬리질문이 많이 발생하면 본 질문 소화량이 줄어듦
- 시간이 남았을 때 질문 부족 상황 방지
- 남은 시간 20% 이하 시 마무리 질문으로 자동 전환하는 로직과 연계

---

## 9. MVP 동일 가중치 평가

**결정**: MVP에서는 모든 질문 유형에 동일 가중치 적용

**이유**

- 가중치 설계는 실제 데이터 없이 주관적 설정이 될 위험
- 베타 테스트 후 실제 사용 패턴 확인 후 v2에서 조정

**v2 방향**

- 프로젝트 질문 > 공통 질문 가중치 부여
- 질문 depth에 따른 가중치 차등 검토

---

## 10. Git 파싱: README만 (코드 분석 제외)

**결정**: Git 링크 입력 시 URL만 저장. 실제 코드/커밋 분석은 v2

**이유**

- 코드 분석은 GitHub API rate limit + 토큰 소비량이 큼
- URL만 저장해도 면접관 에이전트가 GitHub 링크를 컨텍스트로 활용 가능
- MVP 범위 내에서 기술 부채 없이 구현 가능

**v2 방향**

- README 파싱 → 커밋 패턴 분석 → 주요 파일 구조 분석 순으로 확장

---

## 11. BYOK: Gemini 전용, ADK 유지

**결정** (2026-04-01): 멀티 프로바이더(OpenAI·Claude 포함) 대신 **Gemini BYOK만** 지원한다. ADK는 그대로 유지한다.

**검토한 대안**

- **B안 (멀티 프로바이더)**: OpenAI·Claude 포함, ADK 제거 후 프로바이더 추상화 레이어 구현
- **A안 (Gemini BYOK)**: Gemini 키만 지원, ADK 유지

**A안을 선택한 이유**

- 현재 빌드 단계에서 ADK를 걷어내는 것은 면접관 에이전트 품질에 직접적인 리스크
- IT 직군 타겟 사용자는 Gemini 키 보유 가능성이 높음 (Google AI Studio 무료)
- A안으로 시작해도 나중에 B안으로 확장 가능 — 단, ADK 제거 없이도 멀티 프로바이더는 구현 불가
- 공수 차이가 크게 남: A안은 신규 파일 몇 개 + route.ts 수정, B안은 면접관 에이전트 전면 재작성

**지원 모델**

| 모델 | 제공 방식 |
|---|---|
| gemini-2.5-flash | 서버 기본 키 (무료) |
| gemini-2.5-pro | 사용자 키 필요 |
| gemini-3.1-pro-preview | 사용자 키 필요 |

**v2 방향**: 사용자 수요가 충분히 확인되면 ADK 제거 후 멀티 프로바이더로 확장 검토

---

## 12. 사용자 API 키 암호화: AES-256-GCM

**결정** (2026-04-01): 사용자 API 키를 DB에 저장할 때 AES-256-GCM으로 암호화한다

**검토한 대안**

- **pgcrypto**: Supabase DB 레벨 암호화. 간단하지만 DB 접근권한만 있으면 복호화 가능
- **AES-256-GCM (서버 암호화)**: 서버 환경변수(`ENCRYPTION_KEY`)로 암호화. DB 탈취 시에도 키 없이 복호화 불가

**AES-256-GCM을 선택한 이유**

- 사용자 API 키는 외부 서비스 접근 자격증명 — 가장 민감한 데이터
- DB가 탈취되더라도 `ENCRYPTION_KEY` 없이는 복호화 불가
- pgcrypto는 DB 레벨 암호화라 Supabase 서비스 롤 키만 있으면 복호화 가능 — 불충분

**구현**

- 알고리즘: AES-256-GCM (인증 태그 포함으로 무결성 보장)
- 저장 형식: `ivHex:tagHex:encryptedHex`
- 암호화 키: `ENCRYPTION_KEY` 서버 환경변수 (32바이트 hex)
- 복호화 위치: 서버(`ai-config.ts`)에서만 수행

**운영 주의사항**

- `ENCRYPTION_KEY` 유출 시 전체 사용자 키 노출 → Vercel 환경변수에서 엄격 관리
- 키 로테이션 시 기존 암호화 데이터 마이그레이션 필요 (v2 고려)

---

## 13. TTS/STT: 항상 서버 키 고정

**결정** (2026-04-01): TTS(`/api/tts`)와 STT(`/api/transcribe`)는 사용자 BYOK 키와 무관하게 항상 서버 `GOOGLE_API_KEY`를 사용한다

**이유**

- TTS는 `gemini-2.5-flash-preview-tts` 전용 모델 — Gemini 상위 모델(2.5-pro, 3.1-pro)이 TTS를 지원하지 않음
- STT도 동일하게 `gemini-2.5-flash` 전사 모델 고정
- 사용자가 어떤 면접 모델을 선택하든 음성 기능은 항상 동작해야 함

**트레이드오프**

- TTS/STT 비용은 서버가 부담 — 사용자 증가 시 비용 증가 가능
- 향후 사용자 수 증가 시 TTS/STT도 사용자 키로 분리하거나 유료 플랜으로 묶는 방향 검토

---

## 14. API 키 유효성 검사: 저장 전 실행

**결정** (2026-04-01): 사용자가 API 키를 저장할 때 DB 저장 전에 실제 Gemini API 호출로 유효성을 검사한다

**이유**

- 유효성 검사 없이 저장하면 잘못된 키가 DB에 저장되고, 면접 시작 시점에야 오류가 발생함
- 사용자 입장에서 면접 시작 직전 오류는 UX가 나쁨
- 저장 시점에 즉시 피드백을 주는 것이 훨씬 자연스러운 흐름

**구현**

```
저장 클릭
  → validateGeminiApiKey(apiKey) 호출
      → GET https://generativelanguage.googleapis.com/v1beta/models?key={apiKey}
          ├─ 200 OK  → 암호화 → DB 저장 → 성공 토스트
          └─ 그 외   → "유효하지 않은 API 키" 에러 반환 (저장 안 됨)
```

**검증 방법으로 `/v1beta/models` 선택한 이유**

- 모델 목록 조회는 토큰 소모 없이 키 유효성만 확인 가능
- 응답이 빠르고 가벼움
- 키가 유효하면 200, 무효하면 400/403 반환 — 명확한 판별 가능

---

## 15. 모범 답안: 지원자 제출 문서 기반 생성

**결정** (2026-04-01): 리포트의 문항별 모범 답안은 지원자가 면접 생성 시 제출한 문서(이력서·포트폴리오·GitHub)에 기재된 내용만을 근거로 생성한다.

**구조**

- 면접 세션 생성 시 `resume_ids`에 선택된 모든 문서 ID(이력서 + 포트폴리오 + git) 저장
- 평가 시점에 `getDocumentsByIds(session.resume_ids)`로 원본 문서 텍스트 fetch
- `buildEvaluationPrompt`에 `resumeTexts`로 전달 → 평가 프롬프트 내 `## 지원자 제출 문서` 섹션에 포함

**프롬프트 설계 원칙**

모범 답안 생성 지침(`## 모범 답안 생성 지침`)을 평가 지시사항 목록에서 독립된 섹션으로 분리:

- 문서 스캔 → 프로젝트명·수치·기술스택 파악을 선행 단계로 명시
- 문서에 없는 내용 날조 금지 (추측 포함)
- 지원자 1인칭 목소리로 작성 (실전 면접 답변 형태)
- STAR 기법 활용 (힌트 프롬프트와 동일 수준)
- 200~400자 길이 기준 명시
- 같은 질문 그룹 내 본 질문·꼬리질문 간 중복 경험 방지

**힌트 프롬프트와의 일관성**

면접 중 힌트(`buildHintPrompt`)도 동일한 원칙으로 문서 기반 모범 답안을 생성한다. 평가 시 모범 답안도 동일한 품질 기준을 적용한다.

**업데이트 (2026-04-03)**

두 가지 문제가 추가 발견되어 프롬프트 강화:

1. **힌트 모범 답안이 일반적 내용으로 생성되는 문제**: `buildHintPrompt`에 문서 스캔 선행 단계(`[필수] 문서 기반 답변 작성`) 명시 추가. 추상적·일반적 답변 금지 명시. "이미 언급한 프로젝트 제외" 규칙이 너무 강해 관련 경험이 하나밖에 없을 때도 회피하는 문제 → "가능한 경우 다른 경험 우선, 없으면 동일 사용" 방식으로 완화.

2. **리포트에서 hint 사용 질문의 model_answers가 빈 배열로 생성되는 문제**: AI가 `[모범 답안]` 마커와 "모범 답안 참조: 예" 레이블을 보고 "이미 제공됨"으로 해석해 생성 스킵. `buildEvaluationPrompt`에 "used_hint 여부와 무관하게 모든 질문에 model_answers 반드시 생성" 명시로 해결.

**주의사항**

- git 문서는 `parsed_text: ''`로 저장되므로 필터링됨 — 문서 텍스트로는 활용 불가, URL은 면접관 에이전트 컨텍스트로만 활용
- 사용자가 문서를 삭제한 경우 `resumeTexts`가 비어 모범 답안이 일반적인 내용으로 생성될 수 있음

---

## 16. good_answer_tips: 힌트 에이전트 전용으로 분리

**결정** (2026-04-02): `analysis_agent`가 생성한 `good_answer_tips` 필드를 면접관 에이전트 시스템 프롬프트에서 제거한다. 힌트 에이전트(`buildHintPrompt`)에서만 사용한다.

**이유**

- `good_answer_tips`는 면접관이 "좋은 답변이 무엇인지" 미리 알고 있는 상태가 되어, 면접관의 꼬리질문·판단이 편향될 수 있음
- 힌트는 지원자가 명시적으로 요청할 때만 제공하는 정보 — 면접관이 사전에 참조해서는 안 됨
- 불필요한 컨텍스트 제거로 시스템 프롬프트 토큰 절약 효과도 있음

**구현**

- `buildInterviewSystemPrompt()`에서 `analysisJson`을 `JSON.stringify` 전에 `questions` 배열의 각 항목에서 `good_answer_tips`만 제거한 복사본을 사용
- `buildHintPrompt()`는 별도 파라미터(`goodAnswerTips`)로 직접 전달받으므로 영향 없음
- `analysis_agent` 출력 스키마(`AnalysisOutput`)는 변경 없음 — 생성은 계속 하되 면접관에게만 노출하지 않음

---

## 17. 신규 사용자 온보딩 플로우

**결정** (2026-04-02): 첫 로그인 후 별도 온보딩 라우트(`/onboarding`)로 이동해 직군·연차·문서를 미리 수집한다.

**구조**

```
Google login → auth callback
  → job_category === null (신규) → /onboarding
  → job_category !== null (기존) → /interview

/onboarding
  Step 1: 내 소개 (직군·연차 필수, 기술스택·스킬 선택)
  Step 2: 문서 업로드 (이력서·포트폴리오·Git, 전부 선택)
  → /interview
```

**신규 사용자 감지 기준**: `user_profiles.job_category === null`

- 온보딩 Step 1에서 직군·연차를 필수 입력으로 강제 → 완료 시 반드시 `job_category`가 채워짐
- 기존에 검토한 "60초 타이머" 방식은 기각 — 온보딩을 건너뛴 사용자가 재로그인 시 반복 노출되는 문제
- DB 플래그(`onboarding_completed`) 추가 없이 기존 컬럼으로 완료 여부 판단 가능

**팝업 플로우 처리**

데스크톱은 팝업 OAuth를 사용하므로 auth callback 리다이렉트가 부모 창에 직접 적용되지 않음. 해결책:
- callback → `popup-success?new_user=true` 파라미터 전달
- popup-success → `postMessage({ type: 'oauth_success', isNewUser })` 전송
- 로그인 페이지 → `isNewUser` 값으로 `/onboarding` 또는 `/interview` 분기

**관련 파일**

- `src/app/auth/callback/route.ts`
- `src/app/auth/popup-success/page.tsx`
- `src/lib/supabase/auth.client.ts`
- `src/app/(onboarding)/`
- `src/components/onboarding/`

---

## 18. 파일 업로드 크기 제한: 3단계 설정

**결정** (2026-04-03): 파일 업로드 최대 크기는 Next.js, Turbopack, Supabase Storage 세 곳 모두에서 일치시켜야 한다.

**배경**

포트폴리오 파일 업로드 시 "Unexpected end of form" 에러 발생. 초기에 `serverActions.bodySizeLimit`만 조정했으나 에러 지속.

**3단계 크기 제한 구조**

```
[1] next.config.ts — serverActions.bodySizeLimit: "21mb"
    → Server Action으로 전달되는 FormData 크기 제한

[2] next.config.ts — proxyClientMaxBodySize: "21mb"  (Turbopack 전용)
    → Turbopack dev 서버의 프록시 레이어 자체 버퍼 제한 (기본값 10MB)
    → 이 설정이 없으면 Turbopack이 요청을 중간에 잘라버려 "Unexpected end of form" 발생
    → experimental 하위에 위치 (Next.js 16.2+ 필수)

[3] Supabase Storage bucket file_size_limit: 20971520 (20MB)
    → Storage에 실제 파일이 저장될 때의 용량 제한
    → SQL: UPDATE storage.buckets SET file_size_limit = 20971520 WHERE id = 'documents';
```

**주의사항**

- Turbopack 프록시 제한(`proxyClientMaxBodySize`)은 프로덕션에서는 적용되지 않음 — Vercel 배포 시에는 [1]과 [3]만 영향
- 세 값이 맞지 않으면 가장 작은 값에서 먼저 차단됨 → 항상 동일하게 맞출 것

---

## 19. JD 입력: 링크 방식 제거, 텍스트 직접입력 전용

**결정** (2026-04-03): 면접 생성 다이얼로그의 JD 입력을 "링크 / 직접입력 토글" 구조에서 Textarea 직접입력 전용으로 단순화한다.

**이유**

- 링크 입력 시 외부 사이트 크롤링이 필요하나 MVP 범위 내 구현 비용 대비 효용이 낮음
- 링크 방식은 인증 벽(로그인 필요 JD 페이지), 동적 렌더링 사이트에서 동작하지 않음
- 사용자가 JD 텍스트를 복붙하는 것이 가장 빠르고 안정적인 방법
- 복잡한 토글 UI 제거로 폼 구조 단순화

**트레이드오프**

- URL 한 줄로 JD를 첨부하는 편의성 감소
- v2에서 JD URL 크롤링 지원 시 재추가 가능

---

## 20. 기술 검증형 페르소나 추가

**결정** (2026-04-04): 기존 `explorer` / `pressure` 2종에 `technical` 페르소나를 추가한다.

**특성**

- 설계 결정의 근거, CS 기초 원리, 성능 트레이드오프를 집요하게 검증
- depth 상한: 최대 4단계 (pressure와 동일)
- why / how 중심 질문

**구현 범위**

- DB: `interview_sessions.persona`, `user_persona_settings.persona` CHECK 제약에 `'technical'` 추가 (마이그레이션 `20260403000002_add_technical_persona.sql`)
- 타입: `Persona = 'explorer' | 'pressure' | 'technical'` (sessions.ts, personaSettings.ts)
- 프롬프트: `buildNormalizePrompt`, `buildInterviewSystemPrompt`의 `PERSONA_INSTRUCTIONS` 맵에 technical 항목 추가
- UI: NewInterviewDialog + 페르소나 설정 페이지에 "기술 검증형" 버튼 추가

---

## 21. 문서 업로드 UX: AddDocumentDialog + 단계별 로딩

**결정** (2026-04-04): `/resume` 페이지를 전면 리디자인. 섹션별 개별 업로드 버튼 제거, 단일 `AddDocumentDialog`로 통합.

**이유**

- 이력서·포트폴리오·GitHub를 한 번의 플로우에서 묶어 업로드하는 것이 자연스러운 UX
- 정규화 에이전트 실행으로 업로드당 10~30초 소요 → 진행 상황을 시각화하지 않으면 사용자 이탈 가능성 높음
- 섹션마다 따로 업로드 버튼이 있으면 온보딩과 /resume 간 UX 일관성이 깨짐

**구조**

```
ResumePageHeader (헤더 오른쪽 "문서 추가" 버튼)
  → AddDocumentDialog (이력서 여러 파일 + 포트폴리오 여러 파일 + GitHub URL 다수)
    → 제출 시 단계별 진행 오버레이
       - 문서별 0→100% 진행바 (400ms interval, 감속형)
       - 완료 단계: 체크 아이콘 + 연한 primary 배경
       - 진행 단계: 스피너 + primary 배경
    → 모두 완료 시 revalidateDocumentsAction() → 페이지 갱신
```

**취소 처리**

- 로딩 중 X 버튼만 닫기 허용 (dimmed 영역 클릭 차단 — `onInteractOutside` preventDefault)
- 취소 시 `isCancelledRef`로 업로드 루프 중단
- 이미 완료된 문서는 `uploadedDocsRef`에 추적 → `deleteDocumentAction`으로 즉시 삭제
- 인플라이트 업로드가 완료되어도 취소 후 `deleteDocumentAction` 호출

**skipRevalidate 패턴**

- 개별 업로드 시 `{ skipRevalidate: true }` 전달 → `revalidatePath` 미호출
- 전체 완료 후 `revalidateDocumentsAction()` 1회 호출로 일괄 갱신
- 이 패턴 없으면 취소 후에도 revalidation이 완료되어 문서 카드가 나타남

---

*이 문서는 결정이 바뀔 때마다 업데이트한다. 날짜와 이유를 항상 함께 기록한다.*