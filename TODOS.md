# TODOS

본 PR 스코프 외이지만 추적이 필요한 작업.

## Evaluation pipeline

- **재평가 idempotency 토큰**
  - **Priority:** P2
  - **What:** ReevaluateBlock 더블 클릭/다중 탭에서 동시 reevaluate POST 가능. 기존 report row id를 `If-Match`로 전달하거나 client-side 락 추가.
  - **Files:** `src/components/report/ReportView.tsx` `ReevaluateBlock`, `src/app/api/interview/route.ts` reevaluate 핸들러

- **분산 측정 baseline 캡처**
  - **Priority:** P2
  - **What:** `scripts/eval-consistency.ts`를 5회 실행해서 현재 stdev를 baseline으로 기록. 향후 프롬프트 변경 시 비교용.

- **재평가 idempotency 토큰**
  - **Priority:** P2
  - **What:** ReevaluateBlock 더블 클릭/다중 탭에서 동시 reevaluate POST 가능. 기존 report row id를 `If-Match`로 전달하거나 client-side 락 추가.
  - **Files:** `src/components/report/ReportView.tsx` `ReevaluateBlock`, `src/app/api/interview/route.ts` reevaluate 핸들러

- **분산 측정 baseline 캡처**
  - **Priority:** P2
  - **What:** `scripts/eval-consistency.ts`를 5회 실행해서 현재 stdev를 baseline으로 기록. 향후 프롬프트 변경 시 비교용.

## Interview UI

- **Resume 경로에서 `kind='skipped'` 메시지 처리**
  - **Priority:** P2
  - **What:** `InterviewView` 재진입 시 skipped 메시지(content 빈 문자열)가 "thinking" placeholder로 표시되는 회귀. `kind === "skipped"`이면 별도 "건너뜀" 버블 렌더 또는 hydration 시 필터.
  - **Files:** `src/components/interview/InterviewView.tsx` (`existingMessages` 매핑부)

## Design / UX

- **ReportView 사이드바 반응형 대응**
  - **Priority:** P3
  - **What:** `ReportView.tsx`의 사이드바(`w-56` 고정)를 `md` 미만 viewport에서 shadcn `Sheet` 또는 drawer 패턴으로 전환.
  - **Why:** 현재 사이드바가 모바일에서도 항상 표시되어 content 영역이 심하게 좁아짐.
  - **Pros:** 모바일 사용자 즉시 경험 개선. 일관된 shadcn 반응형 패턴.
  - **Cons:** 추가 2~3시간 작업. menu 토글 버튼 + 활성 항목 표시 로직 필요.

## Testing

- **route.ts evaluate 통합 테스트**
  - **Priority:** P2
  - **What:** plan T6에서 명시했으나 deferred된 `route.evaluate.test.ts`. mocked Gemini로 evaluate 전체 흐름 + reevaluate 인덱스 교체 검증.
  - **Files:** `src/app/api/interview/route.evaluate.test.ts` (신규)

- **`@testing-library/react` 도입 + ReportView 컴포넌트 테스트**
  - **Priority:** P3
  - **What:** 4-상태(answered/hint_shown/skipped/failed) 시각 렌더 회귀 방지.
  - **Files:** `src/components/report/ReportView.test.tsx` (신규)

## Completed

- **Gemini 호출 동시성 제한 + 타임아웃 + 실패 로깅** — Completed: 2026-05-21
  - p-limit(4), AbortController 8s, console.error/warn 추가. `src/lib/evaluation/run.ts`, `postprocess.ts`.

- **평가 결정성 강화 (v0.2.0)** — Completed: 2026-05-20
  - DB `kind` 컬럼 + 단건 평가 + Zod schema + 서버 후처리 + 리포트 UI 4-상태. T1~T11 + Visual Design Spec.
