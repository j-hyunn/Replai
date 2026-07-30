# DECISIONS

> 왜 이렇게 만들었는지를 기록한다. 나중에 돌아봤을 때, 또는 v2를 설계할 때 맥락을 잃지 않기 위해.
>
> **원본은 Obsidian vault `Micro Projects/Replai/Decisions.md`다.** 이 파일은 그 사본이며,
> 위키링크만 평문으로 바꿨다. 내용을 고칠 때는 원본을 먼저 고칠 것.

## 관련 문서

Obsidian vault `Micro Projects/Replai/` 에 있다.

- PRD — 기능 명세 (범위·엣지케이스·마일스톤)
- TRD — 기술 구현 명세 (코드 구조·DB 스키마·보안)
- Multi Agent Architecture — 에이전트 구조 및 실행 흐름
- Agents Prompt — 프롬프트 설계 상세

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
22. [파일 업로드: Presigned URL 방식 전환 + unpdf 교체](#22-파일-업로드-presigned-url-방식-전환--unpdf-교체)
23. 서비스명 변경: reHEARsal → Replai
24. 업로드 응답 경로에서 normalize 분리 (`after()` 백그라운드화)
25. `parsed_text`만으로 인터뷰 진행 금지 — `ensureNormalizedAction` 가드
26. Normalize 모델 분리 — `gemini-2.5-flash-lite`
27. 텍스트 0자 PDF는 업로드 단계에서 명시적 거부
28. `interview_messages.kind` 컬럼 도입 — 텍스트 마커 대체
29. 힌트 점수 캡 하향: 40점 → 30점, 서버 강제 적용
30. 평가 파이프라인 전면 재설계: 단건 병렬 + 런타임 검증 + 서버 후처리
31. 단건 재평가 API — **미구현**
32. Git 링크 입력 기능 제거 — v4.0
33. 마스터 이력서 / 제출용 이력서 2-테이블 분리 — v4.0
34. 이력서 생성 4단계 파이프라인 분할 — v4.0
35. 마스터 이력서 에디터로 tiptap 채택 — v4.0
36. 제출용 이력서 저장 형식: `content_md` → `content_json` — v4.0
37. 평가 타임아웃: 예산(budget) 기반 제어 — v4.0

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

> 📎 현재 에이전트 실행 구조 전체는 Multi Agent Architecture 참고.


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

> **폐기 (2026-07-26, v4.0):** Git 링크 입력 기능 자체가 제거되었다. 사유는 #32 참조.

---

## 11. BYOK: Gemini 전용, ADK 유지

> 📎 BYOK 구현 명세(crypto.ts·ai-config.ts·user_api_settings)는 TRD 섹션 6 참고.


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
       - 문서별 0→100% 진행바 (400ms interval, 감속형)   ← v3.4에서 폐기 (아래 주석)
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

**후속 변경 (2026-05-17, v3.4):** 가짜 진행바(0→100% 감속형)는 제거되었다. normalize가 `after()`로 백그라운드화되면서 업로드 응답이 ~5초로 짧아져, 진행률을 흉내 낼 이유가 사라졌다. 현재는 단계 라벨(`uploading` → `processing` → `done`/`error`)만 표시한다.

**후속 변경 (2026-07-26, v4.0):** GitHub URL 입력이 다이얼로그에서 제거되었다 (#32 참조). 현재 `AddDocumentDialog`는 이력서·포트폴리오 PDF만 다룬다.

---

## 22. 파일 업로드: Presigned URL 방식 전환 + unpdf 교체

**결정** (2026-04-05): 파일 업로드 흐름을 "Server Action 경유" 방식에서 "클라이언트 → Supabase Storage 직접 업로드" 방식으로 전환한다. PDF 파서도 `pdfjs-dist` → `unpdf`로 교체한다.

**배경 (기존 방식의 문제)**

- Vercel 무료 플랜 Request Body 4.5MB 하드 제한 → 대용량 PDF 업로드 시 413 에러 발생
- `pdfjs-dist`가 Vercel 서버리스 환경에서 `DOMMatrix is not defined` 에러로 파싱 실패
- `serverActions.bodySizeLimit: "21mb"` 설정으로 대응했으나 Vercel 플랫폼 제한은 우회 불가

**새로운 업로드 흐름 (3단계)**

```
[기존]
클라이언트 → (파일 포함) Server Action → Supabase Storage + 파싱 → DB

[변경 후]
1. 클라이언트 → getUploadUrlAction() → Presigned URL 발급
2. 클라이언트 → Supabase Storage 직접 업로드 (Vercel 미경유)
3. 클라이언트 → processUploadedDocumentAction() → Storage에서 파일 다운로드 → 파싱 → DB 저장
```

**핵심 포인트**

- 파일 자체는 Vercel을 전혀 경유하지 않음 → Vercel 4.5MB 제한 완전 우회
- 파싱은 서버 간 통신(Supabase → Vercel Server Action)으로 처리 — 파일 바이너리가 아닌 Storage 다운로드이므로 제한 없음
- `storagePath.startsWith(${user.id}/)` 검증으로 타 사용자 Storage 경로 접근 방지

**패키지 변경**

| | 변경 전 | 변경 후 |
|---|---|---|
| PDF 파서 | `pdfjs-dist` | `unpdf` |
| next.config.ts | `serverExternalPackages: ["pdfjs-dist"]` | `serverExternalPackages: ["unpdf"]` |

**unpdf 선택 이유**

- `pdfjs-dist`: Vercel 서버리스에서 `DOMMatrix` 전역 객체 미존재로 런타임 에러
- `unpdf`: 서버리스 환경을 고려해 설계된 라이브러리, DOM 의존성 없음

**트레이드오프**

- 업로드 완료 전 Storage에 고아 파일이 생길 수 있음 (클라이언트 업로드 성공 + processUploadedDocumentAction 실패 시) → 현재는 처리하지 않음. Storage 정리는 v2에서 cron job으로 처리 검토
- 취소 시 이미 Storage에 올라간 파일은 `deleteDocumentAction`으로 명시 삭제

**변경 파일**

- `src/app/(main)/resume/actions.ts` — `uploadDocumentAction` 제거 → `getUploadUrlAction` + `processUploadedDocumentAction` 분리
- `src/components/resume/AddDocumentDialog.tsx` — 3단계 업로드 흐름 적용
- `src/components/common/DocumentCard.tsx` — 3단계 업로드 흐름 적용, DOCX accept 제거

---

*이 문서는 결정이 바뀔 때마다 업데이트한다. 날짜와 이유를 항상 함께 기록한다.*

## 23. 서비스명 변경: reHEARsal → Replai

**결정** (2026-04-16): 프로젝트명을 **reHEARsal**에서 **Replai**로 변경한다.

**이유**

- 동일한 서비스명(reHEARsal)과 도메인이 이미 존재하는 것을 확인
- 브랜드 차별화 및 도메인 충돌 방지를 위해 조기 변경 결정

**새 이름 의미**

> **Replai**
>
> - **Re** + **Play** = 면접을 다시 재생하고 연습한다
> - **Replay** + **AI** = AI와 함께 나의 면접을 반복 재생하며 성장한다
> - 리플레이처럼 다시 보고, 다시 말하고, 다시 완성한다

**변경 범위**

- [ ] PRD.md 섹션 1.2, 1.3 업데이트 (리허설 → Replai)
- [ ] Agents Prompt.md 섹션 개요 업데이트 (리허설의 → Replai의)
- [ ] Obsidian vault 폴더명 reHEARsal → Replai (수동 변경 필요)
- [ ] package.json name 필드
- [ ] README.md
- [ ] 메타태그 / og:title / 페이지 타이틀
- [ ] Supabase 프로젝트 표시명
- [ ] Vercel 프로젝트명
- [ ] 도메인 확보 (replai.io / replai.app / replai.kr 가용 여부 확인)



---

## 24. 업로드 응답 경로에서 normalize 분리 (after()로 백그라운드화)

**결정** (2026-05-17): `processUploadedDocumentAction`이 Gemini normalize를 동기로 호출하던 것을 Next.js `after()` 콜백으로 옮긴다. 업로드 응답은 `parsed_text` 저장 직후 반환.

**배경**
- 큰 포트폴리오(16K자+)는 normalize 응답이 30~60초 → Vercel function 60s 한도 또는 클라이언트 체감 timeout으로 자주 실패
- AbortError → `parsed_text=""` 폴백으로 문서는 저장됐지만 normalized_text가 빈 채로 인터뷰에 흘러감
- 사용자 보고: "업로드 시간이 너무 오래걸려서 업로드에 실패하는 케이스가 생긴다"

**구현**
- 응답 직후 `after(async () => runNormalize → updateNormalized)` 비동기 실행
- `normalize_status` 컬럼 (pending/done/failed)으로 진행 상태 추적
- 인터뷰 시작 시 `ensureNormalizedAction`이 동기 보장 (§25 참조)

**대안 검토**
- **폴링 + 폴백**: 결국 인터뷰 시작 시 사용자가 기다리는 것은 동일. 채택 안 함.
- **Supabase Edge Function**: 혁신 토큰 소비 + 디버깅 어려움. 현재 단계에서 과함. v2 검토.
- **큰 텍스트 청크 분할**: 복잡도 증가, MVP에서 보류. v2 후보.
- **모델 lite 교체만**: 일부 케이스는 해결되지만 응답이 30~40s대라 여전히 업로드 다이얼로그가 멈춤 → 응답 분리가 본질적 해결.

---

## 25. parsed_text만으로 인터뷰 진행 금지 — `ensureNormalizedAction` 가드

**결정** (2026-05-17): 인터뷰 route에 `d.normalized_text ?? d.parsed_text` graceful fallback이 있지만 사용하지 않는다. `NewInterviewDialog.handleStart()`에서 선택된 모든 문서가 `normalize_status === 'done'`이 되도록 보장한 뒤 세션을 생성한다.

**이유**
- `parsed_text`는 PDF raw 추출 — 양식 깨짐, 헤더/푸터 노이즈 포함 → analysis_agent 입력 품질이 낮음
- 빠른 사용자(업로드 직후 시작)가 raw text로 인터뷰하는 케이스를 명시적으로 차단해야 함
- 사용자 명시 요구: "normalized text 없이 parsed text로만 인터뷰를 진행하게 하고 싶지 않다"

**보장 메커니즘**
- 시작 버튼 클릭 → "AI 분석 마무리 중..." stage UI → 동기 normalize (최대 55s/문서) → done 보장 후 세션 진입
- failed로 끝나면 명시적 에러 토스트 + 다이얼로그 유지 (사용자가 문서 제외 또는 카드에서 재시도)

**시간 분배 설계 — 베팅**
- 사용자가 setup 페이지에서 보내는 30~60초 동안 백그라운드 normalize가 대부분 끝남
- 빠른 사용자만 시작 시점에서 잠깐 기다림
- 업로드 다이얼로그가 30~60초 멈춰있는 것보다 "AI 분석 마무리 중" 명시적 UI가 UX 우위

---

## 26. Normalize 모델 분리 — `gemini-2.5-flash-lite`

**결정** (2026-05-17): 면접/평가/분석 에이전트는 `gemini-2.5-flash` 유지, normalize만 `gemini-2.5-flash-lite`로 분리.

**배경**
- 16K자 포트폴리오 → flash 응답 시간 45s+ → AbortController abort
- normalize prompt가 "원문 그대로 정제만" 방식이라 input ≈ output 토큰 수 → 응답 시간이 길어짐

**선택 이유**
- flash-lite latency 1/2~1/3 수준 — 같은 입력도 ~20s 안에 응답
- Normalize는 텍스트 재구성(노이즈 제거, 줄바꿈 복원, 헤딩 부여) 작업 — lite 품질로 충분
- timeout 45s → 55s 조정 (Vercel maxDuration 60s 안에서 마진 5초)
- 상수 `NORMALIZE_MODEL`로 한 곳에서 관리

**모니터링 포인트**
- lite로도 timeout나는 케이스 누적 시:
  - prompt를 요약형으로 변경 (input ≈ output 제약 해제)
  - 청크 분할 도입
  - maxDuration 90s + Vercel Pro 검토

---

## 27. 텍스트 0자 PDF는 업로드 단계에서 명시적 거부

**결정** (2026-05-17): unpdf 추출 결과 `parsed_text === ""`이면 Storage 파일 즉시 정리 + 사용자에게 "PDF에서 텍스트를 추출할 수 없습니다. 스캔본/이미지 PDF는 지원하지 않습니다. 다른 파일을 업로드해주세요" 에러 반환.

**배경**
- 이전 동작: `parsed_text=""` 그대로 DB 저장 → 인터뷰에서 빈 텍스트 흘러감 (graceful fallback 가짜 통과)
- 사용자 입장에선 업로드 성공으로 보이지만 실제로는 인터뷰에서 쓸 수 없는 상태
- 디버깅 시 unpdf 미설치(lockfile sync 문제) 때문에 모든 PDF가 0자 추출되는 케이스 발견 → 이 가드가 문제를 "표면화"시켜 환경 문제를 빨리 잡을 수 있었음

**거부 대상**
- 스캔본/이미지 PDF (OCR 없이는 텍스트 없음)
- 폰트 outline 처리된 디자이너 포트폴리오 (Figma/InDesign export 시 흔함)
- ToUnicode CMap 누락 PDF (드물지만 발생)

**예외 — Git 링크**
- README fetch 실패해도 URL은 저장 진행 (사용자가 명시적으로 입력했으므로). `normalize_status`만 `'failed'`로 표기해 카드에서 재시도 가능하게.

**v2 고려 사항**
- 텍스트 드래그 가능한데 unpdf만 못 뽑는 케이스 → `pdfjs-dist` 직접 호출 fallback 추가 검토 (unpdf는 pdfjs-dist 래퍼지만 옵션 제한적)
- 스캔본은 OCR 별도 처리 (Tesseract 또는 Gemini Vision)


---

## 28. interview_messages.kind 컬럼 도입 — 텍스트 마커 시스템 대체

**결정** (2026-05-20): `[모범 답안]`, `[질문 건너뛰기]` 텍스트 마커를 `interview_messages.kind` 컬럼으로 대체한다.

**기존 방식의 문제**

- 힌트 사용 여부와 건너뛰기 여부가 메시지 `content` 필드의 접두사 마커로 저장됨
- 마커 파싱이 문자열 비교에 의존해 LLM 출력 변동·공백 차이에 취약
- 평가 시점에 메시지 배열을 다시 스캔해 마커를 파싱해야 해서 로직이 분산됨

**결정 이유**

- `kind: 'answer' | 'hint_shown' | 'skipped' | 'interviewer'` 열거형으로 의미를 일급 데이터로 저장
- DB 쿼리 레벨에서 `WHERE kind = 'skipped'` 필터 가능 — 코드 파싱 불필요
- 기존 마커(`[모범 답안]`, `[질문 건너뛰기]`)는 마이그레이션에서 백필 후 평가 코드에서 제거

**마이그레이션**

- `20260519000001_add_message_kind.sql` — `interview_messages.kind` 컬럼 추가 + 기존 마커 백필 + NOT NULL 제약

---

## 29. 힌트 점수 캡 하향: 40점 → 30점, 서버 강제 적용

**결정** (2026-05-20): 힌트 사용 답변의 각 항목 점수 상한을 최대 30점으로 하향 조정한다. 서버에서 무조건 강제 적용한다.

**이유**

- 기존 40점 캡은 힌트를 적극 활용해도 합격 점수대에 근접 가능해 의존 유인이 컸음
- 30점 캡은 실력 기반 점수(평균 60~80점)와 명확한 차이를 만들어 힌트 사용이 성적에 유의미한 영향을 줌
- LLM 프롬프트에 30점 캡을 명시해도 이를 무시하는 prompt drift 관측 → 서버 후처리 강제 적용으로 신뢰성 100% 확보
- `applyHintCap()`이 cap 초과 시 `console.warn`으로 prompt drift 경보 발생

**구현**

- `HINT_SCORE_CAP = 30` 상수 (`src/lib/evaluation/postprocess.ts`)
- `applyHintCap()`: 각 항목별 `Math.min(score, 30)` + `average` 재산출
- LLM 초과 감지: `console.warn("[applyHintCap] LLM exceeded hint cap — prompt drift?")`

---

## 30. 평가 파이프라인 전면 재설계: 단건 병렬 + Zod + 서버 후처리

**결정** (2026-05-20): 일괄 평가(질문 n개를 한 번 호출)에서 질문별 단건 호출 병렬 실행으로 전환한다. Zod 스키마 검증과 서버 후처리 산술을 추가한다.

**기존 방식의 문제**

- 일괄 호출: LLM이 일부 질문 답변을 누락해도 silent loss 발생 (누락 감지 불가)
- LLM이 계산한 `average`와 실제 산술 평균이 1~3점씩 drift
- 구조화 출력 없이 raw JSON parse → 필드 누락·타입 오류 시 전체 파이프라인 실패

**채택한 설계**

- 질문별 단건 Gemini 호출 → 동시성 4로 제한한 병렬 실행
- 응답은 런타임 타입 가드로 검증 → 실패 시 재시도 대상으로 처리
- 실패 시 최대 3회 재시도
- 서버에서 `average` 재산출 (`Math.round((logic + specificity + job_fit) / 3)`)
- `total_score` = skipped·failed 제외 평균 — LLM 계산 불신
- 불복구 실패 시 throw 대신 `failed` AnswerFinal 반환 → UI에서 재평가 버튼으로 처리

**트레이드오프**

- API 호출 횟수 증가 (1회 → n회) — 동시성 4로 상쇄, 총 응답 시간은 유사
- LLM 산술 신뢰 불가 판단 → 서버 계산 도입으로 일관성 확보
- 단건 재평가 API와 자연스럽게 결합 (동일 `evaluateAnswer` 함수 재사용)

**구현 파일**

- `src/lib/evaluation/parse.ts` — 런타임 타입 가드 + `InvalidEvaluationError`
- `src/lib/evaluation/concurrency.ts` — `mapWithConcurrency` (자체 구현)
- `src/lib/evaluation/postprocess.ts` — 서버 후처리 산술
- `src/lib/utils/withDeadline.ts` — 호출별 대기 상한
- `src/lib/prompts/evaluation.ts` — 단건·요약·건너뛰기 프롬프트
- 호출·재시도 오케스트레이션은 `src/app/api/interview/route.ts`에 인라인

> **정정 (2026-07-30):** 이 결정을 처음 기록할 때 Zod 스키마(`schema.ts`), `p-limit`, Gemini structured output(`responseSchema`), 별도 `run.ts`를 채택한 것으로 적었으나 **실제로 구현된 것은 위 구성이다.** 외부 의존성(zod·p-limit) 없이 수동 타입 가드와 자체 동시성 유틸을 썼고, structured output도 사용하지 않는다. 설계 의도(누락 방지·서버 산술·재시도)는 그대로 달성됐으나 수단이 다르다.

---

## 31. 단건 재평가 API — 미구현

> **상태 (2026-07-30): 결정만 있고 구현되지 않았다.** `/api/interview`의 `type` 분기는 `analyze` / `respond` / `hint` / `skip` / `evaluate` 5종뿐이며 `reevaluate`는 없다.
> 게다가 리포트 UI가 `AnswerStatus`를 읽지 않아 `failed` 카드 자체가 화면에 나타나지 않는다. 즉 재평가 버튼을 붙일 진입점도 없는 상태다. **두 작업은 한 세트로 처리해야 한다.**
> 아래는 원래의 결정 기록이며, 구현 시 그대로 따르면 된다.

**결정** (2026-05-20): 평가 실패 답변을 재시도할 수 있는 단건 재평가 엔드포인트를 추가한다.

**결정 이유**

- 일괄 평가 시대에는 전체 재평가만 가능했고, 일부 질문 실패 시 사용자가 전체 면접을 다시 해야 했음
- 단건 호출 파이프라인으로 전환 후 `evaluateAnswer()`가 질문 단위로 독립 실행 가능 → 단건 재평가가 자연스럽게 구현 가능
- 평가 실패는 일시적 Gemini 장애가 원인인 경우가 많아, 재시도 한 번으로 해결 가능

**API 명세**

```
POST /api/interview
{
  type: "reevaluate",
  sessionId: string,
  questionId: string
}
```

- 인증: 세션 소유권 검증 (`session.user_id === user.id`)
- 동작: 해당 `question_id`의 QaGroup 재구성 → `evaluateAnswer()` 실행 → 리포트의 해당 인덱스 교체 → `upsert` 저장
- 성공 시: 업데이트된 리포트 반환 (클라이언트에서 해당 카드만 교체)
- 실패 시: 기존 `failed` 상태 유지 (리포트 변경 없음)

**트레이드오프**

- 재평가 중 더블 클릭/다중 탭 동시 요청 시 race condition 가능성 — 구현 시 `If-Match` 헤더 또는 클라이언트 락 필요

---

## 32. Git 링크 입력 기능 제거

**결정** (2026-07-26): 이력서 문서 종류에서 GitHub 링크를 제거한다. `GitLinkSection.tsx` 삭제, `saveGitLinkAction` 제거, 온보딩·`/resume`에서 입력 UI 제거.

**이유**

- README fetch만으로는 면접 컨텍스트 기여가 미미했다. 대부분의 README는 프로젝트 설치법·사용법이라 지원자의 역할·의사결정·성과가 드러나지 않는다
- 코드/커밋 분석(#10의 v2 방향)은 여전히 비용이 크고, 그 없이는 URL 한 줄이 컨텍스트에 주는 값이 사실상 0에 가까웠다
- 마스터 이력서(#33)가 도입되면서 프로젝트 정보를 구조화해 직접 입력받는 경로가 생겼다. Git README의 역할을 마스터 이력서의 프로젝트 섹션이 더 정확하게 대체한다
- `type: 'git'` 문서는 `parsed_text`가 비어 있어 문서 텍스트로 활용 불가했고, normalize 상태 관리에서만 예외 케이스를 늘리고 있었다

**남은 잔재 (정리 필요)**

- `DocumentType`에 `'git'`, `MAX_SIZE_BYTES.git = 0`, `upsertGitDocument()`가 남아 있으나 호출부가 없다 (dead code)
- 기존 사용자의 `type='git'` 행은 DB에 남아 있다. 마이그레이션으로 정리하지 않았다

---

## 33. 마스터 이력서 / 제출용 이력서 2-테이블 분리

**결정** (2026-07-26): 이력서를 **마스터 이력서**(유저당 1개, 모든 경험의 원본)와 **제출용 이력서**(JD별 N개, AI 생성물)로 분리해 별도 테이블로 저장한다.

**이유**

- 두 데이터의 수명주기가 완전히 다르다. 마스터는 계속 갱신되는 자산이고, 제출용은 특정 JD에 대한 스냅샷이라 생성 후 불변에 가깝다
- 한 테이블에 `is_master` 플래그로 두면 "마스터를 수정했을 때 기존 제출용도 바뀌어야 하는가"라는 답 없는 질문이 생긴다. 분리하면 **제출 시점의 이력서가 그대로 보존**된다 — 면접 준비에는 이 쪽이 맞다
- 제출용에만 필요한 필드(`company_name`, `position`, `jd_text`, `analysis_json`)가 마스터 행에서 항상 null로 남는 낭비도 피한다

**JSONB 단일 테이블을 택한 이유 (섹션별 정규화 대신)**

- 경력·프로젝트·학력을 각각 테이블로 쪼개면 조인 5~6개가 필요한데, 읽기 패턴이 **항상 전체 조회**다. 부분 조회 요구가 없다
- 폼 전체를 한 번에 저장하는 UX라 부분 업데이트도 불필요하다 — `upsert` 한 번으로 끝난다
- 스키마 변경이 잦은 초기 단계에서 마이그레이션 비용이 훨씬 낮다
- 트레이드오프: DB 레벨 제약이 없어 잘못된 구조가 들어가도 막지 못한다. 실제로 #36의 `summary` 위치 문제가 이 때문에 발생했다

---

## 34. 이력서 생성 4단계 파이프라인 분할

**결정** (2026-07-26): JD 맞춤 이력서 생성을 한 번의 LLM 호출이 아니라 4단계 순차 호출로 나눈다.

```
1단계  JD 분석 + 전략 수립   → 포지션 페르소나, 3대 핵심 역량, ATS 키워드
2단계  마스터 이력서 필터링   → 선별된 항목의 id 목록 + 우선순위
3단계  개조식 재작성         → 텍스트 필드만 제출용 문장으로 변환
4단계  분석 생성             → 키워드 매핑 / 강조 포인트 / 부족 항목
```

**이유**

- 한 번에 시키면 **선별과 문체 변환이 섞여 선별 기준이 무너진다.** "JD에 안 맞는 프로젝트를 빼라"와 "문장을 개조식으로 바꿔라"를 동시에 주면 모델이 둘 다 어중간하게 수행한다
- 1단계에서 전략(핵심 역량 3가지)을 **먼저 고정**해야 2·3단계가 같은 기준으로 판단한다. 전략을 매번 암묵적으로 재추론하면 단계마다 다른 기준이 적용된다
- 2단계를 id 선별만 하게 제한하면 출력이 짧아져 실패 확률이 낮고, 검증도 쉽다 (id 존재 여부만 확인하면 됨)
- 단계별로 실패 지점이 분리돼 사용자에게 "JD 분석 실패" / "문장 변환 실패"처럼 구체적으로 안내할 수 있다

**트레이드오프**

- 호출 4회 순차 → 생성 1건에 수십 초. `maxDuration = 300`으로 대응했으나 이 값의 실제 적용 여부는 미확인 (#37)
- 비용도 4배. BYOK 유도 또는 생성 횟수 제한이 BM 검토 대상
- 병렬화 불가 — 각 단계가 이전 단계 출력에 의존한다. 단축하려면 단계를 병합해야 하는데 그러면 위 이유가 무너진다

**보조 장치**

- 2단계 입력에서 `description`·`achievement`를 앞 200자로 잘라 토큰 절약
- 4단계는 이력서를 다시 만들지 않고 3단계 결과를 그대로 되돌려받는다. `RESUME_JSON` 블록 파싱이 실패하면 3단계 결과를 canonical로 사용 — **이 파이프라인의 유일한 폴백**

---

## 35. 마스터 이력서 에디터로 tiptap 채택

**결정** (2026-07-26): 마스터 이력서의 서술형 필드(업무 내용, 프로젝트 설명, 성과 등)에 tiptap 기반 마크다운 에디터를 사용한다.

**이유**

- 이력서 본문은 불릿 리스트가 기본 형태인데, plain textarea에서는 사용자가 `- `를 직접 타이핑해야 하고 렌더 결과를 볼 수 없다
- 저장 형식은 마크다운이어야 한다 — LLM 프롬프트에 그대로 넣고, 제출용 이력서 뷰어에서 렌더하기 위함. `tiptap-markdown`이 에디터 상태 ↔ 마크다운 변환을 담당한다
- 리치 텍스트를 HTML로 저장하면 프롬프트에 태그가 섞여 토큰을 낭비하고 LLM이 오독한다

**선택하지 않은 대안**

- plain textarea + 마크다운 미리보기 분리: 구현은 간단하나 긴 이력서 작성 시 입력·확인 왕복이 번거롭다
- 리치 텍스트 에디터(HTML 저장): 위 이유로 부적합

**트레이드오프**

- 의존성 4개 추가 (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `tiptap-markdown`)
- 번들 크기 증가. 마스터 이력서 편집 화면에서만 쓰이므로 라우트 단위로 격리돼 있다

---

## 36. 제출용 이력서 저장 형식: `content_md` → `content_json`

**결정** (2026-07-26 도입, 2026-07-30 보완): 제출용 이력서를 마크다운 문자열이 아니라 마스터 이력서와 **동일한 구조화 JSON**으로 저장한다.

**배경**

최초 구현은 LLM이 마크다운 이력서를 통째로 생성해 `content_md`에 저장하는 방식이었다. 문제:

- 뷰어가 마크다운을 그대로 렌더하니 이력서다운 레이아웃이 나오지 않았다. 특히 "경력 하위에 그 회사에서 한 프로젝트를 넣는" 표준 이력서 위계를 마크다운으로는 강제할 수 없었다
- 필드 단위 접근이 불가능해 부분 수정·재생성이 어렵다

**결정**

- `content_json` 컬럼 신설(`20260616000001`). 마스터 이력서와 같은 스키마 + JD 맞춤 `summary`
- 뷰어가 JSON을 읽어 표준 레이아웃으로 렌더 — 경력 하위에 같은 회사 프로젝트를 통합하고, 매칭되지 않는 프로젝트는 "기타 프로젝트"로 분리
- `content_md`는 레거시 행 호환용으로 남기고 신규 생성 시 빈 문자열

**후속 사고 (2026-07-30 수정)**

이 전환 과정에서 **제출용 이력서가 면접 컨텍스트에 전혀 주입되지 않는 버그**가 있었다. 생성기는 `content_md: ""`로 저장하는데 면접 라우트는 `content_md`가 truthy할 때만 주입해, 조건이 항상 false였다. 제출용 이력서를 선택해도 분석·질문 생성·면접·평가 어디에도 반영되지 않았다.

- 수정: `serializeSubmittedResume()` 추가, `content_json` 우선 → `content_md` 폴백
- 교훈: **컬럼을 전환할 때 그 컬럼을 읽는 쪽을 전수 확인해야 한다.** 쓰기만 바꾸면 조용히 죽는다

**남은 문제 — 스키마 미강제**

`content_json`은 LLM 출력을 그대로 저장하므로 구조가 보장되지 않는다. 실제로 JD 맞춤 요약이 최상위 `summary`가 아니라 `basics.summary`에 들어가는 경우가 관측됐다. 현재는 뷰어·직렬화 모두 **최상위 → basics 순 폴백**으로 읽고, `SubmittedResumeContent.summary`를 optional로 선언해 타입을 실제와 맞췄다. 근본 해결은 저장 전 스키마 검증 도입이다.

---

## 37. 평가 타임아웃: 예산(budget) 기반 제어

**결정** (2026-07-30): 평가 호출에 개별 타임아웃만 두지 않고, **핸들러 전체의 wall-clock 예산**을 함께 관리한다.

|상수|값|의미|
|---|---|---|
|`EVAL_CONCURRENCY`|4|동시 실행 상한|
|`ONESHOT_TIMEOUT_MS`|45,000|호출 1회 대기 상한|
|`EVAL_BUDGET_MS`|240,000|evaluate 핸들러 전체 예산|

**이유**

- 호출별 타임아웃만 있으면, 질문이 많고 재시도가 겹칠 때 총 소요가 함수 한도를 넘어 **리포트 저장 직전에 플랫폼이 요청을 죽인다.** 그러면 평가 결과가 통째로 사라진다
- 호출별 상한을 `Math.min(45s, 남은 예산)`으로 잡으면 재시도가 예산을 넘지 못한다
- 예산이 소진되면 남은 질문은 재시도 없이 `failed` 카드로 degrade한다. **부분 리포트가 무(無) 리포트보다 낫다** — 평가 실패는 면접 자체를 무효화하지 않기 때문이다 (#3의 "폴백 없음" 원칙이 적용되지 않는 유일한 영역)

**한계**

`withDeadline`은 **호출자의 대기 시간만** 끊는다. ADK Runner가 AbortSignal을 노출하지 않아 타임아웃된 Gemini 호출은 자체 종료되거나 함수가 내려갈 때까지 계속 실행된다. 그래도 둘 이유가 있다 — 응답 없는 호출 하나가 리포트 전체를 막는 것보다 낫다.