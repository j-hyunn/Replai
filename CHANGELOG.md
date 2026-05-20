# Changelog

All notable changes to Replai are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-05-20

### Added
- 인터뷰 평가 파이프라인 결정성 강화: 질문별 단건 Gemini 호출을 병렬로 실행하고 최종 요약은 별도 1회 호출. 동일 입력에 대한 점수 분산이 크게 줄어듭니다.
- 평가 결과의 결정적 후처리: `skipped` 질문은 자동으로 0점 + 학습용 모범 답안 생성, 힌트 사용 답변은 각 항목 최대 30점으로 서버에서 강제 캡, `average` / `total_score` 산술은 LLM이 아닌 서버가 계산.
- `interview_messages.kind` 컬럼(`answer | hint_shown | skipped | interviewer`)으로 힌트·건너뛰기 의미를 일급 데이터로 저장. 기존 마커(`[모범 답안]`, `[질문 건너뛰기]`)는 마이그레이션에서 백필 후 정리됩니다.
- 리포트 페이지에 답변 4-상태 UI:
  - 힌트 사용 답변에 amber pill 라벨 + 힌트 텍스트 박스
  - 건너뛴 질문에 muted 안내 카드 + 점수 계산 제외 명시 + 학습용 모범 답안
  - 평가 실패 답변에 destructive 톤 placeholder + "이 답변 재평가하기" 버튼
  - 사이드바 점수에 "응답 N개 평균 (전체 M개)" tooltip
- 단건 답변 재평가 API: `POST /api/interview { type: "reevaluate", sessionId, questionId }`.
- Zod 기반 평가 출력 스키마 + Gemini structured output (`responseSchema`) → 실패 시 raw JSON parse + Zod 검증 fallback → 재시도 3회 상태머신.
- Vitest 도입 (`npm run test`) + 회귀 방지 단위 테스트 27개 (스키마/후처리/프롬프트/실행 흐름).
- 분산 측정 개발용 스크립트 `scripts/eval-consistency.ts`.

### Changed
- 평가 프롬프트가 일괄 → 단건/요약 두 종류로 분리되고 5단계 anchor rubric을 명문화. 점수 일관성을 LLM 자유 의지 대신 명시적 기준에 의존합니다.
- 힌트 사용 시 인터뷰 에이전트에는 모범 답안 텍스트를 직접 노출하지 않고 "사용자가 모범 답안을 참조했습니다" 표시만 전달. 에이전트의 follow-up이 모범 답안을 사용자 답변으로 오해하지 않도록 했습니다.

### Fixed
- 힌트 사용·건너뛰기 시 리포트의 "내 답변" / "모범 답안" 영역이 마커 텍스트를 그대로 노출하던 현상을 제거.
- LLM 응답에서 일부 `question_id` 답변이 누락되어도 silent loss가 발생하던 문제를 단건 호출 + 누락 검증으로 해결.
- `interview_reports`에 `session_id` UNIQUE 인덱스를 추가하고 `upsert`에 `onConflict` 지정. 같은 세션에 대한 재평가가 새 행을 만들지 않도록 했습니다.
