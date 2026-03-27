**Technical Requirements Document v1.0** 작성일: 2026-03-27 | 상태: Draft

---

## 1. 기술 스택

|영역|기술|비고|
|---|---|---|
|**IDE**|Google Antigravity|Gemini 3 Pro 기반 에이전트 개발 환경|
|**에이전트 프레임워크**|Google ADK (TypeScript)|멀티 에이전트 오케스트레이션|
|**Framework**|Next.js|App Router 기반|
|**UI**|shadcn/ui|컴포넌트 라이브러리|
|**AI 모델**|Gemini 3 Pro|면접관/평가 AI|
|**Database**|Supabase|무료 티어|
|**Auth**|Supabase Auth|Google OAuth|
|**Storage**|Supabase Storage|무료 티어 (1GB)|
|**배포**|Vercel|무료 티어|

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
[클라이언트]
├─ 문서 파싱 (브라우저 라이브러리)
├─ 타이머 관리
├─ Gemini API 호출 요청
└─ UI 렌더링 (스트리밍 응답)

[Next.js API Route]
├─ Gemini API 프록시 (API 키 보호)
└─ Google OAuth 처리

[Supabase]
├─ Auth (Google OAuth)
├─ DB (세션, 히스토리, 리포트)
└─ Storage (이력서, 포트폴리오 파일)
```

### 2.2 아키텍처 결정 원칙

- Gemini API 키는 클라이언트에 절대 노출하지 않음 → Next.js API Route 프록시로 처리
- 문서 파싱, 타이머는 클라이언트에서 처리 → 서버 부하 최소화 (Vercel 무료 티어 대응)
- Gemini 응답은 스트리밍으로 처리 → 레이턴시 체감 최소화, 면접관이 말하는 듯한 UX

---

## 3. 멀티 에이전트 구조

### 3.1 에이전트 개요

```
오케스트레이터 에이전트
├─ 분석 에이전트: JD + 이력서 파싱 → 질문 세트 생성
├─ 면접관 에이전트: 대화 진행 + 꼬리질문 판단
└─ 평가 에이전트: 전체 답변 분석 → 리포트 생성
```

### 3.2 실행 순서: 병렬 + 순차 혼합

```
[면접 시작 전]
분석 에이전트 실행 (백그라운드)
└─ 로딩 UI 표시 중 비동기 처리
└─ 완료 후 면접관 에이전트 시작

[면접 진행 중]
면접관 에이전트 실행 (동기)
└─ 질문 → 유저 답변 → 꼬리질문 판단 → 반복

[면접 종료 후]
평가 에이전트 실행 (비동기)
└─ 전체 대화 이력 분석 → 리포트 생성
```

### 3.3 에러 핸들링 원칙

> 불완전한 면접 경험은 실전 대응에 치명적이다. 폴백 없이 실패는 실패로 처리한다.

- 각 에이전트 호출 실패 시 **최대 3회 재시도**
- 3회 재시도 후에도 실패 시 → 명확한 에러 메시지 표시 + 재시작 유도
- **폴백(일부 기능 제외 진행) 없음**

---

## 4. 분석 에이전트

### 4.1 역할

JD + 이력서/경력기술서 + 포트폴리오(선택) + Git README(선택)를 입력받아 질문 세트 생성

### 4.2 질문 생성 전략: 혼합형

|질문 유형|생성 방식|예시|
|---|---|---|
|**공통 질문**|사전 생성|자기소개, 강점/약점, 지원 동기|
|**프로젝트 질문**|처음부터 동적 생성|"Walla에서 webhook 자동화를 하셨는데..."|
|**꼬리질문**|답변 후 동적 생성|유저 답변 기반 심층 질문|

프로젝트 질문은 답변 내용을 예측할 수 없으므로 사전 생성 불가. 이력서 파싱 결과를 기반으로 처음부터 동적으로 생성한다.

### 4.3 분석 프롬프트 구조

1. JD에서 핵심 역량 키워드 및 우대사항 추출
2. 이력서에서 주요 경력, 프로젝트, 수치 성과 추출
3. JD ↔ 이력서 매핑 (강점 영역 / 설명이 필요한 갭 식별)
4. 위 분석 기반으로 공통 질문 + 프로젝트 질문 초안 생성

---

## 5. 면접관 에이전트

### 5.1 역할

분석 에이전트가 생성한 질문 세트를 기반으로 대화 진행, 꼬리질문 여부 판단

### 5.2 꼬리질문 판단: 룰 기반 1차 필터 + AI 최종 판단

**1차 룰 기반 필터**

- 답변에 수치/사례 없음 → 구체화 요청 플래그
- 답변 길이가 기준 이하 → 보완 요청 플래그
- 사전 정의된 심층 키워드 감지 → 심층 질문 플래그

**2차 AI 최종 판단**

- 1차 필터 결과를 컨텍스트로 포함
- AI가 꼬리질문 필요 여부 및 질문 내용 최종 결정

### 5.3 꼬리질문 최대 Depth: 4

```
Q. 본 질문 (depth 0)
└─ Q. 꼬리질문 1 (depth 1)
   └─ Q. 꼬리질문 2 (depth 2)
      └─ Q. 꼬리질문 3 (depth 3)
         └─ Q. 꼬리질문 4 (depth 4) → 종료
```

### 5.4 페르소나별 시스템 프롬프트

|페르소나|말투|꼬리질문 스타일|
|---|---|---|
|**스타트업 실무진**|캐주얼하고 직접적|실무 능력 중심, 빠른 템포|
|**대기업 인사팀**|정중하고 격식체|STAR 구조 유도, 역량 모델 기반|
|**압박 면접관**|날카롭고 도전적|모순 지적, 재질문, 4depth 적극 활용|

### 5.5 스트리밍 응답

- Gemini API 스트리밍 응답으로 처리
- 면접관이 말하는 듯한 타이핑 UX 구현
- Vercel 무료 티어 10초 타임아웃 대응

---

## 6. 평가 에이전트

### 6.1 역할

면접 종료 후 전체 대화 이력을 분석해 리포트 생성

### 6.2 평가 구조: 항목별 점수 + 총점

**답변별 평가 항목:**

|평가 축|설명|배점|
|---|---|---|
|논리성|두괄식 구성, STAR 구조 여부|100점|
|구체성|수치/사례 활용 여부|100점|
|직무 적합성|JD 요구 역량과의 연관성|100점|

**총점 산출:**

- 각 답변의 3개 항목 평균 → 답변별 점수
- 전체 답변 점수 평균 → 총점 (100점 환산)

### 6.3 리포트 구성

- 총점
- 전체 총평
- 개선 필요 답변 Top 3 + 개선 방향
- 모범 답변 예시
- 재도전 추천 질문

---

## 7. 상태 관리

### 7.1 면접 세션 상태: 메모리 + 주기적 DB 저장 혼합

```
[세션 진행 중]
브라우저 메모리에 실시간 저장
└─ 현재 질문 index
└─ 대화 이력 (질문 + 답변)
└─ 현재 depth
└─ 경과 시간

[DB 저장 시점]
└─ 면접 시작 시 (시작 시각, 설정값 저장)
└─ 매 답변 완료 시 (대화 이력 저장)
└─ 이탈 감지 시 (visibilitychange 이벤트)
└─ 면접 종료 시 (전체 이력 + 리포트 저장)
```

### 7.2 타이머 관리

- 클라이언트에서 카운트다운 관리
- 면접 시작 시각만 Supabase DB에 저장
- 이어하기 시: DB에서 시작 시각 불러와 경과 시간 계산 후 타이머 재개

### 7.3 이어하기 플로우

```
브라우저 이탈 감지
└─ 현재 세션 상태 DB 저장
└─ 재접속 시 미완료 세션 감지
└─ "이어서 진행하시겠습니까?" 확인
└─ 확인 시 → DB에서 상태 복원 후 재개
```

---

## 8. 문서 파싱

### 8.1 파싱 위치: 클라이언트 사이드 (브라우저)

- 서버 부하 최소화 (Vercel 무료 티어 대응)
- 파일 업로드 시 브라우저에서 즉시 텍스트 추출
- 추출된 텍스트만 Supabase DB에 저장 (원본 파일은 Storage에 별도 보관)

### 8.2 지원 형식 및 라이브러리

|형식|라이브러리|
|---|---|
|PDF|pdf.js|
|DOCX|mammoth.js|

### 8.3 파싱 실패 처리

- 파싱 실패 시 3회 재시도
- 재시도 후에도 실패 시 에러 메시지 + 텍스트 직접 붙여넣기 옵션 제공
- 스캔본 PDF, 이미지 기반 문서는 파싱 불가 안내

### 8.4 Git 링크 파싱

- README.md 텍스트 추출
- 언어 비율, 주요 스택 정보 추출
- 실제 코드/커밋 분석 제외 (v2 예정)

---

## 9. Supabase DB 스키마 (초안)

```sql
-- 유저
users
├─ id (uuid)
├─ email
├─ created_at

-- 유저 문서
user_documents
├─ id (uuid)
├─ user_id (uuid)
├─ type (resume | portfolio)
├─ file_url (Storage 경로)
├─ parsed_text (추출된 텍스트)
├─ created_at
└─ updated_at

-- 면접 세션
interview_sessions
├─ id (uuid)
├─ user_id (uuid)
├─ jd_text
├─ persona (startup | enterprise | pressure)
├─ duration_minutes
├─ started_at
├─ ended_at
├─ status (in_progress | completed | abandoned)
└─ created_at

-- 대화 이력
interview_messages
├─ id (uuid)
├─ session_id (uuid)
├─ role (interviewer | user)
├─ content
├─ depth (0~4)
└─ created_at

-- 리포트
interview_reports
├─ id (uuid)
├─ session_id (uuid)
├─ total_score
├─ summary
├─ report_json (답변별 평가 전체)
└─ created_at
```

---

## 10. Google ADK 구현 전략

### 10.1 ADK 개요

Google Agent Development Kit (ADK)는 멀티 에이전트 오케스트레이션을 코드로 구현하는 오픈소스 프레임워크다. Gemini 3 Pro 네이티브 지원, TypeScript 지원으로 Next.js 스택과 자연스럽게 통합된다.

### 10.2 리허설 에이전트 ADK 매핑

|ADK 에이전트 타입|리허설 적용|
|---|---|
|**SequentialAgent**|오케스트레이터 (분석 → 면접관 → 평가 순서 제어)|
|**LlmAgent**|분석 에이전트, 면접관 에이전트, 평가 에이전트|
|**내장 Session Management**|면접 대화 이력 유지|
|**스트리밍 지원**|면접관 응답 실시간 스트리밍|

### 10.3 에이전트 구조 코드 (TypeScript)

```typescript
import { LlmAgent, SequentialAgent } from '@google/adk';

// 분석 에이전트
const analysisAgent = new LlmAgent({
  name: 'analysis_agent',
  model: 'gemini-3-pro',
  instruction: `
    JD와 이력서를 분석해서 다음을 수행해:
    1. JD 핵심 역량 키워드 추출
    2. 이력서 주요 경력/프로젝트 추출
    3. JD ↔ 이력서 매핑 (강점/갭 식별)
    4. 공통 질문 사전 생성 (자기소개, 강점/약점 등)
    5. 프로젝트 기반 질문 동적 생성
  `
});

// 면접관 에이전트
const interviewAgent = new LlmAgent({
  name: 'interview_agent',
  model: 'gemini-3-pro',
  instruction: `
    {persona} 페르소나로 면접을 진행해.
    - 분석 에이전트가 생성한 질문 세트 기반으로 진행
    - 유저 답변 후 꼬리질문 필요 여부 판단 (최대 4depth)
    - 룰 기반 1차 판단 후 AI 최종 결정
  `
});

// 평가 에이전트
const evaluationAgent = new LlmAgent({
  name: 'evaluation_agent',
  model: 'gemini-3-pro',
  instruction: `
    전체 대화 이력을 분석해서 리포트를 생성해:
    - 답변별 평가: 논리성 / 구체성 / 직무 적합성 (각 100점)
    - 전체 총점 (100점 환산)
    - 전체 총평
    - 개선 필요 답변 Top 3
    - 모범 답변 예시
    - 재도전 추천 질문
  `
});

// 오케스트레이터
const orchestrator = new SequentialAgent({
  name: 'rehearsal_orchestrator',
  subAgents: [analysisAgent, interviewAgent, evaluationAgent]
});
```

### 10.4 Next.js API Route 연동

```typescript
// app/api/interview/route.ts
export async function POST(req: Request) {
  const { jd, resume, portfolio, persona, duration } = await req.json();

  const stream = await orchestrator.stream({
    input: { jd, resume, portfolio, persona, duration },
    sessionId: req.headers.get('x-session-id')
  });

  // 스트리밍 응답으로 클라이언트에 전달
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream' }
  });
}
```

### 10.5 설치 및 초기 세팅

```bash
# ADK TypeScript 설치
npm install @google/adk

# 환경변수 설정 (.env.local)
GOOGLE_API_KEY=your_gemini_api_key
```

---

## 11. Antigravity 에이전트 활용 전략 (개발 시)

### 11.1 에이전트에게 맡길 것

- Next.js 프로젝트 초기 세팅 (폴더 구조, shadcn 설치, Supabase 연동)
- DB 스키마 기반 마이그레이션 파일 생성
- Supabase Auth Google OAuth 연동 보일러플레이트
- shadcn 기반 반복 UI 컴포넌트 생성
- API Route 보일러플레이트

### 11.2 직접 해야 할 것

- 프롬프트 설계 및 품질 튜닝
- 면접 플로우 UX 의사결정
- 에이전트 결과물 검토 및 승인
- 보안 관련 코드 리뷰 (API 키 노출 여부 등)

---

## 12. 성능 고려사항

|항목|내용|대응|
|---|---|---|
|Gemini API 레이턴시|프록시 경유로 100~300ms 추가|스트리밍 응답으로 체감 최소화|
|Vercel 콜드 스타트|첫 요청 500ms~1초 딜레이|MVP 단계 감수|
|Vercel 함수 타임아웃|무료 티어 10초 제한|스트리밍으로 처리, 청크 분리|
|Supabase Storage|무료 티어 1GB 제한|트래픽 증가 시 Cloudflare R2 마이그레이션 검토|

---

## 13. 보안 고려사항

- Gemini API 키: 서버 환경변수에만 저장, 클라이언트 미노출
- 유저 문서: Supabase Storage RLS(Row Level Security) 적용, 본인 문서만 접근 가능
- 문서 삭제: DB + Storage 동시 완전 삭제 처리
- Google OAuth: Supabase Auth 위임 처리

---

_본 문서는 기술 구현 초안으로, 개발 진행에 따라 지속 업데이트됩니다._