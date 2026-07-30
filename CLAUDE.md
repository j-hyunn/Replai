@AGENTS.md
@.agents/rules/global.md
@.agents/rules/project.md
@.agents/rules/agents.md
@.agents/rules/architecture.md
@.agents/rules/conventions.md
@.agents/rules/database.md
@.agents/rules/security.md

## 하네스: Replai 기능 개발

**목표:** 아이디에이션부터 구현·검증까지 pm-agent, feature-builder, db-agent, ai-builder, qa-agent가 협력하는 개발 워크플로우 자동화

**트리거:** 기능 개발·수정·아이디에이션 요청 시 `replai-feature` 스킬을 사용하라. DB 작업만 단독 요청 시 `replai-db`, AI 에이전트 작업만 단독 요청 시 `replai-ai` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-09 | 초기 구성 | 전체 | - |
